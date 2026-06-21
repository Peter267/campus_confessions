// 统一人机验证抽象层
// ---------------------------------------------------------------------------
// 站点管理员可在后台选择启用哪种人机验证：
//   - 'none'     : 不启用（仅 dev 模式推荐）
//   - 'turnstile' : Cloudflare Turnstile
//   - 'geetest'   : 极验 Geetest v4
//
// 配置存放在 site_settings 表的 'captcha' key：
//   public_payload = { provider, turnstileSiteKey, geetestCaptchaId }
//   encrypted_payload = { turnstileSecret, geetestCaptchaKey }
//
// API 路由调用 verifyCaptcha(payload, ip) 即可，无需关心当前用的是哪种。
// 前端调用 GET /api/auth/captcha-config 获取当前 provider 与 site key。
// ---------------------------------------------------------------------------

import { sql } from './db';
import { verifyTurnstile } from './turnstile';
import { verifyGeetest } from './geetest';

export type CaptchaProvider = 'none' | 'turnstile' | 'geetest';

export interface CaptchaConfig {
  provider: CaptchaProvider;
  turnstileSiteKey: string | null;
  geetestCaptchaId: string | null;
}

export interface CaptchaVerifyPayload {
  turnstileToken?: string | null;
  geetest?: {
    lotNumber: string;
    captchaOutput: string;
    passToken: string;
    genTime: string;
  } | null;
}

export interface CaptchaVerifyResult {
  ok: boolean;
  skipped: boolean;
  provider: CaptchaProvider;
  errors: string[];
}

// 进程级缓存
let cachedConfig: CaptchaConfig | null | undefined = undefined;

export function invalidateCaptchaCache() {
  cachedConfig = undefined;
}

function buildConfigFromEnv(): CaptchaConfig {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
  const geetestCaptchaId = process.env.NEXT_PUBLIC_GEETEST_CAPTCHA_ID ?? null;
  // 优先级：显式 CAPTCHA_PROVIDER > turnstile > geetest > none
  const explicit = process.env.CAPTCHA_PROVIDER as CaptchaProvider | undefined;
  if (explicit && ['none', 'turnstile', 'geetest'].includes(explicit)) {
    return { provider: explicit, turnstileSiteKey, geetestCaptchaId };
  }
  if (process.env.TURNSTILE_SECRET) {
    return { provider: 'turnstile', turnstileSiteKey, geetestCaptchaId };
  }
  if (process.env.GEETEST_CAPTCHA_KEY) {
    return { provider: 'geetest', turnstileSiteKey, geetestCaptchaId };
  }
  return { provider: 'none', turnstileSiteKey, geetestCaptchaId };
}

export async function getCaptchaConfig(): Promise<CaptchaConfig> {
  if (cachedConfig !== undefined && cachedConfig !== null) return cachedConfig;
  if (sql && process.env.DATABASE_URL) {
    try {
      const rows = (await sql`select public_payload from site_settings where key = ${'captcha'}`) as {
        public_payload: Record<string, unknown>;
      }[];
      if (rows[0]?.public_payload) {
        const p = rows[0].public_payload;
        cachedConfig = {
          provider: (p.provider as CaptchaProvider) ?? 'none',
          turnstileSiteKey: (p.turnstileSiteKey as string | null) ?? null,
          geetestCaptchaId: (p.geetestCaptchaId as string | null) ?? null
        };
        return cachedConfig;
      }
    } catch {
      // fall through to env
    }
  }
  cachedConfig = buildConfigFromEnv();
  return cachedConfig;
}

export async function verifyCaptcha(
  payload: CaptchaVerifyPayload | null | undefined,
  remoteIp?: string | null
): Promise<CaptchaVerifyResult> {
  const config = await getCaptchaConfig();
  if (config.provider === 'none') {
    return { ok: true, skipped: true, provider: 'none', errors: [] };
  }
  if (config.provider === 'turnstile') {
    const result = await verifyTurnstile(payload?.turnstileToken ?? null, remoteIp ?? null);
    return { ok: result.ok, skipped: result.skipped, provider: 'turnstile', errors: result.errors };
  }
  if (config.provider === 'geetest') {
    const result = await verifyGeetest(payload?.geetest ?? null);
    return { ok: result.ok, skipped: result.skipped, provider: 'geetest', errors: result.reason ? [result.reason] : [] };
  }
  return { ok: true, skipped: true, provider: 'none', errors: [] };
}

export interface CaptchaSettingsInput {
  provider: CaptchaProvider;
  turnstileSiteKey?: string | null;
  turnstileSecret?: string | null;
  geetestCaptchaId?: string | null;
  geetestCaptchaKey?: string | null;
}

export async function updateCaptchaSettings(
  input: CaptchaSettingsInput,
  actor: string
): Promise<{ ok: true; config: CaptchaConfig } | { ok: false; error: string }> {
  if (!['none', 'turnstile', 'geetest'].includes(input.provider)) {
    return { ok: false, error: '不支持的验证方式' };
  }
  if (!sql || !process.env.DATABASE_URL) {
    // 无 DB 时只更新内存缓存（dev 模式）
    cachedConfig = {
      provider: input.provider,
      turnstileSiteKey: input.turnstileSiteKey ?? null,
      geetestCaptchaId: input.geetestCaptchaId ?? null
    };
    return { ok: true, config: cachedConfig };
  }
  const publicPayload = {
    provider: input.provider,
    turnstileSiteKey: input.turnstileSiteKey ?? null,
    geetestCaptchaId: input.geetestCaptchaId ?? null
  };
  const secrets: Record<string, unknown> = {};
  if (input.turnstileSecret) secrets.turnstileSecret = input.turnstileSecret;
  if (input.geetestCaptchaKey) secrets.geetestCaptchaKey = input.geetestCaptchaKey;

  // 用 pgp_sym_encrypt 加密敏感字段
  const key = process.env.SITE_SETTINGS_SECRET || process.env.SESSION_SECRET || 'dev-only-insecure-site-settings-key-please-change';
  let encrypted: Buffer | null = null;
  if (Object.keys(secrets).length > 0) {
    const json = JSON.stringify(secrets);
    const rows = (await sql`select pgp_sym_encrypt(${json}::text, ${key}) as cipher`) as { cipher: Buffer }[];
    encrypted = rows[0]?.cipher ?? null;
  }
  const publicJson = JSON.stringify(publicPayload);
  await sql`
    insert into site_settings (key, public_payload, encrypted_payload, secret_version, updated_at, updated_by)
    values (${'captcha'}, ${publicJson}::jsonb, ${encrypted}, ${1}, now(), ${actor})
    on conflict (key) do update set
      public_payload = excluded.public_payload,
      encrypted_payload = excluded.encrypted_payload,
      secret_version = excluded.secret_version,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `;
  invalidateCaptchaCache();
  return {
    ok: true,
    config: {
      provider: input.provider,
      turnstileSiteKey: input.turnstileSiteKey ?? null,
      geetestCaptchaId: input.geetestCaptchaId ?? null
    }
  };
}

// 读取已保存的敏感字段是否存在（不返回明文）
export async function getCaptchaSecretFlags(): Promise<{ hasTurnstileSecret: boolean; hasGeetestKey: boolean }> {
  if (!sql || !process.env.DATABASE_URL) {
    return {
      hasTurnstileSecret: Boolean(process.env.TURNSTILE_SECRET),
      hasGeetestKey: Boolean(process.env.GEETEST_CAPTCHA_KEY)
    };
  }
  try {
    const rows = (await sql`select encrypted_payload from site_settings where key = ${'captcha'}`) as {
      encrypted_payload: Buffer | null;
    }[];
    if (!rows[0]?.encrypted_payload) {
      return {
        hasTurnstileSecret: Boolean(process.env.TURNSTILE_SECRET),
        hasGeetestKey: Boolean(process.env.GEETEST_CAPTCHA_KEY)
      };
    }
    const key = process.env.SITE_SETTINGS_SECRET || process.env.SESSION_SECRET || 'dev-only-insecure-site-settings-key-please-change';
    const decrypted = (await sql`select pgp_sym_decrypt(${rows[0].encrypted_payload}::bytea, ${key})::text as plaintext`) as { plaintext: string }[];
    const parsed = JSON.parse(decrypted[0]?.plaintext ?? '{}') as Record<string, unknown>;
    return {
      hasTurnstileSecret: Boolean(parsed.turnstileSecret),
      hasGeetestKey: Boolean(parsed.geetestCaptchaKey)
    };
  } catch {
    return { hasTurnstileSecret: false, hasGeetestKey: false };
  }
}
