import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generateObject } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { isTag, TAGS } from '../tags';
import type { DocSlug } from '../docs';
import type {
  TagCategory,
  VisionDocResult,
  VisionPageResult,
  VisionTagEntry,
} from './vision-types';
import { getCached, putCached, sha256OfFile } from './vision-cache';

export const VISION_MODEL_ID = 'anthropic/claude-opus-4.7';

const PROMPT_TEMPLATE = `You are extracting engineering tag callouts from a single page of a P&ID, GA drawing, or instrument list PDF for a water-purification plant.

Return JSON conforming to the schema. For each formal tag callout visible on this page:

- rawTag: the exact tag string as printed (preserve case, dashes, slashes — e.g. "AE/TE-301", "RO-308", "P-501A").
- bbox: [x0, y0, x1, y1] in NORMALIZED coordinates, each value in the range 0..1. Origin is BOTTOM-LEFT of the page. x0 < x1, y0 < y1. Tight around the tag label or its enclosing balloon/box.
- category: one of "equipment" (pumps, tanks, filters, vessels), "instrument" (transmitters, switches, analyzers), "valve" (control / hand valves), "control" (PLCs, panels, junction boxes), or "unknown".
- confidence: self-assessed in 0..1.
- note (optional): one short phrase, e.g. "in chemical injection skid" or "row in instrument table".

Rules:
- One entry per visible tag callout. Do not invent tags that aren't on the page. Do not de-duplicate row instances on tabular pages (each row counts separately).
- If a tag appears both as a symbol and as a separate label, return both entries with separate bboxes.
- Skip generic labels like "PUMP", "RO SKID", "TANK" — only return formal tag strings (letters + dash + numbers, optionally with a letter suffix or slash).
- Return JSON only. Empty entries array is fine when no tags are visible.

Recognised tag prefixes for this corpus (hint — DO transcribe whatever you actually see):
PU, P, F, FH, CF, RO, TK, UV, IX, MDL, HE, IQ, AE, TE, FT, FE, PIT, LIT, LSL, PCV, CBV, HV, MCP, RIO, J-BOX.

Known tag whitelist (informational — return raw tags as seen, do NOT force into this list):
${TAGS.join(', ')}.`;

export const PROMPT_VERSION = createHash('sha256').update(PROMPT_TEMPLATE).digest('hex').slice(0, 8);

const CATEGORIES = ['equipment', 'instrument', 'valve', 'control', 'unknown'] as const;

const VisionEntrySchema = z.object({
  rawTag: z.string().min(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});

const VisionPageSchema = z.object({
  entries: z.array(VisionEntrySchema),
});

type RawEntry = z.infer<typeof VisionEntrySchema>;

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /401|403|unauthorized|forbidden|invalid api key|invalid auth/i.test(msg);
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate limit|too many requests/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Normalize a raw entry: rawTag → tag via isTag, drop low-confidence (< 0.3),
 * scale normalized bbox (0..1) to page points, defensively flip y if model
 * returned top-left origin.
 *
 *   normalized bbox [x0, y0, x1, y1]  (origin top-left OR bottom-left, 0..1)
 *           ▼
 *   clamp to [0, 1]^4
 *           ▼
 *   sort so x0<x1, y0<y1 (the model occasionally inverts)
 *           ▼
 *   scale to page points: x *= pageWidth, y *= pageHeight
 *           ▼
 *   (we keep the *normalized* origin convention — bottom-left — by trusting
 *   the prompt; downstream raster code can flip if needed)
 */
function normalizeEntry(raw: RawEntry, pageWidth: number, pageHeight: number): VisionTagEntry | null {
  if (raw.confidence < 0.3) return null;
  const [rx0, ry0, rx1, ry1] = raw.bbox.map(clamp01);
  const nx0 = Math.min(rx0, rx1);
  const nx1 = Math.max(rx0, rx1);
  const ny0 = Math.min(ry0, ry1);
  const ny1 = Math.max(ry0, ry1);
  const bbox: [number, number, number, number] = [
    nx0 * pageWidth,
    ny0 * pageHeight,
    nx1 * pageWidth,
    ny1 * pageHeight,
  ];
  return {
    rawTag: raw.rawTag,
    tag: isTag(raw.rawTag) ? raw.rawTag : null,
    bbox,
    category: raw.category as TagCategory,
    confidence: raw.confidence,
    note: raw.note,
  };
}

/**
 * Extract one page. Caller owns parallelism + caching. Throws AuthError on
 * 401/403 (the CLI should fail fast). Other failures return an empty page
 * with a note so callers can distinguish "no tags" from "extraction failed".
 */
export async function extractPage(
  pageBytes: Uint8Array,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Promise<VisionPageResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model: gateway(VISION_MODEL_ID),
        schema: VisionPageSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT_TEMPLATE },
              {
                type: 'file',
                data: pageBytes,
                mediaType: 'application/pdf',
              },
            ],
          },
        ],
      });
      const entries: VisionTagEntry[] = [];
      for (const raw of object.entries) {
        const norm = normalizeEntry(raw, pageWidth, pageHeight);
        if (norm) entries.push(norm);
      }
      return { pageNumber, pageWidth, pageHeight, entries };
    } catch (err) {
      lastErr = err;
      if (isAuthError(err)) {
        throw new AuthError(
          `AI Gateway auth failed (check AI_GATEWAY_API_KEY). Cause: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (isRateLimited(err) && attempt === 0) {
        await sleep(2000);
        continue;
      }
      break;
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  // eslint-disable-next-line no-console
  console.warn(`[vision] page ${pageNumber} extraction failed: ${reason}`);
  return {
    pageNumber,
    pageWidth,
    pageHeight,
    entries: [],
    note: 'extraction-failed',
  };
}

async function splitPage(srcBytes: Buffer, pageIndex: number): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const src = await PDFDocument.load(srcBytes);
  const page = src.getPage(pageIndex);
  const { width, height } = page.getSize();
  const dest = await PDFDocument.create();
  const [copied] = await dest.copyPages(src, [pageIndex]);
  dest.addPage(copied);
  const bytes = await dest.save();
  return { bytes, width, height };
}

async function boundedAll<T>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function pull(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  }
  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => pull());
  await Promise.all(lanes);
}

export type ExtractOpts = {
  concurrency?: number;
  force?: boolean;
  onPage?: (page: VisionPageResult) => void;
};

/**
 * Extract every page of a PDF. Returns the cached result if SHA + promptVersion
 * + modelId all match.
 *
 *   readFile + sha256 ─► cache.get ──HIT─► return
 *                          │
 *                          MISS
 *                          ▼
 *                  PDFDocument.load
 *                          │
 *                          ▼
 *           parallel (concurrency=4 default):
 *           ├── splitPage(i)  ─► one-page PDF bytes
 *           └── extractPage(bytes, i, w, h)
 *                          │
 *                          ▼
 *                  assemble VisionDocResult
 *                          │
 *                          ▼
 *                  cache.put (refuses >50% empty)
 */
export async function extractDoc(
  absFilePath: string,
  slug: DocSlug | null,
  opts: ExtractOpts = {},
): Promise<VisionDocResult> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY not set. Run `vercel env pull` to populate .env.local.');
  }
  const { concurrency = 4, force = false, onPage } = opts;
  const sha = await sha256OfFile(absFilePath);
  if (!force) {
    const cached = await getCached(sha, PROMPT_VERSION, VISION_MODEL_ID);
    if (cached) return cached;
  }
  const buf = await readFile(absFilePath);
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(buf);
  } catch (err) {
    throw new Error(`Failed to load ${absFilePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const pageCount = pdf.getPageCount();
  const pages: VisionPageResult[] = new Array(pageCount);
  const indices = Array.from({ length: pageCount }, (_, i) => i);
  await boundedAll(indices, concurrency, async (i) => {
    const { bytes, width, height } = await splitPage(buf, i);
    const page = await extractPage(bytes, i + 1, width, height);
    pages[i] = page;
    onPage?.(page);
  });
  const result: VisionDocResult = {
    filePath: absFilePath,
    fileSha: sha,
    slug,
    pages,
    extractedAt: Date.now(),
    promptVersion: PROMPT_VERSION,
    modelId: VISION_MODEL_ID,
  };
  await putCached(sha, result);
  return result;
}
