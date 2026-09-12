import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COLORS,
  COMPARE,
  FONT_SIZE,
  RADIUS,
  SETTING_KEYS,
  SPACING,
  genUuid,
} from "../constants";
import MessageBubble from "../components/MessageBubble";
import CompareSheet from "../components/CompareSheet";
import SessionHistory from "../components/SessionHistory";
import WelcomeModal from "../components/WelcomeModal";
import InlineWebChat from "../components/InlineWebChat";
import type { InlineWebChatHandle } from "../components/InlineWebChat";
import ModelBall, {
  clampBallRatio,
  type BallAction,
  type BallGroup,
} from "../components/ModelBall";
import { useToast } from "../components/Toast";
import { PROVIDERS, getProvider } from "../providers/registry";
import { startChatStream } from "../providers/chatEngine";
import { IDLE_TIMEOUT_MESSAGE } from "../providers/errors";
import { isProviderReady, useProviders } from "../state/ProvidersContext";
import {
  addMessage,
  createSession,
  deleteAssistantAfter,
  initChatDB,
  listMessages,
  updateMessage,
} from "../database/chatDB";
import { loadSetting, saveSetting } from "../secure/credentials";
import { contextFor, retryContext } from "./chatContext";
import type { ChatMessage, ChatSession, ModelRef } from "../types";

// 流式空闲超时：连续 45 秒没有任何增量视为连接悬挂（audit-23）
const IDLE_TIMEOUT_MS = 45000;

// 首页对话页（v0.4.0 悬浮球版）：无顶栏无 dock，一颗球承载模型切换/对比/历史/配置
// 流式对话（可停止/思考过程）+ ⚖️ 并发对比 + 本地持久化 + 历史会话
// 官网通道（web）模型：官网对话为全屏页面；customTabs：浏览器引导卡片
export default function HomeScreen({
  inlineWebProviderId,
  onInlineWebConsumed,
  onOpenConfig,
}: {
  inlineWebProviderId: string | null;
  onInlineWebConsumed: () => void;
  onOpenConfig: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { configs, loaded, dynamicModels } = useProviders();
  const [model, setModel] = useState<ModelRef | null>(null);
  // 官网全屏页没有输入区，toast 下移避免悬在半空
  const toast = useToast(model?.modelId === "$web$" ? 48 : 96);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [inlineDismissed, setInlineDismissed] = useState(false);
  // v0.5.3：官网全屏页无控制条，刷新动作经此 ref 由悬浮球菜单调用
  const inlineWebRef = useRef<InlineWebChatHandle>(null);
  // 悬浮球（v0.4.0）：位置比例持久化
  const [ballRatio, setBallRatio] = useState(0.22);
  // 并发对比模式（v0.3.0）
  const [compareOn, setCompareOn] = useState(false);
  const [compareSel, setCompareSel] = useState<ModelRef[]>([]);
  const [compareSheet, setCompareSheet] = useState(false);
  // 当前打开的是否为对比会话（state 而非 ref：修复历史对比会话首帧无模型标签）
  const [compareSession, setCompareSession] = useState(false);
  const sessionRef = useRef<ChatSession | null>(null);
  const nearBottomRef = useRef(true);
  const restoredRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  // 活跃流注册表：aiMsgId → stop。单流与对比 N 流统一走这里；
  // 每条流的 buffer/定时器/收尾标志全部闭包私有（v0.2.0 竞态约定）
  const streams = useRef(new Map<string, { stop: () => void }>());

  const isWebModel = model?.modelId === "$web$";
  const activeChannel = model
    ? configs.get(model.providerId)?.channel
    : undefined;
  const isInlineWeb = isWebModel && activeChannel === "web"; // 应用内全屏对话模式
  const isBrowserGate = isWebModel && activeChannel === "customTabs"; // 浏览器模式（Google 政策）
  const showInline = isInlineWeb && !inlineDismissed;
  const compareActive = compareOn && !isWebModel;

  // 可用模型：动态清单（Key 验证后同步）优先，回落注册表默认；web/customTabs 列"官网对话"入口
  const available = useMemo<ModelRef[]>(() => {
    const list: ModelRef[] = [];
    for (const p of PROVIDERS) {
      const cfg = configs.get(p.id);
      if (!isProviderReady(cfg)) continue;
      if (cfg!.channel === "api") {
        const live = dynamicModels.get(p.id);
        for (const m of live?.length ? live : p.defaultModels) {
          list.push({ providerId: p.id, modelId: m, label: m });
        }
      } else {
        list.push({ providerId: p.id, modelId: "$web$", label: p.name });
      }
    }
    return list;
  }, [configs, dynamicModels]);

  const apiAvailable = useMemo(
    () => available.filter((m) => m.modelId !== "$web$"),
    [available],
  );

  // 初始化数据库 + 恢复上次对比选择 + 悬浮球位置
  useEffect(() => {
    initChatDB().catch(() => {});
    loadSetting(SETTING_KEYS.BALL_POS)
      .then((raw) => {
        const v = Number(raw);
        if (raw && Number.isFinite(v)) setBallRatio(clampBallRatio(v));
      })
      .catch(() => {});
    loadSetting(SETTING_KEYS.COMPARE_MODELS)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as ModelRef[];
            if (Array.isArray(parsed)) setCompareSel(parsed.slice(0, 4));
          } catch {
            /* 损坏则忽略 */
          }
        }
      })
      .catch(() => {});
  }, []);

  // 默认模型：优先恢复上次使用的（audit-18），否则取第一个可用
  useEffect(() => {
    if (!loaded || restoredRef.current || available.length === 0) return;
    restoredRef.current = true;
    (async () => {
      try {
        const raw = await loadSetting(SETTING_KEYS.LAST_MODEL);
        if (raw) {
          const last = JSON.parse(raw) as ModelRef;
          const hit = available.find(
            (m) =>
              m.providerId === last.providerId && m.modelId === last.modelId,
          );
          if (hit) {
            setModel(hit);
            return;
          }
        }
      } catch {
        // 忽略损坏的设置，回落到第一个模型
      }
      setModel(available[0]);
    })();
  }, [loaded, available]);

  // 首启双通道说明（audit-27）
  useEffect(() => {
    if (!loaded) return;
    loadSetting(SETTING_KEYS.WELCOME_SEEN).then((v) => {
      if (v !== "1") setWelcomeVisible(true);
    });
  }, [loaded]);

  const persistModel = useCallback((m: ModelRef) => {
    saveSetting(SETTING_KEYS.LAST_MODEL, JSON.stringify(m)).catch(() => {});
  }, []);

  // 中断全部在途流（停止/切换/新会话统一收尾，保留半截内容）
  const abortStreams = useCallback(() => {
    streams.current.forEach((s) => s.stop());
    streams.current.clear();
    setStreaming(false);
  }, []);

  // ===== 悬浮球调度（v0.4.0：替代旧边缘手势，避开系统手势冲突） =====
  const onBallRatio = useCallback((r: number) => {
    const clamped = clampBallRatio(r);
    setBallRatio(clamped);
    saveSetting(SETTING_KEYS.BALL_POS, String(clamped)).catch(() => {});
  }, []);

  // 首次进入给出球的位置说明（只给一次，BALL_HINT 持久化）
  const showHint = toast.show;
  useEffect(() => {
    if (!loaded) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    loadSetting(SETTING_KEYS.BALL_HINT)
      .then((v) => {
        if (v === "1") return;
        saveSetting(SETTING_KEYS.BALL_HINT, "1").catch(() => {});
        t = setTimeout(
          () =>
            showHint(
              "所有功能收进右侧悬浮球：点球切换模型/去配置，可上下拖动",
              4000,
            ),
          600,
        );
      })
      .catch(() => {});
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loaded, showHint]);

  // 登录确认 → 自动选中该厂商并进入官网全屏对话（修复「点我已登录后无处可用」）
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!inlineWebProviderId || !loaded) return;
    const p = getProvider(inlineWebProviderId);
    if (p) {
      const m: ModelRef = { providerId: p.id, modelId: "$web$", label: p.name };
      abortStreams();
      setCompareOn(false);
      setModel(m);
      persistModel(m);
      setMessages([]);
      sessionRef.current = null;
      setInlineDismissed(false);
      toast.show(
        configs.get(p.id)?.channel === "customTabs"
          ? `已连接 ${p.name}，在首页点「在浏览器打开」即可对话`
          : `已连接 ${p.name}，已进入官网全屏对话`,
      );
    }
    onInlineWebConsumed();
  }, [inlineWebProviderId, loaded]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // 发起一条流式回答：buffer/定时器/幂等收尾全部闭包私有，多流并行互不干扰
  const startStreamFor = useCallback(
    (target: ModelRef, context: ChatMessage[], aiMsg: ChatMessage) => {
      const provider = getProvider(target.providerId);
      const cfg = configs.get(target.providerId);
      if (!provider || !cfg?.apiKey) {
        const missing = "请先在配置页填写 API Key";
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsg.id ? { ...m, error: missing } : m)),
        );
        updateMessage(aiMsg.id, "", missing).catch(() => {});
        return;
      }
      setStreaming(true);

      let buffer = "";
      let reasoning = "";
      let flushT: ReturnType<typeof setTimeout> | null = null;
      let idleT: ReturnType<typeof setTimeout> | null = null;
      let abort: (() => void) | null = null;
      let settled = false;

      const render = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsg.id
              ? { ...m, content: buffer, reasoning: reasoning || undefined }
              : m,
          ),
        );
      };
      const scheduleFlush = () => {
        if (!flushT) {
          flushT = setTimeout(() => {
            flushT = null;
            render();
          }, 120);
        }
      };
      // 幂等收尾：清定时器、断连接、从注册表除名；全部流结束才复位 streaming
      const settle = async (errMsg?: string) => {
        if (settled) return;
        settled = true;
        if (flushT) clearTimeout(flushT);
        if (idleT) clearTimeout(idleT);
        abort?.();
        abort = null;
        streams.current.delete(aiMsg.id);
        if (streams.current.size === 0) setStreaming(false);
        if (errMsg) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id
                ? {
                    ...m,
                    content: buffer,
                    reasoning: reasoning || undefined,
                    error: errMsg,
                  }
                : m,
            ),
          );
        }
        await updateMessage(
          aiMsg.id,
          buffer,
          errMsg,
          reasoning || undefined,
        ).catch(() => {});
      };
      const resetIdle = () => {
        if (idleT) clearTimeout(idleT);
        idleT = setTimeout(() => settle(IDLE_TIMEOUT_MESSAGE), IDLE_TIMEOUT_MS);
      };
      resetIdle();

      abort = startChatStream(provider, cfg, target.modelId, context, {
        onDelta: (delta) => {
          buffer += delta;
          resetIdle();
          scheduleFlush();
        },
        onReasoning: (r) => {
          reasoning += r;
          resetIdle();
          scheduleFlush();
        },
        onDone: () => {
          render();
          settle();
        },
        onError: (err) => {
          render();
          settle(err.message);
        },
      });

      streams.current.set(aiMsg.id, { stop: () => settle() });
    },
    [configs],
  );

  // 发送消息：单模型 1 条回答；对比模式为每个所选模型各起一流
  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (isWebModel) return; // 防御：官网模型不渲染原生输入区

    const targets = compareActive ? compareSel : model ? [model] : [];
    if (compareActive && targets.length < 2) {
      setCompareSheet(true);
      return;
    }
    if (!targets.length) return;

    const now = Date.now();
    if (!sessionRef.current) {
      const head = targets[0];
      sessionRef.current = await createSession(
        compareActive ? COMPARE : head.providerId,
        compareActive ? COMPARE : head.modelId,
      );
    }
    const userMsg: ChatMessage = {
      id: genUuid(),
      role: "user",
      content: text,
      createdAt: now,
    };
    const aiMsgs: ChatMessage[] = targets.map((t, i) => ({
      id: genUuid(),
      role: "assistant",
      content: "",
      createdAt: now + i + 1,
      modelId: t.modelId,
      providerId: t.providerId,
    }));
    await addMessage(sessionRef.current.id, userMsg);
    for (const a of aiMsgs) await addMessage(sessionRef.current.id, a);
    setInput("");
    const history = messages;
    setMessages((prev) => [...prev, userMsg, ...aiMsgs]);
    aiMsgs.forEach((a, i) =>
      startStreamFor(targets[i], contextFor(history, targets[i], userMsg), a),
    );
  };

  // 切换模型：中断在途流 + 退出对比 + 开新会话；选模型即（重新）可打开官网全屏对话
  const selectModel = useCallback(
    (m: ModelRef) => {
      abortStreams();
      setCompareOn(false);
      setCompareSession(false);
      setModel(m);
      persistModel(m);
      setMessages([]);
      sessionRef.current = null;
      setShowJump(false);
      setInlineDismissed(false);
    },
    [abortStreams, persistModel],
  );

  // 对比模式确认：选中 2-4 模型进入对比会话
  const confirmCompare = useCallback(
    (sel: ModelRef[]) => {
      abortStreams();
      setCompareSel(sel);
      saveSetting(SETTING_KEYS.COMPARE_MODELS, JSON.stringify(sel)).catch(
        () => {},
      );
      setCompareSheet(false);
      setCompareOn(true);
      setCompareSession(true);
      setModel({ providerId: COMPARE, modelId: COMPARE, label: "模型对比" });
      setMessages([]);
      sessionRef.current = null;
      setShowJump(false);
      setInlineDismissed(true);
      toast.show(`⚖️ 对比模式：${sel.length} 个模型同时回答`);
    },
    [
      abortStreams,
      toast,
      setCompareSel,
      setCompareSheet,
      setCompareOn,
      setCompareSession,
      setModel,
      setMessages,
      setShowJump,
      setInlineDismissed,
    ],
  );

  // 开关对比模式
  const toggleCompare = useCallback(() => {
    if (compareActive) {
      setCompareOn(false);
      // 对比虚拟 model 落回真实模型，否则单发路径拿不到 provider
      if (model?.modelId === COMPARE) {
        const back = compareSel[0] ?? apiAvailable[0] ?? null;
        setModel(back);
        if (back) persistModel(back);
      }
      toast.show("已退出对比模式");
    } else {
      if (apiAvailable.length < 2) {
        toast.show("需至少 2 个 API 通道模型：点球 →「配置厂商与 Key」连接");
        return;
      }
      setCompareSheet(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    compareActive,
    apiAvailable.length,
    model?.modelId,
    compareSel,
    persistModel,
    toast,
  ]);

  // 打开历史会话：识别对比会话并恢复所选模型
  const openSession = useCallback(
    async (sess: ChatSession) => {
      abortStreams();
      setHistoryVisible(false);
      const msgs = await listMessages(sess.id);
      sessionRef.current = sess;
      setMessages(msgs);
      if (sess.providerId === COMPARE) {
        const uniq = new Map<string, ModelRef>();
        for (const m of msgs) {
          if (m.role === "assistant" && m.modelId && m.providerId) {
            const key = `${m.providerId}:${m.modelId}`;
            if (!uniq.has(key))
              uniq.set(key, {
                providerId: m.providerId,
                modelId: m.modelId,
                label: m.modelId,
              });
          }
        }
        setCompareSel([...uniq.values()].slice(0, 4));
        setCompareOn(true);
        setCompareSession(true);
        setModel({ providerId: COMPARE, modelId: COMPARE, label: "模型对比" });
        setInlineDismissed(true);
      } else {
        setCompareOn(false);
        setCompareSession(false);
        const m: ModelRef = {
          providerId: sess.providerId,
          modelId: sess.modelId,
          label: sess.modelId,
        };
        setModel(m);
        persistModel(m);
        if (sess.modelId === "$web$") setInlineDismissed(false);
      }
      nearBottomRef.current = true;
      setShowJump(false);
    },
    [abortStreams, persistModel],
  );

  // 新对话：中断在途流并清空当前会话（audit-7）
  const newChat = useCallback(() => {
    abortStreams();
    sessionRef.current = null;
    setMessages([]);
    setShowJump(false);
    toast.show("已开始新对话");
  }, [abortStreams, toast]);

  // 重新生成（旧单模型数据兜底）：删除最后一条用户消息后的回答重发
  const regenerate = async () => {
    setActionMsg(null);
    if (streaming || !model || isWebModel || !sessionRef.current) return;
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    const context = messages.slice(0, idx + 1);
    const lastUser = messages[idx];
    const aiMsg: ChatMessage = {
      id: genUuid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      modelId: model.modelId,
      providerId: model.providerId,
    };
    await deleteAssistantAfter(sessionRef.current.id, lastUser.createdAt);
    await addMessage(sessionRef.current.id, aiMsg);
    setMessages([...context, aiMsg]);
    startStreamFor(model, context, aiMsg);
  };

  // 单条回答原位重试：只重跑该模型（对比模式其它模型结果保留；单模型体验也更稳）
  const retryOne = async (target: ChatMessage) => {
    setActionMsg(null);
    if (streaming || !target.modelId || !target.providerId) return;
    const t: ModelRef = {
      providerId: target.providerId,
      modelId: target.modelId,
      label: target.modelId,
    };
    // v0.5.2 修复：旧实现把提问消息既留在 slice 里又作为 userMsg 追加，
    // 导致重试时最后一条提问重复发给模型；retryContext 统一剔除后再追加一次
    const context = retryContext(messages, target.id, t);
    if (!context) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === target.id
          ? { ...m, content: "", reasoning: undefined, error: undefined }
          : m,
      ),
    );
    await updateMessage(target.id, "", undefined, undefined).catch(() => {});
    startStreamFor(t, context, { ...target, content: "", error: undefined });
  };

  // renderItem 用的稳定 onRetry（retryOne 内部读最新 state 闭包，经 ref 转发保持引用不变）
  const retryOneRef = useRef(retryOne);
  retryOneRef.current = retryOne;
  const onRetry = useCallback((m: ChatMessage) => {
    retryOneRef.current(m);
  }, []);

  const copyMessage = async (m: ChatMessage) => {
    setActionMsg(null);
    await Clipboard.setStringAsync(m.content);
    toast.show("已复制到剪贴板");
  };

  // 智能滚动：仅当用户贴近底部时跟随流式更新（audit-31）
  const onScroll = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const dist =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    const near = dist < 120;
    nearBottomRef.current = near;
    setShowJump(!near && messages.length > 0);
  };

  const emptyText = useMemo(() => {
    if (available.length === 0)
      return "点右侧悬浮球 →「配置厂商与 Key」连接一个模型";
    if (compareActive)
      return "⚖️ 对比模式：一个问题同时发给所选模型，回答并排看";
    if (isBrowserGate)
      return `${model?.label ?? ""} 的对话在系统浏览器中进行（Google 政策），下方一键打开`;
    if (isWebModel)
      return `${model?.label ?? ""} 的官网对话会全屏打开，点右侧悬浮球→「打开官网对话（全屏）」`;
    return `在下方输入消息开始和 ${model?.label ?? ""} 对话`;
  }, [
    available.length,
    compareActive,
    isBrowserGate,
    isWebModel,
    model?.label,
  ]);

  // ===== 悬浮球菜单数据（v0.4.0：顶栏 chrome 与底部 dock 全部收进这颗球） =====
  const groups = useMemo<BallGroup[]>(() => {
    const order = PROVIDERS.map((p) => p.id);
    const byP = new Map<string, ModelRef[]>();
    for (const m of available) {
      const arr = byP.get(m.providerId) ?? [];
      arr.push(m);
      byP.set(m.providerId, arr);
    }
    return [...byP.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([pid, list]) => {
        const provider = getProvider(pid)!;
        return {
          provider,
          active: !compareActive && model?.providerId === pid,
          selected:
            compareActive && compareSel.some((c) => c.providerId === pid),
          onPick: () => {
            const keep =
              model?.providerId === pid
                ? (list.find((m) => m.modelId === model.modelId) ?? null)
                : null;
            selectModel(keep ?? list[0]);
          },
          sub:
            list.length > 1
              ? list.map((m) => ({
                  modelId: m.modelId,
                  active:
                    !compareActive &&
                    model?.providerId === pid &&
                    model.modelId === m.modelId,
                  onPick: () => selectModel(m),
                }))
              : undefined,
        };
      });
  }, [available, model, compareActive, compareSel, selectModel]);

  const actions = useMemo<BallAction[]>(() => {
    const list: BallAction[] = [];
    if (compareActive) {
      list.push({
        key: "cmp-edit",
        emoji: "🧐",
        tint: COLORS.accentSoft,
        label: `改选模型（${compareSel.length} 个）`,
        onClick: () => setCompareSheet(true),
      });
      list.push({
        key: "cmp-exit",
        emoji: "↩️",
        label: "退出对比模式",
        onClick: toggleCompare,
      });
    } else {
      list.push({
        key: "cmp",
        emoji: "⚖️",
        tint: COLORS.accentSoft,
        label: "并发对比",
        onClick: toggleCompare,
        dim: apiAvailable.length < 2,
      });
    }
    list.push({
      key: "new",
      emoji: "✚",
      label: "新对话",
      onClick: newChat,
      tint: "rgba(129,199,132,0.16)",
    });
    list.push({
      key: "his",
      emoji: "🕘",
      tint: "rgba(230,81,0,0.10)",
      label: "历史会话",
      onClick: () => requestAnimationFrame(() => setHistoryVisible(true)),
    });
    if (isWebModel && inlineDismissed && !isBrowserGate) {
      list.push({
        key: "web-open",
        emoji: "🌐",
        tint: "rgba(66,133,244,0.14)",
        label: `打开 ${model?.label ?? "官网"} 对话（全屏）`,
        onClick: () => setInlineDismissed(false),
      });
    }
    // v0.5.3：官网全屏页不再有顶部控制条，刷新/退出收进球菜单
    // （ref 稳定 + setState 稳定，不新增 memo 依赖）
    if (showInline) {
      list.push({
        key: "web-reload",
        emoji: "⟳",
        tint: "rgba(66,133,244,0.14)",
        label: "刷新网页",
        onClick: () => inlineWebRef.current?.reload(),
      });
      list.push({
        key: "web-exit",
        emoji: "✕",
        tint: "#FDECEA",
        label: "退出官网页",
        onClick: () => setInlineDismissed(true),
      });
    }
    list.push({
      key: "cfg",
      emoji: "⚙️",
      label: "配置厂商与 Key",
      onClick: onOpenConfig,
      accent: available.length === 0,
    });
    return list;
  }, [
    compareActive,
    compareSel.length,
    toggleCompare,
    newChat,
    isWebModel,
    isBrowserGate,
    inlineDismissed,
    showInline,
    model?.label,
    apiAvailable.length,
    available.length,
    onOpenConfig,
  ]);

  const headerLabel = compareActive
    ? `并发对比 · ${compareSel.length} 个模型`
    : model && isWebModel
      ? `${getProvider(model.providerId)?.name ?? ""} · 官网对话`
      : model && model.modelId !== COMPARE
        ? `${getProvider(model.providerId)?.name ?? ""} · ${model.modelId}`
        : "TapMate · 未选择模型";
  const ballProvider =
    !compareActive && model && model.modelId !== COMPARE
      ? getProvider(model.providerId)
      : null;
  const ballEmoji = compareActive
    ? "⚖️"
    : model && model.modelId === COMPARE
      ? "⚖️"
      : "🤖";
  const ballBadge = compareActive
    ? String(compareSel.length)
    : isWebModel
      ? "🌐"
      : undefined;

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, paddingTop: showInline ? 0 : insets.top + 6 }}>
        {showInline && !compareActive ? (
          <InlineWebChat
            ref={inlineWebRef}
            providerId={model!.providerId}
            onExit={() => setInlineDismissed(true)}
          />
        ) : isBrowserGate && !compareActive ? (
          <BrowserGate providerId={model!.providerId} />
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={9}
              removeClippedSubviews
              renderItem={({ item }) => (
                <MessageBubble
                  msg={item}
                  thinking={
                    item.role === "assistant" &&
                    !item.content &&
                    streams.current.has(item.id)
                  }
                  tagged={compareActive || compareSession}
                  onRetry={
                    item.error && !streaming && item.providerId
                      ? onRetry
                      : undefined
                  }
                  onLongPress={setActionMsg}
                />
              )}
              contentContainerStyle={styles.list}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (nearBottomRef.current)
                  listRef.current?.scrollToEnd({ animated: true });
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>
                    {compareActive ? "⚖️" : "🤖"}
                  </Text>
                  <Text style={styles.emptyText}>{emptyText}</Text>
                  {isWebModel && !compareActive ? (
                    <Pressable
                      style={styles.openInlineBtn}
                      onPress={() => setInlineDismissed(false)}
                    >
                      <Text style={styles.openInlineBtnText}>
                        🌐 打开 {model?.label ?? "官网"} 对话（全屏）
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              }
            />
            {showJump ? (
              <Pressable
                style={styles.jumpBtn}
                onPress={() => {
                  listRef.current?.scrollToEnd({ animated: true });
                  setShowJump(false);
                }}
              >
                <Text style={styles.jumpText}>回到底部 ↓</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      {/* API 模型才有原生输入区；官网模型的对话在全屏官网页/浏览器内进行 */}
      {!isWebModel ? (
        <View
          style={[
            styles.inputBar,
            { paddingBottom: SPACING.sm + insets.bottom },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder={
              compareActive
                ? `一个问题，同时发给 ${compareSel.length || "?"} 个模型…`
                : "输入消息…"
            }
            placeholderTextColor={COLORS.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
            submitBehavior="newline"
            maxLength={8000}
          />
          <Pressable
            style={[
              styles.sendBtn,
              streaming && styles.sendBtnStop,
              !streaming &&
                (!input.trim() || (!model && !compareActive)) &&
                styles.sendBtnOff,
            ]}
            onPress={
              streaming
                ? () => {
                    abortStreams();
                    toast.show("已停止生成");
                  }
                : send
            }
            disabled={
              !streaming && (!input.trim() || (!model && !compareActive))
            }
          >
            <Text style={styles.sendText}>{streaming ? "■ 停止" : "发送"}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 长按消息的浮层动作（audit-17） */}
      <Modal
        visible={!!actionMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMsg(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setActionMsg(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Pressable
              style={styles.sheetBtn}
              onPress={() => actionMsg && copyMessage(actionMsg)}
            >
              <Text style={styles.sheetBtnText}>📋 复制内容</Text>
            </Pressable>
            {actionMsg?.role === "assistant" &&
            !streaming &&
            !isWebModel &&
            sessionRef.current ? (
              <Pressable
                style={styles.sheetBtn}
                onPress={() =>
                  actionMsg?.providerId ? retryOne(actionMsg) : regenerate()
                }
              >
                <Text style={styles.sheetBtnText}>
                  {actionMsg?.error
                    ? "🔁 重试这条回答"
                    : compareActive
                      ? "🔁 重新生成这条"
                      : "🔁 重新生成"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.sheetCancel}
              onPress={() => setActionMsg(null)}
            >
              <Text style={styles.sheetCancelText}>取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 对比模式模型多选（v0.3.0） */}
      <CompareSheet
        visible={compareSheet}
        models={apiAvailable}
        initial={compareSel}
        onCancel={() => setCompareSheet(false)}
        onConfirm={confirmCompare}
      />

      {historyVisible ? (
        <SessionHistory
          onClose={() => setHistoryVisible(false)}
          onOpen={openSession}
        />
      ) : null}
      <WelcomeModal
        visible={welcomeVisible}
        onDismiss={() => {
          setWelcomeVisible(false);
          saveSetting(SETTING_KEYS.WELCOME_SEEN, "1").catch(() => {});
        }}
      />

      {/* 悬浮球（v0.4.0）：唯一的模型切换与功能入口；v0.5.3 起官网全屏页也显示（刷新/退出进菜单）；历史覆盖层内隐藏 */}
      {!historyVisible ? (
        <ModelBall
          groups={groups}
          actions={actions}
          headerLabel={headerLabel}
          ballProvider={ballProvider}
          ballEmoji={ballEmoji}
          ballBadge={ballBadge}
          ratio={ballRatio}
          onRatioChange={onBallRatio}
        />
      ) : null}

      {toast.node}
    </KeyboardAvoidingView>
  );
}

// customTabs 厂商（Gemini）的首页引导卡：Google 禁止第三方应用内嵌其登录/对话，
// 唯一合规路径是系统浏览器（Custom Tabs 共享 Chrome 登录态）。卡片给出原因与一键入口。
function BrowserGate({ providerId }: { providerId: string }) {
  const p = getProvider(providerId);
  const [opened, setOpened] = useState(false);
  if (!p) return null;
  const open = async () => {
    try {
      setOpened(true);
      await WebBrowser.openBrowserAsync(p.webUrl, {
        controlsColor: COLORS.accent,
        toolbarColor: COLORS.surface,
      });
    } catch {
      console.warn("[browser-gate] open failed", p.webUrl);
    }
  };
  return (
    <View style={styles.gate}>
      <Text style={styles.gateEmoji}>{p.emoji}</Text>
      <Text style={styles.gateTitle}>{p.name} · 浏览器对话模式</Text>
      <Text style={styles.gateDesc}>
        Google
        禁止第三方应用在其官网内登录与对话（官方政策），因此该厂商通过系统浏览器标签使用——共享
        Chrome 登录态，登录一次长期有效，免费用你的订阅额度。
      </Text>
      <Pressable style={styles.gateBtn} onPress={open}>
        <Text style={styles.gateBtnText}>🌐 在浏览器打开 {p.name}</Text>
      </Pressable>
      {opened ? (
        <Text style={styles.gateHint}>
          浏览器标签已打开，聊完直接回到这里即可；下次点右侧悬浮球也能再次打开
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
  },
  title: { fontSize: FONT_SIZE.lg, fontWeight: "800", color: COLORS.text },
  headerActions: { flexDirection: "row", gap: SPACING.sm },
  headerBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  headerBtnText: { fontSize: FONT_SIZE.sm },
  headerBtnTextOn: { color: COLORS.white },
  compareRow: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.accentDark,
    fontWeight: "700",
  },
  chipEdit: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipEditText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  list: { paddingVertical: SPACING.md, flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingTop: SPACING.xxl,
  },
  emptyEmoji: { fontSize: 48 },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    textAlign: "center",
    paddingHorizontal: SPACING.xl,
    lineHeight: 20,
  },
  openInlineBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
  },
  openInlineBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: "700",
  },
  inputBar: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  sendBtnStop: { backgroundColor: COLORS.danger },
  sendBtnOff: { opacity: 0.4 },
  sendText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: "700" },
  webHint: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  webHintText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    textAlign: "center",
    lineHeight: 17,
  },
  jumpBtn: {
    position: "absolute",
    bottom: SPACING.md,
    alignSelf: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 7,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  jumpText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentDark,
    fontWeight: "700",
  },
  chromeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 35,
    backgroundColor: "rgba(248,246,243,0.97)",
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    paddingBottom: SPACING.sm,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 16,
    zIndex: 36,
  },
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  gateEmoji: { fontSize: 48 },
  gateTitle: { fontSize: FONT_SIZE.lg, fontWeight: "800", color: COLORS.text },
  gateDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  gateBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    marginTop: SPACING.xs,
  },
  gateBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.md,
    fontWeight: "700",
  },
  gateHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    textAlign: "center",
    lineHeight: 17,
  },
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.xs,
  },
  sheetBtn: { paddingVertical: 13, alignItems: "center" },
  sheetBtnText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: SPACING.xs,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  sheetCancelText: { fontSize: FONT_SIZE.md, color: COLORS.textTertiary },
});
