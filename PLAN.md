# Implementation plan — parallel worktrees

**Status:** Phase 1 (schema swap) committed on main. This plan covers Phases 2–4.

**Strategy:** lock the inter-component contracts up front (below), then run three worktrees in parallel — vision pipeline, API endpoints, chat UI. Each worktree is self-contained with mocked stubs for the other two until integration. All three are sized at ~1–1.5h each.

**Companion docs:**
- [`TAGS.md`](./TAGS.md) — locked tag schema (source of truth for what tags exist)
- [`EXPECTED_INGESTION.md`](./EXPECTED_INGESTION.md) — the 5 beats the brain should emit
- [`EXPECTED_QA.md`](./EXPECTED_QA.md) — live demo questions + expected answers
- [`CLAUDE.md`](./CLAUDE.md) — overall demo arc + gbrain wiring notes

---

## Shared contracts (locked — all three worktrees implement against these)

### 1. Vision extraction output

```ts
// src/lib/ingestion/vision-types.ts

import type { Tag } from '../tags';
import type { DocSlug } from '../docs';

export type TagCategory = 'equipment' | 'instrument' | 'valve' | 'control' | 'unknown';

/** One detected tag on one page, in PDF user-space coordinates (origin bottom-left). */
export type VisionTagEntry = {
  /** Raw string the vision model returned — validate with `isTag()` before use */
  rawTag: string;
  /** Tag after schema validation; null if the model emitted an unknown tag */
  tag: Tag | null;
  bbox: [number, number, number, number];   // [x0, y0, x1, y1] in PDF points
  category: TagCategory;
  /** Model self-reported, 0–1. Below 0.5 → dim highlight; below 0.3 → drop. */
  confidence: number;
  /** Optional one-line note from the model (e.g. "appears in chemical injection skid") */
  note?: string;
};

export type VisionPageResult = {
  pageNumber: number;          // 1-indexed
  pageWidth: number;           // PDF points
  pageHeight: number;
  entries: VisionTagEntry[];
};

export type VisionDocResult = {
  /** Path relative to `demo_docs/` (for cached bid docs) OR absolute upload path */
  filePath: string;
  /** SHA-256 of the file content, used as cache key */
  fileSha: string;
  /** Logical doc slug if this corresponds to a known doc in DOCS; else null for ad-hoc uploads */
  slug: DocSlug | null;
  pages: VisionPageResult[];
  extractedAt: number;         // ms timestamp
  /** Model + prompt version stamp for cache invalidation */
  promptVersion: string;
  modelId: string;
};
```

### 2. Ingestion endpoint event stream (NDJSON over HTTP)

```ts
// POST /api/packet/ingest with multipart/form-data containing 1–5 PDFs.
// Response: text/event-stream-ish NDJSON, one JSON object per line.

export type IngestEvent =
  // Lifecycle
  | { type: 'started'; uploadId: string; files: { name: string; size: number; sha: string }[] }
  | { type: 'page-extracted'; file: string; pageNumber: number; tagCount: number }
  | { type: 'finished'; uploadId: string; durationMs: number }
  | { type: 'error'; message: string; recoverable: boolean }
  // The 5 narration beats (see EXPECTED_INGESTION.md)
  | { type: 'beat'; beat: IngestBeat }
  // Structured deltas (consumed by the gbrain layer + the UI's "known system" view)
  | { type: 'tag-delta'; kind: 'added' | 'changed' | 'removed'; tag: Tag; source: BeatHighlight }
  | { type: 'relationship-delta'; kind: 'added' | 'removed'; from: Tag; to: Tag; label: string }
  | { type: 'open-check'; id: string; severity: 'info' | 'warn'; narration: string; highlights: BeatHighlight[] };

export type IngestBeat = {
  id: 'files' | 'tags' | 'relations' | 'risks' | 'commit';
  narration: string;                       // 1 sentence, streamed all at once
  highlights: BeatHighlight[];             // tags + doc + page to flash on right pane
};

export type BeatHighlight = {
  tag: Tag;
  doc: DocSlug | string;                   // string for ad-hoc uploaded filename
  page: number;
  bbox?: [number, number, number, number]; // omitted if unknown — UI scrolls but doesn't draw
};
```

### 3. Q&A endpoint event stream (NDJSON over HTTP)

```ts
// POST /api/qa with JSON { question: string }
// Response: NDJSON

export type QaEvent =
  | { type: 'text-delta'; delta: string }                            // streaming answer tokens
  | { type: 'highlight'; tag: Tag; doc: DocSlug; page: number; bbox?: [number, number, number, number] }
  | { type: 'done'; tokenCount: number };
```

### 4. Page render endpoint

```
GET /api/render-page?slug=<DocSlug>&page=<n>&highlights=<base64 JSON BeatHighlight[]>
→ image/png

Server-side: rasterize the PDF page at ~150 DPI, draw rectangles for each highlight
(distinct color per category, low-opacity fill + bold stroke), return PNG.
Cache by (slug, page, highlights-hash) on disk.
```

---

## Worktree A — Vision pipeline (`feat/vision-extraction`)

**Owner:** Claude Code agent (foundational; nothing else works end-to-end without it)
**Parallel-safe:** yes, B and C mock against the contracts above

### Deliverables

```
CREATE  src/lib/ingestion/vision-types.ts        (copy from §1 above)
CREATE  src/lib/ingestion/vision.ts              (the actual extractor)
CREATE  src/lib/ingestion/vision-cache.ts        (disk cache, keyed on file SHA + prompt version)
CREATE  scripts/extract-bid-bboxes.ts            (one-shot CLI to seed the cache)
MODIFY  .gitignore                               (+ samples/derived/, samples/uploaded/)
```

### Implementation notes

- **Model:** `anthropic/claude-opus-4-7` via Vercel AI Gateway (per CLAUDE.md §9). Claude supports PDF input natively — chunk the PDF into single-page sub-PDFs (use `pdf-lib`, already a dep) and send each page as one PDF document message. **Do not** convert to PNG just for extraction.
- **Prompt:** structured-output JSON schema matching `VisionPageResult`. Reject explanatory prose — the response should be JSON-only.
- **Caching:** `samples/derived/vision-cache/<sha256-of-pdf-content>.json`. Key includes `promptVersion` and `modelId` so prompt iteration invalidates the cache.
- **Cost expectation:** ~$0.05 per page, ~16 pages baseline + ~16 pages live = ~$1.50 per full run. Cached after first run.
- **Validation:** every `rawTag` gets `isTag(rawTag)` checked from `src/lib/tags.ts`. If it fails, set `tag: null` and keep the entry (UI can show it as "unrecognized tag" in a debug view, or just drop it).

### Prompt iteration target

Run against `demo_docs/Bid/PID.pdf` page 4 (the RO skid). Success = at least these tags found with bboxes within ±10% of correct:
- `PU-01`, `PU-02`, `RO-01..RO-08`, `RO-09..RO-11`, `F-01`, `TK-01`

If the first prompt finds < 50% of expected tags, iterate. If it hallucinates tags not in the schema, tighten the prompt with explicit "use only these tags" guidance.

### CLI usage

```bash
pnpm tsx scripts/extract-bid-bboxes.ts          # extracts all 3 bid PDFs, populates cache
pnpm tsx scripts/extract-bid-bboxes.ts --force  # invalidates cache, re-extracts
```

### Chris's checkpoint (5 min)

After agent finishes, run the CLI yourself. Sanity-check console output. Visually verify one annotated page (agent will produce a sample PNG). Thumbs up → Phase 3 integration can use the real vision; thumbs down → tune prompt before merging.

---

## Worktree B — API endpoints (`feat/ingest-and-qa-endpoints`)

**Owner:** Claude Code agent
**Parallel-safe:** yes — uses a mock vision client until A merges

### Deliverables

```
CREATE  src/app/api/packet/ingest/route.ts       (multipart upload → 5-beat NDJSON stream)
CREATE  src/app/api/qa/route.ts                  (chat Q&A → NDJSON stream)
CREATE  src/app/api/render-page/route.ts         (PDF page + highlights → PNG)
CREATE  src/lib/ingestion/__mocks__/vision.ts    (mock matching the §1 contract; remove at merge)
CREATE  src/lib/ingestion/vision-types.ts        (copy from §1; deduplicate with A at merge)
MODIFY  package.json                             (+ pdf-to-img or pdfjs-dist for rasterization,
                                                  + @vercel/ai-sdk additions if needed)
MODIFY  .gitignore                               (+ samples/render-cache/)
```

### Implementation notes

- **`/api/packet/ingest`:**
  - `multipart/form-data`, accept up to 5 PDFs at ≤10 MB each
  - Validate MIME = `application/pdf`, save to `samples/uploaded/<uploadId>/<filename>`
  - Stream NDJSON `IngestEvent`s per §2
  - Beat narration uses `anthropic/claude-opus-4-7` with structured output
  - Beat content drawn from `EXPECTED_INGESTION.md`; the model has freedom to choose which 5 themes to surface but MUST include the Midland/Beaumont open-check in Beat 4
  - For accept-any-PDF behavior: if no recognized tags after extraction, emit a single beat narrating *"That doesn't look like a detailed-design package for this water system — I don't see any tags from the EH2 corpus. Re-check the files?"* instead of the 5 beats. (Per Chris's call — graceful AI-native handling.)

- **`/api/qa`:**
  - JSON in (`{ question: string }`), NDJSON out per §3
  - Use the same gbrain context-building pattern as the existing walkthrough route
  - If gbrain returns no relevant pages, fall back to whole-tag-index summary
  - Cite tags from `TAGS.md` only; filter unrecognized refs via `isTag()`

- **`/api/render-page`:**
  - Use `pdf-to-img` (Node-friendly) or `pdfjs-dist` server-side with `@napi-rs/canvas`
  - Render at 150 DPI default, scale highlight bboxes from PDF points to rendered pixels
  - Color code by category: equipment = emerald (#10b981), instrument = amber (#f59e0b), valve = sky (#0ea5e9), control = indigo (#6366f1)
  - Disk cache keyed on `sha1(slug + page + highlights-json)`

### Chris's checkpoint (5 min)

Run `curl -X POST localhost:3000/api/packet/ingest -F 'files=@demo_docs/Detailed Design/Full PID.pdf'` and watch the NDJSON stream in the terminal. Verify all 5 beats arrive, the `tag-delta` events match EXPECTED_INGESTION.md, and the Midland/Beaumont check fires.

---

## Worktree C — Chat + dropzone UI (`feat/chat-split-pane-ui`)

**Owner:** Claude Code agent
**Parallel-safe:** yes — uses fixture data matching the §2/§3 contracts until B merges

### Deliverables

```
CREATE  src/app/(demo)/page.tsx                  (new default landing — split-pane chat)
CREATE  src/components/UploadDropzone.tsx        (react-dropzone wrapper)
CREATE  src/components/ChatPane.tsx              (left pane — messages, streaming beats, input)
CREATE  src/components/BeatCard.tsx              (one card per ingestion beat)
CREATE  src/components/AnnotatedPage.tsx         (right pane — image from /api/render-page)
CREATE  src/components/QaInput.tsx               (free-text input below beats)
CREATE  src/lib/ingestion/vision-types.ts        (copy from §1; dedup at merge)
CREATE  src/lib/fixtures/ingest-stream.ts        (mock NDJSON for dev until B lands)
MODIFY  src/app/page.tsx                         (route forward to (demo)/page.tsx)
MODIFY  package.json                             (+ react-dropzone, + sse-parser or similar)
```

### Implementation notes

- **Layout:** CSS grid with `grid-template-columns: minmax(420px, 1fr) 2fr`. Chat panel left, annotated page right.
- **Initial state:** dropzone fills the chat panel — *"Drop the detailed-design drawings here to load them into the brain"*. Once a file is dropped, transitions into beats-streaming mode.
- **Beat rendering:** each beat is a card with the narration text + an icon for the beat type (📂 files / 🏷️ tags / 🔗 relations / ⚠️ risks / ✅ commit). When a beat arrives, the right pane auto-switches to the first `highlight` in that beat.
- **Auto-scroll:** right pane scrolls smoothly when the active beat changes. Keep the previously-shown page visible briefly so the transition is readable.
- **Q&A:** after Beat 5 (commit), enable the `QaInput` at the bottom. Each question becomes a new chat message + streamed response + highlight changes on the right pane.
- **Error states:** unsupported files, oversized files, mid-stream errors → inline red bubble in the chat.

### Fixture for parallel dev

`src/lib/fixtures/ingest-stream.ts` exports `async function* mockIngestStream(): AsyncGenerator<IngestEvent>` that yields the events from EXPECTED_INGESTION.md with realistic delays (~3s per beat). UI imports from this until the real endpoint exists; swap import at integration time.

### Chris's checkpoint (10 min)

Open `localhost:3000`. Drop the 3 DD PDFs into the dropzone. Watch the beats stream. Type "what changed compared to the bid?" into the Q&A input. Verify:
1. Drop affordance is obvious + accepts the files
2. Beats land in order with smooth animation
3. Right pane keeps up with the active highlight
4. Q&A produces a streamed answer with at least one annotated highlight
5. Demo overall feels like 5 minutes of "the brain doing the work"

---

## Phase 4 — Integration + dress rehearsal (sequential, after A/B/C merge)

**Owner:** me (Claude Code in main), with Chris reviewing

### Steps

1. **Merge order:** A first, then B (replaces its mock vision with real one from A), then C (replaces its fixture with real fetch). ~30 min.
2. **Dedup:** consolidate the three copies of `vision-types.ts`. Keep A's version; delete the others.
3. **End-to-end smoke test:** drop files, verify beats, ask Q&A, check easter egg. ~15 min.
4. **Dress rehearsal × 3** (per CLAUDE.md §6 Hour 10–12):
   - **Run 1:** time it; note top 3 issues; fix.
   - **Run 2:** lock the live Q&A trio (Q1 → Q2 → Q5 from EXPECTED_QA.md).
   - **Run 3:** if clean → **record backup video** with QuickTime before anything else.
5. **Stretch (only if time):** "what else changes if both RO trains need to be upgraded to 100 GPM?" — change-impact mode using the entity graph.

---

## What Chris does (concise)

| When | Action | Time |
|---|---|---|
| Now | Commit Phase 1 (schema swap) + this PLAN.md | 2 min |
| Now | Tell me "go" — I dispatch the 3 worktree agents | — |
| ~1h in | Review Worktree A output (sample annotated page) | 5 min |
| ~1.5h in | Review Worktree B output (`curl` the ingest endpoint) | 5 min |
| ~1.5h in | Review Worktree C output (open the dropped-files flow) | 10 min |
| ~2h in | I run integration; you watch the merged demo end-to-end | 15 min |
| Hours 3–5 | Dress rehearse 3× | 90 min |
| Before stretch | Record backup video | 15 min |

**Total active time from Chris:** ~2.5 hours across the rest of the hackathon. Most of it is review + rehearsal, not deciding.

---

## Sync points with Wenny (gbrain track)

Two places Wenny's gbrain work has to land for the demo to fully shine:

1. **Real EH2 entity pages in `samples/brain-md/`** (replaces fake feedwater). Without this, Beat 3 (relationships) and Q&A responses fall back to thin context. Endpoints will still run, just with shallow reasoning.
2. **Re-seed command run** (`gbrain import samples/brain-md --no-embed && gbrain extract links --source fs --dir samples/brain-md`). Quick — runs in seconds.

I can produce a generator script that takes `TAGS.md` → spits out the markdown skeleton if Wenny wants help. Just say.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Vision extraction is too inaccurate on dense P&IDs | Phase 2 checkpoint catches it. Fallback: hand-annotate the 8 hero tags as backup (CLAUDE.md original plan). |
| Three worktrees diverge on contract details | Contracts §1–§4 above are locked. Re-read before any agent decision. |
| Multipart upload size limits in Next.js | Default body size is 1 MB in App Router — bump to 50 MB in `route.ts` config. DD PDFs are < 5 MB each. |
| Server-side PDF rasterization fails on Node | Have a fallback: send the raw PDF page to the client and use PDF.js client-side. Adds complexity but unblocks the UI. |
| Live demo: dropzone rejects files for unclear reason | Phase 4 rehearsal catches this. Add verbose error toasts during dev. |
