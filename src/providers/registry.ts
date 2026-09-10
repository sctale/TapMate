import type { ProviderDef } from '../types';

// ===== 厂商注册表（静态定义）=====
// 通道策略（调研结论）：
// - Gemini：首选 customTabs（Google 禁止 WebView OAuth，Custom Tabs 是官方合规方案且共享 Chrome 登录态）
// - ChatGPT：首选 web（OpenAI 无 WebView 禁令，干净 Chrome UA + Cookie 持久化可行），customTabs 降级
// - 国内厂商：首选 web（官网登录免费用订阅额度），均支持 OpenAI 兼容 API
export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'ChatGPT',
    emoji: '🟢',
    color: '#10A37F',
    webUrl: 'https://chatgpt.com/',
    preferredChannel: 'web',
    apiProtocol: 'openai-compatible',
    apiBaseUrl: 'https://api.openai.com/v1',
    apiDocsUrl: 'https://platform.openai.com/api-keys',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  {
    id: 'google',
    name: 'Gemini',
    emoji: '✨',
    color: '#4285F4',
    webUrl: 'https://gemini.google.com/app',
    preferredChannel: 'customTabs',
    apiProtocol: 'gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiDocsUrl: 'https://aistudio.google.com/apikey',
    defaultModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    emoji: '🐋',
    color: '#4D6BFE',
    webUrl: 'https://chat.deepseek.com/',
    preferredChannel: 'web',
    apiProtocol: 'openai-compatible',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    apiDocsUrl: 'https://platform.deepseek.com/api_keys',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    emoji: '🌙',
    color: '#005AFF',
    webUrl: 'https://kimi.moonshot.cn/',
    preferredChannel: 'web',
    apiProtocol: 'openai-compatible',
    apiBaseUrl: 'https://api.moonshot.cn/v1',
    apiDocsUrl: 'https://platform.moonshot.cn/console/api-keys',
    defaultModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    id: 'zhipu',
    name: '智谱清言',
    emoji: '🧠',
    color: '#3B5BDB',
    webUrl: 'https://chatglm.cn/main/alltoolsdetail',
    preferredChannel: 'web',
    apiProtocol: 'openai-compatible',
    apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiDocsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    defaultModels: ['glm-4-flash', 'glm-4-plus'],
  },
  {
    id: 'doubao',
    name: '豆包',
    emoji: '🫘',
    color: '#00D68F',
    webUrl: 'https://www.doubao.com/chat/',
    preferredChannel: 'web',
    apiProtocol: 'openai-compatible',
    apiBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiDocsUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    defaultModels: ['doubao-1-5-pro-32k'],
  },
];

// 按 id 查厂商
export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
