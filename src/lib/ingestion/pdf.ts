import { tagRegex, tagToSlug } from '../tagRegex';
import { extractPdf, type ExtractedSpan } from './pdf-extractor-client';

export type PdfPageInfo = { number: number; width: number; height: number };

/** Where the tags came from — useful for logging and UI hints. */
export type PdfTagSource = 'text-layer' | 'ocr' | 'none';

export type PdfTagLocation = {
  page: number;
  bbox: [number, number, number, number];
};

/** tagSlug → every place that tag appears in this PDF. */
export type PdfTagLocations = Record<string, PdfTagLocation[]>;

export type PdfDocInfo = {
  pages: PdfPageInfo[];
  /** Distinct tags found in the document. */
  tags: string[];
  /** Page-keyed text content (joined per page, from the sidecar). */
  pageText: Record<number, string>;
  /** Word-level spans per page — lets the UI later highlight tag bboxes. */
  pageSpans: Record<number, ExtractedSpan[]>;
  /** For each tag slug, the pages + bboxes where it appears. */
  tagLocations: PdfTagLocations;
  tagSource: PdfTagSource;
};

function extractTagLocations(
  pageSpans: Record<number, ExtractedSpan[]>,
): PdfTagLocations {
  const out: PdfTagLocations = {};
  const re = tagRegex();
  for (const [pageStr, spans] of Object.entries(pageSpans)) {
    const page = Number(pageStr);
    for (const span of spans) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(span.text)) !== null) {
        const slug = tagToSlug(m[0]);
        (out[slug] ??= []).push({ page, bbox: span.bbox });
      }
    }
  }
  return out;
}

export async function loadPdf(
  buf: Buffer,
  opts: { filename?: string } = {},
): Promise<PdfDocInfo> {
  const t0 = Date.now();
  const result = await extractPdf(buf, { filename: opts.filename });

  const pages: PdfPageInfo[] = result.pages.map((p) => ({
    number: p.number,
    width: p.width,
    height: p.height,
  }));

  const pageText: Record<number, string> = {};
  const pageSpans: Record<number, ExtractedSpan[]> = {};
  for (const p of result.pages) {
    pageText[p.number] = p.text;
    pageSpans[p.number] = p.spans;
  }

  const regex = tagRegex();
  const tagSet = new Set<string>();
  for (const text of Object.values(pageText)) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      tagSet.add(m[0]);
    }
  }

  const sources = new Set(result.pages.map((p) => p.source));
  const tagSource: PdfTagSource =
    tagSet.size === 0 ? 'none' : sources.has('ocr') ? 'ocr' : 'text-layer';

  const tagLocations = extractTagLocations(pageSpans);

  console.log(
    `[pdf-extractor] ${opts.filename ?? '<pdf>'}: ${tagSet.size} tags across ${pages.length} pages ` +
      `(sidecar ${result.elapsedMs}ms, total ${Date.now() - t0}ms, source=${tagSource}, anyOcr=${result.anyOcr})`,
  );

  return {
    pages,
    tags: [...tagSet].sort(),
    pageText,
    pageSpans,
    tagLocations,
    tagSource,
  };
}
