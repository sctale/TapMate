import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { getProvider } from "../providers/registry";
import type { ModelRef } from "../types";

// ===== 并发对比·模型多选（v0.3.0）=====
// 从已配置的 API 模型里选 2-4 个；跨厂商混选；确认后一题多发并排看答案。

const MIN = 2;
const MAX = 4;

interface Props {
  visible: boolean;
  models: ModelRef[]; // 仅 API 通道模型
  initial: ModelRef[]; // 上次的选择
  onCancel: () => void;
  onConfirm: (sel: ModelRef[]) => void;
}

const key = (m: ModelRef) => `${m.providerId}:${m.modelId}`;

export default function CompareSheet({
  visible,
  models,
  initial,
  onCancel,
  onConfirm,
}: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    // 打开时以上次选择预填（过滤掉已不可用的），不足 MIN 个则自动补前几个
    const valid = initial
      .map(key)
      .filter((k) => models.some((m) => key(m) === k));
    const picked = new Set(valid.slice(0, MAX));
    if (picked.size < MIN) {
      for (const m of models) {
        if (picked.size >= MIN) break;
        picked.add(key(m));
      }
    }
    setSel(picked);
  }, [visible, models, initial]);

  const toggle = (m: ModelRef) => {
    setSel((prev) => {
      const next = new Set(prev);
      const k = key(m);
      if (next.has(k)) next.delete(k);
      else if (next.size < MAX) next.add(k);
      return next;
    });
  };

  const selectedModels = models.filter((m) => sel.has(key(m)));
  const ok = selectedModels.length >= MIN;

  // 按厂商分组展示
  const byProvider = new Map<string, ModelRef[]>();
  for (const m of models) {
    const arr = byProvider.get(m.providerId) ?? [];
    arr.push(m);
    byProvider.set(m.providerId, arr);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>⚖️ 选择要对比的模型</Text>
          <Text style={styles.sub}>
            一个问题同时发给 {MIN}-{MAX} 个模型，回答并排对比（仅 API
            通道；会产生各家 Token 费用）
          </Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {[...byProvider.entries()].map(([pid, list]) => {
              const p = getProvider(pid);
              return (
                <View key={pid}>
                  <Text style={styles.groupLabel}>
                    {p?.emoji} {p?.name ?? pid}
                  </Text>
                  {list.map((m) => {
                    const on = sel.has(key(m));
                    return (
                      <Pressable
                        key={key(m)}
                        style={[styles.row, on && styles.rowOn]}
                        onPress={() => toggle(m)}
                      >
                        <View style={[styles.check, on && styles.checkOn]}>
                          {on ? <Text style={styles.checkTick}>✓</Text> : null}
                        </View>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: p?.color ?? COLORS.accent },
                          ]}
                        />
                        <Text
                          style={[styles.rowLabel, on && styles.rowLabelOn]}
                          numberOfLines={1}
                        >
                          {m.modelId}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            style={[styles.confirm, !ok && styles.confirmOff]}
            disabled={!ok}
            onPress={() => onConfirm(selectedModels)}
          >
            <Text style={styles.confirmText}>
              开始对比（{selectedModels.length}/{MAX}，至少 {MIN} 个）
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
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
    paddingBottom: SPACING.xl,
    maxHeight: "76%",
  },
  title: { fontSize: FONT_SIZE.lg, fontWeight: "800", color: COLORS.text },
  sub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    marginTop: 4,
    marginBottom: SPACING.sm,
    lineHeight: 17,
  },
  list: { flexGrow: 0 },
  groupLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    fontWeight: "700",
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.xs,
  },
  rowOn: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkTick: { color: COLORS.white, fontSize: FONT_SIZE.xs, fontWeight: "800" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  rowLabelOn: { color: COLORS.accentDark, fontWeight: "700" },
  confirm: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  confirmOff: { opacity: 0.4 },
  confirmText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: "700",
  },
});
