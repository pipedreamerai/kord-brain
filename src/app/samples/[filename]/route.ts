import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { DOCS } from '@/lib/docs';

const filenameToPath = new Map(DOCS.map((d) => [d.filename, d.filePath]));

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
  const filePath = filenameToPath.get(filename);
  if (!filePath) {
    return new NextResponse('Not found', { status: 404 });
  }
  const buf = await readFile(path.join(process.cwd(), 'demo_docs', filePath));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType(filename),
      'Cache-Control': 'no-store',
    },
  });
}
