"use client";

import { useEffect, useRef, useState } from 'react';
import type { UserRecord } from '@/lib/types';
import { AuthShell, Field, FormError, FormSuccess, PrimaryButton, TextArea, TextInput } from './auth-shell';
import { ROLE_LABELS } from '@/lib/permissions';

interface ProfileResponse {
  user?: UserRecord;
  error?: string;
  details?: { fieldErrors?: Record<string, string[]> };
}

type UploadStatus = 'idle' | 'signing' | 'uploading' | 'done' | 'error';

async function uploadToR2(file: File, signal: AbortSignal): Promise<string> {
  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
    signal
  });
  if (!signRes.ok) {
    const payload = await signRes.json().catch(() => ({}));
    throw new Error(payload.error ?? '上传授权失败');
  }
  const sign = (await signRes.json()) as { uploadUrl: string; method: 'PUT'; headers: Record<string, string>; publicUrl: string };
  const putRes = await fetch(sign.uploadUrl, {
    method: sign.method,
    headers: sign.headers,
    body: file,
    signal
  });
  if (!putRes.ok) {
    throw new Error(`上传失败（HTTP ${putRes.status}）`);
  }
  return sign.publicUrl;
}

export function ProfileForm({ initialUser }: { initialUser: UserRecord }) {
  const [user, setUser] = useState<UserRecord>(initialUser);
  const [displayName, setDisplayName] = useState(initialUser.display_name);
  const [bio, setBio] = useState(initialUser.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser.avatar_url);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialUser.avatar_url);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleAvatar(file: File | null) {
    if (!file) {
      abortRef.current?.abort();
      abortRef.current = null;
      setAvatarUrl(null);
      setAvatarPreview(null);
      setUploadStatus('idle');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarUrl(null);
    setUploadStatus('signing');
    setError(null);
    setSuccess(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const url = await uploadToR2(file, controller.signal);
      if (abortRef.current === controller) {
        setAvatarUrl(url);
        setUploadStatus('done');
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      if (abortRef.current === controller) {
        setAvatarPreview(initialUser.avatar_url);
        setUploadStatus('error');
        setError((err as Error).message || '头像上传失败');
      }
    }
  }

  async function onSubmitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio: bio || null, avatarUrl })
      });
      const data = (await res.json()) as ProfileResponse;
      if (!res.ok) {
        setError(data.error ?? '保存失败');
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        setBusy(false);
        return;
      }
      if (data.user) setUser(data.user);
      setSuccess('个人资料已更新');
    } catch (err) {
      setError((err as Error).message || '网络异常');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmitProfile} className="space-y-5">
        <FormError message={error} />
        <FormSuccess message={success} />

        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-white/15 bg-white/8">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="头像预览" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">{displayName.slice(0, 1) || '?'}</div>
            )}
          </div>
          <div className="flex-1 space-y-2 text-sm">
            <label className="block">
              <span className="cursor-pointer rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs text-slate-100 transition hover:bg-white/12">
                选择新头像
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleAvatar(e.target.files?.[0] ?? null)}
                />
              </span>
            </label>
            <p className="text-xs text-slate-400">
              {uploadStatus === 'signing' && '准备上传通道…'}
              {uploadStatus === 'uploading' && '正在上传…'}
              {uploadStatus === 'done' && '头像已上传，点击保存即可生效'}
              {uploadStatus === 'error' && '上传失败，请重试'}
              {uploadStatus === 'idle' && (avatarUrl ? '已选择新头像' : '支持 png / jpg / webp / gif')}
            </p>
            {avatarUrl ? (
              <button type="button" className="text-xs text-slate-400 underline" onClick={() => handleAvatar(null)}>
                取消上传
              </button>
            ) : null}
          </div>
        </div>

        <Field label="昵称" hint="2-24 个字符，全站唯一" error={fieldErrors.displayName?.[0]}>
          <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="个人简介" hint="最多 200 字" error={fieldErrors.bio?.[0]}>
          <TextArea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} placeholder="一句话介绍自己吧" />
        </Field>
        <Field label="邮箱">
          <TextInput value={user.email ?? ''} disabled className="opacity-70" />
          {user.email && !user.email_verified_at ? (
            <p className="mt-2 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              当前邮箱尚未验证，请到邮箱点击链接。
            </p>
          ) : null}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="用户名">
            <TextInput value={user.username ?? ''} disabled className="opacity-70" />
          </Field>
          <Field label="角色">
            <TextInput value={ROLE_LABELS[user.role]} disabled className="opacity-70" />
          </Field>
        </div>
        <PrimaryButton type="submit" busy={busy}>
          保存修改
        </PrimaryButton>
      </form>

      <ChangePasswordForm />

      <SessionsList />
    </div>
  );
}

function ChangePasswordForm() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
    if (newPassword !== confirm) {
      setFieldErrors({ newPassword: ['两次输入的密码不一致'] });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = (await res.json()) as { error?: string; details?: { fieldErrors?: Record<string, string[]> } };
      if (!res.ok) {
        setError(data.error ?? '修改失败');
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        setBusy(false);
        return;
      }
      setSuccess('密码已更新，其他设备已被强制下线');
      setOldPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError((err as Error).message || '网络异常');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-[28px] border border-white/12 bg-white/5 p-5 sm:p-6">
      <h3 className="font-display text-lg text-white">修改密码</h3>
      <FormError message={error} />
      <FormSuccess message={success} />
      <Field label="当前密码" error={fieldErrors.oldPassword?.[0]}>
        <TextInput type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
      </Field>
      <Field label="新密码" hint="至少 10 位，同时包含字母和数字" error={fieldErrors.newPassword?.[0]}>
        <TextInput type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
      </Field>
      <Field label="确认新密码" error={fieldErrors.newPassword?.[0]}>
        <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <PrimaryButton type="submit" busy={busy}>
        更新密码
      </PrimaryButton>
    </form>
  );
}

interface SessionItem {
  id: string;
  isCurrent: boolean;
  expires: string;
}

function SessionsList() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me/sessions', { cache: 'no-store' });
        const data = (await res.json()) as { sessions?: SessionItem[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? '加载失败');
        } else {
          setSessions(data.sessions ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(id: string) {
    if (!confirm('确定要吊销该设备的登录吗？')) return;
    const res = await fetch('/api/users/me/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
    }
  }

  return (
    <div className="space-y-3 rounded-[28px] border border-white/12 bg-white/5 p-5 sm:p-6">
      <h3 className="font-display text-lg text-white">登录设备</h3>
      <p className="text-xs text-slate-400">
        列出当前账号所有活跃会话。Auth.js 数据库会话策略下，每个会话对应一个 session_token；可在此吊销其它设备。
      </p>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-400">加载中…</p> : null}
      {!loading && sessions.length === 0 ? <p className="text-sm text-slate-400">暂无活跃会话</p> : null}
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-xs text-slate-200 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-white">
                {s.isCurrent ? '当前设备' : '其他设备'}
              </p>
              <p className="text-slate-400">
                过期于 {new Date(s.expires).toLocaleString('zh-CN')}
              </p>
            </div>
            {!s.isCurrent ? (
              <button onClick={() => void revoke(s.id)} className="rounded-full border border-rose-300/30 px-3 py-1 text-rose-200 transition hover:bg-rose-500/15">
                吊销
              </button>
            ) : (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">本机</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
