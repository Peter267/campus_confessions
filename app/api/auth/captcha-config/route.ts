// GET /api/auth/captcha-config
// 公开接口：返回当前启用的人机验证方式与前端所需的 site key / captcha id。
import { NextResponse } from 'next/server';
import { getCaptchaConfig } from '@/lib/captcha';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = await getCaptchaConfig();
  return NextResponse.json({
    provider: config.provider,
    turnstileSiteKey: config.turnstileSiteKey,
    geetestCaptchaId: config.geetestCaptchaId
  });
}
