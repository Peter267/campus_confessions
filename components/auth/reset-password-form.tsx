"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthShell, Field, FormError, FormSuccess, PrimaryButton, TextInput } from './auth-shell';

interface ResetResponse {
  ok?: boolean;
  user?: { id: string; display_name: string };
  error?: string;
  details?: { fieldErrors?: Record<string, string[]> };
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    if (password !== confirm) {
      setFieldErrors({ password: ['两次输入的密码不一致'] });
      return;
    }
    if (!token) {
      setError('链接已失效，请重新申请');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = (await res.json()) as ResetResponse;
      if (!res.ok) {
        setError(data.error ?? '重置失败');
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        setBusy(false);
        return;
      }
      setSuccess('密码已更新，正在带你进入个人主页...');
      setTimeout(() => router.push('/profile'), 800);
    } catch (err) {
      setError((err as Error).message || '网络异常，请稍后重试');
      setBusy(false);
    }
  }

  return (
    <AuthShell title="设置新密码" subtitle="链接有效期 30 分钟，请尽快完成。">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <FormSuccess message={success} />
        {!token ? (
          <p className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
            链接中未携带 token，请回到邮箱重新申请。
          </p>
        ) : null}
        <Field label="新密码" hint="至少 10 位，同时包含字母和数字" error={fieldErrors.password?.[0]}>
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入新的密码"
          />
        </Field>
        <Field label="确认密码" error={null}>
          <TextInput
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="再次输入新密码"
          />
        </Field>
        <PrimaryButton type="submit" busy={busy} disabled={!token}>
          更新密码
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
