"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { UserRecord } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';

export function UserMenu({ initialUser }: { initialUser: UserRecord | null }) {
  const [user, setUser] = useState<UserRecord | null>(initialUser);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setOpen(false);
    router.refresh();
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm">
          登录
        </Link>
        <Link href="/register" className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white sm:px-4 sm:py-2 sm:text-sm">
          注册
        </Link>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-2 py-1.5 text-xs text-slate-100 transition hover:bg-white/12 sm:px-3 sm:text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-300 to-cyan-300 text-xs font-bold text-slate-950">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt={user.display_name} className="h-full w-full object-cover" />
          ) : (
            user.display_name.slice(0, 1)
          )}
        </span>
        <span className="hidden sm:inline">{user.display_name}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/12 bg-slate-950/95 text-sm text-slate-100 shadow-2xl backdrop-blur-xl"
        >
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-white">{user.display_name}</p>
            <p className="text-xs text-slate-400">{ROLE_LABELS[user.role]} · {user.email ?? '未绑定邮箱'}</p>
          </div>
          <div className="border-t border-white/10">
            <Link href="/profile" onClick={() => setOpen(false)} className="block px-4 py-2 transition hover:bg-white/8">
              个人中心
            </Link>
            {user.email && !user.email_verified_at ? (
              <Link href="/verify-email" onClick={() => setOpen(false)} className="block px-4 py-2 text-amber-200 transition hover:bg-white/8">
                验证邮箱
              </Link>
            ) : null}
            <button
              onClick={() => void logout()}
              className="block w-full px-4 py-2 text-left transition hover:bg-rose-500/15 hover:text-rose-100"
            >
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
