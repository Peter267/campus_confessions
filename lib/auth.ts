// 鉴权工具
// ---------------------------------------------------------------------------
// 1. `isAdminRequest`：保持原有 x-admin-token 头部校验，
//    仅适用于后台/管理端紧急入口，不依赖账号系统。
// 2. `getCurrentUser`：基于 cookie 中的 sessionId 查询当前用户，
//    适用于所有需要登录身份的接口。
// 3. `requireUser`：在 API 路由中以一致的方式返回 401。
// ---------------------------------------------------------------------------

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, getSession } from './sessions';
import { getUserById } from './users';
import { verifySessionToken, SESSION_COOKIE, SESSION_TTL_MS } from './session';
import type { UserRecord, UserWithSecrets } from './types';

export function getAdminTokenFromRequest(request: NextRequest) {
  const headerToken = request.headers.get('x-admin-token') ?? '';
  // 标准 Request 没有 nextUrl；测试里也常见裸 Request，所以兜空
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
  // Vercel 会在生产环境把协议放在 x-forwarded-proto
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.toLowerCase() === 'https';
  if (request.nextUrl.protocol === 'https:') return true;
  return process.env.NODE_ENV === 'production';
}

export async function getSessionIdFromCookies(): Promise<string | null> {
  try {
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE)?.value;
    if (!cookie) return null;
    return verifySessionToken(cookie);
  } catch {
    // 非请求上下文（如测试直接调用路由处理器）时 cookies() 会抛错，安全降级为未登录
    return null;
  }
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  const user = await getUserById(session.user_id);
  if (!user) return null;
  if (user.status !== 'active') return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = user;
  return publicView;
}

export async function getCurrentUserWithSecrets(): Promise<UserWithSecrets | null> {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return getUserById(session.user_id);
}

export interface RequireUserResult {
  user: UserRecord;
  sessionId: string;
}

export async function requireUser(): Promise<RequireUserResult | NextResponse> {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: '会话无效或已过期' }, { status: 401 });
  }
  const user = await getUserById(session.user_id);
  if (!user) {
    return NextResponse.json({ error: '账号不存在' }, { status: 401 });
  }
  if (user.status !== 'active') {
    // 状态异常的账号不允许继续使用
    await deleteSession(sessionId);
    return NextResponse.json({ error: '账号已被封禁或停用' }, { status: 403 });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = user;
  return { user: publicView, sessionId };
}

export function isRequireUserResponse(value: RequireUserResult | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export { SESSION_COOKIE, SESSION_TTL_MS };
