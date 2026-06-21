// POST /api/auth/magic-link/send
// 邮箱魔法链接登录：向邮箱发送一次性登录链接。
// 设计要点：
//   1. 无论邮箱是否注册都返回 200，避免邮箱枚举
//   2. dev 模式下把链接直接返回到响应体，便于本地测试
//   3. 复用 packMagicToken / sendMagicLink，purpose 使用 'email_magic'
import { NextRequest, NextResponse } from 'next/server';
import { forgotPasswordSchema } from '@/lib/auth-validators';
import { getUserByEmail } from '@/lib/users';
import { hitRateLimit, rateLimitPresets } from '@/lib/rate-limit';
import { resolveClientIp } from '@/lib/moderation';
import { sendMagicLink, packMagicToken } from '@/lib/mail';
import { verifyCaptcha } from '@/lib/captcha';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = resolveClientIp(request.headers);
  const limit = await hitRateLimit({ bucket: 'auth:magic-link', identifier: ip, ...rateLimitPresets.reset });
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

  const user = await getUserByEmail(parsed.data.email);
  // 即便用户不存在也返回 200，避免暴露邮箱是否注册
  if (!user) {
    return NextResponse.json({ ok: true });
  }
  if (user.status !== 'active') {
    return NextResponse.json({ ok: true });
  }

  const packed = packMagicToken(parsed.data.email, 'email_magic');
  const mail = await sendMagicLink({ email: parsed.data.email, token: packed.token, purpose: 'email_magic' });
  return NextResponse.json({
    ok: true,
    transport: mail.transport,
    previewUrl: mail.previewUrl,
    previewToken: mail.previewToken
  });
}
