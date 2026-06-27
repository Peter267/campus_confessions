// 验证码（邮箱 / 重置密码令牌等）数据访问层
// ---------------------------------------------------------------------------
// 验证码使用 SHA-256(明文 + 服务端 pepper) 形式存储。
// 校验时不暴露原值，且永远只与最新未使用记录比较。
// 短时有效（10 分钟）+ 次数限制（5 次）防止暴力爆破。
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';
import {
  demoCreateCode,
  demoDeleteExpiredCodes,
  demoFindActiveCode,
  demoNowIso,
  demoUpdateCode
} from './demo-auth';
import type { VerificationCodeRecord, VerificationPurpose } from './types';

const DEFAULT_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function codePepper() {
  // 与 SESSION_SECRET 隔离，避免共因失效
  return process.env.VERIFICATION_PEPPER || 'campus-default-verification-pepper';
}

export function hashCode(plain: string) {
  return createHash('sha256').update(`${codePepper()}::${plain}`).digest('hex');
}

export function generateNumericCode(length = 6) {
  // 0-pad 防首位为 0 时变短
  let out = '';
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export interface CreateCodeInput {
  identifier: string;
  purpose: VerificationPurpose;
  plain: string;
  ttlMinutes?: number;
  payload?: Record<string, unknown> | null;
}

function rowToCode(row: Record<string, unknown>): VerificationCodeRecord {
  return {
    id: String(row.id),
    identifier: String(row.identifier),
    purpose: String(row.purpose) as VerificationPurpose,
    code_hash: String(row.code_hash),
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    consumed_at: (row.consumed_at as string | null) ?? null,
    expires_at: String(row.expires_at),
    created_at: String(row.created_at ?? demoNowIso())
  };
}

export async function createVerificationCode(input: CreateCodeInput): Promise<VerificationCodeRecord> {
  const ttl = (input.ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttl);
  const codeHash = hashCode(input.plain);
  const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
  if (sql) {
    // 同一个 (identifier, purpose) 只保留最新一条，先把过期的置为 consumed
    await sql`
      update verification_codes
      set consumed_at = coalesce(consumed_at, now())
      where identifier = ${input.identifier} and purpose = ${input.purpose} and consumed_at is null
    `;
    const rows = (await sql`
      insert into verification_codes (identifier, purpose, code_hash, token_hash, payload, expires_at)
      values (${input.identifier}, ${input.purpose}, ${codeHash}, ${input.identifier}, ${payloadJson}::jsonb, ${expiresAt.toISOString()})
      returning *
    `) as Record<string, unknown>[];
    return rowToCode(rows[0]);
  }
  demoDeleteExpiredCodes();
  return demoCreateCode({
    id: `demo-code-${Math.random().toString(36).slice(2, 10)}`,
    identifier: input.identifier,
    purpose: input.purpose,
    code_hash: codeHash,
    payload: input.payload ?? null,
    attempts: 0,
    consumed_at: null,
    expires_at: expiresAt.toISOString(),
    created_at: demoNowIso()
  });
}

export async function findActiveCode(identifier: string, purpose: VerificationPurpose): Promise<VerificationCodeRecord | null> {
  if (sql) {
    const rows = (await sql`
      select *
      from verification_codes
      where lower(identifier) = lower(${identifier})
        and purpose = ${purpose}
        and consumed_at is null
        and expires_at > now()
        and attempts < ${MAX_ATTEMPTS}
      order by created_at desc
      limit 1
    `) as Record<string, unknown>[];
    return rows[0] ? rowToCode(rows[0]) : null;
  }
  return demoFindActiveCode(identifier, purpose);
}

export interface CodeVerifyResult {
  ok: boolean;
  reason?: 'not_found' | 'expired' | 'mismatch' | 'too_many';
  code?: VerificationCodeRecord;
}

export async function verifyCode(identifier: string, purpose: VerificationPurpose, plain: string): Promise<CodeVerifyResult> {
  const code = await findActiveCode(identifier, purpose);
  if (!code) {
    return { ok: false, reason: 'not_found' };
  }
  if (new Date(code.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (code.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many', code };
  }
  if (code.code_hash !== hashCode(plain)) {
    // 失败尝试 +1（用于爆破防护）
    await incrementCodeAttempts(code.id);
    return { ok: false, reason: 'mismatch', code };
  }
  return { ok: true, code };
}

export async function incrementCodeAttempts(id: string) {
  if (sql) {
    await sql`update verification_codes set attempts = attempts + 1 where id = ${id}`;
    return;
  }
  demoUpdateCode(id, { attempts: (demoUpdateCode(id, {})?.attempts ?? 0) + 1 });
}

export async function consumeCode(id: string) {
  if (sql) {
    await sql`update verification_codes set consumed_at = now() where id = ${id}`;
    return;
  }
  demoUpdateCode(id, { consumed_at: demoNowIso() });
}
