export type PostStatus = 'pending' | 'published' | 'rejected';

export type PostCategory = '表白' | '万能墙' | '失物招领' | '日常吐槽';

export interface PostRecord {
  id: string;
  status: PostStatus;
  category: PostCategory | string;
  author_name: string;
  alias: string;
  content: string;
  content_html: string | null;
  image_url: string | null;
  moderation_reason: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  published_at: string | null;
  ip_address?: string | null;
  tags?: string[];
}

export interface CommentRecord {
  id: string;
  post_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface ModerationSettingsRecord {
  blocked_keywords: string[];
  blocked_aliases: string[];
  blocked_ips: string[];
}

export interface AnnouncementRecord {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface ReportRecord {
  id: string;
  post_id: string;
  reason: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  post_id: string | null;
  admin_token_hash: string;
  reason: string | null;
  created_at: string;
}

export interface FeedPage {
  items: PostRecord[];
  nextCursor: string | null;
}
