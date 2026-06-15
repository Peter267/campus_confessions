"use client";

import { useEffect, useRef, useState } from 'react';
import type { FeedPage, PostRecord } from '@/lib/types';
import { PostCard } from '@/components/post-card';
import { SkeletonCard } from '@/components/ui';

export function HomeFeed({ initialPage }: { initialPage: FeedPage }) {
  const [items, setItems] = useState<PostRecord[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
  }, [cursor, loading]);

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

  return (
    <>
      <div className="masonry-grid">
        {items.map((post) => (
          <div key={post.id} className="masonry-item">
            <PostCard post={post} />
          </div>
        ))}
        {loading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="masonry-item"><SkeletonCard /></div>) : null}
      </div>
      <div ref={sentinelRef} className="h-8" />
      {cursor ? null : <p className="pt-6 text-center text-sm text-slate-400">已滑到底部，没有更多新内容。</p>}
    </>
  );
}
