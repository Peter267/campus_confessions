// 会话（cookie）数据访问层
// ---------------------------------------------------------------------------
// 设计要点：
//   1. sessionId 是 32 字节随机 hex；DB 仅存原值以便 O(1) 查询
//   2. cookie 值 = `<sessionId>.<HMAC>`，签名在 session.ts 中处理
//   3. 通过 sessions.user_id 的外键，删除用户时自动级联清理会话
//   4. 登录成功后调用 pruneExpired 清理历史垃圾
// ---------------------------------------------------------------------------

import { sql } from './db';
import { demoCreateSession, demoDeleteSession, demoDeleteUserSessions, demoGetSession } from './demo-auth';
import { demoNowIso } from './demo-auth';
import type { SessionRecord } from './types';

function rowToSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at ?? demoNowIso()),
    user_agent: (row.user_agent as string | null) ?? null,
    ip: (row.ip as string | null) ?? null
  };
}

export async function createSession(input: {
  id: string;
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
  expiresAt: Date;
}): Promise<SessionRecord> {
  if (sql) {
    const rows = (await sql`
      insert into sessions (id, user_id, token_hash, user_agent, ip, expires_at)
      values (${input.id}, ${input.userId}, ${input.userId}, ${input.userAgent ?? null}, ${input.ip ?? null}, ${input.expiresAt.toISOString()})
      returning *
    `) as Record<string, unknown>[];
    return rowToSession(rows[0]);
  }
  return demoCreateSession({
    id: input.id,
    user_id: input.userId,
    user_agent: input.userAgent ?? null,
    ip: input.ip ?? null,
    expires_at: input.expiresAt.toISOString(),
    created_at: demoNowIso()
  });
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from sessions
      where id = ${id} and expires_at > now()
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToSession(rows[0]) : null;
  }
  const session = demoGetSession(id);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    demoDeleteSession(id);
    return null;
  }
  return session;
}

export async function deleteSession(id: string) {
  if (sql) {
    await sql`delete from sessions where id = ${id}`;
    return;
  }
  demoDeleteSession(id);
}

export async function deleteUserSessions(userId: string) {
  if (sql) {
    await sql`delete from sessions where user_id = ${userId}`;
    return;
  }
  demoDeleteUserSessions(userId);
}

export async function listUserSessions(userId: string): Promise<SessionRecord[]> {
  if (sql) {
    const rows = (await sql`
      select *
      from sessions
      where user_id = ${userId} and expires_at > now()
      order by created_at desc
    `) as Record<string, unknown>[];
    return rows.map(rowToSession);
  }
  // demo 模式：仅维护一份简单列表
  return [];
}

export async function pruneExpiredSessions() {
  if (sql) {
    await sql`delete from sessions where expires_at <= now()`;
  }
  // demo 模式由 getSession 惰性清理
}
