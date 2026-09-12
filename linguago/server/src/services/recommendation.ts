import { db } from '../db.js';
import { todayStr } from '../helpers.js';
import { getLanguagePath } from './progress.js';
import type { RecItem } from '../types.js';

/**
 * 个性化学习路径推荐（可解释规则引擎）：
 * 1) 到期单词复习  2) 当前课程下一课  3) 低分课补强  4) 未开始的新语言
 */
export function getRecommendations(userId: number): RecItem[] {
  const recs: RecItem[] = [];
  const today = todayStr();

  // 1. 到期复习（按语言汇总）
  const dueRows = db
    .prepare(
      `SELECT lg.code, lg.name, lg.flag, COUNT(*) AS c
       FROM user_vocab_stats s
       JOIN vocabularies v ON v.id = s.vocab_id
       JOIN lessons l ON l.id = v.lesson_id
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       JOIN languages lg ON lg.id = lv.language_id
       WHERE s.user_id = ? AND s.due_at <= ?
       GROUP BY lg.id ORDER BY c DESC`
    )
    .all(userId, today) as Array<{ code: string; name: string; flag: string; c: number }>;
  for (const row of dueRows) {
    recs.push({
      key: `review-${row.code}`,
      kind: 'review',
      title: `${row.name}词汇复习`,
      description: `${row.c} 个单词到了记忆巩固时间`,
      href: `/review/${row.code}`,
      languageCode: row.code,
      languageFlag: row.flag,
    });
  }

  // 2. 各在读语言的下一课
  const enrolled = db
    .prepare(
      `SELECT lg.id, lg.code, lg.name, lg.flag FROM user_languages ul
       JOIN languages lg ON lg.id = ul.language_id WHERE ul.user_id = ?`
    )
    .all(userId) as Array<{ id: number; code: string; name: string; flag: string }>;
  for (const lang of enrolled) {
    const path = getLanguagePath(userId, lang.id);
    if (path.nextLesson) {
      recs.push({
        key: `continue-${lang.code}`,
        kind: 'continue',
        title: `继续学${lang.name}：${path.nextLesson.title}`,
        description: `${path.nextLesson.levelCode} · ${path.nextLesson.unitTitle}`,
        href: `/learn/${lang.code}/lesson/${path.nextLesson.id}`,
        languageCode: lang.code,
        languageFlag: lang.flag,
      });
    }
  }

  // 3. 低分课补强（已完成但成绩 < 70）
  const weakLessons = db
    .prepare(
      `SELECT l.title, lg.code, lg.name, p.best_score, p.lesson_id, lv.code AS level_code
       FROM user_progress p
       JOIN lessons l ON l.id = p.lesson_id
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       JOIN languages lg ON lg.id = lv.language_id
       WHERE p.user_id = ? AND p.status = 'completed' AND p.best_score < 70
       ORDER BY p.best_score ASC LIMIT 2`
    )
    .all(userId) as Array<{ title: string; code: string; name: string; best_score: number; lesson_id: number; level_code: string }>;
  for (const w of weakLessons) {
    recs.push({
      key: `weak-${w.lesson_id}`,
      kind: 'weak',
      title: `补强${w.name}薄弱课：${w.title}`,
      description: `上次成绩 ${w.best_score} 分，重练巩固一下`,
      href: `/learn/${w.code}/lesson/${w.lesson_id}`,
      languageCode: w.code,
      languageFlag: '🎯',
    });
  }

  // 4. 未开始的新语言
  const allLangs = db.prepare('SELECT code, name, flag FROM languages').all() as Array<{
    code: string;
    name: string;
    flag: string;
  }>;
  const enrolledCodes = new Set(enrolled.map((e) => e.code));
  for (const lang of allLangs) {
    if (enrolledCodes.has(lang.code)) continue;
    recs.push({
      key: `explore-${lang.code}`,
      kind: 'explore',
      title: `开始学${lang.name}`,
      description: '先做 8 道入学测评题，为你推荐起点级别',
      href: `/onboarding?lang=${lang.code}`,
      languageCode: lang.code,
      languageFlag: lang.flag,
    });
  }

  return recs.slice(0, 6);
}
