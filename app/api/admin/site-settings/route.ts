// 站点级配置 API（超级管理员 / 紧急 ADMIN_TOKEN）
//   GET  /api/admin/site-settings        获取 SMTP 与各 OAuth 提供的公开配置
//   PUT  /api/admin/site-settings        body = { key: 'smtp' | 'oauth.<provider>', value: ... }
//   POST /api/admin/site-settings/test   body = { key, value, secret? } 测试连接

import { NextRequest, NextResponse } from 'next/server';
import { getOauthConfig, getSmtpConfig, listOauthConfigs, listSiteSettingsAudit, updateOauthConfig, updateSmtpConfig } from '@/lib/site-settings';
import { OAUTH_PROVIDER_DEFAULTS, OAUTH_PROVIDER_KEYS, OauthProviderKey, smtpConfigSchema, oauthProviderSchema } from '@/lib/validators';
import { assertSiteSettingsAdmin, getRequestMeta } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = await assertSiteSettingsAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [smtp, oauth, audit] = await Promise.all([
    getSmtpConfig(),
    listOauthConfigs(),
    listSiteSettingsAudit(50)
  ]);

  // 给前端附带默认值，方便"使用推荐值"按钮
  return NextResponse.json({
    smtp,
    oauth,
    oauthDefaults: OAUTH_PROVIDER_DEFAULTS,
    oauthProviders: OAUTH_PROVIDER_KEYS,
    audit
  });
}

export async function PUT(request: NextRequest) {
  const auth = await assertSiteSettingsAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: '请求体必须为 JSON' }, { status: 400 });
  const key = String(body.key ?? '');
  const value = body.value;
  const meta = { ...getRequestMeta(request), actor: auth.actor };

  if (key === 'smtp') {
    const parsed = smtpConfigSchema.safeParse(value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'SMTP 配置不合法', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const result = await updateSmtpConfig(parsed.data, meta);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ key, config: result.config });
  }

  if (key.startsWith('oauth.')) {
    const provider = key.slice('oauth.'.length) as OauthProviderKey;
    if (!OAUTH_PROVIDER_KEYS.includes(provider)) {
      return NextResponse.json({ error: `不支持的 OAuth 提供方：${provider}` }, { status: 400 });
    }
    const parsed = oauthProviderSchema.safeParse(value, provider);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'OAuth 配置不合法', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const result = await updateOauthConfig(provider, parsed.data, meta);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ key, config: result.config });
  }

  return NextResponse.json({ error: `未知的配置 key：${key}` }, { status: 400 });
}
