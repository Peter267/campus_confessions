import { NextRequest, NextResponse } from 'next/server';
import { incrementLike } from '@/lib/posts';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const post = await incrementLike(params.id);

  if (!post) {
    return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  }

  return NextResponse.json(post);
}
