import type { NextRequest } from 'next/server';
import { createRecordsHttp } from '@/server/records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return createRecordsHttp(process.env).dashboard(request);
}
