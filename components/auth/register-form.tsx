"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthShell, Field, FormError, FormSuccess, PrimaryButton, TextInput } from './auth-shell';
import { Captcha, type CaptchaResult } from './captcha';

// POST /api/auth/register 返回结构
interface RegisterResponse {
  ok?: boolean;
  user?: { id: string; username: string; email: string; display_name: string };
  error?: string;
  detail?: string;
  details?: { fieldErrors?: Record<string, string[]> };
  emailVerification?: { sent: boolean; transport: string; previewUrl?: string };
  next?: string;
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/login';

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [captchaResult, setCaptchaResult] = useState<CaptchaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    setPreviewLink(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          displayName,
          password,
          turnstileToken: captchaResult?.turnstileToken ?? undefined,
          geetest: captchaResult?.geetest ?? undefined
        })
      });
      const data = (await res.json()) as RegisterResponse;
      if (!res.ok) {
        const detail = data.detail ? `（${data.detail}）` : '';
        setError((data.error ?? '注册失败') + detail);
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        setBusy(false);
        return;
      }
      // 注册成功：账号已落库，但不在此处自动登录（Auth.js cookie 设置复杂），
      // 引导用户去 /login 用 Auth.js signIn 完成。
      setSuccess('注册成功！请使用刚注册的账号登录。');
      if (data.emailVerification?.previewUrl) setPreviewLink(data.emailVerification.previewUrl);
      setBusy(false);
      // 跳到 /login，让用户用 Auth.js 完成 signIn
      const target = data.next ?? next;
      setTimeout(() => router.push(target), 1000);
    } catch (err) {
      setError((err as Error).message || '网络异常，请稍后重试');
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="加入校园墙"
      subtitle="注册后即可享受完整功能：实名互动、个人主页、关注与收藏"
      footer={
        <>
          已经有账号？{' '}
          <Link href="/login" className="text-cyan-200 hover:text-cyan-100">
            直接登录
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <FormSuccess message={success} />
        <Field label="用户名" hint="3-24 位，小写字母/数字/下划线，登录后不可修改" error={fieldErrors.username?.[0]}>
          <TextInput
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="例如：xiaoyu_2026"
          />
        </Field>
        <Field label="邮箱" hint="用于找回密码与重要通知" error={fieldErrors.email?.[0]}>
          <TextInput
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            placeholder="例如：xiaoyu@school.edu"
          />
        </Field>
        <Field label="昵称" hint="2-24 个字符，将公开显示在帖子和评论中" error={fieldErrors.displayName?.[0]}>
          <TextInput
            name="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例如：晚自习逃跑者"
          />
        </Field>
        <Field label="密码" hint="至少 10 位，必须同时包含字母和数字" error={fieldErrors.password?.[0]}>
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请设置一个安全系数高的密码"
          />
        </Field>
        <Captcha onChange={setCaptchaResult} />
        <PrimaryButton type="submit" busy={busy}>
          创建账号
        </PrimaryButton>
        {previewLink ? (
          <p className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
            开发模式：邮箱验证链接已生成，<a href={previewLink} className="underline">点击此处直接验证</a>。
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
