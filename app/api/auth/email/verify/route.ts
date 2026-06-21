// POST /api/auth/email/verify
// 邮箱验证：消费邮件中的 magic link token。
import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailSchema } from '@/lib/auth-validators';
import { unpackMagicToken } from '@/lib/mail';
import { getUserByEmail, updateUser } from '@/lib/users';
import { requireUser, isRequireUserResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  // 已登录场景：必须登录用户才能验证自己的邮箱
  const auth = await requireUser();
  if (isRequireUserResponse(auth)) return auth;

  const unpacked = unpackMagicToken(parsed.data.token);
  if (!unpacked || unpacked.purpose !== 'email_verify') {
    return NextResponse.json({ error: '验证链接已失效' }, { status: 400 });
  }

  const target = await getUserByEmail(unpacked.identifier);
  if (!target || target.id !== auth.user.id) {
    return NextResponse.json({ error: '验证链接与当前账号不匹配' }, { status: 400 });
  }

  if (!target.email_verified_at) {
    await updateUser(target.id, { emailVerifiedAt: new Date().toISOString() });
  }

  const { password_hash, password_algo, ...publicView } = target;
  publicView.email_verified_at = new Date().toISOString();
  return NextResponse.json({ user: publicView });
}

// GET /api/auth/email/verify?token=...
// 提供给邮件链接的浏览器侧 GET 形式：自动跳转 /verify-email?token=...
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const dest = new URL('/verify-email', request.nextUrl);
  if (token) dest.searchParams.set('token', token);
  return Response.redirect(dest, 302);
}
