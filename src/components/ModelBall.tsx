import React, { useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { clampBallRatio } from "./ballMath";

// 纯函数钳制逻辑在 ballMath.ts（无 RN 依赖，可单测），此处再导出供 HomeScreen 使用
export { clampBallRatio };

// ===== TapBall 悬浮球（v0.4.0）=====
// 取代顶部 chrome 与底部 dock：一颗贴右球的悬浮球承载全部导航。
// 默认显示当前模型（厂商 emoji），点按向下展开菜单：厂商球组 + 动作行；
// 竖向可拖（松手回弹、位置持久化），不落系统手势区、不抢边缘滑动。
// 成熟参照：iOS 辅助触控小球、地图类 App 语音悬浮球。

export interface BallAction {
  key: string;
  emoji: string;
  label: string;
  onClick: () => void;
  dim?: boolean; // 置灰但可见（如网页不可后退）
  accent?: boolean; // 高亮（如对比模式开启中）
}

export interface BallGroup {
  providerId: string;
  emoji: string;
  name: string;
  color: string;
  active: boolean; // 当前使用厂商
  selected?: boolean; // 已选入对比
  onPick: () => void;
  sub?: { modelId: string; active: boolean; onPick: () => void }[];
}

interface Props {
  groups: BallGroup[];
  actions: BallAction[];
  headerLabel: string;
  ballEmoji: string;
  ballBadge?: string;
  ratio: number; // 球垂直位置（0-1，父层持久化）
  onRatioChange: (r: number) => void;
}

const BALL = 46;

export default function ModelBall({
  groups,
  actions,
  headerLabel,
  ballEmoji,
  ballBadge,
  ratio,
  onRatioChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [h, setH] = useState(0);
  const dragAnim = useRef(new Animated.Value(0)).current;
  const movedRef = useRef(false);

  const top = ratio * h;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        movedRef.current = false;
        dragAnim.setValue(0);
      },
      onPanResponderMove: (_e, g) => {
        movedRef.current = true;
        dragAnim.setValue(g.dy);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        if (h > 0) onRatioChange(clampBallRatio((top + g.dy) / h));
        dragAnim.setValue(0);
      },
    }),
  ).current;

  const run = (fn: () => void) => {
    setOpen(false);
    setSubOpen(null);
    fn();
  };

  return (
    <View
      style={styles.layer}
      pointerEvents="box-none"
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
    >
      {open ? (
        <Pressable style={styles.mask} onPress={() => setOpen(false)} />
      ) : null}

      {/* 展开菜单：贴着球下方，右对齐 */}
      {open && h > 0 ? (
        <View
          style={[styles.menu, { top: Math.min(top + BALL + 6, h * 0.45) }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.menuHead}>{headerLabel}</Text>

          {groups.map((g) => (
            <View key={g.providerId}>
              <Pressable
                style={[styles.row, g.active && styles.rowOn]}
                onPress={() => run(g.onPick)}
              >
                <View
                  style={[styles.gEmoji, { backgroundColor: g.color + "1A" }]}
                >
                  <Text style={styles.gEmojiText}>{g.emoji}</Text>
                </View>
                <Text
                  style={[styles.gName, g.active && styles.gNameOn]}
                  numberOfLines={1}
                >
                  {g.name}
                </Text>
                {g.selected ? <Text style={styles.gSel}>✓对比</Text> : null}
                {g.sub && g.sub.length > 1 ? (
                  <Pressable
                    style={styles.subToggle}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() =>
                      setSubOpen(subOpen === g.providerId ? null : g.providerId)
                    }
                  >
                    <Text style={styles.subToggleText}>
                      {subOpen === g.providerId ? "▴" : "▾"}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
              {g.sub && subOpen === g.providerId ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subRow}
                >
                  {g.sub.map((s) => (
                    <Pressable
                      key={s.modelId}
                      style={[styles.subChip, s.active && styles.subChipOn]}
                      onPress={() => run(s.onPick)}
                    >
                      <Text
                        style={[
                          styles.subChipText,
                          s.active && styles.subChipTextOn,
                        ]}
                        numberOfLines={1}
                      >
                        {s.modelId}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ))}

          {groups.length > 0 && actions.length > 0 ? (
            <View style={styles.sep} />
          ) : null}

          {actions.map((a) => (
            <Pressable
              key={a.key}
              style={[
                styles.row,
                a.dim && styles.rowDim,
                a.accent && styles.rowOn,
              ]}
              onPress={() => run(a.onClick)}
            >
              <View style={[styles.gEmoji, { backgroundColor: COLORS.bgAlt }]}>
                <Text style={styles.gEmojiText}>{a.emoji}</Text>
              </View>
              <Text
                style={[styles.gName, a.accent && styles.gNameOn]}
                numberOfLines={1}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}

          {groups.length === 0 ? (
            <Text style={styles.menuEmpty}>
              还没连接模型 · 点「去配置」添加一个
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* 悬浮球（半贴右边，竖向可拖） */}
      {h > 0 ? (
        <Animated.View
          style={[
            styles.ballWrap,
            { top, transform: [{ translateY: dragAnim }] },
          ]}
          {...pan.panHandlers}
        >
          <Pressable
            style={({ pressed }) => [
              styles.ball,
              pressed && styles.ballPressed,
            ]}
            onPress={() => {
              if (!movedRef.current) setOpen((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="模型与功能菜单"
          >
            <Text style={styles.ballEmoji}>{ballEmoji}</Text>
            {ballBadge ? (
              <Text style={styles.ballBadge}>{ballBadge}</Text>
            ) : null}
            {open ? <View style={styles.ballOpenDot} /> : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  mask: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 39,
  },
  ballWrap: { position: "absolute", right: 8 },
  ball: {
    width: BALL,
    height: BALL,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  ballPressed: { transform: [{ scale: 0.93 }] },
  ballEmoji: { fontSize: 22 },
  ballBadge: {
    position: "absolute",
    right: 4,
    bottom: 3,
    fontSize: 10,
  },
  ballOpenDot: {
    position: "absolute",
    top: 5,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  menu: {
    position: "absolute",
    right: 8,
    width: 248,
    maxHeight: "70%",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  menuHead: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    fontWeight: "700",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    minHeight: 44,
  },
  rowOn: { backgroundColor: COLORS.accentSoft },
  rowDim: { opacity: 0.45 },
  gEmoji: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  gEmojiText: { fontSize: FONT_SIZE.md },
  gName: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: "600",
  },
  gNameOn: { color: COLORS.accentDark },
  gSel: { fontSize: FONT_SIZE.xs, color: COLORS.accentDark, fontWeight: "700" },
  subToggle: { paddingHorizontal: 4 },
  subToggleText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  subRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
  },
  subChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 200,
  },
  subChipOn: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  subChipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  subChipTextOn: { color: COLORS.accentDark },
  sep: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  menuEmpty: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
  },
});
