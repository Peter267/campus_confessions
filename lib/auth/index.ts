// Auth.js v5 主入口 + 兼容旧 lib/auth.ts 的工具函数
// ---------------------------------------------------------------------------
// 本文件合并了两个职责：
//   1. Auth.js v5 主入口：导出 handlers / auth / signIn / signOut / authConfig
//   2. 业务鉴权工具（向后兼容原 lib/auth.ts 的 API）：
//      getCurrentUser / requireUser / getCurrentUserWithSecrets /
//      isRequireUserResponse / isAdminRequest / getAdminTokenFromRequest /
//      isSecureRequest / getSessionIdFromCookies / SESSION_COOKIE / SESSION_TTL_MS
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './config';
import { createAdapter } from './adapter';
import { credentialsProvider } from './password-provider';
import { getUserById } from '../users';
import type { UserRecord, UserWithSecrets } from '../types';

// === Auth.js 主对象 ===
// 在 edge-safe authConfig 基础上注入 adapter 和 providers。
// 这些模块依赖 node:crypto，只能在 Node.js runtime（route handler）中使用，
// 不能被 middleware 引入。
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: createAdapter(),
  providers: [credentialsProvider]
});
export { authConfig };

// === 兼容旧引用 ===
// Auth.js 实际 cookie 名为 next-auth.session-token
export const SESSION_COOKIE = 'next-auth.session-token';
export const SESSION_TTL_MS = 60 * 60 * 24 * 30 * 1000; // 30 天

export function getAdminTokenFromRequest(request: NextRequest) {
  const headerToken = request.headers.get('x-admin-token') ?? '';
  const queryToken = (() => {
    try {
      return request.nextUrl?.searchParams?.get('token') ?? '';
    } catch {
      return '';
    }
  })();
  return headerToken || queryToken;
}

export function isAdminRequest(request: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] ADMIN_TOKEN 未设置，管理接口默认拒绝。');
    }
    return false;
  }
  return getAdminTokenFromRequest(request) === expected;
}

export function isSecureRequest(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.toLowerCase() === 'https';
  if (request.nextUrl.protocol === 'https:') return true;
  return process.env.NODE_ENV === 'production';
}

// 返回当前 session 对应的 user id（替代旧 getSessionIdFromCookies）
export async function getSessionIdFromCookies(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function stripSecrets(user: UserWithSecrets): UserRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...rest } = user;
  return rest;
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    const user = await getUserById(session.user.id);
    if (!user) return null;
    if (user.status !== 'active') return null;
    return stripSecrets(user);
  } catch {
    return null;
  }
}

export async function getCurrentUserWithSecrets(): Promise<UserWithSecrets | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return getUserById(session.user.id);
  } catch {
    return null;
  }
}

export interface RequireUserResult {
  user: UserRecord;
  sessionId: string;
}

export async function requireUser(): Promise<RequireUserResult | NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
    }
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '账号不存在' }, { status: 401 });
    }
    if (user.status !== 'active') {
      return NextResponse.json({ error: '账号已被封禁或停用' }, { status: 403 });
    }
    return { user: stripSecrets(user), sessionId: session.user.id };
  } catch (err) {
    console.error('[requireUser] error', err);
    return NextResponse.json({ error: '鉴权异常' }, { status: 500 });
  }
}

export function isRequireUserResponse(value: RequireUserResult | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
