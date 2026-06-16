import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { getAnnouncement, updateAnnouncement } from '@/lib/posts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const announcement = await getAnnouncement();
  return NextResponse.json(announcement);
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { content } = body as { content: string };
  if (typeof content !== 'string') return NextResponse.json({ error: 'Content required' }, { status: 400 });
  const announcement = await updateAnnouncement(content);
  return NextResponse.json(announcement);
}