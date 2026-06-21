// 账号系统的内存版 Demo 数据
// ---------------------------------------------------------------------------
// 当 DATABASE_URL 未设置（无 Postgres）时，账号系统不能直接挂在 SQL 上。
// 这里提供一套进程内 Map-based 的最小实现，覆盖：
//   - 用户增删改查（包含密码 hash 验证）
//   - 会话生命周期
//   - 验证码 / 重置令牌
//   - 限流事件
//
// 任何 dev/preview 环境只要设置 DATABASE_URL，就会走真实数据库分支。
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import type {
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
  UserWithSecrets,
  VerificationCodeRecord,
  VerificationPurpose
} from './types';

// 用 globalThis 持久化，避免 HMR 重载导致 demo 数据丢失
interface DemoAuthState {
  users: Map<string, UserWithSecrets>; // id -> user
  usersByUsername: Map<string, string>; // lower(username) -> id
  usersByEmail: Map<string, string>; // lower(email) -> id
  usersByDisplayName: Map<string, string>; // display_name -> id
  usersByOAuth: Map<string, string>; // `${provider}:${subject}` -> id
  sessions: Map<string, SessionRecord>;
  codes: Map<string, VerificationCodeRecord>; // id -> code
  resets: Map<string, PasswordResetRecord>; // id -> reset
  rateEvents: { bucket: string; identifier: string; created_at: string }[];
}

const globalAny = globalThis as unknown as { __campusAuthDemo?: DemoAuthState };

function state(): DemoAuthState {
  if (!globalAny.__campusAuthDemo) {
    globalAny.__campusAuthDemo = {
      users: new Map(),
      usersByUsername: new Map(),
      usersByEmail: new Map(),
      usersByDisplayName: new Map(),
      usersByOAuth: new Map(),
      sessions: new Map(),
      codes: new Map(),
      resets: new Map(),
      rateEvents: []
    };
  }
  return globalAny.__campusAuthDemo;
}

export function demoGenerateId(prefix = '') {
  return `${prefix}${randomBytes(12).toString('hex')}`;
}

export function demoNowIso() {
  return new Date().toISOString();
}

export function demoSha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function demoCreateUser(user: UserWithSecrets): UserWithSecrets {
  const s = state();
  s.users.set(user.id, user);
  if (user.username) s.usersByUsername.set(user.username.toLowerCase(), user.id);
  if (user.email) s.usersByEmail.set(user.email.toLowerCase(), user.id);
  s.usersByDisplayName.set(user.display_name, user.id);
  if (user.oauth_provider && user.oauth_subject) {
    s.usersByOAuth.set(`${user.oauth_provider}:${user.oauth_subject}`, user.id);
  }
  return user;
}

export function demoGetUserById(id: string): UserWithSecrets | null {
  return state().users.get(id) ?? null;
}

export function demoGetUserByUsername(username: string): UserWithSecrets | null {
  const id = state().usersByUsername.get(username.toLowerCase());
  return id ? state().users.get(id) ?? null : null;
}

export function demoGetUserByEmail(email: string): UserWithSecrets | null {
  const id = state().usersByEmail.get(email.toLowerCase());
  return id ? state().users.get(id) ?? null : null;
}

export function demoGetUserByDisplayName(name: string): UserWithSecrets | null {
  const id = state().usersByDisplayName.get(name);
  return id ? state().users.get(id) ?? null : null;
}

export function demoGetUserByOAuth(provider: string, subject: string): UserWithSecrets | null {
  const id = state().usersByOAuth.get(`${provider}:${subject}`);
  return id ? state().users.get(id) ?? null : null;
}

export function demoUpdateUser(id: string, patch: Partial<UserWithSecrets>): UserWithSecrets | null {
  const s = state();
  const existing = s.users.get(id);
  if (!existing) return null;
  // 维护索引一致
  if (patch.username !== undefined && patch.username !== existing.username) {
    if (existing.username) s.usersByUsername.delete(existing.username.toLowerCase());
    if (patch.username) s.usersByUsername.set(patch.username.toLowerCase(), id);
  }
  if (patch.email !== undefined && patch.email !== existing.email) {
    if (existing.email) s.usersByEmail.delete(existing.email.toLowerCase());
    if (patch.email) s.usersByEmail.set(patch.email.toLowerCase(), id);
  }
  if (patch.display_name !== undefined && patch.display_name !== existing.display_name) {
    s.usersByDisplayName.delete(existing.display_name);
    s.usersByDisplayName.set(patch.display_name, id);
  }
  const next: UserWithSecrets = { ...existing, ...patch, updated_at: demoNowIso() };
  s.users.set(id, next);
  return next;
}

export function demoStripSecrets(user: UserWithSecrets | null): UserRecord | null {
  if (!user) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...rest } = user;
  return rest;
}

// --- sessions ---
export function demoCreateSession(session: SessionRecord): SessionRecord {
  state().sessions.set(session.id, session);
  return session;
}

export function demoGetSession(id: string): SessionRecord | null {
  return state().sessions.get(id) ?? null;
}

export function demoDeleteSession(id: string) {
  state().sessions.delete(id);
}

export function demoDeleteUserSessions(userId: string) {
  const s = state();
  for (const [id, session] of s.sessions) {
    if (session.user_id === userId) s.sessions.delete(id);
  }
}

// --- verification codes ---
export function demoCreateCode(code: VerificationCodeRecord): VerificationCodeRecord {
  state().codes.set(code.id, code);
  return code;
}

export function demoFindActiveCode(identifier: string, purpose: VerificationPurpose): VerificationCodeRecord | null {
  const s = state();
  let latest: VerificationCodeRecord | null = null;
  for (const code of s.codes.values()) {
    if (code.identifier.toLowerCase() === identifier.toLowerCase() && code.purpose === purpose && !code.consumed_at) {
      if (!latest || new Date(code.created_at) > new Date(latest.created_at)) {
        latest = code;
      }
    }
  }
  return latest;
}

export function demoUpdateCode(id: string, patch: Partial<VerificationCodeRecord>) {
  const s = state();
  const existing = s.codes.get(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  s.codes.set(id, next);
  return next;
}

export function demoDeleteExpiredCodes() {
  const s = state();
  const now = Date.now();
  for (const [id, code] of s.codes) {
    if (new Date(code.expires_at).getTime() < now) s.codes.delete(id);
  }
}

// --- password resets ---
export function demoCreateReset(reset: PasswordResetRecord) {
  state().resets.set(reset.id, reset);
  return reset;
}

export function demoGetReset(id: string) {
  return state().resets.get(id) ?? null;
}

export function demoMarkResetUsed(id: string) {
  const s = state();
  const existing = s.resets.get(id);
  if (!existing) return null;
  const next = { ...existing, used_at: demoNowIso() };
  s.resets.set(id, next);
  return next;
}

// --- rate limit events ---
export function demoAddRateEvent(bucket: string, identifier: string) {
  const s = state();
  s.rateEvents.push({ bucket, identifier, created_at: demoNowIso() });
  // 防止内存膨胀：只保留近 24 小时
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  s.rateEvents = s.rateEvents.filter((evt) => new Date(evt.created_at).getTime() > cutoff);
}

export function demoCountRateEvents(bucket: string, identifier: string, windowMs: number): number {
  const s = state();
  const cutoff = Date.now() - windowMs;
  let count = 0;
  for (const evt of s.rateEvents) {
    if (evt.bucket === bucket && evt.identifier === identifier && new Date(evt.created_at).getTime() > cutoff) {
      count++;
    }
  }
  return count;
}
