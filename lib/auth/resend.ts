// Resend 邮件服务封装
// ---------------------------------------------------------------------------
// 设计：
//   - 通过 RESEND_API_KEY 环境变量启用真实邮件发送
//   - 未配置时：dev 模式打印到服务端日志，并把 previewUrl 返回到 API 响应
//   - 单一入口 sendAuthEmail，按 type 分发到不同模板
// ---------------------------------------------------------------------------

import { Resend } from 'resend';

export type AuthEmailType = 'email_verify' | 'reset_password' | 'email_magic';

export interface SendAuthEmailInput {
  to: string;
  url: string;
  type: AuthEmailType;
}

export interface SendAuthEmailResult {
  ok: boolean;
  transport: 'resend' | 'dev-console';
  previewUrl?: string;
  error?: string;
}

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

function getFrom() {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@campus.local';
}

function getSiteName() {
  return process.env.NEXT_PUBLIC_SITE_NAME || '校园万能墙';
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

function buildSubject(type: AuthEmailType): string {
  const map: Record<AuthEmailType, string> = {
    email_verify: '验证你的邮箱',
    reset_password: '重置你的密码',
    email_magic: '登录校园墙'
  };
  return `【${getSiteName()}】${map[type]}`;
}

function buildHtml({ type, url }: { type: AuthEmailType; url: string }): string {
  const titles: Record<AuthEmailType, string> = {
    email_verify: '验证邮箱',
    reset_password: '重置密码',
    email_magic: '魔法链接登录'
  };
  const expires = type === 'reset_password' ? '30 分钟' : '10 分钟';
  return (
    `<p>你好，</p>` +
    `<p>请点击下面的链接完成<strong>${titles[type]}</strong>（${expires}内有效）：</p>` +
    `<p><a href="${url}">${url}</a></p>` +
    `<p>如果不是你本人操作，请忽略本邮件。</p>` +
    `<p>——${getSiteName()} 团队</p>`
  );
}

function buildText({ type, url }: { type: AuthEmailType; url: string }): string {
  const titles: Record<AuthEmailType, string> = {
    email_verify: '验证邮箱',
    reset_password: '重置密码',
    email_magic: '魔法链接登录'
  };
  const expires = type === 'reset_password' ? '30 分钟' : '10 分钟';
  return (
    `你好，\n\n` +
    `请点击下面的链接完成${titles[type]}（${expires}内有效）：\n` +
    `${url}\n\n` +
    `如果不是你本人操作，请忽略本邮件。\n` +
    `——${getSiteName()} 团队`
  );
}

export async function sendAuthEmail(input: SendAuthEmailInput): Promise<SendAuthEmailResult> {
  const c = getClient();
  if (!c) {
    // dev 模式：打印日志 + 暴露链接到响应
    // eslint-disable-next-line no-console
    console.info(
      `[mail:dev] To=${input.to} Type=${input.type}\nURL=${input.url}\n`
    );
    return {
      ok: true,
      transport: 'dev-console',
      previewUrl: input.url
    };
  }

  try {
    const { error } = await c.emails.send({
      from: getFrom(),
      to: input.to,
      subject: buildSubject(input.type),
      html: buildHtml(input),
      text: buildText(input)
    });
    if (error) {
      return { ok: false, transport: 'resend', error: error.message };
    }
    return { ok: true, transport: 'resend' };
  } catch (err) {
    return {
      ok: false,
      transport: 'resend',
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

// 构造用于密码重置 / 邮箱验证的 URL
export function buildAuthUrl({ type, token, email }: { type: AuthEmailType; token: string; email: string }): string {
  const base = getSiteUrl().replace(/\/$/, '');
  const search = new URLSearchParams({ token, email });
  const path = type === 'reset_password' ? '/reset-password' : '/verify-email';
  return `${base}${path}?${search.toString()}`;
}

export function getSiteBaseUrl() {
  return getSiteUrl().replace(/\/$/, '');
}
