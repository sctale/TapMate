import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { getUserRow, publicUser, todayStr } from '../helpers.js';
import type { UserRow } from '../helpers.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位'),
  nickname: z.string().min(1, '请填写昵称').max(20, '昵称最多 20 个字'),
});

router.post('/register', (req, res) => {
  const body = registerSchema.parse(req.body);
  const email = body.email.toLowerCase();
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (exists) {
    res.status(400).json({ error: '该邮箱已注册，请直接登录' });
    return;
  }
  const hash = bcrypt.hashSync(body.password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)')
    .run(email, hash, body.nickname);
  const user = getUserRow(Number(info.lastInsertRowid))!;
  res.json({ token: signToken({ id: user.id, email: user.email, nickname: user.nickname }), user: publicUser(user) });
});

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请填写密码'),
});

router.post('/login', (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email.toLowerCase()) as
    | UserRow
    | undefined;
  if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
    res.status(400).json({ error: '邮箱或密码错误' });
    return;
  }
  res.json({ token: signToken({ id: user.id, email: user.email, nickname: user.nickname }), user: publicUser(user) });
});

/** 当前用户信息（含在读语言与待复习数） */
router.get('/me', requireAuth, (req, res) => {
  const user = getUserRow(req.user!.id);
  if (!user) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  const languages = db
    .prepare(
      `SELECT lg.code, lg.name, lg.flag, lv.code AS level_code
       FROM user_languages ul
       JOIN languages lg ON lg.id = ul.language_id
       LEFT JOIN levels lv ON lv.id = ul.current_level_id
       WHERE ul.user_id = ?`
    )
    .all(user.id) as Array<{ code: string; name: string; flag: string; level_code: string | null }>;
  const dueCount = (
    db
      .prepare('SELECT COUNT(*) AS c FROM user_vocab_stats WHERE user_id = ? AND due_at <= ?')
      .get(user.id, todayStr()) as { c: number }
  ).c;
  res.json({ user: publicUser(user), languages, dueCount });
});

router.put('/me', requireAuth, (req, res) => {
  const body = z.object({ nickname: z.string().min(1, '请填写昵称').max(20, '昵称最多 20 个字') }).parse(req.body);
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(body.nickname, req.user!.id);
  const user = getUserRow(req.user!.id)!;
  res.json({ user: publicUser(user) });
});

export default router;
