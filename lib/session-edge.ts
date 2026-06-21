// Edge 兼容的会话签名校验
// ---------------------------------------------------------------------------
// middleware.ts 默认运行在 Edge runtime，访问不到 node:crypto 模块。
// 这里用 Web Crypto API（globalThis.crypto.subtle）做 HMAC，Node 18+ 与
// 浏览器/Worker 端都可用。
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = 'campus_session';

export function getSessionSecretEdge(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be at least 16 chars in production');
  }
  return 'dev-only-insecure-session-secret-please-change';
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa 在 Node 18+ 和 Edge runtime 都可用
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function hmacEdge(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSessionSecretEdge()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifySessionTokenEdge(signed: string | undefined | null): Promise<string | null> {
  if (!signed || typeof signed !== 'string') return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0 || dot === signed.length - 1) return null;
  const token = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const expected = await hmacEdge(token);
  return constantTimeEqual(sig, expected) ? token : null;
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE.length + 1));
    }
  }
  return null;
}
