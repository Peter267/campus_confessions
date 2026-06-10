import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { setPostStatus } from '@/lib/posts';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;   // 重要：必须 await 才能拿到 id

  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action as 'approve' | 'reject' | undefined;

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const updated = await setPostStatus(
    id,                          // 使用解构后的 id
    action === 'approve' ? 'published' : 'rejected',
    action === 'reject' ? '管理员驳回' : null
  );

  if (!updated) {
    return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  }

  return NextResponse.json(updated);
}