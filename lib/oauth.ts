// OAuth 第三方登录工具
// ---------------------------------------------------------------------------
// 支持 GitHub / Google / Microsoft / QQ 四种提供方。
// 流程：
//   1. GET /api/auth/oauth/[provider]        → 重定向到提供方授权页（带 state）
//   2. 提供方回调 /api/auth/oauth/[provider]/callback?code=...&state=...
//   3. 服务端用 code 换 access_token（POST tokenUrl）
//   4. 用 access_token 请求 userinfoUrl 拿到 provider 唯一 id + 邮箱 + 昵称
//   5. 按 (oauth_provider, oauth_subject) 查找或创建用户
//   6. 创建 session，重定向回前端
// ---------------------------------------------------------------------------

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getOauthConfig } from './site-settings';
import { OAUTH_PROVIDER_DEFAULTS } from './validators';
import type { OauthProviderKey } from './validators';
import { createUser, getUserByOAuth, getUserByEmail, updateUser } from './users';
import { hashPassword } from './passwords';

const STATE_TTL_MS = 10 * 60 * 1000; // state 有效期 10 分钟

function getOauthStateSecret() {
  return process.env.SESSION_SECRET || 'dev-only-insecure-session-secret-please-change';
}

export interface OauthState {
  provider: OauthProviderKey;
  next: string;
  exp: number;
  nonce: string;
}

export function buildOauthState(provider: OauthProviderKey, next: string): string {
  const payload: OauthState = {
    provider,
    next,
    exp: Date.now() + STATE_TTL_MS,
    nonce: randomBytes(8).toString('hex')
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = createHmac('sha256', getOauthStateSecret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyOauthState(raw: string): OauthState | null {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const b64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac('sha256', getOauthStateSecret()).update(b64).digest('base64url');
  if (sig.length !== expected.length) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as OauthState;
    if (!payload.provider || !payload.exp || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface ResolvedOauthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  displayName: string;
}

export async function resolveOauthConfig(provider: OauthProviderKey): Promise<ResolvedOauthConfig | null> {
  const config = await getOauthConfig(provider);
  // 优先用 DB 配置，否则回退到环境变量
  const defaults = OAUTH_PROVIDER_DEFAULTS[provider];
  if (!config || !config.clientId) return null;
  if (!config.clientSecret && !config.hasSecret) return null;
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret ?? '',
    redirectUri: config.redirectUri || buildDefaultRedirectUri(provider),
    scope: config.scope || defaults.scope,
    authorizationUrl: config.authorizationUrl || defaults.authorizationUrl || '',
    tokenUrl: config.tokenUrl || defaults.tokenUrl || '',
    userinfoUrl: config.userinfoUrl || defaults.userinfoUrl || '',
    displayName: config.displayName || provider
  };
}

function buildDefaultRedirectUri(provider: OauthProviderKey): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/auth/oauth/${provider}/callback`;
}

export function buildAuthorizationUrl(config: ResolvedOauthConfig, state: string): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  if (config.scope) url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

// 用授权码换 access_token。不同提供方响应格式略有差异：
//   - GitHub / Google / Microsoft: JSON
//   - QQ: 可能返回 application/x-www-form-urlencoded
export async function exchangeCodeForToken(
  config: ResolvedOauthConfig,
  code: string
): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });
  try {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json, application/x-www-form-urlencoded'
      },
      body,
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as TokenResponse;
      if (!data.access_token) return null;
      return data;
    }
    // QQ 可能返回 form-urlencoded
    const text = await res.text();
    const params = new URLSearchParams(text);
    const access_token = params.get('access_token');
    if (!access_token) return null;
    return {
      access_token,
      token_type: params.get('token_type') ?? undefined,
      refresh_token: params.get('refresh_token') ?? undefined,
      expires_in: params.get('expires_in') ? Number(params.get('expires_in')) : undefined
    };
  } catch {
    return null;
  }
}

export interface ProviderUserInfo {
  subject: string; // 提供方唯一 id
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

// 用 access_token 请求 userinfo。不同提供方字段名不同：
//   - GitHub: id, login, email, avatar_url
//   - Google: sub, email, name, picture
//   - Microsoft: sub, email, name, picture
//   - QQ: openid（需先调 /oauth2.0/me 拿 openid），然后 get_user_info 拿昵称/头像
export async function fetchProviderUserInfo(
  provider: OauthProviderKey,
  config: ResolvedOauthConfig,
  token: TokenResponse
): Promise<ProviderUserInfo | null> {
  const authHeader = `${token.token_type || 'Bearer'} ${token.access_token}`;
  try {
    if (provider === 'qq') {
      // QQ 需要先拿 openid
      const meRes = await fetch(`${config.userinfoUrl}?access_token=${encodeURIComponent(token.access_token)}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store'
      });
      if (!meRes.ok) return null;
      const meText = await meRes.text();
      // QQ /me 返回 callback({...}) 或 JSON
      const meJson = parseQqResponse(meText) as { openid?: string } | null;
      if (!meJson || !meJson.openid) return null;
      // 再调 get_user_info 拿昵称与头像
      const userUrl = new URL('https://graph.qq.com/user/get_user_info');
      userUrl.searchParams.set('access_token', token.access_token);
      userUrl.searchParams.set('oauth_consumer_key', config.clientId);
      userUrl.searchParams.set('openid', meJson.openid);
      const userRes = await fetch(userUrl, { cache: 'no-store' });
      let nickname: string | null = null;
      let avatar: string | null = null;
      if (userRes.ok) {
        const userData = (await userRes.json()) as { nickname?: string; figureurl_qq_2?: string; figureurl_qq_1?: string };
        nickname = userData.nickname ?? null;
        avatar = userData.figureurl_qq_2 ?? userData.figureurl_qq_1 ?? null;
      }
      return {
        subject: meJson.openid,
        email: null,
        displayName: nickname,
        avatarUrl: avatar
      };
    }

    const res = await fetch(config.userinfoUrl, {
      headers: { authorization: authHeader, accept: 'application/json' },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (provider === 'github') {
      return {
        subject: String(data.id ?? ''),
        email: (data.email as string | null) ?? null,
        displayName: (data.name as string | null) ?? (data.login as string | null) ?? null,
        avatarUrl: (data.avatar_url as string | null) ?? null
      };
    }
    // Google / Microsoft (OpenID Connect)
    return {
      subject: String(data.sub ?? ''),
      email: (data.email as string | null) ?? null,
      displayName: (data.name as string | null) ?? (data.preferred_username as string | null) ?? null,
      avatarUrl: (data.picture as string | null) ?? null
    };
  } catch {
    return null;
  }
}

function parseQqResponse(text: string): Record<string, unknown> | null {
  // QQ 常返回 callback({...}); 或直接 JSON
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const match = trimmed.match(/callback\((.+)\);?/);
  if (match) {
    try {
      return JSON.parse(match[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

export interface OauthLoginResult {
  ok: boolean;
  userId?: string;
  error?: string;
  isNewUser?: boolean;
}

// 查找或创建用户，返回 user id
export async function loginWithOauth(
  provider: OauthProviderKey,
  info: ProviderUserInfo
): Promise<OauthLoginResult> {
  if (!info.subject) {
    return { ok: false, error: '未能获取第三方账号唯一标识' };
  }

  // 1. 已绑定过该第三方账号 → 直接登录
  const existing = await getUserByOAuth(provider, info.subject);
  if (existing) {
    if (existing.status !== 'active') {
      return { ok: false, error: '账号已被停用或注销' };
    }
    return { ok: true, userId: existing.id, isNewUser: false };
  }

  // 2. 邮箱已注册 → 自动绑定到已有账号
  if (info.email) {
    const byEmail = await getUserByEmail(info.email);
    if (byEmail) {
      if (byEmail.status !== 'active') {
        return { ok: false, error: '账号已被停用或注销' };
      }
      await updateUser(byEmail.id, {
        oauthProvider: provider,
        oauthSubject: info.subject,
        emailVerifiedAt: byEmail.email_verified_at ?? new Date().toISOString(),
        avatarUrl: info.avatarUrl ?? byEmail.avatar_url
      });
      return { ok: true, userId: byEmail.id, isNewUser: false };
    }
  }

  // 3. 全新用户 → 创建账号
  //    密码使用随机串（用户无法用密码登录，只能走 OAuth）；display_name 取提供方昵称或默认
  const randomPassword = randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(randomPassword);
  let displayName = info.displayName || `${provider}_user`;
  // 截断到 24 字符以内（display_name 约束）
  if (displayName.length > 24) displayName = displayName.slice(0, 24);
  // 去除保留字
  if (/(管理员|超管|超級管理|system)/i.test(displayName)) {
    displayName = `${provider}_user`;
  }

  try {
    const user = await createUser({
      username: null, // OAuth 用户不强制用户名
      email: info.email,
      passwordHash,
      displayName,
      emailVerifiedAt: info.email ? new Date().toISOString() : null,
      oauthProvider: provider,
      oauthSubject: info.subject
    });
    return { ok: true, userId: user.id, isNewUser: true };
  } catch (err) {
    return { ok: false, error: `创建账号失败：${(err as Error).message}` };
  }
}
