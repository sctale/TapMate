import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { PROVIDERS } from "../providers/registry";
import { isProviderReady, useProviders } from "../state/ProvidersContext";
import { testApiKey } from "../providers/apiTest";
import { fetchModelIds } from "../providers/modelList";
import { friendlyTestReason } from "../providers/errors";
import { useToast } from "../components/Toast";
import { BrandGlyph } from "../components/ModelBall";
import type { ChannelType, ProviderDef } from "../types";

interface Props {
  onOpenWeb: (providerId: string) => void; // 打开官网登录容器（WebView / Custom Tabs）
  onBack: () => void; // 返回对话页（v0.4.0：dock 移除后唯一出口）
}

// 通道命名改为用户可理解的收益描述（audit-10）
const CHANNEL_LABEL: Record<ChannelType, string> = {
  web: "应用内官网",
  customTabs: "系统浏览器",
  api: "API Key",
};

// 选中通道后展开一句话说明差异（audit-10）
const CHANNEL_DESC: Record<ChannelType, string> = {
  web: "登录一次官网账号后，点模型即全屏打开官网对话，免费用你的订阅额度",
  customTabs:
    "Google 禁止应用内对话：在系统浏览器标签里聊（共享 Chrome 登录态），首页点悬浮球有一键打开按钮",
  api: "填入 API Key，在统一的原生聊天界面对话，按 Token 计费，支持流式与本地历史",
};

// 配置页：厂商列表 + 通道选择 + API Key 管理
export default function ConfigScreen({ onOpenWeb, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const {
    configs,
    loaded,
    updateConfig,
    removeConfig,
    dynamicModels,
    syncModelIds,
  } = useProviders();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [baseDraft, setBaseDraft] = useState("");
  const [showKey, setShowKey] = useState(false); // Key 明密文切换（audit-14）
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast(32);

  // 拉取该厂商账号真实模型清单（v0.3.0）：成功写动态列表，失败提示回落默认
  const syncModels = async (p: ProviderDef) => {
    const cfg = configs.get(p.id);
    if (!cfg?.apiKey) return toast.show("请先保存 API Key");
    setSyncing(true);
    const baseUrl = cfg.baseUrl || p.apiBaseUrl || "";
    const ids = await fetchModelIds(p, cfg.apiKey, baseUrl);
    setSyncing(false);
    if (ids?.length) {
      await syncModelIds(p.id, ids);
      toast.show(`✅ ${p.name}：已同步 ${ids.length} 个模型`);
    } else {
      toast.show(`❌ ${p.name}：未取到模型列表，暂用内置默认`);
    }
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

  // 保存 API Key（+可选自定义 Base URL）并测试连通性
  const saveAndTest = async (p: ProviderDef) => {
    const key = keyDraft.trim();
    if (!key) return toast.show("请先输入 API Key");
    setBusy(true);
    const cfg = configs.get(p.id);
    const baseUrl = baseDraft.trim() || cfg?.baseUrl || p.apiBaseUrl || "";
    try {
      const res = await testApiKey(p, key, baseUrl);
      if (!res.ok) {
        // 区分超时 / 网络 / 鉴权 / 其他状态码，不再笼统「检查 Key 与地址」（audit-25）
        toast.show(`❌ ${friendlyTestReason(res.reason ?? "network")}`, 3500);
        return;
      }
      await updateConfig({
        providerId: p.id,
        enabled: true,
        channel: "api",
        apiKey: key,
        baseUrl,
      });
      setKeyDraft("");
      // 拉清单也纳入 busy 窗口，防止中途重复提交（D13）
      const ids = await fetchModelIds(p, key, baseUrl).catch(() => null);
      if (ids?.length) await syncModelIds(p.id, ids);
      toast.show(
        ids?.length
          ? `✅ ${p.name} 连接成功 · 已同步 ${ids.length} 个模型`
          : `✅ ${p.name} 连接成功`,
        3000,
      );
    } finally {
      setBusy(false);
    }
  };

  // 解绑厂商：清除加密存储中的配置（含登录标记与 Key），配置只能进不能出的问题（audit-9）
  const confirmUnbind = (p: ProviderDef) => {
    Alert.alert(
      `解绑 ${p.name}？`,
      "将清除该厂商的 API Key / 登录标记等全部本地配置。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "解绑",
          style: "destructive",
          onPress: async () => {
            await removeConfig(p.id);
            setExpandedId(null);
            toast.show(`已解绑 ${p.name}`);
          },
        },
      ],
    );
  };

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <Text style={styles.hint}>加载中…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top + SPACING.md }}>
        <View style={styles.headRow}>
          <Pressable
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="返回对话"
          >
            <Text style={styles.backBtnText}>‹ 返回对话</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>⚙️ 配置</Text>
        <Text style={styles.hint}>
          免费通道：登录官网账号、用订阅额度对话；API 通道：填
          Key、在统一界面对话
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {PROVIDERS.map((p) => {
          const cfg = configs.get(p.id);
          const ready = isProviderReady(cfg);
          const expanded = expandedId === p.id;
          const channel: ChannelType = cfg?.channel ?? p.preferredChannel;
          const liveCount = dynamicModels.get(p.id)?.length ?? 0;
          return (
            <View key={p.id} style={styles.card}>
              <Pressable
                style={styles.row}
                onPress={() => {
                  const next = expanded ? null : p.id;
                  setExpandedId(next);
                  if (next) {
                    setKeyDraft(cfg?.apiKey ?? "");
                    setBaseDraft(cfg?.baseUrl ?? "");
                    setShowKey(false);
                  }
                }}
              >
                <View
                  style={[styles.icon, { backgroundColor: p.color + "1A" }]}
                >
                  <BrandGlyph provider={p} size={22} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.sub}>
                    {channel === "api"
                      ? "🔑 API Key"
                      : channel === "customTabs"
                        ? "🌐 系统浏览器"
                        : "🌐 应用内官网"}
                    {ready ? " · 已连接" : " · 未配置"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: ready
                        ? COLORS.success
                        : COLORS.borderSubtle,
                    },
                  ]}
                />
              </Pressable>

              {expanded && (
                <View style={styles.detail}>
                  {/* 通道选择胶囊 + 选中通道的一句话说明（audit-10） */}
                  <View style={styles.chips}>
                    {(["web", "customTabs", "api"] as ChannelType[]).map(
                      (c) => {
                        const on = channel === c;
                        return (
                          <Pressable
                            key={c}
                            style={[styles.chip, on && styles.chipOn]}
                            onPress={() => switchChannel(p, c)}
                          >
                            <Text
                              style={[styles.chipText, on && styles.chipTextOn]}
                            >
                              {CHANNEL_LABEL[c]}
                            </Text>
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                  <Text style={styles.channelDesc}>
                    {CHANNEL_DESC[channel]}
                  </Text>

                  {channel === "api" ? (
                    <View style={styles.apiBox}>
                      <View style={styles.keyRow}>
                        <TextInput
                          style={styles.input}
                          placeholder="粘贴 API Key（sk-…）"
                          placeholderTextColor={COLORS.textTertiary}
                          value={keyDraft}
                          onChangeText={setKeyDraft}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry={!showKey}
                        />
                        <Pressable
                          style={styles.eyeBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => setShowKey((v) => !v)}
                        >
                          <Text style={styles.eyeText}>
                            {showKey ? "🙈" : "👁"}
                          </Text>
                        </Pressable>
                      </View>
                      {/* 自定义 Base URL：兑现「兼容中转端点」的承诺（audit-20） */}
                      <TextInput
                        style={styles.input}
                        placeholder={`自定义 Base URL（可选，默认 ${p.apiBaseUrl ?? ""}）`}
                        placeholderTextColor={COLORS.textTertiary}
                        value={baseDraft}
                        onChangeText={setBaseDraft}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                      />
                      <Pressable
                        style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                        disabled={busy}
                        onPress={() => saveAndTest(p)}
                      >
                        <Text style={styles.primaryBtnText}>
                          {busy ? "测试中…" : "保存并测试"}
                        </Text>
                      </Pressable>
                      {p.apiDocsUrl ? (
                        <Pressable
                          onPress={() =>
                            Linking.openURL(p.apiDocsUrl!).catch(() => {})
                          }
                        >
                          <Text style={styles.docsLink}>
                            🔗 点此前往获取 {p.name} 的 API Key
                          </Text>
                        </Pressable>
                      ) : null}
                      {/* 模型清单来源（v0.3.0 动态模型）：Key 有效即可拉取账号真实列表 */}
                      {cfg?.apiKey ? (
                        <View style={styles.modelRow}>
                          <Text style={styles.hint}>
                            {liveCount
                              ? `模型清单：账号动态 ${liveCount} 个`
                              : `模型清单：内置默认 ${p.defaultModels.length} 个`}
                          </Text>
                          <View style={styles.modelActions}>
                            <Pressable
                              onPress={() => syncModels(p)}
                              disabled={syncing}
                            >
                              <Text style={styles.docsLink}>
                                {syncing
                                  ? "同步中…"
                                  : liveCount
                                    ? "🔄 重新同步"
                                    : "📥 同步模型清单"}
                              </Text>
                            </Pressable>
                            {liveCount ? (
                              <Pressable
                                onPress={() => syncModelIds(p.id, null)}
                              >
                                <Text style={styles.docsLink}>恢复默认</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.apiBox}>
                      <Text style={styles.hint}>
                        {channel === "customTabs"
                          ? "首次在此打开浏览器登录；之后到「对话」页点模型，在浏览器标签中开聊（Google 政策不允许应用内嵌）"
                          : "首次在此登录官网账号即可；之后到「对话」页点模型，官网聊天界面即全屏打开（免费用订阅额度）"}
                      </Text>
                      <Pressable
                        style={styles.primaryBtn}
                        onPress={() => onOpenWeb(p.id)}
                      >
                        <Text style={styles.primaryBtnText}>
                          {cfg?.webLoggedIn
                            ? "重新登录 / 打开官网"
                            : "登录官网"}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {cfg ? (
                    <Pressable
                      style={styles.unbindBtn}
                      onPress={() => confirmUnbind(p)}
                    >
                      <Text style={styles.unbindText}>解绑此厂商</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {toast.node}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: SPACING.lg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  headRow: { flexDirection: "row", marginBottom: SPACING.xs },
  backBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentDark,
    fontWeight: "700",
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: "800", color: COLORS.text },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    lineHeight: 17,
    marginTop: SPACING.xs,
  },
  channelDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  list: { paddingTop: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  icon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: FONT_SIZE.lg },
  info: { flex: 1 },
  name: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: "600" },
  sub: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  detail: { marginTop: SPACING.md, gap: SPACING.sm },
  chips: { flexDirection: "row", gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgAlt,
  },
  chipOn: {
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  chipTextOn: { color: COLORS.accentDark, fontWeight: "700" },
  apiBox: { gap: SPACING.sm },
  keyRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgAlt,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  eyeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeText: { fontSize: FONT_SIZE.md },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: "700",
  },
  docsLink: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.accentDark,
    fontWeight: "600",
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  modelActions: {
    flexDirection: "row",
    gap: SPACING.md,
    alignItems: "center",
  },
  unbindBtn: { paddingVertical: SPACING.xs, marginTop: SPACING.xs },
  unbindText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontWeight: "600",
    textAlign: "center",
  },
});
