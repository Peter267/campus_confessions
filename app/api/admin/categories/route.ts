import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { listCategories, createCategory } from '@/lib/posts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const categories = await listCategories();
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { name, slug, parent_id } = body as { name: string; slug: string; parent_id?: string | null };
  if (!name || !slug) return NextResponse.json({ error: 'Name and slug required' }, { status: 400 });
  const category = await createCategory(name, slug, parent_id ?? null);
  return NextResponse.json(category, { status: 201 });
}