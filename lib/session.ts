// 会话管理：负责生成、签名、校验会话令牌
// ---------------------------------------------------------------------------
// 设计要点：
//   1. Cookie 值 = `<sessionId>.<HMAC-SHA256(sessionId, SESSION_SECRET)>` 形式
//      - 服务端拿到 cookie 后只需一次 HMAC 校验即可识别真伪
//      - HMAC 是对称算法，签名只有持有 SESSION_SECRET 的服务端能生成
//      - 数据库只保存 sessionId（无签名），即使 DB 泄露也不暴露 cookie 真值
//   2. sessionId 为 32 字节随机 hex，碰撞概率可忽略
//   3. 默认 30 天有效期，每次活跃访问时滑动续期（不实现，仅写 TTL）
//   4. HttpOnly + SameSite=Lax 防止 XSS/CSRF；Secure 由调用方按环境控制
// ---------------------------------------------------------------------------

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'campus_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET 必须至少 16 字符且不可为默认值');
  }
  // 本地开发兜底：保证首次启动不报错，但打印警告
  // eslint-disable-next-line no-console
  console.warn('[auth] SESSION_SECRET 未设置，已使用开发兜底密钥，请勿用于生产');
  return 'dev-only-insecure-session-secret-please-change';
}

export function generateSessionId() {
  return randomBytes(32).toString('hex');
}

function hmac(token: string) {
  return createHmac('sha256', getSessionSecret()).update(token).digest('base64url');
}

export function signSessionToken(token: string) {
  return `${token}.${hmac(token)}`;
}

export function verifySessionToken(signed: string | undefined | null): string | null {
  if (!signed || typeof signed !== 'string') return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0 || dot === signed.length - 1) return null;
  const token = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  // 必须是 64 位 hex，避免被随意传入超长字符串拖性能
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const expected = hmac(token);
  if (sig.length !== expected.length) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return timingSafeEqual(a, b) ? token : null;
  } catch {
    return null;
  }
}

export interface CookieOptions {
  secure: boolean;
  maxAgeSeconds?: number;
}

export function buildSessionCookie(value: string, options: CookieOptions) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (options.secure) parts.push('Secure');
  parts.push(`Max-Age=${options.maxAgeSeconds ?? SESSION_TTL_SECONDS}`);
  return parts.join('; ');
}

export function buildClearSessionCookie(secure: boolean) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
