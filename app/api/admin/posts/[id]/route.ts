import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, getAdminTokenFromRequest } from '@/lib/auth';
import { setPostStatus, deletePost, updatePostContent, createAuditLog } from '@/lib/posts';
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

// 管理员编辑帖子内容/分类
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (content.length < 10 || content.length > 1200) {
    return NextResponse.json({ error: '内容长度需在 10 到 1200 个字符之间' }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: '分类不能为空' }, { status: 400 });
  }
  const updated = await updatePostContent(id, { content, category });
  if (!updated) return NextResponse.json({ error: '未找到帖子' }, { status: 404 });
  const tokenHash = createHash('sha256').update(getAdminTokenFromRequest(request)).digest('hex').slice(0, 16);
  await createAuditLog('edit_post', id, tokenHash, `category=${category}`);
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
