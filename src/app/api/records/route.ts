import { createRecordsHttp } from '@/server/records';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return createRecordsHttp(process.env).create(request);
}

export async function GET(request: NextRequest) {
  return createRecordsHttp(process.env).list(request);
}
