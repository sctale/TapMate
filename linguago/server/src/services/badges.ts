import { db } from '../db.js';
import { getUserRow } from '../helpers.js';

export interface BadgeInfo {
  code: string;
  name: string;
  description: string;
  icon: string;
}

/** 检查并发放新获得的徽章，返回本次新获得列表 */
export function checkAndGrantBadges(userId: number): BadgeInfo[] {
  const user = getUserRow(userId);
  if (!user) return [];

  const wordsLearned = (
    db.prepare('SELECT COUNT(*) AS c FROM user_vocab_stats WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const lessonsDone = (
    db.prepare(
      "SELECT COUNT(*) AS c FROM user_progress WHERE user_id = ? AND status = 'completed'"
    ).get(userId) as { c: number }
  ).c;
  const bestSpeaking = (
    db.prepare('SELECT MAX(best_speaking) AS m FROM user_progress WHERE user_id = ?').get(userId) as { m: number | null }
  ).m;
  const postsCount = (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(userId) as { c: number }).c;

  // 是否完整学完一个单元 / 一个级别
  const unitDone = !!db
    .prepare(
      `SELECT u.id FROM units u
       WHERE EXISTS (SELECT 1 FROM lessons l WHERE l.unit_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM lessons l
           LEFT JOIN user_progress p ON p.lesson_id = l.id AND p.user_id = ?
           WHERE l.unit_id = u.id AND (p.id IS NULL OR p.status != 'completed')
         ) LIMIT 1`
    )
    .get(userId);
  const levelDone = !!db
    .prepare(
      `SELECT lv.id FROM levels lv
       WHERE EXISTS (SELECT 1 FROM units u WHERE u.level_id = lv.id)
         AND NOT EXISTS (
           SELECT 1 FROM lessons l
           JOIN units u ON u.id = l.unit_id
           LEFT JOIN user_progress p ON p.lesson_id = l.id AND p.user_id = ?
           WHERE u.level_id = lv.id AND (p.id IS NULL OR p.status != 'completed')
         ) LIMIT 1`
    )
    .get(userId);

  const conditions: Record<string, boolean> = {
    first_lesson: lessonsDone >= 1,
    streak_3: user.streak >= 3,
    streak_7: user.streak >= 7,
    streak_30: user.streak >= 30,
    words_50: wordsLearned >= 50,
    words_200: wordsLearned >= 200,
    unit_complete: unitDone,
    level_complete: levelDone,
    speaking_90: (bestSpeaking ?? 0) >= 90,
    first_post: postsCount >= 1,
  };

  const newBadges: BadgeInfo[] = [];
  for (const [code, met] of Object.entries(conditions)) {
    if (!met) continue;
    const badge = db.prepare('SELECT * FROM badges WHERE code = ?').get(code) as
      | { id: number; code: string; name: string; description: string; icon: string }
      | undefined;
    if (!badge) continue;
    const owned = db
      .prepare('SELECT 1 AS x FROM user_badges WHERE user_id = ? AND badge_id = ?')
      .get(userId, badge.id);
    if (owned) continue;
    db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badge.id);
    newBadges.push({ code: badge.code, name: badge.name, description: badge.description, icon: badge.icon });
  }
  return newBadges;
}
