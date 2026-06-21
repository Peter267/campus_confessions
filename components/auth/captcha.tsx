"use client";

import { useEffect, useRef, useState } from 'react';
import { Turnstile } from './turnstile';

// 统一人机验证组件
// 根据后端 /api/auth/captcha-config 返回的 provider 渲染：
//   - turnstile : Cloudflare Turnstile
//   - geetest   : 极验 Geetest v4
//   - none      : 不渲染
// 通过 onChange 把验证结果回传给父表单
export interface CaptchaResult {
  turnstileToken?: string | null;
  geetest?: {
    lotNumber: string;
    captchaOutput: string;
    passToken: string;
    genTime: string;
  } | null;
}

type Provider = 'none' | 'turnstile' | 'geetest';

export function Captcha({ onChange }: { onChange: (result: CaptchaResult) => void }) {
  const [provider, setProvider] = useState<Provider>('none');
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [geetestCaptchaId, setGeetestCaptchaId] = useState<string | null>(null);
  const geetestContainerRef = useRef<HTMLDivElement | null>(null);
  const geetestSdkLoadedRef = useRef(false);
  const geetestInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    fetch('/api/auth/captcha-config', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { provider: Provider; turnstileSiteKey?: string | null; geetestCaptchaId?: string | null }) => {
        setProvider(data.provider);
        setTurnstileSiteKey(data.turnstileSiteKey ?? null);
        setGeetestCaptchaId(data.geetestCaptchaId ?? null);
      })
      .catch(() => undefined);
  }, []);

  // Geetest v4 SDK 动态加载
  useEffect(() => {
    if (provider !== 'geetest' || !geetestCaptchaId || !geetestContainerRef.current) return;
    if (geetestInstanceRef.current) return;

    function initGeetest() {
      if (typeof window === 'undefined') return;
      const init = (window as { initGeetest4?: (opts: unknown, cb: (captcha: unknown) => void) => void }).initGeetest4;
      if (!init) return;
      init(
        {
          captchaId: geetestCaptchaId,
          product: 'float',
          language: 'zh-cn'
        },
        (captcha: unknown) => {
          const c = captcha as { appendTo?: (el: HTMLElement) => void; onSuccess?: (cb: () => void) => void };
          if (c.appendTo && geetestContainerRef.current) {
            c.appendTo(geetestContainerRef.current);
          }
          if (c.onSuccess) {
            c.onSuccess(() => {
              const result = (captcha as { getValidate?: () => { lot_number: string; captcha_output: string; pass_token: string; gen_time: string } }).getValidate?.();
              if (result) {
                onChange({
                  geetest: {
                    lotNumber: result.lot_number,
                    captchaOutput: result.captcha_output,
                    passToken: result.pass_token,
                    genTime: result.gen_time
                  }
                });
              }
            });
          }
          geetestInstanceRef.current = captcha;
        }
      );
    }

    if (geetestSdkLoadedRef.current) {
      initGeetest();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://static.geetest.com/v4/gt4.js';
    script.async = true;
    script.onload = () => {
      geetestSdkLoadedRef.current = true;
      initGeetest();
    };
    document.head.appendChild(script);
  }, [provider, geetestCaptchaId, onChange]);

  if (provider === 'none') return null;

  if (provider === 'turnstile') {
    return <Turnstile siteKey={turnstileSiteKey ?? undefined} onChange={(token) => onChange({ turnstileToken: token })} />;
  }

  if (provider === 'geetest') {
    return (
      <div>
        <div ref={geetestContainerRef} className="min-h-[44px]" />
        <p className="mt-1 text-xs text-slate-500">完成上方行为验证后即可提交</p>
      </div>
    );
  }

  return null;
}
