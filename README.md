# 校园万能墙 / 微社区

一个面向 Vercel Deployment 的全栈 Serverless 校园墙项目骨架，基于 Next.js App Router + Tailwind CSS + Neon PostgreSQL。

## 特性

- 首页瀑布流卡片网格
- 动态详情页与盖楼互动
- 投稿页支持分类、匿名代号、图片预览
- 管理后台支持先审后发、敏感词与封禁规则
- API 层统一做服务端敏感词拦截

## 环境变量

复制 [.env.example](.env.example) 并配置：

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_TOKEN`
- `MODERATION_KEYWORDS`

## 数据库

执行 [supabase/schema.sql](supabase/schema.sql) 创建表结构。

## 开发

安装依赖后运行：

```bash
npm install
npm run dev
```

## 部署

直接部署到 Vercel，确保环境变量和数据库连接可用即可。

## 说明

当前图片上传使用 data URL 作为演示方案，适合验证 UI 和流程。生产环境建议替换为 Supabase Storage、Vercel Blob 或其他对象存储。