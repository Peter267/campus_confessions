"use client";

import { useState } from 'react';
import type { CategoryRecord, FeedPage } from '@/lib/types';
import { HomeFeed } from '@/components/home-feed';

export function HomeSection({
  initialPage,
  categories,
  category
}: {
  initialPage: FeedPage;
  categories: CategoryRecord[];
  category: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索帖子内容、代号或分类..."
          className="w-full rounded-xl border border-white/8 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
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

      <HomeFeed
        initialPage={initialPage}
        searchQuery={searchQuery}
        category={category}
      />
    </div>
  );
}
