import type {
  ChatMessage,
  ProviderConfig,
  ProviderDef,
  StreamHandlers,
} from "../types";
import { chatStreamOpenAICompat } from "./openaiCompatible";
import { chatStreamGemini } from "./gemini";

// ===== 对话引擎调度器：按厂商协议分发到对应适配器 =====

// 上下文裁剪上限（字符数启发式，约对应 8k-16k token）：
// 超长会话只保留最近的轮次，避免超出小上下文模型（如 qwen-turbo）的硬限制（audit-32）
const MAX_CONTEXT_CHARS = 16000;

// 流式空闲超时按模型分级（P1-5，v0.6.0）：
// 推理模型思考期可能长时间无 token 增量（deepseek-reasoner 实测 1 分钟+），
// 一律 45s 会误杀；已知推理系放宽到 180s，普通模型维持 45s。
export const REASONING_MODEL_RE =
  /(reasoner|thinking|qwq|deep-research|o1|o3|o4|r1|seed-?think|doubao-?think)/i;
export function idleTimeoutMsFor(modelId: string): number {
  return REASONING_MODEL_RE.test(modelId) ? 180000 : 45000;
}

// 从最新往回累加，超限的旧消息丢弃；最后一条（当前提问）永远保留
export function trimContext(messages: ChatMessage[]): ChatMessage[] {
  let total = 0;
  const kept: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = messages[i].content.length + 8;
    if (kept.length > 0 && total + cost > MAX_CONTEXT_CHARS) break;
    total += cost;
    kept.unshift(messages[i]);
  }
  return kept;
}

// 发起流式对话，返回 abort 函数；不可用时抛错
export function startChatStream(
  provider: ProviderDef,
  config: ProviderConfig,
  modelId: string,
  messages: ChatMessage[],
  handlers: StreamHandlers,
): () => void {
  if (!config.apiKey) {
    handlers.onError(new Error("请先在配置页填写 API Key"));
    return () => {};
  }
  const baseUrl = config.baseUrl || provider.apiBaseUrl || "";
  const context = trimContext(messages);

  if (provider.apiProtocol === "gemini") {
    return chatStreamGemini(
      { apiKey: config.apiKey, baseUrl, model: modelId },
      context,
      handlers,
    );
  }
  // 默认走 OpenAI 兼容协议
  return chatStreamOpenAICompat(
    { apiKey: config.apiKey, baseUrl, model: modelId },
    context,
    handlers,
  );
}
