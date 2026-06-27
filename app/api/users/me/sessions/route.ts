// /api/users/me/sessions
// 列出当前用户的所有活跃 session，并允许吊销其它设备。
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isRequireUserResponse, requireUser } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface DbSessionRow {
  session_token: string;
  user_id: string;
  expires: Date | string;
}

export async function GET() {
  const authResult = await requireUser();
  if (isRequireUserResponse(authResult)) return authResult;

  if (!sql) {
    return NextResponse.json({ sessions: [] });
  }

  const rows = (await sql`
    select session_token, user_id, expires
    from sessions
    where user_id = ${authResult.user.id}::uuid and expires > now()
    order by expires desc
  `) as DbSessionRow[];

  // 当前 session token（用于标记 isCurrent）
  const cookieStore = await cookies();
  const currentToken = cookieStore.get('next-auth.session-token')?.value
    ?? cookieStore.get('__Secure-next-auth.session-token')?.value
    ?? null;

  return NextResponse.json({
    sessions: rows.map((s) => ({
      id: s.session_token,
      isCurrent: s.session_token === currentToken,
      expires: s.expires instanceof Date ? s.expires.toISOString() : String(s.expires)
    }))
  });
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireUser();
  if (isRequireUserResponse(authResult)) return authResult;

  const body = await request.json().catch(() => ({}));
  const token = typeof body.id === 'string' ? body.id : '';
  if (!token) {
    return NextResponse.json({ error: '缺少会话 id' }, { status: 400 });
  }

  // 不允许通过此接口删除当前 session（请用退出登录）
  const cookieStore = await cookies();
  const currentToken = cookieStore.get('next-auth.session-token')?.value
    ?? cookieStore.get('__Secure-next-auth.session-token')?.value
    ?? null;
  if (token === currentToken) {
    return NextResponse.json({ error: '请使用退出登录接口' }, { status: 400 });
  }

  if (!sql) {
    return NextResponse.json({ error: '数据库未配置' }, { status: 500 });
  }

  await sql`
    delete from sessions
    where session_token = ${token}
      and user_id = ${authResult.user.id}::uuid
  `;
  return NextResponse.json({ ok: true });
}
