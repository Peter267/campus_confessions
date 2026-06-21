import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, getAdminTokenFromRequest } from '@/lib/auth';
import { listReports, deleteReport, createAuditLog } from '@/lib/posts';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const items = await listReports(100);
  return NextResponse.json({ items });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = (body.id as string) ?? '';
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const tokenHash = createHash('sha256').update(getAdminTokenFromRequest(request)).digest('hex').slice(0, 16);
  await createAuditLog('dismiss_report', null, tokenHash, `report:${id}`);
  await deleteReport(id);
  return NextResponse.json({ success: true });
}
