// POST /api/auth/password/forgot
// 接收邮箱地址，向对应账号发送重置密码的 magic link。
// 为了避免邮箱枚举，无论账号是否存在都返回 200；只在 dev 模式返回 previewUrl。
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

  const user = await getUserByEmail(parsed.data.email);
  // 即便用户不存在也返回 200，避免暴露邮箱是否注册
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const packed = packMagicToken(parsed.data.email, 'reset_password');
  const mail = await sendMagicLink({ email: parsed.data.email, token: packed.token, purpose: 'reset_password' });
  return NextResponse.json({
    ok: true,
    transport: mail.transport,
    previewUrl: mail.previewUrl,
    previewToken: mail.previewToken
  });
}
