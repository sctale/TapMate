import type { ProviderDef } from '../types';

// ===== API Key 连通性测试 =====
// 用"列出模型"这类只读接口验证 Key 有效性，不产生对话费用

// OpenAI 兼容协议：GET {baseUrl}/models（Bearer 鉴权）
async function testOpenAICompatible(key: string, baseUrl: string): Promise<boolean> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.ok;
}

// Gemini 原生协议：GET {baseUrl}/models?key=KEY
async function testGemini(key: string, baseUrl: string): Promise<boolean> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models?key=${encodeURIComponent(key)}`);
  return res.ok;
}

// 统一入口：按厂商协议分发，超时 10 秒视为失败
export async function testApiKey(p: ProviderDef, key: string, baseUrl: string): Promise<boolean> {
  try {
    const task =
      p.apiProtocol === 'gemini'
        ? testGemini(key, baseUrl)
        : testOpenAICompatible(key, baseUrl);
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10000));
    return await Promise.race([task, timeout]);
  } catch {
    return false;
  }
}
