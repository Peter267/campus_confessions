"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedPage, PostRecord } from '@/lib/types';
import { PostCard } from '@/components/post-card';
import { SkeletonCard } from '@/components/ui';

function buildPostsUrl(params: { q?: string; cursor?: string | null; limit?: number; category?: string | null }) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.category) search.set('category', params.category);
  const qs = search.toString();
  return `/api/posts${qs ? `?${qs}` : ''}`;
}

export function HomeFeed({
  initialPage,
  searchQuery,
  category
}: {
  initialPage: FeedPage;
  searchQuery: string;
  category: string | null;
}) {
  const [items, setItems] = useState<PostRecord[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<PostRecord[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当父组件传入的 initialPage 变化（例如切换分类）时，把本地 items/cursor
  // 重置为新数据。这是 "props 变化同步到本地 state" 的合法 use case。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(initialPage.items);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(initialPage.nextCursor);
  }, [initialPage]);

  const doSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const response = await fetch(buildPostsUrl({ q, category }));
      if (!response.ok) return;
      const data = (await response.json()) as { items: PostRecord[] };
      setSearchResults(data.items);
    } catch (error) {
      console.error('[home-feed] 搜索失败', error);
    } finally {
      setSearchLoading(false);
    }
  }, [category]);

  // 搜索模式：防抖 300ms 后请求搜索接口
  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      void doSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, doSearch]);

  const loadMore = useCallback(async (signal?: AbortSignal) => {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(buildPostsUrl({ cursor, limit: 12, category }), { signal });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as FeedPage;
      setItems((current) => [...current, ...data.items]);
      setCursor(data.nextCursor);
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        console.error('[home-feed] 加载更多失败', error);
      }
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, category]);

  // 无限滚动（仅在非搜索模式）
  useEffect(() => {
    if (searchQuery.trim()) return;

    const target = sentinelRef.current;
    if (!target || !cursor) {
      return;
    }

    const controller = new AbortController();

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          void loadMore(controller.signal);
        }
      },
      { rootMargin: '480px' }
    );

    observer.observe(target);
    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [cursor, loading, searchQuery, loadMore]);

  // 搜索模式显示结果
  if (searchQuery.trim()) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          {searchLoading ? '搜索中...' : searchResults ? `找到 ${searchResults.length} 条相关帖子` : ''}
        </p>
        {searchResults && searchResults.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/6 px-4 py-8 text-center text-sm text-slate-400">没有找到匹配的帖子，试试换个关键词。</p>
        ) : null}
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {(searchResults ?? []).map((post) => (
            <div key={post.id} className="mb-4 break-inside-avoid">
              <PostCard post={post} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {category ? (
        <p className="text-xs text-slate-400">当前分类：<span className="text-slate-200">{category}</span> · 共 {items.length} 条</p>
      ) : null}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {items.map((post) => (
          <div key={post.id} className="mb-4 break-inside-avoid">
            <PostCard post={post} />
          </div>
        ))}
        {loading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="mb-4 break-inside-avoid"><SkeletonCard /></div>) : null}
      </div>
      <div ref={sentinelRef} className="h-8" />
      {cursor ? null : <p className="pt-6 text-center text-sm text-slate-400">已滑到底部，没有更多新内容。</p>}
    </>
  );
}
