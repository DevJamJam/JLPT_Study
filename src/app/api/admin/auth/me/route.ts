import { createAdminHttp } from '@/server/admin';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return createAdminHttp(process.env).me(request);
}
