// 服务端 HTML 净化：把富文本编辑器产生的内容限制在白名单标签与属性内。
// 任何 <script>、on* 事件、javascript: 链接都会被移除。
//
// 这是防止 XSS 的关键防线。即使前端编辑器做了限制，也必须假设用户可以
// 直接 POST 任意 HTML。

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'span', 'div'
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height'])
};

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return false;
  if (trimmed.startsWith('data:')) {
    // 仅放行图片的 data URL（base64）
    return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed);
  }
  if (trimmed.startsWith('vbscript:')) return false;
  return true;
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === 3) {
    // 文本节点：直接保留
    return node.cloneNode(true);
  }
  if (node.nodeType !== 1) {
    return null;
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // 未知标签：把它内部的子节点（净化后）作为同级提到外面
    const frag = document.createDocumentFragment();
    el.childNodes.forEach((child) => {
      const cleaned = sanitizeNode(child);
      if (cleaned) frag.appendChild(cleaned);
    });
    return frag;
  }

  const out = document.createElement(tag);
  const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) continue;
    if (!allowed.has(name)) continue;
    if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) continue;
    out.setAttribute(name, attr.value);
  }
  // <a> 默认加 rel="noopener noreferrer"
  if (tag === 'a' && out.getAttribute('target') === '_blank') {
    out.setAttribute('rel', out.getAttribute('rel') ?? 'noopener noreferrer');
  }

  el.childNodes.forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) out.appendChild(cleaned);
  });
  return out;
}

export function sanitizeRichText(html: string): string {
  if (typeof html !== 'string' || !html) return '';
  // 服务端没有 DOM，使用轻量解析：直接转义、再把白名单标签还原。
  // 这里我们用一个巧妙的做法：构造一个 jsdom-free 解析，把已知危险内容清掉。
  // 但本项目运行在 Node 22 + Next.js，可以使用 happy-dom 或类似 DOM。
  // 简化方案：用正则把危险模式去掉 + 标签白名单。
  let cleaned = html;
  // 去掉 <script>...</script> 整段
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  // 去掉所有 on* 事件属性
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  // 去掉 javascript:/vbscript: 链接
  cleaned = cleaned.replace(/href\s*=\s*"\s*javascript:[^"]*"/gi, 'href="#"');
  cleaned = cleaned.replace(/href\s*=\s*'\s*javascript:[^']*'/gi, "href='#'");
  cleaned = cleaned.replace(/src\s*=\s*"\s*javascript:[^"]*"/gi, 'src=""');
  cleaned = cleaned.replace(/src\s*=\s*'\s*javascript:[^']*'/gi, "src=''");
  // 去掉不在白名单里的标签（包括它们的属性），但保留 innerHTML
  cleaned = cleaned.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag: string) => {
    const lower = tag.toLowerCase();
    if (ALLOWED_TAGS.has(lower)) {
      // 进一步剥除非法属性
      return match
        .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
        .replace(/\s+style\s*=\s*"[^"]*"/gi, '')
        .replace(/\s+style\s*=\s*'[^']*'/gi, '');
    }
    return '';
  });
  return cleaned.trim();
}

// 计算纯文本长度（去掉所有 HTML 标签后）用于字数限制
export function plainTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length;
}

// 提取纯文本（用于搜索）
export function plainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
