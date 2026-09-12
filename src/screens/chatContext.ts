// ===== 对话上下文构建（纯逻辑，无 RN 依赖，可单测）=====
// v0.5.2 从 HomeScreen 抽出：修复 retryOne 上下文重复 Bug（审查 P0-2）

import type { ChatMessage, ModelRef } from "../types";

// 某模型的上下文：历史用户消息 + 该模型自己的既往回答（对比模式各流互不污染）
// userMsg 为本次提问，永远只追加一次（调用方保证它不在 history 中）
export function contextFor(
  history: ChatMessage[],
  t: ModelRef,
  userMsg: ChatMessage,
): ChatMessage[] {
  const mine = history.filter(
    (m) =>
      m.role === "user" ||
      (m.role === "assistant" &&
        m.modelId === t.modelId &&
        (m.providerId ?? t.providerId) === t.providerId),
  );
  return [...mine, userMsg];
}

// 单条回答重试的上下文：target 之前的消息（剔除 target 自身与紧邻的前一条用户消息，
// 后者作为 userMsg 由 contextFor 追加——不剔除会重复发送，v0.5.2 回归修复）。
// 找不到 target 或其前面的用户消息时返回 null
export function retryContext(
  messages: ChatMessage[],
  targetId: string,
  t: ModelRef,
): ChatMessage[] | null {
  const idx = messages.findIndex((m) => m.id === targetId);
  if (idx < 0) return null;
  let u = idx - 1;
  while (u >= 0 && messages[u].role !== "user") u--;
  if (u < 0) return null;
  const userMsg = messages[u];
  const history = messages
    .slice(0, idx)
    .filter((m) => m.id !== targetId && m.id !== userMsg.id);
  return contextFor(history, t, userMsg);
}
