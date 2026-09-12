# TapMate

一款"多模型聚合对话"Android 应用——一个 App 里自由切换不同大模型，减少在不同 AI 软件之间的来回切换。

Tap 系列应用之一，UI 延续 [TapLedger（一点账本）](https://github.com/sctale/TapLedger) 的治愈暖色设计风格。

## 设计理念

> **聊任意 AI，只开一个 App**：选择厂商 → 输入 → 出发，免切换、免费额度优先、隐私本地存。

- 暖米白背景 + 柔和强调色（靛蓝对话气泡 / 厂商色点胶囊），大留白、圆角卡片
- 双通道接入，**优先官方通道**：能登录官网就用订阅额度（不产生 API 费用），否则走 API Key
- 隐私优先：API Key 加密存储（Android Keystore），纯客户端无后端，请求直连厂商官方端点

## 功能特性

- **多模型聚合**：5 家厂商内置——ChatGPT、Gemini、DeepSeek、通义千问、豆包；国内厂商统一走 OpenAI 兼容协议，模型一键切换（厂商色点胶囊）
- **官网通道 = 首页嵌入对话**：选官网通道模型后，官网聊天界面（含输入框）直接嵌入首页内容区，输在首页、看在首页，全程零跳转；顶栏提供 ⟳ 刷新 / ‹ 后退 / ✕ 退出
  - 🌐 **应用内官网**：WebView 打开官方域名，登录后免费用订阅额度；登录容器只承担首次登录职责，确认后自动切回首页进入对话
  - 🖥️ **系统浏览器（customTabs）**：Chrome Custom Tabs 打开官网，共享系统 Chrome 登录态（Gemini 官方合规方案；插在首页的合规引导卡说明 Google 政策并提供一键打开）
  - 🔑 **API Key**：官方 API + 统一原生对话界面（SSE 流式输出、本地历史、自定义 Base URL）
- **流式对话**：SSE 流式渲染（120ms 节流），可中断在途回答（发送键变「■ 停止」），新对话 / 换模型 / 开历史不再被旧流锁住
- **Markdown 渲染**：代码块、标题、列表、引用、加粗/斜体/行内代码/链接（零依赖轻量渲染器，未覆盖语法自动降级为文本）
- **消息能力强操作**：长按复制 / 重新生成 / 错误回答一键重试；空态气泡显示「正在思考…」跳点指示
- **智能滚动**：仅贴近底部才跟随流式更新，上翻回看不被拽回底部，并出现「回到底部 ↓」悬浮按钮
- **会话管理**：历史本地持久化（expo-sqlite）、首条消息自动命名、搜索 + 今天/昨天/7 天内/更早分组、删除二次确认
- **异常兜底**：官方域名打不开时错误卡片 + 重试 + 「用系统浏览器打开」降级；流式 45s 空闲自动按错误收尾；401/429/5xx/超时分别映射可行动文案；长会话自动裁剪上下文
- **记住上次模型**：冷启动恢复上次使用的模型；还支持「解绑此厂商」换账号

## 技术栈

- Expo SDK 56 + React Native 0.85 + TypeScript（strict）
- react-native-webview（官网通道）+ expo-web-browser（Custom Tabs 通道）
- react-native-sse（流式对话）+ expo-secure-store（凭证加密）+ expo-sqlite（会话存储）
- expo-clipboard（复制消息/草稿）

## 安装与运行

```bash
npm install
npm start          # 启动 Metro
npm run android    # 构建并安装到设备
npm test           # vitest 单测
```

## 下载安装

正式版 APK 在 [GitHub Releases](https://github.com/sctale/TapMate/releases) 页面下载（`TapMate-v0.4.1.apk`，包名 `com.tapmate.app`）。

## 构建与发布

**发布流程：全部本地构建**，产物推送 GitHub Release（不使用 GitHub Actions）。

### 一键发布脚本

```powershell
# 1. 完成代码改动，并在 CHANGELOG.md 顶部新增 ## [X.Y.Z] 条目
# 2. 一键发布：自动 patch +1（或 -Version 0.2.0 指定版本）
powershell -ExecutionPolicy Bypass -File scripts\release-app.ps1
```

脚本自动完成全链路：版本号同步（app.json / package.json / package-lock.json / android build.gradle / README）→ 类型检查 → 本地构建 release APK → `aapt` 校验 versionName/versionCode → 复制到根目录 `TapMate-vX.Y.Z.apk` → git 提交推送 → 创建 GitHub Release 并上传 APK（说明取自 CHANGELOG 最新条目）。

### 手动构建 APK（调试用）

```bash
npx expo prebuild --platform android
cd android
.\gradlew assembleRelease
# 输出：android\app\build\outputs\apk\release\app-release.apk
```

### 版本号管理

版本号单一数据源为 `app.json`，发布脚本自动同步（app.json / package.json / package-lock.json / android build.gradle / README），也可手动：

```bash
node scripts/sync-version.js 0.2.1
```

## 项目结构

```
src/
├── components/         # UI 组件
│   ├── MessageBubble.tsx       # 消息气泡（用户靛蓝 / 模型白卡，长按菜单）
│   ├── ModelSwitcher.tsx       # 模型切换器（厂商色点胶囊，选中滚入视野）
│   ├── SessionHistory.tsx      # 历史会话（搜索 + 按时间分组）
│   ├── InlineWebChat.tsx       # 官网通道首页嵌入式对话（v0.2.1）
│   ├── MarkdownText.tsx        # 轻量 Markdown 渲染器（代码/标题/列表…）
│   ├── TabBar.tsx              # 底部导航（对话 / 配置）
│   ├── Toast.tsx               # 全局轻提示
│   └── WelcomeModal.tsx        # 首启双通道说明卡（一次性）
├── screens/            # 页面
│   ├── HomeScreen.tsx          # 对话页（输入 + 流式渲染 + 官网嵌入）
│   ├── ConfigScreen.tsx        # 配置页（厂商卡片/通道切换/API Key/登录入口）
│   └── WebChatScreen.tsx       # 官网登录容器（WebView + Custom Tabs）
├── providers/          # 厂商注册表 + 对话引擎
│   ├── registry.ts             # 厂商注册表（内置 6 家）
│   ├── openaiCompatible.ts     # OpenAI 兼容适配器（国内厂商）
│   ├── gemini.ts               # Gemini 适配器
│   ├── chatEngine.ts           # 对话引擎（协议分发 + 上下文裁剪 + 流式调度）
│   ├── apiTest.ts              # API Key 连通性测试
│   ├── errors.ts               # 错误语义化映射
│   ├── webConfig.ts            # 官网 Web 容器共享配置（v0.2.1）
│   └── __tests__/              # chatEngine 单测
├── secure/             # 凭证加密
│   └── credentials.ts          # API Key 存取（expo-secure-store / Keystore）
├── database/           # 数据层
│   └── chatDB.ts               # 会话与消息持久化（expo-sqlite）
├── state/              # 全局状态
│   └── ProvidersContext.tsx    # 厂商配置全局状态
├── constants/          # 设计令牌（配色/间距/圆角/字号/设置 key）
└── types/              # 类型定义
scripts/
├── sync-version.js             # 版本号三处同步
└── release-app.ps1             # APP 一键发布脚本（版本同步→构建→校验→Release）
```

## 设计令牌（与 Tap 系列同源）

| Token | 值 | 说明 |
|---|---|---|
| 背景 | `#F8F6F3` | 暖米白 |
| 卡片 | `#FFFFFF` / `#FFF9F5` | 白 / 暖色卡片底 |
| 主文字 | `#2D2D2D` / `#6E6E6E` | 深灰 / 次级 |
| 强调色 | `#7986CB` | 柔和靛蓝（用户气泡） |
| 链接成功 | `#81C784` | 薄荷绿 |
| 危险 | `#E57373` | 警示红 |
| 圆角 | 8 / 12 / 16 / 20 / 24 / 胶囊 | 统一设计令牌 |
| 间距 | 4 / 8 / 16 / 24 / 32 / 48 | 大留白风格 |

## 已知限制

- Google 禁止 WebView 内 OAuth 登录，Gemini 网页通道自动走 Chrome Custom Tabs + 首页合规引导卡
- ChatGPT 网页登录受 Cloudflare 人机验证影响，个别设备可能需要改用 API 通道
- 网页通道的登录态由官网自身的 Cookie 管理，WebView 系统级 CookieManager 跨启动自动持久化，无需应用层干预

## 版本

当前版本：0.4.1