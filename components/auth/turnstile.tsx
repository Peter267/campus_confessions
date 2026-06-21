"use client";

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; 'expired-callback'?: () => void; theme?: 'light' | 'dark' | 'auto' }) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

interface TurnstileProps {
  siteKey?: string;
  onChange: (token: string | null) => void;
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile script load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile script load failed'));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

export function Turnstile({ siteKey, onChange }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        setLoaded(true);
      })
      .catch((err) => setError((err as Error).message));
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch {
          // ignore
        }
        widgetRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (!loaded || !siteKey || !containerRef.current || widgetRef.current) return;
    if (!window.turnstile) return;
    const id = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => {
        onChange(token);
      },
      'error-callback': () => {
        onChange(null);
        setError('验证加载失败，请刷新页面');
      },
      'expired-callback': () => {
        onChange(null);
      },
      theme: 'dark'
    });
    widgetRef.current = id;
  }, [loaded, siteKey, onChange]);

  if (!siteKey) {
    return (
      <p className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
        当前为开发模式，未配置 Turnstile site key。提交时服务端将跳过人机验证。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="cf-turnstile" />
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
