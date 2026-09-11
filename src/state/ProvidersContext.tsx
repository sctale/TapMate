import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ProviderConfig } from "../types";
import { PROVIDERS } from "../providers/registry";
import {
  loadAllProviderConfigs,
  saveProviderConfig,
  removeProviderConfig,
} from "../secure/credentials";
import { clearModelIds, getModelIds, setModelIds } from "../database/chatDB";

// ===== 厂商配置全局状态（配置页与对话页共享）=====
// dynamicModels：Key 验证成功后拉取的账号真实模型清单（存 SQLite），缺省回落注册表 defaultModels

interface ProvidersState {
  configs: Map<string, ProviderConfig>; // providerId -> 配置
  loaded: boolean; // 是否已从加密存储加载完成
  dynamicModels: Map<string, string[]>; // providerId -> 动态模型 id 列表
  updateConfig: (config: ProviderConfig) => Promise<void>;
  removeConfig: (providerId: string) => Promise<void>;
  syncModelIds: (providerId: string, ids: string[] | null) => Promise<void>;
}

const Ctx = createContext<ProvidersState>({
  configs: new Map(),
  loaded: false,
  dynamicModels: new Map(),
  updateConfig: async () => {},
  removeConfig: async () => {},
  syncModelIds: async () => {},
});

export function ProvidersProvider({ children }: { children: React.ReactNode }) {
  const [configs, setConfigs] = useState<Map<string, ProviderConfig>>(
    new Map(),
  );
  const [loaded, setLoaded] = useState(false);
  const [dynamicModels, setDynamicModels] = useState<Map<string, string[]>>(
    new Map(),
  );

  // 启动时从加密存储加载配置 + 从 SQLite 加载动态模型清单
  useEffect(() => {
    (async () => {
      const ids = PROVIDERS.map((p) => p.id);
      const [map, ...modelLists] = await Promise.all([
        loadAllProviderConfigs(ids),
        ...ids.map((id) => getModelIds(id).catch(() => null)),
      ]);
      setConfigs(map);
      const dm = new Map<string, string[]>();
      ids.forEach((id, i) => {
        const list = modelLists[i];
        if (list && list.length) dm.set(id, list);
      });
      setDynamicModels(dm);
      setLoaded(true);
    })();
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
    await clearModelIds(providerId).catch(() => {});
    setConfigs((prev) => {
      const next = new Map(prev);
      next.delete(providerId);
      return next;
    });
    setDynamicModels((prev) => {
      const next = new Map(prev);
      next.delete(providerId);
      return next;
    });
  }, []);

  // 同步某厂商的动态模型清单（null=清除回落默认）
  const syncModelIds = useCallback(
    async (providerId: string, ids: string[] | null) => {
      if (ids && ids.length) {
        await setModelIds(providerId, ids);
        setDynamicModels((prev) => {
          const next = new Map(prev);
          next.set(providerId, ids);
          return next;
        });
      } else {
        await clearModelIds(providerId);
        setDynamicModels((prev) => {
          const next = new Map(prev);
          next.delete(providerId);
          return next;
        });
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      configs,
      loaded,
      dynamicModels,
      updateConfig,
      removeConfig,
      syncModelIds,
    }),
    [configs, loaded, dynamicModels, updateConfig, removeConfig, syncModelIds],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProviders(): ProvidersState {
  return useContext(Ctx);
}

// 判断某厂商是否"可用"（web/customTabs 通道已标记登录，或 api 通道有 Key）
export function isProviderReady(cfg: ProviderConfig | undefined): boolean {
  if (!cfg || !cfg.enabled) return false;
  if (cfg.channel === "api") return !!cfg.apiKey;
  return !!cfg.webLoggedIn;
}
