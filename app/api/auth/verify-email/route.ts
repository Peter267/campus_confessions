// POST /api/auth/verify-email
// 使用邮件里的 token 验证邮箱。
// 成功后更新 users.email_verified_at。
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyEmailSchema } from '@/lib/auth-validators';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '表单校验失败', details: parsed.error.flatten() }, { status: 400 });
    }

    if (!sql) {
      return NextResponse.json({ error: '数据库未配置' }, { status: 500 });
    }

    // 消费 verification_token
    const tokenRows = (await sql`
      delete from verification_tokens
      where token = ${parsed.data.token}
      returning identifier, expires
    `) as { identifier: string; expires: Date | string }[];

    const tokenRow = tokenRows[0];
    if (!tokenRow) {
      return NextResponse.json({ error: '链接已失效，请重新申请' }, { status: 400 });
    }

    const expiresDate = new Date(tokenRow.expires);
    if (expiresDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: '链接已过期，请重新申请' }, { status: 400 });
    }

    const email = tokenRow.identifier;
    await sql`
      update users set email_verified_at = now(), updated_at = now()
      where lower(email) = lower(${email})
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('verify-email error', err);
    return NextResponse.json(
      { error: '服务异常', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
