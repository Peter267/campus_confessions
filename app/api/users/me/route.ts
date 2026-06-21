// PATCH /api/users/me
// 修改个人资料：昵称、简介、头像。
import { NextRequest, NextResponse } from 'next/server';
import { isRequireUserResponse, requireUser } from '@/lib/auth';
import { updateProfileSchema } from '@/lib/auth-validators';
import { getUserByDisplayName, updateUser } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.displayName && parsed.data.displayName !== auth.user.display_name) {
    const conflict = await getUserByDisplayName(parsed.data.displayName);
    if (conflict && conflict.id !== auth.user.id) {
      return NextResponse.json({ error: '昵称已被占用' }, { status: 409 });
    }
  }

  const updated = await updateUser(auth.user.id, {
    displayName: parsed.data.displayName,
    bio: parsed.data.bio,
    avatarUrl: parsed.data.avatarUrl
  });
  if (!updated) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, password_algo, ...publicView } = updated;
  return NextResponse.json({ user: publicView });
}

export async function GET() {
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;
  return NextResponse.json({ user: auth.user });
}
