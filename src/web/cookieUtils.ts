import CookieManager from '@react-native-cookies/cookies';
import type { ProviderDef } from '../types';

// ===== Web 通道 Cookie 工具 =====
// Cookie 持久化由系统 WebView CookieManager 自动完成（跨启动保留登录态）
// 此处提供：登录态启发式检测、清除登录态（退出登录）

// 启发式检测是否已登录：官网域名下存在任意 Cookie 即视为已登录
// （宽松判据：各家会话 Cookie 名不同，且未登录时官网通常也会下发少量匿名 Cookie，
//  但首次打开前 Cookie 为空，足以区分"从未登录"与"打开过官网"）
export async function detectWebLoggedIn(provider: ProviderDef): Promise<boolean> {
  try {
    const cookies = await CookieManager.get(provider.webUrl, true);
    return Object.keys(cookies).length > 0;
  } catch {
    return false;
  }
}

// 清除登录态（退出登录）
// 注意：该库无跨平台按域名清除 API，clearAll 会清掉所有站点 Cookie
// （TapMate 场景下 Cookie 只用于各模型官网，影响可接受，调用方需提示用户）
export async function clearWebLogin(): Promise<void> {
  try {
    await CookieManager.clearAll(true);
    await CookieManager.flush();
  } catch {
    // 忽略
  }
}
