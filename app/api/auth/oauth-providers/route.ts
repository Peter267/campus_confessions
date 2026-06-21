// GET /api/auth/oauth-providers
// 公开接口：返回已启用的第三方登录提供方列表，供登录/注册页渲染按钮。
import { NextResponse } from 'next/server';
import { listOauthConfigs } from '@/lib/site-settings';
import { OAUTH_PROVIDER_KEYS, OAUTH_PROVIDER_LABELS } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configs = await listOauthConfigs();
  const enabled: { provider: string; label: string }[] = [];
  for (const key of OAUTH_PROVIDER_KEYS) {
    const c = configs[key];
    if (c && c.enabled && c.clientId && (c.hasSecret || c.clientSecret)) {
      enabled.push({ provider: key, label: OAUTH_PROVIDER_LABELS[key] });
    }
  }
  return NextResponse.json({ providers: enabled });
}
