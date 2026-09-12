import { db } from '../db.js';

export type LessonStatus = 'completed' | 'available' | 'locked';

export interface PathLesson {
  id: number;
  title: string;
  topic: string;
  status: LessonStatus;
  bestScore: number;
}

export interface PathUnit {
  id: number;
  title: string;
  lessons: PathLesson[];
}

export interface PathLevel {
  id: number;
  code: string;
  name: string;
  description: string;
  units: PathUnit[];
  completedLessons: number;
  totalLessons: number;
}

interface FlatLesson {
  id: number;
  title: string;
  topic: string;
  unitTitle: string;
  unitId: number;
  levelId: number;
  levelCode: string;
  levelName: string;
  levelDesc: string;
  levelOrder: number;
  order: number;
  status: LessonStatus;
  bestScore: number;
}

export interface LanguagePath {
  levels: PathLevel[];
  placedLevelId: number | null;
  nextLesson: { id: number; title: string; unitTitle: string; levelCode: string } | null;
}

/**
 * 计算某用户在某语言的课程路径（含解锁状态）。
 * 解锁规则：入学测评推荐级别之前的课程全部解锁；否则线性解锁（完成前一课解锁下一课）。
 */
export function getLanguagePath(userId: number, languageId: number): LanguagePath {
  const flat = db
    .prepare(
      `SELECT l.id, l.title, l.topic, l.sort_order AS lesson_order,
              u.id AS unit_id, u.title AS unit_title, u.sort_order AS unit_order,
              lv.id AS level_id, lv.code AS level_code, lv.name AS level_name,
              lv.description AS level_desc, lv.sort_order AS level_order
       FROM lessons l
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       WHERE lv.language_id = ?
       ORDER BY lv.sort_order, u.sort_order, l.sort_order`
    )
    .all(languageId) as Array<{
    id: number;
    title: string;
    topic: string;
    lesson_order: number;
    unit_id: number;
    unit_title: string;
    unit_order: number;
    level_id: number;
    level_code: string;
    level_name: string;
    level_desc: string;
    level_order: number;
  }>;

  const progressRows = db
    .prepare(
      `SELECT p.lesson_id, p.status, p.best_score FROM user_progress p
       JOIN lessons l ON l.id = p.lesson_id
       JOIN units u ON u.id = l.unit_id
       JOIN levels lv ON lv.id = u.level_id
       WHERE p.user_id = ? AND lv.language_id = ?`
    )
    .all(userId, languageId) as Array<{ lesson_id: number; status: string; best_score: number }>;
  const progress = new Map(progressRows.map((r) => [r.lesson_id, r]));

  const placed = db
    .prepare('SELECT current_level_id FROM user_languages WHERE user_id = ? AND language_id = ?')
    .get(userId, languageId) as { current_level_id: number | null } | undefined;
  const placedLevelId = placed?.current_level_id ?? null;

  // 计算解锁边界：最后完成的一课之后的全部，或推荐级别起点
  let lastCompletedIndex = -1;
  flat.forEach((row, index) => {
    if (progress.get(row.id)?.status === 'completed') lastCompletedIndex = Math.max(lastCompletedIndex, index);
  });
  let placedStartIndex = -1;
  if (placedLevelId) {
    const idx = flat.findIndex((row) => row.level_id === placedLevelId);
    placedStartIndex = idx;
  }
  const unlockedThrough = Math.max(lastCompletedIndex + 1, placedStartIndex);

  const flatLessons: FlatLesson[] = flat.map((row, index) => {
    const done = progress.get(row.id)?.status === 'completed';
    let status: LessonStatus;
    if (done) status = 'completed';
    else if (index <= Math.max(unlockedThrough - 1, -1) || (placedStartIndex === index && !done)) status = 'available';
    else status = 'locked';
    // 推荐级别起点之后的课仍需线性解锁
    if (!done && placedStartIndex >= 0 && index > placedStartIndex && index > lastCompletedIndex + 1) {
      status = 'locked';
    }
    return {
      id: row.id,
      title: row.title,
      topic: row.topic,
      unitTitle: row.unit_title,
      unitId: row.unit_id,
      levelId: row.level_id,
      levelCode: row.level_code,
      levelName: row.level_name,
      levelDesc: row.level_desc,
      levelOrder: row.level_order,
      order: index,
      status,
      bestScore: progress.get(row.id)?.best_score ?? 0,
    };
  });

  // 组装层级结构
  const levels: PathLevel[] = [];
  const levelMap = new Map<number, PathLevel>();
  const unitMap = new Map<number, PathUnit>();
  for (const lesson of flatLessons) {
    if (!levelMap.has(lesson.levelId)) {
      const level: PathLevel = {
        id: lesson.levelId,
        code: lesson.levelCode,
        name: lesson.levelName,
        description: lesson.levelDesc,
        units: [],
        completedLessons: 0,
        totalLessons: 0,
      };
      levelMap.set(lesson.levelId, level);
      levels.push(level);
    }
    const level = levelMap.get(lesson.levelId)!;
    if (!unitMap.has(lesson.unitId)) {
      const unit: PathUnit = { id: lesson.unitId, title: lesson.unitTitle, lessons: [] };
      unitMap.set(lesson.unitId, unit);
      level.units.push(unit);
    }
    unitMap.get(lesson.unitId)!.lessons.push({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      status: lesson.status,
      bestScore: lesson.bestScore,
    });
    level.totalLessons++;
    if (lesson.status === 'completed') level.completedLessons++;
  }

  const next = flatLessons.find((l) => l.status === 'available');
  return {
    levels,
    placedLevelId,
    nextLesson: next ? { id: next.id, title: next.title, unitTitle: next.unitTitle, levelCode: next.levelCode } : null,
  };
}
