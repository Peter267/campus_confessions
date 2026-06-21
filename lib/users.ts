// 用户数据访问层
// ---------------------------------------------------------------------------
// 同时支持 SQL 模式（DATABASE_URL 已配置）与 demo 内存模式，
// 所有外部调用方都通过这里的函数读写用户数据。
// ---------------------------------------------------------------------------

import { sql } from './db';
import {
  demoCreateUser,
  demoGetUserByDisplayName,
  demoGetUserByEmail,
  demoGetUserById,
  demoGetUserByOAuth,
  demoGetUserByUsername,
  demoNowIso,
  demoStripSecrets,
  demoUpdateUser
} from './demo-auth';
import type { UserRecord, UserRole, UserWithSecrets } from './types';

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
    created_at: String(row.created_at ?? demoNowIso()),
    updated_at: String(row.updated_at ?? demoNowIso())
  };
}

export function stripSecrets(user: UserWithSecrets | null): UserRecord | null {
  return demoStripSecrets(user);
}

export interface CreateUserInput {
  username: string | null;
  email: string | null;
  passwordHash: string;
  displayName: string;
  role?: UserRole;
  emailVerifiedAt?: string | null;
  oauthProvider?: string | null;
  oauthSubject?: string | null;
}

export async function createUser(input: CreateUserInput): Promise<UserWithSecrets> {
  if (sql) {
    const rows = (await sql`
      insert into users (username, email, password_hash, display_name, role, status, email_verified_at, oauth_provider, oauth_subject)
      values (
        ${input.username},
        ${input.email},
        ${input.passwordHash},
        ${input.displayName},
        ${input.role ?? 'user'},
        'active',
        ${input.emailVerifiedAt ?? null},
        ${input.oauthProvider ?? null},
        ${input.oauthSubject ?? null}
      )
      returning *
    `) as Record<string, unknown>[];
    return rowToUser(rows[0]);
  }

  return demoCreateUser({
    id: `demo-user-${Math.random().toString(36).slice(2, 10)}`,
    username: input.username,
    email: input.email,
    password_hash: input.passwordHash,
    password_algo: 'scrypt-sha256',
    display_name: input.displayName,
    avatar_url: null,
    bio: null,
    role: input.role ?? 'user',
    status: 'active',
    oauth_provider: input.oauthProvider ?? null,
    oauth_subject: input.oauthSubject ?? null,
    email_verified_at: input.emailVerifiedAt ?? null,
    last_login_at: null,
    last_login_ip: null,
    created_at: demoNowIso(),
    updated_at: demoNowIso()
  });
}

export async function getUserById(id: string): Promise<UserWithSecrets | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from users
      where id = ${id}
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return demoGetUserById(id);
}

export async function getUserByUsername(username: string): Promise<UserWithSecrets | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from users
      where lower(username) = lower(${username})
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return demoGetUserByUsername(username);
}

export async function getUserByEmail(email: string): Promise<UserWithSecrets | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from users
      where lower(email) = lower(${email})
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return demoGetUserByEmail(email);
}

export async function getUserByDisplayName(name: string): Promise<UserWithSecrets | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from users
      where display_name = ${name}
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return demoGetUserByDisplayName(name);
}

export async function getUserByOAuth(provider: string, subject: string): Promise<UserWithSecrets | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from users
      where oauth_provider = ${provider} and oauth_subject = ${subject}
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return demoGetUserByOAuth(provider, subject);
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
  if (sql) {
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
      `update users set ${sets.join(', ')} where id = $${i} returning *`,
      ...params
    )) as Record<string, unknown>[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  const patchAny: Partial<UserWithSecrets> = {};
  if (patch.displayName !== undefined) patchAny.display_name = patch.displayName;
  if (patch.bio !== undefined) patchAny.bio = patch.bio;
  if (patch.avatarUrl !== undefined) patchAny.avatar_url = patch.avatarUrl;
  if (patch.email !== undefined) patchAny.email = patch.email;
  if (patch.username !== undefined) patchAny.username = patch.username;
  if (patch.emailVerifiedAt !== undefined) patchAny.email_verified_at = patch.emailVerifiedAt;
  if (patch.passwordHash !== undefined) patchAny.password_hash = patch.passwordHash;
  if (patch.lastLoginAt !== undefined) patchAny.last_login_at = patch.lastLoginAt;
  if (patch.lastLoginIp !== undefined) patchAny.last_login_ip = patch.lastLoginIp;
  if (patch.role !== undefined) patchAny.role = patch.role;
  if (patch.status !== undefined) patchAny.status = patch.status;
  return demoUpdateUser(id, patchAny);
}

export async function findUsersByPrefix(prefix: string, limit = 8): Promise<UserRecord[]> {
  // 用于 @mention 类型的搜索，限演示 / 后台使用
  if (sql) {
    const rows = (await sql`
      select *
      from users
      where display_name ilike ${`${prefix}%`}
      order by created_at desc
      limit ${Math.min(Math.max(limit, 1), 50)}
    `) as Record<string, unknown>[];
    return rows.map((row) => stripSecrets(rowToUser(row)) as UserRecord);
  }
  return [];
}

// 后台用户管理：分页列出所有用户
export async function listUsers(limit = 50, offset = 0): Promise<UserRecord[]> {
  if (sql) {
    const rows = (await sql`
      select *
      from users
      order by created_at desc
      limit ${Math.min(Math.max(limit, 1), 200)}
      offset ${Math.max(offset, 0)}
    `) as Record<string, unknown>[];
    return rows.map((row) => stripSecrets(rowToUser(row)) as UserRecord);
  }
  return [];
}

export async function countUsers(): Promise<number> {
  if (sql) {
    const rows = (await sql`select count(*)::int as cnt from users`) as { cnt: number }[];
    return rows[0]?.cnt ?? 0;
  }
  return 0;
}
