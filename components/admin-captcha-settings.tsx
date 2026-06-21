"use client";

// 人机验证配置面板（嵌入管理后台"站点配置"标签页）
// 管理员可选择启用 Cloudflare Turnstile 或 极验 Geetest v4，
// 敏感字段（Turnstile Secret / Geetest Key）加密入库，不返回明文。

import { useEffect, useState } from 'react';

type Provider = 'none' | 'turnstile' | 'geetest';

interface CaptchaState {
  provider: Provider;
  turnstileSiteKey: string;
  turnstileSecret: string;
  hasTurnstileSecret: boolean;
  geetestCaptchaId: string;
  geetestCaptchaKey: string;
  hasGeetestKey: boolean;
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-admin-token': token };
}

export function CaptchaSettingsPanel({ token }: { token: string }) {
  const [state, setState] = useState<CaptchaState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/captcha', { headers: authHeaders(token) });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setNotice({ type: 'err', text: `加载失败：${payload.error ?? res.status}` });
        return;
      }
      const data = (await res.json()) as Partial<CaptchaState> & { provider: Provider };
      setState({
        provider: data.provider ?? 'none',
        turnstileSiteKey: data.turnstileSiteKey ?? '',
        turnstileSecret: '',
        hasTurnstileSecret: Boolean(data.hasTurnstileSecret),
        geetestCaptchaId: data.geetestCaptchaId ?? '',
        geetestCaptchaKey: '',
        hasGeetestKey: Boolean(data.hasGeetestKey)
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function save() {
    if (!state) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/captcha', {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({
          provider: state.provider,
          turnstileSiteKey: state.turnstileSiteKey || null,
          turnstileSecret: state.turnstileSecret || null,
          geetestCaptchaId: state.geetestCaptchaId || null,
          geetestCaptchaKey: state.geetestCaptchaKey || null
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'err', text: payload.error ?? `保存失败 (${res.status})` });
        return;
      }
      setNotice({ type: 'ok', text: '人机验证配置已保存并立即生效' });
      setState((prev) => prev ? { ...prev, turnstileSecret: '', geetestCaptchaKey: '' } : prev);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!state) {
    return <p className="text-sm text-slate-300">人机验证配置加载中… {loading ? '' : '(请检查接口)'}</p>;
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50';

  return (
    <section className="rounded-[24px] border border-white/10 bg-slate-950/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-lg text-white">人机验证</h4>
        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300">
          当前：{state.provider === 'none' ? '未启用' : state.provider === 'turnstile' ? 'Cloudflare Turnstile' : '极验 Geetest'}
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        在注册 / 登录 / 找回密码等敏感环节启用人机验证，防止自动化攻击。可随时切换验证方式，立即生效。
      </p>

      {notice ? (
        <p className={`mb-3 rounded-2xl border px-4 py-3 text-sm ${notice.type === 'ok' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-rose-300/30 bg-rose-300/10 text-rose-100'}`}>
          {notice.text}
        </p>
      ) : null}

      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs text-slate-300">验证方式</span>
          <select
            value={state.provider}
            onChange={(e) => setState({ ...state, provider: e.target.value as Provider })}
            className={inputCls}
          >
            <option value="none">不启用（仅开发环境推荐）</option>
            <option value="turnstile">Cloudflare Turnstile</option>
            <option value="geetest">极验 Geetest v4</option>
          </select>
        </label>

        {state.provider === 'turnstile' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">Site Key（前端公开）</span>
              <input
                value={state.turnstileSiteKey}
                onChange={(e) => setState({ ...state, turnstileSiteKey: e.target.value })}
                className={inputCls}
                placeholder="0x4AAAAAAA..."
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">Secret Key（服务端校验）{state.hasTurnstileSecret ? ' · 已保存' : ''}</span>
              <input
                type="password"
                autoComplete="off"
                value={state.turnstileSecret}
                onChange={(e) => setState({ ...state, turnstileSecret: e.target.value })}
                className={inputCls}
                placeholder={state.hasTurnstileSecret ? '••••••••（留空不修改）' : '0x4AAAAAAA...'}
              />
            </label>
          </div>
        ) : null}

        {state.provider === 'geetest' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">Captcha ID（前端公开）</span>
              <input
                value={state.geetestCaptchaId}
                onChange={(e) => setState({ ...state, geetestCaptchaId: e.target.value })}
                className={inputCls}
                placeholder="xxxxxxxxxxxxxxxx"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">Captcha Key（服务端校验）{state.hasGeetestKey ? ' · 已保存' : ''}</span>
              <input
                type="password"
                autoComplete="off"
                value={state.geetestCaptchaKey}
                onChange={(e) => setState({ ...state, geetestCaptchaKey: e.target.value })}
                className={inputCls}
                placeholder={state.hasGeetestKey ? '••••••••（留空不修改）' : 'xxxxxxxxxxxxxxxx'}
              />
            </label>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? '刷新中…' : '重新加载'}
          </button>
        </div>
      </div>
    </section>
  );
}
