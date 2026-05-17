import { tagRegex, tagToSlug, isLikelyTag } from '../tagRegex';
import { extractPdf, type ExtractedSpan } from './pdf-extractor-client';
import { extractPageWithVision, type TagKind } from './vision-extractor';

export type PdfPageInfo = { number: number; width: number; height: number };

export type PdfTagSource = 'text-layer' | 'vision' | 'mixed' | 'none';

export type PdfPageEvent = {
  page: number;
  tags: string[];
  summary: string;
  source: 'text-layer' | 'vision' | 'vision-failed';
};

export type PdfTagLocation = {
  page: number;
  bbox: [number, number, number, number];
};

/** tagSlug → every place that tag appears in this PDF (text-layer pages only). */
export type PdfTagLocations = Record<string, PdfTagLocation[]>;

export type PdfDocInfo = {
  pages: PdfPageInfo[];
  /** Union of distinct tags across all pages. */
  tags: string[];
  tagsByPage: Record<number, string[]>;
  kindsByTag: Record<string, TagKind>;
  /** Free-text spec/description for each tag, when Claude found one. */
  descriptionsByTag: Record<string, string>;
  summaryByPage: Record<number, string>;
  /**
   * Per-tag pages + bboxes from the text layer. Empty for raster pages — Claude
   * vision doesn't return bboxes, so click-to-highlight in the PDF viewer is a
   * text-layer-only feature.
   */
  tagLocations: PdfTagLocations;
  tagSource: PdfTagSource;
};

const VISION_ENABLED = (process.env.KORD_VISION_ENABLED ?? 'true').toLowerCase() !== 'false';

function tagsFromText(text: string): string[] {
  const re = tagRegex();
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    set.add(m[0]);
  }
  return [...set];
}

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
  opts: {
    filename?: string;
    onPageDone?: (ev: PdfPageEvent) => void | Promise<void>;
    /** Skip the vision call entirely. Used by cache reload paths so a
     *  server restart doesn't re-pay the API cost for already-ingested PDFs. */
    skipVision?: boolean;
  } = {},
): Promise<PdfDocInfo> {
  const t0 = Date.now();
  const extracted = await extractPdf(buf, { filename: opts.filename });

  const pages: PdfPageInfo[] = extracted.pages.map((p) => ({
    number: p.number,
    width: p.width,
    height: p.height,
  }));

  // Collect text-layer spans up front; we need them for tagLocations whether
  // vision runs or not.
  const pageSpans: Record<number, ExtractedSpan[]> = {};
  for (const p of extracted.pages) pageSpans[p.number] = p.spans;

  if (opts.skipVision) {
    return {
      pages,
      tags: [],
      tagsByPage: {},
      kindsByTag: {},
      descriptionsByTag: {},
      summaryByPage: {},
      tagLocations: extractTagLocations(pageSpans),
      tagSource: 'none',
    };
  }

  const perPage = await Promise.all(
    extracted.pages.map(async (p): Promise<PdfPageEvent> => {
      // Text-layer fast path — searchable PDFs (e.g. CAD-exported with text)
      // skip the API call entirely.
      const textTags = tagsFromText(p.textLayer);
      if (textTags.length > 0) {
        const ev: PdfPageEvent = {
          page: p.number,
          tags: textTags,
          summary: '',
          source: 'text-layer',
        };
        try { await opts.onPageDone?.(ev); } catch {}
        return ev;
      }

      if (!VISION_ENABLED) {
        const ev: PdfPageEvent = {
          page: p.number,
          tags: [],
          summary: '',
          source: 'vision-failed',
        };
        try { await opts.onPageDone?.(ev); } catch {}
        return ev;
      }

      // Vision path — raster PDFs (most P&IDs) go here.
      try {
        const v = await extractPageWithVision({
          pageNumber: p.number,
          imageB64: p.imageB64,
          imageMime: p.imageMime,
          filename: opts.filename ?? 'upload.pdf',
          totalPages: extracted.pageCount,
        });
        // Filter Claude's output through the regex so 2-letter generic
        // instrument types ("CV", "AT") and stray words don't pollute the
        // graph. The regex is the source of truth for "what counts as a tag."
        const filtered = new Map<string, TagKind>();
        const descriptions = new Map<string, string>();
        for (const t of v.tags) {
          if (!isLikelyTag(t.tag)) continue;
          if (!filtered.has(t.tag)) filtered.set(t.tag, t.kind);
          if (t.description && !descriptions.has(t.tag)) {
            descriptions.set(t.tag, t.description.trim());
          }
        }
        const ev: PdfPageEvent = {
          page: p.number,
          tags: [...filtered.keys()],
          summary: v.summary,
          source: 'vision',
        };
        // Stash kinds + descriptions on the event so the orchestrator can persist them.
        const stash = ev as PdfPageEvent & {
          kinds?: Record<string, TagKind>;
          descriptions?: Record<string, string>;
        };
        stash.kinds = Object.fromEntries(filtered);
        stash.descriptions = Object.fromEntries(descriptions);
        try { await opts.onPageDone?.(ev); } catch {}
        return ev;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[vision] page ${p.number} failed: ${msg}`);
        const ev: PdfPageEvent = {
          page: p.number,
          tags: [],
          summary: '',
          source: 'vision-failed',
        };
        try { await opts.onPageDone?.(ev); } catch {}
        return ev;
      }
    }),
  );

  const tagsByPage: Record<number, string[]> = {};
  const summaryByPage: Record<number, string> = {};
  const kindsByTag: Record<string, TagKind> = {};
  const descriptionsByTag: Record<string, string> = {};
  const allTags = new Set<string>();
  const sources = new Set<string>();

  for (const r of perPage) {
    tagsByPage[r.page] = r.tags;
    summaryByPage[r.page] = r.summary;
    sources.add(r.source);
    const stash = r as PdfPageEvent & {
      kinds?: Record<string, TagKind>;
      descriptions?: Record<string, string>;
    };
    const kinds = stash.kinds ?? {};
    const descriptions = stash.descriptions ?? {};
    for (const t of r.tags) {
      allTags.add(t);
      if (kinds[t] && !kindsByTag[t]) kindsByTag[t] = kinds[t];
      if (descriptions[t] && !descriptionsByTag[t]) descriptionsByTag[t] = descriptions[t];
    }
  }

  let tagSource: PdfTagSource = 'none';
  if (allTags.size > 0) {
    if (sources.has('text-layer') && sources.has('vision')) tagSource = 'mixed';
    else if (sources.has('vision')) tagSource = 'vision';
    else if (sources.has('text-layer')) tagSource = 'text-layer';
  }

  const tagLocations = extractTagLocations(pageSpans);

  console.log(
    `[pdf-extractor] ${opts.filename ?? '<pdf>'}: ${allTags.size} tags across ${pages.length} pages ` +
      `(sidecar ${extracted.elapsedMs}ms, total ${Date.now() - t0}ms, source=${tagSource})`,
  );

  return {
    pages,
    tags: [...allTags].sort(),
    tagsByPage,
    kindsByTag,
    descriptionsByTag,
    summaryByPage,
    tagLocations,
    tagSource,
  };
}
