/**
 * Client for the Python pdf-extractor sidecar (see services/pdf-extractor/).
 *
 * One round-trip returns per-page text + word bboxes + vector-path counts,
 * with Tesseract OCR fallback inside the sidecar for raster-only pages.
 * That replaces the old in-process pdfjs-dist + Claude vision two-pass.
 */

export type ExtractedSpan = {
  text: string;
  /** [x0, y0, x1, y1] in PDF user-space points. */
  bbox: [number, number, number, number];
};

export type ExtractedPage = {
  number: number;
  width: number;
  height: number;
  text: string;
  spans: ExtractedSpan[];
  vectorPaths: number;
  source: 'text' | 'ocr' | 'empty';
};

export type ExtractedPdf = {
  pageCount: number;
  pages: ExtractedPage[];
  elapsedMs: number;
  anyOcr: boolean;
};

// 127.0.0.1, not localhost — Node 18+ fetch resolves "localhost" to ::1 first,
// and Docker Desktop's IPv6 publish has been flaky on some setups.
const DEFAULT_URL = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 120_000;

export function getExtractorUrl(): string {
  return process.env.KORD_PDF_EXTRACTOR_URL ?? DEFAULT_URL;
}

export async function extractPdf(
  buf: Buffer,
  opts: { filename?: string; timeoutMs?: number } = {},
): Promise<ExtractedPdf> {
  const base = getExtractorUrl().replace(/\/+$/, '');
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buf)], { type: 'application/pdf' });
  form.append('file', blob, opts.filename ?? 'upload.pdf');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${base}/extract`, {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `pdf-extractor unreachable at ${base}: ${msg}. ` +
        `Start it with: docker compose up -d pdf-extractor`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`pdf-extractor ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    page_count: number;
    pages: Array<{
      number: number;
      width: number;
      height: number;
      text: string;
      spans: Array<{ text: string; bbox: number[] }>;
      vector_paths: number;
      source: ExtractedPage['source'];
    }>;
    elapsed_ms: number;
    any_ocr: boolean;
  };

  return {
    pageCount: json.page_count,
    pages: json.pages.map((p) => ({
      number: p.number,
      width: p.width,
      height: p.height,
      text: p.text,
      spans: p.spans.map((s) => ({
        text: s.text,
        bbox: [s.bbox[0], s.bbox[1], s.bbox[2], s.bbox[3]],
      })),
      vectorPaths: p.vector_paths,
      source: p.source,
    })),
    elapsedMs: json.elapsed_ms,
    anyOcr: json.any_ocr,
  };
}
