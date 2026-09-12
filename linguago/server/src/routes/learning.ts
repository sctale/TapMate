import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { addXp, dateStr, getUserRow, publicUser, todayStr, touchDailyActivity, updateStreak } from '../helpers.js';
import { nextSrs } from '../services/srs.js';
import { checkAndGrantBadges } from '../services/badges.js';

const router = Router();

const completeSchema = z.object({
  results: z
    .array(
      z.object({
        exerciseId: z.number().int(),
        correct: z.boolean(),
        score: z.number().min(0).max(100).optional(),
      })
    )
    .min(1, '缺少答题结果'),
  seconds: z.number().min(0).max(7200).default(0),
});

/** 提交课程学习结果：结算成绩 / XP / SRS / 打卡 / 徽章 */
router.post('/lessons/:id/complete', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const lessonId = Number(req.params.id);
  const body = completeSchema.parse(req.body);

  const lesson = db
    .prepare(
      `SELECT l.id, l.title, lg.name AS lang_name FROM lessons l
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       JOIN languages lg ON lg.id = lv.language_id
       WHERE l.id = ?`
    )
    .get(lessonId) as { id: number; title: string; lang_name: string } | undefined;
  if (!lesson) {
    res.status(404).json({ error: '课程不存在' });
    return;
  }

  const total = body.results.length;
  const correctCount = body.results.filter((r) => r.correct).length;
  const accuracy = Math.round((correctCount / total) * 100);
  const passed = accuracy >= 60;
  const xpEarned = 50 + Math.round(accuracy * 0.3) + (accuracy === 100 ? 20 : 0);

  const prev = db
    .prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?')
    .get(userId, lessonId) as
    | { status: string; best_score: number; best_speaking: number; attempts: number }
    | undefined;
  const bestSpeaking = Math.max(prev?.best_speaking ?? 0, ...body.results.map((r) => r.score ?? 0));
  const newStatus = passed ? 'completed' : prev?.status === 'completed' ? 'completed' : 'in_progress';

  db.prepare(
    `INSERT INTO user_progress (user_id, lesson_id, status, best_score, best_speaking, attempts, completed_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET
       status = excluded.status,
       best_score = excluded.best_score,
       best_speaking = excluded.best_speaking,
       attempts = user_progress.attempts + 1,
       completed_at = COALESCE(user_progress.completed_at, excluded.completed_at)`
  ).run(
    userId,
    lessonId,
    newStatus,
    Math.max(prev?.best_score ?? 0, accuracy),
    bestSpeaking,
    (prev?.attempts ?? 0) + 1,
    passed ? new Date().toISOString() : null
  );

  // 课程词汇首次学习后进入间隔重复（明日到期）
  const vocabIds = db.prepare('SELECT id FROM vocabularies WHERE lesson_id = ?').all(lessonId) as Array<{
    id: number;
  }>;
  let newWords = 0;
  const tomorrow = dateStr(1);
  for (const v of vocabIds) {
    const exists = db
      .prepare('SELECT 1 FROM user_vocab_stats WHERE user_id = ? AND vocab_id = ?')
      .get(userId, v.id);
    if (!exists) {
      db.prepare(
        'INSERT INTO user_vocab_stats (user_id, vocab_id, stage, interval_days, due_at) VALUES (?, ?, 0, 1, ?)'
      ).run(userId, v.id, tomorrow);
      newWords++;
    }
  }

  touchDailyActivity(userId, {
    minutes: Math.max(1, Math.round(body.seconds / 60)),
    xp: xpEarned,
    lessons: passed ? 1 : 0,
    words: newWords,
  });
  addXp(userId, xpEarned);
  const streak = updateStreak(userId);

  // 首次通过时自动发布打卡动态
  let checkinPost = false;
  if (passed && prev?.status !== 'completed') {
    db.prepare('INSERT INTO posts (user_id, content, lesson_id, kind) VALUES (?, ?, ?, ?)').run(
      userId,
      `完成了${lesson.lang_name}课程「${lesson.title}」，今日打卡成功！`,
      lessonId,
      'checkin'
    );
    checkinPost = true;
  }

  const newBadges = checkAndGrantBadges(userId);
  const user = getUserRow(userId)!;
  res.json({
    accuracy,
    passed,
    xpEarned,
    newWords,
    streak,
    checkinPost,
    newBadges,
    user: publicUser(user),
  });
});

interface DueItem {
  vocabId: number;
  term: string;
  reading: string;
  meaning: string;
  stage: number;
  langCode: string;
  lessonTitle: string;
}

/** 待复习队列（到期词 + 四选一选项） */
router.get('/review/queue', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const langCode = typeof req.query.lang === 'string' ? req.query.lang : undefined;
  const rows = db
    .prepare(
      `SELECT v.id AS vocab_id, v.term, v.reading, v.meaning, s.stage,
              lg.code AS lang_code, l.title AS lesson_title, lv.language_id
       FROM user_vocab_stats s
       JOIN vocabularies v ON v.id = s.vocab_id
       JOIN lessons l ON l.id = v.lesson_id
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       JOIN languages lg ON lg.id = lv.language_id
       WHERE s.user_id = ? AND s.due_at <= ?
       ${langCode ? 'AND lg.code = ?' : ''}
       ORDER BY s.due_at, v.id LIMIT 20`
    )
    .all(...(langCode ? [userId, todayStr(), langCode] : [userId, todayStr()])) as Array<
    DueItem & { language_id: number }
  >;

  const items = rows.map((row) => {
    // 从同语言词库随机抽 3 个干扰项
    const distractors = db
      .prepare(
        `SELECT meaning FROM vocabularies WHERE id != ? AND lesson_id IN (
           SELECT l.id FROM lessons l
           JOIN units u ON u.id = l.unit_id
           JOIN levels lv ON lv.id = u.level_id
           WHERE lv.language_id = ?
         ) ORDER BY RANDOM() LIMIT 3`
      )
      .all(row.vocab_id, row.language_id) as Array<{ meaning: string }>;
    const options = [row.meaning, ...distractors.map((d) => d.meaning)];
    // 简单洗牌
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      vocabId: row.vocab_id,
      term: row.term,
      reading: row.reading,
      meaning: row.meaning,
      options,
      stage: row.stage,
      langCode: row.lang_code,
      lessonTitle: row.lesson_title,
    };
  });
  res.json({ items });
});

/** 提交复习结果：更新 SRS、发 XP */
router.post('/review/answer', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const body = z.object({ vocabId: z.number().int(), correct: z.boolean() }).parse(req.body);
  const prev = db
    .prepare('SELECT * FROM user_vocab_stats WHERE user_id = ? AND vocab_id = ?')
    .get(userId, body.vocabId) as
    | { stage: number; review_count: number; correct_count: number }
    | undefined;
  if (!prev) {
    res.status(404).json({ error: '复习记录不存在' });
    return;
  }
  const { stage, intervalDays } = nextSrs(prev.stage, body.correct);
  db.prepare(
    `UPDATE user_vocab_stats
     SET stage = ?, interval_days = ?, due_at = ?, review_count = review_count + 1,
         correct_count = correct_count + ?
     WHERE user_id = ? AND vocab_id = ?`
  ).run(stage, intervalDays, dateStr(intervalDays), body.correct ? 1 : 0, userId, body.vocabId);

  let xpEarned = 0;
  if (body.correct) {
    xpEarned = 2;
    addXp(userId, xpEarned);
    touchDailyActivity(userId, { xp: xpEarned });
  }
  const streak = updateStreak(userId);
  const newBadges = checkAndGrantBadges(userId);
  res.json({ nextIntervalDays: intervalDays, xpEarned, streak, newBadges });
});

/** 入学测评题目 */
router.get('/placement/:code/quiz', requireAuth, (req, res) => {
  const lang = db.prepare('SELECT id FROM languages WHERE code = ?').get(req.params.code) as
    | { id: number }
    | undefined;
  if (!lang) {
    res.status(404).json({ error: '语言不存在' });
    return;
  }
  const rows = db
    .prepare('SELECT level_code, question, options, answer_index FROM placement_questions WHERE language_id = ? ORDER BY sort_order')
    .all(lang.id) as Array<{
    level_code: string;
    question: string;
    options: string;
    answer_index: number;
  }>;
  res.json({
    questions: rows.map((r) => ({
      levelCode: r.level_code,
      question: r.question,
      options: JSON.parse(r.options) as string[],
      answerIndex: r.answer_index,
    })),
  });
});

const submitSchema = z.object({
  correctCount: z.number().int().min(0).max(20).optional(),
  skip: z.boolean().optional(),
  goalTags: z.array(z.string()).optional(),
});

/** 提交测评：推荐起点级别并记录兴趣标签 */
router.post('/placement/:code/submit', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const lang = db.prepare('SELECT * FROM languages WHERE code = ?').get(req.params.code) as
    | { id: number; name: string }
    | undefined;
  if (!lang) {
    res.status(404).json({ error: '语言不存在' });
    return;
  }
  const body = submitSchema.parse(req.body);
  const levels = db
    .prepare('SELECT * FROM levels WHERE language_id = ? ORDER BY sort_order')
    .all(lang.id) as Array<{ id: number; code: string; name: string }>;
  if (levels.length === 0) {
    res.status(404).json({ error: '该语言暂无课程' });
    return;
  }

  const score = body.skip ? 0 : (body.correctCount ?? 0);
  let recommended: { id: number; code: string; name: string };
  if (score <= 3 || levels.length === 1) {
    recommended = levels[0];
  } else if (score <= 6 && levels.length >= 2) {
    recommended = levels[1];
  } else {
    recommended = levels[levels.length - 1];
  }

  db.prepare(
    `INSERT INTO user_languages (user_id, language_id, current_level_id, goal_tags, placed)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(user_id, language_id) DO UPDATE SET
       current_level_id = excluded.current_level_id,
       goal_tags = excluded.goal_tags,
       placed = 1`
  ).run(userId, lang.id, recommended.id, JSON.stringify(body.goalTags ?? []));

  if (!body.skip) {
    db.prepare('INSERT INTO placement_results (user_id, language_id, score, recommended_level_id) VALUES (?, ?, ?, ?)').run(
      userId,
      lang.id,
      score,
      recommended.id
    );
  }

  res.json({
    level: { id: recommended.id, code: recommended.code, name: recommended.name },
    message:
      score <= 3
        ? `已为你安排${lang.name}零起点课程`
        : `测评得分 ${score}，推荐从${recommended.name}（${recommended.code}）开始`,
  });
});

export default router;
