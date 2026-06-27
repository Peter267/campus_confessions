"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { AuthShell, Field, FormError, PrimaryButton, TextInput } from './auth-shell';
import { Captcha, type CaptchaResult } from './captcha';

// Auth.js v5 signIn('credentials', { ... }) 返回类型
interface SignInResponse {
  error?: string | null;
  ok?: boolean;
  status?: number;
  url?: string | null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [captchaResult, setCaptchaResult] = useState<CaptchaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 已登录时由 middleware/authorized callback 负责跳转，前端不再主动检查

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = (await signIn('credentials', {
        identifier,
        password,
        // turnstile / geetest 透传给 Credentials Provider（authorize 里可读取）
        turnstileToken: captchaResult?.turnstileToken ?? undefined,
        geetest: captchaResult?.geetest ? JSON.stringify(captchaResult.geetest) : undefined,
        redirect: false,
        callbackUrl: next
      })) as SignInResponse | undefined;

      if (!result || result.error) {
        // Auth.js 在 Credentials authorize 返回 null 时会回 error=CredentialsSignin
        const code = result?.error ?? 'CredentialsSignin';
        if (code === 'CredentialsSignin') {
          setError('账号或密码不正确，或账号已被停用');
        } else {
          setError(`登录失败：${code}`);
        }
        setBusy(false);
        return;
      }
      // 登录成功，跳到 callbackUrl
      router.push(next);
      router.refresh();
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
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <Field label="用户名 / 邮箱">
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
        <Field label="密码">
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
    </AuthShell>
  );
}
