import { NextRequest } from 'next/server';

export function getAdminTokenFromRequest(request: NextRequest) {
  return request.headers.get('x-admin-token') ?? request.nextUrl.searchParams.get('token') ?? '';
}

export function isAdminRequest(request: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return true;
  }

  return getAdminTokenFromRequest(request) === expected;
}
