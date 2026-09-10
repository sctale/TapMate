import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { getProvider } from "../providers/registry";
import { CHROME_UA, WEBVIEW_BASE_PROPS } from "../providers/webConfig";

// ===== 首页嵌入式官网对话（Msty 式外壳模式）=====
// 官网通道厂商连接后，官网会话（含官网自己的输入框）直接内嵌在首页内容区，
// 聊天就在首页完成，不再全屏跳转第二个页面。
// 顶部条：厂商名 + 刷新 ⟳ + 退出 ✕；加载失败给出重试 / 外部浏览器兜底。

interface Props {
  providerId: string;
  onExit: () => void; // 关闭嵌入，回到首页常规视图
}

export default function InlineWebChat({ providerId, onExit }: Props) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android 返回键：优先官网页面内后退，无路可退时退出嵌入对话（不退出 App）
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack, onExit]);

  if (!provider) return null;

  const reload = () => {
    setLoadError(false);
    setLoading(true);
    webRef.current?.reload();
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      <View style={styles.bar}>
        <View style={styles.barInfo}>
          <Text style={styles.barTitle} numberOfLines={1}>
            {provider.emoji} {provider.name}
            <Text style={styles.barMode}>　· 嵌入官网对话</Text>
          </Text>
          <Text style={styles.barHint} numberOfLines={1}>
            在下方网页内直接输入聊天 · 用官网账号额度 · 若提示登录就地登录即可
          </Text>
        </View>
        <View style={styles.barActions}>
          {canGoBack ? (
            <Pressable
              style={styles.barBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => webRef.current?.goBack()}
            >
              <Text style={styles.barBtnText}>‹</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.barBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={reload}
            accessibilityLabel="刷新页面"
          >
            <Text style={styles.barBtnText}>⟳</Text>
          </Pressable>
          <Pressable
            style={styles.barBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={onExit}
            accessibilityLabel="退出嵌入对话"
          >
            <Text style={styles.barBtnText}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <WebView
          ref={webRef}
          source={{ uri: provider.webUrl }}
          style={styles.webview}
          userAgent={CHROME_UA}
          {...WEBVIEW_BASE_PROPS}
          onLoadStart={() => setLoadError(false)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(nav: WebViewNavigation) =>
            setCanGoBack(nav.canGoBack)
          }
          onError={(synthetic) => {
            const { nativeEvent } = synthetic;
            console.warn(
              "[inline-web] load error:",
              nativeEvent.code,
              nativeEvent.description,
            );
            setLoading(false);
            setLoadError(true);
          }}
        />
        {loading && !loadError ? (
          <View style={styles.loadingBox} pointerEvents="none">
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.errOverlay}>
            <Text style={styles.errEmoji}>📡</Text>
            <Text style={styles.errTitle}>无法加载 {provider.name} 官网</Text>
            <Text style={styles.errHint}>可能是网络不通或该域名需要代理</Text>
            <Pressable style={styles.errPrimary} onPress={reload}>
              <Text style={styles.errPrimaryText}>🔄 重试</Text>
            </Pressable>
            <Pressable
              style={styles.errSecondary}
              onPress={() => Linking.openURL(provider.webUrl).catch(() => {})}
            >
              <Text style={styles.errSecondaryText}>用系统浏览器打开</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.surface },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  barInfo: { flex: 1 },
  barTitle: { fontSize: FONT_SIZE.md, fontWeight: "700", color: COLORS.text },
  barMode: {
    fontSize: FONT_SIZE.xs,
    fontWeight: "600",
    color: COLORS.accentDark,
  },
  barHint: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 1 },
  barActions: { flexDirection: "row", gap: SPACING.xs },
  barBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  barBtnText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  content: { flex: 1 },
  webview: { flex: 1, backgroundColor: COLORS.surface },
  loadingBox: {
    position: "absolute",
    top: SPACING.md,
    alignSelf: "center",
    zIndex: 6,
  },
  errOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    padding: SPACING.xl,
    zIndex: 5,
  },
  errEmoji: { fontSize: 44 },
  errTitle: { fontSize: FONT_SIZE.lg, fontWeight: "700", color: COLORS.text },
  errHint: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
  errPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 11,
    marginTop: SPACING.xs,
  },
  errPrimaryText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: "700",
  },
  errSecondary: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 10,
  },
  errSecondaryText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontWeight: "600",
  },
});
