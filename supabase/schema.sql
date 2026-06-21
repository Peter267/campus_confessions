create extension if not exists pgcrypto;

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
