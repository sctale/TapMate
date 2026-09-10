# 更新日志

## [0.1.0] - 2026-09-10

首个版本：多模型聚合对话 App

### 新功能

- **双通道接入**：网页登录（应用内 WebView）/ 浏览器登录（Chrome Custom Tabs，共享 Chrome 登录态）/ API Key 三种接入方式，优先官方通道、减少 API 费用
- **内置 6 家厂商**：ChatGPT、Gemini、DeepSeek、Kimi、智谱清言、豆包；国内厂商统一走 OpenAI 兼容协议
- **统一对话页**：模型切换器（厂商色点胶囊）、SSE 流式渲染（120ms 节流）、消息气泡（用户靛蓝 / 模型白卡）
- **配置页**：厂商卡片列表、通道切换、API Key 保存并自动测试连通性、官网登录入口
- **会话管理**：本地持久化（expo-sqlite）、首条消息自动命名、历史会话列表与删除
- **安全**：API Key 加密存储（expo-secure-store / Android Keystore），纯客户端无后端

### 体验

- UI 延续 Tap 系列治愈暖色风格（暖米白背景 + 靛蓝强调色 + 悬浮胶囊导航，对齐 TapLedger）
