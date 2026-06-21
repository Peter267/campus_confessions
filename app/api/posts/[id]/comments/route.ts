import { NextRequest, NextResponse } from 'next/server';
import { addComment, getModerationSettings } from '@/lib/posts';
import { findBlockedKeyword, getBaseModerationSettings, resolveClientIp, sanitizeAlias } from '@/lib/moderation';
import { commentSchema } from '@/lib/validators';
import { sanitizeRichText, plainText } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({ error: 'Use the detail page loader for comments' }, { status: 405 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }   // ✅ 改为 Promise
) {
  const { id } = await params;   // ✅ 必须先 await 再解构

  const body = await request.json();
  const parsed = commentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: '评论校验失败' }, { status: 400 });
  }

  const ip = resolveClientIp(request.headers);
  const moderationSettings = getBaseModerationSettings(await getModerationSettings());
  const authorName = sanitizeAlias(parsed.data.authorName ?? '路过同学');

  if (moderationSettings.blocked_ips.includes(ip)) {
    return NextResponse.json({ error: '当前网络已被封禁' }, { status: 403 });
  }

  if (moderationSettings.blocked_aliases.includes(authorName.toLowerCase())) {
    return NextResponse.json({ error: '该代号已被封禁' }, { status: 403 });
  }

  // 富文本走 sanitize；纯文本走原 content。
  const safeHtml = sanitizeRichText(parsed.data.contentHtml || parsed.data.content);
  const plain = plainText(safeHtml) || parsed.data.content;

  const blocked = findBlockedKeyword(plain, moderationSettings.blocked_keywords);
  if (blocked) {
    return NextResponse.json({ error: `评论包含敏感词：${blocked}` }, { status: 403 });
  }

  const comment = await addComment({
    postId: id,
    authorName,
    content: plain
  });

  return NextResponse.json(comment);
}