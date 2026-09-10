import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "./src/constants";
import TabBar, { TabKey } from "./src/components/TabBar";
import HomeScreen from "./src/screens/HomeScreen";
import ConfigScreen from "./src/screens/ConfigScreen";
import WebChatScreen from "./src/screens/WebChatScreen";
import { ProvidersProvider } from "./src/state/ProvidersContext";

// TapMate 根组件：底部双 Tab（对话 / 配置），暖米白背景
// Web 覆盖层仅用于首次官网登录；确认登录后自动切回首页并进入嵌入式对话
export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [webProviderId, setWebProviderId] = useState<string | null>(null);
  // 登录确认后待首页自动打开嵌入对话的厂商（HomeScreen 消费后清空）
  const [inlineWebProvider, setInlineWebProvider] = useState<string | null>(
    null,
  );

  return (
    <SafeAreaProvider>
      <ProvidersProvider>
        <View style={styles.root}>
          <StatusBar style="dark" />
          {/* 两个页面常驻挂载，切换 Tab 不销毁状态（对话进行中切走不中断） */}
          <View style={[styles.page, tab !== "home" && styles.pageHidden]}>
            <HomeScreen
              inlineWebProviderId={inlineWebProvider}
              onInlineWebConsumed={() => setInlineWebProvider(null)}
            />
          </View>
          <View style={[styles.page, tab !== "config" && styles.pageHidden]}>
            <ConfigScreen onOpenWeb={setWebProviderId} />
          </View>
          <TabBar current={tab} onChange={setTab} />
          {/* 登录容器覆盖层（仅登录场景；对话在首页嵌入完成） */}
          {webProviderId ? (
            <WebChatScreen
              providerId={webProviderId}
              onClose={() => setWebProviderId(null)}
              onConfirmed={(id) => {
                setWebProviderId(null);
                setTab("home");
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
