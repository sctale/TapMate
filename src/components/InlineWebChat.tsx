import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
// 聊天就在首页完成，不跳转第二个页面。
// v0.2.3：去掉常驻顶栏——控件收成右上角浮动小条，数秒后自动淡出；
// 点屏幕顶边（由 HomeScreen 的沉浸调度统一控制）再次唤出。

interface Props {
  providerId: string;
  onExit: () => void; // 关闭嵌入，回到首页常规视图
  controlsVisible: boolean; // 浮动控件可见性（由 HomeScreen 统一调度）
}

export default function InlineWebChat({
  providerId,
  onExit,
  controlsVisible,
}: Props) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const ctrlAnim = useRef(new Animated.Value(1)).current;

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

  // 浮动控件淡入淡出
  useEffect(() => {
    Animated.timing(ctrlAnim, {
      toValue: controlsVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, ctrlAnim]);

  if (!provider) return null;

  const reload = () => {
    setLoadError(false);
    setLoading(true);
    webRef.current?.reload();
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 0) }]}>
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

      {/* 浮动控件条：后退 / 刷新 / 退出（自动淡出，点顶边唤出） */}
      <Animated.View
        pointerEvents={controlsVisible ? "auto" : "none"}
        style={[
          styles.ctrlPill,
          { top: insets.top + SPACING.sm, opacity: ctrlAnim },
        ]}
      >
        {canGoBack ? (
          <Pressable
            style={styles.ctrlBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => webRef.current?.goBack()}
            accessibilityLabel="网页后退"
          >
            <Text style={styles.ctrlBtnText}>‹</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.ctrlBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={reload}
          accessibilityLabel="刷新页面"
        >
          <Text style={styles.ctrlBtnText}>⟳</Text>
        </Pressable>
        <Pressable
          style={[styles.ctrlBtn, styles.ctrlExit]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onExit}
          accessibilityLabel="退出嵌入对话"
        >
          <Text style={[styles.ctrlBtnText, { color: COLORS.danger }]}>✕</Text>
        </Pressable>
      </Animated.View>

      {loading && !loadError ? (
        <View
          style={[styles.loadingBox, { top: insets.top + SPACING.md }]}
          pointerEvents="none"
        >
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
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.surface },
  webview: { flex: 1, backgroundColor: COLORS.surface },
  ctrlPill: {
    position: "absolute",
    right: SPACING.md,
    flexDirection: "row",
    gap: SPACING.xs,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 30,
  },
  ctrlBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlExit: { backgroundColor: "#FDECEA" },
  ctrlBtnText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  loadingBox: { position: "absolute", alignSelf: "center", zIndex: 6 },
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
    zIndex: 20,
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
