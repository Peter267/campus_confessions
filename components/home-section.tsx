"use client";

import { useState } from 'react';
import type { FeedPage } from '@/lib/types';
import { HomeFeed } from '@/components/home-feed';

export function HomeSection({ initialPage }: { initialPage: FeedPage }) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索帖子内容、代号或分类..."
          className="w-full rounded-2xl border border-white/10 bg-white/7 px-4 py-3 pr-10 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-white transition"
              aria-label="清除搜索"
            >
              ✕
            </button>
          ) : (
            <span>🔍</span>
          )}
        </span>
      </div>

      <HomeFeed initialPage={initialPage} searchQuery={searchQuery} />
    </div>
  );
}