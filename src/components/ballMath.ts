// 悬浮球几何纯计算（无 RN 依赖，可在 Node 单测）
// 钳制球垂直位置比例：顶部留 5%（状态栏/通知栏），底部留 22%（输入区与系统手势带）
export const clampBallRatio = (r: number) => Math.min(0.78, Math.max(0.05, r));
