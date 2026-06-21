// GET /api/auth/me
// 返回当前登录用户信息。未登录时返回 200 + { user: null }。
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
