"use client";

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { CategoryRecord } from '@/lib/types';

export function CategoryNav({ categories }: { categories: CategoryRecord[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('category') ?? '';

  function buildUrl(slug: string) {
    if (!slug) return '/';
    return `/?category=${slug}`;
  }

  return (
    <nav className="overflow-x-auto border-b border-white/6 bg-[#0b1527]/50 px-4 py-2 backdrop-blur-sm sm:px-6">
      <div className="flex gap-1">
        <Link
          href="/"
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${!currentCategory ? 'bg-white/12 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/6'}`}
        >
          全部
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={buildUrl(cat.slug)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${currentCategory === cat.slug ? 'bg-white/12 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/6'}`}
          >
            {cat.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}