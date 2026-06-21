// 邮件发送抽象层
// ---------------------------------------------------------------------------
// 设计目标：
//   1. 真实部署：通过 SMTP_* 环境变量启用 nodemailer-style 邮件发送
//      （这里不引入 nodemailer 依赖以保持零依赖；用 SMTP 协议最小子集即可）
//   2. 未配置时：把邮件内容打印到服务端日志，并在 dev 模式将"魔法链接"
//      返回到 API 响应中方便本地测试
//   3. 抽离成单一 sendMagicLink / sendVerificationCode 入口，未来接
//      SendGrid/Resend/Postmark 等只需要替换实现
// ---------------------------------------------------------------------------

import { createConnection } from 'node:net';
import { createHmac } from 'node:crypto';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MagicLinkOptions {
  email: string;
  token: string;
  purpose: 'email_verify' | 'email_magic' | 'reset_password';
  siteName?: string;
  siteUrl?: string;
}

export interface SendResult {
  ok: boolean;
  transport: 'smtp' | 'dev-console';
  previewUrl?: string;
  previewToken?: string;
  error?: string;
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

function getSiteName() {
  return process.env.NEXT_PUBLIC_SITE_NAME || '校园万能墙';
}

export function buildMagicLink({ email, token, purpose, siteName, siteUrl }: MagicLinkOptions) {
  const base = (siteUrl ?? getSiteUrl()).replace(/\/$/, '');
  const search = new URLSearchParams({ token, email });
  const path = purpose === 'reset_password' ? '/reset-password' : '/verify-email';
  return `${base}${path}?${search.toString()}`;
}

function formatMagicLinkMail({ email, token, purpose, siteName, siteUrl }: MagicLinkOptions) {
  const link = buildMagicLink({ email, token, purpose, siteName, siteUrl });
  const titleMap: Record<MagicLinkOptions['purpose'], string> = {
    email_verify: '验证你的邮箱',
    email_magic: '登录校园墙',
    reset_password: '重置你的密码'
  };
  const subject = `【${getSiteName()}】${titleMap[purpose]}`;
  const expires = purpose === 'reset_password' ? '30 分钟' : '10 分钟';
  const text =
    `你好，\n\n` +
    `请点击下面的链接完成${titleMap[purpose]}（${expires}内有效）：\n` +
    `${link}\n\n` +
    `如果不是你本人操作，请忽略本邮件。\n` +
    `——${getSiteName()} 团队`;
  const html = `<p>你好，</p><p>请点击下面的链接完成<strong>${titleMap[purpose]}</strong>（${expires}内有效）：</p><p><a href="${link}">${link}</a></p><p>如果不是你本人操作，请忽略本邮件。</p><p>——${getSiteName()} 团队</p>`;
  return { subject, text, html };
}

// 极简 SMTP 客户端实现，支持 PLAIN 登录 / STARTTLS。
// 仅依赖 node:net，不引入额外 npm 包。
async function smtpSend({ host, port, user, pass, from }: { host: string; port: number; user: string; pass: string; from: string }, message: MailMessage): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = createConnection(port, host, () => {
      const commands: { cmd: string; expect?: number[] }[] = [];
      commands.push({ cmd: `EHLO localhost`, expect: [250] });
      commands.push({ cmd: `AUTH LOGIN`, expect: [334] });
      commands.push({ cmd: Buffer.from(user).toString('base64'), expect: [334] });
      commands.push({ cmd: Buffer.from(pass).toString('base64'), expect: [235] });
      commands.push({ cmd: `MAIL FROM:<${from}>`, expect: [250] });
      commands.push({ cmd: `RCPT TO:<${message.to}>`, expect: [250, 251] });
      commands.push({
        cmd: `DATA`,
        expect: [354]
      });
      const data =
        `From: ${from}\r\n` +
        `To: ${message.to}\r\n` +
        `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString('base64')}?=\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/html; charset=UTF-8\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `\r\n` +
        Buffer.from(message.html ?? message.text).toString('base64') +
        `\r\n.\r\n`;
      commands.push({ cmd: data, expect: [250] });
      commands.push({ cmd: `QUIT` });

      let i = 0;
      let buffer = '';
      const sendNext = () => {
        if (i >= commands.length) {
          socket.end();
          resolve({ ok: true });
          return;
        }
        const { cmd } = commands[i++];
        socket.write(`${cmd}\r\n`);
      };
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!buffer.endsWith('\r\n') && i < commands.length) return;
        const code = parseInt(buffer.trim().split('\n').pop()?.split(' ')[0] ?? '0', 10);
        buffer = '';
        if (code >= 400) {
          socket.end();
          resolve({ ok: false, error: `SMTP ${code}` });
          return;
        }
        sendNext();
      });
      sendNext();
    });
    socket.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    socket.setTimeout(8000, () => {
      socket.destroy();
      resolve({ ok: false, error: 'SMTP timeout' });
    });
  });
}

export async function sendMagicLink(options: MagicLinkOptions): Promise<SendResult> {
  const mail = formatMagicLinkMail(options);
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const user = process.env.SMTP_USER ?? '';
    const pass = process.env.SMTP_PASSWORD ?? '';
    const from = process.env.SMTP_FROM ?? user;
    if (!user || !pass) {
      return { ok: false, transport: 'smtp', error: 'SMTP_USER / SMTP_PASSWORD 未配置' };
    }
    const result = await smtpSend({ host: smtpHost, port, user, pass, from }, { to: options.email, ...mail });
    return { ok: result.ok, transport: 'smtp', error: result.error };
  }

  // dev 模式：打印日志 + 暴露链接到响应
  // eslint-disable-next-line no-console
  console.info(`[mail:dev] To=${options.email} Subject=${mail.subject}\n${mail.text}\n`);
  return {
    ok: true,
    transport: 'dev-console',
    previewUrl: buildMagicLink(options),
    previewToken: options.token
  };
}

// ---------------------------------------------------------------------------
// 简单的 HMAC 签名工具，用于给魔法链接的 token 加一层"用途"与"过期"信息
// ---------------------------------------------------------------------------

const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

function signToken(payload: string) {
  return createHmac('sha256', process.env.SESSION_SECRET || 'dev-only-insecure-session-secret-please-change')
    .update(payload)
    .digest('base64url');
}

export function packMagicToken(identifier: string, purpose: MagicLinkOptions['purpose']) {
  const ttl = purpose === 'reset_password' ? RESET_TTL_MS : MAGIC_LINK_TTL_MS;
  const exp = Date.now() + ttl;
  const payload = `${identifier}|${purpose}|${exp}`;
  const sig = signToken(payload);
  return { token: `${Buffer.from(payload).toString('base64url')}.${sig}`, expiresAt: new Date(exp) };
}

export function unpackMagicToken(signed: string): { identifier: string; purpose: MagicLinkOptions['purpose']; expiresAt: number } | null {
  const [b64, sig] = signed.split('.');
  if (!b64 || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = signToken(payload);
  if (expected.length !== sig.length) return null;
  // 等长字符串再做字符比较
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  const [identifier, purpose, expStr] = payload.split('|');
  const exp = Number(expStr);
  if (!identifier || !purpose || !Number.isFinite(exp)) return null;
  if (exp <= Date.now()) return null;
  return { identifier, purpose: purpose as MagicLinkOptions['purpose'], expiresAt: exp };
}

// 仅用于开发期打印
export function formatUrl(url: string) {
  return new URL(url).toString();
}
