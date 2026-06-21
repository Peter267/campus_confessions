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
  user_id?: string | null;
  is_anonymous?: boolean;
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

// ---------------------------------------------------------------------------
// Account system
// ---------------------------------------------------------------------------

export type UserRole = 'user' | 'moderator' | 'admin' | 'superadmin';
export type UserStatus = 'active' | 'suspended' | 'closed';

export interface UserRecord {
  id: string;
  username: string | null;
  email: string | null;
  email_verified_at: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  status: UserStatus;
  oauth_provider: string | null;
  oauth_subject: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithSecrets extends UserRecord {
  password_hash: string;
  password_algo: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  user_agent: string | null;
  ip: string | null;
}

export type VerificationPurpose = 'email_verify' | 'email_magic' | 'reset_password' | 'login_magic';

export interface VerificationCodeRecord {
  id: string;
  identifier: string;
  purpose: VerificationPurpose;
  code_hash: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface PasswordResetRecord {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface FeedPage {
  items: PostRecord[];
  nextCursor: string | null;
}
