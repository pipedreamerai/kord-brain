import { NextRequest, NextResponse } from 'next/server';
import {
  getAllDocs,
  getTagIndex,
  ingestUpload,
  type IngestProgress,
} from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const runtime = 'nodejs';

export async function GET() {
  const docs = await getAllDocs();
  const tagIndex = await getTagIndex();
  return NextResponse.json({ docs, tagIndex });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const entries = form.getAll('files');
  const files = entries.filter((e): e is File => e instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) => {
        controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      };

      emit({ type: 'start', total: files.length });

      const uploaded: Array<{ slug: string; filename: string }> = [];
      const errors: Array<{ filename: string; error: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        emit({ type: 'file-start', filename: f.name, index: i, total: files.length });
        try {
          const buf = Buffer.from(await f.arrayBuffer());
          const doc = await ingestUpload(f.name, buf, (ev: IngestProgress) => emit(ev));
          uploaded.push({ slug: doc.slug, filename: doc.filename });
          emit({ type: 'file-done', filename: f.name, doc });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ filename: f.name, error: message });
          emit({ type: 'file-error', filename: f.name, error: message });
        }
      }

      const docs = await getAllDocs();
      const tagIndex = await getTagIndex();
      emit({ type: 'all-done', uploaded, errors, docs, tagIndex });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
