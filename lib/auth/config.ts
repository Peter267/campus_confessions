// Auth.js v5 配置中心（Edge-safe）
// ---------------------------------------------------------------------------
// 本文件必须保持 Edge Runtime 兼容：
//   - 不导入 node:crypto 依赖（adapter.ts / password-provider.ts / passwords.ts）
//   - providers 为空数组（实际 providers 在 lib/auth/index.ts 中注入）
//   - authorized callback 使用 cookie 存在性检查作为 fallback
//     （database strategy 在 Edge 中无法查 DB 验证 session）
//
// session.strategy = 'database'：session 主体存 DB，cookie 只放 sessionToken
// 自定义页面路径指向现有 /login /register 等
// trustHost: true 让 Vercel / 本地都能识别 host
// ---------------------------------------------------------------------------

import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  // 自定义页面
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
    verifyRequest: '/verify-email'
  },
  // 会话策略：数据库 session（cookie 只放 sessionToken，便于服务端撤销）
  session: {
    strategy: 'database',
    maxAge: 60 * 60 * 24 * 30, // 30 天
    updateAge: 60 * 60 * 24 // 1 天滚动续期
  },
  // providers 在 lib/auth/index.ts 中注入（避免 Edge 引入 node:crypto）
  providers: [],
  // 让 Auth.js 信任当前 host（Vercel / 本地 dev）
  trustHost: true,
  // 回调
  callbacks: {
    // session.user 注入扩展字段
    async session({ session, user }) {
      if (session.user) {
        // user 来自 database session strategy 的 getSessionAndUser
        if (user) {
          (session.user as { id?: string }).id = user.id;
          (session.user as { name?: string | null }).name = user.name;
          (session.user as { email?: string | null }).email = user.email ?? null;
          (session.user as { image?: string | null }).image = user.image ?? null;
          const ext = user as typeof user & {
            username?: string;
            bio?: string | null;
            role?: string;
            status?: string;
          };
          if (ext.username) (session.user as { username?: string }).username = ext.username;
          if (ext.bio !== undefined) (session.user as { bio?: string | null }).bio = ext.bio ?? null;
          if (ext.role) (session.user as { role?: string }).role = ext.role;
          if (ext.status) (session.user as { status?: string }).status = ext.status;
        }
      }
      return session;
    },
    // 登录允许列表：被停用的账号不允许登录
    async signIn({ user }) {
      const ext = user as typeof user & { status?: string };
      if (ext.status && ext.status !== 'active') return false;
      return true;
    },
    // 重定向：默认到 /，支持 ?next=xxx
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    // 路由保护：middleware 中调用
    // Edge Runtime 下 database strategy 无法查 DB，使用 cookie 存在性作为弱信号 fallback。
    // 真正的 session 校验由 route handler / server component 中的 auth() 完成。
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const sessionCookie =
        request.cookies.get('next-auth.session-token')?.value ??
        request.cookies.get('__Secure-next-auth.session-token')?.value;
      const isLoggedIn = !!auth?.user || !!sessionCookie;

      const PROTECTED_PATHS = ['/profile'];
      const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

      // /profile 系列需要登录
      if (PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        if (!isLoggedIn) {
          return false; // Auth.js 会重定向到 /login
        }
      }
      // 已登录访问 /login 等 → 跳回首页
      if (isLoggedIn && AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        return Response.redirect(new URL('/', request.url));
      }
      return true;
    }
  }
};
