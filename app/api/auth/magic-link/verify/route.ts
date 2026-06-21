// POST /api/auth/magic-link/verify
// 验证邮箱魔法链接 token，成功后自动登录并下发 session cookie。
import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailSchema } from '@/lib/auth-validators';
import { unpackMagicToken } from '@/lib/mail';
import { getUserByEmail, updateUser } from '@/lib/users';
import { buildSessionCookie, generateSessionId, signSessionToken, SESSION_TTL_SECONDS } from '@/lib/session';
import { createSession } from '@/lib/sessions';
import { resolveClientIp } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const unpacked = unpackMagicToken(parsed.data.token);
  if (!unpacked || unpacked.purpose !== 'email_magic') {
    return NextResponse.json({ error: '登录链接已失效，请重新申请' }, { status: 400 });
  }

  const user = await getUserByEmail(unpacked.identifier);
  if (!user) {
    return NextResponse.json({ error: '账号不存在' }, { status: 404 });
  }
  if (user.status !== 'active') {
    return NextResponse.json({ error: '账号已被停用或注销' }, { status: 403 });
  }

  const ip = resolveClientIp(request.headers);
  await updateUser(user.id, { lastLoginAt: new Date().toISOString(), lastLoginIp: ip });

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgent = request.headers.get('user-agent') ?? null;
  await createSession({ id: sessionId, userId: user.id, userAgent, ip, expiresAt });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = user;
  publicView.last_login_at = new Date().toISOString();

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.json({ user: publicView });
  res.headers.append('Set-Cookie', buildSessionCookie(signSessionToken(sessionId), { secure }));
  return res;
}

// GET /api/auth/magic-link/verify?token=...
// 邮件链接点击后跳转到 /login?magic=token，由前端表单调用 POST 完成登录
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const dest = new URL('/login', request.nextUrl);
  if (token) dest.searchParams.set('magic', token);
  return Response.redirect(dest, 302);
}
