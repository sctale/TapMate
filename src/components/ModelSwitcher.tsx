import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { getProvider } from "../providers/registry";
import type { ModelRef } from "../types";

interface Props {
  models: ModelRef[]; // 可用模型列表（已过滤未配置厂商）
  active: ModelRef | null;
  onSelect: (m: ModelRef) => void;
}

// 顶部模型切换器：横向滚动胶囊，每个模型带厂商色点
// active 变化时把选中胶囊滚入视野（audit-15；按平均胶囊宽度估算偏移）
const EST_CHIP_WIDTH = 130;

export default function ModelSwitcher({ models, active, onSelect }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const activeIndex = models.findIndex(
    (m) => active?.providerId === m.providerId && active?.modelId === m.modelId,
  );

  useEffect(() => {
    if (activeIndex > 0) {
      // 让选中项大致落在视口偏左 1/3 处，右边保留后续选项可见
      const x = Math.max(0, activeIndex * EST_CHIP_WIDTH - 90);
      scrollRef.current?.scrollTo({ x, animated: true });
    }
  }, [activeIndex]);

  if (models.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          尚未配置可用模型，请到「配置」页连接
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    >
      {models.map((m) => {
        const p = getProvider(m.providerId);
        const on =
          active?.providerId === m.providerId && active?.modelId === m.modelId;
        return (
          <Pressable
            key={`${m.providerId}:${m.modelId}`}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect(m)}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: p?.color ?? COLORS.accent },
              ]}
            />
            <Text
              style={[styles.label, on && styles.labelOn]}
              numberOfLines={1}
            >
              {m.modelId === "$web$" ? "🌐 " : ""}
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  empty: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  emptyText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accent,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  labelOn: { color: COLORS.accentDark, fontWeight: "700" },
});
