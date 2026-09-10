import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import {
  deleteSession,
  listSessions,
  searchSessions,
} from "../database/chatDB";
import { getProvider } from "../providers/registry";
import type { ChatSession } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpen: (session: ChatSession) => void;
}

// 会话历史弹窗：搜索 + 时间分组 + 删除二次确认（audit-11/13/16）
export default function SessionHistory({ visible, onClose, onOpen }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // 关键词防抖检索：标题或消息内容 LIKE（audit-16）
  const reload = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    const list = trimmed ? await searchSessions(trimmed) : await listSessions();
    setSessions(list);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      return;
    }
    setSearching(query.trim().length > 0);
    const t = setTimeout(() => reload(query), query.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [visible, query, reload]);

  // 删除前二次确认，防误触不可恢复（audit-13）
  const confirmDelete = (s: ChatSession) => {
    Alert.alert(
      "删除会话？",
      `「${s.title}」的全部消息将被永久删除，无法恢复。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            await deleteSession(s.id);
            await reload(query);
          },
        },
      ],
    );
  };

  // 按 今天/昨天/7天内/更早 分组（audit-16）
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const DAY = 86400000;
  const groupOf = (ts: number) => {
    const today = startOfToday.getTime();
    if (ts >= today) return "今天";
    if (ts >= today - DAY) return "昨天";
    if (ts >= today - 7 * DAY) return "7 天内";
    return "更早";
  };
  const groups: { label: string; items: ChatSession[] }[] = [];
  for (const s of sessions) {
    const label = groupOf(s.updatedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(s);
    else groups.push({ label, items: [s] });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>🕘 历史会话</Text>
          <TextInput
            style={styles.search}
            placeholder="搜索标题或聊天内容…"
            placeholderTextColor={COLORS.textTertiary}
            value={query}
            onChangeText={setQuery}
          />
          {sessions.length === 0 ? (
            <Text style={styles.empty}>
              {searching ? "搜索中…" : "暂无历史会话"}
            </Text>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {groups.map((g) => (
                <View key={g.label}>
                  <Text style={styles.groupLabel}>{g.label}</Text>
                  {g.items.map((s) => {
                    const p = getProvider(s.providerId);
                    return (
                      <View key={s.id} style={styles.row}>
                        <Pressable
                          style={styles.rowMain}
                          onPress={() => onOpen(s)}
                        >
                          <Text style={styles.rowEmoji}>
                            {p?.emoji ?? "💬"}
                          </Text>
                          <View style={styles.rowInfo}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {s.title}
                            </Text>
                            <Text style={styles.rowSub}>
                              {p?.name ?? s.providerId} · {s.modelId} ·{" "}
                              {formatTime(s.updatedAt)}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable
                          style={styles.delBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => confirmDelete(s)}
                        >
                          <Text style={styles.delText}>🗑</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
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
    maxHeight: "78%",
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  search: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  empty: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
  list: { flexGrow: 0 },
  groupLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    fontWeight: "700",
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  rowEmoji: { fontSize: FONT_SIZE.lg },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: "600" },
  rowSub: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 2 },
  delBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.warningBg,
    alignItems: "center",
    justifyContent: "center",
  },
  delText: { fontSize: FONT_SIZE.sm },
});
