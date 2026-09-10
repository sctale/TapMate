# TapMate

多模型聚合对话 Android 应用 —— 一个 App 里自由切换不同大模型，减少在不同大模型软件之间的来回切换。

Tap 系列应用之一，UI 延续系列治愈暖色风格（对齐 TapLedger）。

## 核心特性

- **双通道接入，优先官方通道**
  - 🌐 **网页登录**：应用内 WebView 打开模型官网，登录自己的账号，免费用订阅额度（不产生 API 费用）
  - 🖥️ **浏览器登录**：Chrome Custom Tabs 打开官网，共享系统 Chrome 登录态（Gemini 官方合规方案）
  - 🔑 **API Key**：官方 API + 统一原生对话界面（流式输出、本地历史、跨模型切换）
- **内置厂商**：ChatGPT、Gemini、DeepSeek、Kimi、智谱清言、豆包
- **统一对话体验**：模型一键切换、SSE 流式渲染、会话历史本地持久化（expo-sqlite）
- **隐私安全**：API Key 加密存储（Android Keystore），纯客户端无后端，请求直连厂商官方端点

## 技术栈

- Expo SDK 56 + React Native 0.85 + TypeScript
- react-native-webview（Web 通道）+ expo-web-browser（Custom Tabs 通道）
- react-native-sse（流式对话）+ expo-secure-store（凭证加密）+ expo-sqlite（会话存储）

## 开发运行

```bash
npm install
npm start          # 启动 Metro
npm run android    # 构建并安装到设备
```

## 下载安装

正式版 APK 在 [GitHub Releases](https://github.com/sctale/TapMate/releases) 页面下载（`TapMate-v0.1.1.apk`，包名 `com.tapmate.app`）。

## 构建与发布

**发布流程：全部本地构建**，产物推送 GitHub Release（不使用 GitHub Actions）。

### 一键发布脚本

```bash
# 1. 在 CHANGELOG.md 补充目标版本条目（## [X.Y.Z] - 日期）
# 2. 一键发布：自动 patch +1（或 -Version 0.2.0 指定版本）
powershell -ExecutionPolicy Bypass -File scripts\release-app.ps1
```

脚本自动完成全链路：版本号同步（app.json / package.json / package-lock.json / android build.gradle / README）→ 类型检查 → 本地构建 release APK → `aapt` 校验 versionName/versionCode → 复制到根目录 `TapMate-vX.Y.Z.apk` → git 提交推送 → 创建 GitHub Release 并上传 APK（说明取自 CHANGELOG 最新条目）。

### 从源码构建 APK

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

### 版本号管理

版本号单一数据源为 `app.json`，发布脚本自动同步三处（app.json / package.json / package-lock.json），也可手动：

```bash
node scripts/sync-version.js 0.2.0
```

## 项目结构

```
scripts/
  sync-version.js         # 版本号三处同步
  release-app.ps1         # APP 一键发布脚本（版本同步→构建→校验→Release）
src/
  constants/        # Tap 系列设计 token（色板/间距/圆角/字号）
  types/            # 全局类型
  providers/        # 厂商注册表 + API 适配器（OpenAI 兼容 / Gemini）
  secure/           # API Key 加密存取
  database/         # 会话与消息持久化
  state/            # 厂商配置全局状态
  screens/          # 对话页 / 配置页 / Web 容器
  components/       # TabBar / 模型切换器 / 消息气泡 / 历史会话
```

## 已知限制

- Google 禁止 WebView 内 OAuth 登录，Gemini 网页通道自动走 Chrome Custom Tabs
- ChatGPT 网页登录受 Cloudflare 人机验证影响，个别设备可能需要改用 API 通道
- 网页通道的登录态由官网自身的 Cookie 管理，WebView 系统级 CookieManager 跨启动自动持久化，无需应用层干预
