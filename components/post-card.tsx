"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { PostRecord } from '@/lib/types';

const avatarGradients = [
  'from-rose-400 via-orange-300 to-amber-200',
  'from-cyan-400 via-sky-300 to-teal-200',
  'from-emerald-400 via-lime-300 to-yellow-200',
  'from-fuchsia-400 via-pink-300 to-rose-200',
  'from-indigo-400 via-violet-300 to-sky-200'
];

function pickGradient(seed: string) {
  const index = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarGradients.length;
  return avatarGradients[index];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function PostCard({ post }: { post: PostRecord }) {
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const gradient = pickGradient(post.alias || post.id);

  async function handleLike(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    setLiked((current) => !current);
    setLikeCount((current) => current + 1);
    await fetch(`/api/posts/${post.id}/like`, { method: 'POST' });
  }

  return (
    <article className="group overflow-hidden rounded-[28px] border border-white/10 bg-[#0f172acc] text-white shadow-[0_20px_60px_rgba(2,6,23,0.35)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-[#111c32]">
      <div
        role="link"
        tabIndex={0}
        className="block w-full cursor-pointer text-left outline-none"
        onClick={() => router.push(`/post/${post.id}`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            router.push(`/post/${post.id}`);
          }
        }}
      >
        <div className="relative p-3">
          {post.image_url ? (
            <img src={post.image_url} alt={post.category} className="h-[330px] w-full rounded-[22px] object-cover transition duration-500 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex h-[330px] w-full items-end rounded-[22px] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.26),_transparent_42%),linear-gradient(160deg,_rgba(248,113,113,0.85),_rgba(14,165,233,0.8),_rgba(15,23,42,0.95))] p-5">
              <div className="max-w-[22ch] text-lg font-medium leading-8 text-white/95">{post.content}</div>
            </div>
          )}
        </div>

        <div className="space-y-4 p-5 pt-1">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-sm font-bold text-slate-900 shadow-lg`}>
              {(post.alias || '匿').slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-white">{post.alias || '匿名同学'}</p>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] text-cyan-100">{post.category}</span>
              </div>
              <p className="text-xs text-slate-400">{formatTime(post.created_at)}</p>
            </div>
          </div>

          <p className="line-clamp-3 text-sm leading-6 text-slate-200">{post.content}</p>

          <div className="flex items-center justify-between gap-4 text-sm text-slate-300">
            <button
              type="button"
              onClick={handleLike}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 transition ${liked ? 'border-rose-300/40 bg-rose-400/15 text-rose-100' : 'border-white/10 bg-white/6 hover:bg-white/10'}`}
            >
              <span className={`text-base transition duration-300 ${liked ? 'scale-125 text-rose-200' : 'text-rose-300 group-hover:scale-110'}`}>♥</span>
              <span>{likeCount}</span>
            </button>
            <Link href={`/post/${post.id}`} className="text-xs font-medium text-cyan-100 transition hover:text-cyan-50">
              查看完整楼层 →
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
