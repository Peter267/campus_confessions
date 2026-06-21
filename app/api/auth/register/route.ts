// POST /api/auth/register
// 用户注册：用户名 + 邮箱 + 密码 + 昵称
// 成功后会：
//   1. 创建 users 记录
//   2. 发送邮箱验证邮件（含 magic link）
//   3. 自动登录并下发 session cookie
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, validatePasswordStrength } from '@/lib/passwords';
import { createUser, getUserByDisplayName, getUserByEmail, getUserByUsername } from '@/lib/users';
import { registerSchema } from '@/lib/auth-validators';
import { buildSessionCookie, generateSessionId, signSessionToken, SESSION_TTL_SECONDS } from '@/lib/session';
import { createSession } from '@/lib/sessions';
import { hitRateLimit, rateLimitPresets } from '@/lib/rate-limit';
import { resolveClientIp } from '@/lib/moderation';
import { sendMagicLink, packMagicToken } from '@/lib/mail';
import { verifyCaptcha } from '@/lib/captcha';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = resolveClientIp(request.headers);
  const limit = await hitRateLimit({ bucket: 'auth:register', identifier: ip, ...rateLimitPresets.register });
  if (!limit.allowed) {
    return NextResponse.json({ error: `操作过于频繁，请 ${Math.ceil(limit.resetMs / 1000)} 秒后再试` }, { status: 429 });
  }

  const turnstile = await verifyCaptcha(
    { turnstileToken: parsed.data.turnstileToken, geetest: (body as { geetest?: null }).geetest ?? null },
    ip
  );
  if (!turnstile.ok) {
    return NextResponse.json({ error: '人机验证失败，请重试', details: turnstile.errors }, { status: 400 });
  }

  const passwordCheck = validatePasswordStrength(parsed.data.password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.reason }, { status: 400 });
  }

  if (await getUserByUsername(parsed.data.username)) {
    return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
  }
  if (await getUserByEmail(parsed.data.email)) {
    return NextResponse.json({ error: '邮箱已被注册' }, { status: 409 });
  }
  if (await getUserByDisplayName(parsed.data.displayName)) {
    return NextResponse.json({ error: '昵称已被占用，请换一个' }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await createUser({
    username: parsed.data.username,
    email: parsed.data.email,
    passwordHash,
    displayName: parsed.data.displayName,
    role: 'user'
  });

  // 自动登录（HttpOnly cookie）
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgent = request.headers.get('user-agent') ?? null;
  await createSession({ id: sessionId, userId: user.id, userAgent, ip, expiresAt });

  // 发送验证邮件（dev 模式会把链接直接返回给客户端便于测试）
  const packed = packMagicToken(parsed.data.email, 'email_verify');
  const mail = await sendMagicLink({ email: parsed.data.email, token: packed.token, purpose: 'email_verify' });

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.json({
    user: stripSecrets(user),
    emailVerification: {
      sent: mail.ok,
      transport: mail.transport,
      previewUrl: mail.previewUrl,
      previewToken: mail.previewToken
    }
  });
  res.headers.append('Set-Cookie', buildSessionCookie(signSessionToken(sessionId), { secure }));
  return res;
}

function stripSecrets<T extends { password_hash: string; password_algo: string }>(user: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...rest } = user;
  return rest;
}
