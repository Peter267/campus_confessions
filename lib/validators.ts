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

// 富文本场景下，需要把 HTML 标签剥掉得到纯文本以计算字符数。
// 这是 length 校验的唯一依据，因为 <p>hello</p> 在视觉上只有 5 个字。
function plainTextLength(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length;
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }
  // 兼容逗号或换行分隔的字符串，便于从管理后台直接发送
  if (typeof value === 'string') {
    return value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export const publishSchema = {
  safeParse(input: unknown): ValidationResult<{ alias: string; category: '表白' | '万能墙' | '失物招领' | '日常吐槽'; content: string; imageUrl?: string | null; contentHtml: string }> {
    const payload = input as Record<string, unknown>;
    const alias = toText(payload.alias);
    const category = toText(payload.category) as '表白' | '万能墙' | '失物招领' | '日常吐槽';
    const content = toText(payload.content);
    const contentHtml = typeof payload.contentHtml === 'string' ? payload.contentHtml : '';
    const imageUrl = payload.imageUrl == null ? null : toText(payload.imageUrl);

    const fieldErrors: Record<string, string[]> = {};

    if (!alias || alias.length > 24) {
      fieldErrors.alias = ['代号长度需在 1 到 24 个字符之间'];
    }

    if (!['表白', '万能墙', '失物招领', '日常吐槽'].includes(category)) {
      fieldErrors.category = ['分类标签不合法'];
    }

    // 优先用 contentHtml 的纯文本长度，否则退回 content
    const textLength = contentHtml ? plainTextLength(contentHtml) : content.length;
    if (textLength < 10 || textLength > 1200) {
      fieldErrors.content = ['内容长度需在 10 到 1200 个字符之间'];
    }

    if (imageUrl !== null) {
      if (imageUrl.length > 2048) {
        fieldErrors.imageUrl = ['图片地址过长'];
      } else if (!/^https?:\/\//i.test(imageUrl)) {
        fieldErrors.imageUrl = ['图片地址必须为 http(s) 链接'];
      }
    }

    return Object.keys(fieldErrors).length > 0
      ? failure(fieldErrors)
      : success({ alias, category, content, imageUrl, contentHtml });
  }
};

export const commentSchema = {
  safeParse(input: unknown): ValidationResult<{ authorName?: string; content: string; contentHtml: string }> {
    const payload = input as Record<string, unknown>;
    const authorName = toText(payload.authorName);
    const content = toText(payload.content);
    const contentHtml = typeof payload.contentHtml === 'string' ? payload.contentHtml : '';
    const fieldErrors: Record<string, string[]> = {};

    if (authorName && authorName.length > 24) {
      fieldErrors.authorName = ['代号长度需在 1 到 24 个字符之间'];
    }

    const textLength = contentHtml ? plainTextLength(contentHtml) : content.length;
    if (textLength < 2 || textLength > 400) {
      fieldErrors.content = ['评论长度需在 2 到 400 个字符之间'];
    }

    return Object.keys(fieldErrors).length > 0
      ? failure(fieldErrors)
      : success({ authorName: authorName || undefined, content, contentHtml });
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
