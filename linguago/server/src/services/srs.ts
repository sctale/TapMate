/**
 * 简化版 SM-2 间隔重复算法
 * 答对：stage + 1，间隔按梯度拉长；答错：重置 stage，次日再复习
 */
export const SRS_INTERVALS = [1, 3, 7, 16, 35, 60] as const;

export interface SrsNext {
  stage: number;
  intervalDays: number;
}

export function nextSrs(prevStage: number, correct: boolean): SrsNext {
  if (correct) {
    const stage = Math.min(prevStage + 1, SRS_INTERVALS.length - 1);
    return { stage, intervalDays: SRS_INTERVALS[stage] };
  }
  return { stage: 0, intervalDays: 1 };
}
