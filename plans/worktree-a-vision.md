# Worktree A — Vision Pipeline (`feat/vision-extraction`)

**Goal:** Extract `(tag, page, bbox)` triples from every page of the bid + detailed-design PDFs using Claude Opus 4.7's native PDF vision, cache the results to disk keyed on file content, and expose a typed Node API consumed by Worktree B's `/api/packet/ingest` route.

**Source of truth contracts:** `plan.md` §1, §2 (parent plan); deviation from contract requires updating `plan.md` first.

**Companion docs read:** `plan.md`, `CLAUDE.md`, `TAGS.md`, `EXPECTED_INGESTION.md`, `src/lib/tags.ts`, `src/lib/docs.ts`, `src/lib/aiModels.ts`, `src/app/api/walkthrough/route.ts`, `src/lib/ingestion/pdf.ts`, `samples/bboxes.schema.json`.

---

## Scope (what's in / out)

**In:**
- Per-page PDF → JSON tag-with-bbox extraction via `anthropic/claude-opus-4.7` over Vercel AI Gateway.
- File-content-keyed disk cache so re-runs are instant and prompt iteration is cheap.
- CLI that walks `demo_docs/Bid/*.pdf` + `demo_docs/Detailed Design/*.pdf`, populates the cache, and prints a recall report.
- Typed export surface: `extractDoc(filePath, slug)` → `Promise<VisionDocResult>` for Worktree B to import.

**Out:**
- Server-side PDF rasterization for highlight rendering (Worktree B's `/api/render-page`).
- The 5 ingestion beats / NDJSON streaming (Worktree B).
- Any UI work (Worktree C).
- Embeddings / gbrain seeding (Wenny's track).
- Hand-tuning bbox sidecars; the existing `pid.bboxes.json` / `electrical.bboxes.json` / `Instrument List.bboxes.json` remain in place as ground-truth references the extractor's output is *compared against*, not replaced by.

---

## Architecture

```
extractDoc(absFilePath, slug?)
   │
   ├─► readFile + sha256(content)  ─────────► cacheKey = sha
   │
   ├─► cache.get(sha, promptVersion, modelId)
   │       │
   │       └── HIT → return cached VisionDocResult
   │
   ├─► pdfDoc = PDFDocument.load(buf)
   │
   ├─► for each page (concurrency: 4) in parallel:
   │       │
   │       ├─► clone single-page PDF via pdf-lib copyPages
   │       ├─► serialize → Uint8Array
   │       ├─► generateObject({
   │       │     model: gateway('anthropic/claude-opus-4.7'),
   │       │     schema: VisionPageSchema,
   │       │     messages: [{
   │       │       role: 'user',
   │       │       content: [
   │       │         { type: 'text', text: PROMPT },
   │       │         { type: 'file', data: pageBytes, mediaType: 'application/pdf' },
   │       │       ],
   │       │     }],
   │       │   })
   │       ├─► validate rawTag with isTag(); set tag=null if unknown but keep entry
   │       ├─► drop entries with confidence < 0.3
   │       └─► return VisionPageResult
   │
   ├─► assemble VisionDocResult
   ├─► cache.set(sha, promptVersion, modelId, result)
   └─► return result
```

Single-page sub-PDF strategy keeps each call small (one page is ~50–500 KB after re-serialization vs multi-page > 5 MB), avoids the model conflating page numbers, and lets us parallelize.

---

## File-by-file deliverables

### 1. `src/lib/ingestion/vision-types.ts` (NEW, ~50 LOC)

Copy of `plan.md` §1, slightly adapted to use the in-repo `Tag` + `DocSlug` types directly. No logic — pure type module. Worktrees B and C will create identical copies until merge-time dedup.

Exports: `TagCategory`, `VisionTagEntry`, `VisionPageResult`, `VisionDocResult`.

### 2. `src/lib/ingestion/vision.ts` (NEW, ~150 LOC)

```ts
export const PROMPT_VERSION = 'v1-2026-05-16';
export const VISION_MODEL_ID = 'anthropic/claude-opus-4.7';

export async function extractDoc(
  absFilePath: string,
  slug: DocSlug | null,
  opts?: { concurrency?: number; force?: boolean },
): Promise<VisionDocResult>;

export async function extractPage(
  pageBytes: Uint8Array,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Promise<VisionPageResult>;
```

Key implementation details:

- **Model & SDK:** `gateway('anthropic/claude-opus-4.7')` from `@ai-sdk/gateway` + `generateObject` from `ai` (NOT `streamObject` — we want the full validated object back per page, not a token stream).
- **Zod schema** mirroring `VisionPageResult` enforces structured output. `rawTag` is `z.string()` (NOT the `Tag` enum) because we explicitly want to capture hallucinations to filter them, not throw on them. Validation collapses to `tag: null` for unknown rawTags.
- **PDF page split:** `await PDFDocument.create()` then `await dest.copyPages(src, [i])` then `dest.save({ updateMetadata: false })`. `updateMetadata: false` keeps SHAs stable across re-runs of the same input. Each per-page PDF is sent inline (not via a temp file).
- **Concurrency:** simple bounded parallel map — 4 in flight by default. Avoids gateway 429s and keeps wall-time predictable. Configurable via opts.
- **Page-result shape:** even on zero detections, return `{ pageNumber, pageWidth, pageHeight, entries: [] }` — downstream code expects one entry per page.
- **Coordinate system:** prompt requests `[x0, y0, x1, y1]` in **PDF user-space points, origin bottom-left** to match the existing `bboxes.schema.json` convention. We pass page width/height in points to the prompt so the model has the right scale anchor. (See "Open design question #1" below — this is the riskiest assumption.)
- **Error handling:** per-page failures don't abort the doc — log + return an empty `entries: []` for that page with a console warning. The CLI's recall report will surface failures.
- **No env-var reads inside `extractPage`** — the caller (CLI or API route) is responsible for confirming `AI_GATEWAY_API_KEY` exists. We throw a clear error at module top of `extractDoc` if it's missing.

### 3. `src/lib/ingestion/vision-cache.ts` (NEW, ~60 LOC)

```ts
export async function getCached(
  sha: string,
  promptVersion: string,
  modelId: string,
): Promise<VisionDocResult | null>;

export async function putCached(
  sha: string,
  result: VisionDocResult,   // already carries promptVersion + modelId
): Promise<void>;

export async function sha256OfFile(absPath: string): Promise<string>;
```

- **Disk layout:** `samples/derived/vision-cache/<sha>.<promptVersion>.<modelIdSlug>.json` — three keys in the filename so prompt-version or model-version bumps don't shadow older results (we keep both to enable A/B comparison).
- **modelIdSlug:** replace `/` with `__` in `modelId` for filesystem safety.
- **No locking** — cache writes are atomic via write-tmp-then-rename. Concurrent writers for the same key are fine (last write wins).
- **Eviction:** none. The cache is hackathon-scope; manual `rm -rf samples/derived/` is the recovery path.

### 4. `scripts/extract-bid-bboxes.ts` (NEW, ~120 LOC)

CLI run via `pnpm tsx scripts/extract-bid-bboxes.ts [--force] [--only=<slug>]`.

Behavior:

1. Iterate over `DOCS` filtered to `kind === 'pdf'`.
2. For each, resolve the absolute path via `path.join('demo_docs', d.filePath)`.
3. Call `extractDoc(abs, d.slug, { force })`.
4. Print a per-doc summary: `bid_pid → 4 pages, 47 tags found, 38 valid (isTag), 12 unique tags`.
5. Hero-tag recall check for `bid_pid` page 4: expected = `['PU-01','PU-02','RO-01','RO-02','RO-03','RO-04','RO-05','RO-06','RO-07','RO-08','RO-09','RO-10','RO-11','F-01','TK-01']`. Print `RECALL: 13/15 (87%)` and list the misses by name. PASS gate: ≥ 50% (per plan.md). Below that, print `❌ RECALL TOO LOW — iterate prompt before merging`.
6. Exit code 0 on PASS, 1 on FAIL, 2 on hard error (env missing, file not found).

Flags:
- `--force` → invalidates cache, re-extracts.
- `--only=<slug>` → e.g. `--only=bid_pid` for fast prompt iteration on a single doc.

### 5. `.gitignore` (MODIFY, +2 lines)

```
samples/derived/
samples/uploaded/
```

---

## The prompt (initial draft — iterate against bid PID p4)

```
You are extracting engineering tag callouts from a single page of a P&ID, GA drawing, or instrument list PDF for a water-purification plant.

The page is {{pageWidth}} × {{pageHeight}} PDF points (origin bottom-left).

Return JSON conforming to the provided schema. For each tag callout you can see on this page:
- rawTag: the exact tag string as printed (preserve case, dashes, slashes — e.g. "AE/TE-301", "RO-308", "P-501A").
- bbox: [x0, y0, x1, y1] in PDF points, origin bottom-left, tight around the tag label or its enclosing balloon/box.
- category: "equipment" (pumps, tanks, filters, vessels) | "instrument" (transmitters, switches, analyzers) | "valve" (control / hand valves) | "control" (PLCs, panels, junction boxes) | "unknown".
- confidence: 0-1 self-assessed.
- note (optional): one short phrase, e.g. "in chemical injection skid" or "row in instrument table".

Rules:
- ONE entry per visible tag callout. Do not invent tags that aren't on the page. Do not de-duplicate row instances on tabular pages (each row counts separately).
- If a tag appears in both a symbol and a separate label, return both entries (separate bboxes).
- Skip generic labels like "PUMP", "RO SKID", "TANK" — only return formal tag strings (letters + dash + numbers, optionally with a letter suffix or slash).
- Return JSON only. No prose. Empty entries array is fine.

Recognised tag prefixes for this corpus (use as a hint, but DO transcribe whatever you actually see):
PU, P, F, FH, CF, RO, TK, UV, IX, MDL, HE, IQ, AE, TE, FT, FE, PIT, LIT, LSL, PCV, CBV, HV, MCP, RIO, J-BOX
```

Iteration target: bid PID p4 finds ≥ 50% of `['PU-01','PU-02','RO-01..RO-08','RO-09..RO-11','F-01','TK-01']` with bboxes within ±10% of correct. Chris audits visually in the checkpoint.

---

## Open design questions (flagged for plan-eng-review)

**Q1. Coordinate system: will Claude actually return points, or pixels of an internal raster?**
This is the biggest unknown. Claude's PDF vision internally rasterizes pages; coordinate output may be in image-pixel space, not PDF points. Mitigations on the table:
- **A) Trust the prompt + verify on p4.** Tell the model the page is W×H points and ask for points. If returned coords look like pixels (max ≈ 1000–2000), apply a uniform scale fix `(W/maxX, H/maxY)` once we've eyeballed one page.
- **B) Ask for normalized 0–1 floats** then multiply by `(pageWidth, pageHeight)` in code. Removes the scale ambiguity entirely.
- **C) Hand-flip Y.** Some vision models default to top-left origin. The prompt forces bottom-left; if returns look inverted, we flip `y = pageHeight - y`.

**Default decision:** ship **(A)** behind a `BBOX_COORDS` env-var that can flip to `(B)` if p4 misbehaves. Recall report doubles as the coordinate-sanity check (a hero tag's bbox center should fall within the page bounds and roughly in the upper-right RO area on p4).

**Q2. Does `@ai-sdk/gateway` + `generateObject` accept `file` parts with `application/pdf` to Anthropic models?**
Confirmed by the AI SDK v6 docs: `file` parts with `mediaType: 'application/pdf'` and `data: Uint8Array | Buffer | base64String` work for Anthropic via Gateway. Verified by reading `@ai-sdk/gateway` package's exported types. If during impl this turns out to need a different shape, fall back to `experimental_attachments` (older AI SDK pattern) — but expect the v6 path.

**Q3. Should we extract one-shot or stream per page?**
One-shot (`generateObject`) per page, parallel across pages. Reasoning: streaming buys us nothing here — the CLI is non-interactive, and Worktree B's `/api/packet/ingest` does its own beat-level streaming on top of whatever we hand it. Streaming tokens through structured-output is also more failure-prone.

**Q4. Cost budget.**
Plan.md §A estimates $0.05/page × 32 pages = $1.50/full run. Worth re-checking after the first run — if a single-page PDF call lands closer to $0.10 the budget for a full hackathon's prompt iteration ramps. Hard ceiling: bail out the CLI if it sees > $5 in a single run (track via the AI SDK's `usage` return). For v1, just log estimated cost — no enforcement.

**Q5. What to do with `rawTag` values that don't match `isTag()`?**
Keep the entry (`tag: null`, raw preserved). Downstream Worktree B will surface these in a debug view; Chris may discover real-world tag variations we missed in `TAGS.md` (e.g. spaces inside tags, alternative dashes). Cheap insurance against the schema being too tight.

**Q6. What's "Chris's checkpoint" deliverable?**
Plan.md says "sample annotated page (PNG)". Two options:
- **Slim:** CLI prints `bid_pid p4` recall summary + writes the JSON. Chris opens the JSON, spot-checks 3 bboxes by eye against the PDF in a viewer. Zero rendering code in Worktree A. **Default.**
- **Full:** Add a `--render` flag that writes `samples/derived/vision-sample.png` using `pdfjs-dist` + `@napi-rs/canvas`. Adds ~30 min of integration risk and a new dep — defer to Worktree B's `/api/render-page`, which we'll be able to point at the cached JSON the moment B lands.

**Default decision:** Slim. If Chris bounces, we add `--render` post-merge.

---

## Step-by-step build order

| # | Step | Output | Time |
|---|---|---|---|
| 1 | `vision-types.ts` (pure types) | file compiles, no runtime impact | 5m |
| 2 | `vision-cache.ts` (no LLM dep) | unit-callable: `sha256OfFile`, `getCached`, `putCached` | 15m |
| 3 | `vision.ts` skeleton + `extractPage` for ONE page | smoke test against bid PID p4 only | 30m |
| 4 | Prompt iteration on p4 until ≥ 50% recall | hero-tag recall report | 30m |
| 5 | `extractDoc` with concurrency + caching | wraps `extractPage` | 15m |
| 6 | `scripts/extract-bid-bboxes.ts` | CLI + recall summary | 30m |
| 7 | Full run across all 7 PDFs, populate cache | `samples/derived/vision-cache/*.json` | 5–10m (LLM time) |
| 8 | Chris's review | go/no-go on accuracy | 5m |

**Total wall-time:** ~2h coding + ~10m LLM time. Fits the ~1.5h budget in plan.md with a small overrun for prompt iteration.

---

## Tests

No formal test suite — this is hackathon-scoped and the recall check IS the test. But:
- Type-level safety: `tsc --noEmit` passes (run as part of `pnpm build` smoke).
- Schema sanity: the Zod schema parsed at module load throws if `Tag` enum drifts (this is what catches a `TAGS.md` edit that the vision code didn't notice).
- Behavioral sanity: CLI exit code + recall percentage is the single behavioral test. CI doesn't run this (no API key in CI yet) — local-only.

---

## Risks + mitigations (delta from plan.md §risks)

| Risk | Mitigation |
|---|---|
| Claude returns pixel coords, not points | Q1 above. Verify on p4 before committing to mode. |
| Single-page sub-PDFs lose context (e.g. title block on p1 needed to interpret p4) | Acceptable. P&ID legends are typically per-page; cross-page context lives in the *prompt's* tag whitelist, not in adjacent pages. |
| Cache invalidation surprises | Filename includes `promptVersion + modelId` — every iteration writes a NEW cache file, so reverting to a known-good `promptVersion` brings the old results back instantly. |
| `pdf-lib` re-serialization changes page dimensions | `PDFDocument.copyPages` preserves the CropBox/MediaBox. Confirmed by reading pdf-lib docs. We pass `pageWidth/Height` from the *original* `getPage().getSize()` to the prompt, not from the re-serialized single-page doc, as a safety. |
| Bid PDFs are scanned/raster (no text layer) | Claude's vision handles raster PDFs natively. Vision pipeline doesn't depend on text extraction — that's by design. |
| AI Gateway 429s on parallel pages | Concurrency limit of 4 + per-page try/catch returning empty entries on hard failure. CLI surfaces the affected pages so we can re-run with `--only=` and lower concurrency. |

---

## Merge contract (when Worktree B lands)

- Worktree A keeps `vision-types.ts` as the canonical copy. B/C delete their copies.
- B's `__mocks__/vision.ts` is deleted; B imports `extractDoc` directly.
- No other public-surface coupling — B never touches the cache directory directly; it goes through `extractDoc`.

---

## Dependencies introduced

None. `pdf-lib` is already a devDep (we keep using it from devDeps since extraction is a CLI/server-only concern — runtime is `node`). `@ai-sdk/gateway`, `ai`, `zod` are already deps. The Claude PDF support is part of the existing AI SDK install.

---

## Plan-eng-review decisions (2026-05-16)

Locked after review pass. Each replaces a default from the plan above.

1. **Coordinates: normalized 0–1 floats.** Prompt asks for `[x0,y0,x1,y1]` in 0..1; `vision.ts` multiplies by page width/height after Zod parse. Removes the points-vs-pixels ambiguity entirely. Bbox output to consumers still matches the existing `samples/bboxes.schema.json` shape: PDF points, origin bottom-left.
2. **Error classification:** missing `AI_GATEWAY_API_KEY` or 401/403 from gateway → throw, fail CLI fast. 429 → one retry with 2s backoff. Schema/parse error → empty `entries: []` with `note: 'extraction-failed'`. **Sentinel:** `putCached` refuses to write if > 50 % of pages have zero entries; logs a warning and returns. This stops a botched run from poisoning the cache.
3. **PROMPT_VERSION = sha256(PROMPT_TEMPLATE).slice(0,8).** Prompt edits auto-invalidate cache. No manual bumping.
4. **Chris's checkpoint:** CLI also writes `samples/derived/vision-recall.md` — per-doc tag count + hero-tag table + misses by name. `--render` PNG flag stays deferred.
