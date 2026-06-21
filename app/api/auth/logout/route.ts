// POST /api/auth/logout
// 删除当前 session 并清除 cookie。
import { NextRequest, NextResponse } from 'next/server';
import { getSessionIdFromCookies } from '@/lib/auth';
import { buildClearSessionCookie } from '@/lib/session';
import { deleteSession } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const sessionId = await getSessionIdFromCookies();
  if (sessionId) {
    await deleteSession(sessionId);
  }
  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', buildClearSessionCookie(secure));
  return res;
}
