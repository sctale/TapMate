// ===== 官网 Web 容器共享配置 =====
// WebChatScreen（登录容器）与 InlineWebChat（首页嵌入对话）共用，防止两处 UA/Cookie 设置漂移

// 干净的 Chrome UA（去掉 "; wv" WebView 标记，降低 ChatGPT Turnstile 等拦截概率）
export const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

// 所有官网 WebView 共用的基础属性
export const WEBVIEW_BASE_PROPS = {
  javaScriptEnabled: true,
  domStorageEnabled: true,
  thirdPartyCookiesEnabled: true,
  sharedCookiesEnabled: true,
  cacheEnabled: true,
} as const;
