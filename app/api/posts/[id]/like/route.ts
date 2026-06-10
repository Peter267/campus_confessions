import { NextRequest, NextResponse } from 'next/server';
import { incrementLike } from '@/lib/posts';

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }   // ✅ 改为 Promise
) {
  const { id } = await params;   // ✅ 必须 await 再解构
  const post = await incrementLike(id);   // 使用 id 代替 params.id

  if (!post) {
    return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  }

  return NextResponse.json(post);
}