import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { COLORS, COMPARE, FONT_SIZE, RADIUS, SPACING } from "../constants";
import {
  deleteSession,
  listSessions,
  searchSessions,
} from "../database/chatDB";
import { getProvider } from "../providers/registry";
import type { ChatSession } from "../types";

interface Props {
  onClose: () => void;
  onOpen: (session: ChatSession) => void;
}

// 会话历史：页内覆盖层（v0.5.0 起不再用 Modal——Android Modal 窗口 + fade 合成开销大，
// 叠加虚拟化列表与搜索，打开/滚动都不该卡）；搜索 + 时间分组 + 删除二次确认。
export default function SessionHistory({ onClose, onOpen }: Props) {
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
    reload("");
  }, [reload]);

  // 覆盖层期间 Android 返回键 = 关闭历史
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) return;
    setSearching(true);
    const t = setTimeout(() => reload(query), 250);
    return () => clearTimeout(t);
  }, [query, reload]);

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
  // 拍平给 FlatList 做虚拟化（会话多时打开历史不再整列同步渲染）
  type Row =
    | { k: string; kind: "h"; label: string }
    | { k: string; kind: "s"; s: ChatSession };
  const rows: Row[] = groups.flatMap((g) => [
    { k: `h-${g.label}`, kind: "h" as const, label: g.label },
    ...g.items.map((s) => ({ k: s.id, kind: "s" as const, s })),
  ]);

  return (
    <Pressable style={styles.page} onPress={onClose}>
      <Pressable
        style={[styles.sheet, rows.length > 0 && styles.sheetFull]}
        onPress={(e) => e.stopPropagation()}
      >
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
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(r) => r.k}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: r }) => {
              if (r.kind === "h")
                return <Text style={styles.groupLabel}>{r.label}</Text>;
              const s = r.s;
              const p = getProvider(s.providerId);
              const isCmp = s.providerId === COMPARE;
              return (
                <View style={styles.row}>
                  <Pressable style={styles.rowMain} onPress={() => onOpen(s)}>
                    <View style={styles.rowIcon}>
                      <Text style={styles.rowEmoji}>
                        {isCmp ? "⚖️" : (p?.emoji ?? "💬")}
                      </Text>
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {s.title}
                      </Text>
                      <Text style={styles.rowSub}>
                        {isCmp
                          ? `模型对比 · ${formatTime(s.updatedAt)}`
                          : `${p?.name ?? s.providerId} · ${s.modelId} · ${formatTime(s.updatedAt)}`}
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
            }}
          />
        )}
      </Pressable>
    </Pressable>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  page: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    justifyContent: "flex-end",
    zIndex: 38,
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: "78%",
  },
  sheetFull: { height: "72%" },
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
  list: { flex: 1 },
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
  rowIcon: { width: 24, alignItems: "center" },
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
