/**
 * Client for the Python pdf-extractor sidecar (see services/pdf-extractor/).
 *
 * The sidecar renders each page to a base64 JPEG, returns the embedded text
 * layer, and returns word-level spans (bboxes) from the text layer when one
 * exists. The orchestrator (pdf.ts) decides whether to use the text layer or
 * to send the image to Claude vision (vision-extractor.ts).
 */

export type ExtractedSpan = {
  text: string;
  /** [x0, y0, x1, y1] in PDF user-space points. */
  bbox: [number, number, number, number];
};

export type ExtractedPage = {
  number: number;
  /** PDF user-space points. */
  width: number;
  height: number;
  /** Base64-encoded JPEG of the rendered page. */
  imageB64: string;
  imageMime: string;
  /** Original PDF text layer. Empty string for raster pages. */
  textLayer: string;
  /** Word-level spans from the text layer. Empty array for raster pages. */
  spans: ExtractedSpan[];
  vectorPaths: number;
};

export type ExtractedPdf = {
  pageCount: number;
  pages: ExtractedPage[];
  elapsedMs: number;
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
      image_b64: string;
      image_mime: string;
      text_layer: string;
      spans: Array<{ text: string; bbox: number[] }>;
      vector_paths: number;
    }>;
    elapsed_ms: number;
  };

  const rawPages = json.pages ?? [];
  if (rawPages.length === 0 && json.page_count > 0) {
    throw new Error(
      'pdf-extractor returned page_count but no pages array — rebuild the sidecar: docker compose up -d --build pdf-extractor',
    );
  }

  return {
    pageCount: json.page_count,
    pages: rawPages.map((p) => ({
      number: p.number,
      width: p.width,
      height: p.height,
      imageB64: p.image_b64,
      imageMime: p.image_mime,
      textLayer: p.text_layer ?? '',
      spans: (p.spans ?? []).map((s) => ({
        text: s.text,
        bbox: [s.bbox[0], s.bbox[1], s.bbox[2], s.bbox[3]] as [number, number, number, number],
      })),
      vectorPaths: p.vector_paths ?? 0,
    })),
    elapsedMs: json.elapsed_ms,
  };
}
