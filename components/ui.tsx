import type { ReactNode } from 'react';

export function GlassPanel({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[28px] border border-white/18 bg-white/8 backdrop-blur-xl shadow-glow ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/80">{eyebrow}</p>
      <h2 className="font-display text-2xl text-white sm:text-3xl">{title}</h2>
      {description ? <p className="max-w-2xl text-sm leading-6 text-slate-300">{description}</p> : null}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'accent' | 'success' }) {
  const tones = {
    neutral: 'bg-white/10 text-slate-100 border-white/15',
    warning: 'bg-amber-400/12 text-amber-100 border-amber-300/20',
    accent: 'bg-cyan-400/12 text-cyan-100 border-cyan-300/20',
    success: 'bg-emerald-400/12 text-emerald-100 border-emerald-300/20'
  };

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${tones[tone]}`}>{children}</span>;
}

export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
      <div className="mb-4 h-56 rounded-3xl bg-white/10 animate-pulse" />
      <div className="mb-3 flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-white/10 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded-full bg-white/10 animate-pulse" />
          <div className="h-3 w-16 rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded-full bg-white/10 animate-pulse" />
        <div className="h-3 w-4/5 rounded-full bg-white/10 animate-pulse" />
      </div>
    </div>
  );
}
