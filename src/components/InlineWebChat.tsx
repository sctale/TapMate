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

// ===== 官网通道 · 全屏对话页（v0.5.0）=====
// 参考 Msty Navigator 标签页 / Cherry Studio 快应用：官网对话是「一整页」，
// 控件是布局兄弟节点而非悬浮层 → WebView 保持硬件加速（软件层曾拖垮历史面板）。
// 此模式下首页悬浮球自动隐藏（RN 视图无法可靠覆盖硬件层 WebView，避免再造覆盖层）。
// 登录与对话共用此页：登录态 cookie 持久化在容器内，一次登录长期有效。

interface Props {
  providerId: string;
  onExit: () => void; // 返回聊天首页（悬浮球恢复显示）
}

export default function InlineWebChat({ providerId, onExit }: Props) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android 返回键：优先官网页面内后退，无路可退时返回首页
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
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      {/* 顶部控制条：布局兄弟节点，不悬浮于网页之上 */}
      <View style={styles.bar}>
        <Pressable
          style={[styles.barBtn, !canGoBack && styles.barBtnHidden]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => webRef.current?.goBack()}
          accessibilityLabel="网页后退"
        >
          <Text style={styles.barBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          {provider.emoji} {provider.name}
          <Text style={styles.barMode}> · 官网对话</Text>
        </Text>
        {loading && !loadError ? (
          <ActivityIndicator size="small" color={COLORS.accent} />
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
          style={[styles.barBtn, styles.exitBtn]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onExit}
          accessibilityLabel="返回首页"
        >
          <Text style={[styles.barBtnText, { color: COLORS.danger }]}>✕</Text>
        </Pressable>
      </View>

      {loadError ? (
        <View style={styles.errBody}>
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
          <Pressable style={styles.errGhost} onPress={onExit}>
            <Text style={styles.errGhostText}>返回首页</Text>
          </Pressable>
        </View>
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.surface },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    height: 48,
    backgroundColor: COLORS.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  barTitle: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: "700",
    color: COLORS.text,
  },
  barMode: {
    fontSize: FONT_SIZE.xs,
    fontWeight: "600",
    color: COLORS.accentDark,
  },
  barBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  barBtnHidden: { opacity: 0.25 },
  exitBtn: { backgroundColor: "#FDECEA" },
  barBtnText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  webview: { flex: 1, backgroundColor: COLORS.surface },
  errBody: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    padding: SPACING.xl,
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
  errGhost: { padding: SPACING.sm, marginTop: SPACING.xs },
  errGhostText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
});
