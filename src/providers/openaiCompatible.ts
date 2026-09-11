import EventSource from "react-native-sse";
import type { ChatMessage, StreamHandlers } from "../types";
import { friendlyStreamError } from "./errors";

// ===== OpenAI 兼容协议适配器（SSE 流式）=====
// 覆盖：OpenAI / DeepSeek / 通义千问（DashScope 兼容模式）/ 豆包（火山方舟）/ OpenRouter 等

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
  handlers: StreamHandlers,
): () => void {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  let full = "";
  let failed = false;

  const es = new EventSource(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: toApiMessages(messages),
      stream: true,
    }),
  });

  es.addEventListener("message", (event) => {
    if (!event.data || event.data === "[DONE]") return;
    try {
      const json = JSON.parse(event.data);
      // 部分厂商错误通过 SSE 事件返回
      if (json?.error?.message) {
        failed = true;
        console.warn("[openai-compat] provider error:", json.error.message);
        handlers.onError(
          new Error(friendlyStreamError({ raw: json.error.message })),
        );
        es.close();
        return;
      }
      const choice = json?.choices?.[0];
      const delta: string = choice?.delta?.content ?? "";
      if (delta) {
        full += delta;
        handlers.onDelta(delta);
      }
      // 推理模型思考过程：DeepSeek=reasoning_content，部分厂商=reasoning
      const reasoning: string =
        choice?.delta?.reasoning_content ?? choice?.delta?.reasoning ?? "";
      if (reasoning) handlers.onReasoning?.(reasoning);
    } catch {
      // 忽略无法解析的心跳/注释行
    }
  });

  es.addEventListener("error", (event) => {
    failed = true;
    const ev = event as {
      message?: string;
      type?: string;
      xhrStatus?: number | string;
    };
    const status = typeof ev.xhrStatus === "number" ? ev.xhrStatus : undefined;
    const raw = ev.message || ev.type || "";
    console.warn("[openai-compat] stream error:", status, raw);
    handlers.onError(new Error(friendlyStreamError({ status, raw })));
    es.close();
  });

  es.addEventListener("close", () => {
    if (!failed) handlers.onDone(full);
  });

  return () => es.close();
}
