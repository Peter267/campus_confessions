import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { listPendingPosts } from '@/lib/posts';

// 显式声明：每次请求都执行，绝不允许缓存。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const items = await listPendingPosts();
  return NextResponse.json({ items });
}
