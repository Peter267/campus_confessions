"use client";

import Link from 'next/link';
import { useState } from 'react';
import { AuthShell, Field, FormError, FormSuccess, PrimaryButton, TextInput } from './auth-shell';
import { Captcha, type CaptchaResult } from './captcha';

interface ForgotResponse {
  ok?: boolean;
  error?: string;
  transport?: string;
  previewUrl?: string;
  previewToken?: string;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [captchaResult, setCaptchaResult] = useState<CaptchaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPreviewLink(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken: captchaResult?.turnstileToken ?? undefined, geetest: captchaResult?.geetest ?? undefined })
      });
      const data = (await res.json()) as ForgotResponse;
      if (!res.ok) {
        setError(data.error ?? '申请失败');
        setBusy(false);
        return;
      }
      setSuccess('如果该邮箱已注册，重置链接已发送。请同时检查垃圾邮件箱。');
      if (data.previewUrl) setPreviewLink(data.previewUrl);
    } catch (err) {
      setError((err as Error).message || '网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="找回密码"
      subtitle="输入注册时使用的邮箱，我们会发送重置链接"
      footer={
        <Link href="/login" className="text-cyan-200 hover:text-cyan-100">
          返回登录
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <FormSuccess message={success} />
        <Field label="邮箱" error={null}>
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
        <Captcha onChange={setCaptchaResult} />
        <PrimaryButton type="submit" busy={busy}>
          发送重置链接
        </PrimaryButton>
        {previewLink ? (
          <p className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
            开发模式：重置链接已生成，<a href={previewLink} className="underline">直接打开</a>。
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
