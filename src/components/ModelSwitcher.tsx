import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { PROVIDERS, getProvider } from "../providers/registry";
import type { ModelRef } from "../types";

interface Props {
  models: ModelRef[]; // 可用模型列表（已过滤未配置厂商）
  active: ModelRef | null;
  onSelect: (m: ModelRef) => void;
}

// 顶部模型切换器 v2：一排圆形厂商图标（40px），点选即用；
// 多模型厂商选中后，下方展开一行小胶囊选具体模型。
// 官网通道（$web$）的圆点右下角带 🌐 角标。
const CIRCLE = 40;

export default function ModelSwitcher({ models, active, onSelect }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  // 按厂商聚合，保持注册表顺序
  const groups = useMemo(() => {
    const order = PROVIDERS.map((p) => p.id);
    const map = new Map<string, ModelRef[]>();
    for (const m of models) {
      const arr = map.get(m.providerId) ?? [];
      arr.push(m);
      map.set(m.providerId, arr);
    }
    return [...map.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([providerId, list]) => ({ providerId, list }));
  }, [models]);

  const activeGroupIndex = groups.findIndex((g) =>
    g.list.some(
      (m) =>
        active?.providerId === m.providerId && active?.modelId === m.modelId,
    ),
  );

  // 选中项滚入视野（按圆形宽度估算）
  useEffect(() => {
    if (activeGroupIndex > 0) {
      scrollRef.current?.scrollTo({
        x: Math.max(0, activeGroupIndex * (CIRCLE + SPACING.sm) - 70),
        animated: true,
      });
    }
  }, [activeGroupIndex]);

  if (models.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          尚未配置可用模型，请到「配置」页连接
        </Text>
      </View>
    );
  }

  const activeGroup = activeGroupIndex >= 0 ? groups[activeGroupIndex] : null;
  const showSubRow = !!activeGroup && activeGroup.list.length > 1;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {groups.map((g) => {
          const p = getProvider(g.providerId);
          const on = activeGroup?.providerId === g.providerId;
          const isWeb = g.list[0]?.modelId === "$web$";
          return (
            <Pressable
              key={g.providerId}
              style={[styles.circle, on && styles.circleOn]}
              onPress={() => {
                // 已选中该厂商时沿用当前模型；否则取其第一个模型
                const keep =
                  on && active
                    ? (g.list.find((m) => m.modelId === active.modelId) ?? null)
                    : null;
                onSelect(keep ?? g.list[0]);
              }}
              accessibilityRole="button"
              accessibilityLabel={p?.name ?? g.providerId}
            >
              <Text style={styles.circleEmoji}>{p?.emoji ?? "🤖"}</Text>
              {isWeb ? <Text style={styles.webBadge}>🌐</Text> : null}
              {!isWeb && g.list.length > 1 ? (
                <Text style={styles.countBadge}>{g.list.length}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 多模型厂商：选中后展开二级模型胶囊 */}
      {showSubRow ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subList}
        >
          {activeGroup!.list.map((m) => {
            const on =
              active?.providerId === m.providerId &&
              active?.modelId === m.modelId;
            return (
              <Pressable
                key={`${m.providerId}:${m.modelId}`}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => onSelect(m)}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        getProvider(m.providerId)?.color ?? COLORS.accent,
                    },
                  ]}
                />
                <Text
                  style={[styles.label, on && styles.labelOn]}
                  numberOfLines={1}
                >
                  {m.modelId === "$web$" ? "官网对话" : m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
    alignItems: "center",
  },
  empty: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  emptyText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  circleOn: {
    borderColor: COLORS.accent,
    borderWidth: 2,
    backgroundColor: COLORS.accentSoft,
  },
  circleEmoji: { fontSize: FONT_SIZE.lg },
  webBadge: { position: "absolute", right: -2, bottom: -3, fontSize: 10 },
  countBadge: {
    position: "absolute",
    right: -1,
    top: -1,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    color: COLORS.white,
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 15,
    paddingHorizontal: 2,
    overflow: "hidden",
  },
  subList: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  labelOn: { color: COLORS.accentDark, fontWeight: "700" },
});
