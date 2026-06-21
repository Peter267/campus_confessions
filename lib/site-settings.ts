// 站点级配置（SMTP / 第三方 OAuth 登录）
// ---------------------------------------------------------------------------
// 设计要点：
//   1. 所有配置存放在 site_settings 表，主键 key：
//        - 'smtp'             : SMTP 邮件发送
//        - 'oauth.github'     : GitHub OAuth
//        - 'oauth.google'     : Google OAuth
//        - 'oauth.microsoft'  : Microsoft OAuth
//        - 'oauth.qq'         : QQ OAuth
//   2. 非敏感字段（host / port / username / from / clientId / redirectUri 等）
//      以 jsonb 明文存；敏感字段（password / clientSecret）整体用
//      pgcrypto 的 pgp_sym_encrypt 加密后存到 encrypted_payload (bytea)。
//   3. 加密密钥从环境变量 SITE_SETTINGS_SECRET 派生（若未设置则回退到
//      SESSION_SECRET，再不行则使用开发兜底密钥，但会强制警告）。
//   4. 修改会写入 site_settings_audit 表（变更前/后值 + 操作者 + 测试结果）。
//   5. 进程内维护一份"配置快照 + 内存缓存"：
//        - getActiveSmtpConfig() / getActiveOauthConfig() 优先用 DB，
//          若 DB 未配置则回退到环境变量，确保存量部署能正常工作。
//        - 写入成功后立即刷新缓存，实现"无需重启立即生效"。
//   6. 测试连接时调用 testSmtpConnection() / testOauthProvider()，仅做
//      TCP/握手层校验，不真正发邮件 / 不消耗 OAuth 授权码。
// ---------------------------------------------------------------------------

import { createConnection, type Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { sql } from './db';
import { smtpConfigSchema, oauthProviderSchema } from './validators';
import type { OauthProviderConfig, OauthProviderKey, SmtpConfig, SmtpEncryption } from './validators';
import { isAdminRequest, getCurrentUser } from './auth';
import type { NextRequest } from 'next/server';

export const SITE_SETTINGS_KEYS = {
  smtp: 'smtp',
  oauth: (provider: OauthProviderKey) => `oauth.${provider}` as const
} as const;

export type SiteSettingsKey = 'smtp' | 'captcha' | `oauth.${OauthProviderKey}`;

interface SiteSettingsRow {
  key: string;
  public_payload: Record<string, unknown>;
  encrypted_payload: Buffer | null;
  secret_version: number;
  updated_at: string;
  updated_by: string | null;
}

interface SiteSettingsAuditRow {
  id: string;
  key: string;
  action: 'create' | 'update' | 'delete' | 'test';
  actor: string;
  before_payload: Record<string, unknown> | null;
  after_payload: Record<string, unknown> | null;
  test_result: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

// 进程级缓存：{ smtp: ..., 'oauth.github': ... }
// - null 表示"已查过 DB，没有数据"
// - undefined 表示"尚未查询"
const settingsCache = new Map<string, Record<string, unknown> | null | undefined>();

function getEncryptionKey(): string {
  const explicit = process.env.SITE_SETTINGS_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const fallback = process.env.SESSION_SECRET;
  if (fallback && fallback.length >= 16) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn('[site-settings] SITE_SETTINGS_SECRET 未设置，已派生自 SESSION_SECRET，生产环境建议显式设置');
      return createHash('sha256').update(`site-settings:${fallback}`).digest('hex');
    }
    return createHash('sha256').update(`site-settings:${fallback}`).digest('hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SITE_SETTINGS_SECRET 或 SESSION_SECRET 必须至少 16 字符');
  }
  // eslint-disable-next-line no-console
  console.warn('[site-settings] 未检测到加密密钥，已使用开发兜底密钥，**请勿用于生产**');
  return 'dev-only-insecure-site-settings-key-please-change';
}

function isDbAvailable() {
  return Boolean(process.env.DATABASE_URL && sql);
}

function buildSmtpFromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASSWORD ?? '';
  const from = process.env.SMTP_FROM ?? user;
  let encryption: SmtpEncryption = 'none';
  if (port === 465) encryption = 'ssl';
  else if (port === 587 || port === 25 || port === 2525) encryption = 'starttls';
  return {
    enabled: Boolean(user && pass),
    host,
    port,
    encryption,
    username: user,
    from,
    password: pass,
    hasPassword: Boolean(pass)
  };
}

function buildOauthFromEnv(provider: OauthProviderKey): OauthProviderConfig | null {
  const envKey = `OAUTH_${provider.toUpperCase()}_CLIENT_ID`;
  const envSecret = `OAUTH_${provider.toUpperCase()}_CLIENT_SECRET`;
  const envRedirect = `OAUTH_${provider.toUpperCase()}_REDIRECT_URI`;
  const clientId = process.env[envKey];
  if (!clientId) return null;
  const secret = process.env[envSecret] ?? '';
  return {
    enabled: Boolean(secret),
    clientId,
    clientSecret: secret,
    hasSecret: Boolean(secret),
    redirectUri: process.env[envRedirect] ?? '',
    scope: process.env[`OAUTH_${provider.toUpperCase()}_SCOPE`] ?? '',
    authorizationUrl: undefined,
    tokenUrl: undefined,
    userinfoUrl: undefined,
    displayName: provider
  };
}

// ---------------------------------------------------------------------------
// 缓存管理
// ---------------------------------------------------------------------------

export function invalidateSiteSettingsCache(key?: SiteSettingsKey) {
  if (key) settingsCache.delete(key);
  else settingsCache.clear();
}

async function loadRow(key: SiteSettingsKey): Promise<SiteSettingsRow | null> {
  if (!isDbAvailable() || !sql) return null;
  const rows = (await sql`select key, public_payload, encrypted_payload, secret_version, updated_at, updated_by from site_settings where key = ${key}`) as unknown as SiteSettingsRow[];
  return rows[0] ?? null;
}

async function loadPublicPayload(key: SiteSettingsKey): Promise<Record<string, unknown> | null> {
  const cached = settingsCache.get(key);
  if (cached !== undefined) return cached ?? null;
  const row = await loadRow(key);
  if (!row) {
    settingsCache.set(key, null);
    return null;
  }
  const decrypted = await decryptSecrets(row.public_payload, row.encrypted_payload, row.secret_version);
  settingsCache.set(key, decrypted);
  return decrypted;
}

async function decryptSecrets(
  publicPayload: Record<string, unknown>,
  encrypted: Buffer | null | undefined,
  version: number
): Promise<Record<string, unknown>> {
  if (!encrypted) return publicPayload;
  if (!isDbAvailable() || !sql) return publicPayload;
  try {
    const key = getEncryptionKey();
    const rows = (await sql`select pgp_sym_decrypt(${encrypted}::bytea, ${key})::text as plaintext`) as { plaintext: string }[];
    const text = rows[0]?.plaintext;
    if (!text) return publicPayload;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { ...publicPayload, ...parsed, _secretVersion: version };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[site-settings] 解密失败，忽略加密字段:', (err as Error).message);
    return publicPayload;
  }
}

async function encryptSecrets(secrets: Record<string, unknown>): Promise<Buffer | null> {
  if (!secrets || Object.keys(secrets).length === 0) return null;
  if (!isDbAvailable() || !sql) return null;
  const key = getEncryptionKey();
  const json = JSON.stringify(secrets);
  const rows = (await sql`select pgp_sym_encrypt(${json}::text, ${key}) as cipher`) as { cipher: Buffer }[];
  return rows[0]?.cipher ?? null;
}

function splitSmtpSecrets(config: SmtpConfig) {
  const { password, ...publicPart } = config;
  const secrets: Record<string, unknown> = {};
  if (typeof password === 'string' && password.length > 0) {
    secrets.password = password;
  }
  return { public: publicPart as unknown as Record<string, unknown>, secrets };
}

function splitOauthSecrets(config: OauthProviderConfig) {
  const { clientSecret, ...publicPart } = config;
  const secrets: Record<string, unknown> = {};
  if (typeof clientSecret === 'string' && clientSecret.length > 0) {
    secrets.clientSecret = clientSecret;
  }
  return { public: publicPart as unknown as Record<string, unknown>, secrets };
}

function maskSmtpPublic(publicPayload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...publicPayload };
  delete out.password;
  out.hasPassword = Boolean(publicPayload.hasPassword ?? publicPayload.password);
  return out;
}

function maskOauthPublic(publicPayload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...publicPayload };
  delete out.clientSecret;
  out.hasSecret = Boolean(publicPayload.hasSecret ?? publicPayload.clientSecret);
  return out;
}

// ---------------------------------------------------------------------------
// 公共读取 API
// ---------------------------------------------------------------------------

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  if (isDbAvailable()) {
    const payload = await loadPublicPayload('smtp');
    if (payload) {
      return {
        enabled: Boolean(payload.enabled),
        host: String(payload.host ?? ''),
        port: Number(payload.port ?? 465),
        encryption: (payload.encryption as SmtpEncryption) ?? 'starttls',
        username: String(payload.username ?? ''),
        from: String(payload.from ?? ''),
        password: null,
        hasPassword: Boolean(payload.hasPassword)
      };
    }
  }
  return buildSmtpFromEnv();
}

export async function getOauthConfig(provider: OauthProviderKey): Promise<OauthProviderConfig | null> {
  if (isDbAvailable()) {
    const payload = await loadPublicPayload(SITE_SETTINGS_KEYS.oauth(provider));
    if (payload) {
      return {
        enabled: Boolean(payload.enabled),
        clientId: String(payload.clientId ?? ''),
        redirectUri: String(payload.redirectUri ?? ''),
        scope: String(payload.scope ?? ''),
        authorizationUrl: (payload.authorizationUrl as string) || undefined,
        tokenUrl: (payload.tokenUrl as string) || undefined,
        userinfoUrl: (payload.userinfoUrl as string) || undefined,
        displayName: String(payload.displayName ?? provider),
        clientSecret: null,
        hasSecret: Boolean(payload.hasSecret)
      };
    }
  }
  return buildOauthFromEnv(provider);
}

export async function listOauthConfigs(): Promise<Record<OauthProviderKey, OauthProviderConfig | null>> {
  const [github, google, microsoft, qq] = await Promise.all([
    getOauthConfig('github'),
    getOauthConfig('google'),
    getOauthConfig('microsoft'),
    getOauthConfig('qq')
  ]);
  return { github, google, microsoft, qq };
}

// ---------------------------------------------------------------------------
// 写入 API（被 API 路由调用）
// ---------------------------------------------------------------------------

export interface SiteSettingsActor {
  actor: string; // 用户名 / 'admin-token'
  ip?: string;
  userAgent?: string;
}

export async function updateSmtpConfig(
  next: SmtpConfig,
  meta: SiteSettingsActor
): Promise<{ ok: true; config: SmtpConfig } | { ok: false; error: string }> {
  // 1. 重新校验（双层防御）
  const parsed = smtpConfigSchema.safeParse(next);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? '配置不合法';
    return { ok: false, error: first };
  }
  const config = parsed.data;

  // 2. 与旧值比较
  const previous = await getSmtpConfig();

  // 3. 写入数据库
  const split = splitSmtpSecrets(config);
  const previousPublic = previous ? maskSmtpPublic(previous as unknown as Record<string, unknown>) : {};
  const publicPayload: Record<string, unknown> = {
    ...previousPublic,
    ...split.public,
    hasPassword: Boolean(split.secrets.password) || Boolean(previous?.hasPassword)
  };
  delete publicPayload.password;

  if (isDbAvailable() && sql) {
    const encrypted = await encryptSecrets(split.secrets);
    const publicJson = JSON.stringify(publicPayload);
    await sql`
      insert into site_settings (key, public_payload, encrypted_payload, secret_version, updated_at, updated_by)
      values (${'smtp'}, ${publicJson}::jsonb, ${encrypted}, ${1}, now(), ${meta.actor})
      on conflict (key) do update set
        public_payload = excluded.public_payload,
        encrypted_payload = excluded.encrypted_payload,
        secret_version = excluded.secret_version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `;
  }

  // 4. 失效缓存
  invalidateSiteSettingsCache('smtp');

  // 5. 写审计日志
  await writeAuditLog('smtp', 'update', meta, previousPublic, publicPayload);

  return { ok: true, config: { ...config, password: null, hasPassword: Boolean(publicPayload.hasPassword) } };
}

export async function updateOauthConfig(
  provider: OauthProviderKey,
  next: OauthProviderConfig,
  meta: SiteSettingsActor
): Promise<{ ok: true; config: OauthProviderConfig } | { ok: false; error: string }> {
  const parsed = oauthProviderSchema.safeParse(next, provider);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? '配置不合法';
    return { ok: false, error: first };
  }
  const config = parsed.data;

  const previous = await getOauthConfig(provider);
  const key = SITE_SETTINGS_KEYS.oauth(provider);
  const split = splitOauthSecrets(config);
  const previousPublic = previous ? maskOauthPublic(previous as unknown as Record<string, unknown>) : {};
  const publicPayload: Record<string, unknown> = {
    ...previousPublic,
    ...split.public,
    hasSecret: Boolean(split.secrets.clientSecret) || Boolean(previous?.hasSecret)
  };
  delete publicPayload.clientSecret;

  if (isDbAvailable() && sql) {
    const encrypted = await encryptSecrets(split.secrets);
    const publicJson = JSON.stringify(publicPayload);
    await sql`
      insert into site_settings (key, public_payload, encrypted_payload, secret_version, updated_at, updated_by)
      values (${key}, ${publicJson}::jsonb, ${encrypted}, ${1}, now(), ${meta.actor})
      on conflict (key) do update set
        public_payload = excluded.public_payload,
        encrypted_payload = excluded.encrypted_payload,
        secret_version = excluded.secret_version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `;
  }

  invalidateSiteSettingsCache(key);
  await writeAuditLog(key, 'update', meta, previousPublic, publicPayload);

  return { ok: true, config: { ...config, clientSecret: null, hasSecret: Boolean(publicPayload.hasSecret) } };
}

// ---------------------------------------------------------------------------
// 测试连接
// ---------------------------------------------------------------------------

export interface SmtpTestResult {
  ok: boolean;
  steps: { name: string; ok: boolean; detail?: string }[];
  error?: string;
}

export async function testSmtpConnection(config: SmtpConfig, opts?: { overridePassword?: string | null }): Promise<SmtpTestResult> {
  const steps: SmtpTestResult['steps'] = [];
  if (!config.host) return { ok: false, steps, error: 'SMTP 主机未配置' };
  if (!config.port) return { ok: false, steps, error: 'SMTP 端口未配置' };

  const password = opts?.overridePassword ?? config.password;
  if (!password) {
    steps.push({ name: 'auth', ok: false, detail: '缺少密码（保存密码后再测试）' });
    return { ok: false, steps, error: '缺少 SMTP 密码' };
  }

  return new Promise<SmtpTestResult>((resolve) => {
    const port = config.port;
    let socket: Socket | null = null;
    try {
      socket = createConnection(port, config.host, () => {
        steps.push({ name: 'tcp', ok: true, detail: `已连接到 ${config.host}:${port}` });
      });
    } catch (err) {
      resolve({ ok: false, steps, error: `TCP 连接失败: ${(err as Error).message}` });
      return;
    }

    let buffer = '';
    let stage: 'banner' | 'ehlo' | 'auth' | 'quit' = 'banner';
    const commands: string[] = [];
    commands.push('EHLO localhost');
    if (config.username) {
      commands.push('AUTH LOGIN');
      commands.push(Buffer.from(config.username).toString('base64'));
      commands.push(Buffer.from(password).toString('base64'));
    }
    commands.push('QUIT');

    const timer = setTimeout(() => {
      socket?.destroy();
      resolve({ ok: false, steps, error: 'SMTP 测试超时' });
    }, 8000);

    socket.setTimeout(7000, () => {
      clearTimeout(timer);
      socket?.destroy();
      resolve({ ok: false, steps, error: 'SMTP 连接空闲超时' });
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.endsWith('\r\n')) return;
      const lastLine = buffer.trim().split('\n').pop() ?? '';
      const code = parseInt(lastLine.split(' ')[0] ?? '0', 10);
      buffer = '';
      if (code >= 400) {
        clearTimeout(timer);
        socket?.destroy();
        steps.push({ name: stage, ok: false, detail: `SMTP ${code}: ${lastLine}` });
        resolve({ ok: false, steps, error: `SMTP ${code}: ${lastLine}` });
        return;
      }

      if (stage === 'banner') {
        steps.push({ name: 'banner', ok: true, detail: lastLine });
        stage = 'ehlo';
      } else if (stage === 'ehlo') {
        steps.push({ name: 'ehlo', ok: true });
        stage = 'auth';
      } else if (stage === 'auth') {
        if (code === 235) {
          steps.push({ name: 'auth', ok: true, detail: '认证成功' });
        } else if (code === 334) {
          // 334 = 等待输入，下一步发送用户名或密码
        } else {
          steps.push({ name: 'auth', ok: true, detail: `code=${code}` });
        }
      }
      const next = commands.shift();
      if (next) {
        socket?.write(`${next}\r\n`);
      } else {
        clearTimeout(timer);
        socket?.end();
        resolve({ ok: true, steps });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, steps, error: `SMTP 错误: ${err.message}` });
    });
  });
}

export interface OauthTestResult {
  ok: boolean;
  step: 'authorization_url' | 'token_endpoint' | 'skipped' | 'unsupported';
  detail?: string;
  warning?: string;
}

export async function testOauthProvider(
  provider: OauthProviderKey,
  config: OauthProviderConfig,
  opts?: { overrideSecret?: string | null }
): Promise<OauthTestResult> {
  if (!config.clientId) return { ok: false, step: 'authorization_url', detail: '缺少 clientId' };
  if (!config.authorizationUrl && !config.tokenUrl) {
    return { ok: false, step: 'unsupported', detail: '未配置 authorization / token 端点' };
  }

  if (config.authorizationUrl) {
    const url = new URL(config.authorizationUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scope);
    try {
      const res = await fetch(url.toString(), { method: 'GET', redirect: 'manual' });
      if (res.status >= 500) {
        return { ok: false, step: 'authorization_url', detail: `${provider} 授权端点返回 ${res.status}` };
      }
    } catch (err) {
      return { ok: false, step: 'authorization_url', detail: `无法访问 ${provider} 授权端点: ${(err as Error).message}` };
    }
  }

  if (config.tokenUrl) {
    const secret = opts?.overrideSecret ?? config.clientSecret;
    if (!secret) {
      return { ok: true, step: 'token_endpoint', warning: '已配置 clientId 但缺少 clientSecret，无法完成 token 端点实测' };
    }
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: secret,
      grant_type: 'refresh_token',
      refresh_token: '__probe__'
    });
    try {
      const res = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body
      });
      if (res.status >= 500) {
        return { ok: false, step: 'token_endpoint', detail: `${provider} token 端点返回 ${res.status}` };
      }
      return { ok: true, step: 'token_endpoint', detail: `${provider} token 端点已响应 (HTTP ${res.status})` };
    } catch (err) {
      return { ok: false, step: 'token_endpoint', detail: `无法访问 ${provider} token 端点: ${(err as Error).message}` };
    }
  }
  return { ok: true, step: 'skipped' };
}

// ---------------------------------------------------------------------------
// 审计日志
// ---------------------------------------------------------------------------

export type SiteSettingsAuditRecord = SiteSettingsAuditRow;

export async function writeAuditLog(
  key: SiteSettingsKey,
  action: SiteSettingsAuditRow['action'],
  meta: SiteSettingsActor,
  beforePayload: Record<string, unknown> | null,
  afterPayload: Record<string, unknown> | null,
  testResult?: Record<string, unknown> | null
): Promise<void> {
  if (!isDbAvailable() || !sql) return;
  const beforeJson = JSON.stringify(beforePayload ?? {});
  const afterJson = JSON.stringify(afterPayload ?? {});
  const testJson = testResult ? JSON.stringify(testResult) : null;
  await sql`
    insert into site_settings_audit
      (key, action, actor, before_payload, after_payload, test_result, ip, user_agent)
    values
      (${key}, ${action}, ${meta.actor},
       ${beforeJson}::jsonb,
       ${afterJson}::jsonb,
       ${testJson}::jsonb,
       ${meta.ip ?? null},
       ${meta.userAgent ?? null})
  `;
}

export async function recordTestResult(
  key: SiteSettingsKey,
  meta: SiteSettingsActor,
  testResult: Record<string, unknown>
): Promise<void> {
  await writeAuditLog(key, 'test', meta, null, null, testResult);
}

export async function listSiteSettingsAudit(limit = 50): Promise<SiteSettingsAuditRecord[]> {
  if (!isDbAvailable() || !sql) return [];
  return (await sql`
    select id, key, action, actor, before_payload, after_payload, test_result, ip, user_agent, created_at
    from site_settings_audit
    order by created_at desc
    limit ${limit}
  `) as unknown as SiteSettingsAuditRecord[];
}

// ---------------------------------------------------------------------------
// 鉴权辅助：仅 superadmin / admin（或 ADMIN_TOKEN）允许读写
// ---------------------------------------------------------------------------

export async function assertSiteSettingsAdmin(request: NextRequest): Promise<{ ok: true; actor: string } | { ok: false; status: number; error: string }> {
  // 紧急入口：ADMIN_TOKEN 兼容
  if (isAdminRequest(request)) {
    return { ok: true, actor: 'admin-token' };
  }
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, status: 401, error: '请先登录' };
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return { ok: false, status: 403, error: '需要管理员权限' };
    }
    return { ok: true, actor: user.username ?? user.email ?? user.id };
  } catch (err) {
    // 单元测试 / 非 request scope 中调用 cookies() 会抛错，按"未登录"处理
    return { ok: false, status: 401, error: `请先登录 (${(err as Error).message ?? 'auth-unavailable'})` };
  }
}

export function getRequestMeta(request: NextRequest): { ip: string; userAgent: string } {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    '0.0.0.0';
  const userAgent = request.headers.get('user-agent') ?? '';
  return { ip, userAgent };
}
