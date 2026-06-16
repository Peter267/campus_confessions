"use client";

import { useEffect, useRef, useState } from 'react';
import type { FeedPage, PostRecord } from '@/lib/types';
import { PostCard } from '@/components/post-card';
import { SkeletonCard } from '@/components/ui';

export function HomeFeed({ initialPage, searchQuery }: { initialPage: FeedPage; searchQuery: string }) {
  const [items, setItems] = useState<PostRecord[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<PostRecord[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索模式：防抖 300ms 后请求搜索接口
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  async function doSearch(q: string) {
    setSearchLoading(true);
    try {
      const response = await fetch(`/api/posts?q=${encodeURIComponent(q)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { items: PostRecord[] };
      setSearchResults(data.items);
    } catch (error) {
      console.error('[home-feed] 搜索失败', error);
    } finally {
      setSearchLoading(false);
    }
  }

  // 无限滚动（仅在非搜索模式）
  useEffect(() => {
    if (searchQuery.trim()) return;

    const target = sentinelRef.current;
    if (!target || !cursor) {
      return;
    }

    let cancelled = false;
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
      cancelled = true;
      controller.abort();
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loading, searchQuery]);

  async function loadMore(signal?: AbortSignal) {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/posts?limit=12&cursor=${cursor}`, { signal });
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
  }

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
