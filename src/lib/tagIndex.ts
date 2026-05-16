import path from 'node:path';
import { TAGS, type Tag } from './tags';
import { DOCS, type DocSlug } from './docs';
import { loadPdf } from './ingestion/pdf';
import { loadDocx } from './ingestion/docx';
import { loadXlsx } from './ingestion/xlsx';

export type TagLocationPdf = {
  kind: 'pdf';
  slug: DocSlug;
  filename: string;
  page: number;
  bbox: [number, number, number, number];
  pageWidth: number;
  pageHeight: number;
  note?: string;
};

export type TagLocationDocx = {
  kind: 'docx';
  slug: DocSlug;
  filename: string;
  anchorId: string;
  snippet: string;
};

export type TagLocationXlsx = {
  kind: 'xlsx';
  slug: DocSlug;
  filename: string;
  sheet: string;
  rowIndex: number;
  values: string[];
};

export type TagLocation = TagLocationPdf | TagLocationDocx | TagLocationXlsx;

export type TagIndex = Record<Tag, TagLocation[]>;

export type DocPayloadPdf = {
  kind: 'pdf';
  pages: { number: number; width: number; height: number }[];
};
export type DocPayloadDocx = { kind: 'docx'; html: string };
export type DocPayloadXlsx = {
  kind: 'xlsx';
  sheets: { name: string; header: string[]; rows: string[][] }[];
};
export type DocPayloadEntry = DocPayloadPdf | DocPayloadDocx | DocPayloadXlsx;
export type DocPayload = Partial<Record<DocSlug, DocPayloadEntry>>;

const samplesDir = path.resolve(process.cwd(), 'samples');

let cached: { tagIndex: TagIndex; docs: DocPayload } | null = null;

export async function getTagIndex(): Promise<{ tagIndex: TagIndex; docs: DocPayload }> {
  if (cached) return cached;

  const tagIndex = {} as TagIndex;
  for (const t of TAGS) tagIndex[t] = [];
  const docs: DocPayload = {};

  for (const meta of DOCS) {
    if (meta.kind === 'pdf') {
      const info = await loadPdf(samplesDir, meta.filename);
      const pageMap: Record<number, { width: number; height: number }> = {};
      for (const p of info.pages) pageMap[p.number] = { width: p.width, height: p.height };
      for (const b of info.bboxes) {
        const pg = pageMap[b.page];
        if (!pg) continue;
        tagIndex[b.tag].push({
          kind: 'pdf',
          slug: meta.slug,
          filename: meta.filename,
          page: b.page,
          bbox: b.bbox,
          pageWidth: pg.width,
          pageHeight: pg.height,
          note: b.note,
        });
      }
      docs[meta.slug] = { kind: 'pdf', pages: info.pages };
    } else if (meta.kind === 'docx') {
      const info = await loadDocx(samplesDir, meta.filename);
      for (const o of info.occurrences) {
        tagIndex[o.tag].push({
          kind: 'docx',
          slug: meta.slug,
          filename: meta.filename,
          anchorId: o.anchorId,
          snippet: o.snippet,
        });
      }
      docs[meta.slug] = { kind: 'docx', html: info.html };
    } else if (meta.kind === 'xlsx') {
      const info = await loadXlsx(samplesDir, meta.filename);
      for (const r of info.tagRows) {
        tagIndex[r.tag].push({
          kind: 'xlsx',
          slug: meta.slug,
          filename: meta.filename,
          sheet: r.sheet,
          rowIndex: r.rowIndex,
          values: r.values,
        });
      }
      docs[meta.slug] = { kind: 'xlsx', sheets: info.sheets };
    }
  }

  cached = { tagIndex, docs };
  return cached;
}

export function clearTagIndexCache() {
  cached = null;
}
