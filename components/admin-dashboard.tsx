"use client";

import { useEffect, useState } from 'react';
import type { AnnouncementRecord, AuditLogRecord, CategoryRecord, ModerationSettingsRecord, PostRecord } from '@/lib/types';
import type { ReportWithPost } from '@/lib/posts';

const TOKEN_STORAGE_KEY = 'campus:admin-token';

function joinLines(value: string[]) {
  return value.join('\n');
}

function splitLines(value: string) {
  return value.split(/\n|,|，/).map((item) => item.trim()).filter(Boolean);
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-admin-token': token };
}

type Tab = 'pending' | 'published' | 'categories' | 'announcement' | 'rules' | 'logs' | 'reports';

export function AdminDashboard({
  pendingPosts,
  publishedPosts,
  settings,
  categories: initialCategories,
  announcement: initialAnnouncement,
  logs: initialLogs,
  reports: initialReports
}: {
  pendingPosts: PostRecord[];
  publishedPosts: PostRecord[];
  settings: ModerationSettingsRecord;
  categories: CategoryRecord[];
  announcement: AnnouncementRecord;
  logs: AuditLogRecord[];
  reports: ReportWithPost[];
}) {
  const [token, setToken] = useState('');
  const [tokenReady, setTokenReady] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'verified'>('idle');
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState(pendingPosts);
  const [published, setPublished] = useState(publishedPosts);
  const [categories, setCategories] = useState(initialCategories);
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  const [announcementText, setAnnouncementText] = useState(initialAnnouncement.content);
  const [announcementPreview, setAnnouncementPreview] = useState(false);
  const [keywords, setKeywords] = useState(joinLines(settings.blocked_keywords));
  const [aliases, setAliases] = useState(joinLines(settings.blocked_aliases));
  const [ips, setIps] = useState(joinLines(settings.blocked_ips));
  const [logs, setLogs] = useState(initialLogs);
  const [reports, setReports] = useState(initialReports);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState<PostRecord[] | null>(null);
  const [adminSearchLoading, setAdminSearchLoading] = useState(false);

  // Category form state
  const [catForm, setCatForm] = useState({ name: '', slug: '', parent_id: '' });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Edit post modal state
  const [editingPost, setEditingPost] = useState<PostRecord | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostCategory, setEditPostCategory] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // --- Token verification (keep existing logic) ---
  async function verifyToken(value: string): Promise<boolean> {
    setVerifyState('verifying');
    setNotice('');
    try {
      const res = await fetch('/api/admin/settings', { headers: authHeaders(value) });
      if (res.ok) return true;
      const payload = await res.json().catch(() => ({}));
      setNotice(`口令错误：${payload.error ?? res.status}`);
      return false;
    } catch {
      setNotice('验证请求失败，请检查网络');
      return false;
    } finally {
      setVerifyState((state) => (state === 'verifying' ? 'idle' : state));
    }
  }

  function persistToken(value: string) {
    setToken(value);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
  }

  function clearToken() {
    setToken('');
    setVerifyState('idle');
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '' : '';
    // setTokenReady 用于标记客户端已 hydrate，是 useEffect 同步外部 sessionStorage 的合法用例。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTokenReady(true);
    if (stored) {
      setToken(stored);
      void (async () => {
        const ok = await verifyToken(stored);
        if (ok) setVerifyState('verified');
        else clearToken();
      })();
    }
  }, []);

  // --- Refresh functions ---
  async function refreshPending() {
    if (!token) return;
    setRefreshing('pending');
    try {
      const res = await fetch('/api/admin/pending', { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as { items: PostRecord[] };
      setPending(data.items);
    } catch { /* ignore */ } finally { setRefreshing(null); }
  }

  async function refreshPublished() {
    if (!token) return;
    setRefreshing('published');
    try {
      const res = await fetch('/api/admin/published', { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as { items: PostRecord[] };
      setPublished(data.items);
    } catch { /* ignore */ } finally { setRefreshing(null); }
  }

  async function refreshCategories() {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/categories', { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as CategoryRecord[];
      setCategories(data);
    } catch { /* ignore */ }
  }

  async function refreshLogs() {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/logs', { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as AuditLogRecord[];
      setLogs(data);
    } catch { /* ignore */ }
  }

  async function refreshReports() {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/reports', { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as { items: ReportWithPost[] };
      setReports(data.items);
    } catch { /* ignore */ }
  }

  async function refreshSettings() {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/settings', { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as ModerationSettingsRecord;
      setKeywords(joinLines(data.blocked_keywords));
      setAliases(joinLines(data.blocked_aliases));
      setIps(joinLines(data.blocked_ips));
    } catch { /* ignore */ }
  }

  // --- Post actions ---
  async function movePost(id: string, action: 'approve' | 'reject') {
    const response = await fetch(`/api/admin/posts/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(`操作失败：${payload.error ?? response.status}`);
      if (response.status === 401) clearToken();
      return;
    }
    const updated = (await response.json()) as PostRecord;
    setPending((current) => current.filter((item) => item.id !== id));
    if (updated.status === 'published') setPublished((current) => [updated, ...current]);
    setNotice(action === 'approve' ? '已通过发布' : '已驳回处理');
  }

  async function deletePost(id: string, reason: string) {
    if (!confirm(`确定要删除这条帖子？${reason ? `原因：${reason}` : ''}`)) return;
    const response = await fetch(`/api/admin/posts/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(`删除失败：${payload.error ?? response.status}`);
      if (response.status === 401) clearToken();
      return;
    }
    setPending((current) => current.filter((item) => item.id !== id));
    setPublished((current) => current.filter((item) => item.id !== id));
    if (adminSearchResults) setAdminSearchResults((current) => (current ?? []).filter((item) => item.id !== id));
    setNotice('帖子已删除');
    await refreshLogs();
  }

  function openEditPost(post: PostRecord) {
    setEditingPost(post);
    setEditPostContent(post.content);
    setEditPostCategory(post.category);
  }

  function closeEditPost() {
    setEditingPost(null);
    setEditPostContent('');
    setEditPostCategory('');
  }

  async function saveEditedPost() {
    if (!editingPost) return;
    if (editPostContent.trim().length < 10 || editPostContent.trim().length > 1200) {
      setNotice('内容长度需在 10 到 1200 个字符之间');
      return;
    }
    if (!editPostCategory.trim()) {
      setNotice('分类不能为空');
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/posts/${editingPost.id}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ content: editPostContent.trim(), category: editPostCategory.trim() })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setNotice(`保存失败：${payload.error ?? res.status}`);
        if (res.status === 401) clearToken();
        return;
      }
      const updated = (await res.json()) as PostRecord;
      const apply = (list: PostRecord[]) => list.map((item) => (item.id === updated.id ? updated : item));
      setPending(apply);
      setPublished(apply);
      if (adminSearchResults) setAdminSearchResults((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)));
      setNotice('帖子已更新');
      closeEditPost();
      await refreshLogs();
    } finally {
      setEditSaving(false);
    }
  }

  async function dismissReport(id: string) {
    if (!confirm('确定关闭此举报？')) return;
    const res = await fetch('/api/admin/reports', {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({ id })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setNotice(`操作失败：${payload.error ?? res.status}`);
      if (res.status === 401) clearToken();
      return;
    }
    setReports((current) => current.filter((item) => item.id !== id));
    setNotice('举报已关闭');
    await refreshLogs();
  }

  // --- Admin search ---
  async function doAdminSearch() {
    if (!adminSearch.trim()) { setAdminSearchResults(null); return; }
    setAdminSearchLoading(true);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(adminSearch)}`, { headers: authHeaders(token) });
      if (!res.ok) { if (res.status === 401) clearToken(); return; }
      const data = (await res.json()) as { items: PostRecord[] };
      setAdminSearchResults(data.items);
    } catch { /* ignore */ } finally { setAdminSearchLoading(false); }
  }

  // --- Category CRUD ---
  async function saveCategory() {
    if (!catForm.name || !catForm.slug) { setNotice('名称和 slug 不能为空'); return; }
    const url = editingCatId ? `/api/admin/categories/${editingCatId}` : '/api/admin/categories';
    const method = editingCatId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: authHeaders(token), body: JSON.stringify(catForm) });
    if (!res.ok) { if (res.status === 401) clearToken(); return; }
    setCatForm({ name: '', slug: '', parent_id: '' });
    setEditingCatId(null);
    await refreshCategories();
    setNotice('分类已保存');
  }

  async function deleteCategory(id: string) {
    if (!confirm('确定删除此分类？')) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    if (!res.ok) { if (res.status === 401) clearToken(); return; }
    await refreshCategories();
    setNotice('分类已删除');
  }

  function editCategory(cat: CategoryRecord) {
    setEditingCatId(cat.id);
    setCatForm({ name: cat.name, slug: cat.slug, parent_id: cat.parent_id ?? '' });
  }

  // --- Announcement ---
  async function saveAnnouncement() {
    const res = await fetch('/api/admin/announcement', {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ content: announcementText }),
    });
    if (!res.ok) { if (res.status === 401) clearToken(); return; }
    const data = (await res.json()) as AnnouncementRecord;
    setAnnouncement(data);
    setNotice('公告已更新');
  }

  // --- Rules ---
  async function saveSettings() {
    const body = { blocked_keywords: splitLines(keywords), blocked_aliases: splitLines(aliases), blocked_ips: splitLines(ips) };
    const response = await fetch('/api/admin/settings', { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setNotice(`保存失败：${payload.error ?? response.status}`);
      if (response.status === 401) clearToken();
      return;
    }
    const saved = (await response.json()) as ModerationSettingsRecord;
    setKeywords(joinLines(saved.blocked_keywords ?? body.blocked_keywords));
    setAliases(joinLines(saved.blocked_aliases ?? body.blocked_aliases));
    setIps(joinLines(saved.blocked_ips ?? body.blocked_ips));
    setNotice('敏感词与封禁规则已更新');
  }

  // --- Simple markdown renderer for preview ---
  function renderMarkdownPreview(text: string) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (/^### (.+)/.test(line)) return <h3 key={i} className="text-base font-semibold text-white mb-1">{line.replace(/^### /, '')}</h3>;
      if (/^## (.+)/.test(line)) return <h2 key={i} className="text-lg font-semibold text-white mb-1">{line.replace(/^## /, '')}</h2>;
      if (/^- (.+)/.test(line)) return <li key={i} className="text-xs text-slate-300 ml-3 list-disc">{line.replace(/^- /, '')}</li>;
      if (line.trim() === '') return <div key={i} className="h-1" />;
      return <p key={i} className="text-xs leading-5 text-slate-300">{line}</p>;
    });
  }

  // --- Token gate ---
  if (!tokenReady) return null;

  if (!token || verifyState !== 'verified') {
    return (
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const value = String(formData.get('token') ?? '').trim();
          if (!value) { setNotice('请填写管理口令'); return; }
          setVerifyState('verifying');
          const ok = await verifyToken(value);
          if (ok) { persistToken(value); setVerifyState('verified'); setNotice(''); }
          else setVerifyState('idle');
        }}
        className="space-y-4 rounded-[32px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl"
      >
        <h3 className="font-display text-2xl text-white">输入管理口令</h3>
        <p className="text-sm text-slate-300">口令会先经过服务端校验，错误的口令会立即被拒。验证通过后仅保存在当前浏览器会话（sessionStorage），不会写入 URL 或服务端日志。</p>
        <input name="token" type="password" autoComplete="off" placeholder="ADMIN_TOKEN" className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" />
        <button type="submit" disabled={verifyState === 'verifying'} className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
          {verifyState === 'verifying' ? '验证中...' : '进入后台'}
        </button>
        {notice ? <p className="text-sm text-amber-100">{notice}</p> : null}
      </form>
    );
  }

  // --- Tabs config ---
  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending', label: '待审核' },
    { key: 'published', label: '已发布' },
    { key: 'reports', label: `举报${reports.length > 0 ? ` (${reports.length})` : ''}` },
    { key: 'categories', label: '分类管理' },
    { key: 'announcement', label: '公告编辑' },
    { key: 'rules', label: '规则面板' },
    { key: 'logs', label: '操作日志' },
  ];

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => void (async () => { await Promise.all([refreshPending(), refreshPublished(), refreshCategories(), refreshLogs(), refreshSettings()]); setNotice('已刷新最新数据'); })()} disabled={refreshing !== null} className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50">
          {refreshing ? '刷新中…' : '一键刷新'}
        </button>
        <button onClick={clearToken} className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10">清除口令</button>
      </div>

      {notice ? <p className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-100">{notice}</p> : null}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-white/8 pb-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-full px-4 py-2 text-xs transition ${tab === t.key ? 'bg-white/12 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/6'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ PENDING TAB ============ */}
      {tab === 'pending' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-white">待审核队列</h3>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">{pending.length} 条</span>
              <button onClick={() => void refreshPending()} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10">{refreshing === 'pending' ? '刷新中…' : '刷新'}</button>
            </div>
          </div>
          <div className="space-y-4">
            {pending.map((post) => (
              <article key={post.id} className="rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{post.alias}</span><span>·</span><span>{post.category}</span><span>·</span>
                  <span>{new Date(post.created_at).toLocaleString('zh-CN')}</span>
                  {post.ip_address ? <><span>·</span><span className="text-slate-500">IP: {post.ip_address}</span></> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{post.content}</p>
                {post.image_url ? <img src={post.image_url} alt="投稿图片" className="mt-4 max-h-60 w-full rounded-2xl object-cover" /> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => void movePost(post.id, 'approve')} className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/25">一键通过</button>
                  <button onClick={() => void movePost(post.id, 'reject')} className="rounded-full bg-rose-400/15 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-400/25">驳回</button>
                  <button onClick={() => openEditPost(post)} className="rounded-full bg-amber-400/15 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/25">修改</button>
                  <button onClick={() => void deletePost(post.id, '管理员删除')} className="rounded-full bg-red-400/10 px-4 py-2 text-sm text-red-200 transition hover:bg-red-400/20">删除</button>
                </div>
              </article>
            ))}
            {pending.length === 0 ? <p className="text-sm text-slate-400">暂无待审核内容。</p> : null}
          </div>
        </div>
      )}

      {/* ============ PUBLISHED TAB ============ */}
      {tab === 'published' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <input type="text" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void doAdminSearch(); }} placeholder="搜索已发布帖子（标题/内容/作者）..." className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-white outline-none focus:border-cyan-300/50" />
              <button onClick={() => void doAdminSearch()} disabled={adminSearchLoading} className="rounded-full bg-white/10 px-4 py-2 text-xs text-slate-200 hover:bg-white/15 disabled:opacity-50">{adminSearchLoading ? '搜索中...' : '搜索'}</button>
              {adminSearchResults && <button onClick={() => { setAdminSearch(''); setAdminSearchResults(null); }} className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-400 hover:text-white">清除</button>}
            </div>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-auto">
            {(adminSearchResults ?? published).map((post) => (
              <article key={post.id} className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-100">
                <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>{post.alias}</span><span>·</span><span>{post.category}</span>
                    {post.ip_address ? <><span>·</span><span className="text-slate-500">IP: {post.ip_address}</span></> : null}
                  </div>
                  <span>♥ {post.like_count} · {post.comment_count} 评论</span>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap leading-6">{post.content}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => openEditPost(post)} className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-400/25">修改</button>
                  <button onClick={() => void deletePost(post.id, '管理员删除')} className="rounded-full bg-red-400/10 px-3 py-1 text-xs text-red-200 transition hover:bg-red-400/20">删除</button>
                </div>
              </article>
            ))}
            {(adminSearchResults ?? published).length === 0 ? <p className="text-sm text-slate-400">暂无已发布内容。</p> : null}
          </div>
        </div>
      )}

      {/* ============ CATEGORIES TAB ============ */}
      {tab === 'categories' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <h3 className="font-display text-xl text-white mb-4">分类管理</h3>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <input value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} placeholder="分类名称" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-white outline-none focus:border-cyan-300/50" />
            <input value={catForm.slug} onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value }))} placeholder="slug (URL标识)" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-white outline-none focus:border-cyan-300/50" />
            <button onClick={() => void saveCategory()} className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">{editingCatId ? '更新分类' : '添加分类'}</button>
          </div>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">{cat.name}</span>
                  <span className="text-xs text-slate-500">/{cat.slug}</span>
                  <span className="text-xs text-slate-600">排序: {cat.sort_order}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => editCategory(cat)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">编辑</button>
                  <button onClick={() => void deleteCategory(cat.id)} className="rounded-full border border-red-400/20 px-3 py-1 text-xs text-red-300 hover:bg-red-400/10">删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ ANNOUNCEMENT TAB ============ */}
      {tab === 'announcement' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-white">公告编辑</h3>
            <div className="flex gap-2">
              <button onClick={() => setAnnouncementPreview(!announcementPreview)} className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10">
                {announcementPreview ? '编辑' : '预览'}
              </button>
              <button onClick={() => void saveAnnouncement()} className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950">保存公告</button>
            </div>
          </div>
          {announcementPreview ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 min-h-[200px]">
              <div className="space-y-1">{renderMarkdownPreview(announcementText)}</div>
            </div>
          ) : (
            <textarea value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} rows={12} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-white outline-none focus:border-cyan-300/50 font-mono" placeholder="支持 Markdown：## 标题、### 副标题、- 列表" />
          )}
          <p className="mt-2 text-xs text-slate-500">支持格式：## 大标题、### 小标题、- 列表项、普通段落。空行分隔段落。</p>
        </div>
      )}

      {/* ============ RULES TAB ============ */}
      {tab === 'rules' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-white">规则面板</h3>
            <button onClick={() => void refreshSettings()} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10">从服务端同步</button>
          </div>
          <div className="space-y-4 text-sm">
            <label className="block space-y-2"><span className="text-slate-300">违规关键词（每行一个，逗号也支持）</span><textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={5} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white outline-none" /></label>
            <label className="block space-y-2"><span className="text-slate-300">封禁代号</span><textarea value={aliases} onChange={(e) => setAliases(e.target.value)} rows={4} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white outline-none" /></label>
            <label className="block space-y-2"><span className="text-slate-300">封禁 IP</span><textarea value={ips} onChange={(e) => setIps(e.target.value)} rows={4} className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-white outline-none" /></label>
            <button onClick={() => void saveSettings()} className="w-full rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-4 py-3 font-semibold text-slate-950">保存规则</button>
          </div>
        </div>
      )}

      {/* ============ REPORTS TAB ============ */}
      {tab === 'reports' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-white">用户举报</h3>
            <button onClick={() => void refreshReports()} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10">刷新</button>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-auto">
            {reports.length === 0 ? (
              <p className="text-sm text-slate-400">暂无举报。</p>
            ) : null}
            {reports.map((report) => (
              <article key={report.id} className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-2 py-0.5 text-rose-100">举报</span>
                    <span>{new Date(report.created_at).toLocaleString('zh-CN')}</span>
                    <span>·</span>
                    <span className="text-slate-300">原因：{report.reason}</span>
                  </div>
                  <button onClick={() => void dismissReport(report.id)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">关闭</button>
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                  {report.post_content ? (
                    <p className="whitespace-pre-wrap leading-6 text-slate-100">{report.post_content}</p>
                  ) : (
                    <p className="text-xs text-slate-500">原帖已删除</p>
                  )}
                  <div className="mt-2 text-xs text-slate-500">
                    作者：{report.post_alias ?? '匿名'} · 分类：{report.post_category ?? '未知'} · 状态：{report.post_status ?? '未知'}
                  </div>
                </div>
                {report.post_id && (report.post_status === 'published' || report.post_status === 'pending') ? (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => {
                        const target = [...pending, ...published].find((p) => p.id === report.post_id);
                        if (target) openEditPost(target);
                      }}
                      className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-300/20"
                    >
                      跳到原帖处理
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}

      {/* ============ LOGS TAB ============ */}
      {tab === 'logs' && (
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-white">操作日志</h3>
            <button onClick={() => void refreshLogs()} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10">刷新</button>
          </div>
          <div className="max-h-[500px] space-y-2 overflow-auto">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-white">{log.action}</span>
                  <span className="text-slate-500">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                </div>
                {log.post_id ? <p className="mt-1 text-slate-500">帖子: {log.post_id}</p> : null}
                {log.reason ? <p className="mt-1 text-slate-400">原因: {log.reason}</p> : null}
              </div>
            ))}
            {logs.length === 0 ? <p className="text-sm text-slate-400">暂无操作记录。</p> : null}
          </div>
        </div>
      )}

      {/* ============ EDIT POST MODAL ============ */}
      {editingPost ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditPost();
          }}
        >
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl text-white">修改帖子</h3>
              <button onClick={closeEditPost} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">关闭</button>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-slate-300">分类</span>
                <input
                  value={editPostCategory}
                  onChange={(event) => setEditPostCategory(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-300">内容（10 ~ 1200 字）</span>
                <textarea
                  value={editPostContent}
                  onChange={(event) => setEditPostContent(event.target.value)}
                  rows={10}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-white outline-none focus:border-cyan-300/50"
                />
                <span className="text-[10px] text-slate-500">{editPostContent.trim().length} / 1200</span>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeEditPost} className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/10">取消</button>
              <button
                onClick={() => void saveEditedPost()}
                disabled={editSaving}
                className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
              >
                {editSaving ? '保存中…' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}