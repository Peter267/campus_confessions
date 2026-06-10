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

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          void loadMore();
        }
      },
      { rootMargin: '480px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, loading]);

  async function loadMore() {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/posts?limit=12&cursor=${cursor}`);
    const data = (await response.json()) as FeedPage;
    setItems((current) => [...current, ...data.items]);
    setCursor(data.nextCursor);
    setLoading(false);
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
