import { db } from './db.js';
import type { PublicUser } from './types.js';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  nickname: string;
  native_lang: string;
  xp: number;
  streak: number;
  last_active_date: string | null;
  created_at: string;
}

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 相对今天 offsetDays 天的日期串 */
export function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return todayStr(d);
}

export function userLevel(xp: number): number {
  return Math.floor(xp / 200) + 1;
}

/** 距离下一级的进度（0-100） */
export function levelProgress(xp: number): number {
  return Math.round(((xp % 200) / 200) * 100);
}

export function publicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    nativeLang: u.native_lang,
    xp: u.xp,
    level: userLevel(u.xp),
    levelProgress: levelProgress(u.xp),
    streak: u.streak,
    createdAt: u.created_at,
  };
}

export function getUserRow(userId: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
}

/** 更新连续打卡：今天已活跃则不变，昨天活跃则 +1，否则重置为 1 */
export function updateStreak(userId: number): number {
  const user = getUserRow(userId);
  if (!user) return 0;
  const today = todayStr();
  if (user.last_active_date === today) return user.streak;
  const streak = user.last_active_date === dateStr(-1) ? user.streak + 1 : 1;
  db.prepare('UPDATE users SET streak = ?, last_active_date = ? WHERE id = ?').run(streak, today, userId);
  return streak;
}

export interface ActivityPatch {
  minutes?: number;
  xp?: number;
  lessons?: number;
  words?: number;
}

/** 累加今日活动数据（UPSERT） */
export function touchDailyActivity(userId: number, patch: ActivityPatch): void {
  db.prepare(
    `INSERT INTO daily_activity (user_id, date, minutes, xp, lessons_done, words_learned)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       minutes = minutes + excluded.minutes,
       xp = xp + excluded.xp,
       lessons_done = lessons_done + excluded.lessons_done,
       words_learned = words_learned + excluded.words_learned`
  ).run(userId, todayStr(), patch.minutes ?? 0, patch.xp ?? 0, patch.lessons ?? 0, patch.words ?? 0);
}

export function addXp(userId: number, amount: number): void {
  db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(amount, userId);
}
