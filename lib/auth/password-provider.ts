// Auth.js v5 Credentials Provider（邮箱+密码）
// ---------------------------------------------------------------------------
// 流程：
//   1. 从 credentials 取 identifier（邮箱或用户名）+ password
//   2. 判断 identifier 是否含 @：邮箱查 / 用户名查
//   3. 调 lib/passwords.ts verifyPassword 校验密码
//   4. 校验 status === 'active'
//   5. 返回 AdapterUser（含 id / email / name / image + 扩展字段）
//
// 注意：Auth.js Credentials provider 默认不发送 email verify 邮件，
//      我们在 /api/auth/register 路由里手动触发。
// ---------------------------------------------------------------------------

import Credentials from 'next-auth/providers/credentials';
import { sql } from '@/lib/db';
import { verifyPassword } from '@/lib/passwords';

interface DbUser {
  id: string;
  username: string | null;
  email: string | null;
  email_verified_at: Date | string | null;
  password_hash: string;
  password_algo: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  status: string;
  last_login_at: Date | string | null;
  last_login_ip: string | null;
}

async function findUserByIdentifier(identifier: string): Promise<DbUser | null> {
  if (!sql) return null;
  const isEmail = identifier.includes('@');
  const rows = isEmail
    ? ((await sql`
        select * from users where lower(email) = lower(${identifier}) limit 1
      `) as DbUser[])
    : ((await sql`
        select * from users where lower(username) = lower(${identifier}) limit 1
      `) as DbUser[]);
  return rows[0] ?? null;
}

export const credentialsProvider = Credentials({
  id: 'credentials',
  name: '邮箱密码',
  credentials: {
    identifier: { label: '用户名或邮箱', type: 'text' },
    password: { label: '密码', type: 'password' }
  },
  async authorize(credentials) {
    if (!credentials) return null;
    const identifier = typeof credentials.identifier === 'string' ? credentials.identifier.trim() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';
    if (!identifier || !password) return null;

    const user = await findUserByIdentifier(identifier);
    // 不区分用户不存在与密码错误，避免账号枚举
    if (!user) return null;
    // 用户存在但密码字段为空（如纯 OAuth 用户）→ 不允许密码登录
    if (!user.password_hash) return null;

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return null;

    if (user.status !== 'active') return null;

    return {
      id: String(user.id),
      name: user.display_name || null,
      email: user.email || null,
      image: user.avatar_url || null,
      emailVerified: user.email_verified_at ? new Date(user.email_verified_at as string) : null,
      // 扩展字段
      ...(user.username ? { username: user.username } : {}),
      ...(user.bio !== null ? { bio: user.bio } : {}),
      ...(user.role ? { role: user.role } : {}),
      ...(user.status ? { status: user.status } : {})
    };
  }
});
