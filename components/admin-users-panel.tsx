"use client";

// 用户管理面板（嵌入管理后台“用户管理”标签页）
// 支持分页查看注册用户、修改角色与状态（角色仅超级管理员可改）。

import { useEffect, useMemo, useState } from 'react';
import type { UserRecord, UserRole, UserStatus } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';

const STATUS_LABELS: Record<UserStatus, string> = {
  active: '正常',
  suspended: '封禁',
  closed: '已关闭'
};

const ROLE_OPTIONS: UserRole[] = ['user', 'moderator', 'admin', 'superadmin'];
const STATUS_OPTIONS: UserStatus[] = ['active', 'suspended', 'closed'];

interface UsersResponse {
  users: UserRecord[];
  total: number;
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-admin-token': token };
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN');
}

export function UsersPanel({ token }: { token: string }) {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Record<string, { role: UserRole; status: UserStatus }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users?limit=${limit}&offset=${offset}`, {
        headers: authHeaders(token)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? `加载失败 (${res.status})`);
        return;
      }
      const payload = (await res.json()) as UsersResponse;
      setData(payload);
      const map: Record<string, { role: UserRole; status: UserStatus }> = {};
      payload.users.forEach((u) => {
        map[u.id] = { role: u.role, status: u.status };
      });
      setEditing(map);
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, offset]);

  const filtered = useMemo(() => {
    const list = data?.users ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        (u.username?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false)
    );
  }, [data, query]);

  async function saveUser(user: UserRecord) {
    const values = editing[user.id];
    if (!values) return;
    setSavingId(user.id);
    setNotice(null);
    try {
      const body: { id: string; role?: UserRole; status?: UserStatus } = { id: user.id };
      if (values.role !== user.role) body.role = values.role;
      if (values.status !== user.status) body.status = values.status;
      if (!body.role && !body.status) {
        setNotice({ type: 'err', text: '没有变更' });
        return;
      }
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'err', text: payload.error ?? `保存失败 (${res.status})` });
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) => (u.id === user.id ? (payload.user as UserRecord) : u))
        };
      });
      setEditing((prev) => ({
        ...prev,
        [user.id]: { role: payload.user.role, status: payload.user.status }
      }));
      setNotice({ type: 'ok', text: '用户资料已更新' });
    } finally {
      setSavingId(null);
    }
  }

  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const badgeCls = 'rounded-full border px-2 py-0.5 text-xs';
  const selectCls =
    'rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-xs text-white outline-none focus:border-cyan-300/50';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-display text-lg text-white">用户管理</h4>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索昵称 / 用户名 / 邮箱"
            className="w-56 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      {notice ? (
        <p
          className={`rounded-2xl border px-4 py-2 text-sm ${
            notice.type === 'ok'
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
              : 'border-rose-300/30 bg-rose-300/10 text-rose-100'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {error ? <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-2 text-sm text-rose-100">{error}</p> : null}

      <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/40">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="border-b border-white/10 bg-white/5 text-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">身份</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">注册方式</th>
              <th className="px-4 py-3 font-medium">注册时间</th>
              <th className="px-4 py-3 font-medium">最后登录</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((user) => {
              const values = editing[user.id];
              const changed = values && (values.role !== user.role || values.status !== user.status);
              return (
                <tr key={user.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-cyan-300 text-[10px] font-bold text-slate-950">
                          {user.display_name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-white">{user.display_name}</div>
                        <div className="text-[10px] text-slate-500">
                          {user.username ? `@${user.username}` : '未设置用户名'}
                          {user.email ? ` · ${user.email}` : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={values?.role ?? user.role}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [user.id]: { ...(prev[user.id] ?? { role: user.role, status: user.status }), role: e.target.value as UserRole }
                        }))
                      }
                      className={selectCls}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={values?.status ?? user.status}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [user.id]: { ...(prev[user.id] ?? { role: user.role, status: user.status }), status: e.target.value as UserStatus }
                        }))
                      }
                      className={selectCls}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {user.oauth_provider ? (
                      <span className={`${badgeCls} border-cyan-300/20 bg-cyan-300/10 text-cyan-100`}>
                        {user.oauth_provider}
                      </span>
                    ) : (
                      <span className={`${badgeCls} border-slate-500/20 bg-slate-500/10 text-slate-400`}>本地账号</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(user.created_at)}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(user.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void saveUser(user)}
                      disabled={!changed || savingId === user.id}
                      className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-3 py-1 text-[10px] font-semibold text-slate-950 transition disabled:opacity-40"
                    >
                      {savingId === user.id ? '保存中…' : '保存'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {query.trim() ? '没有匹配的用户' : '暂无用户数据'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>
            共 {total} 人 · 第 {currentPage} / {pageCount} 页
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              disabled={offset === 0 || loading}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              onClick={() => setOffset((o) => Math.min((pageCount - 1) * limit, o + limit))}
              disabled={offset + limit >= total || loading}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
