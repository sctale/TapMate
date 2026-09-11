import EventSource from "react-native-sse";
import type { ChatMessage, StreamHandlers } from "../types";
import { friendlyStreamError } from "./errors";

// ===== Gemini 原生协议适配器（SSE 流式）=====
// 端点：{baseUrl}/models/{model}:streamGenerateContent?alt=sse&key=KEY
// 消息角色映射：user -> user，assistant -> model

export interface GeminiConfig {
  apiKey: string;
  baseUrl: string; // 如 https://generativelanguage.googleapis.com/v1beta
  model: string;
}

// 把本地消息转为 Gemini contents 格式
function toContents(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.content.trim().length > 0 && m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

// 发起流式对话，返回 abort 函数
export function chatStreamGemini(
  config: GeminiConfig,
  messages: ChatMessage[],
  handlers: StreamHandlers,
): () => void {
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/models/${config.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  let full = "";
  let failed = false;

  const es = new EventSource(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: toContents(messages) }),
  });

  es.addEventListener("message", (event) => {
    if (!event.data) return;
    try {
      const json = JSON.parse(event.data);
      // 错误响应：{ error: { message } }
      if (json?.error?.message) {
        failed = true;
        console.warn("[gemini] provider error:", json.error.message);
        handlers.onError(
          new Error(friendlyStreamError({ raw: json.error.message })),
        );
        es.close();
        return;
      }
      const parts: { text?: string; thought?: boolean }[] =
        json?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (!part.text) continue;
        if (part.thought) {
          // 思考摘要（thought parts）
          handlers.onReasoning?.(part.text);
        } else {
          full += part.text;
          handlers.onDelta(part.text);
        }
      }
    } catch {
      // 忽略无法解析的行
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
    console.warn("[gemini] stream error:", status, raw);
    handlers.onError(new Error(friendlyStreamError({ status, raw })));
    es.close();
  });

  es.addEventListener("close", () => {
    if (!failed) handlers.onDone(full);
  });

  return () => es.close();
}
