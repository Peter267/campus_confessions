// /api/admin/captcha
// GET  : 读取当前人机验证配置（含敏感字段存在性标记）
// PUT  : 更新人机验证配置（superadmin / admin / ADMIN_TOKEN）
import { NextRequest, NextResponse } from 'next/server';
import { assertSiteSettingsAdmin, getRequestMeta } from '@/lib/site-settings';
import {
  getCaptchaConfig,
  getCaptchaSecretFlags,
  updateCaptchaSettings,
  type CaptchaProvider
} from '@/lib/captcha';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await assertSiteSettingsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const config = await getCaptchaConfig();
  const flags = await getCaptchaSecretFlags();
  return NextResponse.json({
    provider: config.provider,
    turnstileSiteKey: config.turnstileSiteKey,
    geetestCaptchaId: config.geetestCaptchaId,
    hasTurnstileSecret: flags.hasTurnstileSecret,
    hasGeetestKey: flags.hasGeetestKey
  });
}

export async function PUT(request: NextRequest) {
  const auth = await assertSiteSettingsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await request.json().catch(() => ({}));
  const provider = (body.provider as CaptchaProvider) ?? 'none';
  const result = await updateCaptchaSettings(
    {
      provider,
      turnstileSiteKey: typeof body.turnstileSiteKey === 'string' ? body.turnstileSiteKey : null,
      turnstileSecret: typeof body.turnstileSecret === 'string' && body.turnstileSecret ? body.turnstileSecret : null,
      geetestCaptchaId: typeof body.geetestCaptchaId === 'string' ? body.geetestCaptchaId : null,
      geetestCaptchaKey: typeof body.geetestCaptchaKey === 'string' && body.geetestCaptchaKey ? body.geetestCaptchaKey : null
    },
    auth.actor
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const meta = getRequestMeta(request);
  // 写审计日志（复用 site_settings_audit 表）
  try {
    const { writeAuditLog } = await import('@/lib/site-settings');
    await writeAuditLog('captcha', 'update', { actor: auth.actor, ip: meta.ip, userAgent: meta.userAgent }, null, {
      provider: result.config.provider,
      turnstileSiteKey: result.config.turnstileSiteKey,
      geetestCaptchaId: result.config.geetestCaptchaId
    });
  } catch {
    // 审计日志失败不影响主流程
  }
  return NextResponse.json({ ok: true, config: result.config });
}
