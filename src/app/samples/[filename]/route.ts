import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { DOCS } from '@/lib/docs';

const ALLOWED = new Set(DOCS.map((d) => d.filename));

function contentType(filename: string): string {
  if (filename.endsWith('.pdf')) return 'application/pdf';
  if (filename.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (filename.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'application/octet-stream';
}

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!ALLOWED.has(filename)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const buf = await readFile(path.join(process.cwd(), 'samples', filename));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType(filename),
      'Cache-Control': 'no-store',
    },
  });
}
