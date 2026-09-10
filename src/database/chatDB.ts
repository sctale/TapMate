import * as SQLite from "expo-sqlite";
import { genUuid } from "../constants";
import type { ChatMessage, ChatSession } from "../types";

// ===== 会话与消息持久化（expo-sqlite，与 TapLedger 同款）=====

let db: SQLite.SQLiteDatabase | null = null;

// 初始化数据库（幂等）
export async function initChatDB(): Promise<void> {
  if (db) return;
  db = await SQLite.openDatabaseAsync("tapmate.db");
  await db.execAsync(`
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
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  `);
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
  await db!.runAsync(
    "INSERT INTO sessions (id, title, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [s.id, s.title, s.providerId, s.modelId, s.createdAt, s.updatedAt],
  );
  return s;
}

// 会话列表（按更新时间倒序）
export async function listSessions(): Promise<ChatSession[]> {
  const rows = await db!.getAllAsync<{
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
  const like = `%${keyword.replace(/[%_\\]/g, "")}%`;
  const rows = await db!.getAllAsync<{
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
  await db!.runAsync("DELETE FROM messages WHERE session_id = ?", [id]);
  await db!.runAsync("DELETE FROM sessions WHERE id = ?", [id]);
}

// 删除某时间戳之后的 assistant 回复（「重新生成」用，audit-17）
export async function deleteAssistantAfter(
  sessionId: string,
  ts: number,
): Promise<void> {
  await db!.runAsync(
    "DELETE FROM messages WHERE session_id = ? AND role = 'assistant' AND created_at >= ?",
    [sessionId, ts],
  );
}

// 追加消息
export async function addMessage(
  sessionId: string,
  msg: ChatMessage,
): Promise<void> {
  await db!.runAsync(
    "INSERT INTO messages (id, session_id, role, content, model_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      msg.id,
      sessionId,
      msg.role,
      msg.content,
      msg.modelId ?? null,
      msg.error ?? null,
      msg.createdAt,
    ],
  );
  // 首条用户消息作为会话标题（截断 20 字）
  if (msg.role === "user") {
    await db!.runAsync(
      `UPDATE sessions SET updated_at = ?,
       title = CASE WHEN title = '新对话' THEN substr(?, 1, 20) ELSE title END
       WHERE id = ?`,
      [Date.now(), msg.content, sessionId],
    );
  }
}

// 更新消息内容（流式完成 / 错误回填）
export async function updateMessage(
  id: string,
  content: string,
  error?: string,
): Promise<void> {
  await db!.runAsync(
    "UPDATE messages SET content = ?, error = ? WHERE id = ?",
    [content, error ?? null, id],
  );
}

// 读取会话消息
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const rows = await db!.getAllAsync<{
    id: string;
    role: string;
    content: string;
    model_id: string | null;
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
    error: r.error ?? undefined,
    createdAt: r.created_at,
  }));
}
