import { NextRequest, NextResponse } from 'next/server';
import {
  buildObjectKey,
  getR2Status,
  isAllowedMime,
  presignPutUrl,
  publicUrl
} from '@/lib/r2';

const MAX_FILENAME = 120;

export async function POST(request: NextRequest) {
  const status = getR2Status();
  if (!status.enabled) {
    return NextResponse.json({ error: status.reason }, { status: 503 });
  }
  const config = status.config;

  let payload: { fileName?: unknown; contentType?: unknown; size?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const fileName = typeof payload.fileName === 'string' ? payload.fileName : 'image';
  const contentType = typeof payload.contentType === 'string' ? payload.contentType.toLowerCase() : '';
  const size = Number(payload.size ?? 0);

  if (!isAllowedMime(contentType)) {
    return NextResponse.json({ error: '仅支持 png/jpg/webp/gif 图片' }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: '缺少文件大小' }, { status: 400 });
  }
  if (size > config.maxFileSize) {
    return NextResponse.json(
      { error: `文件超过 ${Math.round(config.maxFileSize / 1024 / 1024)} MB 上限` },
      { status: 413 }
    );
  }
  if (fileName.length > MAX_FILENAME) {
    return NextResponse.json({ error: '文件名过长' }, { status: 400 });
  }

  const { key } = buildObjectKey(fileName, contentType);
  const uploadUrl = await presignPutUrl(config, key, contentType, 60);
  const finalUrl = publicUrl(config, key);

  return NextResponse.json({
    uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
    publicUrl: finalUrl,
    key,
    expiresIn: 60
  });
}
