import { NextRequest, NextResponse } from 'next/server';
import { createPost, getModerationSettings, listPublishedPosts } from '@/lib/posts';
import { findBlockedKeyword, getBaseModerationSettings, resolveClientIp, sanitizeAlias } from '@/lib/moderation';
import { publishSchema } from '@/lib/validators';

// 防止首页瀑布流拉到陈旧数据：新审核通过的帖子必须立刻出现在下一次 GET。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '12');
  const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
  const result = await listPublishedPosts(limit, cursor);

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

  const blocked = findBlockedKeyword(parsed.data.content, moderationSettings.blocked_keywords);
  const status = blocked ? 'rejected' : 'pending';
  const moderationReason = blocked ? `命中敏感词：${blocked}` : null;

  const post = await createPost({
    category: parsed.data.category,
    alias,
    content: parsed.data.content,
    imageUrl: parsed.data.imageUrl ?? null,
    status,
    moderationReason
  });

  if (status === 'rejected') {
    return NextResponse.json({ error: moderationReason, post }, { status: 403 });
  }

  return NextResponse.json({ post, status });
}
