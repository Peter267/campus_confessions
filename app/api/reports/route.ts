import { NextRequest, NextResponse } from 'next/server';
import { createReport } from '@/lib/posts';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { postId, reason } = body as { postId: string; reason: string };
  if (!postId || !reason) return NextResponse.json({ error: 'postId and reason required' }, { status: 400 });
  const report = await createReport(postId, reason);
  return NextResponse.json(report, { status: 201 });
}