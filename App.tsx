import React, { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "./src/constants";
import HomeScreen from "./src/screens/HomeScreen";
import ConfigScreen from "./src/screens/ConfigScreen";
import WebChatScreen from "./src/screens/WebChatScreen";
import { ProvidersProvider } from "./src/state/ProvidersContext";

// TapMate 根组件（v0.4.0 悬浮球版）：对话即首页，无顶部 chrome、无底部 dock
// 全部功能（模型切换/并发对比/新对话/历史/配置入口）收进右侧悬浮球；配置页从球菜单进入
// Web 覆盖层仅用于首次官网登录；确认登录后自动回首页并进入嵌入式对话
export default function App() {
  const [showConfig, setShowConfig] = useState(false);
  const [webProviderId, setWebProviderId] = useState<string | null>(null);
  // 登录确认后待首页自动打开嵌入对话的厂商（HomeScreen 消费后清空）
  const [inlineWebProvider, setInlineWebProvider] = useState<string | null>(
    null,
  );

  // 配置页时 Android 返回键 = 回到对话（而不是退出 App）
  useEffect(() => {
    if (!showConfig) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setShowConfig(false);
      return true;
    });
    return () => sub.remove();
  }, [showConfig]);

  return (
    <SafeAreaProvider>
      <ProvidersProvider>
        <View style={styles.root}>
          <StatusBar style="dark" />
          {/* 对话页常驻挂载（流式对话切去配置页也不中断） */}
          <View style={[styles.page, showConfig && styles.pageHidden]}>
            <HomeScreen
              inlineWebProviderId={inlineWebProvider}
              onInlineWebConsumed={() => setInlineWebProvider(null)}
              onOpenConfig={() => setShowConfig(true)}
            />
          </View>
          {showConfig ? (
            <View style={styles.page}>
              <ConfigScreen onOpenWeb={setWebProviderId} />
            </View>
          ) : null}
          {/* 登录容器覆盖层（仅登录场景；对话在首页嵌入完成） */}
          {webProviderId ? (
            <WebChatScreen
              providerId={webProviderId}
              onClose={() => setWebProviderId(null)}
              onConfirmed={(id) => {
                setWebProviderId(null);
                setShowConfig(false);
                setInlineWebProvider(id);
              }}
            />
          ) : null}
        </View>
      </ProvidersProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  page: {
    flex: 1,
  },
  pageHidden: {
    display: "none",
  },
});
