// POST /api/auth/password/forgot
// 接收邮箱地址，向对应账号发送重置密码的链接。
// 为了避免邮箱枚举，无论账号是否存在都返回 200；只在 dev 模式返回 previewUrl。
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { forgotPasswordSchema } from '@/lib/auth-validators';
import { hitRateLimit, rateLimitPresets } from '@/lib/rate-limit';
import { resolveClientIp } from '@/lib/moderation';
import { verifyCaptcha } from '@/lib/captcha';
import { sendAuthEmail, buildAuthUrl } from '@/lib/auth/resend';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
    }

    const ip = resolveClientIp(request.headers);
    const limit = await hitRateLimit({ bucket: 'auth:reset', identifier: ip, ...rateLimitPresets.reset });
    if (!limit.allowed) {
      return NextResponse.json({ error: `请求过于频繁，请 ${Math.ceil(limit.resetMs / 1000)} 秒后再试` }, { status: 429 });
    }

    const turnstile = await verifyCaptcha(
      { turnstileToken: parsed.data.turnstileToken, geetest: (body as { geetest?: null }).geetest ?? null },
      ip
    );
    if (!turnstile.ok) {
      return NextResponse.json({ error: '人机验证失败，请重试', details: turnstile.errors }, { status: 400 });
    }

    if (!sql) {
      return NextResponse.json({ ok: true });
    }

    const userRows = (await sql`select email from users where lower(email) = lower(${parsed.data.email}) limit 1`) as { email: string }[];
    // 即便用户不存在也返回 200，避免暴露邮箱是否注册
    if (!userRows[0]) {
      return NextResponse.json({ ok: true });
    }

    // 生成 reset_password token（30 分钟有效）
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    await sql`
      insert into verification_tokens (identifier, token, expires)
      values (${parsed.data.email}, ${token}, ${expires.toISOString()})
    `;

    const resetUrl = buildAuthUrl({ type: 'reset_password', token, email: parsed.data.email });
    const mail = await sendAuthEmail({ to: parsed.data.email, url: resetUrl, type: 'reset_password' });
    return NextResponse.json({
      ok: true,
      transport: mail.transport,
      previewUrl: mail.previewUrl
    });
  } catch (err) {
    console.error('forgot-password error', err);
    return NextResponse.json(
      { error: '服务异常', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
