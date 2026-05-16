import { NextResponse } from 'next/server';
import { getTagIndex } from '@/lib/tagIndex';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { tagIndex, docs } = await getTagIndex();
  return NextResponse.json({ tagIndex, docs });
}
