# 校园万能墙 / 微社区

一个面向 Vercel Deployment 的全栈 Serverless 校园墙项目，基于 **Next.js 16 App Router + React + Tailwind CSS + Neon PostgreSQL**。支持访客匿名投稿、用户账号体系、内容审核、管理后台、第三方登录、人机验证与邮件通知。

## 特性

- **首页瀑布流**：卡片式帖子网格，支持分类筛选、搜索、点赞与评论。
- **投稿**：支持分类选择、富文本/Markdown 风格内容、图片上传（R2 预签名 URL）、匿名代号；登录用户可选择实名或匿名发布。
- **账号系统**：
  - 用户名密码注册 / 登录
  - 邮箱 + 密码登录、邮箱验证码绑定
  - 邮箱魔法链接一键登录
  - 第三方 OAuth：GitHub、Google、Microsoft、QQ
  - 密码重置、个人信息管理、会话管理
- **权限体系**：四级 RBAC（user / moderator / admin / superadmin）。
- **管理后台**：先审后发、敏感词 / 封禁规则、分类管理、公告编辑、举报处理、站点配置（SMTP / OAuth / 人机验证）、用户管理。
- **安全防护**：
  - scrypt 密码哈希
  - HMAC-SHA256 签名 session cookie（HttpOnly）
  - 数据库敏感配置使用 `pgcrypto` 对称加密
  - 滑窗速率限制
  - 可选 Cloudflare Turnstile / 极验 Geetest v4 人机验证
  - 服务端 XSS 过滤与敏感词拦截
- **邮件通知**：内置最小化 SMTP 客户端，开发模式可打印邮件到控制台；推荐 QQ 邮箱 SMTP。
- **Serverless 友好**：Neon serverless driver、无 bcrypt 依赖、Vercel 一键部署。

## 技术栈

- Next.js 16.2.9（Turbopack，实验性 serverActions）
- React 18 + TypeScript 5（strict 模式）
- Tailwind CSS 3
- Neon PostgreSQL（`@neondatabase/serverless`）
- AWS SDK for S3（兼容 Cloudflare R2）

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL 连接字符串 |
| `NEXT_PUBLIC_SITE_NAME` | 站点名称 |
| `NEXT_PUBLIC_SITE_URL` | 站点根地址，用于生成邮件/回调链接 |
| `ADMIN_TOKEN` | 管理后台紧急入口口令 |
| `MODERATION_KEYWORDS` | 默认敏感词，英文逗号分隔 |
| `DEFAULT_POST_AUTHOR` | 未填写代号时的默认作者名 |
| `SESSION_SECRET` | session cookie 签名密钥（生产至少 16 字符） |
| `VERIFICATION_PEPPER` | 验证码/重置 token 额外盐值 |
| `SCRYPT_MAXMEM` | scrypt 内存上限（字节，可选） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | SMTP 邮件发送 |
| `SITE_SETTINGS_SECRET` | 数据库站点配置加密密钥 |
| `OAUTH_*_CLIENT_ID` / `CLIENT_SECRET` / `REDIRECT_URI` / `SCOPE` | GitHub / Google / Microsoft / QQ OAuth |
| `TURNSTILE_SECRET` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile |
| `GEETEST_CAPTCHA_ID` / `GEETEST_CAPTCHA_KEY` | 极验 Geetest v4 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE` / `R2_MAX_FILE_SIZE` | 图片上传（S3 兼容 R2） |

> 未配置 `DATABASE_URL` 时项目会自动进入 **demo 内存模式**，便于本地 UI 验证；生产环境务必配置真实数据库。

## 快速开始

```bash
npm install
npm run dev
```

访问 http://localhost:3000。

## 数据库

执行 [`supabase/schema.sql`](supabase/schema.sql) 创建表结构，主要表包括：

- `users`、`sessions`：账号与会话
- `verification_codes`、`password_resets`：验证码与密码重置
- `posts`、`comments`、`likes`：内容与互动
- `reports`、`audit_logs`：举报与操作日志
- `categories`、`announcements`：分类与公告
- `moderation_settings`：敏感词 / 封禁规则
- `site_settings`、`site_settings_audit`：加密站点配置与变更审计
- `rate_limit_events`：滑窗速率限制

## 项目结构

```
campus_confessions/
├── app/                          # Next.js App Router
│   ├── admin/page.tsx            # 管理后台入口页面
│   ├── api/
│   │   ├── admin/                # 管理后台 API
│   │   │   ├── announcement/     # 公告编辑
│   │   │   ├── captcha/          # 人机验证配置读写
│   │   │   ├── categories/       # 分类 CRUD
│   │   │   ├── logs/             # 操作日志查询
│   │   │   ├── pending/          # 待审核帖子
│   │   │   ├── posts/[id]/       # 帖子审核/修改/删除
│   │   │   ├── published/        # 已发布帖子列表
│   │   │   ├── reports/          # 举报处理
│   │   │   ├── search/           # 帖子搜索
│   │   │   ├── settings/         # 基础 moderation 配置
│   │   │   ├── site-settings/    # SMTP / OAuth / 加密配置
│   │   │   └── users/            # 用户列表 / 角色状态修改
│   │   ├── auth/                 # 账号认证 API
│   │   │   ├── captcha-config/   # 当前启用人机验证类型与站点 key
│   │   │   ├── email/            # 邮箱验证码发送/校验
│   │   │   ├── login/            # 用户名/邮箱/密码登录
│   │   │   ├── logout/           # 登出
│   │   │   ├── magic-link/       # 邮箱魔法链接发送/校验
│   │   │   ├── me/               # 当前登录用户信息
│   │   │   ├── oauth/[provider]/ # OAuth2 授权发起与回调
│   │   │   ├── oauth-providers/  # 前端渲染已启用 OAuth 按钮
│   │   │   ├── password/         # 修改密码 / 忘记密码 / 重置密码
│   │   │   └── register/         # 用户注册
│   │   ├── posts/                # 帖子 API（列表 / 发布 / 详情 / 评论 / 点赞）
│   │   ├── reports/              # 举报提交
│   │   ├── upload/sign/          # R2 预签名上传 URL
│   │   └── users/me/             # 当前用户资料与会话管理
│   ├── forgot-password/page.tsx  # 忘记密码页
│   ├── login/page.tsx            # 登录页
│   ├── post/[id]/page.tsx        # 帖子详情页
│   ├── profile/page.tsx          # 个人资料页
│   ├── publish/page.tsx          # 投稿页
│   ├── register/page.tsx         # 注册页
│   ├── reset-password/page.tsx   # 重置密码页
│   ├── verify-email/page.tsx     # 邮箱验证页
│   ├── globals.css               # 全局样式
│   ├── layout.tsx                # 根布局
│   └── page.tsx                  # 首页
├── components/                   # React 组件
│   ├── auth/                     # 认证相关组件
│   │   ├── auth-shell.tsx        # 登录/注册页面外壳
│   │   ├── captcha.tsx           # 统一人机验证组件（Turnstile / Geetest）
│   │   ├── forgot-password-form.tsx
│   │   ├── login-form.tsx        # 登录表单（密码 / 魔法链接 / OAuth）
│   │   ├── oauth-buttons.tsx     # OAuth 登录按钮
│   │   ├── profile-form.tsx      # 个人资料编辑
│   │   ├── register-form.tsx     # 注册表单
│   │   ├── reset-password-form.tsx
│   │   ├── turnstile.tsx         # Cloudflare Turnstile 包装
│   │   ├── user-menu.tsx         # 顶部用户下拉菜单
│   │   └── verify-email-form.tsx
│   ├── admin-captcha-settings.tsx
│   ├── admin-dashboard.tsx       # 管理后台总控
│   ├── admin-site-settings.tsx   # SMTP / OAuth 配置面板
│   ├── admin-users-panel.tsx     # 用户管理面板
│   ├── announcement-sidebar.tsx  # 侧边公告栏
│   ├── category-nav.tsx          # 分类导航
│   ├── detail-client.tsx         # 帖子详情客户端交互
│   ├── home-feed.tsx             # 首页帖子流
│   ├── home-section.tsx          # 首页区块
│   ├── post-card.tsx             # 帖子卡片
│   ├── publish-form.tsx          # 投稿表单（含匿名选项）
│   ├── rich-text-editor.tsx      # 富文本编辑器
│   └── ui.tsx                    # 通用 UI 组件
├── lib/                          # 业务逻辑与工具
│   ├── auth-validators.ts        # 账号相关 Zod-like 校验
│   ├── auth.ts                   # session 鉴权、当前用户获取
│   ├── captcha.ts                # 统一人机验证抽象层
│   ├── db.ts                     # Neon SQL 连接与 demo 降级
│   ├── demo-auth.ts              # demo 内存模式用户/会话实现
│   ├── demo-data.ts              # demo 示例数据
│   ├── geetest.ts                # 极验 Geetest v4 服务端校验
│   ├── mail.ts                   # SMTP 发送 / 开发模式 / token 打包
│   ├── moderation.ts             # 敏感词 / IP / 别名 / IP 解析
│   ├── oauth.ts                  # OAuth2 通用流程与 Provider 解析
│   ├── passwords.ts              # scrypt 密码哈希与校验
│   ├── permissions.ts            # RBAC 角色与权限
│   ├── posts.ts                  # 帖子数据访问层
│   ├── r2.ts                     # R2/S3 预签名上传
│   ├── rate-limit.ts             # 滑窗速率限制
│   ├── sanitize.ts               # XSS 过滤与纯文本提取
│   ├── session-edge.ts           # Edge Runtime session 校验
│   ├── session.ts                # session token 签名 / cookie 构建
│   ├── sessions.ts               # session 数据访问层
│   ├── site-settings.ts          # 站点配置读写与缓存
│   ├── turnstile.ts              # Cloudflare Turnstile 校验
│   ├── types.ts                  # TypeScript 类型定义
│   ├── users.ts                  # 用户数据访问层
│   └── validators.ts             # 通用表单校验 schema
├── scripts/
│   └── smoke-test.mjs            # 端到端与单元冒烟测试
├── supabase/
│   └── schema.sql                # 完整数据库 Schema
├── middleware.ts                 # 全局路由守卫（登录态 / 认证页重定向）
├── next.config.mjs               # Next.js 配置
├── package.json                  # 依赖与脚本
├── tailwind.config.ts            # Tailwind 配置
├── tsconfig.json                 # TypeScript 配置
├── eslint.config.mjs             # ESLint 配置
├── postcss.config.mjs            # PostCSS 配置
├── .env.example                  # 环境变量示例
├── .gitignore
└── README.md
```

## 主要文件说明

### 入口与页面

| 文件 | 用途 |
|------|------|
| `app/layout.tsx` | 根布局，注入全局字体与样式。 |
| `app/page.tsx` | 首页，渲染分类导航与帖子流。 |
| `app/publish/page.tsx` | 投稿页面。 |
| `app/post/[id]/page.tsx` | 帖子详情与评论区。 |
| `app/admin/page.tsx` | 管理后台，需 `ADMIN_TOKEN` 或已登录管理员。 |
| `app/login/page.tsx` | 登录页，支持密码与魔法链接。 |
| `app/register/page.tsx` | 注册页。 |
| `app/profile/page.tsx` | 已登录用户个人资料管理。 |
| `app/forgot-password/page.tsx` | 忘记密码，发送重置链接。 |
| `app/reset-password/page.tsx` | 通过 token 重置密码。 |
| `app/verify-email/page.tsx` | 邮箱验证回调页。 |

### API 路由

| 文件 | 用途 |
|------|------|
| `app/api/posts/route.ts` | 帖子列表（GET）与发布（POST），含敏感词拦截、昵称唯一性校验、登录用户关联。 |
| `app/api/posts/[id]/route.ts` | 帖子详情 / 更新 / 删除。 |
| `app/api/posts/[id]/comments/route.ts` | 评论列表与提交。 |
| `app/api/posts/[id]/like/route.ts` | 点赞。 |
| `app/api/auth/register/route.ts` | 用户注册，含人机验证。 |
| `app/api/auth/login/route.ts` | 用户名/邮箱 + 密码登录。 |
| `app/api/auth/logout/route.ts` | 登出并清除 session。 |
| `app/api/auth/me/route.ts` | 当前登录用户信息。 |
| `app/api/auth/magic-link/*/route.ts` | 邮箱魔法链接发送与校验。 |
| `app/api/auth/email/*/route.ts` | 邮箱验证码发送与绑定。 |
| `app/api/auth/password/*/route.ts` | 修改密码、忘记密码、重置密码。 |
| `app/api/auth/oauth/[provider]/route.ts` | 第三方登录授权跳转。 |
| `app/api/auth/oauth/[provider]/callback/route.ts` | OAuth2 回调处理。 |
| `app/api/auth/oauth-providers/route.ts` | 返回已启用的 OAuth Provider 列表。 |
| `app/api/auth/captcha-config/route.ts` | 返回当前人机验证配置。 |
| `app/api/admin/users/route.ts` | 用户分页列表 / 修改角色与状态。 |
| `app/api/admin/captcha/route.ts` | 人机验证配置读写。 |
| `app/api/admin/site-settings/route.ts` | SMTP / OAuth 等加密站点配置读写。 |
| `app/api/admin/site-settings/test/route.ts` | 配置连通性测试（如 SMTP）。 |
| `app/api/admin/settings/route.ts` | moderation 基础配置。 |
| `app/api/admin/posts/[id]/route.ts` | 审核 / 编辑 / 删除帖子。 |
| `app/api/admin/pending/route.ts` | 待审核列表。 |
| `app/api/admin/published/route.ts` | 已发布列表。 |
| `app/api/admin/reports/route.ts` | 举报列表与关闭。 |
| `app/api/admin/categories/route.ts` | 分类 CRUD。 |
| `app/api/admin/announcement/route.ts` | 公告编辑。 |
| `app/api/admin/logs/route.ts` | 操作日志。 |
| `app/api/admin/search/route.ts` | 管理员搜索帖子。 |
| `app/api/upload/sign/route.ts` | 签发 R2 预签名上传 URL。 |
| `app/api/users/me/route.ts` | 当前用户资料更新。 |
| `app/api/users/me/sessions/route.ts` | 当前用户会话列表。 |

### 业务库

| 文件 | 用途 |
|------|------|
| `lib/auth.ts` | session 鉴权、`getCurrentUser`、`requireUser`、`isAdminRequest`。 |
| `lib/session.ts` | HMAC-SHA256 session token 签名与 cookie 构建。 |
| `lib/session-edge.ts` | Edge Runtime 下的 session 校验（middleware 使用）。 |
| `lib/sessions.ts` | session 数据库/demo 读写。 |
| `lib/users.ts` | 用户 CRUD、`listUsers`、`countUsers`。 |
| `lib/passwords.ts` | scrypt 哈希与密码校验。 |
| `lib/permissions.ts` | RBAC 角色等级与权限矩阵。 |
| `lib/mail.ts` | SMTP 邮件发送、魔法链接/验证码 token 打包。 |
| `lib/verification.ts` | 验证码生成、哈希存储与校验。 |
| `lib/oauth.ts` | OAuth2 通用 helper、Provider 用户信息解析、自动绑定/注册。 |
| `lib/captcha.ts` | 统一人机验证：配置读取、Turnstile / Geetest 分发。 |
| `lib/turnstile.ts` | Cloudflare Turnstile 服务端校验。 |
| `lib/geetest.ts` | 极验 Geetest v4 服务端校验。 |
| `lib/site-settings.ts` | 站点设置缓存读写，敏感值加密存储。 |
| `lib/posts.ts` | 帖子数据层与搜索/列表/审核。 |
| `lib/moderation.ts` | 敏感词、IP、别名拦截与 IP 解析。 |
| `lib/sanitize.ts` | 富文本 XSS 过滤与纯文本提取。 |
| `lib/rate-limit.ts` | 滑窗速率限制。 |
| `lib/r2.ts` | R2/S3 预签名上传。 |
| `lib/db.ts` | Neon 连接封装与无数据库时的 demo 降级。 |
| `lib/demo-auth.ts` / `lib/demo-data.ts` | 内存模式账号、会话、示例数据。 |
| `lib/types.ts` | 全项目 TypeScript 类型。 |
| `lib/validators.ts` | 通用表单 schema。 |
| `lib/auth-validators.ts` | 账号表单 schema。 |

### 组件

| 文件 | 用途 |
|------|------|
| `components/admin-dashboard.tsx` | 管理后台标签页总控。 |
| `components/admin-users-panel.tsx` | 用户管理表格。 |
| `components/admin-site-settings.tsx` | SMTP / OAuth 配置 UI。 |
| `components/admin-captcha-settings.tsx` | 人机验证配置 UI。 |
| `components/publish-form.tsx` | 投稿表单，登录用户可切换匿名。 |
| `components/auth/login-form.tsx` | 登录表单（密码 / 魔法链接 / OAuth）。 |
| `components/auth/register-form.tsx` | 注册表单。 |
| `components/auth/captcha.tsx` | 根据后端配置渲染 Turnstile 或 Geetest。 |
| `components/auth/oauth-buttons.tsx` | 第三方登录按钮。 |
| `components/auth/profile-form.tsx` | 个人资料编辑。 |
| `components/auth/user-menu.tsx` | 顶部用户菜单。 |
| `components/home-feed.tsx` / `home-section.tsx` / `post-card.tsx` | 首页帖子流与卡片。 |
| `components/detail-client.tsx` | 帖子详情互动。 |
| `components/rich-text-editor.tsx` | 富文本编辑器。 |

### 其他

| 文件 | 用途 |
|------|------|
| `middleware.ts` | 登录页/认证页/资料页路由守卫。 |
| `scripts/smoke-test.mjs` | 108 项端到端与单元冒烟测试。 |
| `supabase/schema.sql` | 完整 PostgreSQL schema。 |

## 开发脚本

```bash
npm run dev        # 开发服务器（Turbopack）
npm run build      # 生产构建
npm run lint       # ESLint 检查
npm run typecheck  # TypeScript 类型检查
npm test           # 运行 smoke tests
```

## 部署

1. 将代码推送到 GitHub。
2. 在 Vercel 导入项目。
3. 配置上述环境变量。
4. 在 Neon 创建数据库并执行 `supabase/schema.sql`。
5. 运行 Build，Vercel 会自动生成静态/动态页面并部署。

## 注意事项

- 生产环境必须设置 `SESSION_SECRET`、`ADMIN_TOKEN`、`DATABASE_URL`。
- 图片上传默认使用 Cloudflare R2；如需其他存储，可替换 `lib/r2.ts` 与 `app/api/upload/sign/route.ts`。
- 人机验证在开发环境未配置密钥时会自动放行，方便本地调试；生产务必配置并启用。
- OAuth Client Secret、SMTP 密码等建议在「管理后台 → 站点配置」中维护，会加密写入数据库；环境变量仅作为兜底。
