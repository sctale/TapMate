import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProviderConfig } from '../types';
import { PROVIDERS } from '../providers/registry';
import { loadAllProviderConfigs, saveProviderConfig, removeProviderConfig } from '../secure/credentials';

// ===== 厂商配置全局状态（配置页与对话页共享）=====

interface ProvidersState {
  configs: Map<string, ProviderConfig>; // providerId -> 配置
  loaded: boolean; // 是否已从加密存储加载完成
  updateConfig: (config: ProviderConfig) => Promise<void>;
  removeConfig: (providerId: string) => Promise<void>;
}

const Ctx = createContext<ProvidersState>({
  configs: new Map(),
  loaded: false,
  updateConfig: async () => {},
  removeConfig: async () => {},
});

export function ProvidersProvider({ children }: { children: React.ReactNode }) {
  const [configs, setConfigs] = useState<Map<string, ProviderConfig>>(new Map());
  const [loaded, setLoaded] = useState(false);

  // 启动时从加密存储加载全部配置
  useEffect(() => {
    loadAllProviderConfigs(PROVIDERS.map((p) => p.id)).then((map) => {
      setConfigs(map);
      setLoaded(true);
    });
  }, []);

  const updateConfig = useCallback(async (config: ProviderConfig) => {
    await saveProviderConfig(config);
    setConfigs((prev) => {
      const next = new Map(prev);
      next.set(config.providerId, config);
      return next;
    });
  }, []);

  const removeConfig = useCallback(async (providerId: string) => {
    await removeProviderConfig(providerId);
    setConfigs((prev) => {
      const next = new Map(prev);
      next.delete(providerId);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ configs, loaded, updateConfig, removeConfig }),
    [configs, loaded, updateConfig, removeConfig]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProviders(): ProvidersState {
  return useContext(Ctx);
}

// 判断某厂商是否"可用"（web/customTabs 通道已标记登录，或 api 通道有 Key）
export function isProviderReady(cfg: ProviderConfig | undefined): boolean {
  if (!cfg || !cfg.enabled) return false;
  if (cfg.channel === 'api') return !!cfg.apiKey;
  return !!cfg.webLoggedIn;
}
