// POST /api/auth/email/send
// 重新发送验证邮件。已登录用户调用。
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isRequireUserResponse } from '@/lib/auth';
import { sendMagicLink, packMagicToken } from '@/lib/mail';
import { hitRateLimit, rateLimitPresets } from '@/lib/rate-limit';
import { resolveClientIp } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;
  if (!auth.user.email) {
    return NextResponse.json({ error: '当前账号未绑定邮箱' }, { status: 400 });
  }
  if (auth.user.email_verified_at) {
    return NextResponse.json({ error: '邮箱已验证，无需重复发送' }, { status: 400 });
  }

  const ip = resolveClientIp(request.headers);
  const limit = await hitRateLimit({ bucket: 'auth:email-send', identifier: ip, ...rateLimitPresets.emailSend });
  if (!limit.allowed) {
    return NextResponse.json({ error: `请 ${Math.ceil(limit.resetMs / 1000)} 秒后再试` }, { status: 429 });
  }

  const packed = packMagicToken(auth.user.email, 'email_verify');
  const mail = await sendMagicLink({ email: auth.user.email, token: packed.token, purpose: 'email_verify' });
  return NextResponse.json({
    sent: mail.ok,
    transport: mail.transport,
    previewUrl: mail.previewUrl,
    previewToken: mail.previewToken
  });
}
