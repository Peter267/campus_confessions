"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

// 极简富文本编辑器：
// - 基于 contenteditable，不依赖 TipTap/Slate 等大包
// - 工具栏只做最常见操作（粗体/斜体/下划线/列表/标题/引用/链接/图片）
// - 内容以 HTML 字符串形式上报给上层，最终由服务端 sanitize
// - 客户端也会做一次轻量 sanitize：把危险标签/事件属性剥掉，给用户即时反馈

type ToolbarAction = 'bold' | 'italic' | 'underline' | 'strike' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'link' | 'image' | 'clear';

const ALLOWED_INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'A']);
const ALLOWED_BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE']);

function stripDangerous(html: string): string {
  if (typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const cleaned = document.createElement('div');
  walk(root, cleaned);
  return cleaned.innerHTML;
}

function walk(src: Element, dst: Node) {
  src.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      dst.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (ALLOWED_INLINE_TAGS.has(tag) || ALLOWED_BLOCK_TAGS.has(tag)) {
      const next = document.createElement(tag.toLowerCase());
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) continue;
        if (name === 'style') continue;
        if (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel')) {
          next.setAttribute(name, attr.value);
        } else if (tag === 'IMG' && (name === 'src' || name === 'alt' || name === 'width' || name === 'height')) {
          next.setAttribute(name, attr.value);
        }
      }
      walk(el, next);
      dst.appendChild(next);
    } else {
      walk(el, dst);
    }
  });
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '写下你想发出的匿名表达...',
  minHeight = 200,
  maxLength = 1200
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxLength?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [plain, setPlain] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    // 防止内容同步产生循环：仅在 HTML 与当前不一致时更新
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    setPlain(computePlain(value));
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [value]);

  const exec = useCallback((action: ToolbarAction) => {
    if (typeof window === 'undefined') return;
    if (action === 'link') {
      const url = window.prompt('输入链接地址（http/https）：', 'https://');
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) {
        window.alert('只支持 http(s) 链接');
        return;
      }
      document.execCommand('createLink', false, url);
    } else if (action === 'image') {
      const url = window.prompt('输入图片地址（http/https）：', 'https://');
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) {
        window.alert('只支持 http(s) 图片');
        return;
      }
      document.execCommand('insertImage', false, url);
    } else if (action === 'clear') {
      document.execCommand('removeFormat', false);
      document.execCommand('formatBlock', false, 'p');
    } else {
      const map: Record<Exclude<ToolbarAction, 'link' | 'image' | 'clear'>, string> = {
        bold: 'bold',
        italic: 'italic',
        underline: 'underline',
        strike: 'strikeThrough',
        h2: 'formatBlock',
        h3: 'formatBlock',
        ul: 'insertUnorderedList',
        ol: 'insertOrderedList',
        quote: 'formatBlock'
      };
      const value = action === 'h2' ? '<h2>' : action === 'h3' ? '<h3>' : action === 'quote' ? '<blockquote>' : '';
      document.execCommand(map[action], false, value);
    }
    if (ref.current) {
      const html = stripDangerous(ref.current.innerHTML);
      onChange(html);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (!ref.current) return;
    const html = stripDangerous(ref.current.innerHTML);
    setPlain(computePlain(html));
    onChange(html);
  }, [onChange]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const overLimit = plain > maxLength;

  return (
    <div className={`rounded-[28px] border bg-white/7 transition ${isFocused ? 'border-amber-300/50' : 'border-white/10'}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-3 py-2 text-xs text-slate-200">
        <ToolbarButton onClick={() => exec('bold')} label="B" title="加粗" bold />
        <ToolbarButton onClick={() => exec('italic')} label="I" title="斜体" italic />
        <ToolbarButton onClick={() => exec('underline')} label="U" title="下划线" underline />
        <ToolbarButton onClick={() => exec('strike')} label="S" title="删除线" strike />
        <Divider />
        <ToolbarButton onClick={() => exec('h2')} label="H2" title="二级标题" />
        <ToolbarButton onClick={() => exec('h3')} label="H3" title="三级标题" />
        <Divider />
        <ToolbarButton onClick={() => exec('ul')} label="• 列表" title="无序列表" />
        <ToolbarButton onClick={() => exec('ol')} label="1. 列表" title="有序列表" />
        <ToolbarButton onClick={() => exec('quote')} label="❝" title="引用" />
        <Divider />
        <ToolbarButton onClick={() => exec('link')} label="🔗" title="插入链接" />
        <ToolbarButton onClick={() => exec('image')} label="🖼" title="插入图片" />
        <ToolbarButton onClick={() => exec('clear')} label="清除" title="清除格式" />
        <span className={`ml-auto ${overLimit ? 'text-rose-300' : 'text-slate-400'}`}>{plain} / {maxLength}</span>
      </div>

      {/* Editable surface */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="富文本编辑器"
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        data-placeholder={placeholder}
        className="px-4 py-4 text-sm leading-7 text-white outline-none rich-editor"
        style={{ minHeight }}
      />

      <style jsx>{`
        .rich-editor:empty::before {
          content: attr(data-placeholder);
          color: rgb(100 116 139);
          pointer-events: none;
        }
        .rich-editor :global(h1),
        .rich-editor :global(h2),
        .rich-editor :global(h3) {
          color: #fff;
          font-weight: 600;
          margin: 0.6em 0 0.3em;
        }
        .rich-editor :global(h2) { font-size: 1.15rem; }
        .rich-editor :global(h3) { font-size: 1.05rem; }
        .rich-editor :global(p) { margin: 0.4em 0; }
        .rich-editor :global(blockquote) {
          border-left: 3px solid rgba(251, 191, 36, 0.6);
          padding: 0.2em 0.8em;
          color: rgb(203 213 225);
          margin: 0.6em 0;
          background: rgba(251, 191, 36, 0.06);
          border-radius: 6px;
        }
        .rich-editor :global(ul),
        .rich-editor :global(ol) { margin: 0.4em 0 0.4em 1.2em; }
        .rich-editor :global(li) { margin: 0.15em 0; }
        .rich-editor :global(a) { color: rgb(125 211 252); text-decoration: underline; }
        .rich-editor :global(img) {
          max-width: 100%;
          border-radius: 12px;
          margin: 0.6em 0;
        }
      `}</style>
    </div>
  );
}

function computePlain(html: string) {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '').length;
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').trim().length;
}

function ToolbarButton({ onClick, label, title, bold, italic, underline, strike }: {
  onClick: () => void;
  label: string;
  title: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-xs text-slate-200 transition hover:bg-white/10 ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''} ${underline ? 'underline' : ''} ${strike ? 'line-through' : ''}`}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />;
}
