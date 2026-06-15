import { NextRequest } from 'next/server';

export function getAdminTokenFromRequest(request: NextRequest) {
  return request.headers.get('x-admin-token') ?? request.nextUrl.searchParams.get('token') ?? '';
}

export function isAdminRequest(request: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    // 安全兜底：未配置 ADMIN_TOKEN 时拒绝所有管理请求，
    // 并在服务端打印一次性警告，便于本地开发发现配置缺失。
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] ADMIN_TOKEN 未设置，管理接口默认拒绝。');
    }
    return false;
  }

  return getAdminTokenFromRequest(request) === expected;
}
