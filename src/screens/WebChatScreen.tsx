import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../constants';
import { getProvider } from '../providers/registry';
import { useProviders } from '../state/ProvidersContext';

interface Props {
  providerId: string;
  onClose: () => void;
}

// 干净的 Chrome UA（去掉 "; wv" WebView 标记，降低 ChatGPT Turnstile 等拦截概率）
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// Web 容器页：按厂商通道策略选择容器
// - customTabs：Chrome Custom Tabs（共享系统 Chrome 登录态，Gemini 官方合规方案）
// - web：应用内 WebView（干净 Chrome UA + Cookie 持久化，ChatGPT/国内厂商）
export default function WebChatScreen({ providerId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const { configs, updateConfig } = useProviders();
  const [loading, setLoading] = useState(true);
  const closedRef = useRef(false);

  const cfg = configs.get(providerId);
  const channel = cfg?.channel ?? provider?.preferredChannel ?? 'web';

  // customTabs 通道：直接打开系统浏览器标签页，关闭后标记已登录
  useEffect(() => {
    if (channel !== 'customTabs' || !provider) return;
    let cancelled = false;
    (async () => {
      // 打开 Custom Tabs（共享 Chrome Cookie，用户已登录则直接进入对话页）
      await WebBrowser.openBrowserAsync(provider.webUrl, {
        controlsColor: COLORS.accent,
        toolbarColor: COLORS.surface,
      });
      if (cancelled || closedRef.current) return;
      // 从浏览器返回后：视为已完成登录流程，更新标记并关闭容器
      const prev = configs.get(providerId);
      await updateConfig({
        providerId,
        enabled: true,
        channel: 'customTabs',
        apiKey: prev?.apiKey,
        baseUrl: prev?.baseUrl,
        webLoggedIn: true,
      });
      onClose();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, providerId]);

  if (!provider) return null;

  // web 通道关闭时：标记已配置（登录态由官网自身的 Cookie 管理，
  // WebView 系统级 CookieManager 会跨启动自动持久化，无需应用层探测）
  const handleClose = async () => {
    closedRef.current = true;
    if (channel === 'web') {
      const prev = configs.get(providerId);
      await updateConfig({
        providerId,
        enabled: true,
        channel: 'web',
        apiKey: prev?.apiKey,
        baseUrl: prev?.baseUrl,
        webLoggedIn: true,
      });
    }
    onClose();
  };

  // customTabs 通道等待浏览器返回时的占位
  if (channel === 'customTabs') {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
        <Header providerName={provider.name} emoji={provider.emoji} onClose={handleClose} />
        <View style={styles.body}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.hint}>正在浏览器中打开 {provider.name}…</Text>
          <Text style={styles.hint}>登录完成后返回即可</Text>
        </View>
      </View>
    );
  }

  // web 通道：应用内 WebView
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
      <Header providerName={provider.name} emoji={provider.emoji} onClose={handleClose} />
      {loading ? (
        <View style={styles.body}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : null}
      <WebView
        source={{ uri: provider.webUrl }}
        style={styles.webview}
        userAgent={CHROME_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        onLoadEnd={() => setLoading(false)}
      />
    </View>
  );
}

// 顶部栏：厂商名 + 关闭按钮
function Header({ providerName, emoji, onClose }: { providerName: string; emoji: string; onClose: () => void }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>
        {emoji} {providerName}
      </Text>
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '700' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hint: { fontSize: FONT_SIZE.sm, color: COLORS.textTertiary },
  webview: { flex: 1, backgroundColor: COLORS.surface },
});
