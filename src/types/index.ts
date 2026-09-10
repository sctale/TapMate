// ===== TapMate 全局类型定义 =====

// 接入通道类型
export type ChannelType =
  | 'web' // 应用内 WebView 加载官网（干净 Chrome UA + Cookie 持久化）
  | 'customTabs' // Chrome Custom Tabs（共享系统 Chrome 登录态，Google 官方合规方案）
  | 'api'; // 官方 API Key 接入（统一原生对话 UI）

// API 协议类型（api 通道下细分）
export type ApiProtocol = 'openai-compatible' | 'gemini';

// 厂商定义（注册表静态部分）
export interface ProviderDef {
  id: string; // 唯一标识，如 'openai'
  name: string; // 展示名，如 'ChatGPT'
  emoji: string; // 图标 emoji（Tap 系列风格）
  color: string; // 厂商主题色（切换器色点）
  webUrl: string; // 官网对话页地址（web/customTabs 通道用）
  preferredChannel: ChannelType; // 首选接入通道
  apiProtocol?: ApiProtocol; // api 通道协议
  apiBaseUrl?: string; // API 端点（可被用户自定义覆盖）
  apiDocsUrl?: string; // 获取 API Key 的指引页
  defaultModels: string[]; // 默认模型列表
}

// 用户配置的厂商凭证（持久化部分）
export interface ProviderConfig {
  providerId: string;
  enabled: boolean; // 是否启用
  channel: ChannelType; // 实际使用的通道
  apiKey?: string; // API Key（加密存储，此处为解密后运行时形态）
  baseUrl?: string; // 自定义 Base URL（兼容中转端点）
  webLoggedIn?: boolean; // web/customTabs 通道是否已登录（启发式标记）
}

// 模型实例（厂商 + 具体模型）
export interface ModelRef {
  providerId: string;
  modelId: string; // 如 'gpt-4o' / 'deepseek-chat'
  label: string; // 展示名
}

// 聊天消息
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number; // 毫秒时间戳
  modelId?: string; // assistant 消息记录所用模型
  error?: string; // 失败原因（展示用）
}

// 会话
export interface ChatSession {
  id: string;
  title: string;
  providerId: string; // 会话绑定的厂商
  modelId: string; // 会话绑定的模型
  createdAt: number;
  updatedAt: number;
}

// 流式回调
export interface StreamHandlers {
  onDelta: (text: string) => void; // 增量文本
  onDone: (fullText: string) => void; // 完成
  onError: (err: Error) => void; // 失败
}
