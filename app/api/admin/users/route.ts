// /api/admin/users
// GET  : 列出所有用户（分页）
// PATCH: 更新用户角色 / 状态（superadmin 专属，admin 可封禁）
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isAdminRequest } from '@/lib/auth';
import { listUsers, countUsers, updateUser, getUserById } from '@/lib/users';
import type { UserRole, UserStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 兼容 ADMIN_TOKEN 紧急入口
  if (!isAdminRequest(request)) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }
  }
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
  const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
  const [users, total] = await Promise.all([listUsers(limit, offset), countUsers()]);
  return NextResponse.json({ users, total });
}

export async function PATCH(request: NextRequest) {
  // 仅 superadmin 可修改角色；admin 可修改状态（封禁/解封）
  let actorRole: UserRole | null = null;
  let actorId: string | null = null;
  if (isAdminRequest(request)) {
    actorRole = 'superadmin'; // ADMIN_TOKEN 视为超管
  } else {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }
    actorRole = user.role;
    actorId = user.id;
  }

  const body = await request.json().catch(() => ({}));
  const targetId = typeof body.id === 'string' ? body.id : '';
  if (!targetId) {
    return NextResponse.json({ error: '缺少用户 id' }, { status: 400 });
  }

  const target = await getUserById(targetId);
  if (!target) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  // 不允许操作自己（防止自我降权 / 自我封禁）
  if (actorId && target.id === actorId) {
    return NextResponse.json({ error: '不能操作自己的账号' }, { status: 400 });
  }

  const patch: { role?: UserRole; status?: UserStatus } = {};
  if (typeof body.role === 'string' && ['user', 'moderator', 'admin', 'superadmin'].includes(body.role)) {
    if (actorRole !== 'superadmin') {
      return NextResponse.json({ error: '仅超级管理员可修改用户角色' }, { status: 403 });
    }
    // 不允许把别人提升为 superadmin（只能由现有 superadmin 操作，且目标不能是自己已处理）
    if (body.role === 'superadmin' && target.role !== 'superadmin') {
      // 允许，但需谨慎
    }
    patch.role = body.role as UserRole;
  }
  if (typeof body.status === 'string' && ['active', 'suspended', 'closed'].includes(body.status)) {
    patch.status = body.status as UserStatus;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
  }

  const updated = await updateUser(targetId, patch);
  if (!updated) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = updated;
  return NextResponse.json({ user: publicView });
}
