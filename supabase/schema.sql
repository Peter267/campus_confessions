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
