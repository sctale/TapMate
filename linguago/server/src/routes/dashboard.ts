import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getUserRow, publicUser, todayStr, dateStr } from '../helpers.js';
import { getRecommendations } from '../services/recommendation.js';

const router = Router();

/** 仪表盘聚合数据 */
router.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const user = getUserRow(userId)!;
  const today = todayStr();

  const todayRow = db
    .prepare('SELECT * FROM daily_activity WHERE user_id = ? AND date = ?')
    .get(userId, today) as
    | { xp: number; minutes: number; lessons_done: number; words_learned: number }
    | undefined;

  const dueCount = (
    db.prepare('SELECT COUNT(*) AS c FROM user_vocab_stats WHERE user_id = ? AND due_at <= ?').get(userId, today) as {
      c: number;
    }
  ).c;

  // 近 14 天活动序列（缺省补 0）
  const activityRows = db
    .prepare('SELECT date, xp, minutes FROM daily_activity WHERE user_id = ? AND date >= ?')
    .all(userId, dateStr(-13)) as Array<{ date: string; xp: number; minutes: number }>;
  const activityMap = new Map(activityRows.map((r) => [r.date, r]));
  const series: Array<{ date: string; xp: number; minutes: number }> = [];
  for (let i = -13; i <= 0; i++) {
    const d = dateStr(i);
    const row = activityMap.get(d);
    series.push({
      date: d.slice(5), // MM-DD
      xp: row?.xp ?? 0,
      minutes: row?.minutes ?? 0,
    });
  }

  // 语言学习概览
  const langs = db.prepare('SELECT * FROM languages ORDER BY id').all() as Array<{
    id: number;
    code: string;
    name: string;
    flag: string;
  }>;
  const languages = langs.map((lang) => {
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM lessons l
           JOIN units u ON u.id = l.unit_id JOIN levels lv ON lv.id = u.level_id
           WHERE lv.language_id = ?`
        )
        .get(lang.id) as { c: number }
    ).c;
    const completed = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM user_progress p
           JOIN lessons l ON l.id = p.lesson_id JOIN units u ON u.id = l.unit_id JOIN levels lv ON lv.id = u.level_id
           WHERE p.user_id = ? AND lv.language_id = ? AND p.status = 'completed'`
        )
        .get(userId, lang.id) as { c: number }
    ).c;
    const words = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM user_vocab_stats s
           JOIN vocabularies v ON v.id = s.vocab_id JOIN lessons l ON l.id = v.lesson_id
           JOIN units u ON u.id = l.unit_id JOIN levels lv ON lv.id = u.level_id
           WHERE s.user_id = ? AND lv.language_id = ?`
        )
        .get(userId, lang.id) as { c: number }
    ).c;
    const due = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM user_vocab_stats s
           JOIN vocabularies v ON v.id = s.vocab_id JOIN lessons l ON l.id = v.lesson_id
           JOIN units u ON u.id = l.unit_id JOIN levels lv ON lv.id = u.level_id
           WHERE s.user_id = ? AND lv.language_id = ? AND s.due_at <= ?`
        )
        .get(userId, lang.id, today) as { c: number }
    ).c;
    const enrolled = !!db
      .prepare('SELECT 1 FROM user_languages WHERE user_id = ? AND language_id = ?')
      .get(userId, lang.id);
    return {
      code: lang.code,
      name: lang.name,
      flag: lang.flag,
      enrolled,
      progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      completedLessons: completed,
      totalLessons: total,
      wordsLearned: words,
      dueCount: due,
    };
  });

  const recommendations = getRecommendations(userId);
  res.json({
    user: publicUser(user),
    today: {
      xp: todayRow?.xp ?? 0,
      minutes: todayRow?.minutes ?? 0,
      lessons: todayRow?.lessons_done ?? 0,
      words: todayRow?.words_learned ?? 0,
    },
    dueCount,
    series,
    languages,
    recommendations,
  });
});

export default router;
