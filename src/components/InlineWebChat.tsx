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

// ===== 官网通道 · 全屏对话页（v0.5.3 无控制条版）=====
// v0.5.3：顶部控制条移除——刷新/退出收进悬浮球菜单（球在本模式同样显示）。
// 卡顿约束：WebView 保持默认硬件层（不设 software layerType，软件层曾拖垮历史面板）；
// 悬浮球是 RN 层兄弟节点绝对定位叠加，不参与网页合成，滚动零干扰。
// 网页后退/退出：Android 系统返回键 → 可后退则网页内后退，否则退回聊天首页。
// 登录与对话共用此页：登录态 cookie 持久化在容器内，一次登录长期有效。

export interface InlineWebChatHandle {
  /** 悬浮球菜单「刷新网页」调用 */
  reload: () => void;
}

interface Props {
  providerId: string;
  onExit: () => void; // 返回聊天首页（悬浮球菜单可再次进入）
}

const InlineWebChat = forwardRef<InlineWebChatHandle, Props>(
  function InlineWebChat({ providerId, onExit }, ref) {
    const insets = useSafeAreaInsets();
    const provider = getProvider(providerId);
    const webRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [canGoBack, setCanGoBack] = useState(false);

    // 暴露给悬浮球菜单：刷新（不重建组件，父级仅存 ref）
    useImperativeHandle(
      ref,
      () => ({
        reload: () => {
          setLoadError(false);
          setLoading(true);
          webRef.current?.reload();
        },
      }),
      [],
    );

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

    if (loadError) {
      // 加载失败兜底卡（无网页可显示时给出路）
      return (
        <View style={[styles.errBody, { paddingTop: insets.top }]}>
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
      );
    }

    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
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
        {/* 加载指示：轻量绝对定位覆盖层，不拦截触摸，加载完即卸载 */}
        {loading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={COLORS.accent} />
          </View>
        ) : null}
      </View>
    );
  },
);

export default InlineWebChat;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.surface },
  loadingOverlay: {
    position: "absolute",
    top: SPACING.md,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
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
