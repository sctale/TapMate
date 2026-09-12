import { describe, expect, it } from "vitest";
import { contextFor, retryContext } from "../chatContext";
import type { ChatMessage, ModelRef } from "../../types";

const msg = (
  id: string,
  role: ChatMessage["role"],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({ id, role, content, createdAt: 0, ...extra });

const deepseek: ModelRef = {
  providerId: "deepseek",
  modelId: "deepseek-chat",
  label: "deepseek-chat",
};
const qwen: ModelRef = {
  providerId: "qwen",
  modelId: "qwen-plus",
  label: "qwen-plus",
};

describe("contextFor（发送路径上下文）", () => {
  it("只保留用户消息 + 该模型自己的既往回答", () => {
    const history = [
      msg("u1", "user", "问题1"),
      msg("a1", "assistant", "ds答1", {
        modelId: "deepseek-chat",
        providerId: "deepseek",
      }),
      msg("b1", "assistant", "qwen答1", {
        modelId: "qwen-plus",
        providerId: "qwen",
      }),
    ];
    const ctx = contextFor(history, deepseek, msg("u2", "user", "问题2"));
    expect(ctx.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });
});

describe("retryContext（v0.5.2 回归：P0-2 上下文重复修复）", () => {
  const history = [
    msg("u1", "user", "问题1"),
    msg("a1", "assistant", "ds答1", {
      modelId: "deepseek-chat",
      providerId: "deepseek",
    }),
    msg("u2", "user", "问题2"),
    msg("a2", "assistant", "旧回答", {
      id: "a2",
      modelId: "deepseek-chat",
      providerId: "deepseek",
    }),
  ];

  it("重试最后一条回答：提问只出现一次（旧实现会重复）", () => {
    const ctx = retryContext(history, "a2", deepseek)!;
    expect(ctx).not.toBeNull();
    const userMsgs = ctx.filter((m) => m.role === "user");
    expect(userMsgs.map((m) => m.id)).toEqual(["u1", "u2"]);
    // 被重试的旧回答本身不在上下文中
    expect(ctx.some((m) => m.id === "a2")).toBe(false);
    // 其它模型的既往回答不混入
    expect(ctx.some((m) => m.id === "b1")).toBe(false);
    expect(ctx.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("对比模式：只保留该模型自己的既往回答", () => {
    const withOther = [
      ...history.slice(0, 3),
      msg("q1", "assistant", "qwen答", {
        modelId: "qwen-plus",
        providerId: "qwen",
      }),
      msg("a2", "assistant", "ds旧答", {
        modelId: "deepseek-chat",
        providerId: "deepseek",
      }),
    ];
    const ctx = retryContext(withOther, "a2", deepseek)!;
    expect(ctx.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
    const ctxQ = retryContext(withOther, "q1", qwen)!;
    expect(ctxQ.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("target 不存在或前面没有用户消息 → null", () => {
    expect(retryContext(history, "nope", deepseek)).toBeNull();
    expect(
      retryContext(
        [msg("a0", "assistant", "x", { modelId: "m", providerId: "p" })],
        "a0",
        deepseek,
      ),
    ).toBeNull();
  });
});
