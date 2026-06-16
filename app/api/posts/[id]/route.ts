import { NextRequest, NextResponse } from 'next/server';
import { getPostById } from '@/lib/posts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await getPostById(id);

  if (!post) {
    return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  }

  return NextResponse.json(post);
}