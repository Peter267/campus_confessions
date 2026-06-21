// POST /api/auth/login
// 用户名/邮箱 + 密码登录。错误密码会触发限流。
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/passwords';
import { getUserByEmail, getUserByUsername, updateUser } from '@/lib/users';
import { loginSchema } from '@/lib/auth-validators';
import { buildSessionCookie, generateSessionId, signSessionToken, SESSION_TTL_SECONDS } from '@/lib/session';
import { createSession } from '@/lib/sessions';
import { clearRateLimit, hitRateLimit, rateLimitPresets } from '@/lib/rate-limit';
import { resolveClientIp } from '@/lib/moderation';
import { verifyCaptcha } from '@/lib/captcha';
import type { UserWithSecrets } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = resolveClientIp(request.headers);
  const identifierKey = `${ip}|${parsed.data.identifier.toLowerCase()}`;
  const limit = await hitRateLimit({ bucket: 'auth:login', identifier: identifierKey, ...rateLimitPresets.login });
  if (!limit.allowed) {
    return NextResponse.json({ error: `尝试次数过多，请 ${Math.ceil(limit.resetMs / 1000)} 秒后再试` }, { status: 429 });
  }

  const turnstile = await verifyCaptcha(
    { turnstileToken: parsed.data.turnstileToken, geetest: (body as { geetest?: null }).geetest ?? null },
    ip
  );
  if (!turnstile.ok) {
    return NextResponse.json({ error: '人机验证失败，请重试', details: turnstile.errors }, { status: 400 });
  }

  const isEmail = parsed.data.identifier.includes('@');
  const user: UserWithSecrets | null = isEmail
    ? await getUserByEmail(parsed.data.identifier)
    : await getUserByUsername(parsed.data.identifier);

  // 注意：必须先做密码校验再区分用户是否存在，避免用户名枚举
  if (!user) {
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
  }

  if (user.status === 'suspended') {
    return NextResponse.json({ error: '账号已被临时停用，请联系管理员' }, { status: 403 });
  }
  if (user.status === 'closed') {
    return NextResponse.json({ error: '账号已注销' }, { status: 403 });
  }

  await updateUser(user.id, { lastLoginAt: new Date().toISOString(), lastLoginIp: ip });

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgent = request.headers.get('user-agent') ?? null;
  await createSession({ id: sessionId, userId: user.id, userAgent, ip, expiresAt });

  // 登录成功，清除该账号对应的限流计数
  await clearRateLimit('auth:login', identifierKey);

  const secure = process.env.NODE_ENV === 'production';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = user;
  publicView.last_login_at = new Date().toISOString();

  const res = NextResponse.json({ user: publicView });
  res.headers.append('Set-Cookie', buildSessionCookie(signSessionToken(sessionId), { secure }));
  return res;
}
