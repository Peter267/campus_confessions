import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, getAdminTokenFromRequest } from '@/lib/auth';
import { setPostStatus, deletePost, createAuditLog } from '@/lib/posts';
import { createHash } from 'crypto';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const action = body.action as 'approve' | 'reject' | undefined;
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const updated = await setPostStatus(id, action === 'approve' ? 'published' : 'rejected', action === 'reject' ? '管理员驳回' : null);
  if (!updated) return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const reason = (body.reason as string) ?? '管理员删除';
  const tokenHash = createHash('sha256').update(getAdminTokenFromRequest(request)).digest('hex').slice(0, 16);
  await createAuditLog('delete_post', id, tokenHash, reason);
  await deletePost(id);
  return NextResponse.json({ success: true });
}