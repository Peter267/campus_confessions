"use client";

// 超级管理员"站点配置"标签页：SMTP + 第三方 OAuth 登录
// 依赖：管理员后台的 x-admin-token 鉴权（沿用 AdminDashboard 的 fetch 方式）
// 特性：
//   1. 表单校验（与后端 validators 字段一一对应）
//   2. 测试连接按钮（不写库，只审计）
//   3. 敏感字段（密码 / secret）不返回明文，旧值用 "已配置" 标记占位
//   4. 修改后立即生效（后端 invalidate 缓存），UI 给出反馈
//   5. 内置审计日志（带 diff 折叠视图）

import { useEffect, useMemo, useState } from 'react';

type SmtpEncryption = 'none' | 'tls' | 'starttls' | 'ssl';
type OauthProviderKey = 'github' | 'google' | 'microsoft' | 'qq';

interface SmtpForm {
  enabled: boolean;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  from: string;
  password: string;
  hasPassword: boolean;
}

interface OauthForm {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  hasSecret: boolean;
  redirectUri: string;
  scope: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  displayName: string;
}

interface AuditRecord {
  id: string;
  key: string;
  action: 'create' | 'update' | 'delete' | 'test';
  actor: string;
  before_payload: Record<string, unknown> | null;
  after_payload: Record<string, unknown> | null;
  test_result: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

interface SiteSettingsPayload {
  smtp: (SmtpForm & { password?: string | null }) | null;
  oauth: Record<OauthProviderKey, (OauthForm & { clientSecret?: string | null }) | null>;
  oauthDefaults: Record<OauthProviderKey, Pick<OauthForm, 'authorizationUrl' | 'tokenUrl' | 'userinfoUrl' | 'scope'>>;
  oauthProviders: OauthProviderKey[];
  audit: AuditRecord[];
}

const OAUTH_LABELS: Record<OauthProviderKey, string> = {
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  qq: 'QQ'
};

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-admin-token': token };
}

function formatDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before && !after) return null;
  const keys = new Set<string>([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: { key: string; from: unknown; to: unknown }[] = [];
  for (const key of keys) {
    if (key === 'password' || key === 'clientSecret') continue;
    const a = before ? before[key] : undefined;
    const b = after ? after[key] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ key, from: a, to: b });
    }
  }
  return changes;
}

export function SiteSettingsPanel({ token }: { token: string }) {
  const [data, setData] = useState<SiteSettingsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ key: string; result: Record<string, unknown> } | null>(null);
  const [smtpForm, setSmtpForm] = useState<SmtpForm | null>(null);
  const [oauthForms, setOauthForms] = useState<Record<OauthProviderKey, OauthForm | null> | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/site-settings', { headers: authHeaders(token) });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setNotice({ type: 'err', text: `加载失败：${payload.error ?? res.status}` });
        return;
      }
      const payload = (await res.json()) as SiteSettingsPayload;
      setData(payload);
      setSmtpForm(
        payload.smtp
          ? {
              enabled: Boolean(payload.smtp.enabled),
              host: payload.smtp.host ?? '',
              port: payload.smtp.port ?? 465,
              encryption: (payload.smtp.encryption as SmtpEncryption) ?? 'starttls',
              username: payload.smtp.username ?? '',
              from: payload.smtp.from ?? '',
              password: '',
              hasPassword: Boolean(payload.smtp.hasPassword)
            }
          : {
              enabled: false,
              host: '',
              port: 465,
              encryption: 'starttls',
              username: '',
              from: '',
              password: '',
              hasPassword: false
            }
      );
      const of: Record<OauthProviderKey, OauthForm | null> = {
        github: null,
        google: null,
        microsoft: null,
        qq: null
      };
      (Object.keys(of) as OauthProviderKey[]).forEach((k) => {
        const c = payload.oauth[k];
        const defaults = payload.oauthDefaults[k] ?? { authorizationUrl: '', tokenUrl: '', userinfoUrl: '', scope: '' };
        of[k] = c
          ? {
              enabled: Boolean(c.enabled),
              clientId: c.clientId ?? '',
              clientSecret: '',
              hasSecret: Boolean(c.hasSecret),
              redirectUri: c.redirectUri ?? '',
              scope: c.scope ?? defaults.scope ?? '',
              authorizationUrl: c.authorizationUrl ?? defaults.authorizationUrl ?? '',
              tokenUrl: c.tokenUrl ?? defaults.tokenUrl ?? '',
              userinfoUrl: c.userinfoUrl ?? defaults.userinfoUrl ?? '',
              displayName: c.displayName ?? OAUTH_LABELS[k]
            }
          : {
              enabled: false,
              clientId: '',
              clientSecret: '',
              hasSecret: false,
              redirectUri: '',
              scope: defaults.scope ?? '',
              authorizationUrl: defaults.authorizationUrl ?? '',
              tokenUrl: defaults.tokenUrl ?? '',
              userinfoUrl: defaults.userinfoUrl ?? '',
              displayName: OAUTH_LABELS[k]
            };
      });
      setOauthForms(of);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const providers = useMemo<OauthProviderKey[]>(() => data?.oauthProviders ?? ['github', 'google', 'microsoft', 'qq'], [data?.oauthProviders]);

  function clientValidateSmtp(form: SmtpForm): string | null {
    if (!form.host.trim()) return 'SMTP 主机不能为空';
    if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) return '端口必须为 1 ~ 65535 之间的整数';
    if (!['none', 'tls', 'starttls', 'ssl'].includes(form.encryption)) return '加密方式必须为 none / tls / starttls / ssl';
    if (form.from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.from)) return '发件人邮箱格式不正确';
    if (form.encryption === 'ssl' && form.port !== 465) return 'SSL 加密通常使用 465 端口';
    return null;
  }

  function clientValidateOauth(form: OauthForm): string | null {
    if (form.enabled && !form.clientId.trim()) return '启用 OAuth 时必须填写 clientId';
    if (form.redirectUri && !/^https:\/\//i.test(form.redirectUri) && !/^http:\/\/localhost/i.test(form.redirectUri) && !/^http:\/\/127\.0\.0\.1/i.test(form.redirectUri)) {
      return '回调地址必须为 https（开发环境允许 http://localhost）';
    }
    return null;
  }

  async function saveSmtp() {
    if (!smtpForm) return;
    const err = clientValidateSmtp(smtpForm);
    if (err) { setNotice({ type: 'err', text: err }); return; }
    setSavingKey('smtp');
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ key: 'smtp', value: smtpForm })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'err', text: payload.error ?? `保存失败 (${res.status})` });
        return;
      }
      setNotice({ type: 'ok', text: 'SMTP 配置已保存并立即生效' });
      setSmtpForm({ ...smtpForm, password: '' });
      await refresh();
    } finally {
      setSavingKey(null);
    }
  }

  async function testSmtp() {
    if (!smtpForm) return;
    const err = clientValidateSmtp(smtpForm);
    if (err) { setNotice({ type: 'err', text: err }); return; }
    if (!smtpForm.hasPassword && !smtpForm.password) {
      setNotice({ type: 'err', text: '尚未保存过 SMTP 密码，请先在表单中填写并保存密码' });
      return;
    }
    setTestingKey('smtp');
    try {
      const res = await fetch('/api/admin/site-settings/test', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ key: 'smtp', value: smtpForm, password: smtpForm.password || undefined })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'err', text: payload.error ?? `测试失败 (${res.status})` });
        setTestResult({ key: 'smtp', result: payload.result ?? { error: payload.error } });
        return;
      }
      setTestResult({ key: 'smtp', result: payload.result });
      setNotice({ type: payload.result.ok ? 'ok' : 'err', text: payload.result.ok ? 'SMTP 测试通过' : `SMTP 测试失败：${payload.result.error}` });
      await refresh();
    } finally {
      setTestingKey(null);
    }
  }

  async function saveOauth(provider: OauthProviderKey) {
    const form = oauthForms?.[provider];
    if (!form) return;
    const err = clientValidateOauth(form);
    if (err) { setNotice({ type: 'err', text: err }); return; }
    setSavingKey(`oauth.${provider}`);
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ key: `oauth.${provider}`, value: form })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'err', text: payload.error ?? `保存失败 (${res.status})` });
        return;
      }
      setNotice({ type: 'ok', text: `${OAUTH_LABELS[provider]} 配置已保存并立即生效` });
      setOauthForms((prev) => prev ? { ...prev, [provider]: { ...form, clientSecret: '' } } : prev);
      await refresh();
    } finally {
      setSavingKey(null);
    }
  }

  async function testOauth(provider: OauthProviderKey) {
    const form = oauthForms?.[provider];
    if (!form) return;
    const err = clientValidateOauth(form);
    if (err) { setNotice({ type: 'err', text: err }); return; }
    if (!form.hasSecret && !form.clientSecret) {
      setNotice({ type: 'err', text: '尚未保存过 clientSecret，请先在表单中填写并保存' });
      return;
    }
    setTestingKey(`oauth.${provider}`);
    try {
      const res = await fetch('/api/admin/site-settings/test', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ key: `oauth.${provider}`, value: form, clientSecret: form.clientSecret || undefined })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'err', text: payload.error ?? `测试失败 (${res.status})` });
        setTestResult({ key: `oauth.${provider}`, result: payload.result ?? { error: payload.error } });
        return;
      }
      setTestResult({ key: `oauth.${provider}`, result: payload.result });
      setNotice({ type: payload.result.ok ? 'ok' : 'err', text: payload.result.ok ? `${OAUTH_LABELS[provider]} 测试通过` : `${OAUTH_LABELS[provider]} 测试失败：${payload.result.detail ?? '未知错误'}` });
      await refresh();
    } finally {
      setTestingKey(null);
    }
  }

  if (!data || !smtpForm || !oauthForms) {
    return <p className="text-sm text-slate-300">配置加载中… {loading ? '' : '(请检查接口)'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-white">站点级配置</h3>
        <button onClick={() => void refresh()} disabled={loading} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50">
          {loading ? '刷新中…' : '从服务端同步'}
        </button>
      </div>

      {notice ? (
        <p className={`rounded-2xl border px-4 py-3 text-sm ${notice.type === 'ok' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-rose-300/30 bg-rose-300/10 text-rose-100'}`}>
          {notice.text}
        </p>
      ) : null}

      {/* ============ SMTP ============ */}
      <section className="rounded-[24px] border border-white/10 bg-slate-950/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-display text-lg text-white">SMTP 邮件发送</h4>
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300">
            {smtpForm.hasPassword ? '已配置密码' : '未配置密码'}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-200 sm:col-span-2">
            <input type="checkbox" checked={smtpForm.enabled} onChange={(e) => setSmtpForm({ ...smtpForm, enabled: e.target.checked })} className="h-4 w-4" />
            启用 SMTP（关闭时邮件发送退回到 dev-console 模式）
          </label>
          <Field label="SMTP 主机" required>
            <input
              value={smtpForm.host}
              onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
              placeholder="smtp.qq.com"
              className={inputCls}
            />
          </Field>
          <Field label="端口" required>
            <input
              type="number"
              min={1}
              max={65535}
              value={smtpForm.port}
              onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="加密方式" required>
            <select
              value={smtpForm.encryption}
              onChange={(e) => setSmtpForm({ ...smtpForm, encryption: e.target.value as SmtpEncryption })}
              className={inputCls}
            >
              <option value="starttls">STARTTLS（推荐 587）</option>
              <option value="ssl">SSL（隐式 TLS，推荐 465）</option>
              <option value="tls">TLS</option>
              <option value="none">无加密（不推荐）</option>
            </select>
          </Field>
          <Field label="发件人邮箱">
            <input
              type="email"
              value={smtpForm.from}
              onChange={(e) => setSmtpForm({ ...smtpForm, from: e.target.value })}
              placeholder="noreply@school.edu"
              className={inputCls}
            />
          </Field>
          <Field label="SMTP 用户名">
            <input
              value={smtpForm.username}
              onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
              placeholder="user@school.edu"
              className={inputCls}
            />
          </Field>
          <Field label="SMTP 密码 / 授权码" hint={smtpForm.hasPassword ? '已保存密码；留空表示不修改' : '建议使用邮箱服务商提供的「授权码」而非登录密码'}>
            <input
              type="password"
              autoComplete="off"
              value={smtpForm.password}
              onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
              placeholder={smtpForm.hasPassword ? '••••••••' : ''}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => void testSmtp()} disabled={testingKey === 'smtp'} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
            {testingKey === 'smtp' ? '测试中…' : '测试连接'}
          </button>
          <button onClick={() => void saveSmtp()} disabled={savingKey === 'smtp'} className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
            {savingKey === 'smtp' ? '保存中…' : '保存 SMTP 配置'}
          </button>
          {testResult?.key === 'smtp' ? (
            <span className={`rounded-full px-3 py-1 text-xs ${testResult.result.ok ? 'bg-emerald-400/10 text-emerald-100' : 'bg-rose-400/10 text-rose-100'}`}>
              {testResult.result.ok ? '✓ 测试通过' : `✗ ${String(testResult.result.error ?? '失败')}`}
            </span>
          ) : null}
        </div>
      </section>

      {/* ============ OAuth Providers ============ */}
      <section className="rounded-[24px] border border-white/10 bg-slate-950/40 p-5">
        <h4 className="mb-3 font-display text-lg text-white">第三方 OAuth2 登录</h4>
        <p className="mb-4 text-xs text-slate-400">
          提供方启用后，登录页会出现对应按钮；回调地址需要在该提供方后台也注册。
          clientSecret 与 SMTP 密码一样使用 pgcrypto 加密后入库，不会返回明文。
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => {
            const form = oauthForms[p];
            if (!form) return null;
            return (
              <div key={p} className="rounded-[20px] border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h5 className="font-display text-base text-white">{OAUTH_LABELS[p]}</h5>
                  <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300">
                    {form.hasSecret ? '已配置密钥' : '未配置密钥'}
                  </span>
                </div>
                <div className="grid gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, enabled: e.target.checked } } : prev)}
                      className="h-4 w-4"
                    />
                    启用 {OAUTH_LABELS[p]} 登录
                  </label>
                  <Field label="Client ID">
                    <input value={form.clientId} onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, clientId: e.target.value } } : prev)} className={inputCls} />
                  </Field>
                  <Field label="Client Secret" hint={form.hasSecret ? '已保存密钥；留空表示不修改' : '请妥善保管'}>
                    <input
                      type="password"
                      autoComplete="off"
                      value={form.clientSecret}
                      onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, clientSecret: e.target.value } } : prev)}
                      placeholder={form.hasSecret ? '••••••••' : ''}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="回调地址 (redirect_uri)">
                    <input
                      value={form.redirectUri}
                      onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, redirectUri: e.target.value } } : prev)}
                      placeholder={`https://your-domain/oauth/${p}/callback`}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="scope">
                    <input
                      value={form.scope}
                      onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, scope: e.target.value } } : prev)}
                      className={inputCls}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="授权端点">
                      <input value={form.authorizationUrl} onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, authorizationUrl: e.target.value } } : prev)} className={inputCls} />
                    </Field>
                    <Field label="Token 端点">
                      <input value={form.tokenUrl} onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, tokenUrl: e.target.value } } : prev)} className={inputCls} />
                    </Field>
                    <Field label="UserInfo 端点">
                      <input value={form.userinfoUrl} onChange={(e) => setOauthForms((prev) => prev ? { ...prev, [p]: { ...form, userinfoUrl: e.target.value } } : prev)} className={inputCls} />
                    </Field>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => void testOauth(p)} disabled={testingKey === `oauth.${p}`} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
                    {testingKey === `oauth.${p}` ? '测试中…' : '测试连接'}
                  </button>
                  <button onClick={() => void saveOauth(p)} disabled={savingKey === `oauth.${p}`} className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
                    {savingKey === `oauth.${p}` ? '保存中…' : '保存'}
                  </button>
                  {testResult?.key === `oauth.${p}` ? (
                    <span className={`rounded-full px-3 py-1 text-xs ${testResult.result.ok ? 'bg-emerald-400/10 text-emerald-100' : 'bg-rose-400/10 text-rose-100'}`}>
                      {testResult.result.ok ? '✓ 测试通过' : `✗ ${String(testResult.result.detail ?? '失败')}`}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ Audit log ============ */}
      <section className="rounded-[24px] border border-white/10 bg-slate-950/40 p-5">
        <h4 className="mb-3 font-display text-lg text-white">配置变更审计</h4>
        <div className="max-h-[480px] space-y-2 overflow-auto">
          {data.audit.length === 0 ? <p className="text-sm text-slate-400">暂无配置变更记录。</p> : null}
          {data.audit.map((log) => {
            const diff = formatDiff(log.before_payload, log.after_payload);
            return (
              <details key={log.id} className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 ${log.action === 'update' ? 'bg-amber-400/10 text-amber-100' : log.action === 'test' ? 'bg-cyan-400/10 text-cyan-100' : 'bg-rose-400/10 text-rose-100'}`}>
                      {log.action}
                    </span>
                    <span className="text-slate-100">{log.key}</span>
                    <span className="text-slate-400">by {log.actor}</span>
                    {log.ip ? <span className="text-slate-500">IP: {log.ip}</span> : null}
                  </div>
                  <span className="text-slate-500">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                </summary>
                <div className="mt-2 space-y-2 text-[11px] text-slate-300">
                  {diff && diff.length > 0 ? (
                    <table className="w-full text-left">
                      <thead className="text-slate-400">
                        <tr><th className="pr-2">字段</th><th className="pr-2">旧值</th><th className="pr-2">新值</th></tr>
                      </thead>
                      <tbody>
                        {diff.map((c) => (
                          <tr key={c.key}>
                            <td className="pr-2 text-slate-300">{c.key}</td>
                            <td className="pr-2 text-slate-500">{c.from === undefined ? '∅' : JSON.stringify(c.from)}</td>
                            <td className="pr-2 text-slate-200">{c.to === undefined ? '∅' : JSON.stringify(c.to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {log.test_result ? (
                    <pre className="overflow-auto rounded-lg bg-slate-950/60 p-2 text-[11px] text-slate-200">{JSON.stringify(log.test_result, null, 2)}</pre>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50';

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-300">
        {label}
        {required ? <span className="text-rose-300"> *</span> : null}
        {hint ? <span className="ml-2 text-slate-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
