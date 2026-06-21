type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { flatten: () => { fieldErrors: Record<string, string[]> } } };

function failure(fieldErrors: Record<string, string[]>): ValidationResult<never> {
  return {
    success: false,
    error: {
      flatten: () => ({ fieldErrors })
    }
  };
}

function success<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// 富文本场景下，需要把 HTML 标签剥掉得到纯文本以计算字符数。
// 这是 length 校验的唯一依据，因为 <p>hello</p> 在视觉上只有 5 个字。
function plainTextLength(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length;
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }
  // 兼容逗号或换行分隔的字符串，便于从管理后台直接发送
  if (typeof value === 'string') {
    return value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export const publishSchema = {
  safeParse(input: unknown): ValidationResult<{ alias: string; category: '表白' | '万能墙' | '失物招领' | '日常吐槽'; content: string; imageUrl?: string | null; contentHtml: string }> {
    const payload = input as Record<string, unknown>;
    const alias = toText(payload.alias);
    const category = toText(payload.category) as '表白' | '万能墙' | '失物招领' | '日常吐槽';
    const content = toText(payload.content);
    const contentHtml = typeof payload.contentHtml === 'string' ? payload.contentHtml : '';
    const imageUrl = payload.imageUrl == null ? null : toText(payload.imageUrl);

    const fieldErrors: Record<string, string[]> = {};

    if (!alias || alias.length > 24) {
      fieldErrors.alias = ['代号长度需在 1 到 24 个字符之间'];
    }

    if (!['表白', '万能墙', '失物招领', '日常吐槽'].includes(category)) {
      fieldErrors.category = ['分类标签不合法'];
    }

    // 优先用 contentHtml 的纯文本长度，否则退回 content
    const textLength = contentHtml ? plainTextLength(contentHtml) : content.length;
    if (textLength < 10 || textLength > 1200) {
      fieldErrors.content = ['内容长度需在 10 到 1200 个字符之间'];
    }

    if (imageUrl !== null) {
      if (imageUrl.length > 2048) {
        fieldErrors.imageUrl = ['图片地址过长'];
      } else if (!/^https?:\/\//i.test(imageUrl)) {
        fieldErrors.imageUrl = ['图片地址必须为 http(s) 链接'];
      }
    }

    return Object.keys(fieldErrors).length > 0
      ? failure(fieldErrors)
      : success({ alias, category, content, imageUrl, contentHtml });
  }
};

export const commentSchema = {
  safeParse(input: unknown): ValidationResult<{ authorName?: string; content: string; contentHtml: string }> {
    const payload = input as Record<string, unknown>;
    const authorName = toText(payload.authorName);
    const content = toText(payload.content);
    const contentHtml = typeof payload.contentHtml === 'string' ? payload.contentHtml : '';
    const fieldErrors: Record<string, string[]> = {};

    if (authorName && authorName.length > 24) {
      fieldErrors.authorName = ['代号长度需在 1 到 24 个字符之间'];
    }

    const textLength = contentHtml ? plainTextLength(contentHtml) : content.length;
    if (textLength < 2 || textLength > 400) {
      fieldErrors.content = ['评论长度需在 2 到 400 个字符之间'];
    }

    return Object.keys(fieldErrors).length > 0
      ? failure(fieldErrors)
      : success({ authorName: authorName || undefined, content, contentHtml });
  }
};

export const moderationSettingsSchema = {
  safeParse(input: unknown): ValidationResult<{ blocked_keywords: string[]; blocked_aliases: string[]; blocked_ips: string[] }> {
    const payload = input as Record<string, unknown>;
    const blocked_keywords = normalizeList(payload.blocked_keywords);
    const blocked_aliases = normalizeList(payload.blocked_aliases);
    const blocked_ips = normalizeList(payload.blocked_ips);

    return success({ blocked_keywords, blocked_aliases, blocked_ips });
  }
};

// ---------------------------------------------------------------------------
// 站点级配置：SMTP 与第三方 OAuth2 登录
// ---------------------------------------------------------------------------

export type SmtpEncryption = 'none' | 'tls' | 'starttls' | 'ssl';
export type OauthProviderKey = 'github' | 'google' | 'microsoft' | 'qq';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  from: string;
  // 密码只用于校验通过后存到加密字段，UI 读取时永远拿不到旧值
  password?: string | null;
  hasPassword?: boolean;
}

export interface OauthProviderConfig {
  enabled: boolean;
  clientId: string;
  // 与 password 同：仅写入用；读取时 hasSecret 表示"是否已配置过"
  clientSecret?: string | null;
  hasSecret?: boolean;
  redirectUri: string;
  scope: string;
  // 不同提供方可能用到 userinfo / token 端点；QQ 在移动端可能需要 unionid
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  displayName: string;
}

const SMTP_ENCRYPTIONS: SmtpEncryption[] = ['none', 'tls', 'starttls', 'ssl'];
const OAUTH_PROVIDERS: OauthProviderKey[] = ['github', 'google', 'microsoft', 'qq'];

function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535;
}

// 域名（IP）粗校验：拒绝含空格 / 协议前缀 / 控制字符
function isLikelyHost(value: string) {
  if (!value) return false;
  if (value.length > 253) return false;
  return /^[a-zA-Z0-9.\-:]+$/.test(value);
}

// RFC 5322 简化版邮箱校验
function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// SMTP 的 From 字段常用 "Display Name <addr@host>" 格式；只校验尖括号里的邮箱
function extractEmailAddress(from: string) {
  const angle = from.match(/<([^<>]+)>/);
  return angle ? angle[1].trim() : from.trim();
}

function isLikelyFrom(value: string) {
  return isLikelyEmail(extractEmailAddress(value));
}

// https URL（OAuth redirect 强制 https；本机 dev 允许 http://localhost）
function isLikelyRedirectUri(value: string) {
  if (!value) return false;
  if (value.length > 512) return false;
  if (/^https:\/\//i.test(value)) return true;
  if (/^http:\/\/localhost(?::\d+)?\//i.test(value)) return true;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?\//i.test(value)) return true;
  return false;
}

function isLikelyUrl(value: string) {
  return /^https:\/\/[^\s]+$/i.test(value) && value.length <= 512;
}

export const smtpConfigSchema = {
  safeParse(input: unknown): ValidationResult<SmtpConfig> {
    const payload = (input ?? {}) as Record<string, unknown>;
    const fieldErrors: Record<string, string[]> = {};

    const enabled = Boolean(payload.enabled);
    const host = toText(payload.host);
    if (host && !isLikelyHost(host)) fieldErrors.host = ['SMTP 服务器地址格式不合法'];

    const port = typeof payload.port === 'number' ? payload.port : Number(payload.port);
    if (!isValidPort(port)) {
      fieldErrors.port = ['端口必须为 1 ~ 65535 之间的整数'];
    } else if (host) {
      // 常见约束：587=STARTTLS / 465=SSL / 25/2525=明文或 STARTTLS
      const enc = toText(payload.encryption) as SmtpEncryption;
      if (enc === 'ssl' && port !== 465) {
        fieldErrors.port = ['SSL 加密通常使用 465 端口'];
      } else if (enc === 'tls' && port === 25) {
        fieldErrors.port = ['TLS 隐式加密不应使用 25 端口'];
      }
    }

    const encryption = (toText(payload.encryption) || 'starttls') as SmtpEncryption;
    if (!SMTP_ENCRYPTIONS.includes(encryption)) {
      fieldErrors.encryption = ['加密方式必须为 none / tls / starttls / ssl'];
    }

    const username = toText(payload.username);
    if (username && username.length > 256) fieldErrors.username = ['用户名过长'];

    const from = toText(payload.from);
    if (from && !isLikelyFrom(from)) {
      fieldErrors.from = ['发件人邮箱格式不正确'];
    }

    const passwordRaw = payload.password;
    let password: string | null = null;
    if (typeof passwordRaw === 'string' && passwordRaw.length > 0) {
      if (passwordRaw.length > 512) {
        fieldErrors.password = ['密码长度超过 512 字符'];
      } else {
        password = passwordRaw;
      }
    } else if (passwordRaw === null || passwordRaw === undefined || passwordRaw === '') {
      password = null;
    } else {
      fieldErrors.password = ['密码格式不正确'];
    }

    if (Object.keys(fieldErrors).length > 0) return failure(fieldErrors);
    return success({
      enabled,
      host,
      port,
      encryption,
      username,
      from,
      password
    });
  }
};

export const oauthProviderSchema = {
  safeParse(input: unknown, provider: OauthProviderKey): ValidationResult<OauthProviderConfig> {
    if (!OAUTH_PROVIDERS.includes(provider)) {
      return failure({ provider: [`不支持的第三方登录：${provider}`] });
    }
    const payload = (input ?? {}) as Record<string, unknown>;
    const fieldErrors: Record<string, string[]> = {};

    const enabled = Boolean(payload.enabled);
    const clientId = toText(payload.clientId);
    if (clientId && clientId.length > 256) fieldErrors.clientId = ['clientId 过长'];
    if (enabled && !clientId) fieldErrors.clientId = ['启用 OAuth 时必须填写 clientId'];

    const secretRaw = payload.clientSecret;
    let clientSecret: string | null = null;
    if (typeof secretRaw === 'string' && secretRaw.length > 0) {
      if (secretRaw.length > 1024) {
        fieldErrors.clientSecret = ['clientSecret 过长'];
      } else {
        clientSecret = secretRaw;
      }
    } else if (secretRaw === null || secretRaw === undefined || secretRaw === '') {
      clientSecret = null;
    } else {
      fieldErrors.clientSecret = ['clientSecret 格式不正确'];
    }

    const redirectUri = toText(payload.redirectUri);
    if (redirectUri && !isLikelyRedirectUri(redirectUri)) {
      fieldErrors.redirectUri = ['回调地址必须为 https（开发环境允许 http://localhost）'];
    }

    const scope = toText(payload.scope);
    if (scope && scope.length > 512) fieldErrors.scope = ['scope 过长'];

    for (const field of ['authorizationUrl', 'tokenUrl', 'userinfoUrl'] as const) {
      const value = toText(payload[field]);
      if (value && !isLikelyUrl(value)) {
        fieldErrors[field] = ['必须是 https 链接'];
      }
    }

    if (Object.keys(fieldErrors).length > 0) return failure(fieldErrors);
    return success({
      enabled,
      clientId,
      clientSecret,
      redirectUri,
      scope,
      authorizationUrl: toText(payload.authorizationUrl) || undefined,
      tokenUrl: toText(payload.tokenUrl) || undefined,
      userinfoUrl: toText(payload.userinfoUrl) || undefined,
      displayName: toText(payload.displayName) || provider
    });
  }
};

export const OAUTH_PROVIDER_KEYS = OAUTH_PROVIDERS;
export const OAUTH_PROVIDER_LABELS: Record<OauthProviderKey, string> = {
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  qq: 'QQ'
};

// 一些常用 provider 的默认端点（管理员可手动覆盖）
export const OAUTH_PROVIDER_DEFAULTS: Record<OauthProviderKey, Pick<OauthProviderConfig, 'authorizationUrl' | 'tokenUrl' | 'userinfoUrl' | 'scope'>> = {
  github: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userinfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email'
  },
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile'
  },
  microsoft: {
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile'
  },
  qq: {
    authorizationUrl: 'https://graph.qq.com/oauth2.0/authorize',
    tokenUrl: 'https://graph.qq.com/oauth2.0/token',
    userinfoUrl: 'https://graph.qq.com/oauth2.0/me',
    scope: 'get_user_info'
  }
};
