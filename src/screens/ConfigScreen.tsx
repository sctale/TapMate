import React, { useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../constants';
import { PROVIDERS } from '../providers/registry';
import { isProviderReady, useProviders } from '../state/ProvidersContext';
import { testApiKey } from '../providers/apiTest';
import type { ChannelType, ProviderDef } from '../types';

interface Props {
  onOpenWeb: (providerId: string) => void; // 打开官网登录容器（WebView / Custom Tabs）
}

// 配置页：厂商列表 + 通道选择 + API Key 管理
export default function ConfigScreen({ onOpenWeb }: Props) {
  const insets = useSafeAreaInsets();
  const { configs, loaded, updateConfig } = useProviders();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // 切换接入通道
  const switchChannel = async (p: ProviderDef, channel: ChannelType) => {
    const cfg = configs.get(p.id);
    await updateConfig({
      providerId: p.id,
      enabled: cfg?.enabled ?? true,
      channel,
      apiKey: cfg?.apiKey,
      baseUrl: cfg?.baseUrl,
      webLoggedIn: cfg?.webLoggedIn,
    });
  };

  // 保存 API Key 并测试连通性
  const saveAndTest = async (p: ProviderDef) => {
    const key = keyDraft.trim();
    if (!key) return say('请先输入 API Key');
    setBusy(true);
    const cfg = configs.get(p.id);
    const baseUrl = cfg?.baseUrl || p.apiBaseUrl || '';
    const ok = await testApiKey(p, key, baseUrl);
    setBusy(false);
    if (ok) {
      await updateConfig({
        providerId: p.id, enabled: true, channel: 'api', apiKey: key, baseUrl,
      });
      setKeyDraft('');
      say(`✅ ${p.name} 连接成功`);
    } else {
      say(`❌ ${p.name} 连接失败，请检查 Key 与地址`);
    }
  };

  if (!loaded) {
    return <View style={styles.loading}><Text style={styles.hint}>加载中…</Text></View>;
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + SPACING.md }]}>
      <Text style={styles.title}>⚙️ 配置</Text>
      <Text style={styles.hint}>优先官网账号登录（免费用订阅），也可填 API Key 获得统一体验</Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {PROVIDERS.map((p) => {
          const cfg = configs.get(p.id);
          const ready = isProviderReady(cfg);
          const expanded = expandedId === p.id;
          const channel: ChannelType = cfg?.channel ?? p.preferredChannel;
          return (
            <View key={p.id} style={styles.card}>
              <Pressable
                style={styles.row}
                onPress={() => {
                  setExpandedId(expanded ? null : p.id);
                  setKeyDraft(cfg?.apiKey ?? '');
                }}
              >
                <View style={[styles.icon, { backgroundColor: p.color + '1A' }]}>
                  <Text style={styles.iconEmoji}>{p.emoji}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.sub}>
                    {channel === 'api' ? '🔑 API' : channel === 'customTabs' ? '🌐 浏览器登录' : '🌐 网页登录'}
                    {ready ? ' · 已连接' : ' · 未配置'}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: ready ? COLORS.success : COLORS.borderSubtle }]} />
              </Pressable>

              {expanded && (
                <View style={styles.detail}>
                  {/* 通道选择胶囊 */}
                  <View style={styles.chips}>
                    {(['web', 'customTabs', 'api'] as ChannelType[]).map((c) => {
                      const label = c === 'api' ? 'API Key' : c === 'customTabs' ? '浏览器登录' : '网页登录';
                      const on = channel === c;
                      return (
                        <Pressable
                          key={c}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => switchChannel(p, c)}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {channel === 'api' ? (
                    <View style={styles.apiBox}>
                      <TextInput
                        style={styles.input}
                        placeholder="粘贴 API Key（sk-…）"
                        placeholderTextColor={COLORS.textTertiary}
                        value={keyDraft}
                        onChangeText={setKeyDraft}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                      />
                      <Pressable
                        style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                        disabled={busy}
                        onPress={() => saveAndTest(p)}
                      >
                        <Text style={styles.primaryBtnText}>{busy ? '测试中…' : '保存并测试'}</Text>
                      </Pressable>
                      {p.apiDocsUrl ? (
                        <Text style={styles.hint}>获取 Key：{p.apiDocsUrl}</Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.apiBox}>
                      <Text style={styles.hint}>
                        {channel === 'customTabs'
                          ? '将打开系统浏览器标签页（共享 Chrome 登录态），登录后返回即可'
                          : '将在应用内打开官网，登录你的账号后即可使用（免费用订阅额度）'}
                      </Text>
                      <Pressable style={styles.primaryBtn} onPress={() => onOpenWeb(p.id)}>
                        <Text style={styles.primaryBtnText}>
                          {cfg?.webLoggedIn ? '重新登录 / 打开官网' : '登录官网'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {toast ? (
        <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: SPACING.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text },
  hint: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, lineHeight: 17, marginTop: SPACING.xs },
  list: { paddingTop: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: COLORS.border, padding: SPACING.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  icon: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: FONT_SIZE.lg },
  info: { flex: 1 },
  name: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: '600' },
  sub: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  detail: { marginTop: SPACING.md, gap: SPACING.sm },
  chips: { flexDirection: 'row', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
  },
  chipOn: { backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: COLORS.accent },
  chipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextOn: { color: COLORS.accentDark, fontWeight: '700' },
  apiBox: { gap: SPACING.sm },
  input: {
    backgroundColor: COLORS.bgAlt, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    fontSize: FONT_SIZE.md, color: COLORS.text,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.sm,
    paddingVertical: 11, alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: '700' },
  toast: {
    position: 'absolute', left: SPACING.lg, right: SPACING.lg, bottom: SPACING.xxl,
    backgroundColor: COLORS.text, borderRadius: RADIUS.md,
    paddingVertical: 10, paddingHorizontal: SPACING.md, alignItems: 'center',
  },
  toastText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: '600' },
});
