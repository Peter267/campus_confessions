// 测试 SMTP / OAuth 连接（不修改数据库，但会写一条 action='test' 的审计）
//   POST /api/admin/site-settings/test
//   body = { key: 'smtp' | 'oauth.<provider>', value: <完整配置>, password?: '<新密码>', clientSecret?: '<新密钥>' }

import { NextRequest, NextResponse } from 'next/server';
import { assertSiteSettingsAdmin, getRequestMeta, getSmtpConfig, getOauthConfig, recordTestResult, testSmtpConnection, testOauthProvider } from '@/lib/site-settings';
import { OAUTH_PROVIDER_KEYS, OauthProviderKey, smtpConfigSchema, oauthProviderSchema } from '@/lib/validators';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const auth = await assertSiteSettingsAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: '请求体必须为 JSON' }, { status: 400 });
  const key = String(body.key ?? '');
  const value = (body.value ?? {}) as Record<string, unknown>;
  const meta = { ...getRequestMeta(request), actor: auth.actor };

  if (key === 'smtp') {
    const parsed = smtpConfigSchema.safeParse(value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'SMTP 配置不合法', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const overridePassword = typeof body.password === 'string' && body.password.length > 0
      ? body.password
      : (parsed.data.password ?? null);
    const stored = await getSmtpConfig();
    const result = await testSmtpConnection(
      { ...parsed.data, password: overridePassword ?? stored?.password ?? null },
      { overridePassword }
    );
    await recordTestResult('smtp', meta, result as unknown as Record<string, unknown>);
    return NextResponse.json({ key, result });
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
    const overrideSecret = typeof body.clientSecret === 'string' && body.clientSecret.length > 0
      ? body.clientSecret
      : (parsed.data.clientSecret ?? null);
    const stored = await getOauthConfig(provider);
    const result = await testOauthProvider(
      provider,
      { ...parsed.data, clientSecret: overrideSecret ?? stored?.clientSecret ?? null },
      { overrideSecret }
    );
    await recordTestResult(key as `oauth.${OauthProviderKey}`, meta, result as unknown as Record<string, unknown>);
    return NextResponse.json({ key, result });
  }

  return NextResponse.json({ error: `未知的配置 key：${key}` }, { status: 400 });
}
