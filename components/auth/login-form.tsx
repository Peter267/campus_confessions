"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthShell, Field, FormError, FormSuccess, PrimaryButton, TextInput } from './auth-shell';
import { OauthButtons } from './oauth-buttons';
import { Captcha, type CaptchaResult } from './captcha';

interface LoginResponse {
  user?: { id: string; display_name: string; role: string };
  error?: string;
  detail?: string;
  details?: { fieldErrors?: Record<string, string[]> };
}

interface MagicSendResponse {
  ok?: boolean;
  error?: string;
  transport?: string;
  previewUrl?: string;
  previewToken?: string;
}

type Mode = 'password' | 'magic';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const magicToken = searchParams.get('magic');

  const [mode, setMode] = useState<Mode>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [captchaResult, setCaptchaResult] = useState<CaptchaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [devMagicUrl, setDevMagicUrl] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);

  useEffect(() => {
    // 拉取已启用的第三方登录提供方
    fetch('/api/auth/oauth-providers', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { providers?: { provider: string }[] }) => {
        if (data.providers) setOauthProviders(data.providers.map((p) => p.provider));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // 如果已登录，直接跳走
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { user?: unknown }) => {
        if (data.user) router.replace(next);
      })
      .catch(() => undefined);
  }, [router, next]);

  // 从邮件链接跳转过来时，自动用 token 完成魔法链接登录
  useEffect(() => {
    if (!magicToken) return;
    const timer = setTimeout(() => {
      setMode('magic');
      setBusy(true);
      setError(null);
      fetch('/api/auth/magic-link/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: magicToken })
      })
        .then(async (res) => {
          const data = (await res.json()) as LoginResponse;
          if (!res.ok) {
            setError(data.error ?? '登录链接无效或已过期');
            setBusy(false);
            return;
          }
          router.push(next);
          router.refresh();
        })
        .catch((err) => {
          setError((err as Error).message || '网络异常，请稍后重试');
          setBusy(false);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [magicToken, router, next]);

  async function onPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, turnstileToken: captchaResult?.turnstileToken ?? undefined, geetest: captchaResult?.geetest ?? undefined })
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok) {
        const detail = data.detail ? `（${data.detail}）` : '';
        setError((data.error ?? '登录失败') + detail);
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || '网络异常，请稍后重试');
      setBusy(false);
    }
  }

  async function onMagicSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/magic-link/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken: captchaResult?.turnstileToken ?? undefined, geetest: captchaResult?.geetest ?? undefined })
      });
      const data = (await res.json()) as MagicSendResponse;
      if (!res.ok) {
        setError(data.error ?? '发送失败');
        setBusy(false);
        return;
      }
      if (data.transport === 'dev-console' && data.previewUrl) {
        // 开发模式：直接展示链接方便本地测试
        setSuccess(`开发模式：点击下方链接登录（生产环境会发送到邮箱）`);
        setDevMagicUrl(data.previewUrl);
      } else {
        setSuccess('登录链接已发送到你的邮箱，请在 10 分钟内点击链接完成登录。');
      }
      setBusy(false);
    } catch (err) {
      setError((err as Error).message || '网络异常，请稍后重试');
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="欢迎回来"
      subtitle="登录后即可参与校园墙的实名互动"
      footer={
        <>
          还没有账号？{' '}
          <Link href="/register" className="text-cyan-200 hover:text-cyan-100">
            立即注册
          </Link>
          <span className="mx-2 text-slate-500">·</span>
          <Link href="/forgot-password" className="text-cyan-200 hover:text-cyan-100">
            忘记密码
          </Link>
        </>
      }
    >
      {/* 模式切换 */}
      <div className="mb-5 flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
        <button
          type="button"
          onClick={() => { setMode('password'); setError(null); setSuccess(null); }}
          className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'password' ? 'bg-gradient-to-r from-amber-300 to-cyan-300 text-slate-950' : 'text-slate-300 hover:text-white'}`}
        >
          密码登录
        </button>
        <button
          type="button"
          onClick={() => { setMode('magic'); setError(null); setSuccess(null); }}
          className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'magic' ? 'bg-gradient-to-r from-amber-300 to-cyan-300 text-slate-950' : 'text-slate-300 hover:text-white'}`}
        >
          邮箱链接登录
        </button>
      </div>

      <FormError message={error} />
      <FormSuccess message={success} />

      {mode === 'password' ? (
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <Field label="用户名 / 邮箱" error={fieldErrors.identifier?.[0]}>
            <TextInput
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="例如：student@school.edu"
            />
          </Field>
          <Field label="密码" error={fieldErrors.password?.[0]}>
            <TextInput
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 10 位，包含字母与数字"
            />
          </Field>
          <Captcha onChange={setCaptchaResult} />
          <PrimaryButton type="submit" busy={busy}>
            登录
          </PrimaryButton>
        </form>
      ) : (
        <form onSubmit={onMagicSend} className="space-y-4">
          <Field label="邮箱" hint="我们会向该邮箱发送一次性登录链接">
            <TextInput
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@school.edu"
            />
          </Field>
          <Captcha onChange={setCaptchaResult} />
          <PrimaryButton type="submit" busy={busy}>
            发送登录链接
          </PrimaryButton>
          {devMagicUrl ? (
            <a
              href={devMagicUrl}
              className="block break-all rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/20"
            >
              {devMagicUrl}
            </a>
          ) : null}
          {magicToken && busy ? <p className="text-xs text-slate-400">正在用邮件链接登录…</p> : null}
        </form>
      )}

      <OauthButtons next={next} enabledProviders={oauthProviders} />
    </AuthShell>
  );
}
