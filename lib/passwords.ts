// 密码哈希工具
// ---------------------------------------------------------------------------
// 选型：Node 内置 crypto.scrypt。优点：
//   1. 不引入额外依赖（bcrypt/argon2 需要原生编译，在 Serverless 上易出问题）
//   2. scrypt 是内存硬算法，对彩虹表与 GPU 爆破相对更友好
//   3. 同样的明文在每次哈希时使用不同 salt，输出格式自描述
//
// 存储格式：`scrypt-sha256$<N>$<r>$<p>$<saltHex>$<hashHex>`
//   - N=16384, r=8, p=1：当前 OWASP 推荐值
//   - 算法标识放在最前，将来升级为 argon2 时可直接区分
// ---------------------------------------------------------------------------

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number }
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const ALGO_TAG = 'scrypt-sha256';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

function getMaxmem() {
  // 128 MiB 在多数 Serverless 平台上足够，必要时通过环境变量调整
  const env = Number(process.env.SCRYPT_MAXMEM ?? 0);
  if (Number.isFinite(env) && env > 0) return env;
  return 128 * 1024 * 1024;
}

export interface PasswordValidation {
  valid: boolean;
  reason?: string;
}

export function validatePasswordStrength(password: string): PasswordValidation {
  if (typeof password !== 'string') {
    return { valid: false, reason: '密码格式不正确' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: `密码至少需要 ${MIN_PASSWORD_LENGTH} 位字符` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, reason: `密码最多 ${MAX_PASSWORD_LENGTH} 位字符` };
  }
  // 至少包含字母与数字，避免被常见弱口令字典攻陷
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return { valid: false, reason: '密码需同时包含字母和数字' };
  }
  // 排除纯连续 / 重复字符
  if (/^(.)\1+$/.test(password)) {
    return { valid: false, reason: '密码不能为单一字符重复' };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: getMaxmem()
  });
  return `${ALGO_TAG}$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [tag, nStr, rStr, pStr, saltHex, hashHex] = parts;
  if (tag !== ALGO_TAG) return false;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (!saltHex || !hashHex) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: getMaxmem()
  });
  // timingSafeEqual 防止基于时序的字节比对泄漏
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
