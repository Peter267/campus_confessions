"use client";

import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-2xl text-white sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-slate-300">{subtitle}</p> : null}
      </div>
      <div className="rounded-[28px] border border-white/12 bg-white/6 p-6 shadow-glow backdrop-blur-xl sm:p-8">
        {children}
      </div>
      {footer ? <div className="text-center text-sm text-slate-300">{footer}</div> : null}
    </main>
  );
}

export function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-200">{label}</span>
      {children}
      {error ? <p className="text-xs text-rose-300">{error}</p> : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[96px] resize-y ${props.className ?? ''}`} />;
}

export function PrimaryButton({
  children,
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? '处理中…' : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">
      {message}
    </div>
  );
}
