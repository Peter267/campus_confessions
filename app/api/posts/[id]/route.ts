import { NextRequest, NextResponse } from 'next/server';
import { getPostById } from '@/lib/posts';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const post = await getPostById(params.id);

  if (!post) {
    return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  }

  return NextResponse.json(post);
}
