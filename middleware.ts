// 全局 middleware
// ---------------------------------------------------------------------------
// 1. 校验 session cookie 签名，识别未登录用户并把 /profile 类页面重定向到 /login
// 2. 已在登录态访问 /login、/register 时重定向到 /
// 3. 不命中数据库，因此仅做签名/格式校验，具体账号是否有效由 page 自己处理
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { readSessionCookie, verifySessionTokenEdge } from '@/lib/session-edge';

const PROTECTED_PATHS = ['/profile'];
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieHeader = request.headers.get('cookie');
  const signed = readSessionCookie(cookieHeader);
  const sessionId = signed ? await verifySessionTokenEdge(signed) : null;

  if (PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    if (!sessionId) {
      const url = new URL('/login', request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (sessionId && AUTH_PATHS.some((path) => pathname === path)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email'
  ]
};
