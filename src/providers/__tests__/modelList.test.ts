import { describe, expect, it } from "vitest";
import { parseModelIds, sanitizeModelIds } from "../modelList";

describe("parseModelIds（v0.3.0 动态模型响应解析）", () => {
  it("OpenAI 兼容格式：取 data[].id", () => {
    const ids = parseModelIds("openai-compatible", {
      data: [{ id: "gpt-4o" }, { id: "deepseek-chat" }, {}],
    });
    expect(ids).toEqual(["gpt-4o", "deepseek-chat"]);
  });

  it("Gemini 格式：models[].name 去 models/ 前缀", () => {
    const ids = parseModelIds("gemini", {
      models: [
        { name: "models/gemini-2.5-flash" },
        { name: "models/gemini-2.5-pro" },
      ],
    });
    expect(ids).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
  });

  it("结构异常返回空数组不抛错", () => {
    expect(parseModelIds("openai-compatible", null)).toEqual([]);
    expect(parseModelIds(undefined, {})).toEqual([]);
  });
});

describe("sanitizeModelIds（去噪/去重/截断）", () => {
  it("过滤非对话类模型（whisper/tts/embed/image 等）", () => {
    const out = sanitizeModelIds([
      "gpt-4o",
      "whisper-1",
      "tts-1",
      "text-embedding-3-large",
      "dall-e-3",
      "gpt-4o-realtime-preview",
    ]);
    expect(out).toContain("gpt-4o");
    expect(out).toHaveLength(1);
  });

  it("去重并倒序（新模型优先）", () => {
    const out = sanitizeModelIds(["a-chat", "b-chat", "a-chat"]);
    expect(out).toEqual(["b-chat", "a-chat"]);
  });

  it("超过 50 个截断", () => {
    const many = Array.from({ length: 80 }, (_, i) => `model-${i}`);
    expect(sanitizeModelIds(many)).toHaveLength(50);
  });

  it("空白与异常项被丢弃", () => {
    expect(sanitizeModelIds(["  ", "ok-model"])).toEqual(["ok-model"]);
  });
});
