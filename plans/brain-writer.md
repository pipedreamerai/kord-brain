# Plan: AI-generated prose for gbrain doc/tag pages

**Branch:** main
**Owner:** Wenny
**Companion docs:** `~/.gstack/projects/pipedreamerai-kord-brain/randomness-main-design-20260516-151803.md`, `CLAUDE.md`, `src/lib/uploads.ts`, `src/lib/gbrain.ts`, `src/lib/tagRegex.ts`
**Status:** DRAFT — superseded prior version of this file. Prior plan was built against a stale codebase snapshot (vision.ts, DOCS, TAGS — all deleted in 2026-05-16 cleanup commits b287190 / c8b8040 / 9170ec9 / 46f26d2).

---

## Why

`src/lib/uploads.ts` already turns an uploaded PDF/DOCX/XLSX into gbrain pages and edges:
- `ingestUpload(filename, buf)` → parses via `ingestion/{pdf,docx,xlsx}.ts` → extracts tags via `tagRegex.ts` → `pushToGbrain(doc)` writes 1 doc page + N tag pages + N edges via `gbrain.putPage()` / `gbrain.link()`.

What's missing for the demo thesis ("AI builds the knowledge model from raw inputs"): the markdown content is still hand-written template strings (`buildDocMarkdown` at `src/lib/uploads.ts:114`, `buildTagMarkdown` at `:132`). Tag pages literally say "Engineering tag discovered in uploaded documents." That's not AI inference, that's a print statement.

This plan replaces those two functions with LLM-generated prose, cached on disk so re-ingesting the same content is free.

## Scope (in/out)

**In:**
- `src/lib/disk-cache.ts` — generic `<T>` keyed cache, atomic write-then-rename. Reusable for future ingestion-side caches.
- `src/lib/prose.ts` — calls AI Gateway (`@ai-sdk/gateway` + `generateObject` from `ai`) with Zod schemas. Two functions: `generateDocProse(input)` and `generateTagProse(input)`. Both cached via `disk-cache.ts`.
- `src/lib/uploads.ts` modifications:
  - `buildDocMarkdown` and `buildTagMarkdown` become async, call into `prose.ts`.
  - `pushToGbrain` becomes a small orchestrator: aggregate doc-and-tag inputs, generate prose (bounded-parallel 4), then write pages.
  - For tag pages with multiple mention sources (re-uploads expanding the mention set), prose is re-generated when the input SHA changes (per the cache key) — this is the "accept hallucination, lean into AI inference" decision applied consistently.
- `samples/derived/prose-cache/` — JSON files, gitignored.
- Unit tests: `src/lib/tagRegex.test.ts` (covers `tagToSlug`, `isLikelyTag`, `tagRegex`), `src/lib/disk-cache.test.ts` (atomic write, key collision, validation rejection).
- Smoke test: upload a real PDF, verify gbrain stats grew, click a tag in `FullGbrainGraph.tsx`, confirm the graph renders.

**Out:**
- Vision-based tag extraction. Pattern-based discovery in `tagRegex.ts` stays the source of truth.
- Doc/tag page schema changes. Markdown frontmatter shape stays identical so `FullGbrainGraph.tsx` and `getRelatedContext` keep working.
- Q&A endpoint, packet-ingestion delta, ingestion beats — separate plans.
- Embeddings. Keyword + graph traversal is enough for the demo.
- Backfilling prose for already-uploaded docs. Existing pages keep their template prose until re-uploaded or until a future `pnpm regen-prose` task (out of scope).

## Architecture

```
POST /api/uploads (existing)
   │
   └─► ingestUpload(filename, buf)         src/lib/uploads.ts:192 (existing)
          │
          ├─► parseFile(kind, buf)         (existing — pdf/docx/xlsx)
          │      └─► extracts { payload, tags: string[] }
          │
          ├─► aggregate inputs for prose   (NEW, in uploads.ts)
          │      ├─► docInput  = { displayName, kind, tagSample (≤15), tagCount }
          │      └─► tagInput[]= [{ tag, category (inferred from prefix), siblingTags (≤10 from same doc) }]
          │
          ├─► generate prose (bounded-parallel 4)        NEW, prose.ts
          │      ├─► generateDocProse(docInput)  → DocProse  (cached)
          │      └─► generateTagProse(tagInput[i]) → TagProse[] (cached per tag)
          │
          ├─► buildDocMarkdown(prose, ...)      uploads.ts (rewritten)
          ├─► buildTagMarkdown(prose, ...)      uploads.ts (rewritten)
          │
          └─► pushToGbrain                       (existing, no edge changes)
                  ├─► gbrain.putPage(doc.slug, docMd)
                  ├─► for each tag: gbrain.putPage(tagSlug, tagMd)
                  └─► gbrain.link(docSlug, tagSlug, 'mentions')
```

**Cache key** (per `disk-cache.ts`): `<kind>/<slug>.<inputSha8>.<promptVer8>.<modelSlug>.json`
- `kind` ∈ {`doc`, `tag`}
- `slug` = the gbrain slug (doc slug or tagSlug)
- `inputSha8` = first 8 hex chars of sha256 of canonicalized input JSON
- `promptVer8` = first 8 hex chars of sha256 of the prompt template
- `modelSlug` = `anthropic__claude-opus-4-7` (Vercel AI Gateway provider-string from CLAUDE.md, hyphenated)

Re-uploading the same doc with the same tag set → all cache hits → zero LLM calls.
Re-uploading with a new tag set → some tag inputs change (different siblingTags) → those tags re-generate; doc re-generates because its tagSample changed.

## Data contracts

```ts
// prose.ts inputs
type DocProseInput = {
  displayName: string;
  kind: 'pdf' | 'docx' | 'xlsx';
  tagCount: number;
  tagSample: string[];                  // ≤15, sorted alphabetically for cache-key stability
};

type TagProseInput = {
  rawTag: string;
  category: 'equipment' | 'instrument' | 'valve' | 'control' | 'unknown';  // inferred from prefix
  docDisplayName: string;
  siblingTags: string[];                // ≤10 other tags from the same doc, sorted
};

// prose.ts outputs
type DocProse = {
  oneLineHook: string;                  // ≤120 chars, used as title suffix
  whatItIs: string;                     // 2-3 sentences
  whatItShows: string;                  // 2-4 sentences
};

type TagProse = {
  oneLineHook: string;                  // ≤120 chars
  whatItIs: string;                     // 2-3 sentences
  whyItMatters: string;                 // 1-2 sentences (AI inference, may speculate — by design)
};
```

**Why `siblingTags` is bounded at 10:** prose stays grounded in same-doc neighborhood; cache key stays small. AI is allowed to speculate WITHIN those neighbors (this is the "lean into AI inference" decision).

**Category inference** (no AI call needed): regex on tag prefix.
- `P-*`, `PU-*`, `RO-*`, `TK-*`, `F-*`, `FH-*`, `CF-*`, `UV-*`, `IX-*`, `MDL-*`, `HE-*`, `IQ-*` → `equipment`
- `AE-*`, `AE/*`, `TE-*`, `FT-*`, `FE-*`, `PIT-*`, `LIT-*`, `LSL-*`, `AIT-*` → `instrument`
- `PCV-*`, `CBV-*`, `HV-*`, `XV-*` → `valve`
- `MCP`, `RIO-*`, `J-BOX*`, `IR-*` → `control`
- everything else → `unknown`

This is template-matching, not AI. Lives in `prose.ts` so it's testable.

## File-by-file deliverables

### 1. `src/lib/disk-cache.ts` (NEW, ~60 LOC)

```ts
export type DiskCacheOptions<T> = {
  dir: string;                                     // absolute path
  validate?: (value: T) => boolean;                // returns false → put refuses
};

export function createDiskCache<T>(opts: DiskCacheOptions<T>): {
  get(key: string): Promise<T | null>;
  put(key: string, value: T): Promise<void>;       // atomic: write `${key}.tmp` → rename
};
```

- `key` is a complete filename minus `.json`. Callers compose the key (e.g. `doc/foo.abc12345.def67890.anthropic__claude-opus-4-7`).
- mkdir-recursive on first `put`.
- `put` swallows validation-rejection silently (warns via `console.warn`). Same pattern as the deleted `vision-cache.ts`.

### 2. `src/lib/prose.ts` (NEW, ~200 LOC)

```ts
export const PROSE_MODEL_ID = 'anthropic/claude-opus-4-7';   // Vercel AI Gateway provider-string

export const DOC_PROMPT_VERSION: string;   // sha256(DOC_PROMPT_TEMPLATE).slice(0,8)
export const TAG_PROMPT_VERSION: string;   // sha256(TAG_PROMPT_TEMPLATE).slice(0,8)

export async function generateDocProse(input: DocProseInput): Promise<DocProse>;
export async function generateTagProse(input: TagProseInput): Promise<TagProse>;

export function inferCategory(rawTag: string): TagCategory;   // pure, testable
```

- Uses `gateway('anthropic/claude-opus-4-7')` from `@ai-sdk/gateway`, `generateObject` from `ai`, Zod schemas.
- Retry once on 429 with 2s backoff. Throw on 401/403.
- Cache via `createDiskCache<DocProse>` / `createDiskCache<TagProse>`. Cache key built by `cacheKeyFor({ kind, slug, input, promptVersion, modelId })` — exposed for tests.
- Prompts intentionally allow speculation ("describe its likely engineering role inferred from neighbors"). This honors the "accept hallucination, lean into AI inference" decision.

### 3. `src/lib/uploads.ts` (MODIFY, ~40 LOC delta)

Replace:
- `buildDocMarkdown(displayName, kind, tags)` → `buildDocMarkdown(displayName, kind, tags, prose: DocProse)` — embed `whatItIs` / `whatItShows` into the existing markdown template.
- `buildTagMarkdown(tag, mentionedBy)` → `buildTagMarkdown(tag, mentionedBy, prose: TagProse)` — embed `whatItIs` / `whyItMatters`.
- `pushToGbrain(doc)` — before the existing put-loop, aggregate inputs and call `generateDocProse` / `generateTagProse` with bounded-parallel 4. Pass the resulting prose into the build functions.

Idempotency (issue 3 decision): no changes needed. `gbrain.putPage` is already upsert-by-slug, `gbrain.link` is best-effort and idempotent (uploads.ts already swallows errors). If the AI call fails mid-batch, re-running the upload will hit cache for completed prose and retry the failed ones. Document in script header.

### 4. `.gitignore` (MODIFY, +1 line)

```
samples/derived/
```
(Add if not already present. The directory holds prose cache JSON.)

### 5. `package.json` (NO CHANGE)

Deps already present: `@ai-sdk/gateway` `^3.0.114`, `ai` `^6.0.182`, `zod` `^4.4.3`.

### 6. Tests (NEW)

- `src/lib/tagRegex.test.ts` — 8 cases for `tagToSlug` (happy, slash, non-alphanum, collapse, trim, empty, unicode, collision-prone), 5 cases for `isLikelyTag`.
- `src/lib/disk-cache.test.ts` — get-miss, put-then-get-hit, validation reject, atomic write (interrupt simulation via reject in write).
- `src/lib/prose.test.ts` — `inferCategory` covers each branch + unknown. LLM calls themselves are NOT tested (would require mocking generateObject; low ROI for hackathon).

Test runner: `node:test` (built-in, zero deps, ships with Node 22). Add `"test": "node --test --import tsx src/**/*.test.ts"` to package.json scripts.

## Decisions locked from /plan-eng-review (2026-05-16)

| Issue | Decision | Where applied |
|---|---|---|
| 1A — Cache key includes input SHA | YES | `cacheKeyFor()` in `prose.ts` |
| 1B — Prose grounding | Accept hallucination, lean into AI inference | Prompt templates explicitly invite speculation within the neighbor set |
| 1C — Pipeline failure recovery | Idempotent re-run | `gbrain.putPage` is upsert; cache survives partial failure; re-run is the recovery |
| 2A — DRY cache utility | Extract `disk-cache.ts<T>` | Single shared utility consumed by `prose.ts`; future ingestion caches will reuse |
| 3A — Test coverage | Unit tests for pure logic | `tagRegex.test.ts`, `disk-cache.test.ts`, `prose.test.ts` (inferCategory only) |
| Frontmatter — never emit `slug:` | Lint-level assertion | `buildDocMarkdown` / `buildTagMarkdown` assert no `slug:` line in output |

## Open questions

**Q1. Should the upload route stream prose-generation progress back to the client?**
Today the upload is synchronous: client POSTs, waits for everything, gets a 200 with the doc body. Adding LLM calls means ~5-15s per upload (cold cache, 10 tags × ~1s). That's a long spinner. Options:
- (a) Keep synchronous, accept the spinner.
- (b) Return 202 + start streaming progress over SSE / WebSocket.
- (c) Generate prose with templates first, return immediately, regenerate prose in the background.
**Default:** (a) for v1. UX polish is a separate plan.

**Q2. Cost guard?**
A cold rebuild of a large doc could cost ~$1 (15-20 LLM calls). No guard today. If a user uploads 50 docs in a row, that's $50. Options:
- (a) No guard; trust the demo flow won't abuse it.
- (b) Per-upload cap: refuse if estimated cost > $2.
**Default:** (a). Demo-scope.

**Q3. What happens to tag pages when a doc is removed?**
`nukeAll()` deletes everything. `uploads.ts` doesn't expose a per-doc delete today. If we add one later, tag pages that lose all their mentions become orphan pages. Not this plan's problem.

**Q4. Re-runs of `pushToGbrain` write the doc page once, but tag pages N times (once per re-upload of an overlapping doc).** This is true today (with templates) and stays true (with prose). Each rewrite is upsert. Document.

## Step-by-step build order

| # | Step | Output | Time |
|---|---|---|---|
| 1 | `disk-cache.ts` + test | passing tests | 15m |
| 2 | `prose.ts` types + `inferCategory` + test | category inference works | 15m |
| 3 | `prose.ts` prompt templates + Zod schemas | versions stable | 15m |
| 4 | `prose.ts` `generateDocProse` + cache wiring | one call works end-to-end | 20m |
| 5 | `prose.ts` `generateTagProse` + cache wiring | one call works | 10m |
| 6 | `uploads.ts` rewire `buildDocMarkdown` / `buildTagMarkdown` / `pushToGbrain` | type-checks | 20m |
| 7 | `tagRegex.test.ts` | passing tests | 15m |
| 8 | Manual smoke: upload one PDF, inspect gbrain stats, click a tag | demo works | 15m |
| 9 | Manual smoke: re-upload the same PDF, verify cache hits in logs | cache works | 5m |

**Total:** ~2h coding + ~5m LLM time on the cold smoke run.

## Test plan (consumed by /qa)

- Pages affected: anywhere that triggers an upload (`POST /api/uploads`) or reads doc/tag pages.
- Key interactions: drag-drop upload a PDF; observe graph populated; click a tag node; read the tag page content.
- Edge cases: PDF with zero detected tags (prose still generates for the doc); large PDF (10+ tags, bounded-parallel works); re-upload same file (slug collision → uploads.ts:90 `uniqueSlug` handles it; prose cache hits).
- Critical paths: upload → prose generation → `gbrain.putPage` → graph render. End-to-end.

## Failure modes

| Codepath | Failure mode | Test? | Error handling? | User sees? |
|---|---|---|---|---|
| `generateDocProse` | AI Gateway 401 | NO | throws | upload fails with 500 (existing route behavior) |
| `generateDocProse` | AI Gateway 429 | NO | retry once, then throw | upload fails with 500 if retry also 429 |
| `disk-cache.put` | filesystem full | NO | unhandled | upload throws |
| `disk-cache.get` | corrupted JSON | NO | `null` (treated as cache miss) | regenerates silently |
| `gbrain.putPage` | gbrain CLI missing | NO | rejects with stderr in message | upload fails with 500 |
| `pushToGbrain` | partial completion (some tags written, others fail) | NO | idempotent re-run on next upload | user re-uploads, completes |

**Critical gap:** AI Gateway outage during a live demo. Plan accepts this risk (no fallback). Mitigation: warm the prose cache before the demo by uploading the demo doc once and committing `samples/derived/prose-cache/` to git (out of this plan's scope; flag as TODO).

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Prose hallucinates engineering relationships | Accepted by design. Demo thesis is "AI inference from raw inputs." |
| Cold upload UX is slow (~10s LLM time) | Accepted for v1. Q1 covers later UX work. |
| Prose cache fills up over time | None — hackathon scope. `rm -rf samples/derived/prose-cache/` is the recovery. |
| Re-upload regenerates tag prose for unchanged tags | Mitigated: cache key includes per-tag input SHA. Unchanged tags → cache hits. |
| Model ID drift | Pinned to `anthropic/claude-opus-4-7` (gateway provider-string from CLAUDE.md). |
| AI Gateway outage during demo | Pre-warm cache by uploading demo doc beforehand. Out of this plan's scope. |

## Done definition

- `pnpm dev`, drag-drop a real PDF onto the app, the doc and tag pages in the graph show AI-generated prose (not "Engineering tag discovered in uploaded documents.").
- Re-uploading the same PDF generates 0 LLM calls (verified by console log of cache hits).
- Uploading a different PDF that shares some tags regenerates only the changed-input tag prose, not the unchanged ones.
- `gbrain stats` page count grows by 1 doc + N tag pages on first upload, stays stable on re-upload.
- Unit tests pass: `pnpm test`.
- No `slug:` in any generated markdown frontmatter (renderer assertion).

## What already exists (and we reuse)

- `src/lib/uploads.ts` — the whole orchestration spine. We modify, not replace.
- `src/lib/gbrain.ts:24-44` — `putPage`, `deletePage`, `link`. Plan calls these unchanged.
- `src/lib/tagRegex.ts` — `tagToSlug`, `isLikelyTag`. Pattern-based discovery stays the tag source.
- `src/lib/ingestion/{pdf,docx,xlsx}.ts` — file parsers. Unchanged.
- `@ai-sdk/gateway` + `ai` + `zod` deps. Already installed.
- `AI_GATEWAY_API_KEY` already in `.env.local`.

## NOT in scope

- Vision-based tag extraction. The codebase deliberately uses regex now. Adding vision back is a separate plan and a separate trade-off.
- Q&A endpoint, packet ingestion delta, ingestion beats. Separate plans.
- Streaming prose generation back to the UI. Q1.
- Cost guards. Q2.
- Per-doc delete + orphan tag cleanup. Q3.
- Pre-warming the prose cache (committing it to git). Demo-prep concern, separate task.
- Backfilling prose for already-uploaded docs. They keep template prose until re-uploaded.

## Worktree parallelization strategy

Sequential implementation, no parallelization opportunity. Every step touches either `src/lib/` or test files. Build order in §"Step-by-step build order" is the right order.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | scrap-and-rewrite — original plan built on phantom codebase; new plan locks 5 decisions |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |
| Outside Voice | claude subagent (codex unavailable) | Independent challenge | 1 | issues_found | caught the phantom-codebase miss; 3 P0, 5 P1, 4 P2 |

- **OUTSIDE VOICE:** Caught the critical issue Claude review missed — the plan was written against a stale snapshot. `vision.ts`, `DOCS`, `TAGS`, `demo_docs/` are all deleted in HEAD. `src/lib/uploads.ts` already does PDF→gbrain end-to-end. Plan was rewritten from current HEAD to scope down to "swap template prose for AI prose."
- **CROSS-MODEL:** Both reviewers agree the AI-prose direction is the right one; only the implementation foundation moved. Decisions 1A/1B/1C/2A/3A from the original review carry over and are locked into the rewritten plan.
- **UNRESOLVED:** 0
- **CRITICAL GAPS:** 1 (AI Gateway outage during live demo — accepted, mitigation flagged as TODO)
- **VERDICT:** ENG CLEARED — plan is implementable from current HEAD. Tests + smoke test required before ship.
