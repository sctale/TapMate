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
  PanResponder,
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
  FONT_SIZE,
  RADIUS,
  SETTING_KEYS,
  SPACING,
  genUuid,
} from "../constants";
import MessageBubble from "../components/MessageBubble";
import ModelSwitcher from "../components/ModelSwitcher";
import SessionHistory from "../components/SessionHistory";
import WelcomeModal from "../components/WelcomeModal";
import InlineWebChat from "../components/InlineWebChat";
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
import type { ChatMessage, ChatSession, ModelRef } from "../types";

// 流式空闲超时：连续 45 秒没有任何增量视为连接悬挂（audit-23）
const IDLE_TIMEOUT_MS = 45000;

// 首页对话页：模型切换 + 流式对话（可停止）+ 本地持久化 + 历史会话
// 官网通道（web）模型：官网会话直接嵌入首页内容区（InlineWebChat），聊天无需跳转第二个页面；
// customTabs 通道（Google 政策禁止应用内对话）：首页展示浏览器引导卡片。
export default function HomeScreen({
  inlineWebProviderId,
  onInlineWebConsumed,
  onImmersiveChange,
}: {
  inlineWebProviderId: string | null;
  onInlineWebConsumed: () => void;
  onImmersiveChange: (v: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { configs, loaded } = useProviders();
  const toast = useToast(96);
  const [model, setModel] = useState<ModelRef | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [inlineDismissed, setInlineDismissed] = useState(false);
  // 沉浸模式：选中模型后顶栏收起（点顶边浮出数秒），底部 dock 由 App 隐藏（底边上滑唤出）
  const [immersive, setImmersive] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintShown = useRef(false);
  const sessionRef = useRef<ChatSession | null>(null);
  const nearBottomRef = useRef(true);
  const restoredRef = useRef(false);
  const listRef = useRef<FlatList>(null);

  // 在途流句柄：仅保留「停止」入口；缓冲/定时器/收尾标志均为闭包私有（audit-5/23），
  // 停止后立刻重发时，旧流的陈旧回调不会误伤新流
  const streamHandle = useRef<{ stop: () => void } | null>(null);

  const isWebModel = model?.modelId === "$web$";
  const activeChannel = model
    ? configs.get(model.providerId)?.channel
    : undefined;
  const isInlineWeb = isWebModel && activeChannel === "web"; // 应用内嵌入模式
  const isBrowserGate = isWebModel && activeChannel === "customTabs"; // 浏览器模式（Google 政策）
  const showInline = isInlineWeb && !inlineDismissed;

  // 可用模型列表：已配置厂商 × 默认模型；api 通道列具体模型，web/customTabs 通道列"官网对话"入口
  const available = useMemo<ModelRef[]>(() => {
    const list: ModelRef[] = [];
    for (const p of PROVIDERS) {
      const cfg = configs.get(p.id);
      if (!isProviderReady(cfg)) continue;
      if (cfg!.channel === "api") {
        for (const m of p.defaultModels) {
          list.push({ providerId: p.id, modelId: m, label: m });
        }
      } else {
        list.push({ providerId: p.id, modelId: "$web$", label: p.name });
      }
    }
    return list;
  }, [configs]);

  // 初始化数据库
  useEffect(() => {
    initChatDB();
  }, []);

  // 默认模型：优先恢复上次使用的（audit-18），否则取第一个可用
  /* eslint-disable react-hooks/exhaustive-deps */
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
            // 官网模型冷启动即嵌入对话，直接进入沉浸布局
            if (hit.modelId === "$web$") {
              setImmersive(true);
              onImmersiveChange(true);
            }
            return;
          }
        }
      } catch {
        // 忽略损坏的设置，回落到第一个模型
      }
      setModel(available[0]);
    })();
  }, [loaded, available]);
  /* eslint-enable react-hooks/exhaustive-deps */

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

  // 用户主动停止 / 切换场景统一收尾：中断在途流并保留已生成的部分内容（audit-5/6）
  const abortStream = useCallback(() => {
    streamHandle.current?.stop();
    streamHandle.current = null;
    setStreaming(false);
  }, []);

  // ===== 沉浸模式调度 =====
  // 浮出顶栏 3.6 秒后自动收回
  const summonChrome = useCallback(() => {
    setPeek(true);
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), 3600);
  }, []);

  // 进入沉浸：顶栏收起为浮出模式 + 请求 App 隐藏底部 dock；首次给一次手势提示
  const enterImmersive = useCallback(() => {
    setImmersive(true);
    onImmersiveChange(true);
    summonChrome();
    if (!hintShown.current) {
      hintShown.current = true;
      toast.show("沉浸模式：点屏幕顶边切换模型，从最底部上滑唤出导航", 3600);
    }
  }, [onImmersiveChange, summonChrome, toast]);

  // 顶部边缘手势：轻点或向下滑 → 浮出 chrome
  const topEdge = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 12,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => summonChrome(),
    }),
  ).current;

  // 登录确认 → 自动选中该厂商并进入首页嵌入对话（修复「点我已登录后无处可用」）
  // 仅在 inlineWebProviderId 注入时触发一次；其余依赖为稳定引用或刻意不参与，避免循环触发
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!inlineWebProviderId || !loaded) return;
    const p = getProvider(inlineWebProviderId);
    if (p) {
      const m: ModelRef = { providerId: p.id, modelId: "$web$", label: p.name };
      abortStream();
      setModel(m);
      persistModel(m);
      setMessages([]);
      sessionRef.current = null;
      setInlineDismissed(false);
      enterImmersive();
      toast.show(
        configs.get(p.id)?.channel === "customTabs"
          ? `已连接 ${p.name}，在首页点「在浏览器打开」即可对话`
          : `已连接 ${p.name}，官网对话已嵌入首页，直接聊`,
      );
    }
    onInlineWebConsumed();
  }, [inlineWebProviderId, loaded]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // 发起一次流式对话：节流渲染 + 空闲超时 + 完成/失败回填（均为闭包私有状态，新旧流互不干扰）
  const runStream = useCallback(
    (target: ModelRef, context: ChatMessage[], aiMsg: ChatMessage) => {
      const provider = getProvider(target.providerId)!;
      const cfg = configs.get(target.providerId)!;
      setStreaming(true);

      let buffer = "";
      let flushT: ReturnType<typeof setTimeout> | null = null;
      let idleT: ReturnType<typeof setTimeout> | null = null;
      let abort: (() => void) | null = null;
      let settled = false;

      const render = () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsg.id ? { ...m, content: buffer } : m)),
        );
      };
      // 幂等收尾：清定时器、断连接、落库；errMsg 存在则同时写入错误态
      const settle = async (errMsg?: string) => {
        if (settled) return;
        settled = true;
        if (flushT) clearTimeout(flushT);
        if (idleT) clearTimeout(idleT);
        abort?.();
        abort = null;
        setStreaming(false);
        streamHandle.current = null;
        if (errMsg) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsg.id ? { ...m, content: buffer, error: errMsg } : m,
            ),
          );
        }
        await updateMessage(aiMsg.id, buffer, errMsg).catch(() => {});
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
          if (!flushT) {
            flushT = setTimeout(() => {
              flushT = null;
              render();
            }, 120);
          }
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

      // 外部停止入口：按正常完成收尾（保留半截内容，不标错误）
      streamHandle.current = { stop: () => settle() };
    },
    [configs],
  );

  // 发送消息
  const send = async () => {
    const text = input.trim();
    if (!text || !model || streaming) return;

    // 官网通道模型不渲染原生输入区（对话在嵌入官网/浏览器内进行），此处仅防御
    if (model.modelId === "$web$") return;

    const userMsg: ChatMessage = {
      id: genUuid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const aiMsg: ChatMessage = {
      id: genUuid(),
      role: "assistant",
      content: "",
      createdAt: Date.now() + 1,
      modelId: model.modelId,
    };
    if (!sessionRef.current) {
      sessionRef.current = await createSession(model.providerId, model.modelId);
    }
    await addMessage(sessionRef.current.id, userMsg);
    await addMessage(sessionRef.current.id, aiMsg);
    setInput("");
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    runStream(model, [...messages, userMsg], aiMsg);
  };

  // 切换模型：中断在途流 + 开新会话（每个会话绑定一个模型）；点胶囊即（重新）打开嵌入对话，并进入沉浸模式
  const selectModel = useCallback(
    (m: ModelRef) => {
      abortStream();
      setModel(m);
      persistModel(m);
      setMessages([]);
      sessionRef.current = null;
      setShowJump(false);
      setInlineDismissed(false);
      enterImmersive();
    },
    [abortStream, persistModel, enterImmersive],
  );

  // 打开历史会话：中断在途流，加载消息并切换到对应模型
  const openSession = useCallback(
    async (sess: ChatSession) => {
      abortStream();
      setHistoryVisible(false);
      const msgs = await listMessages(sess.id);
      sessionRef.current = sess;
      setMessages(msgs);
      const m: ModelRef = {
        providerId: sess.providerId,
        modelId: sess.modelId,
        label: sess.modelId,
      };
      setModel(m);
      persistModel(m);
      nearBottomRef.current = true;
      setShowJump(false);
      enterImmersive();
    },
    [abortStream, persistModel, enterImmersive],
  );

  // 新对话：显式入口，中断在途流并清空当前会话（audit-7）
  const newChat = useCallback(() => {
    abortStream();
    sessionRef.current = null;
    setMessages([]);
    setShowJump(false);
    toast.show("已开始新对话");
  }, [abortStream, toast]);

  // 重新生成 / 重试：删除最后一条用户消息之后的回答，基于同上下文重发（audit-17/21）
  const regenerate = async () => {
    if (streaming || !model || model.modelId === "$web$" || !sessionRef.current)
      return;
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
    };
    await deleteAssistantAfter(sessionRef.current.id, lastUser.createdAt);
    await addMessage(sessionRef.current.id, aiMsg);
    setActionMsg(null);
    setMessages([...context, aiMsg]);
    runStream(model, context, aiMsg);
  };

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
    if (available.length === 0) return "先到「配置」页连接一个模型";
    if (isBrowserGate)
      return `${model?.label ?? ""} 的对话在系统浏览器中进行（Google 政策），下方一键打开`;
    if (isWebModel)
      return `点上方模型胶囊，${model?.label ?? ""} 的对话会直接嵌入在这里，无需跳转`;
    return `在下方输入消息开始和 ${model?.label ?? ""} 对话`;
  }, [available.length, isWebModel, isBrowserGate, model?.label]);

  // 顶栏 chrome（标题 + 新对话/历史 + 圆形模型栏）：常规态内联，沉浸态浮层复用
  const chromeBlock = (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>💬 TapMate</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={newChat}
            accessibilityRole="button"
            accessibilityLabel="新对话"
          >
            <Text style={styles.headerBtnText}>✚</Text>
          </Pressable>
          <Pressable
            style={styles.headerBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => setHistoryVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="历史会话"
          >
            <Text style={styles.headerBtnText}>🕘</Text>
          </Pressable>
        </View>
      </View>
      <ModelSwitcher models={available} active={model} onSelect={selectModel} />
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!immersive ? (
        <View style={{ paddingTop: insets.top + SPACING.xs }}>
          {chromeBlock}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {showInline ? (
          <InlineWebChat
            providerId={model!.providerId}
            onExit={() => setInlineDismissed(true)}
            controlsVisible={peek}
          />
        ) : isBrowserGate ? (
          <BrowserGate providerId={model!.providerId} />
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item, index }) => (
                <MessageBubble
                  msg={item}
                  thinking={
                    streaming &&
                    index === messages.length - 1 &&
                    item.role === "assistant"
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
                  <Text style={styles.emptyEmoji}>🤖</Text>
                  <Text style={styles.emptyText}>{emptyText}</Text>
                  {isWebModel ? (
                    <Pressable
                      style={styles.openInlineBtn}
                      onPress={() => setInlineDismissed(false)}
                    >
                      <Text style={styles.openInlineBtnText}>
                        🌐 嵌入 {model?.label ?? "官网"} 对话，直接在首页聊
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
      {/* API 模型才有原生输入区；官网模型的对话在嵌入网页/浏览器内进行 */}
      {!isWebModel ? (
        <View
          style={[
            styles.inputBar,
            { paddingBottom: SPACING.sm + insets.bottom },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="输入消息…"
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
              !streaming && (!input.trim() || !model) && styles.sendBtnOff,
            ]}
            onPress={
              streaming
                ? () => {
                    abortStream();
                    toast.show("已停止生成");
                  }
                : send
            }
            disabled={!streaming && (!input.trim() || !model)}
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
              <Pressable style={styles.sheetBtn} onPress={regenerate}>
                <Text style={styles.sheetBtnText}>
                  {actionMsg?.error ? "🔁 重试这条回答" : "🔁 重新生成"}
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

      <SessionHistory
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        onOpen={openSession}
      />
      <WelcomeModal
        visible={welcomeVisible}
        onDismiss={() => {
          setWelcomeVisible(false);
          saveSetting(SETTING_KEYS.WELCOME_SEEN, "1").catch(() => {});
        }}
      />

      {/* 沉浸模式：peek 时浮出对应控件。
          嵌入网页态 → 浮出网页右上控件条（InlineWebChat 自身）；
          其余态 → 顶栏 chrome 以浮层重现；平时仅一条隐形顶边触发条 */}
      {immersive ? (
        peek && !showInline ? (
          <View
            style={[
              styles.chromeOverlay,
              { paddingTop: insets.top + SPACING.xs },
            ]}
          >
            {chromeBlock}
          </View>
        ) : !peek ? (
          <View style={styles.topEdge} {...topEdge.panHandlers} />
        ) : null
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
          浏览器标签已打开，聊完直接回到这里即可；下次点模型胶囊也能再次打开
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
  headerBtnText: { fontSize: FONT_SIZE.sm },
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
