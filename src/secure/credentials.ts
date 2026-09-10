import * as SecureStore from "expo-secure-store";
import type { ProviderConfig } from "../types";

// ===== 凭证加密存储（expo-secure-store，Android 底层为 Keystore）=====
// 设计：每个厂商一条记录，JSON 序列化；API Key 不落明文 AsyncStorage
// 另提供轻量设置项通道（last_model / welcome_seen 等），复用同一存储避免引入 AsyncStorage

const KEY_PREFIX = "tapmate.provider.";
const SETTING_PREFIX = "tapmate.setting.";

// 保存厂商配置（含 API Key）
export async function saveProviderConfig(
  config: ProviderConfig,
): Promise<void> {
  await SecureStore.setItemAsync(
    KEY_PREFIX + config.providerId,
    JSON.stringify(config),
  );
}

// 读取单个厂商配置（不存在返回 null）
export async function loadProviderConfig(
  providerId: string,
): Promise<ProviderConfig | null> {
  const raw = await SecureStore.getItemAsync(KEY_PREFIX + providerId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProviderConfig;
  } catch {
    return null;
  }
}

// 删除厂商配置（退出登录 / 清除 Key）
export async function removeProviderConfig(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PREFIX + providerId);
}

// 加载全部已保存的厂商配置
export async function loadAllProviderConfigs(
  providerIds: string[],
): Promise<Map<string, ProviderConfig>> {
  const map = new Map<string, ProviderConfig>();
  await Promise.all(
    providerIds.map(async (id) => {
      const cfg = await loadProviderConfig(id);
      if (cfg) map.set(id, cfg);
    }),
  );
  return map;
}

// ===== 轻量设置项（非敏感，但需要持久化）=====

// 读取设置项（不存在返回 null）
export async function loadSetting(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(SETTING_PREFIX + key);
}

// 写入设置项（传 null 等效删除）
export async function saveSetting(
  key: string,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await SecureStore.deleteItemAsync(SETTING_PREFIX + key);
    return;
  }
  await SecureStore.setItemAsync(SETTING_PREFIX + key, value);
}
