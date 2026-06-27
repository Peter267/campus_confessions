// POST /api/auth/password
// 已登录用户修改密码。需要提供旧密码。
// 修改成功后吊销所有其它设备的 session，保留当前 session。
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isRequireUserResponse, requireUser } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/auth-validators';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/passwords';
import { getCurrentUserWithSecrets } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (isRequireUserResponse(authResult)) return authResult;

    const body = await request.json().catch(() => ({}));
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
    }

    const passwordCheck = validatePasswordStrength(parsed.data.newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.reason }, { status: 400 });
    }

    const fullUser = await getCurrentUserWithSecrets();
    if (!fullUser) {
      return NextResponse.json({ error: '账号不存在' }, { status: 401 });
    }

    const ok = await verifyPassword(parsed.data.oldPassword, fullUser.password_hash);
    if (!ok) {
      return NextResponse.json({ error: '当前密码不正确' }, { status: 401 });
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    if (!sql) {
      return NextResponse.json({ error: '数据库未配置' }, { status: 500 });
    }
    await sql`
      update users set password_hash = ${newHash}, updated_at = now()
      where id = ${authResult.user.id}::uuid
    `;

    // 读取当前 session 的 token，保留它；其它全部吊销
    const cookieStore = await cookies();
    const currentToken = cookieStore.get('next-auth.session-token')?.value
      ?? cookieStore.get('__Secure-next-auth.session-token')?.value
      ?? null;

    if (currentToken) {
      await sql`
        delete from sessions
        where user_id = ${authResult.user.id}::uuid
          and session_token != ${currentToken}
      `;
    } else {
      // 拿不到当前 token，全部吊销强制重新登录
      await sql`delete from sessions where user_id = ${authResult.user.id}::uuid`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('change-password error', err);
    return NextResponse.json(
      { error: '服务异常', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
