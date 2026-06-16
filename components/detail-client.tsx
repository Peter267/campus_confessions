"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommentRecord, PostRecord } from '@/lib/types';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(value));
}

export function DetailClient({ post, comments }: { post: PostRecord; comments: CommentRecord[] }) {
  const router = useRouter();
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentList, setCommentList] = useState(comments);
  const [authorName, setAuthorName] = useState('路过同学');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  async function likePost() {
    setLikeCount((current) => current + 1);
    await fetch(`/api/posts/${post.id}/like`, { method: 'POST' });
    router.refresh();
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    const response = await fetch(`/api/posts/${post.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName, content })
    });
    if (response.ok) {
      const payload = (await response.json()) as CommentRecord;
      setCommentList((current) => [...current, payload]);
      setContent('');
    }
    setSubmitting(false);
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportReason.trim()) return;
    setReporting(true);
    await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id, reason: reportReason })
    });
    setReportDone(true);
    setReporting(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5">
        <article className="overflow-hidden rounded-[32px] border border-white/10 bg-[#0f172acc] shadow-glow">
          {post.image_url ? <img src={post.image_url} alt={post.category} className="max-h-[620px] w-full object-cover" /> : null}
          <div className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1">{post.category}</span>
              <span>发布于 {formatTime(post.created_at)}</span>
              <span>评论 {commentList.length}</span>
            </div>
            <p className="whitespace-pre-wrap text-base leading-8 text-slate-100">{post.content}</p>
            <div className="flex items-center gap-3">
              <button onClick={likePost} className="rounded-full bg-rose-400/15 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/25">
                ♥ {likeCount}
              </button>
              <span className="text-sm text-slate-400">{post.alias || '匿名同学'}</span>
              <button onClick={() => setShowReport(!showReport)} className="ml-auto rounded-full border border-red-400/15 bg-red-400/5 px-3 py-1.5 text-xs text-red-200/60 transition hover:bg-red-400/10 hover:text-red-200">
                {reportDone ? '已举报' : '举报'}
              </button>
            </div>
            {showReport && !reportDone && (
              <form onSubmit={submitReport} className="rounded-2xl border border-red-400/15 bg-red-400/5 p-4">
                <p className="mb-2 text-xs text-slate-300">请选择举报理由：</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {['人身攻击', '隐私曝光', '违规内容', '广告引流', '其他'].map((reason) => (
                    <button key={reason} type="button" onClick={() => setReportReason(reason)} className={`rounded-full border px-3 py-1 text-xs transition ${reportReason === reason ? 'border-red-300/40 bg-red-400/15 text-red-100' : 'border-white/10 text-slate-400 hover:bg-white/6'}`}>
                      {reason}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={reporting || !reportReason} className="rounded-full bg-red-400/15 px-4 py-2 text-xs text-red-100 transition hover:bg-red-400/25 disabled:opacity-50">
                    {reporting ? '提交中...' : '提交举报'}
                  </button>
                  <button type="button" onClick={() => setShowReport(false)} className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-400 hover:text-white">
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        </article>

        <div className="rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <h3 className="mb-4 font-display text-2xl text-white">盖楼互动区</h3>
          <form onSubmit={submitComment} className="space-y-4">
            <input
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"
              placeholder="你的代号"
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              className="w-full rounded-[24px] border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"
              placeholder="留下你的看法、祝福或补充信息"
            />
            <div className="flex justify-end">
              <button disabled={submitting} className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition disabled:opacity-50">
                {submitting ? '发送中...' : '发送评论'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
          <h3 className="mb-3 font-display text-2xl text-white">楼层列表</h3>
          <div className="space-y-3">
            {commentList.length ? (
              commentList.map((comment, index) => (
                <div key={comment.id} className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>#{index + 1} {comment.author_name}</span>
                    <span>{formatTime(comment.created_at)}</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-100">{comment.content}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">还没有人盖楼，来抢首评。</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
