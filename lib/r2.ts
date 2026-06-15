import { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const ALLOWED_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
  maxFileSize: number;
};

export type R2Status =
  | { enabled: true; config: R2Config }
  | { enabled: false; reason: string };

export function getR2Status(): R2Status {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim() || 'campus-confessions';
  const publicBase = process.env.R2_PUBLIC_BASE?.trim().replace(/\/+$/, '');
  const maxFileSize = Number(process.env.R2_MAX_FILE_SIZE ?? 5 * 1024 * 1024);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return { enabled: false, reason: 'R2 凭证未配置 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)' };
  }
  if (!publicBase) {
    return { enabled: false, reason: 'R2_PUBLIC_BASE 未配置' };
  }

  return {
    enabled: true,
    config: { accountId, accessKeyId, secretAccessKey, bucket, publicBase, maxFileSize }
  };
}

let cachedClient: S3Client | null = null;

export function getR2Client(config: R2Config): S3Client {
  if (cachedClient) {
    return cachedClient;
  }
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  return cachedClient;
}

export function buildObjectKey(fileName: string, mimeType: string): { key: string; ext: string } {
  const ext = ALLOWED_EXT[mimeType] ?? 'bin';
  const safeBase = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]+/g, '-')
    .slice(0, 40) || 'image';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return { key: `posts/${stamp}-${rand}-${safeBase}.${ext}`, ext };
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export async function presignPutUrl(config: R2Config, key: string, contentType: string, expiresIn = 60) {
  const client = getR2Client(config);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType
  });
  return await getSignedUrl(client, command, { expiresIn });
}

export async function presignGetUrl(config: R2Config, key: string, expiresIn = 60) {
  const client = getR2Client(config);
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key
  });
  return await getSignedUrl(client, command, { expiresIn });
}

export function publicUrl(config: R2Config, key: string): string {
  return `${config.publicBase}/${key}`;
}
