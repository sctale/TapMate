import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from './src/constants';
import TabBar, { TabKey } from './src/components/TabBar';
import HomeScreen from './src/screens/HomeScreen';
import ConfigScreen from './src/screens/ConfigScreen';
import WebChatScreen from './src/screens/WebChatScreen';
import { ProvidersProvider } from './src/state/ProvidersContext';

// TapMate 根组件：底部双 Tab（对话 / 配置），暖米白背景
// Web 容器（官网登录/对话）以全屏覆盖层呈现，覆盖在 Tab 之上
export default function App() {
  const [tab, setTab] = useState<TabKey>('home');
  const [webProviderId, setWebProviderId] = useState<string | null>(null);

  return (
    <SafeAreaProvider>
      <ProvidersProvider>
        <View style={styles.root}>
          <StatusBar style="dark" />
          {/* 两个页面常驻挂载，切换 Tab 不销毁状态（对话进行中切走不中断） */}
          <View style={[styles.page, tab !== 'home' && styles.pageHidden]}>
            <HomeScreen onOpenWeb={setWebProviderId} />
          </View>
          <View style={[styles.page, tab !== 'config' && styles.pageHidden]}>
            <ConfigScreen onOpenWeb={setWebProviderId} />
          </View>
          <TabBar current={tab} onChange={setTab} />
          {/* Web 容器覆盖层（第 5 轮实现完整逻辑，当前为占位） */}
          {webProviderId ? (
            <WebChatScreen providerId={webProviderId} onClose={() => setWebProviderId(null)} />
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
    display: 'none',
  },
});
