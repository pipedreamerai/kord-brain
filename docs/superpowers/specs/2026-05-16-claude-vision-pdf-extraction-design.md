# Claude-Vision PDF Extraction — Design

**Status:** Draft for plan-eng-review.
**Author:** Chris + Claude.
**Date:** 2026-05-16 (hackathon demo day).

## Problem

Current `pdf-extractor` sidecar uses Tesseract (via PyMuPDF `textpage_ocr`) at 300 DPI for raster PDFs. On `PID.pdf` — a 4-page Evoqua P&ID — only **7 of ~30+ visible engineering tags** survive OCR → regex. The tags inside instrument balloons (`HV-201..207`, `PI-202`, `PI-203`) come out as `(YG`, `Ges)`, `rrewa(i|)`, etc. Tesseract has hit its ceiling on technical drawings.

## Goal

Replace Tesseract with **Claude Sonnet 4.6 vision** (via Vercel AI Gateway), running **pages in parallel** and **streaming results into gbrain** so the graph animates in as pages return. Target: capture all visible engineering tags on `PID.pdf` (expect 20+).

## Non-goals

- Replacing the DOCX/XLSX ingestion paths (they have real text layers; already fine).
- Re-running vision on PDFs that already have a text layer (use it directly — saves cost + latency).
- Changing `tagRegex.ts` (it's correct; the bottleneck is what feeds it). It stays as a backup for text-layer pages.
- Building a full eval harness. Manual verification against `PID.pdf` and the `debug/` set is sufficient for the demo.
- A new UI for per-page progress. Re-fetching `/api/graph` after each page_done is enough — the graph already animates.

## Architecture

### Before
```
upload → sidecar (Tesseract @ 300 DPI) → text + word spans
       → tagRegex on text → tags
       → pushToGbrain (sequential, all-or-nothing)
       → client refetches /api/graph after the whole upload finishes
```

### After
```
upload → sidecar (PyMuPDF render only) → per-page JPEG (base64) + text_layer
       → for each page in parallel:
            ├─ if text_layer has tags via regex → use those (skip Claude)
            └─ else → call Claude Sonnet 4.6 vision via AI Gateway
       → as each page returns: push tag pages + doc-mention links into gbrain
       → SSE event back to client; client refetches /api/graph after each event
```

## Component-by-component

### 1. `services/pdf-extractor/main.py` — render-only sidecar

- Drop the Tesseract code path. `_extract_page` becomes pure rendering.
- Render with PyMuPDF: `page.get_pixmap(matrix=fitz.Matrix(scale, scale))` where `scale` is chosen so the long edge ≈ `RENDER_LONG_EDGE_PX` (default **4800 px** — chosen per plan-eng-review D2 to give Claude headroom after its internal downscaling on a 36″ sheet).
- Output JPEG bytes via `pixmap.tobytes("jpeg", jpg_quality=85)`, base64-encode.
- Also return `text_layer = page.get_text("text")` (no OCR call). Empty string for raster pages.
- Keep `vector_paths = len(page.get_drawings())` — useful for telemetry.

**New `PageOut`:**
```python
class PageOut(BaseModel):
    number: int
    width: float          # PDF user-space points
    height: float
    image_b64: str        # JPEG, long-edge 3200, base64
    image_mime: str       # "image/jpeg"
    text_layer: str       # empty for raster PDFs
    vector_paths: int
```

**Dockerfile:** drop `tesseract-ocr`, `tesseract-ocr-eng`, `tesseract-ocr-osd`, `libtesseract5`, `TESSDATA_PREFIX`. Smaller image, faster cold start.

**Env knobs:**
- `PDF_RENDER_LONG_EDGE_PX` (default `4800`)
- `PDF_RENDER_JPEG_QUALITY` (default `82` — slightly lower than the prior 85 to keep payload under ~6 MB after the resolution bump)
- `PDF_MAX_BYTES` (unchanged, 100 MB cap)

### 2. `src/lib/ingestion/pdf-extractor-client.ts` — updated schema

- `ExtractedPage` shape:
  ```ts
  type ExtractedPage = {
    number: number;
    width: number;
    height: number;
    imageB64: string;
    imageMime: string;          // "image/jpeg"
    textLayer: string;
    vectorPaths: number;
  };
  ```
- Drop `source` (no more OCR/text distinction in the sidecar — that decision moves to Node).
- Drop `spans` (never consumed by any caller; confirmed via grep).

### 3. `src/lib/ingestion/vision-extractor.ts` — NEW

Per-page Claude vision call.

```ts
import { gateway } from '@ai-sdk/gateway';
import { generateObject } from 'ai';
import { z } from 'zod';

const TagSchema = z.object({
  tag: z.string()
    .describe('Engineering tag as printed, original casing (e.g. "HV-201", "AE/TE-301", "FH-200").'),
  kind: z.enum([
    'instrument', 'valve', 'pump', 'vessel', 'filter',
    'heat_exchanger', 'piping_spec', 'equipment', 'other',
  ]).describe('Best-guess category.'),
  page: z.number().int().positive(),
});

const PageSchema = z.object({
  title: z.string().optional().describe('Drawing title block / sheet name if visible.'),
  summary: z.string().describe(
    '1–2 sentence summary of what this page depicts. Mention the dominant equipment and process flow.',
  ),
  tags: z.array(TagSchema),
});

export type VisionPageResult = z.infer<typeof PageSchema>;

export async function extractPageWithVision(args: {
  pageNumber: number;
  imageB64: string;
  imageMime: string;
  filename: string;
  totalPages: number;
}): Promise<VisionPageResult> {
  const { object } = await generateObject({
    model: gateway('anthropic/claude-sonnet-4-6'),
    schema: PageSchema,
    system: VISION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `File: ${args.filename}, page ${args.pageNumber} of ${args.totalPages}.` },
        { type: 'image', image: `data:${args.imageMime};base64,${args.imageB64}` },
      ],
    }],
    maxRetries: 2,
  });
  return { ...object, tags: object.tags.map(t => ({ ...t, page: args.pageNumber })) };
}
```

**System prompt (sketch):** "You read engineering drawings (P&IDs, GAs, instrument lists, RFQs). Extract every visible engineering tag — instrument balloons (HV-201, PI-203, AE/TE-301), equipment tags (FH-200, CF-200/201), pump/vessel tags. Use original casing exactly as printed. Skip line specs like `3" PVC` (we capture those separately). If a tag is ambiguous, return your best guess and lower `kind` confidence to `other`. Return `summary` as 1–2 sentences."

**Failure modes are caller's responsibility** — see § Edge cases.

### 4. `src/lib/ingestion/pdf.ts` — orchestrator

New `loadPdf` flow:

```ts
export type PdfDocInfo = {
  pages: PdfPageInfo[];
  tags: string[];                                  // union across pages
  tagsByPage: Record<number, string[]>;
  kindsByTag: Record<string, string>;              // 'HV-201' → 'valve'
  summaryByPage: Record<number, string>;
  tagSource: 'text-layer' | 'vision' | 'mixed' | 'none';
};

export async function loadPdf(buf: Buffer, opts: { filename?: string; onPageDone?: (ev: PageDoneEvent) => void | Promise<void>; } = {}): Promise<PdfDocInfo> {
  const extracted = await extractPdf(buf, { filename: opts.filename });

  const perPage = await Promise.all(
    extracted.pages.map(async (p) => {
      // Text-layer fast path
      const textTags = tagsFromText(p.textLayer);
      if (textTags.length > 0) {
        return { page: p.number, tags: textTags, kinds: {}, summary: '', source: 'text-layer' as const };
      }
      // Vision path
      try {
        const v = await extractPageWithVision({ /* args */ });
        const tagList = v.tags.map(t => t.tag);
        const kinds = Object.fromEntries(v.tags.map(t => [t.tag, t.kind]));
        await opts.onPageDone?.({ page: p.number, tags: tagList, summary: v.summary });
        return { page: p.number, tags: tagList, kinds, summary: v.summary, source: 'vision' as const };
      } catch (err) {
        console.warn(`[vision] page ${p.number} failed: ${(err as Error).message}`);
        return { page: p.number, tags: [], kinds: {}, summary: '', source: 'vision-failed' as const };
      }
    }),
  );

  // dedupe + merge into PdfDocInfo
}
```

Notes:
- `Promise.all` is the parallelization. Concurrency = page count; for normal docs (≤ 8 pages) that's fine. If a doc has 100 pages we'd want a concurrency cap — out of scope for the hackathon.
- `onPageDone` is the streaming hook. Called *after* the vision call resolves but *before* the function returns the doc-level result, so the SSE route can push to gbrain and emit a client event immediately.
- Text-layer fast path also triggers `onPageDone` so the client sees progress for searchable PDFs too.
- `kindsByTag` collisions: if two pages give the same tag different kinds, keep the first non-`other`. Cheap; good enough.

### 5. `src/lib/uploads.ts` — gbrain push with kinds + summaries

- `parseFile` for PDF now also returns `kindsByTag` and `summaryByPage` (extend `UploadPdfPayload` — but be careful, `payload` is persisted in `.meta.json`. Either keep payload small and stash kinds in `doc.tags` adjacent fields, or persist them inside payload. **Decision: persist `kinds: Record<tag,kind>` and `summaryByPage` on `UploadPdfPayload`** — this is what powers nicer tag/doc pages.
- `buildDocMarkdown`: include per-page summaries.
- `buildTagMarkdown`: include `kind` frontmatter when known.
- `pushToGbrain`: unchanged in structure; just uses the richer markdown.

### 6. `src/app/api/uploads/route.ts` — SSE stream

Switch from JSON to SSE:

```ts
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const entries = form.getAll('files').filter((e): e is File => e instanceof File);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      for (const file of entries) {
        send({ type: 'file_start', name: file.name });
        try {
          const buf = Buffer.from(await file.arrayBuffer());
          await ingestUpload(file.name, buf, {
            onPageDone: (ev) => send({ type: 'page_done', name: file.name, ...ev }),
            onMeta: (m) => send({ type: 'file_meta', name: file.name, ...m }),
          });
          send({ type: 'file_done', name: file.name });
        } catch (err) {
          send({ type: 'file_error', name: file.name, message: err instanceof Error ? err.message : String(err) });
        }
      }
      send({ type: 'all_done' });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

`ingestUpload` gains an `opts: { onPageDone, onMeta }` parameter that it forwards into `loadPdf`. After `loadPdf` returns, the *full* doc-level push to gbrain happens; the `onPageDone` calls handle the per-page graph deltas.

**Server-side gbrain pushes per page** (so the graph grows live, not just after `file_done`):
- `onPageDone({page, tags})` triggers an incremental push: for each tag, upsert the tag page with `mentions: [docSlug]` and call `gbrain.link(docSlug, tagSlug, 'mentions')`.
- The final `pushToGbrain` at the end of `ingestUpload` becomes a "rewrite the doc page with everything, no-op on tag pages we already wrote" pass — safe because we already re-read existing mentions in `pushToGbrain`.
- The doc page itself can be written eagerly on first `page_done` so the doc node shows up in the graph immediately (with empty mentions; rewritten at the end).

### 7. `src/lib/appStore.ts` — SSE reader

```ts
uploadFiles: async (files) => {
  set({ uploading: true, uploadError: null });
  try {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    const res = await fetch('/api/uploads', { method: 'POST', body: form });
    if (!res.ok || !res.body) throw new Error(`upload HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, i).trim();
        buf = buf.slice(i + 2);
        if (!chunk.startsWith('data:')) continue;
        const ev = JSON.parse(chunk.slice(5).trim());
        if (ev.type === 'page_done' || ev.type === 'file_done') {
          void get().refreshGraph();
        }
        if (ev.type === 'file_error') {
          set({ uploadError: `${ev.name}: ${ev.message}` });
        }
      }
    }
    // Final reconciliation
    const r = await fetch('/api/uploads'); // GET (still JSON)
    const data = await r.json();
    set({ docs: data.docs, lastUploadCount: files.length });
    await get().refreshGraph();
  } catch (err) {
    set({ uploadError: err instanceof Error ? err.message : String(err) });
  } finally {
    set({ uploading: false });
  }
},
```

Throttling: `refreshGraph` fires on every `page_done`. For a 4-page doc that's 4 graph refetches in ~6s — fine. If a doc has many pages, debounce inside `refreshGraph` (a trailing 250 ms debounce keyed on "any pending"). **Decision: leave un-debounced for now; revisit only if it actually flickers.**

### 8. `.env.example` / docs

- `.env.local` already has `AI_GATEWAY_API_KEY` for the chat route — same key powers vision.
- Add a `KORD_VISION_MODEL` env (default `anthropic/claude-sonnet-4-6`) so we can swap to Opus or a smaller model without code change. Also `KORD_VISION_ENABLED=true|false` — when `false`, fall back to text-layer only (degrades gracefully, useful for offline dev / cost protection).

## Data flow

```
Browser uploadFiles([PID.pdf])
  │
  ├─ POST /api/uploads (FormData)
  │
Server:
  ├─ ingestUpload(PID.pdf):
  │   ├─ sidecar.extract → 4 pages w/ JPEG + (empty) text_layer
  │   ├─ emit 'file_start'
  │   ├─ write doc page (empty mentions) to gbrain → graph shows isolated node
  │   ├─ Promise.all over pages:
  │   │     page 1: vision → {tags: [HV-201, HV-202, PI-202, PI-203, FH-200, CF-200, ...]}
  │   │            → upsert tag pages, link doc→tag
  │   │            → emit 'page_done' {page:1, tags:[...]}
  │   │     page 2: ditto (in parallel)
  │   │     ...
  │   ├─ rewrite doc page w/ full tags
  │   └─ emit 'file_done'
  └─ stream closes
Client:
  ├─ on each 'page_done': refreshGraph()  → graph animates in tags
  └─ on 'all_done': final refreshGraph()
```

## Edge cases & failure modes

| # | Case | Handling |
|---|------|----------|
| 1 | AI Gateway 5xx / network error | per-page try/catch logs warning, emits `page_done` with `tags: []` and `source: 'vision-failed'`. Other pages still proceed. No crash. |
| 2 | Claude returns malformed object | `generateObject` + Zod retries up to `maxRetries: 2`; if it still fails, treat as #1. |
| 3 | PDF has 100+ pages | Concurrency cap: limit `Promise.all` to N=8 in-flight via a simple semaphore. Demo docs are all ≤ 8 pages. |
| 4 | Text-layer present but partial (e.g. titleblock has text, drawing area is raster) | Run vision *and* text-layer regex on the page, union the results. Decision: **start with the simple "if any text-layer tags, skip vision" rule** and revisit if we see this in `debug/` PDFs. |
| 5 | Image too large for API | After base64 encoding, check size. If > 5 MB, re-render at lower scale (long-edge 2400, then 1800). Fail open. |
| 6 | API key missing | `vision-extractor` throws "AI_GATEWAY_API_KEY not set" on first call; surfaces as page-level failure (#1). Preflight could check it too. |
| 7 | Concurrent uploads | Each is its own SSE response. gbrain CLI calls serialize via `execFile`. Tag-page upserts use the existing read-then-write pattern in `pushToGbrain`, which already handles concurrent mentions correctly. |
| 8 | Streaming client disconnects mid-upload | Server keeps writing to gbrain (write-through). On next page load, `/api/reset` wipes anyway. Acceptable. |
| 9 | Duplicate tags across pages | `Set` dedup at the doc level. `kindsByTag` keeps first non-`other` value. |
| 10 | Claude hallucinates a tag that isn't on the page | Cheap defense: post-filter via `isLikelyTag()` from `tagRegex.ts`. Anything that doesn't match the regex shape gets dropped. Eats the long-tail of `J-BOX` etc. that's allowed by the regex but blocks free-form noise. |
| 11 | Vision returns slightly-wrong casing (`hv-201` vs `HV-201`) | Normalize: `tag.toUpperCase()` for the prefix before the dash, keep the rest. Or just round-trip via `tagToSlug` for dedup and use original casing for display. |
| 12 | `sidecar` returns image but image is blank (corrupt PDF page) | Vision will return `tags: []` — equivalent to no-op. No special handling needed. |

## Cost / latency budget

- **Per page:** ~1 image (~150–400 KB JPEG) + ~300-token system prompt + ~200-token user → ~1.5k input tokens. Output ~300 tokens. Claude Sonnet 4.6 ≈ **$0.005 / page** input + **$0.005 / page** output → **~$0.01 / page**.
- **PID.pdf (4 pages, parallel):** ~$0.04, wall-clock ~6–8 s.
- **Full PID.pdf (8 pages, parallel):** ~$0.08, wall-clock ~7–10 s.
- **Acceptance criteria for the demo:** at most $0.20 per upload session of typical docs. Safe.

## Test plan

Manual verification only (per plan-eng-review D3: this repo has no test infra and standing it up trades hackathon impl time for marginal benefit on code that depends on a live external API). Add a post-demo TODO: scaffold vitest and write a smoke test for `extractPageWithVision` against a fixture image.

1. **`PID.pdf`** — expect ≥ 20 distinct tags (was 7). Confirm `HV-201..207`, `PI-202`, `PI-203`, `FH-200`, `CF-200/201` are all present.
2. **`debug/Full PID.pdf`** — 8-page version. Confirm parallelization (wall-clock close to slowest single page, not 8×).
3. **`debug/Instrument List.pdf`** — likely text-layer. Confirm vision is skipped (logs show `source=text-layer`).
4. **`debug/RFQ.pdf`** — text-heavy. Confirm fast path; few-to-zero vision calls.
5. **DOCX + XLSX upload** — unchanged behavior.
6. **Concurrent uploads** of two PDFs — both succeed; graph reflects both.
7. **API key removed** — clean error in event stream, app doesn't hang or crash.
8. **`docker compose stop pdf-extractor`** then upload — existing preflight should catch it; manual fallback message is fine.
9. **Reset button** during upload — server keeps running but client moves on; the residual pages from interrupted upload don't survive `wipeAndInit`.

## Files touched

| File | Change |
|------|--------|
| `services/pdf-extractor/main.py` | Replace OCR with JPEG render; new schema. |
| `services/pdf-extractor/Dockerfile` | Drop Tesseract packages. |
| `src/lib/ingestion/pdf-extractor-client.ts` | New schema; drop spans/source. |
| `src/lib/ingestion/vision-extractor.ts` | **NEW.** Claude Sonnet 4.6 via AI Gateway. |
| `src/lib/ingestion/pdf.ts` | Per-page parallel: text-layer vs vision; `onPageDone`. |
| `src/lib/uploads.ts` | Carry `kinds`/`summary`; richer page markdown; `onPageDone`/`onMeta` opts. |
| `src/app/api/uploads/route.ts` | POST → SSE stream. GET stays JSON. |
| `src/lib/appStore.ts` | Read SSE stream; incremental graph refresh. |
| `.env.example` | Document `KORD_VISION_MODEL`, `KORD_VISION_ENABLED`. |
| `CLAUDE.md` | Update sidecar description (no longer Tesseract); note vision pipeline. |

## Open questions for eng review

1. ~~**Image format & size.**~~ **Resolved (D2):** default to 4800 px long-edge JPEG @ q=82. No zero-tag retry path.
2. **Should we keep Tesseract as a fallback** for when AI Gateway is unreachable? Adds complexity (and ~250 MB to the image). Argument for: demo robustness. Argument against: if AI Gateway is down, the chat route is also broken — the demo is over. Lean **against**.
3. **Per-page gbrain push or doc-level only?** The plan pushes per page so the graph animates. Tradeoff: tag pages get rewritten N times during an upload (once per page that mentions them). For small docs that's fine; for big docs that's wasted CLI exec time. Cap by batching per "tick"?
4. **Concurrency cap.** Should `Promise.all` over pages be capped at N=8 (semaphore)? Adds code; never tested with a 100-page PDF. Keep simple for now?
5. **Confidence in `kind`.** The schema enum forces a category. Should `kind` be optional (`null` allowed)? Otherwise the model is mildly pressured to pick.
6. **Line specs (`3" PVC`, `1-1/2" FPT`).** Currently the regex ignores them. The vision prompt also excludes them. Worth capturing as a separate node-type so the graph shows "FH-200 is connected by 3″ PVC to CF-200"? Out of scope for this PR.
7. **CLAUDE.md note re "no Claude-vision upload."** That note describes the prior architecture; this PR intentionally reverses it. Update CLAUDE.md as part of this PR or separately?

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific
finding above.

- [ ] **T1 (P1, human: ~30min / CC: ~5min)** — pdf-extractor sidecar — Replace Tesseract OCR with JPEG render at 4800 px long-edge
  - Surfaced by: Architecture / D2 — instrument balloons need post-downscale headroom
  - Files: `services/pdf-extractor/main.py`, `services/pdf-extractor/Dockerfile`, `services/pdf-extractor/requirements.txt` (no new deps)
  - Verify: `curl -s -F file=@PID.pdf http://localhost:8765/extract | jq '.pages[0] | {number, width, height, source: .source // "n/a", image_len: (.image_b64 | length)}'`
- [ ] **T2 (P1, human: ~30min / CC: ~5min)** — ingestion — New `src/lib/ingestion/vision-extractor.ts` with Claude Sonnet 4.6 via AI Gateway + Zod schema
  - Surfaced by: core plan; AI Gateway is the new extraction engine
  - Files: `src/lib/ingestion/vision-extractor.ts` (NEW)
  - Verify: standalone tsx script that feeds one fixture PNG and prints the parsed tag list
- [ ] **T3 (P1, human: ~30min / CC: ~10min)** — ingestion — Rewire `pdf.ts` for per-page parallel + text-layer fast path + `onPageDone` callback
  - Surfaced by: core plan; parallelism + streaming hook
  - Files: `src/lib/ingestion/pdf-extractor-client.ts`, `src/lib/ingestion/pdf.ts`
  - Verify: upload `PID.pdf` via `pnpm dev`; expect ≥ 20 tags (was 7)
- [ ] **T4 (P2, human: ~20min / CC: ~5min)** — persistence — Carry per-tag `kind` and per-page `summary` through `uploads.ts` into gbrain page markdown
  - Surfaced by: core plan; richer tag/doc pages
  - Files: `src/lib/uploads.ts`, `src/lib/appStore.ts` (UploadPdfPayload type)
  - Verify: `gbrain get hv-201` after upload shows `kind: valve` frontmatter; `gbrain get pid` shows per-page summary in body
- [ ] **T5 (P1, human: ~40min / CC: ~10min)** — streaming — `POST /api/uploads` → SSE; client reads stream + refreshes graph incrementally
  - Surfaced by: core plan; demo-critical streaming arc
  - Files: `src/app/api/uploads/route.ts`, `src/lib/appStore.ts`
  - Verify: browser DevTools shows `text/event-stream` response with one `data:` event per page; graph updates between events
- [ ] **T6 (P3, human: ~5min / CC: ~2min)** — docs — Update `CLAUDE.md` sidecar description (no longer Tesseract) and `.env.example` (`KORD_VISION_MODEL`, `KORD_VISION_ENABLED`)
  - Surfaced by: Open Q #7
  - Files: `CLAUDE.md`, `.env.example`
- [ ] **T7 (P3, human: ~1h / CC: ~20min, POST-DEMO)** — testing — Scaffold vitest; add smoke test for `extractPageWithVision` against a balloon-crop fixture
  - Surfaced by: Test Review / D3 — deferred to post-demo
  - Files: `package.json`, `vitest.config.ts`, `src/lib/ingestion/vision-extractor.test.ts`

### Worktree parallelization

T1 (Python sidecar) and T2 (TS vision-extractor module) touch completely disjoint code — `services/pdf-extractor/` vs `src/lib/ingestion/`. They could run in parallel agent lanes. T3 depends on both (pulls in the new sidecar schema *and* calls the vision module). T4 + T5 can run in parallel after T3 (different files: `uploads.ts` + `route.ts` vs `appStore.ts` mostly).

| Step | Modules touched | Depends on |
|------|----------------|------------|
| T1 | `services/pdf-extractor/` | — |
| T2 | `src/lib/ingestion/vision-extractor.ts` | — |
| T3 | `src/lib/ingestion/pdf*.ts` | T1, T2 |
| T4 | `src/lib/uploads.ts`, `src/lib/appStore.ts` (types only) | T3 |
| T5 | `src/app/api/uploads/route.ts`, `src/lib/appStore.ts` (uploadFiles) | T3 |
| T6 | `CLAUDE.md`, `.env.example` | — |

Lanes: Lane A (T1) ∥ Lane B (T2) ∥ Lane C (T6) → join → T3 → Lane D (T4) ∥ Lane E (T5).

For a single-session implementation, sequencing is: T1 → T2 → T3 → T4 → T5 → T6, with manual verification after T3 (against `PID.pdf`) and after T5 (against `Full PID.pdf`).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 2 decisions, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**Decisions resolved:**
- **D1 (scope):** proceed with full plan (vision + parallel + SSE streaming + richer gbrain pages).
- **D2 (render resolution):** default `PDF_RENDER_LONG_EDGE_PX = 4800`, JPEG q=82, no zero-tag retry path.
- **D3 (test coverage):** manual verification only; vitest scaffold deferred as post-demo TODO (T7).

**Outside voice:** skipped (time-pressured hackathon demo, clean review).
**UNRESOLVED:** 0 decisions.
**VERDICT:** ENG CLEARED — ready to implement.
