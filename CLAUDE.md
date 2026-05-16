# kord-brain — Cross-doc engineering reasoning demo

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · gbrain v0.35.1.0 (PGLite) · Vercel AI Gateway (`anthropic/claude-opus-4-7`)

Click **Seed Knowledge Base**, watch gbrain parse every PDF / DOCX / XLSX in `demo_docs/` into a live knowledge graph, then explore with synchronized cross-document highlights.

---

## Boot contract: blank canvas, always

`pnpm dev` starts with a **completely empty brain**. Both the Brain tab and the Files tab render empty placeholders. Nothing is ingested until the user clicks **Seed Knowledge Base**.

- Every server start wipes `~/.gbrain/brain.pglite` (`scripts/preflight.mjs` deletes the file before Next.js boots).
- No brain content is committed to this repo. `demo_docs/` is the single source of truth.
- Drop new files into `demo_docs/` and click Seed again — already-imported pages are skipped (`gbrain import` is upsert-by-slug), new ones are added incrementally, and both tabs update.

This is deliberate. Devs and demo audiences see the same flow: empty → seed → populated.

---

## Quickstart

```bash
pnpm install        # installs deps; postinstall installs Bun + gbrain CLI
vercel env pull     # pulls AI_GATEWAY_API_KEY into .env.local
pnpm dev            # http://localhost:3000 — opens to empty Seed screen
```

`vercel env pull` prompts `vercel login` on first run (team `pipedreamer`, project `kord-brain`).

The dev server runs `scripts/preflight.mjs` first. It:
1. Verifies the `gbrain` CLI is installed (auto-runs `scripts/setup.sh` if not).
2. **Wipes the brain** (`rm -f ~/.gbrain/brain.pglite`, then `gbrain init`) so each run starts fresh.

To re-seed manually after dev starts: click **Seed Knowledge Base** in the UI. There is no CLI seed step — seeding is always user-triggered through `/api/seed`.

---

## The user flow

```
launch app — both tabs empty
    │
    ├── Brain tab:  "no nodes yet — click Seed"
    └── Files tab:  "Seed Knowledge Base" CTA
                          │
                          ▼  click
              ┌─────────────────────────────────────────┐
              │ /api/seed streams NDJSON ingestion       │
              │                                          │
              │  for each file in demo_docs/:            │
              │   1. parse raw doc → plain text          │
              │      (pdfjs / mammoth / SheetJS)         │
              │   2. one LLM call (claude-opus-4-7)      │
              │      emits brain-md: one page for the    │
              │      doc + one page per detected tag,    │
              │      linked with [[wikilinks]]           │
              │   3. write to tmpdir, gbrain import,     │
              │      gbrain extract links --source fs    │
              │   4. emit brain_node / brain_edge /      │
              │      doc_done events to the UI           │
              └────────────────────┬────────────────────┘
                                   ▼
              Brain tab: live nodes + edges appear.
              Files tab: every doc clickable, viewers
                         render, tag highlights wired
                         through the tag index.
```

Re-clicking Seed after adding files to `demo_docs/`:
- Skips docs whose slug is already in the brain.
- Processes only the new files.
- Re-builds the tag index (it reads `demo_docs/` directly, not gbrain).
- Refreshes the graph view.

---

## Repo layout

```
demo_docs/                  ← single source of truth; the only place "real" docs live
  Bid/                        bid package (PID, GA Drawing, Firm Quote)
  Detailed Design/            revised package (Full PID, Full GA, Instrument List + bboxes)
  RFQ.pdf
  process_narrative.docx
  equipment_list.xlsx

src/
  app/
    api/
      seed/route.ts         Seed pipeline: parse → LLM → gbrain import (NDJSON stream)
      graph/route.ts        Current brain nodes + edges (read-only)
      tag-index/route.ts    Built tag index + parsed doc payloads
      walkthrough/route.ts  Per-tag streaming walkthrough (gbrain-grounded)
    page.tsx                Renders <AppShell />
  components/
    AppShell.tsx            Two tabs: Brain, Files
    GraphView.tsx           Brain tab — full gbrain graph (reads /api/graph)
    SeedGate.tsx            Files tab — guards Demo behind successful seed
    SeedingView.tsx         Streams /api/seed events live
    DemoLayout.tsx          Post-seed: doc viewers + walkthrough panel
    PdfViewer / DocxViewer / XlsxViewer
    FullGbrainGraph.tsx     Persistent graph visualisation
    WalkthroughPanel.tsx    Streams per-tag beats with synchronized highlights
  lib/
    docs.ts                 DOCS[] metadata + TAG_DESCRIPTIONS (annotations only)
    tags.ts                 Tag regex + helpers — NO hardcoded master list
    tagIndex.ts             Builds tag→[location] map from demo_docs/ on demand
    gbrain.ts               Shells out to `gbrain` CLI (graph / backlinks / get / search / list / stats)
    walkthroughContext.ts   Builds per-tag prompt context from gbrain pages + edges
    ingestion/
      pdf.ts                pdfjs + <doc>.bboxes.json sidecar
      docx.ts               mammoth → HTML with <mark id="tag-…"> injection
      xlsx.ts               SheetJS → sheets + tagRows
scripts/
  preflight.mjs             Pre-dev: install gbrain if missing + wipe brain
  setup.sh                  Installs Bun + clones+links gbrain (no seed step)
```

---

## The seed pipeline (`/api/seed`)

See `architecture.md` for the request-flow diagram and `gbrain.md` for the gbrain CLI calls in detail.

**Stage 1 — raw doc → text.** Uses the existing ingestion modules (`pdfjs-dist`, `mammoth`, `xlsx`). No Python sidecar. The same parsers that build the tag index produce the text for the LLM.

**Stage 2 — text → brain-md (LLM).** For each doc, one streaming call to `anthropic/claude-opus-4-7` via Vercel AI Gateway. The prompt asks the model to emit:
- One **document page** (`type: document`) summarising the doc, with `[[tag-slug]]` references at each tag mention and `[[other-doc-slug]]` references to related docs.
- One **tag page** per tag the model detects in this doc (`type: tag`), describing the tag, linking back to its docs and to related tags it co-occurs with.

Pages are written to `os.tmpdir()/kord-brain-seed-<run-id>/` so the repo stays clean. Wikilinks must be lowercase path-derived slugs (see gbrain.md "Gotchas").

**Stage 3 — `gbrain import`.** `gbrain import <tmpdir> --no-embed` then `gbrain extract links --source fs --dir <tmpdir>`. Both are upsert-by-slug, so re-seeding is incremental.

**Stage 4 — tag index build.** `getTagIndex()` parses `demo_docs/` directly. This is independent of gbrain — PDF bboxes, XLSX rows, and DOCX anchors are used to drive the UI highlight overlay regardless of what the brain looks like.

**Stage 5 — stream to UI.** Throughout, `/api/seed` emits NDJSON events: `phase`, `stats`, `brain_node`, `brain_edge`, `graph_ready`, `doc_done`, `complete`. `SeedingView.tsx` renders them live (left: graph fills in; right: per-event log).

---

## Hallucination filter

The LLM is never trusted to produce valid `(tag, doc)` highlight pairs. Two layers catch it:

1. **At seed time**, the prompt is constrained to a per-doc text excerpt, and emitted wikilinks must reference slugs the model itself just declared in the same response. Anything else is dropped before `gbrain import`.
2. **At walkthrough time**, every streamed beat passes `filterBeat(beat, validPairs)` in `src/app/api/walkthrough/route.ts`. `validPairs` is built from the tag index (deterministic parsing of `demo_docs/`). Any beat that survives with zero valid highlights is dropped entirely.

Tag-index occurrences come from raw-doc parsing, not from gbrain — they're the ground truth.

---

## Demo narrative (5 minutes)

**0:00 — Open.** Empty app. "Engineers spend their lives cross-referencing PDFs, spreadsheets, and Word docs. Watch what happens when an AI does it in real time."

**0:15 — Seed.** Click **Seed Knowledge Base**. NDJSON streams. Nodes pop in, edges trace between them, doc cards complete with tag counts.

**1:30 — Explore.** Brain tab shows the populated graph — emerald root, indigo documents, amber tags. Click a tag node → re-runs the walkthrough on it; highlights jump across PDF / DOCX / XLSX viewers as each beat lands.

**3:30 — Q&A.** Ask 2-3 prepared natural-language questions about the design. Answers cite source docs and drive synchronized highlights.

**4:30 — Close.** "Twelve hours of hackathon work, reading raw PDFs, DOCX, and spreadsheets, building a tag graph, and answering against the engineering system. Imagine this on a real EPC project with 5,000 documents."

---

## What we are NOT building

- Auth, user accounts, file permissions, project lifecycle.
- File management UI beyond "what's in `demo_docs/`". Drop a file in the folder, click Seed.
- Persistence beyond the in-session brain. Server restart = empty.
- Real version control or diffing (that's Kord).
- **Hardcoded tag lists in TypeScript.** gbrain is the source of truth for tags and entities. Never re-introduce a `TAGS` const that's manually maintained — only the regex pattern in `src/lib/tags.ts` should be there.
- Mobile / responsive design.
- Vector embeddings (`gbrain import --no-embed`). Graph traversal alone is enough for the demo.

---

## Status (target vs current code)

| Aspect | Target (this doc) | Today |
|---|---|---|
| Brain wiped on server start | Yes — preflight nukes `~/.gbrain/brain.pglite` | ⚠️ Not yet wired in `scripts/preflight.mjs` |
| Both tabs empty at boot | Yes | ✅ UI already supports this — SeedGate gates the Files tab on a successful seed |
| Seed parses `demo_docs/` via LLM into brain pages | Yes — pdfjs/mammoth/xlsx → LLM → brain-md → `gbrain import` | ⚠️ `/api/seed` currently reads pre-existing brain pages (falls back to hardcoded slugs); the LLM ingestion stage is the next thing to build |
| `samples/brain-md/` source | Removed | ✅ Deleted (recent "Delete samples" commit); `scripts/setup.sh` still references it and warns |
| Tag index from `demo_docs/` | Yes | ✅ `src/lib/tagIndex.ts` already reads `demo_docs/` directly |
| Walkthrough grounded in gbrain context | Yes | ✅ Working end-to-end once the brain has pages |
| Re-seed is incremental | Yes — upsert-by-slug + skip already-imported docs | ⚠️ Depends on the LLM ingestion stage landing first |

---

## Tech stack

- **Frontend:** Next.js 16 App Router (Turbopack), React 19, Tailwind 4, `pdfjs-dist`, `mammoth`, `xlsx`
- **Backend:** Next.js API routes only — no separate server
- **AI runtime:** Vercel AI Gateway with `anthropic/claude-opus-4-7` (provider-string), via AI SDK v6 + `@ai-sdk/gateway`
- **Knowledge graph:** gbrain v0.35.1.0 (TypeScript/Bun, PGLite-backed) called via CLI shell-out from API routes
- **State:** Zustand (`src/lib/store.ts`)
- **Schemas:** Zod
- **Deploy:** localhost for the demo; optional Vercel preview afterwards
