import { ModerationSettingsRecord } from '@/lib/types';

const DEFAULT_KEYWORDS = ['广告', '辱骂', '诈骗', '涉政', '私联', '辱华', '违法'];
const DEFAULT_ALIASES = ['bot', 'admin'];

function splitList(value?: string | null) {
  return (value ?? '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getBaseModerationSettings(settings?: Partial<ModerationSettingsRecord>): ModerationSettingsRecord {
  return {
    blocked_keywords: [...new Set([...(settings?.blocked_keywords ?? []), ...DEFAULT_KEYWORDS, ...splitList(process.env.MODERATION_KEYWORDS)])],
    blocked_aliases: [...new Set([...(settings?.blocked_aliases ?? []), ...DEFAULT_ALIASES])],
    blocked_ips: [...new Set([...(settings?.blocked_ips ?? [])])]
  };
}

export function normalizeText(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

export function findBlockedKeyword(content: string, keywords: string[]) {
  const compact = normalizeText(content);
  return keywords.find((keyword) => keyword && compact.includes(normalizeText(keyword))) ?? null;
}

export function sanitizeAlias(alias: string) {
  return alias.trim().slice(0, 24) || '匿名同学';
}

export function resolveClientIp(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return headers.get('x-real-ip') ?? 'unknown';
}
