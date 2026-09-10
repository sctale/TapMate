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
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { getProvider } from "../providers/registry";
import { useProviders } from "../state/ProvidersContext";

interface Props {
  providerId: string;
  onClose: () => void;
}

// 干净的 Chrome UA（去掉 "; wv" WebView 标记，降低 ChatGPT Turnstile 等拦截概率）
const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

// Web 容器页：按厂商通道策略选择容器
// - customTabs：Chrome Custom Tabs（共享系统 Chrome 登录态，Google 官方合规方案）
// - web：应用内 WebView（干净 Chrome UA + Cookie 持久化，ChatGPT/国内厂商）
//
// 登录态不变量（关键）：
//   webLoggedIn 只允许显式登录确认置位（Safety 属性：打开/关闭网页绝不自动标记为已连接），
//   用户在官网完成登录后点「✅ 我已登录」才记入；点 ✕ 仅关闭不标记。
// 本次改版补齐：Android 返回键与 WebView 内后退（audit-8）、加载失败兜底重试/降级外部浏览器（audit-22）。
export default function WebChatScreen({ providerId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const { configs, updateConfig } = useProviders();
  const [loading, setLoading] = useState(true);
  const closedRef = useRef(false);
  const webRef = useRef<WebView>(null);

  const cfg = configs.get(providerId);
  const channel = cfg?.channel ?? provider?.preferredChannel ?? "web";
  // customTabs 从浏览器返回后：待用户确认登录的中间态（不明不是已连接）
  const [tabsReturned, setTabsReturned] = useState(false);
  // web 通道内部是否有可后退的历史 + 是否加载失败
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // 显式确认已登录：仅此路径可以置位 webLoggedIn
  const confirmLoggedIn = async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const prev = configs.get(providerId);
    await updateConfig({
      providerId,
      enabled: true,
      channel: provider?.preferredChannel ?? "web",
      apiKey: prev?.apiKey,
      baseUrl: prev?.baseUrl,
      webLoggedIn: true,
    });
    onClose();
  };

  // 关闭容器（✕ 或返回键）：仅关闭，不标记已连接
  const handleClose = () => {
    closedRef.current = true;
    onClose();
  };

  // Android 返回键：web 通道优先在官网内后退，无路可退（或 customTabs）才关闭覆盖层（audit-8）
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (channel === "web" && canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      handleClose();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, canGoBack]);

  // customTabs 通道：打开系统浏览器；返回后进入"待确认"中间态
  useEffect(() => {
    if (channel !== "customTabs" || !provider) return;
    let cancelled = false;
    (async () => {
      await WebBrowser.openBrowserAsync(provider.webUrl, {
        controlsColor: COLORS.accent,
        toolbarColor: COLORS.surface,
      });
      if (cancelled || closedRef.current) return;
      // 浏览器返回 ≠ 已登录：进入待确认界面，等待用户显式确认
      setTabsReturned(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, providerId]);

  if (!provider) return null;

  // customTabs 通道等待浏览器返回时的占位
  if (channel === "customTabs") {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
        <Header
          providerName={provider.name}
          emoji={provider.emoji}
          onClose={handleClose}
        />
        <View style={styles.body}>
          {!tabsReturned ? (
            <>
              <ActivityIndicator color={COLORS.accent} />
              <Text style={styles.hint}>正在浏览器中打开 {provider.name}…</Text>
              <Text style={styles.hint}>登录完成后返回本应用</Text>
            </>
          ) : (
            <>
              <Text style={styles.emojiLarge}>{provider.emoji}</Text>
              <Text style={styles.hint}>
                已在浏览器中完成 {provider.name} 登录？
              </Text>
              <Pressable style={styles.primaryBtn} onPress={confirmLoggedIn}>
                <Text style={styles.primaryBtnText}>✅ 我已登录</Text>
              </Pressable>
              <Text style={styles.hintMedium}>
                如果尚未登录，可点击右上角 ✕ 返回，之后重新登录
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  const onNavState = (nav: WebViewNavigation) => {
    // loading=false 交给 onLoadEnd；这里只同步后退可用性（audit-8）
    setCanGoBack(nav.canGoBack);
  };

  // 加载失败兜底：错误卡片 + 重试 + 降级系统浏览器（audit-22）
  const openInBrowser = () => {
    Linking.openURL(provider.webUrl).catch(() => {});
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
      <Header
        providerName={provider.name}
        emoji={provider.emoji}
        onClose={handleClose}
        canGoBack={canGoBack}
        onGoBack={() => webRef.current?.goBack()}
      />
      {loadError ? (
        <View style={styles.errBody}>
          <Text style={styles.emojiLarge}>📡</Text>
          <Text style={styles.errTitle}>无法加载 {provider.name} 官网</Text>
          <Text style={styles.hint}>
            可能是网络不通或该域名需要代理，试试重试或改用系统浏览器
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              setLoadError(false);
              setLoading(true);
              webRef.current?.reload();
            }}
          >
            <Text style={styles.primaryBtnText}>🔄 重试</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={openInBrowser}>
            <Text style={styles.secondaryBtnText}>用系统浏览器打开</Text>
          </Pressable>
        </View>
      ) : null}
      <WebView
        ref={webRef}
        source={{ uri: provider.webUrl }}
        style={styles.webview}
        userAgent={CHROME_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={onNavState}
        onError={(synthetic) => {
          const { nativeEvent } = synthetic;
          console.warn(
            "[webchat] load error:",
            nativeEvent.code,
            nativeEvent.description,
          );
          setLoading(false);
          setLoadError(true);
        }}
      />
      {loading && !loadError ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : null}
      <View
        style={[
          styles.confirmBar,
          { paddingBottom: Math.max(insets.bottom, SPACING.sm) },
        ]}
      >
        <Pressable style={styles.primaryBtn} onPress={confirmLoggedIn}>
          <Text style={styles.primaryBtnText}>✅ 我已登录，开始使用</Text>
        </Pressable>
        <Text style={styles.hintMedium}>
          在官网完成登录后，点此确认（未登录请勿点击）
        </Text>
      </View>
    </View>
  );
}

// 顶部栏：厂商名 + 后退 + 关闭按钮
function Header({
  providerName,
  emoji,
  onClose,
  canGoBack,
  onGoBack,
}: {
  providerName: string;
  emoji: string;
  onClose: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>
        {emoji} {providerName}
      </Text>
      <View style={styles.barActions}>
        {canGoBack ? (
          <Pressable
            style={styles.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={onGoBack}
          >
            <Text style={styles.closeText}>‹</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onClose}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONT_SIZE.lg, fontWeight: "700", color: COLORS.text },
  barActions: { flexDirection: "row", gap: SPACING.sm },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  errBody: {
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
  errTitle: { fontSize: FONT_SIZE.lg, fontWeight: "700", color: COLORS.text },
  emojiLarge: { fontSize: 56, marginBottom: SPACING.sm },
  hint: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
  hintMedium: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    alignItems: "center",
    alignSelf: "stretch",
    marginTop: SPACING.sm,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
    alignItems: "center",
    alignSelf: "stretch",
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontWeight: "600",
  },
  webview: { flex: 1, backgroundColor: COLORS.surface },
  loadingOverlay: {
    position: "absolute",
    top: SPACING.xxl,
    alignSelf: "center",
    zIndex: 6,
  },
  confirmBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
  },
});
