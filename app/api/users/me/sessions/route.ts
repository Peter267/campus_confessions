// /api/users/me/sessions
// 列出当前用户的所有活跃 session，并允许吊销其它设备。
import { NextRequest, NextResponse } from 'next/server';
import { getSessionIdFromCookies, isRequireUserResponse, requireUser } from '@/lib/auth';
import { deleteSession, listUserSessions } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;
  const sessions = await listUserSessions(auth.user.id);
  return NextResponse.json({ sessions: sessions.map((s) => ({ id: s.id, isCurrent: s.id === auth.sessionId, created_at: s.created_at, expires_at: s.expires_at, user_agent: s.user_agent, ip: s.ip })) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ error: '缺少会话 id' }, { status: 400 });
  }
  if (id === auth.sessionId) {
    return NextResponse.json({ error: '请使用退出登录接口' }, { status: 400 });
  }
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
