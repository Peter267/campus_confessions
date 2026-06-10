import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { setPostStatus } from '@/lib/posts';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action as 'approve' | 'reject' | undefined;

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const updated = await setPostStatus(params.id, action === 'approve' ? 'published' : 'rejected', action === 'reject' ? '管理员驳回' : null);

  if (!updated) {
    return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
