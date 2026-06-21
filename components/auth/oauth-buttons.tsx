"use client";

import { OAUTH_PROVIDER_LABELS, OAUTH_PROVIDER_KEYS } from '@/lib/validators';

// 第三方登录按钮组
// 点击后跳转到 /api/auth/oauth/[provider]?next=...
// 后端会读取站点配置决定是否启用；未启用的提供方不会显示按钮
// （通过 /api/auth/me 或专门的接口获取已启用的 provider 列表）
export function OauthButtons({ next, enabledProviders }: { next: string; enabledProviders: string[] }) {
  const active = OAUTH_PROVIDER_KEYS.filter((p) => enabledProviders.includes(p));
  if (active.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-white/10" />
        或使用第三方账号
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {active.map((p) => (
          <a
            key={p}
            href={`/api/auth/oauth/${p}?next=${encodeURIComponent(next)}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-white/12"
          >
            <ProviderIcon provider={p} />
            {OAUTH_PROVIDER_LABELS[p]}
          </a>
        ))}
      </div>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  // 简单的 SVG 图标，避免引入图标库
  const common = 'h-4 w-4';
  switch (provider) {
    case 'github':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
          <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
        </svg>
      );
    case 'google':
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 11.9S6.9 21.3 12 21.3c5.4 0 9-3.8 9-9.1 0-.6-.1-1.1-.2-1.6H12Z" />
        </svg>
      );
    case 'microsoft':
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden>
          <path fill="#F25022" d="M3 3h8v8H3z" />
          <path fill="#7FBA00" d="M13 3h8v8h-8z" />
          <path fill="#00A4EF" d="M3 13h8v8H3z" />
          <path fill="#FFB900" d="M13 13h8v8h-8z" />
        </svg>
      );
    case 'qq':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="#12B7F5" aria-hidden>
          <path d="M12 2c-3.3 0-6 2.7-6 6 0 1.2.2 2.1.6 3-.6.8-1.6 2.6-1.9 4.2-.3 1.7.4 2.3.9 2.3.4 0 1.2-.5 1.8-1.3-.3 1-.4 2.2.3 2.6.5.3 1.4 0 2.1-.6.1.5.5 1 1.2 1 .8 0 1.4-.7 1.6-1.4.2.7.8 1.4 1.6 1.4.7 0 1.1-.5 1.2-1 .7.6 1.6.9 2.1.6.7-.4.6-1.6.3-2.6.6.8 1.4 1.3 1.8 1.3.5 0 1.2-.6.9-2.3-.3-1.6-1.3-3.4-1.9-4.2.4-.9.6-1.8.6-3 0-3.3-2.7-6-6-6Z" />
        </svg>
      );
    default:
      return null;
  }
}
