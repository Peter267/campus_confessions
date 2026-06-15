type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { flatten: () => { fieldErrors: Record<string, string[]> } } };

function failure(fieldErrors: Record<string, string[]>): ValidationResult<never> {
  return {
    success: false,
    error: {
      flatten: () => ({ fieldErrors })
    }
  };
}

function success<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => toText(item)).filter(Boolean) : [];
}

export const publishSchema = {
  safeParse(input: unknown): ValidationResult<{ alias: string; category: '表白' | '万能墙' | '失物招领' | '日常吐槽'; content: string; imageUrl?: string | null }> {
    const payload = input as Record<string, unknown>;
    const alias = toText(payload.alias);
    const category = toText(payload.category) as '表白' | '万能墙' | '失物招领' | '日常吐槽';
    const content = toText(payload.content);
    const imageUrl = payload.imageUrl == null ? null : toText(payload.imageUrl);

    const fieldErrors: Record<string, string[]> = {};

    if (!alias || alias.length > 24) {
      fieldErrors.alias = ['代号长度需在 1 到 24 个字符之间'];
    }

    if (!['表白', '万能墙', '失物招领', '日常吐槽'].includes(category)) {
      fieldErrors.category = ['分类标签不合法'];
    }

    if (content.length < 10 || content.length > 1200) {
      fieldErrors.content = ['内容长度需在 10 到 1200 个字符之间'];
    }

    if (imageUrl !== null) {
      if (imageUrl.length > 2048) {
        fieldErrors.imageUrl = ['图片地址过长'];
      } else if (!/^https?:\/\//i.test(imageUrl)) {
        fieldErrors.imageUrl = ['图片地址必须为 http(s) 链接'];
      }
    }

    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ alias, category, content, imageUrl });
  }
};

export const commentSchema = {
  safeParse(input: unknown): ValidationResult<{ authorName?: string; content: string }> {
    const payload = input as Record<string, unknown>;
    const authorName = toText(payload.authorName);
    const content = toText(payload.content);
    const fieldErrors: Record<string, string[]> = {};

    if (authorName && authorName.length > 24) {
      fieldErrors.authorName = ['代号长度需在 1 到 24 个字符之间'];
    }

    if (content.length < 2 || content.length > 400) {
      fieldErrors.content = ['评论长度需在 2 到 400 个字符之间'];
    }

    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ authorName: authorName || undefined, content });
  }
};

export const moderationSettingsSchema = {
  safeParse(input: unknown): ValidationResult<{ blocked_keywords: string[]; blocked_aliases: string[]; blocked_ips: string[] }> {
    const payload = input as Record<string, unknown>;
    const blocked_keywords = normalizeList(payload.blocked_keywords);
    const blocked_aliases = normalizeList(payload.blocked_aliases);
    const blocked_ips = normalizeList(payload.blocked_ips);

    return success({ blocked_keywords, blocked_aliases, blocked_ips });
  }
};
