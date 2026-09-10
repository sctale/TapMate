import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT_SIZE, RADIUS, SPACING, genUuid } from '../constants';
import MessageBubble from '../components/MessageBubble';
import ModelSwitcher from '../components/ModelSwitcher';
import SessionHistory from '../components/SessionHistory';
import { PROVIDERS, getProvider } from '../providers/registry';
import { startChatStream } from '../providers/chatEngine';
import { isProviderReady, useProviders } from '../state/ProvidersContext';
import { addMessage, createSession, initChatDB, listMessages, updateMessage } from '../database/chatDB';
import type { ChatMessage, ChatSession, ModelRef } from '../types';

// 首页对话页：模型切换 + 流式对话 + 本地持久化 + 历史会话
// web/customTabs 通道的厂商也可选（发消息时打开官网官网对话容器）
export default function HomeScreen({ onOpenWeb }: { onOpenWeb: (providerId: string) => void }) {
  const insets = useSafeAreaInsets();
  const { configs } = useProviders();
  const [model, setModel] = useState<ModelRef | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const sessionRef = useRef<ChatSession | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList>(null);

  // 可用模型列表：已配置厂商 × 默认模型；api 通道列具体模型，web/customTabs 通道列"官网对话"入口
  const available = useMemo<ModelRef[]>(() => {
    const list: ModelRef[] = [];
    for (const p of PROVIDERS) {
      const cfg = configs.get(p.id);
      if (!isProviderReady(cfg)) continue;
      if (cfg!.channel === 'api') {
        for (const m of p.defaultModels) {
          list.push({ providerId: p.id, modelId: m, label: m });
        }
      } else {
        list.push({ providerId: p.id, modelId: '$web$', label: p.name });
      }
    }
    return list;
  }, [configs]);

  // 默认选中第一个可用模型
  useEffect(() => {
    if (!model && available.length > 0) setModel(available[0]);
  }, [available, model]);

  // 初始化数据库
  useEffect(() => { initChatDB(); }, []);

  // 切换模型：开新会话（每个会话绑定一个模型）
  const selectModel = useCallback((m: ModelRef) => {
    setModel(m);
    setMessages([]);
    sessionRef.current = null;
  }, []);

  // 打开历史会话：加载消息并切换到对应模型
  const openSession = useCallback(async (s: ChatSession) => {
    setHistoryVisible(false);
    const msgs = await listMessages(s.id);
    sessionRef.current = s;
    setMessages(msgs);
    setModel({ providerId: s.providerId, modelId: s.modelId, label: s.modelId });
  }, []);

  // 发送消息
  const send = async () => {
    const text = input.trim();
    if (!text || !model || streaming) return;

    // web/customTabs 通道：打开官网对话容器（官网内完成对话），不经过本地协议
    if (model.modelId === '$web$') {
      setInput('');
      onOpenWeb(model.providerId);
      return;
    }

    const provider = getProvider(model.providerId)!;
    const cfg = configs.get(model.providerId)!;
    setInput('');
    setStreaming(true);

    // 首条消息时创建会话
    if (!sessionRef.current) {
      sessionRef.current = await createSession(model.providerId, model.modelId);
    }
    const userMsg: ChatMessage = {
      id: genUuid(), role: 'user', content: text, createdAt: Date.now(),
    };
    const aiMsg: ChatMessage = {
      id: genUuid(), role: 'assistant', content: '', createdAt: Date.now(), modelId: model.modelId,
    };
    await addMessage(sessionRef.current.id, userMsg);
    await addMessage(sessionRef.current.id, aiMsg);
    setMessages((prev) => [...prev, userMsg, aiMsg]);

    // 流式更新（节流：累积后批量渲染）
    let buffer = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsg.id ? { ...m, content: buffer } : m))
      );
    };
    abortRef.current = startChatStream(provider, cfg, model.modelId, [...messages, userMsg], {
      onDelta: (delta) => {
        buffer += delta;
        if (!timer) {
          timer = setTimeout(() => { timer = null; flush(); }, 120);
        }
      },
      onDone: async (full) => {
        flush();
        setStreaming(false);
        await updateMessage(aiMsg.id, buffer || full);
      },
      onError: async (err) => {
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsg.id ? { ...m, content: buffer, error: err.message } : m))
        );
        await updateMessage(aiMsg.id, buffer, err.message);
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + SPACING.sm }}>
        <View style={styles.header}>
          <Text style={styles.title}>💬 TapMate</Text>
          <Pressable style={styles.historyBtn} onPress={() => setHistoryVisible(true)}>
            <Text style={styles.historyText}>🕘</Text>
          </Pressable>
        </View>
        <ModelSwitcher models={available} active={model} onSelect={selectModel} />
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🤖</Text>
            <Text style={styles.emptyText}>
              {available.length === 0 ? '先到「配置」页连接一个模型' : '在下方输入消息开始和 ' + (model?.label ?? '') + ' 对话'}
            </Text>
          </View>
        }
      />
      <View style={[styles.inputBar, { paddingBottom: SPACING.sm + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="输入消息…"
          placeholderTextColor={COLORS.textTertiary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={8000}
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnOff]}
          onPress={send}
          disabled={!input.trim() || streaming}
        >
          <Text style={styles.sendText}>{streaming ? '…' : '发送'}</Text>
        </Pressable>
      </View>
      <SessionHistory
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        onOpen={openSession}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  historyBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyText: { fontSize: FONT_SIZE.md },
  list: { paddingVertical: SPACING.md, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingTop: SPACING.xxl },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textTertiary },
  inputBar: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, alignItems: 'flex-end' },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 10,
    fontSize: FONT_SIZE.md, color: COLORS.text, maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
  },
  sendBtnOff: { opacity: 0.4 },
  sendText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: '700' },
});
