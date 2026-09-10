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
//
// 登录态不变量（关键）：
//   webLoggedIn 只允许显式登录确认置位（Safety 属性：打开/关闭网页绝不自动标记为已连接），
//   用户在官网完成登录后点「✅ 我已登录」才记入；点 ✕ 仅关闭不标记。
//   因此未登录/未确认时，配置页不会错误显示"已连接"。
export default function WebChatScreen({ providerId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const provider = getProvider(providerId);
  const { configs, updateConfig } = useProviders();
  const [loading, setLoading] = useState(true);
  const closedRef = useRef(false);

  const cfg = configs.get(providerId);
  const channel = cfg?.channel ?? provider?.preferredChannel ?? 'web';
  // customTabs 从浏览器返回后：待用户确认登录的中间态（不明不是已连接）
  const [tabsReturned, setTabsReturned] = useState(false);

  // 显式确认已登录：仅此路径可以置位 webLoggedIn
  const confirmLoggedIn = async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const prev = configs.get(providerId);
    await updateConfig({
      providerId,
      enabled: true,
      channel: provider?.preferredChannel ?? 'web',
      apiKey: prev?.apiKey,
      baseUrl: prev?.baseUrl,
      webLoggedIn: true,
    });
    onClose();
  };

  // customTabs 通道：打开系统浏览器；返回后进入"待确认"中间态
  useEffect(() => {
    if (channel !== 'customTabs' || !provider) return;
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

  // web 通道关闭（✕）：仅关闭容器，不标记已连接
  const handleClose = async () => {
    closedRef.current = true;
    onClose();
  };

  // customTabs 通道等待浏览器返回时的占位
  if (channel === 'customTabs') {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
        <Header providerName={provider.name} emoji={provider.emoji} onClose={handleClose} />
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
              <Text style={styles.hint}>已在浏览器中完成 {provider.name} 登录？</Text>
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

  // web 通道：应用内 WebView（官网对话/登录），底部常驻「我已登录」确认按钮
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
      <View style={[styles.confirmBar, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <Pressable style={styles.primaryBtn} onPress={confirmLoggedIn}>
          <Text style={styles.primaryBtnText}>✅ 我已登录，开始使用</Text>
        </Pressable>
        <Text style={styles.hintMedium}>在官网完成登录后，点此确认（未登录请勿点击）</Text>
      </View>
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
  emojiLarge: { fontSize: 56, marginBottom: SPACING.sm },
  hint: { fontSize: FONT_SIZE.sm, color: COLORS.textTertiary },
  hintMedium: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  primaryBtnText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: '700' },
  webview: { flex: 1, backgroundColor: COLORS.surface },
  confirmBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
  },
});