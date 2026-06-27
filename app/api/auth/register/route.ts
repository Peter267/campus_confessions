// POST /api/auth/register
// 用户注册：用户名 + 邮箱 + 密码 + 昵称
// 成功后：
//   1. 创建 users 记录（含 password_hash）
//   2. 生成 verification_token 并通过 Resend 发送邮箱验证邮件
//   3. 客户端跳转到 /login 完成登录（避免在 server action 中调用 signIn）
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { hashPassword, validatePasswordStrength } from '@/lib/passwords';
import { registerSchema } from '@/lib/auth-validators';
import { hitRateLimit, rateLimitPresets } from '@/lib/rate-limit';
import { resolveClientIp } from '@/lib/moderation';
import { verifyCaptcha } from '@/lib/captcha';
import { sendAuthEmail, buildAuthUrl } from '@/lib/auth/resend';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
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

    if (!sql) {
      return NextResponse.json({ error: '数据库未配置，无法注册', detail: 'DATABASE_URL is not set' }, { status: 500 });
    }

    // 唯一性校验
    const usernameConflict = (await sql`select id from users where lower(username) = lower(${parsed.data.username}) limit 1`) as { id: string }[];
    if (usernameConflict[0]) {
      return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
    }
    const emailConflict = (await sql`select id from users where lower(email) = lower(${parsed.data.email}) limit 1`) as { id: string }[];
    if (emailConflict[0]) {
      return NextResponse.json({ error: '邮箱已被注册' }, { status: 409 });
    }
    const nameConflict = (await sql`select id from users where display_name = ${parsed.data.displayName} limit 1`) as { id: string }[];
    if (nameConflict[0]) {
      return NextResponse.json({ error: '昵称已被占用，请换一个' }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const rows = (await sql`
      insert into users (username, email, password_hash, password_algo, display_name, role, status, email_verified_at)
      values (
        ${parsed.data.username},
        ${parsed.data.email},
        ${passwordHash},
        'scrypt-sha256',
        ${parsed.data.displayName},
        'user',
        'active',
        null
      )
      returning id, username, email, display_name
    `) as { id: string; username: string; email: string; display_name: string }[];
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ error: '创建用户失败' }, { status: 500 });
    }

    // 生成 verification_token（10 分钟有效）
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await sql`
      insert into verification_tokens (identifier, token, expires)
      values (${parsed.data.email}, ${token}, ${expires.toISOString()})
    `;

    const verifyUrl = buildAuthUrl({ type: 'email_verify', token, email: parsed.data.email });
    const mail = await sendAuthEmail({ to: parsed.data.email, url: verifyUrl, type: 'email_verify' });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name },
      emailVerification: {
        sent: mail.ok,
        transport: mail.transport,
        previewUrl: mail.previewUrl
      },
      // 客户端跳转到登录页完成登录
      next: '/login'
    });
  } catch (err) {
    console.error('register error', err);
    return NextResponse.json(
      { error: '注册服务异常，请稍后重试', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
