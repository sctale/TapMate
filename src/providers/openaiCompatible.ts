import EventSource from 'react-native-sse';
import type { ChatMessage, StreamHandlers } from '../types';

// ===== OpenAI 兼容协议适配器（SSE 流式）=====
// 覆盖：OpenAI / DeepSeek / Kimi / 智谱 / 豆包（火山方舟）/ OpenRouter 等

export interface OpenAICompatConfig {
  apiKey: string;
  baseUrl: string; // 如 https://api.openai.com/v1
  model: string;
}

// 把本地消息转为 API 请求体格式
function toApiMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
}

// 发起流式对话，返回 abort 函数
export function chatStreamOpenAICompat(
  config: OpenAICompatConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers
): () => void {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  let full = '';
  let failed = false;

  const es = new EventSource(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: toApiMessages(messages),
      stream: true,
    }),
  });

  es.addEventListener('message', (event) => {
    if (!event.data || event.data === '[DONE]') return;
    try {
      const json = JSON.parse(event.data);
      // 部分厂商错误通过 SSE 事件返回
      if (json?.error?.message) {
        failed = true;
        handlers.onError(new Error(json.error.message));
        es.close();
        return;
      }
      const delta: string = json?.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        handlers.onDelta(delta);
      }
    } catch {
      // 忽略无法解析的心跳/注释行
    }
  });

  es.addEventListener('error', (event) => {
    failed = true;
    const msg = 'message' in event ? event.message : `HTTP ${'xhrStatus' in event ? event.xhrStatus : ''}`;
    handlers.onError(new Error(`连接失败：${msg || '网络错误'}`));
    es.close();
  });

  es.addEventListener('close', () => {
    if (!failed) handlers.onDone(full);
  });

  return () => es.close();
}
