// 极验 Geetest v4 服务端校验
// ---------------------------------------------------------------------------
// 文档：https://docs.geetest.com/gt4/apidoc/server
// 流程：
//   1. 前端用 captcha_id 初始化 SDK，完成行为验证后拿到：
//      lot_number / captcha_output / pass_token / gen_time
//   2. 服务端把这四个值 + captcha_id 发到 Geetest 的 /verify 端点
//   3. 返回 { result: 'success' | 'fail', reason: string }
// 未配置 GEETEST_CAPTCHA_ID / GEETEST_CAPTCHA_KEY 时跳过校验（dev 模式）。
// ---------------------------------------------------------------------------

const VERIFY_URL = 'https://gcaptcha4.geetest.com/verify';

export interface GeetestVerifyInput {
  lotNumber: string;
  captchaOutput: string;
  passToken: string;
  genTime: string;
}

export interface GeetestResult {
  ok: boolean;
  skipped: boolean;
  reason?: string;
}

export async function verifyGeetest(
  input: GeetestVerifyInput | null | undefined,
  captchaId?: string,
  captchaKey?: string
): Promise<GeetestResult> {
  const id = captchaId ?? process.env.GEETEST_CAPTCHA_ID;
  const key = captchaKey ?? process.env.GEETEST_CAPTCHA_KEY;
  if (!id || !key) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[geetest] 未配置 GEETEST_CAPTCHA_ID / GEETEST_CAPTCHA_KEY，已跳过校验（仅限 dev 模式）');
    }
    return { ok: true, skipped: true };
  }
  if (!input || !input.lotNumber || !input.captchaOutput || !input.passToken || !input.genTime) {
    return { ok: false, skipped: false, reason: 'missing-input' };
  }
  try {
    const params = new URLSearchParams({
      captcha_id: id,
      lot_number: input.lotNumber,
      captcha_output: input.captchaOutput,
      pass_token: input.passToken,
      gen_time: input.genTime
    });
    const res = await fetch(`${VERIFY_URL}?${params.toString()}`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      return { ok: false, skipped: false, reason: `http-${res.status}` };
    }
    const data = (await res.json()) as { result?: string; reason?: string };
    if (data.result !== 'success') {
      return { ok: false, skipped: false, reason: data.reason ?? 'unknown' };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    return { ok: false, skipped: false, reason: (err as Error).message || 'fetch-failed' };
  }
}
