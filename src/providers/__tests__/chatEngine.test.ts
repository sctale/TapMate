import { describe, expect, it, vi } from "vitest";

import { trimContext } from "../chatEngine";
import { friendlyStreamError, friendlyTestReason } from "../errors";
import type { ChatMessage } from "../../types";

// chatEngine 顶部 import 了 SSE 适配器（依赖 react-native-sse），纯函数测试无需真实网络层
// vi.mock 会被 vitest 自动提升到 import 之前执行
vi.mock("../openaiCompatible", () => ({ chatStreamOpenAICompat: vi.fn() }));
vi.mock("../gemini", () => ({ chatStreamGemini: vi.fn() }));

const msg = (role: "user" | "assistant", content: string): ChatMessage => ({
  id: Math.random().toString(36).slice(2),
  role,
  content,
  createdAt: Date.now(),
});

describe("trimContext（audit-32 上下文裁剪）", () => {
  it("短对话原样保留", () => {
    const list = [msg("user", "hi"), msg("assistant", "hello")];
    expect(trimContext(list)).toEqual(list);
  });

  it("超长对话从旧往新丢弃，最新消息永远保留", () => {
    const big = "x".repeat(8000);
    const list = [
      msg("user", big),
      msg("assistant", big),
      msg("user", big),
      msg("user", "最新问题"),
    ];
    const trimmed = trimContext(list);
    expect(trimmed.length).toBeLessThan(list.length);
    expect(trimmed[trimmed.length - 1].content).toBe("最新问题");
  });

  it("空列表返回空", () => {
    expect(trimContext([])).toEqual([]);
  });
});

describe("friendlyStreamError（audit-24 报错人话化）", () => {
  it("401/403 → 指向配置页", () => {
    expect(friendlyStreamError({ status: 401 })).toContain("API Key");
    expect(friendlyStreamError({ status: 403 })).toContain("API Key");
  });

  it("429 / 额度类 → 频率与额度提示", () => {
    expect(friendlyStreamError({ status: 429 })).toContain("额度");
    expect(friendlyStreamError({ raw: "insufficient_quota" })).toContain(
      "额度",
    );
  });

  it("上下文超限 → 引导开新会话", () => {
    expect(
      friendlyStreamError({ raw: "maximum context length exceeded" }),
    ).toContain("新会话");
  });

  it("网络错误 → 检查网络或代理", () => {
    expect(friendlyStreamError({ raw: "NetworkError" })).toContain("网络");
  });

  it("未知错误 → 通用兜底而非技术串", () => {
    expect(friendlyStreamError({ raw: "" })).toBe("对话中断，请检查网络后重试");
  });
});

describe("friendlyTestReason（audit-25 测试失败分类）", () => {
  it("超时 / 网络 / 状态码分别给出不同指引", () => {
    expect(friendlyTestReason("timeout")).toContain("超时");
    expect(friendlyTestReason("network")).toContain("网络");
    expect(friendlyTestReason(401)).toContain("Key");
    expect(friendlyTestReason(503)).toContain("503");
  });
});
