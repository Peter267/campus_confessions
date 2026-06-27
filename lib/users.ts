// 用户数据访问层
// ---------------------------------------------------------------------------
// Auth.js 重写版：只支持 SQL 模式（不再保留 demo 内存模式）。
// 所有写入操作（createUser / updateUser）已迁移到 lib/auth/adapter.ts，
// 本文件保留读取函数，供业务代码（getCurrentUser / API 路由）使用。
// ---------------------------------------------------------------------------

import { sql } from './db';
import type { UserRecord, UserRole, UserWithSecrets } from './types';

function nowIso() {
  return new Date().toISOString();
}

function rowToUser(row: Record<string, unknown>): UserWithSecrets {
  return {
    id: String(row.id),
    username: (row.username as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    email_verified_at: (row.email_verified_at as string | null) ?? null,
    password_hash: String(row.password_hash ?? ''),
    password_algo: String(row.password_algo ?? 'scrypt-sha256'),
    display_name: String(row.display_name ?? ''),
    avatar_url: (row.avatar_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    role: (row.role as UserRole) ?? 'user',
    status: ((row.status as string | undefined) ?? 'active') as UserWithSecrets['status'],
    oauth_provider: (row.oauth_provider as string | null) ?? null,
    oauth_subject: (row.oauth_subject as string | null) ?? null,
    last_login_at: (row.last_login_at as string | null) ?? null,
    last_login_ip: (row.last_login_ip as string | null) ?? null,
    created_at: String(row.created_at ?? nowIso()),
    updated_at: String(row.updated_at ?? nowIso())
  };
}

export function stripSecrets(user: UserWithSecrets | null): UserRecord | null {
  if (!user) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...rest } = user;
  return rest;
}

export async function getUserById(id: string): Promise<UserWithSecrets | null> {
  if (!sql) return null;
  const rows = (await sql`
    select *
    from users
    where id = ${id}::uuid
    limit 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByUsername(username: string): Promise<UserWithSecrets | null> {
  if (!sql) return null;
  const rows = (await sql`
    select *
    from users
    where lower(username) = lower(${username})
    limit 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<UserWithSecrets | null> {
  if (!sql) return null;
  const rows = (await sql`
    select *
    from users
    where lower(email) = lower(${email})
    limit 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByDisplayName(name: string): Promise<UserWithSecrets | null> {
  if (!sql) return null;
  const rows = (await sql`
    select *
    from users
    where display_name = ${name}
    limit 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByOAuth(provider: string, subject: string): Promise<UserWithSecrets | null> {
  if (!sql) return null;
  const rows = (await sql`
    select *
    from users
    where oauth_provider = ${provider} and oauth_subject = ${subject}
    limit 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export interface UpdateUserInput {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  username?: string | null;
  emailVerifiedAt?: string | null;
  passwordHash?: string;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  role?: UserRole;
  status?: UserWithSecrets['status'];
  oauthProvider?: string | null;
  oauthSubject?: string | null;
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<UserWithSecrets | null> {
  if (!sql) return null;
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.displayName !== undefined) {
    sets.push(`display_name = $${i++}`);
    params.push(patch.displayName);
  }
  if (patch.bio !== undefined) {
    sets.push(`bio = $${i++}`);
    params.push(patch.bio);
  }
  if (patch.avatarUrl !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    params.push(patch.avatarUrl);
  }
  if (patch.email !== undefined) {
    sets.push(`email = $${i++}`);
    params.push(patch.email);
  }
  if (patch.username !== undefined) {
    sets.push(`username = $${i++}`);
    params.push(patch.username);
  }
  if (patch.emailVerifiedAt !== undefined) {
    sets.push(`email_verified_at = $${i++}`);
    params.push(patch.emailVerifiedAt);
  }
  if (patch.passwordHash !== undefined) {
    sets.push(`password_hash = $${i++}`);
    params.push(patch.passwordHash);
  }
  if (patch.lastLoginAt !== undefined) {
    sets.push(`last_login_at = $${i++}`);
    params.push(patch.lastLoginAt);
  }
  if (patch.lastLoginIp !== undefined) {
    sets.push(`last_login_ip = $${i++}`);
    params.push(patch.lastLoginIp);
  }
  if (patch.role !== undefined) {
    sets.push(`role = $${i++}`);
    params.push(patch.role);
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`);
    params.push(patch.status);
  }
  if (patch.oauthProvider !== undefined) {
    sets.push(`oauth_provider = $${i++}`);
    params.push(patch.oauthProvider);
  }
  if (patch.oauthSubject !== undefined) {
    sets.push(`oauth_subject = $${i++}`);
    params.push(patch.oauthSubject);
  }
  if (sets.length === 0) {
    return getUserById(id);
  }
  sets.push(`updated_at = now()`);
  params.push(id);
  const unsafe = (sql as unknown as { unsafe: (q: string, ...params: unknown[]) => Promise<unknown> }).unsafe;
  const rows = (await unsafe(
    `update users set ${sets.join(', ')} where id = $${i}::uuid returning *`,
    ...params
  )) as Record<string, unknown>[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findUsersByPrefix(prefix: string, limit = 8): Promise<UserRecord[]> {
  if (!sql) return [];
  const rows = (await sql`
    select *
    from users
    where display_name ilike ${`${prefix}%`}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 50)}
  `) as Record<string, unknown>[];
  return rows.map((row) => stripSecrets(rowToUser(row)) as UserRecord);
}

// 后台用户管理：分页列出所有用户
export async function listUsers(limit = 50, offset = 0): Promise<UserRecord[]> {
  if (!sql) return [];
  const rows = (await sql`
    select *
    from users
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 200)}
    offset ${Math.max(offset, 0)}
  `) as Record<string, unknown>[];
  return rows.map((row) => stripSecrets(rowToUser(row)) as UserRecord);
}

export async function countUsers(): Promise<number> {
  if (!sql) return 0;
  const rows = (await sql`select count(*)::int as cnt from users`) as { cnt: number }[];
  return rows[0]?.cnt ?? 0;
}
