"use client";

import { useEffect, useState } from 'react';
import type { ModerationSettingsRecord, PostRecord } from '@/lib/types';

const TOKEN_STORAGE_KEY = 'campus:admin-token';

function joinLines(value: string[]) {
  return value.join('\n');
}

function splitLines(value: string) {
  return value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-admin-token': token
  };
}

export function AdminDashboard({
  pendingPosts,
  publishedPosts,
  settings
}: {
  pendingPosts: PostRecord[];
  publishedPosts: PostRecord[];
  settings: ModerationSettingsRecord;
}) {
  const [token, setToken] = useState('');
  const [tokenReady, setTokenReady] = useState(false);
  // 三态：idle | verifying | verified；初次进入时若 sessionStorage 已有 token，
  // 也需要先验证一次，避免“上次保存的错误 TOKEN 仍能进”。
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'verified'>('idle');
  const [pending, setPending] = useState(pendingPosts);
  const [published, setPublished] = useState(publishedPosts);
  const [keywords, setKeywords] = useState(joinLines(settings.blocked_keywords));
  const [aliases, setAliases] = useState(joinLines(settings.blocked_aliases));
  const [ips, setIps] = useState(joinLines(settings.blocked_ips));
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState<'pending' | 'settings' | 'all' | null>(null);

  // 用 token 调一次受保护接口，200 即视为合法。
  async function verifyToken(value: string): Promise<boolean> {
    setVerifyState('verifying');
    setNotice('');
    try {
      const res = await fetch('/api/admin/settings', { headers: authHeaders(value) });
      if (res.ok) {
        return true;
      }
      const payload = await res.json().catch(() => ({}));
      setNotice(`口令错误：${payload.error ?? res.status}`);
      return false;
    } catch (error) {
      setNotice('验证请求失败，请检查网络');
      return false;
    } finally {
      setVerifyState((state) => (state === 'verifying' ? 'idle' : state));
    }
  }

  function persistToken(value: string) {
    setToken(value);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    }
  }

  function clearToken() {
    setToken('');
    setVerifyState('idle');
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  // 初次挂载：若 sessionStorage 已有 token，必须重新验证；
  // 因为服务端 .env 可能换过口令，旧 token 在浏览器里依然存着。
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '' : '';
    setTokenReady(true);
    if (stored) {
      setToken(stored);
      void (async () => {
        const ok = await verifyToken(stored);
        if (ok) {
          setVerifyState('verified');
        } else {
          // 验证失败则清掉，避免错误 token 一直留在 sessionStorage
          clearToken();
        }
      })();
    }
  }, []);

  async function refreshPending() {
    if (!token) return;
    setRefreshing('pending');
    setNotice('');
    try {
      const res = await fetch('/api/admin/pending', { headers: authHeaders(token) });
      if (!res.ok) {
        setNotice(`刷新失败：${res.status}`);
        if (res.status === 401) {
          clearToken();
        }
        return;
      }
      const data = (await res.json()) as { items: PostRecord[] };
      setPending(data.items);
    } catch (error) {
      setNotice('网络异常，未能刷新待审队列');
    } finally {
      setRefreshing(null);
    }
  }

  async function refreshPublished() {
    if (!token) return;
    setRefreshing('all');
    try {
      const res = await fetch('/api/admin/published', { headers: authHeaders(token) });
      if (!res.ok) {
        setNotice(`刷新失败：${res.status}`);
        if (res.status === 401) {
          clearToken();
        }
        return;
      }
      const data = (await res.json()) as { items: PostRecord[] };
      setPublished(data.items);
    } catch (error) {
      setNotice('网络异常，未能刷新已发布列表');
    } finally {
      setRefreshing(null);
    }
  }

  async function refreshSettings() {
    if (!token) return;
    setRefreshing('settings');
    try {
      const res = await fetch('/api/admin/settings', { headers: authHeaders(token) });
      if (!res.ok) {
        setNotice(`刷新失败：${res.status}`);
        if (res.status === 401) {
          clearToken();
        }
        return;
      }
      const data = (await res.json()) as ModerationSettingsRecord;
      setKeywords(joinLines(data.blocked_keywords));
      setAliases(joinLines(data.blocked_aliases));
      setIps(joinLines(data.blocked_ips));
    } catch (error) {
      setNotice('网络异常，未能刷新规则');
    } finally {
      setRefreshing(null);
    }
  }

  async function movePost(id: string, action: 'approve' | 'reject') {
    const response = await fetch(`/api/admin/posts/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(`操作失败：${payload.error ?? response.status}`);
      if (response.status === 401) {
        clearToken();
      }
      return;
    }

    const updated = (await response.json()) as PostRecord;
    setPending((current) => current.filter((item) => item.id !== id));

    if (updated.status === 'published') {
      setPublished((current) => [updated, ...current]);
    }

    setNotice(action === 'approve' ? '已通过发布' : '已驳回处理');
  }

  async function saveSettings() {
    const body = {
      blocked_keywords: splitLines(keywords),
      blocked_aliases: splitLines(aliases),
      blocked_ips: splitLines(ips)
    };
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(`保存失败：${payload.error ?? response.status}`);
      if (response.status === 401) {
        clearToken();
      }
      return;
    }

    // 用服务端返回的最新值回写本地 state，
    // 避免“按钮按了但 textarea 看上去没变，让用户以为没保存”。
    const saved = (await response.json()) as ModerationSettingsRecord;
    setKeywords(joinLines(saved.blocked_keywords ?? body.blocked_keywords));
    setAliases(joinLines(saved.blocked_aliases ?? body.blocked_aliases));
    setIps(joinLines(saved.blocked_ips ?? body.blocked_ips));
    setNotice('敏感词与封禁规则已更新');
  }

  if (!tokenReady) {
    return null;
  }

  if (!token || verifyState !== 'verified') {
    return (
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const value = String(formData.get('token') ?? '').trim();
          if (!value) {
            setNotice('请填写管理口令');
            return;
          }
          setVerifyState('verifying');
          const ok = await verifyToken(value);
          if (ok) {
            persistToken(value);
            setVerifyState('verified');
            setNotice('');
          } else {
            setVerifyState('idle');
          }
        }}
        className="space-y-4 rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl"
      >
        <h3 className="font-display text-2xl text-white">输入管理口令</h3>
        <p className="text-sm text-slate-300">
          口令会先经过服务端校验，错误的口令会立即被拒。验证通过后仅保存在当前浏览器会话（sessionStorage），不会写入 URL 或服务端日志。
        </p>
        <input
          name="token"
          type="password"
          autoComplete="off"
          placeholder="ADMIN_TOKEN"
          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"
        />
        <button
          type="submit"
          disabled={verifyState === 'verifying'}
          className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {verifyState === 'verifying' ? '验证中...' : '进入后台'}
        </button>
        {notice ? <p className="text-sm text-amber-100">{notice}</p> : null}
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => void (async () => {
            await Promise.all([refreshPending(), refreshPublished(), refreshSettings()]);
            setNotice('已从服务端刷新最新数据');
          })()}
          disabled={refreshing !== null}
          className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing ? '刷新中…' : '一键刷新全部'}
        </button>
        <button
          onClick={clearToken}
          className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10"
        >
          清除已保存的口令
        </button>
      </div>

      {notice ? <p className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-100">{notice}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-2xl text-white">待审核队列</h3>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">{pending.length} 条</span>
              <button
                onClick={() => void refreshPending()}
                disabled={refreshing === 'pending' || refreshing === 'all'}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                {refreshing === 'pending' ? '刷新中…' : '刷新待审'}
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {pending.map((post) => (
              <article key={post.id} className="rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{post.alias}</span>
                  <span>·</span>
                  <span>{post.category}</span>
                  <span>·</span>
                  <span>{new Date(post.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{post.content}</p>
                {post.image_url ? <img src={post.image_url} alt="投稿图片" className="mt-4 max-h-60 w-full rounded-2xl object-cover" /> : null}
                <div className="mt-4 flex gap-3">
                  <button onClick={() => void movePost(post.id, 'approve')} className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/25">
                    一键通过
                  </button>
                  <button onClick={() => void movePost(post.id, 'reject')} className="rounded-full bg-rose-400/15 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/25">
                    驳回
                  </button>
                </div>
              </article>
            ))}
            {pending.length === 0 ? <p className="text-sm text-slate-400">暂无待审核内容。</p> : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-2xl text-white">规则面板</h3>
              <button
                onClick={() => void refreshSettings()}
                disabled={refreshing === 'settings' || refreshing === 'all'}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                {refreshing === 'settings' ? '刷新中…' : '从服务端同步'}
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <label className="block space-y-2">
                <span className="text-slate-300">违规关键词（每行一个，逗号也支持）</span>
                <textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} rows={5} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white outline-none" />
              </label>
              <label className="block space-y-2">
                <span className="text-slate-300">封禁代号</span>
                <textarea value={aliases} onChange={(event) => setAliases(event.target.value)} rows={4} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white outline-none" />
              </label>
              <label className="block space-y-2">
                <span className="text-slate-300">封禁 IP</span>
                <textarea value={ips} onChange={(event) => setIps(event.target.value)} rows={4} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white outline-none" />
              </label>
              <button onClick={() => void saveSettings()} className="w-full rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-4 py-3 font-semibold text-slate-950">
                保存规则
              </button>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
            <h3 className="mb-4 font-display text-2xl text-white">已发布列表</h3>
            <div className="hide-scrollbar max-h-[560px] space-y-3 overflow-auto pr-1">
              {published.map((post) => (
                <article key={post.id} className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-100">
                  <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
                    <span>{post.alias}</span>
                    <span>♥ {post.like_count} · {post.comment_count} 评论</span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap leading-6">{post.content}</p>
                </article>
              ))}
              {published.length === 0 ? <p className="text-sm text-slate-400">暂无已发布内容。</p> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
