import { describe, expect, it } from "vitest";
import { clampBallRatio } from "../components/ballMath";

describe("clampBallRatio（悬浮球拖拽钳制，v0.4.0）", () => {
  it("限制在 0.05 ~ 0.78 之间，避开状态栏/通知栏与输入区", () => {
    expect(clampBallRatio(-2)).toBe(0.05);
    expect(clampBallRatio(0)).toBe(0.05);
    expect(clampBallRatio(0.3)).toBe(0.3);
    expect(clampBallRatio(0.99)).toBe(0.78);
  });
});
