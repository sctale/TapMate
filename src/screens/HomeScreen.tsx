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
// web/customTabs 通道的厂商发消息时打开官网容器，草稿保留并复制到剪贴板（audit-4）
export default function HomeScreen({
  onOpenWeb,
}: {
  onOpenWeb: (providerId: string) => void;
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
  const sessionRef = useRef<ChatSession | null>(null);
  const nearBottomRef = useRef(true);
  const restoredRef = useRef(false);
  const listRef = useRef<FlatList>(null);

  // 在途流句柄：仅保留「停止」入口；缓冲/定时器/收尾标志均为闭包私有（audit-5/23），
  // 停止后立刻重发时，旧流的陈旧回调不会误伤新流
  const streamHandle = useRef<{ stop: () => void } | null>(null);

  const isWebModel = model?.modelId === "$web$";

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

  // 用户主动停止 / 切换场景统一收尾：中断在途流并保留已生成的部分内容（audit-5/6）
  const abortStream = useCallback(() => {
    streamHandle.current?.stop();
    streamHandle.current = null;
    setStreaming(false);
  }, []);

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
              m.id === aiMsg.id
                ? { ...m, content: buffer, error: errMsg }
                : m,
            ),
          );
        }
        await updateMessage(aiMsg.id, buffer, errMsg).catch(() => {});
      };
      const resetIdle = () => {
        if (idleT) clearTimeout(idleT);
        idleT = setTimeout(
          () => settle(IDLE_TIMEOUT_MESSAGE),
          IDLE_TIMEOUT_MS,
        );
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

    // web/customTabs 通道：打开官网对话容器；草稿保留在输入框并复制剪贴板，不再静默丢弃（audit-4）
    if (model.modelId === "$web$") {
      await Clipboard.setStringAsync(text);
      onOpenWeb(model.providerId);
      toast.show("已打开官网对话，草稿已复制到剪贴板（输入框中也保留）");
      return;
    }

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

  // 切换模型：中断在途流 + 开新会话（每个会话绑定一个模型）
  const selectModel = useCallback(
    (m: ModelRef) => {
      abortStream();
      setModel(m);
      persistModel(m);
      setMessages([]);
      sessionRef.current = null;
      setShowJump(false);
    },
    [abortStream, persistModel],
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
    },
    [abortStream, persistModel],
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
    if (isWebModel)
      return `点「打开官网」与 ${model?.label ?? ""} 对话，草稿会保留并复制到剪贴板`;
    return `在下方输入消息开始和 ${model?.label ?? ""} 对话`;
  }, [available.length, isWebModel, model?.label]);

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top + SPACING.sm }}>
        <View style={styles.header}>
          <Text style={styles.title}>💬 TapMate</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={newChat}
              accessibilityRole="button"
              accessibilityLabel="新对话"
            >
              <Text style={styles.headerBtnText}>✚</Text>
            </Pressable>
            <Pressable
              style={styles.headerBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setHistoryVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="历史会话"
            >
              <Text style={styles.headerBtnText}>🕘</Text>
            </Pressable>
          </View>
        </View>
        <ModelSwitcher
          models={available}
          active={model}
          onSelect={selectModel}
        />
      </View>
      <View style={{ flex: 1 }}>
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
      </View>
      <View
        style={[styles.inputBar, { paddingBottom: SPACING.sm + insets.bottom }]}
      >
        <TextInput
          style={styles.input}
          placeholder={
            isWebModel ? "输入问题，打开官网时自动复制到剪贴板…" : "输入消息…"
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
          <Text style={styles.sendText}>
            {streaming ? "■ 停止" : isWebModel ? "打开官网" : "发送"}
          </Text>
        </Pressable>
      </View>

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
      {toast.node}
    </KeyboardAvoidingView>
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
  title: { fontSize: FONT_SIZE.xl, fontWeight: "800", color: COLORS.text },
  headerActions: { flexDirection: "row", gap: SPACING.sm },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: { fontSize: FONT_SIZE.md },
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
