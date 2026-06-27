// Auth.js v5 中间件（Edge-safe）
// ---------------------------------------------------------------------------
// 必须使用独立的 edge-safe NextAuth 实例，不能从 '@/lib/auth' 导入 auth。
// 因为 lib/auth/index.ts 注入了 adapter（node:crypto）和 credentialsProvider，
// 这些在 Edge Runtime 中不可用。
//
// 这里直接导入不含 node:crypto 依赖的 authConfig，创建仅用于 middleware 的实例。
// authorized callback（见 lib/auth/config.ts）实现：
//   1. 未登录访问 /profile → 重定向到 /login?callbackUrl=/profile
//   2. 已登录访问 /login /register /forgot-password 等 → 跳回首页
//
// matcher 排除 /api、静态资源、_next 等，避免影响其它接口
// ---------------------------------------------------------------------------

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // 排除 api、_next、静态资源
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
    // 但要保护 /profile
    '/profile/:path*'
  ]
};
