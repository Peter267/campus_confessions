"use client";

import { useMemo } from 'react';
import type { AnnouncementRecord } from '@/lib/types';

function renderMarkdown(text: string) {
  // Simple inline markdown renderer
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^### (.+)/.test(line)) {
      elements.push(<h3 key={i} className="font-display text-base font-semibold text-white mb-2">{line.replace(/^### /, '')}</h3>);
    } else if (/^## (.+)/.test(line)) {
      elements.push(<h2 key={i} className="font-display text-lg font-semibold text-white mb-2">{line.replace(/^## /, '')}</h2>);
    } else if (/^- (.+)/.test(line)) {
      elements.push(<li key={i} className="text-xs text-slate-300 ml-3 list-disc">{line.replace(/^- /, '')}</li>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-xs leading-5 text-slate-300">{line}</p>);
    }
    i++;
  }
  return elements;
}

export function AnnouncementSidebar({ announcement }: { announcement: AnnouncementRecord }) {
  const content = useMemo(() => renderMarkdown(announcement.content), [announcement.content]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-4 backdrop-blur-sm">
      <h3 className="mb-3 font-display text-sm font-semibold text-amber-100/80">公告</h3>
      <div className="space-y-1">
        {content}
      </div>
    </div>
  );
}