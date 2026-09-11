import type { ApiProtocol, ProviderDef } from "../types";

// ===== 动态模型列表（v0.3.0）=====
// Key 验证成功后拉取账号真实模型清单，替代过时的内置 defaultModels。
// SecureStore 单条 ~2KB（Android），大清单存 SQLite（chatDB.setModelIds）

// 非对话类模型关键词过滤（语音/图像/嵌入/审核/实时等）
const NOISE =
  /(whisper|tts|dall|embed|moderation|audio|transcribe|realtime|computer-use|browser|search|prebuild|snapshot|sora|image|video|dalle|omni|ocr|rerank)/i;

// 纯函数：去噪、去重、新模型优先（多数厂商按发布时间升序返回，倒置近似）、截断 50
export function sanitizeModelIds(raw: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const id of raw) {
    const t = id.trim();
    if (!t || NOISE.test(t) || seen.has(t)) continue;
    seen.add(t);
    cleaned.push(t);
  }
  cleaned.reverse();
  return cleaned.slice(0, 50);
}

// 纯函数：解析两家协议的 /models 响应为 id 列表
export function parseModelIds(
  protocol: ApiProtocol | undefined,
  json: unknown,
): string[] {
  if (protocol === "gemini") {
    const models = (json as { models?: { name?: string }[] })?.models ?? [];
    return models
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
  }
  const data = (json as { data?: { id?: string }[] })?.data ?? [];
  return data.map((m) => m.id ?? "").filter(Boolean);
}

// 拉取并清洗模型清单；失败返回 null（调用方回落 defaultModels）
export async function fetchModelIds(
  p: ProviderDef,
  key: string,
  baseUrl: string,
): Promise<string[] | null> {
  try {
    const base = baseUrl.replace(/\/$/, "");
    const url =
      p.apiProtocol === "gemini"
        ? `${base}/models?key=${encodeURIComponent(key)}`
        : `${base}/models`;
    const res = await fetch(
      url,
      p.apiProtocol === "gemini"
        ? undefined
        : { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const ids = sanitizeModelIds(parseModelIds(p.apiProtocol, json));
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}
