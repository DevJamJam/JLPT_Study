import { createAuthHttp } from '@/server/auth';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return createAuthHttp(process.env).changePin(request);
}
