/** 文本归一化：统一大小写、去除标点和多余空白 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’。、！？，；：…\-—~～·()（）\[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 经典 Levenshtein 编辑距离（动态规划） */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 字符级相似度 0-1 */
export function charSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

/** 词级 F1 0-1 */
export function wordF1(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter(Boolean));
  const wb = new Set(b.split(' ').filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit++;
  const precision = hit / wb.size;
  const recall = hit / wa.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** 口语跟读评分：字符级相似度 60% + 词级 F1 40%，输出 0-100 */
export function scoreSpeaking(target: string, transcript: string): number {
  const t = normalizeText(target);
  const r = normalizeText(transcript);
  if (!r) return 0;
  const score = 100 * (0.6 * charSimilarity(t, r) + 0.4 * wordF1(t, r));
  return Math.max(0, Math.min(100, Math.round(score)));
}
