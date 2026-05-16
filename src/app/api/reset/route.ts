import { NextResponse } from 'next/server';
import { nukeAll } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const result = await nukeAll();
  return NextResponse.json(result);
}
