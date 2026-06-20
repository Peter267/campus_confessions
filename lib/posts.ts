import { sql } from '@/lib/db';
import { demoComments, demoModerationSettings, demoPosts } from '@/lib/demo-data';
import { AnnouncementRecord, AuditLogRecord, CategoryRecord, CommentRecord, FeedPage, ModerationSettingsRecord, PostRecord, PostStatus, ReportRecord } from '@/lib/types';

async function fetchPosts(query: TemplateStringsArray, ...values: unknown[]) {
  if (!sql) {
    return [] as PostRecord[];
  }

  return (await sql(query as unknown as string, values)) as PostRecord[];
}

export async function listPublishedPosts(limit = 12, cursor?: string): Promise<FeedPage> {
  const safeLimit = Math.min(Math.max(limit, 1), 24);

  if (!sql) {
    const ordered = [...demoPosts]
      .filter((item) => item.status === 'published')
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    const cursorTime = cursor ? Number(cursor) : null;
    const filtered = cursorTime ? ordered.filter((item) => new Date(item.created_at).getTime() < cursorTime) : ordered;
    const items = filtered.slice(0, safeLimit);
    const nextCursor = filtered.length > safeLimit ? String(new Date(filtered[safeLimit].created_at).getTime()) : null;

    return { items, nextCursor };
  }

  const rows = cursor
    ? await fetchPosts`
        select *
        from posts
        where status = 'published' and created_at < to_timestamp(${Number(cursor)} / 1000.0)
        order by created_at desc
        limit ${safeLimit + 1}
      `
    : await fetchPosts`
        select *
        from posts
        where status = 'published'
        order by created_at desc
        limit ${safeLimit + 1}
      `;

  const items = rows.slice(0, safeLimit);
  const nextCursor = rows.length > safeLimit ? String(new Date(rows[safeLimit].created_at).getTime()) : null;

  return { items, nextCursor };
}

export async function searchPosts(query: string, limit = 24): Promise<PostRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safeQuery = `%${query.trim()}%`;

  if (!sql) {
    const q = query.trim().toLowerCase();
    return demoPosts
      .filter((item) => item.status === 'published')
      .filter((item) => item.content.toLowerCase().includes(q) || item.alias.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, safeLimit);
  }

  return await fetchPosts`
    select *
    from posts
    where status = 'published'
      and (content ilike ${safeQuery} or alias ilike ${safeQuery} or category ilike ${safeQuery})
    order by created_at desc
    limit ${safeLimit}
  `;
}

export async function listPendingPosts(limit = 24) {
  if (!sql) {
    return demoPosts.filter((item) => item.status === 'pending').slice(0, Math.min(Math.max(limit, 1), 50));
  }

  return await fetchPosts`
    select *
    from posts
    where status = 'pending'
    order by created_at asc
    limit ${Math.min(Math.max(limit, 1), 50)}
  `;
}

export async function listPublishedPostsByStatus(status: PostStatus, limit = 24) {
  if (!sql) {
    return demoPosts.filter((item) => item.status === status).slice(0, Math.min(Math.max(limit, 1), 50));
  }

  return await fetchPosts`
    select *
    from posts
    where status = ${status}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 50)}
  `;
}

export async function getPostById(id: string) {
  if (!sql) {
    return demoPosts.find((item) => item.id === id) ?? null;
  }

  const rows = await fetchPosts`
    select *
    from posts
    where id = ${id}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function createPost(input: {
  category: string;
  alias: string;
  content: string;
  imageUrl?: string | null;
  status: PostStatus;
  moderationReason?: string | null;
  ipAddress?: string | null;
  tags?: string[];
}) {
  if (!sql) {
    const createdAt = new Date().toISOString();
    const record: PostRecord = {
      id: `demo-${Math.random().toString(36).slice(2, 10)}`,
      status: input.status,
      category: input.category,
      author_name: input.alias,
      alias: input.alias,
      content: input.content,
      image_url: input.imageUrl ?? null,
      moderation_reason: input.moderationReason ?? null,
      like_count: 0,
      comment_count: 0,
      created_at: createdAt,
      published_at: input.status === 'published' ? createdAt : null,
      ip_address: input.ipAddress ?? null,
      tags: input.tags ?? []
    };

    demoPosts.unshift(record);
    return record;
  }

  const rows = (await sql`
    insert into posts (category, alias, author_name, content, image_url, status, moderation_reason, published_at, ip_address)
    values (
      ${input.category},
      ${input.alias},
      ${input.alias},
      ${input.content},
      ${input.imageUrl ?? null},
      ${input.status},
      ${input.moderationReason ?? null},
      ${input.status === 'published' ? new Date().toISOString() : null},
      ${input.ipAddress ?? null}
    )
    returning *
  `) as PostRecord[];

  const record = rows[0];

  if (input.tags && input.tags.length > 0) {
    await addPostTags(record.id, input.tags);
  }

  return record;
}

export async function setPostStatus(id: string, status: PostStatus, moderationReason?: string | null) {
  if (!sql) {
    const post = demoPosts.find((item) => item.id === id);
    if (!post) {
      return null;
    }

    post.status = status;
    post.moderation_reason = moderationReason ?? null;
    post.published_at = status === 'published' ? new Date().toISOString() : null;
    return post;
  }

  const rows = (await sql`
    update posts
    set status = ${status},
        moderation_reason = ${moderationReason ?? null},
        published_at = ${status === 'published' ? new Date().toISOString() : null}
    where id = ${id}
    returning *
  `) as PostRecord[];

  return rows[0] ?? null;
}

export async function incrementLike(id: string) {
  if (!sql) {
    const post = demoPosts.find((item) => item.id === id);
    if (!post) {
      return null;
    }

    post.like_count += 1;
    return post;
  }

  const rows = (await sql`
    update posts
    set like_count = like_count + 1
    where id = ${id}
    returning *
  `) as PostRecord[];

  return rows[0] ?? null;
}

export async function listComments(postId: string) {
  if (!sql) {
    return demoComments.filter((item) => item.post_id === postId);
  }

  return (await sql`
    select *
    from comments
    where post_id = ${postId}
    order by created_at asc
  `) as CommentRecord[];
}

export async function addComment(input: { postId: string; authorName: string; content: string }) {
  if (!sql) {
    const record: CommentRecord = {
      id: `demo-comment-${Math.random().toString(36).slice(2, 10)}`,
      post_id: input.postId,
      author_name: input.authorName,
      content: input.content,
      created_at: new Date().toISOString()
    };

    demoComments.push(record);
    const post = demoPosts.find((item) => item.id === input.postId);
    if (post) {
      post.comment_count += 1;
    }

    return record;
  }

  const rows = (await sql`
    insert into comments (post_id, author_name, content)
    values (${input.postId}, ${input.authorName}, ${input.content})
    returning *
  `) as CommentRecord[];

  await sql`
    update posts
    set comment_count = comment_count + 1
    where id = ${input.postId}
  `;

  return rows[0];
}

export async function getModerationSettings() {
  if (!sql) {
    return demoModerationSettings;
  }

  const rows = (await sql`
    select blocked_keywords, blocked_aliases, blocked_ips
    from moderation_settings
    where id = 1
    limit 1
  `) as ModerationSettingsRecord[];

  return rows[0] ?? { blocked_keywords: [], blocked_aliases: [], blocked_ips: [] };
}

export async function updateModerationSettings(input: ModerationSettingsRecord) {
  if (!sql) {
    demoModerationSettings.blocked_keywords = input.blocked_keywords;
    demoModerationSettings.blocked_aliases = input.blocked_aliases;
    demoModerationSettings.blocked_ips = input.blocked_ips;
    return demoModerationSettings;
  }

  const rows = (await sql`
    update moderation_settings
    set blocked_keywords = ${input.blocked_keywords},
        blocked_aliases = ${input.blocked_aliases},
        blocked_ips = ${input.blocked_ips},
        updated_at = now()
    where id = 1
    returning blocked_keywords, blocked_aliases, blocked_ips
  `) as ModerationSettingsRecord[];

  return rows[0];
}

// --- Announcements ---
export async function getAnnouncement(): Promise<AnnouncementRecord> {
  if (!sql) return { id: 1, content: '### 公告\n欢迎来到校园万能墙', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const rows = await sql`select * from announcements where id = 1 limit 1` as AnnouncementRecord[];
  return rows[0] ?? { id: 1, content: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export async function updateAnnouncement(content: string): Promise<AnnouncementRecord> {
  if (!sql) return { id: 1, content, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const rows = await sql`update announcements set content = ${content}, updated_at = now() where id = 1 returning *` as AnnouncementRecord[];
  return rows[0];
}

// --- Categories ---
export async function listCategories(): Promise<CategoryRecord[]> {
  if (!sql) return [
    { id: 'cat-1', name: '表白', slug: 'confession', parent_id: null, sort_order: 1, created_at: new Date().toISOString() },
    { id: 'cat-2', name: '万能墙', slug: 'general', parent_id: null, sort_order: 2, created_at: new Date().toISOString() },
    { id: 'cat-3', name: '失物招领', slug: 'lost-found', parent_id: null, sort_order: 3, created_at: new Date().toISOString() },
    { id: 'cat-4', name: '日常吐槽', slug: 'daily-rant', parent_id: null, sort_order: 4, created_at: new Date().toISOString() },
  ];
  return await sql`select * from categories order by sort_order asc, created_at asc` as CategoryRecord[];
}

export async function createCategory(name: string, slug: string, parentId?: string | null): Promise<CategoryRecord> {
  if (!sql) {
    return { id: `demo-cat-${Math.random().toString(36).slice(2, 8)}`, name, slug, parent_id: parentId ?? null, sort_order: 0, created_at: new Date().toISOString() };
  }
  const rows = await sql`insert into categories (name, slug, parent_id, sort_order) values (${name}, ${slug}, ${parentId ?? null}, 0) returning *` as CategoryRecord[];
  return rows[0];
}

export async function updateCategory(id: string, data: { name?: string; slug?: string; parent_id?: string | null; sort_order?: number }): Promise<CategoryRecord | null> {
  if (!sql) return null;
  const setClauses: string[] = [];
  const setParams: unknown[] = [];
  let i = 1;
  if (data.name !== undefined) {
    setClauses.push(`name = $${i++}`);
    setParams.push(data.name);
  }
  if (data.slug !== undefined) {
    setClauses.push(`slug = $${i++}`);
    setParams.push(data.slug);
  }
  if (data.parent_id !== undefined) {
    setClauses.push(`parent_id = $${i++}`);
    setParams.push(data.parent_id);
  }
  if (data.sort_order !== undefined) {
    setClauses.push(`sort_order = $${i++}`);
    setParams.push(data.sort_order);
  }
  if (setClauses.length === 0) return null;
  const unsafe = (sql as unknown as { unsafe: (q: string, ...params: unknown[]) => Promise<unknown> }).unsafe;
  const rows = (await unsafe(
    `update categories set ${setClauses.join(', ')} where id = $${i} returning *`,
    ...setParams,
    id
  )) as CategoryRecord[];
  return rows[0] ?? null;
}

export async function deleteCategory(id: string): Promise<boolean> {
  if (!sql) return true;
  await sql`delete from categories where id = ${id}`;
  return true;
}

// --- Posts with tags ---
export async function addPostTags(postId: string, tags: string[]) {
  if (!sql || tags.length === 0) return;
  const values = tags.map((tag) => ({ post_id: postId, tag: tag.trim().toLowerCase() }));
  for (const v of values) {
    await sql`insert into post_tags (post_id, tag) values (${v.post_id}, ${v.tag}) on conflict do nothing`;
  }
}

export async function getPostTags(postId: string): Promise<string[]> {
  if (!sql) return [];
  const rows = await sql`select tag from post_tags where post_id = ${postId}` as { tag: string }[];
  return rows.map((r) => r.tag);
}

// --- Reports ---
export async function createReport(postId: string, reason: string): Promise<ReportRecord> {
  if (!sql) return { id: 'demo-report', post_id: postId, reason, created_at: new Date().toISOString() };
  const rows = await sql`insert into reports (post_id, reason) values (${postId}, ${reason}) returning *` as ReportRecord[];
  return rows[0];
}

export async function listReports(): Promise<ReportRecord[]> {
  if (!sql) return [];
  return await sql`select * from reports order by created_at desc` as ReportRecord[];
}

// --- Audit Logs ---
export async function createAuditLog(action: string, postId: string | null, tokenHash: string, reason?: string | null): Promise<AuditLogRecord> {
  if (!sql) return { id: 'demo-log', action, post_id: postId, admin_token_hash: tokenHash, reason: reason ?? null, created_at: new Date().toISOString() };
  const rows = await sql`insert into audit_logs (action, post_id, admin_token_hash, reason) values (${action}, ${postId}, ${tokenHash}, ${reason ?? null}) returning *` as AuditLogRecord[];
  return rows[0];
}

export async function listAuditLogs(limit = 50): Promise<AuditLogRecord[]> {
  if (!sql) return [];
  return await sql`select * from audit_logs order by created_at desc limit ${limit}` as AuditLogRecord[];
}

// --- Delete Post ---
export async function deletePost(id: string): Promise<boolean> {
  if (!sql) {
    const idx = demoPosts.findIndex((p) => p.id === id);
    if (idx >= 0) { demoPosts.splice(idx, 1); return true; }
    return false;
  }
  await sql`delete from posts where id = ${id}`;
  return true;
}

// --- Admin Search ---
export async function adminSearchPosts(query: string, limit = 50): Promise<PostRecord[]> {
  const safeQuery = `%${query.trim()}%`;
  if (!sql) {
    const q = query.trim().toLowerCase();
    return demoPosts.filter((p) => p.content.toLowerCase().includes(q) || p.alias.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).slice(0, limit);
  }
  return await fetchPosts`select * from posts where content ilike ${safeQuery} or alias ilike ${safeQuery} or category ilike ${safeQuery} order by created_at desc limit ${limit}`;
}
