# Auth.js 重写设计文档

> 日期: 2026-06-27
> 状态: 设计待审
> 范围: 用 Auth.js v5 全面替换现有自研鉴权层

## 1. 决策摘要

| 决策点 | 选定方案 |
|---|---|
| Auth.js 版本 | v5 (next-auth@beta) |
| 数据库适配器 | 自定义 adapter，复用 `lib/db.ts` 的 `sql` helper |
| 表结构 | 完全重建：按 Auth.js 官方推荐建表，旧表删除 |
| 既有用户 | 编写迁移脚本，保留可保留字段 |
| 邮件服务 | Resend |
| 密码哈希 | 复用现有 `lib/passwords.ts` (scrypt-sha256) |
| 会话策略 | JWT + Database Session 混合，默认 database session |

## 2. 架构总览

```
┌─────────────────────────────────────────────────────┐
│ Next.js App Router (existing)                       │
│   /login /register /profile /forgot-password ...   │
└──────────────┬──────────────────────────────────────┘
               │
        ┌──────▼──────┐
        │ Auth.js v5  │ ← auth.ts 配置中心
        │ Credentials │ ← 邮箱+密码 provider
        │ Email       │ ← 密码重置链接
        └──────┬──────┘
               │
       ┌───────▼────────┐
       │ Custom Adapter │ ← lib/auth/adapter.ts
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │ lib/db.ts (sql)│ ← Neon serverless Postgres
       └────────────────┘
```

## 3. 文件结构规划

```
lib/
├── auth/
│   ├── config.ts        # Auth.js 配置（providers, callbacks, session strategy）
│   ├── adapter.ts       # 自定义 Adapter 实现
│   ├── password-provider.ts  # Credentials provider（邮箱+密码）
│   ├── resend.ts        # Resend 邮件客户端封装
│   └── index.ts         # 导出 auth, signIn, signOut, handlers
├── passwords.ts         # 复用，不改动
├── db.ts                # 复用，不改动
└── users.ts             # 改为薄封装，调用 adapter / Auth.js session

app/
├── api/auth/
│   └── [...nextauth]/route.ts   # Auth.js route handler
├── api/auth/
│   ├── forgot-password/route.ts # 发起重置邮件
│   └── reset-password/route.ts  # 提交新密码
├── (auth)/              # 路由组
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   ├── reset-password/page.tsx
│   └── verify-email/page.tsx
└── profile/page.tsx     # 个人资料

middleware.ts             # 替换为 Auth.js middleware
supabase/schema.sql       # 新表结构
scripts/migrate-to-authjs.mjs  # 数据迁移
scripts/smoke-test.mjs    # 扩展端到端测试
```

## 4. 数据库 Schema (新)

按 Auth.js 官方 schema 简化适配 Neon 的 text id（用 `gen_random_uuid()` 亦可，这里保留 text id 以兼容迁移）：

```sql
-- users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  email_verified TIMESTAMPTZ,
  image TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT NOT NULL DEFAULT '',
  password_algo TEXT NOT NULL DEFAULT 'scrypt-sha256',
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- accounts (OAuth 用，预留)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  UNIQUE(provider, provider_account_id)
);

-- sessions
CREATE TABLE sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

-- verification_tokens
CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);
```

## 5. 关键实现要点

### 5.1 Credentials Provider

`authorize(credentials)` 流程：
1. 用 `getUserByEmail` 查询用户
2. 用 `verifyPassword` 校验密码（复用 `lib/passwords.ts`）
3. 校验 `status === 'active'`
4. 返回 `{ id, email, name: display_name, image: avatar_url, role }`

### 5.2 Custom Adapter

实现 `next-auth/adapters` 的 `Adapter` 接口，覆盖 12 个方法：
`createUser/getUser/getUserByEmail/getUserByAccount/updateUser/deleteUser/
linkAccount/unlinkAccount/createSession/getSessionAndUser/updateSession/deleteSession/
createVerificationToken/useVerificationToken/deleteUser`

字段映射：
- Auth.js `name` ↔ 业务 `display_name`
- Auth.js `image` ↔ 业务 `avatar_url`
- Auth.js `emailVerified` ↔ 业务 `email_verified_at`
- 额外字段 `username/bio/role/status/password_hash/password_algo/last_login_at/last_login_ip` 透传

### 5.3 邮件（Resend）

新增 `lib/auth/resend.ts`：
- 安装 `resend` 包
- 通过 `RESEND_API_KEY` 环境变量初始化
- `sendVerificationEmail({ to, url })`、`sendPasswordResetEmail({ to, url })`
- 在 dev 环境（无 API key）兜底为 `console.log`

### 5.4 密码重置流程

由于 Auth.js v5 不内置 reset password，自行实现：
1. `POST /api/auth/forgot-password` → 校验邮箱存在 → 生成 `verification_tokens` 记录 → Resend 发送链接
2. 用户点击链接到达 `/reset-password?token=xxx`
3. `POST /api/auth/reset-password` → 用 `useVerificationToken` 消费 → `updateUser` 写入新 hash

### 5.5 中间件

替换 `middleware.ts` 为 Auth.js 推荐写法：
```ts
export { auth as middleware } from "@/lib/auth"
export const config = { matcher: ['/profile', '/profile/:path*'] }
```
`authorized` callback 中处理重定向到 `/login?next=...`。

### 5.6 旧文件处理

- 删除：`lib/session.ts`、`lib/session-edge.ts`、`lib/sessions.ts`、`lib/demo-auth.ts`、`lib/verification.ts`（如不再用）
- 重写：`lib/auth.ts`（保留 `getCurrentUser`、`requireUser`，改为从 Auth.js session 读）
- 重写：`lib/users.ts`（保留 `getUserById` 等读取函数，写入改由 adapter 处理）
- 改造现有 API 路由：`/api/auth/login`、`/api/auth/register`、`/api/auth/logout` 全部由 Auth.js 接管

## 6. 实施阶段

| 阶段 | 内容 | 验证点 |
|---|---|---|
| P1 | 安装依赖、写新 schema、迁移脚本 | DB 表创建成功 |
| P2 | Adapter + Credentials Provider + auth config | `npm run typecheck` 通过 |
| P3 | 替换 middleware + 重写 API 路由 | 已登录可访问 /profile |
| P4 | 重写注册/登录/忘记密码/重置密码页面 | 浏览器手动跑通 |
| P5 | 个人资料页 + 修改密码 | 资料更新成功 |
| P6 | Resend 邮件集成 + 邮箱验证流程 | 收到邮件并点击完成验证 |
| P7 | 扩展 smoke-test 覆盖完整流程 | `npm test` 全绿 |

## 7. 测试矩阵

| 场景 | 自动化 | 手动 |
|---|---|---|
| 新用户注册 | ✅ smoke-test | 浏览器跑一次 |
| 已有用户登录 | ✅ smoke-test | - |
| 错误密码登录 | ✅ smoke-test | - |
| 会话保持 | ✅ smoke-test（两次请求复用 cookie） | - |
| 会话过期 | 手动（改 DB） | - |
| 忘记密码 → 收邮件 → 重置 | 手动 | ✅ |
| 修改密码 | ✅ smoke-test | - |
| 路由保护（未登录访问 /profile） | ✅ smoke-test | - |
| 跨浏览器 | - | Chrome + Firefox + Safari |

## 8. 风险与回滚

- **风险 1**：Auth.js v5 仍处 beta，API 可能变动 → 锁定具体版本 `next-auth@5.0.0-beta.x`
- **风险 2**：迁移脚本可能丢字段 → 迁移前先备份，迁移脚本 dry-run 模式
- **风险 3**：现有用户密码 hash 格式可能与 Auth.js Credentials provider 预期不符 → 复用 `lib/passwords.ts` 的 `verifyPassword`，无需迁移密码
- **回滚**：保留 git tag `pre-authjs-rewrite`，若出问题可回退

## 9. 环境变量变更

新增：
```
AUTH_SECRET=<32+ 字符随机串>      # Auth.js 必需
RESEND_API_KEY=<re_xxx>          # Resend 邮件
EMAIL_FROM="校园墙 <noreply@xxx>" # 发件人
```

废弃：
```
SESSION_SECRET  # 由 AUTH_SECRET 取代
SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_PORT / SMTP_FROM
```

## 10. 后续待审问题

实施前需要确认：
1. 是否同意完全删除旧表 `sessions`、`verification_codes`、`password_resets`（含数据）？
2. 既有用户的 `password_hash` 字段是否保留原样不动？✅ 是
3. OAuth provider 暂时不接入（只支持邮箱密码）？默认是
