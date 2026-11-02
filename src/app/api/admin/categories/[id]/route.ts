import { createAdminHttp } from '@/server/admin';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return createAdminHttp(process.env).updateCategory(request, id);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return createAdminHttp(process.env).deleteCategory(request, id);
}
