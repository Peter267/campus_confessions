import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { adminSearchPosts } from '@/lib/posts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ items: [] });
  const items = await adminSearchPosts(q);
  return NextResponse.json({ items });
}