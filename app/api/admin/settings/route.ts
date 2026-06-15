import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { getModerationSettings, updateModerationSettings } from '@/lib/posts';
import { moderationSettingsSchema } from '@/lib/validators';

// 防止响应被 Next.js 缓存，确保 admin 修改规则后立刻能拿到最新值。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getModerationSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = moderationSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: '规则校验失败' }, { status: 400 });
  }

  const settings = await updateModerationSettings(parsed.data);
  return NextResponse.json(settings);
}
