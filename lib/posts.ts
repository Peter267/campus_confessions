import { sql } from '@/lib/db';
import { demoComments, demoModerationSettings, demoPosts } from '@/lib/demo-data';
import { CommentRecord, FeedPage, ModerationSettingsRecord, PostRecord, PostStatus } from '@/lib/types';

async function fetchPosts(query: TemplateStringsArray, ...values: unknown[]) {
  if (!sql) {
    return [] as PostRecord[];
  }

  return (await sql(query, ...values)) as PostRecord[];
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
      published_at: input.status === 'published' ? createdAt : null
    };

    demoPosts.unshift(record);
    return record;
  }

  const rows = (await sql`
    insert into posts (category, alias, author_name, content, image_url, status, moderation_reason, published_at)
    values (
      ${input.category},
      ${input.alias},
      ${input.alias},
      ${input.content},
      ${input.imageUrl ?? null},
      ${input.status},
      ${input.moderationReason ?? null},
      ${input.status === 'published' ? new Date().toISOString() : null}
    )
    returning *
  `) as PostRecord[];

  return rows[0];
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
