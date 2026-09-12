import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
// 聊天就在首页完成，不跳转第二个页面。
// v0.4.0：去掉浮动控件条——后退/刷新/退出统一收进悬浮球菜单；
// Android 用 software 图层，保证悬浮球能浮在 WebView 之上。

export interface InlineWebHandle {
  reload: () => void;
  goBack: () => void;
}

interface Props {
  providerId: string;
  onExit: () => void; // 关闭嵌入，回到首页常规视图
  onCanGoBackChange?: (v: boolean) => void; // 上报网页可后退状态（球菜单「‹ 后退」置灰用）
}

const InlineWebChat = forwardRef<InlineWebHandle, Props>(function InlineWebChat(
  { providerId, onExit, onCanGoBackChange },
  ref,
) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useImperativeHandle(ref, () => ({
    reload: () => {
      setLoadError(false);
      setLoading(true);
      webRef.current?.reload();
    },
    goBack: () => webRef.current?.goBack(),
  }));

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

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 0) }]}>
      <WebView
        ref={webRef}
        source={{ uri: provider.webUrl }}
        style={styles.webview}
        userAgent={CHROME_UA}
        {...WEBVIEW_BASE_PROPS}
        androidLayerType="software"
        onLoadStart={() => setLoadError(false)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav: WebViewNavigation) => {
          setCanGoBack(nav.canGoBack);
          onCanGoBackChange?.(nav.canGoBack);
        }}
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
          <Pressable
            style={styles.errPrimary}
            onPress={() => {
              setLoadError(false);
              setLoading(true);
              webRef.current?.reload();
            }}
          >
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
});

export default InlineWebChat;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.surface },
  webview: { flex: 1, backgroundColor: COLORS.surface },
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
