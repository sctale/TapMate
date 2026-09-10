import type { ChatMessage, ProviderConfig, ProviderDef, StreamHandlers } from '../types';
import { chatStreamOpenAICompat } from './openaiCompatible';
import { chatStreamGemini } from './gemini';

// ===== 对话引擎调度器：按厂商协议分发到对应适配器 =====

// 发起流式对话，返回 abort 函数；不可用时抛错
export function startChatStream(
  provider: ProviderDef,
  config: ProviderConfig,
  modelId: string,
  messages: ChatMessage[],
  handlers: StreamHandlers
): () => void {
  if (!config.apiKey) {
    handlers.onError(new Error('请先在配置页填写 API Key'));
    return () => {};
  }
  const baseUrl = config.baseUrl || provider.apiBaseUrl || '';

  if (provider.apiProtocol === 'gemini') {
    return chatStreamGemini({ apiKey: config.apiKey, baseUrl, model: modelId }, messages, handlers);
  }
  // 默认走 OpenAI 兼容协议
  return chatStreamOpenAICompat(
    { apiKey: config.apiKey, baseUrl, model: modelId },
    messages,
    handlers
  );
}
