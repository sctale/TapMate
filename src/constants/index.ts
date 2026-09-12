// ===== TapMate 设计 token（延续 Tap 系列治愈暖色风格，对齐 TapLedger）=====

// ===== 主题色 =====
export const COLORS = {
  background: "#F8F6F3", // 暖米白背景
  bgAlt: "#F3EFE9", // 深一档背景
  surface: "#FFFFFF",
  surfaceAlt: "#FFF9F5", // 暖色卡片底
  text: "#2D2D2D", // 深灰主文字
  textSecondary: "#6E6E6E",
  textTertiary: "#857F78", // 次次级（对比度 ≥ WCAG AA）
  border: "#F0EDE8", // 暖灰边框
  borderSubtle: "#E8E4DE",
  accent: "#7986CB", // 强调靛蓝（Tap 系列主色）
  accentDark: "#5C6BC0",
  accentSoft: "rgba(121,134,203,0.09)", // 主色 9% 透明底（选中胶囊用）
  success: "#81C784", // 连接成功薄荷绿
  danger: "#E57373",
  white: "#FFFFFF",
  overlay: "rgba(45,45,45,0.35)", // 弹窗遮罩
  userBubble: "#7986CB", // 用户消息气泡（靛蓝）
  userBubbleText: "#FFFFFF",
  aiBubble: "#FFFFFF", // 模型消息气泡（白卡）
  warningBg: "#FFF3E0", // 提示底色
  warningText: "#E65100",
};

// ===== 间距（大留白，Headspace 风格）=====
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ===== 圆角规范 =====
export const RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};

// ===== 字体大小 =====
export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
};

// ===== 设置项存储 key（经 credentials.ts 的 loadSetting/saveSetting 读写）=====
export const SETTING_KEYS = {
  LAST_MODEL: "last_model", // 上次使用的模型（JSON: {providerId, modelId}）
  WELCOME_SEEN: "welcome_seen", // 首启双通道引导是否已看过
  COMPARE_MODELS: "compare_models", // 并发对比所选模型（JSON: ModelRef[]）
  BALL_POS: "ball_pos", // 悬浮球垂直位置（0-1 比例）
} as const;

// 并发对比模式的虚拟厂商/模型标识（v0.3.0）
export const COMPARE = "$compare$";

// 生成 uuid（时间戳36进制 + 随机串）
export function genUuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
