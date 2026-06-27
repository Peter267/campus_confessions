// Auth.js v5 自定义数据库适配器
// ---------------------------------------------------------------------------
// 实现思路：
//   - 复用 lib/db.ts 的 neon sql helper，不引入 Prisma / Drizzle
//   - users 表保持现有字段结构不变（uuid 主键 + display_name / avatar_url 等）
//   - 字段映射：
//       Auth.js `name`         ↔ users.display_name
//       Auth.js `image`        ↔ users.avatar_url
//       Auth.js `emailVerified` ↔ users.email_verified_at
//   - 自定义扩展字段：username / bio / role / status / last_login_at / last_login_ip
// ---------------------------------------------------------------------------

import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from 'next-auth/adapters';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import type { UserRole, UserStatus } from '@/lib/types';

interface DbUser {
  id: string;
  username: string | null;
  email: string | null;
  email_verified_at: Date | string | null;
  password_hash: string;
  password_algo: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  status: UserStatus;
  oauth_provider: string | null;
  oauth_subject: string | null;
  last_login_at: Date | string | null;
  last_login_ip: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DbSession {
  session_token: string;
  user_id: string;
  expires: Date | string;
}

interface DbAccount {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  provider_account_id: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
}

interface DbVerificationToken {
  identifier: string;
  token: string;
  expires: Date | string;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value: Date | string | null): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

// DB 行 -> AdapterUser
function dbUserToAdapterUser(row: DbUser): AdapterUser {
  return {
    id: String(row.id),
    name: row.display_name || null,
    email: row.email || null,
    emailVerified: toDate(row.email_verified_at),
    image: row.avatar_url || null,
    // 自定义字段透传
    ...(row.username ? { username: row.username } : {}),
    ...(row.bio !== null ? { bio: row.bio } : {}),
    ...(row.role ? { role: row.role } : {}),
    ...(row.status ? { status: row.status } : {})
  } as AdapterUser & { username?: string; bio?: string | null; role?: string; status?: string };
}

function dbSessionToAdapterSession(row: DbSession): AdapterSession {
  return {
    sessionToken: row.session_token,
    userId: String(row.user_id),
    expires: toDate(row.expires) ?? new Date()
  };
}

function dbAccountToAdapterAccount(row: DbAccount): AdapterAccount {
  return {
    provider: row.provider,
    type: row.type as AdapterAccount['type'],
    providerAccountId: row.provider_account_id,
    userId: String(row.user_id),
    ...(row.refresh_token ? { refresh_token: row.refresh_token } : {}),
    ...(row.access_token ? { access_token: row.access_token } : {}),
    ...(row.expires_at !== null ? { expires_at: row.expires_at } : {}),
    ...(row.token_type ? { token_type: row.token_type } : {}),
    ...(row.scope ? { scope: row.scope } : {}),
    ...(row.id_token ? { id_token: row.id_token } : {}),
    ...(row.session_state ? { session_state: row.session_state } : {})
  } as AdapterAccount;
}

function dbVerificationToAdapter(row: DbVerificationToken): VerificationToken {
  return {
    identifier: row.identifier,
    token: row.token,
    expires: toDate(row.expires) ?? new Date()
  };
}

// ---------------------------------------------------------------------------
// Adapter 实现
// ---------------------------------------------------------------------------

export function createAdapter(): Adapter {
  return {
    async createUser(user) {
      if (!sql) throw new Error('Database not configured');
      const id = user.id ?? randomUUID();
      const name = user.name ?? '';
      const email = user.email ?? null;
      const emailVerified = user.emailVerified;
      const image = user.image ?? null;
      // 扩展字段（自定义用户携带过来）
      const username = (user as AdapterUser & { username?: string }).username ?? null;
      const bio = (user as AdapterUser & { bio?: string | null }).bio ?? null;
      const role = (user as AdapterUser & { role?: string }).role ?? 'user';
      const passwordHash = (user as AdapterUser & { password_hash?: string }).password_hash ?? '';
      const rows = (await sql`
        insert into users (id, username, email, email_verified_at, password_hash, display_name, avatar_url, bio, role, status)
        values (
          ${id}::uuid,
          ${username},
          ${email},
          ${emailVerified ? emailVerified.toISOString() : null},
          ${passwordHash},
          ${name},
          ${image},
          ${bio},
          ${role},
          'active'
        )
        returning *
      `) as DbUser[];
      return dbUserToAdapterUser(rows[0]);
    },

    async getUser(id) {
      if (!sql) return null;
      const rows = (await sql`
        select * from users where id = ${id}::uuid limit 1
      `) as DbUser[];
      return rows[0] ? dbUserToAdapterUser(rows[0]) : null;
    },

    async getUserByEmail(email) {
      if (!sql) return null;
      const rows = (await sql`
        select * from users where lower(email) = lower(${email}) limit 1
      `) as DbUser[];
      return rows[0] ? dbUserToAdapterUser(rows[0]) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      if (!sql) return null;
      const rows = (await sql`
        select u.* from users u
        join accounts a on a.user_id = u.id
        where a.provider = ${provider} and a.provider_account_id = ${providerAccountId}
        limit 1
      `) as DbUser[];
      return rows[0] ? dbUserToAdapterUser(rows[0]) : null;
    },

    async updateUser(user) {
      if (!sql) throw new Error('Database not configured');
      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (user.name !== undefined) {
        sets.push(`display_name = $${i++}`);
        params.push(user.name);
      }
      if (user.email !== undefined) {
        sets.push(`email = $${i++}`);
        params.push(user.email);
      }
      if (user.emailVerified !== undefined) {
        sets.push(`email_verified_at = $${i++}`);
        params.push(user.emailVerified ? user.emailVerified.toISOString() : null);
      }
      if (user.image !== undefined) {
        sets.push(`avatar_url = $${i++}`);
        params.push(user.image);
      }
      // 扩展字段
      const ext = user as AdapterUser & {
        username?: string;
        bio?: string | null;
        role?: string;
        status?: string;
        password_hash?: string;
        last_login_at?: Date | string | null;
        last_login_ip?: string | null;
      };
      if (ext.username !== undefined) {
        sets.push(`username = $${i++}`);
        params.push(ext.username);
      }
      if (ext.bio !== undefined) {
        sets.push(`bio = $${i++}`);
        params.push(ext.bio);
      }
      if (ext.role !== undefined) {
        sets.push(`role = $${i++}`);
        params.push(ext.role);
      }
      if (ext.status !== undefined) {
        sets.push(`status = $${i++}`);
        params.push(ext.status);
      }
      if (ext.password_hash !== undefined) {
        sets.push(`password_hash = $${i++}`);
        params.push(ext.password_hash);
      }
      if (ext.last_login_at !== undefined) {
        sets.push(`last_login_at = $${i++}`);
        params.push(toIso(ext.last_login_at as Date | string | null));
      }
      if (ext.last_login_ip !== undefined) {
        sets.push(`last_login_ip = $${i++}`);
        params.push(ext.last_login_ip);
      }
      if (sets.length === 0) {
        const rows = (await sql`select * from users where id = ${user.id}::uuid limit 1`) as DbUser[];
        return dbUserToAdapterUser(rows[0]);
      }
      sets.push(`updated_at = now()`);
      params.push(user.id);
      const unsafe = (sql as unknown as { unsafe: (q: string, ...params: unknown[]) => Promise<unknown> }).unsafe;
      const rows = (await unsafe(
        `update users set ${sets.join(', ')} where id = $${i}::uuid returning *`,
        ...params
      )) as DbUser[];
      return dbUserToAdapterUser(rows[0]);
    },

    async deleteUser(id) {
      if (!sql) return null;
      const rows = (await sql`
        delete from users where id = ${id}::uuid returning *
      `) as DbUser[];
      return rows[0] ? dbUserToAdapterUser(rows[0]) : null;
    },

    async linkAccount(account) {
      if (!sql) return;
      await sql`
        insert into accounts (
          user_id, type, provider, provider_account_id,
          refresh_token, access_token, expires_at, token_type, scope, id_token, session_state
        ) values (
          ${account.userId}::uuid,
          ${account.type},
          ${account.provider},
          ${account.providerAccountId},
          ${account.refresh_token ?? null},
          ${account.access_token ?? null},
          ${account.expires_at ?? null},
          ${account.token_type ?? null},
          ${account.scope ?? null},
          ${account.id_token ?? null},
          ${account.session_state ?? null}
        )
      `;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      if (!sql) return;
      await sql`
        delete from accounts
        where provider = ${provider} and provider_account_id = ${providerAccountId}
      `;
    },

    async createSession(session) {
      if (!sql) throw new Error('Database not configured');
      await sql`
        insert into sessions (session_token, user_id, expires)
        values (
          ${session.sessionToken},
          ${session.userId}::uuid,
          ${session.expires.toISOString()}
        )
      `;
      return session;
    },

    async getSessionAndUser(sessionToken) {
      if (!sql) return null;
      // 先取 session
      const sessionRows = (await sql`
        select session_token, user_id, expires
        from sessions
        where session_token = ${sessionToken} and expires > now()
        limit 1
      `) as DbSession[];
      const s = sessionRows[0];
      if (!s) return null;
      // 再取 user
      const userRows = (await sql`
        select * from users where id = ${s.user_id}::uuid limit 1
      `) as DbUser[];
      if (!userRows[0]) return null;
      return {
        session: dbSessionToAdapterSession(s),
        user: dbUserToAdapterUser(userRows[0])
      };
    },

    async updateSession(session) {
      if (!sql) return null;
      const updates: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (session.expires) {
        updates.push(`expires = $${i++}`);
        params.push(session.expires instanceof Date ? session.expires.toISOString() : session.expires);
      }
      if (session.userId) {
        updates.push(`user_id = $${i++}::uuid`);
        params.push(session.userId);
      }
      if (updates.length === 0) {
        const rows = (await sql`select * from sessions where session_token = ${session.sessionToken} limit 1`) as DbSession[];
        return rows[0] ? dbSessionToAdapterSession(rows[0]) : null;
      }
      params.push(session.sessionToken);
      const unsafe = (sql as unknown as { unsafe: (q: string, ...params: unknown[]) => Promise<unknown> }).unsafe;
      const rows = (await unsafe(
        `update sessions set ${updates.join(', ')} where session_token = $${i} returning *`,
        ...params
      )) as DbSession[];
      return rows[0] ? dbSessionToAdapterSession(rows[0]) : null;
    },

    async deleteSession(sessionToken) {
      if (!sql) return;
      await sql`delete from sessions where session_token = ${sessionToken}`;
    },

    async createVerificationToken(verificationToken) {
      if (!sql) return;
      await sql`
        insert into verification_tokens (identifier, token, expires)
        values (
          ${verificationToken.identifier},
          ${verificationToken.token},
          ${verificationToken.expires instanceof Date ? verificationToken.expires.toISOString() : verificationToken.expires}
        )
      `;
      return verificationToken;
    },

    async useVerificationToken({ identifier, token }) {
      if (!sql) return null;
      const rows = (await sql`
        delete from verification_tokens
        where identifier = ${identifier} and token = ${token}
        returning *
      `) as DbVerificationToken[];
      return rows[0] ? dbVerificationToAdapter(rows[0]) : null;
    }
  };
}
