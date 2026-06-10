"use client";

import { useState } from 'react';
import type { ModerationSettingsRecord, PostRecord } from '@/lib/types';

function joinLines(value: string[]) {
  return value.join('\n');
}

function splitLines(value: string) {
  return value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AdminDashboard({
  pendingPosts,
  publishedPosts,
  settings,
  token
}: {
  pendingPosts: PostRecord[];
  publishedPosts: PostRecord[];
  settings: ModerationSettingsRecord;
  token: string;
}) {
  const [pending, setPending] = useState(pendingPosts);
  const [published, setPublished] = useState(publishedPosts);
  const [keywords, setKeywords] = useState(joinLines(settings.blocked_keywords));
  const [aliases, setAliases] = useState(joinLines(settings.blocked_aliases));
  const [ips, setIps] = useState(joinLines(settings.blocked_ips));
  const [notice, setNotice] = useState('');

  async function movePost(id: string, action: 'approve' | 'reject') {
    const response = await fetch(`/api/admin/posts/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      setNotice('操作失败，请检查管理口令');
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
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: JSON.stringify({
        blocked_keywords: splitLines(keywords),
        blocked_aliases: splitLines(aliases),
        blocked_ips: splitLines(ips)
      })
    });

    setNotice(response.ok ? '敏感词与封禁规则已更新' : '保存失败');
  }

  return (
    <div className="space-y-8">
      {notice ? <p className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-100">{notice}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-2xl text-white">待审核队列</h3>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">{pending.length} 条</span>
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
                  <button onClick={() => movePost(post.id, 'approve')} className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/25">
                    一键通过
                  </button>
                  <button onClick={() => movePost(post.id, 'reject')} className="rounded-full bg-rose-400/15 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/25">
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
            <h3 className="mb-4 font-display text-2xl text-white">规则面板</h3>
            <div className="space-y-4 text-sm">
              <label className="block space-y-2">
                <span className="text-slate-300">违规关键词</span>
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
              <button onClick={saveSettings} className="w-full rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-4 py-3 font-semibold text-slate-950">
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
