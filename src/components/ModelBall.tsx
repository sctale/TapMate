import React, { useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Svg, Path } from "react-native-svg";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { BRAND_ICONS } from "../constants/brandIcons";
import { clampBallRatio } from "./ballMath";
import type { ProviderDef } from "../types";

export { clampBallRatio };

// 无矢量源的品牌用官方位图（simple-icons 因商标下架 openai/doubao；openai 走 Wikimedia path）
const BRAND_PNGS: Record<string, number> = {
  doubao: require("../../assets/providers/doubao.png"),
};

// ===== TapBall 悬浮球（v0.4.1）=====
// 球面与展开菜单统一用「球」语言：菜单是一纵列球（品牌矢量图标），名称做左侧小标签。
// 菜单整体可滚动（v0.4.0 底部条目点不到的修复）。竖向拖拽、松手吸边、位置持久化。

export interface BallAction {
  key: string;
  emoji: string;
  label: string;
  onClick: () => void;
  dim?: boolean;
  accent?: boolean;
}

export interface BallGroup {
  provider: ProviderDef;
  active: boolean; // 当前使用厂商
  selected?: boolean; // 已选入对比
  onPick: () => void;
  sub?: { modelId: string; active: boolean; onPick: () => void }[];
}

interface Props {
  groups: BallGroup[];
  actions: BallAction[];
  headerLabel: string;
  /** 球面显示的品牌（当前模型厂商）；对比模式传 null 用 ballEmoji */
  ballProvider?: ProviderDef | null;
  ballEmoji: string;
  ballBadge?: string;
  ratio: number;
  onRatioChange: (r: number) => void;
}

const BALL = 46;
const MBALL = 40; // 菜单内球径

/** 品牌图标：矢量 path 优先，其次官方位图（豆包），再无则回落 emoji */
export function BrandGlyph({
  provider,
  size,
}: {
  provider: ProviderDef;
  size: number;
}) {
  const icon = BRAND_ICONS[provider.id];
  if (!icon) {
    const png = BRAND_PNGS[provider.id];
    if (png) {
      return (
        <Image
          source={png}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      );
    }
    return <Text style={{ fontSize: size * 0.82 }}>{provider.emoji}</Text>;
  }
  return (
    <Svg width={size} height={size} viewBox={icon.viewBox}>
      <Path d={icon.path} fill={provider.color} />
    </Svg>
  );
}

export default function ModelBall({
  groups,
  actions,
  headerLabel,
  ballProvider,
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

      {/* 展开菜单：一纵列球（品牌图标），左缘名称标签；整体可滚动 */}
      {open && h > 0 ? (
        <View style={[styles.menu, { top: Math.min(top + BALL + 6, h * 0.3) }]}>
          <Text style={styles.menuHead}>{headerLabel}</Text>
          <ScrollView
            style={styles.menuScroll}
            showsVerticalScrollIndicator={false}
          >
            {groups.map((g) => (
              <View key={g.provider.id}>
                <Pressable
                  style={[styles.mrow, g.active && styles.mrowOn]}
                  onPress={() => run(g.onPick)}
                >
                  <View style={styles.mrowInfo}>
                    <Text
                      style={[styles.mName, g.active && styles.mNameOn]}
                      numberOfLines={1}
                    >
                      {g.provider.name}
                    </Text>
                    {g.selected ? (
                      <Text style={styles.mSel}>✓ 对比中</Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.mball,
                      { backgroundColor: g.provider.color + "1A" },
                      g.active && {
                        borderColor: g.provider.color,
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <BrandGlyph provider={g.provider} size={MBALL - 16} />
                  </View>
                  {g.sub && g.sub.length > 1 ? (
                    <Pressable
                      style={styles.subToggle}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() =>
                        setSubOpen(
                          subOpen === g.provider.id ? null : g.provider.id,
                        )
                      }
                    >
                      <Text style={styles.subToggleText}>
                        {subOpen === g.provider.id ? "▴" : "▾"}
                      </Text>
                    </Pressable>
                  ) : null}
                </Pressable>
                {g.sub && subOpen === g.provider.id ? (
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
                  styles.mrow,
                  a.accent && styles.mrowOn,
                  a.dim && styles.mrowDim,
                ]}
                onPress={() => run(a.onClick)}
              >
                <View style={styles.mrowInfo}>
                  <Text
                    style={[styles.mName, a.accent && styles.mNameOn]}
                    numberOfLines={1}
                  >
                    {a.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.mball,
                    styles.aball,
                    a.accent && {
                      borderColor: COLORS.accent,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <Text style={styles.aEmoji}>{a.emoji}</Text>
                </View>
              </Pressable>
            ))}

            {groups.length === 0 ? (
              <Text style={styles.menuEmpty}>
                还没连接模型 · 点下方「配置厂商与 Key」添加
              </Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {/* 悬浮球：品牌矢量图标（对比态/无厂商回落 emoji） */}
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
            {ballProvider ? (
              <BrandGlyph provider={ballProvider} size={BALL - 18} />
            ) : (
              <Text style={styles.ballEmoji}>{ballEmoji}</Text>
            )}
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
    zIndex: 40,
  },
  ballWrap: { position: "absolute", right: 8, zIndex: 41 },
  ball: {
    width: BALL,
    height: BALL,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.96)",
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
  ballBadge: { position: "absolute", right: 3, bottom: 2, fontSize: 11 },
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
    width: 210,
    maxHeight: "62%",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    zIndex: 41,
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
  menuScroll: { flexGrow: 0 },
  mrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    minHeight: 54,
  },
  mrowOn: { backgroundColor: COLORS.accentSoft },
  mrowDim: { opacity: 0.45 },
  mrowInfo: { flex: 1 },
  mName: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: "600" },
  mNameOn: { color: COLORS.accentDark },
  mSel: { fontSize: FONT_SIZE.xs, color: COLORS.accentDark, fontWeight: "700" },
  mball: {
    width: MBALL,
    height: MBALL,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  aball: { backgroundColor: COLORS.bgAlt },
  aEmoji: { fontSize: FONT_SIZE.md },
  subToggle: { paddingHorizontal: 2, minWidth: 18, textAlign: "center" },
  subToggleText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  subRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.xs,
    alignItems: "center",
  },
  subChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 190,
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
    paddingVertical: SPACING.sm,
    lineHeight: 18,
  },
});
