import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../constants';
import { deleteSession, listSessions } from '../database/chatDB';
import { getProvider } from '../providers/registry';
import type { ChatSession } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpen: (session: ChatSession) => void;
}

// 会话历史弹窗：列表 + 左滑删除（简化为行内删除按钮）
export default function SessionHistory({ visible, onClose, onOpen }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    if (visible) listSessions().then(setSessions);
  }, [visible]);

  const remove = async (id: string) => {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>🕘 历史会话</Text>
          {sessions.length === 0 ? (
            <Text style={styles.empty}>暂无历史会话</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {sessions.map((s) => {
                const p = getProvider(s.providerId);
                return (
                  <View key={s.id} style={styles.row}>
                    <Pressable style={styles.rowMain} onPress={() => onOpen(s)}>
                      <Text style={styles.rowEmoji}>{p?.emoji ?? '💬'}</Text>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
                        <Text style={styles.rowSub}>
                          {p?.name ?? s.providerId} · {s.modelId} · {formatTime(s.updatedAt)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable style={styles.delBtn} onPress={() => remove(s.id)}>
                      <Text style={styles.delText}>✕</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: '70%',
  },
  title: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  empty: { fontSize: FONT_SIZE.sm, color: COLORS.textTertiary, textAlign: 'center', paddingVertical: SPACING.xl },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md },
  rowEmoji: { fontSize: FONT_SIZE.lg },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: '600' },
  rowSub: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 2 },
  delBtn: {
    width: 26, height: 26, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt, alignItems: 'center', justifyContent: 'center',
  },
  delText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, fontWeight: '600' },
});
