import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { isTag, type Tag } from '../tags';

export type BboxKind = 'symbol' | 'instrument' | 'label' | 'wire';

export type PdfBbox = {
  page: number;
  tag: Tag;
  bbox: [number, number, number, number];
  kind?: BboxKind;
  note?: string;
};

export type PdfPageInfo = {
  number: number;
  width: number;
  height: number;
};

export type PdfDocInfo = {
  filename: string;
  pages: PdfPageInfo[];
  bboxes: PdfBbox[];
};

export async function loadPdf(samplesDir: string, filename: string): Promise<PdfDocInfo> {
  const pdfBuf = await readFile(path.join(samplesDir, filename));
  const pdf = await PDFDocument.load(pdfBuf);
  const pages: PdfPageInfo[] = pdf.getPages().map((p, i) => ({
    number: i + 1,
    width: p.getWidth(),
    height: p.getHeight(),
  }));

  const sidecar = path.join(samplesDir, filename.replace(/\.pdf$/, '.bboxes.json'));
  let bboxes: PdfBbox[] = [];
  try {
    const raw = await readFile(sidecar, 'utf8');
    const parsed = JSON.parse(raw) as {
      pages?: { page: number; tags?: { tag?: string; bbox?: number[]; kind?: BboxKind; note?: string }[] }[];
    };
    bboxes = (parsed.pages ?? []).flatMap((pg) =>
      (pg.tags ?? []).flatMap((entry) => {
        if (!entry.tag || !isTag(entry.tag)) return [];
        if (!entry.bbox || entry.bbox.length !== 4) return [];
        return [{
          page: pg.page,
          tag: entry.tag,
          bbox: entry.bbox as [number, number, number, number],
          kind: entry.kind,
          note: entry.note,
        }];
      })
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return { filename, pages, bboxes };
}
