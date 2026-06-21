// GET /api/auth/oauth/[provider]
// 发起第三方 OAuth2 登录：重定向到提供方的授权页。
// 流程：
//   1. 校验 provider 合法
//   2. 读取站点配置中的 OAuth 配置（DB 优先，回退环境变量）
//   3. 生成带签名的 state（防 CSRF）
//   4. 302 重定向到 authorizationUrl
import { NextRequest, NextResponse } from 'next/server';
import { buildAuthorizationUrl, buildOauthState, resolveOauthConfig } from '@/lib/oauth';
import { OAUTH_PROVIDER_KEYS } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (!OAUTH_PROVIDER_KEYS.includes(provider as typeof OAUTH_PROVIDER_KEYS[number])) {
    return NextResponse.json({ error: '不支持的第三方登录' }, { status: 400 });
  }

  const config = await resolveOauthConfig(provider as typeof OAUTH_PROVIDER_KEYS[number]);
  if (!config) {
    return NextResponse.json({ error: `${provider} 登录未启用或未配置` }, { status: 503 });
  }

  const next = request.nextUrl.searchParams.get('next') ?? '/';
  const state = buildOauthState(provider as typeof OAUTH_PROVIDER_KEYS[number], next);
  const authUrl = buildAuthorizationUrl(config, state);
  return NextResponse.redirect(authUrl, 302);
}
