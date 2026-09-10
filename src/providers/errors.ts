// ===== 错误文案人话化（audit-24 / audit-32）=====
// 把 SSE / HTTP 层的技术错误映射为用户能理解并行动的描述；原始错误保留在 console

export interface RawStreamError {
  status?: number; // HTTP 状态码（可取到时）
  raw?: string; // 原始错误信息 / 事件类型
}

// 流式对话错误 → 人话
export function friendlyStreamError({ status, raw }: RawStreamError): string {
  const t = (raw || "").toLowerCase();

  if (status === 401 || status === 403) {
    return "API Key 无效或无权限（401/403），请到「配置」页重新保存并测试";
  }
  if (
    status === 429 ||
    t.includes("rate limit") ||
    t.includes("insufficient_quota")
  ) {
    return "请求过于频繁或额度已用尽，请稍后再试或更换通道";
  }
  if (status && status >= 500) {
    return `模型服务暂时不可用（${status}），请稍后点重试`;
  }
  if (
    t.includes("context") ||
    t.includes("too many tokens") ||
    t.includes("maximum context")
  ) {
    return "对话太长超出了模型上限，请点「✚」开一个新会话继续聊";
  }
  if (
    t.includes("networkerror") ||
    t.includes("failed to connect") ||
    t.includes("request failed") ||
    t.includes("timeout") ||
    t.includes("timed out")
  ) {
    return "网络连接失败，请检查网络或代理后点重试";
  }
  return "对话中断，请检查网络后重试";
}

// 流式空闲超时兜底文案
export const IDLE_TIMEOUT_MESSAGE = "模型响应超时（可能网络不稳定），请点重试";

// API Key 连通性测试失败原因 → 人话（audit-25）
export function friendlyTestReason(reason: string | number): string {
  if (reason === "timeout") return "测试超时，请检查网络或代理后重试";
  if (reason === "network") return "无法连接服务器，请检查网络或代理";
  if (reason === 401 || reason === 403)
    return "Key 被拒绝（401/403），请确认粘贴完整且未过期";
  if (reason === "auth") return "Key 被拒绝，请确认粘贴完整且未过期";
  return `服务返回异常（${reason}），请稍后重试`;
}
