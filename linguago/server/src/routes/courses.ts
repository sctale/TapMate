import { Router } from 'express';
import { db } from '../db.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { todayStr } from '../helpers.js';
import { getLanguagePath } from '../services/progress.js';
import type { ExercisePayload } from '../types.js';

const router = Router();

/** 语言列表（公共接口，登录后附带个人进度） */
router.get('/languages', optionalAuth, (req, res) => {
  const langs = db.prepare('SELECT * FROM languages ORDER BY id').all() as Array<{
    id: number;
    code: string;
    name: string;
    flag: string;
    level_system: string;
  }>;
  const result = langs.map((lang) => {
    const levels = db
      .prepare('SELECT code, name FROM levels WHERE language_id = ? ORDER BY sort_order')
      .all(lang.id) as Array<{ code: string; name: string }>;
    const lessonCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM lessons l
           JOIN units u ON u.id = l.unit_id
           JOIN levels lv ON lv.id = u.level_id
           WHERE lv.language_id = ?`
        )
        .get(lang.id) as { c: number }
    ).c;

    let enrolled = false;
    let progressPct = 0;
    let dueCount = 0;
    let wordsLearned = 0;
    let placedLevelCode: string | null = null;

    if (req.user) {
      const userId = req.user.id;
      const ul = db
        .prepare(
          `SELECT ul.current_level_id, lv.code AS level_code FROM user_languages ul
           LEFT JOIN levels lv ON lv.id = ul.current_level_id
           WHERE ul.user_id = ? AND ul.language_id = ?`
        )
        .get(userId, lang.id) as { current_level_id: number | null; level_code: string | null } | undefined;
      enrolled = !!ul;
      placedLevelCode = ul?.level_code ?? null;
      const completed = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM user_progress p
             JOIN lessons l ON l.id = p.lesson_id
             JOIN units u ON u.id = l.unit_id
             JOIN levels lv ON lv.id = u.level_id
             WHERE p.user_id = ? AND lv.language_id = ? AND p.status = 'completed'`
          )
          .get(userId, lang.id) as { c: number }
      ).c;
      progressPct = lessonCount > 0 ? Math.round((completed / lessonCount) * 100) : 0;
      dueCount = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM user_vocab_stats s
             JOIN vocabularies v ON v.id = s.vocab_id
             JOIN lessons l ON l.id = v.lesson_id
             JOIN units u ON u.id = l.unit_id
             JOIN levels lv ON lv.id = u.level_id
             WHERE s.user_id = ? AND lv.language_id = ? AND s.due_at <= ?`
          )
          .get(userId, lang.id, todayStr()) as { c: number }
      ).c;
      wordsLearned = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM user_vocab_stats s
             JOIN vocabularies v ON v.id = s.vocab_id
             JOIN lessons l ON l.id = v.lesson_id
             JOIN units u ON u.id = l.unit_id
             JOIN levels lv ON lv.id = u.level_id
             WHERE s.user_id = ? AND lv.language_id = ?`
          )
          .get(userId, lang.id) as { c: number }
      ).c;
    }

    return {
      code: lang.code,
      name: lang.name,
      flag: lang.flag,
      levelSystem: lang.level_system,
      levels,
      lessonCount,
      enrolled,
      progressPct,
      dueCount,
      wordsLearned,
      placedLevelCode,
    };
  });
  res.json({ languages: result });
});

/** 课程路径树（级别 → 单元 → 课程，含解锁状态） */
router.get('/languages/:code/path', requireAuth, (req, res) => {
  const lang = db.prepare('SELECT * FROM languages WHERE code = ?').get(req.params.code) as
    | { id: number; code: string; name: string; flag: string; level_system: string }
    | undefined;
  if (!lang) {
    res.status(404).json({ error: '语言不存在' });
    return;
  }
  const path = getLanguagePath(req.user!.id, lang.id);
  res.json({
    language: { code: lang.code, name: lang.name, flag: lang.flag, levelSystem: lang.level_system },
    ...path,
  });
});

/** 课程详情：词汇 + 语法 + 练习题 */
router.get('/lessons/:id', requireAuth, (req, res) => {
  const lesson = db
    .prepare(
      `SELECT l.id, l.title, l.topic, u.title AS unit_title, lv.code AS level_code, lv.name AS level_name,
              lg.code AS lang_code, lg.name AS lang_name
       FROM lessons l
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       JOIN languages lg ON lg.id = lv.language_id
       WHERE l.id = ?`
    )
    .get(Number(req.params.id)) as
    | {
        id: number;
        title: string;
        topic: string;
        unit_title: string;
        level_code: string;
        level_name: string;
        lang_code: string;
        lang_name: string;
      }
    | undefined;
  if (!lesson) {
    res.status(404).json({ error: '课程不存在' });
    return;
  }

  const vocabularies = db
    .prepare('SELECT id, term, reading, meaning, example FROM vocabularies WHERE lesson_id = ? ORDER BY id')
    .all(lesson.id) as Array<{ id: number; term: string; reading: string; meaning: string; example: string }>;

  const grammarRows = db
    .prepare('SELECT id, title, explanation, examples FROM grammar_rules WHERE lesson_id = ? ORDER BY id')
    .all(lesson.id) as Array<{ id: number; title: string; explanation: string; examples: string }>;
  const grammar = grammarRows.map((g) => ({
    id: g.id,
    title: g.title,
    explanation: g.explanation,
    examples: JSON.parse(g.examples) as Array<{ text: string; translation: string }>,
  }));

  const exerciseRows = db
    .prepare('SELECT id, type, prompt, payload, sort_order FROM exercises WHERE lesson_id = ? ORDER BY sort_order, id')
    .all(lesson.id) as Array<{ id: number; type: string; prompt: string; payload: string; sort_order: number }>;
  const exercises = exerciseRows.map((e) => ({
    id: e.id,
    type: e.type,
    prompt: e.prompt,
    payload: JSON.parse(e.payload) as ExercisePayload,
  }));

  res.json({ lesson, vocabularies, grammar, exercises });
});

export default router;
