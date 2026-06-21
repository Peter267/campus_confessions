// POST /api/auth/password/reset
// 使用邮件里的 token 重置密码。
// 成功后自动登录并下发新的 session cookie。
import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordSchema } from '@/lib/auth-validators';
import { unpackMagicToken } from '@/lib/mail';
import { getUserByEmail, updateUser } from '@/lib/users';
import { hashPassword, validatePasswordStrength } from '@/lib/passwords';
import { buildSessionCookie, generateSessionId, signSessionToken, SESSION_TTL_SECONDS } from '@/lib/session';
import { createSession, deleteUserSessions } from '@/lib/sessions';
import { resolveClientIp } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const unpacked = unpackMagicToken(parsed.data.token);
  if (!unpacked || unpacked.purpose !== 'reset_password') {
    return NextResponse.json({ error: '链接已失效，请重新申请' }, { status: 400 });
  }

  const passwordCheck = validatePasswordStrength(parsed.data.password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.reason }, { status: 400 });
  }

  const user = await getUserByEmail(unpacked.identifier);
  if (!user) {
    return NextResponse.json({ error: '账号不存在' }, { status: 404 });
  }

  const newHash = await hashPassword(parsed.data.password);
  await updateUser(user.id, { passwordHash: newHash });
  // 吊销所有已有 session，强制其它设备重新登录
  await deleteUserSessions(user.id);

  // 颁发新 session
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgent = request.headers.get('user-agent') ?? null;
  const ip = resolveClientIp(request.headers);
  await createSession({ id: sessionId, userId: user.id, userAgent, ip, expiresAt });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = user;

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.json({ ok: true, user: publicView });
  res.headers.append('Set-Cookie', buildSessionCookie(signSessionToken(sessionId), { secure }));
  return res;
}
