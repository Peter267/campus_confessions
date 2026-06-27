// 限流工具
// ---------------------------------------------------------------------------
// 简单的滑动窗口实现：记录每次请求到 rate_limit_events 表，
// 计数窗口内事件数决定是否拦截。
// 无 DATABASE_URL 时回退到进程内内存计数（仅适用于单实例 dev / 测试）。
// ---------------------------------------------------------------------------

import { sql } from './db';

export interface RateLimitConfig {
  bucket: string; // 例如 'auth:login'
  identifier: string; // 通常是 IP 或 IP+username
  windowMs: number; // 时间窗口
  max: number; // 窗口内允许的最大次数
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number; // 距下一次可重试的毫秒数
}

// 内存模式：bucket+identifier -> 时间戳数组
const memoryEvents = new Map<string, number[]>();

function memoryKey(bucket: string, identifier: string) {
  return `${bucket}::${identifier}`;
}

function memoryCount(bucket: string, identifier: string, windowMs: number): number {
  const key = memoryKey(bucket, identifier);
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = (memoryEvents.get(key) ?? []).filter((t) => t > cutoff);
  memoryEvents.set(key, arr);
  return arr.length;
}

function memoryAdd(bucket: string, identifier: string) {
  const key = memoryKey(bucket, identifier);
  const arr = memoryEvents.get(key) ?? [];
  arr.push(Date.now());
  memoryEvents.set(key, arr);
}

function memoryClear(bucket: string, identifier: string) {
  memoryEvents.delete(memoryKey(bucket, identifier));
}

export async function hitRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  if (sql) {
    // 清理窗口外的旧事件
    const cutoff = new Date(Date.now() - config.windowMs).toISOString();
    await sql`delete from rate_limit_events where bucket = ${config.bucket} and identifier = ${config.identifier} and created_at < ${cutoff}`;
    const rows = (await sql`
      select created_at from rate_limit_events
      where bucket = ${config.bucket} and identifier = ${config.identifier}
      order by created_at desc
      limit ${config.max}
    `) as { created_at: string }[];
    if (rows.length >= config.max) {
      const oldest = rows[rows.length - 1];
      const resetMs = Math.max(0, new Date(oldest.created_at).getTime() + config.windowMs - Date.now());
      return { allowed: false, remaining: 0, resetMs };
    }
    await sql`
      insert into rate_limit_events (bucket, identifier)
      values (${config.bucket}, ${config.identifier})
    `;
    return { allowed: true, remaining: config.max - rows.length - 1, resetMs: config.windowMs };
  }
  const used = memoryCount(config.bucket, config.identifier, config.windowMs);
  if (used >= config.max) {
    return { allowed: false, remaining: 0, resetMs: config.windowMs };
  }
  memoryAdd(config.bucket, config.identifier);
  return { allowed: true, remaining: config.max - used - 1, resetMs: config.windowMs };
}

export async function clearRateLimit(bucket: string, identifier: string) {
  if (sql) {
    await sql`delete from rate_limit_events where bucket = ${bucket} and identifier = ${identifier}`;
  } else {
    memoryClear(bucket, identifier);
  }
}

// 常用预设
export const rateLimitPresets = {
  login: { windowMs: 5 * 60 * 1000, max: 10 }, // 5 分钟 10 次
  register: { windowMs: 10 * 60 * 1000, max: 5 }, // 10 分钟 5 次
  reset: { windowMs: 10 * 60 * 1000, max: 5 },
  emailSend: { windowMs: 60 * 1000, max: 1 } // 1 分钟 1 次
};
