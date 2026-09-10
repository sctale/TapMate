import type { ProviderDef } from "../types";

// ===== API Key 连通性测试 =====
// 用"列出模型"这类只读接口验证 Key 有效性，不产生对话费用
// 返回失败原因分类（audit-25），让配置页能区分"Key 错"还是"网络不通"

export type TestResult = {
  ok: boolean;
  reason?: "timeout" | "network" | number; // 超时 / 网络不可达 / HTTP 状态码
};

// OpenAI 兼容协议：GET {baseUrl}/models（Bearer 鉴权）
async function testOpenAICompatible(
  key: string,
  baseUrl: string,
): Promise<TestResult> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.ok ? { ok: true } : { ok: false, reason: res.status };
}

// Gemini 原生协议：GET {baseUrl}/models?key=KEY
async function testGemini(key: string, baseUrl: string): Promise<TestResult> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/models?key=${encodeURIComponent(key)}`,
  );
  return res.ok ? { ok: true } : { ok: false, reason: res.status };
}

// 统一入口：按厂商协议分发，超时 10 秒视为失败
export async function testApiKey(
  p: ProviderDef,
  key: string,
  baseUrl: string,
): Promise<TestResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const task =
      p.apiProtocol === "gemini"
        ? testGemini(key, baseUrl)
        : testOpenAICompatible(key, baseUrl);
    const timeout = new Promise<TestResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, reason: "timeout" }),
        10000,
      );
    });
    return await Promise.race([task, timeout]);
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
