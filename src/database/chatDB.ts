import * as SQLite from "expo-sqlite";
import { genUuid } from "../constants";
import type { ChatMessage, ChatSession } from "../types";

// ===== 会话与消息持久化（expo-sqlite，与 TapLedger 同款）=====
// v0.3.0：懒初始化 ensureDb()（调用方无需关心建表时序）；messages 增加
// reasoning / provider_id 列（老库 ALTER 迁移）；新增 provider_models 表存动态模型列表

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const d = await SQLite.openDatabaseAsync("tapmate.db");
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_id TEXT,
      provider_id TEXT,
      reasoning TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE TABLE IF NOT EXISTS provider_models (
      provider_id TEXT PRIMARY KEY,
      model_ids TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  // 老库补列：列已存在时 SQLite 报错，忽略即可
  for (const col of ["provider_id TEXT", "reasoning TEXT"]) {
    try {
      await d.execAsync(`ALTER TABLE messages ADD COLUMN ${col}`);
    } catch {
      /* 已有该列 */
    }
  }
  return d;
}

function ensureDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = openAndMigrate();
  return dbPromise;
}

// 初始化数据库（幂等；各函数内部已自动 ensure，保留导出兼容旧调用）
export async function initChatDB(): Promise<void> {
  await ensureDb();
}

// 创建会话
export async function createSession(
  providerId: string,
  modelId: string,
  title = "新对话",
): Promise<ChatSession> {
  const s: ChatSession = {
    id: genUuid(),
    title,
    providerId,
    modelId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const db = await ensureDb();
  await db.runAsync(
    "INSERT INTO sessions (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [s.id, s.title, s.providerId, s.modelId, s.createdAt, s.updatedAt],
  );
  return s;
}

// 会话列表（按更新时间倒序）
export async function listSessions(): Promise<ChatSession[]> {
  const db = await ensureDb();
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    provider_id: string;
    model_id: string;
    created_at: number;
    updated_at: number;
  }>("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 100");
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    providerId: r.provider_id,
    modelId: r.model_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// 搜索会话：标题或任意消息内容命中（audit-16）
export async function searchSessions(keyword: string): Promise<ChatSession[]> {
  const db = await ensureDb();
  const like = `%${keyword.replace(/[%_\\]/g, "")}%`;
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    provider_id: string;
    model_id: string;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT DISTINCT s.id, s.title, s.provider_id, s.model_id, s.created_at, s.updated_at
     FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
     WHERE s.title LIKE ? OR m.content LIKE ?
     ORDER BY s.updated_at DESC LIMIT 100`,
    [like, like],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    providerId: r.provider_id,
    modelId: r.model_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// 删除会话及其消息
export async function deleteSession(id: string): Promise<void> {
  const db = await ensureDb();
  await db.runAsync("DELETE FROM messages WHERE session_id = ?", [id]);
  await db.runAsync("DELETE FROM sessions WHERE id = ?", [id]);
}

// 删除某时间戳之后的 assistant 回复（「重新生成」用，audit-17）
export async function deleteAssistantAfter(
  sessionId: string,
  ts: number,
): Promise<void> {
  const db = await ensureDb();
  await db.runAsync(
    "DELETE FROM messages WHERE session_id = ? AND role = 'assistant' AND created_at >= ?",
    [sessionId, ts],
  );
}

// 追加消息
export async function addMessage(
  sessionId: string,
  msg: ChatMessage,
): Promise<void> {
  const db = await ensureDb();
  await db.runAsync(
    "INSERT INTO messages (id, session_id, role, content, model_id, provider_id, reasoning, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      msg.id,
      sessionId,
      msg.role,
      msg.content,
      msg.modelId ?? null,
      msg.providerId ?? null,
      msg.reasoning ?? null,
      msg.error ?? null,
      msg.createdAt,
    ],
  );
  // 首条用户消息作为会话标题（截断 20 字）
  if (msg.role === "user") {
    await db.runAsync(
      `UPDATE sessions SET updated_at = ?,
       title = CASE WHEN title = '新对话' THEN substr(?, 1, 20) ELSE title END
       WHERE id = ?`,
      [Date.now(), msg.content, sessionId],
    );
  }
}

// 更新消息内容（流式完成 / 错误回填 / 思考过程）
export async function updateMessage(
  id: string,
  content: string,
  error?: string,
  reasoning?: string,
): Promise<void> {
  const db = await ensureDb();
  await db.runAsync(
    "UPDATE messages SET content = ?, error = ?, reasoning = ? WHERE id = ?",
    [content, error ?? null, reasoning ?? null, id],
  );
}

// 读取会话消息
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await ensureDb();
  const rows = await db.getAllAsync<{
    id: string;
    role: string;
    content: string;
    model_id: string | null;
    provider_id: string | null;
    reasoning: string | null;
    error: string | null;
    created_at: number;
  }>("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC", [
    sessionId,
  ]);
  return rows.map((r) => ({
    id: r.id,
    role: r.role as ChatMessage["role"],
    content: r.content,
    modelId: r.model_id ?? undefined,
    providerId: r.provider_id ?? undefined,
    reasoning: r.reasoning ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
  }));
}

// ===== 动态模型列表（v0.3.0）=====
// 不存 SecureStore（Android 单条约 2KB 上限），模型 id 列表放 SQLite

export async function setModelIds(
  providerId: string,
  ids: string[],
): Promise<void> {
  const db = await ensureDb();
  await db.runAsync(
    `INSERT INTO provider_models (provider_id, model_ids, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET model_ids = excluded.model_ids, synced_at = excluded.synced_at`,
    [providerId, JSON.stringify(ids), Date.now()],
  );
}

export async function getModelIds(
  providerId: string,
): Promise<string[] | null> {
  const db = await ensureDb();
  const row = await db.getFirstAsync<{ model_ids: string }>(
    "SELECT model_ids FROM provider_models WHERE provider_id = ?",
    [providerId],
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.model_ids);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearModelIds(providerId: string): Promise<void> {
  const db = await ensureDb();
  await db.runAsync("DELETE FROM provider_models WHERE provider_id = ?", [
    providerId,
  ]);
}
