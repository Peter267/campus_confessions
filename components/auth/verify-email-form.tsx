"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthShell, FormError, FormSuccess, PrimaryButton } from './auth-shell';

interface VerifyResponse {
  user?: { display_name: string; email_verified_at: string | null };
  error?: string;
}

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!token || submittedRef.current) return;
    submittedRef.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        setError(data.error ?? '验证失败');
        setBusy(false);
        return;
      }
      setSuccess('邮箱已验证，即将跳转到个人主页...');
      setTimeout(() => router.push('/profile'), 800);
    } catch (err) {
      setError((err as Error).message || '网络异常，请稍后重试');
      setBusy(false);
    }
  }

  return (
    <AuthShell title="验证邮箱" subtitle="点击下方按钮完成验证（链接 10 分钟内有效）">
      <div className="space-y-4">
        <FormError message={error} />
        <FormSuccess message={success} />
        {!token ? (
          <p className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
            链接中未携带 token，请回到登录后的个人主页重新申请。
          </p>
        ) : null}
        <PrimaryButton onClick={submit} busy={busy} disabled={!token || busy}>
          {busy ? '验证中…' : '立即验证'}
        </PrimaryButton>
      </div>
    </AuthShell>
  );
}
