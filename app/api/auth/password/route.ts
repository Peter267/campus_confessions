// POST /api/auth/password
// 已登录用户修改密码。需要提供旧密码。
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithSecrets, isRequireUserResponse, requireUser } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/auth-validators';
import { hashPassword, validatePasswordStrength } from '@/lib/passwords';
import { updateUser } from '@/lib/users';
import { deleteUserSessions } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const passwordCheck = validatePasswordStrength(parsed.data.newPassword);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.reason }, { status: 400 });
  }

  const fullUser = await getCurrentUserWithSecrets();
  if (!fullUser) {
    return NextResponse.json({ error: '账号不存在' }, { status: 401 });
  }

  const { verifyPassword } = await import('@/lib/passwords');
  const ok = await verifyPassword(parsed.data.oldPassword, fullUser.password_hash);
  if (!ok) {
    return NextResponse.json({ error: '当前密码不正确' }, { status: 401 });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await updateUser(auth.user.id, { passwordHash: newHash });

  // 修改密码后让所有其它设备重新登录（保留当前 session 不强制下线）
  await deleteUserSessions(auth.user.id);
  // 当前 session 也要重建一次
  const { createSession, getSession } = await import('@/lib/sessions');
  const { generateSessionId, signSessionToken, buildSessionCookie, SESSION_TTL_SECONDS } = await import('@/lib/session');
  const { resolveClientIp } = await import('@/lib/moderation');
  const old = await getSession(auth.sessionId);
  if (old) {
    const newId = generateSessionId();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    await createSession({
      id: newId,
      userId: auth.user.id,
      userAgent: old.user_agent,
      ip: resolveClientIp(request.headers),
      expiresAt
    });
    const res = NextResponse.json({ ok: true });
    res.headers.append('Set-Cookie', buildSessionCookie(signSessionToken(newId), { secure: process.env.NODE_ENV === 'production' }));
    return res;
  }
  return NextResponse.json({ ok: true });
}
