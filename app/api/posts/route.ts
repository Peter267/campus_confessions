import { NextRequest, NextResponse } from 'next/server';
import { createPost, getModerationSettings, listPublishedPosts, searchPosts } from '@/lib/posts';
import { findBlockedKeyword, getBaseModerationSettings, resolveClientIp, sanitizeAlias } from '@/lib/moderation';
import { publishSchema } from '@/lib/validators';
import { sanitizeRichText, plainText } from '@/lib/sanitize';

// 防止首页瀑布流拉到陈旧数据：新审核通过的帖子必须立刻出现在下一次 GET。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  const category = request.nextUrl.searchParams.get('category') ?? '';

  if (q.trim()) {
    const items = await searchPosts(q, 24, category.trim() || null);
    return NextResponse.json({ items, nextCursor: null });
  }

  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '12');
  const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
  const result = await listPublishedPosts(limit, cursor, category.trim() || null);

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = publishSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = resolveClientIp(request.headers);
  const moderationSettings = getBaseModerationSettings(await getModerationSettings());
  const alias = sanitizeAlias(parsed.data.alias);

  if (moderationSettings.blocked_ips.includes(ip)) {
    return NextResponse.json({ error: '当前网络已被封禁' }, { status: 403 });
  }

  if (moderationSettings.blocked_aliases.includes(alias.toLowerCase())) {
    return NextResponse.json({ error: '该代号已被封禁' }, { status: 403 });
  }

  // 敏感词检测使用纯文本（剥离 HTML 后的内容），避免富文本标签干扰命中。
  const safeHtml = sanitizeRichText(parsed.data.contentHtml || parsed.data.content);
  const plain = plainText(safeHtml) || parsed.data.content;
  const blocked = findBlockedKeyword(plain, moderationSettings.blocked_keywords);
  const status = blocked ? 'rejected' : 'pending';
  const moderationReason = blocked ? `命中敏感词：${blocked}` : null;

  const post = await createPost({
    category: parsed.data.category,
    alias,
    content: plain,
    contentHtml: safeHtml,
    imageUrl: parsed.data.imageUrl ?? null,
    status,
    moderationReason,
    ipAddress: ip,
    tags: (parsed.data as { tags?: string[] }).tags ?? [],
  });

  if (status === 'rejected') {
    return NextResponse.json({ error: moderationReason, post }, { status: 403 });
  }

  return NextResponse.json({ post, status });
}
