// Cloudflare Turnstile 校验
// ---------------------------------------------------------------------------
// 注册/登录/重置密码等敏感接口需要通过人机验证。
// 未配置 TURNSTILE_SECRET 时直接放行（dev 模式），但服务端日志会告警。
// 校验通过 Cloudflare 的 siteverify 端点（POST）。
// ---------------------------------------------------------------------------

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  skipped: boolean;
  errors: string[];
}

export async function verifyTurnstile(token: string | undefined | null, remoteIp?: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[turnstile] 未配置 TURNSTILE_SECRET，已跳过校验（仅限 dev 模式）');
    }
    return { ok: true, skipped: true, errors: [] };
  }
  if (!token) {
    return { ok: false, skipped: false, errors: ['missing-input-response'] };
  }
  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, cache: 'no-store' });
    if (!res.ok) {
      return { ok: false, skipped: false, errors: [`http-${res.status}`] };
    }
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      return { ok: false, skipped: false, errors: data['error-codes'] ?? ['unknown'] };
    }
    return { ok: true, skipped: false, errors: [] };
  } catch (err) {
    return { ok: false, skipped: false, errors: [(err as Error).message || 'fetch-failed'] };
  }
}
