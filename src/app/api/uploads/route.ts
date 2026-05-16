import { NextRequest, NextResponse } from 'next/server';
import { getAllDocs, getTagIndex, ingestUpload } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const docs = await getAllDocs();
  const tagIndex = await getTagIndex();
  return NextResponse.json({ docs, tagIndex });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const entries = form.getAll('files');
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const uploaded: Array<{ slug: string; filename: string; tags: string[] }> = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const e of entries) {
    if (!(e instanceof File)) continue;
    try {
      const buf = Buffer.from(await e.arrayBuffer());
      const doc = await ingestUpload(e.name, buf);
      uploaded.push({ slug: doc.slug, filename: doc.filename, tags: doc.tags });
    } catch (err) {
      errors.push({
        filename: e.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const docs = await getAllDocs();
  const tagIndex = await getTagIndex();
  return NextResponse.json({ uploaded, errors, docs, tagIndex });
}
