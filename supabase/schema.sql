create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  category text not null,
  author_name text not null default '匿名同学',
  alias text not null default '匿名同学',
  content text not null,
  image_url text,
  moderation_reason text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists posts_status_created_at_idx on posts (status, created_at desc);
create index if not exists posts_category_idx on posts (category);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_name text not null default '匿名路人',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_created_at_idx on comments (post_id, created_at asc);

create table if not exists moderation_settings (
  id integer primary key default 1,
  blocked_keywords text[] not null default '{}',
  blocked_aliases text[] not null default '{}',
  blocked_ips text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into moderation_settings (id)
values (1)
on conflict (id) do nothing;

-- IP address column for posts
alter table posts add column if not exists ip_address text;

-- Rich text content (sanitized HTML) for posts
alter table posts add column if not exists content_html text;

-- Categories table
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references categories(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Default categories
insert into categories (name, slug, sort_order) values ('表白', 'confession', 1) on conflict (slug) do nothing;
insert into categories (name, slug, sort_order) values ('万能墙', 'general', 2) on conflict (slug) do nothing;
insert into categories (name, slug, sort_order) values ('失物招领', 'lost-found', 3) on conflict (slug) do nothing;
insert into categories (name, slug, sort_order) values ('日常吐槽', 'daily-rant', 4) on conflict (slug) do nothing;

-- Post tags
create table if not exists post_tags (
  post_id uuid not null references posts(id) on delete cascade,
  tag text not null,
  primary key (post_id, tag)
);

-- Announcements
create table if not exists announcements (
  id serial primary key,
  content text not null default '',
  updated_at timestamptz not null default now()
);

insert into announcements (id, content) values (1, '### 校园万能墙公告

请勿发布人身攻击、造谣、隐私曝光、违规引战内容；所有投稿均会进入服务端审查链路。

校园墙只保留匿名表达，不展示传统博客评论区痕迹，页面交互与视觉均按现代社交产品设计。') on conflict (id) do nothing;

-- Reports
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Audit logs
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  post_id uuid references posts(id) on delete set null,
  admin_token_hash text not null,
  reason text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Account system
-- =========================================================================

-- Roles: 'user' / 'moderator' / 'admin' / 'superadmin'
-- Status: 'active' / 'suspended' / 'closed'
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username citext unique,
  email citext unique,
  email_verified_at timestamptz,
  password_hash text not null,
  password_algo text not null default 'scrypt-sha256',
  display_name text not null,
  avatar_url text,
  bio text,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin', 'superadmin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  oauth_provider text,
  oauth_subject text,
  last_login_at timestamptz,
  last_login_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_username_format check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  constraint users_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint users_display_name_len check (char_length(display_name) between 2 and 24),
  constraint users_oauth_unique unique (oauth_provider, oauth_subject)
);

create unique index if not exists users_username_lower_idx on users (lower(username));
create unique index if not exists users_email_lower_idx on users (lower(email));
create unique index if not exists users_display_name_idx on users (display_name);
create index if not exists users_role_idx on users (role);

-- 帖子作者昵称与已注册昵称保持一致，可同时承担"匿名代号防抢注"职责
alter table posts add column if not exists user_id uuid references users(id) on delete set null;
alter table posts add column if not exists is_anonymous boolean not null default true;

-- Sessions: id is a random 32-byte hex token (also the cookie value).
-- The hashed form is stored in token_hash for fast lookup / 撤销。
create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null default '',
  user_agent text,
  ip text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

-- Verification codes: email magic link / future SMS, single table for both
create table if not exists verification_codes (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  purpose text not null check (purpose in ('email_verify', 'email_magic', 'reset_password', 'login_magic')),
  code_hash text not null,
  token_hash text not null default '',
  payload jsonb,
  attempts int not null default 0,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists verification_codes_identifier_idx on verification_codes (identifier, purpose);
create index if not exists verification_codes_expires_at_idx on verification_codes (expires_at);

-- Password reset tokens: dedicated long-lived token separate from codes
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null default '',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_resets_user_id_idx on password_resets (user_id);
create index if not exists password_resets_expires_at_idx on password_resets (expires_at);

-- Rate limit: counter window for sensitive endpoints
create table if not exists rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_bucket_idx on rate_limit_events (bucket, identifier, created_at desc);

-- =========================================================================
-- 站点级配置（SMTP / OAuth 第三方登录）
--   - key 形如 'smtp'、'oauth.github'、'oauth.google' 等
--   - 非敏感字段以 jsonb 明文存
--   - 敏感字段（password、client_secret、refresh_token）以
--     pgcrypto 的 pgp_sym_encrypt 加密后再写入 encrypted_payload (bytea)
--   - 修改后写入 site_settings_audit 审计表（旧/新值对比）
-- =========================================================================
create table if not exists site_settings (
  key text primary key,
  -- 非敏感字段，例如 host / port / username / from / client_id / redirect_uri / scope / enabled
  public_payload jsonb not null default '{}'::jsonb,
  -- 敏感字段（smtp.password / oauth.client_secret 等），整体用 SITE_SETTINGS_SECRET 加密
  encrypted_payload bytea,
  -- 加密时使用的密钥版本，便于未来轮换
  secret_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists site_settings_updated_at_idx on site_settings (updated_at desc);

create table if not exists site_settings_audit (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  action text not null check (action in ('create', 'update', 'delete', 'test')),
  actor text not null,
  -- 变更前后的非敏感字段对比，敏感字段始终置 null
  before_payload jsonb,
  after_payload jsonb,
  -- 测试结果（test_smtp / test_oauth）也写到这里
  test_result jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists site_settings_audit_key_idx on site_settings_audit (key, created_at desc);
