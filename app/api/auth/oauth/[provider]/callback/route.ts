// GET /api/auth/oauth/[provider]/callback
// OAuth2 回调处理：
//   1. 校验 state（防 CSRF）
//   2. 用 code 换 access_token
//   3. 用 access_token 拉取 userinfo
//   4. 查找或创建用户
//   5. 创建 session，下发 cookie
//   6. 重定向回前端（state.next 或首页）
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  fetchProviderUserInfo,
  loginWithOauth,
  resolveOauthConfig,
  verifyOauthState
} from '@/lib/oauth';
import { OAUTH_PROVIDER_KEYS } from '@/lib/validators';
import { buildSessionCookie, generateSessionId, signSessionToken, SESSION_TTL_SECONDS } from '@/lib/session';
import { createSession } from '@/lib/sessions';
import { updateUser } from '@/lib/users';
import { resolveClientIp } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerKey = provider as typeof OAUTH_PROVIDER_KEYS[number];
  if (!OAUTH_PROVIDER_KEYS.includes(providerKey)) {
    return NextResponse.redirect(new URL('/login?error=oauth_unsupported', request.nextUrl));
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const errorParam = request.nextUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(new URL(`/login?error=oauth_${encodeURIComponent(errorParam)}`, request.nextUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=oauth_missing_params', request.nextUrl));
  }

  const statePayload = verifyOauthState(state);
  if (!statePayload || statePayload.provider !== providerKey) {
    return NextResponse.redirect(new URL('/login?error=oauth_invalid_state', request.nextUrl));
  }

  const config = await resolveOauthConfig(providerKey);
  if (!config) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', request.nextUrl));
  }

  const token = await exchangeCodeForToken(config, code);
  if (!token || !token.access_token) {
    return NextResponse.redirect(new URL('/login?error=oauth_token_exchange', request.nextUrl));
  }

  const userInfo = await fetchProviderUserInfo(providerKey, config, token);
  if (!userInfo || !userInfo.subject) {
    return NextResponse.redirect(new URL('/login?error=oauth_userinfo', request.nextUrl));
  }

  const loginResult = await loginWithOauth(providerKey, userInfo);
  if (!loginResult.ok || !loginResult.userId) {
    const msg = encodeURIComponent(loginResult.error ?? 'oauth_login_failed');
    return NextResponse.redirect(new URL(`/login?error=${msg}`, request.nextUrl));
  }

  // 更新登录信息
  const ip = resolveClientIp(request.headers);
  await updateUser(loginResult.userId, { lastLoginAt: new Date().toISOString(), lastLoginIp: ip });

  // 创建 session
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgent = request.headers.get('user-agent') ?? null;
  await createSession({ id: sessionId, userId: loginResult.userId, userAgent, ip, expiresAt });

  const secure = process.env.NODE_ENV === 'production';
  const target = new URL(statePayload.next || '/', request.nextUrl);
  const res = NextResponse.redirect(target, 302);
  res.headers.append('Set-Cookie', buildSessionCookie(signSessionToken(sessionId), { secure }));
  return res;
}
