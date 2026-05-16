# kord-brain Architecture

Cross-document engineering reasoning demo. The app boots **empty**. The user clicks **Seed Knowledge Base**, watches gbrain parse every doc in `demo_docs/` into a knowledge graph, then explores those docs with synchronized cross-document highlights.

---

## Lifecycle: blank → seeded → re-seeded

```
┌─────────────────────────┐
│  pnpm dev               │
│  scripts/preflight.mjs  │
│   • install gbrain CLI  │   (skips if already on PATH)
│   • rm ~/.gbrain/*.pglite ←  blank canvas, every run
│   • gbrain init         │
└────────────┬────────────┘
             ▼
┌─────────────────────────────────────────────┐
│  Browser opens http://localhost:3000        │
│  AppShell renders two tabs, both EMPTY:     │
│    Brain  — "no nodes yet"                  │
│    Files  — "Seed Knowledge Base" button    │
└────────────────────┬────────────────────────┘
                     │ user clicks Seed
                     ▼
            ┌────────────────────┐
            │  /api/seed (NDJSON)│   one pass over demo_docs/
            │  parse + LLM +     │
            │  gbrain import     │
            └─────────┬──────────┘
                      ▼
┌─────────────────────────────────────────────┐
│  Brain tab fills in live.                   │
│  Files tab unlocks DemoLayout (viewers      │
│  + walkthrough panel).                      │
└────────────────────┬────────────────────────┘
                     │ user drops more files into demo_docs/
                     │ user clicks Seed again
                     ▼
            ┌────────────────────┐
            │  /api/seed (NDJSON)│   new docs only — skips
            │  upsert-by-slug    │   pages already in brain
            └─────────┬──────────┘
                      ▼
            Brain + Files update incrementally.
```

---

## System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js + React 19)                                        │
│                                                                      │
│  AppShell — two top-level tabs:                                      │
│    ┌──────────────────────┐    ┌────────────────────────────────┐   │
│    │  Brain tab           │    │  Files tab                      │   │
│    │  GraphView           │    │  SeedGate                       │   │
│    │   reads /api/graph   │    │   ├─ phase="seed":  SeedingView │   │
│    │   FullGbrainGraph    │    │   ├─ phase="load":  spinner     │   │
│    │   (empty until seed) │    │   └─ phase="demo":  DemoLayout  │   │
│    └──────────────────────┘    │       (viewers + walkthrough)   │   │
│                                └────────────────────────────────┘   │
│                                                                      │
│                          Zustand store (activeDoc, highlights)       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ HTTP / NDJSON
              ┌────────────────────┴─────────────────────┐
              │  Next.js API routes                       │
              │   POST /api/seed         (the seed flow) │
              │   GET  /api/graph        (current brain) │
              │   GET  /api/tag-index    (built index)   │
              │   POST /api/walkthrough  (per-tag beats) │
              │   GET  /api/samples/[f]  (serve docs)    │
              └─────┬─────────────────────────────┬─────┘
                    │                              │
        ┌───────────▼────────┐         ┌──────────▼──────────┐
        │ gbrain CLI         │         │ Vercel AI Gateway   │
        │ (~/.bun/bin/gbrain)│         │ anthropic/claude-   │
        │ PGLite brain       │         │ opus-4-7            │
        │ ~/.gbrain/         │         │ streamObject() +    │
        │                    │         │ streamText()        │
        └────────────────────┘         └─────────────────────┘
```

---

## Seed flow (`POST /api/seed`)

This is the route the **Seed Knowledge Base** button hits. It streams NDJSON; `SeedingView.tsx` renders each event.

```
SeedingView.startSeeding()
  POST /api/seed
        │
        ▼
  /api/seed/route.ts
  ┌──────────────────────────────────────────────────────────────────┐
  │ STAGE 0 — sanity                                                 │
  │   gbrain stats               → emit {type:"stats", pages, links} │
  │                                                                  │
  │ STAGE 1 — discover already-imported slugs                        │
  │   gbrain list -n 500         → known: Set<string>                │
  │                                                                  │
  │ STAGE 2 — for each meta of DOCS where slug ∉ known:              │
  │   emit {type:"phase", label:"Parsing <displayName>…"}            │
  │                                                                  │
  │   ┌─ raw doc → text  (deterministic, no LLM)                     │
  │   │    pdf  → loadPdf(...).text per page                         │
  │   │    docx → loadDocx(...).text                                 │
  │   │    xlsx → loadXlsx(...).sheets flattened                     │
  │   │                                                              │
  │   ├─ text → brain-md  (LLM: claude-opus-4-7)                     │
  │   │    one streamObject() call per doc                           │
  │   │    emits { docPage, tagPages[] }                             │
  │   │    every wikilink is a lowercase slug                        │
  │   │                                                              │
  │   ├─ write to os.tmpdir()/kord-brain-seed-<run>/                 │
  │   │    <slug>.md (the doc page)                                  │
  │   │    <tag-slug>.md (each detected tag page)                    │
  │   │                                                              │
  │   ├─ gbrain import <tmpdir> --no-embed                           │
  │   │   (upsert by slug — re-seeds are incremental)                │
  │   │                                                              │
  │   ├─ gbrain extract links --source fs --dir <tmpdir>             │
  │   │                                                              │
  │   ├─ emit {type:"brain_node", slug, title, kind, snippet}        │
  │   ├─ emit {type:"brain_edge", from, to, kind} per new edge       │
  │   └─ emit {type:"doc_done", slug, displayName, kind, tagCount,   │
  │              tags:[…]}                                            │
  │                                                                  │
  │ STAGE 3 — build tag index                                        │
  │   getTagIndex()  reads demo_docs/ directly                       │
  │   (bboxes from .bboxes.json sidecars, docx <mark>s, xlsx rows)   │
  │                                                                  │
  │ STAGE 4 — complete                                               │
  │   emit {type:"graph_ready", nodes, edges}                        │
  │   emit {type:"complete",   totalTagged, docCount}                │
  └──────────────────────────────────────────────────────────────────┘
        │
        ▼ NDJSON stream
  SeedingView (client)
   ├── stats          → top counters
   ├── brain_node     → push into FullGbrainGraph nodes
   ├── brain_edge     → push into FullGbrainGraph edges
   ├── doc_done       → DocCard appears with tag chips
   └── complete       → footer "Enter Demo →" button enabled
```

Why this split:
- gbrain owns the **semantic graph** (typed wikilinks between pages).
- `tagIndex.ts` owns **pixel coordinates** (bboxes, anchors, cell positions) — needed for highlight overlays and as the hallucination filter against the LLM.
- The LLM owns **the narrative** (per-doc summaries, per-tag descriptions). It is never the source of truth for what exists where.

---

## Walkthrough flow (`POST /api/walkthrough`)

Triggered by clicking a tag in the sidebar, a bbox on a PDF, a row in a spreadsheet, or a node in the graph.

```
User clicks tag "LSL-201"
           │
           ▼
WalkthroughPanel.startWalkthrough({ tag: "LSL-201" })
  POST /api/walkthrough
           │
           ▼
  /api/walkthrough/route.ts
  ┌───────────────────────────────────────────────────────────┐
  │ 1. validate tag against TAG_REGEX                         │
  │ 2. getTagIndex()                                          │
  │      → validPairs : Set<"TAG:doc_slug">                   │
  │ 3. buildWalkthroughContext(tag)                           │
  │      ├─ gbrain.graph(slug, 1)        (1-hop subgraph)     │
  │      ├─ gbrain.backlinks(slug)        (incoming refs)     │
  │      └─ gbrain.getPage(slug) × N      (markdown bodies)   │
  │ 4. buildPrompt(ctx)                                       │
  │ 5. streamObject(AI Gateway, Beat schema)                  │
  │ 6. filterBeat(beat, validPairs)                           │
  │      drops any highlight whose (tag,doc) is not in        │
  │      the tag index                                        │
  │                                                           │
  │ NDJSON output:                                            │
  │   line 0: { type:"context", root, neighbors, edges, …}   │
  │   line N: { i:N, text:"…", highlights:[ {tag,doc} … ] }   │
  │   last:   { done:true, count:N }                          │
  └───────────────────────────────────────────────────────────┘
           │
           ▼
  WalkthroughPanel
    ├── on "context" → render gbrain provenance card + radial graph
    └── on each beat → append card; clicking it calls
                        applyBeatHighlights() → Zustand store
                        viewers react to highlight changes.
```

---

## Tag index (`src/lib/tagIndex.ts`)

Built on demand (lazy + cached). Independent of gbrain.

```
getTagIndex()  — reads demo_docs/ filesystem
  │
  ├─► for each meta of DOCS:
  │     if meta.kind === 'pdf':
  │       loadPdf(docsDir, meta.filePath)
  │         ├── pdf-lib reads page count + dimensions
  │         └── reads <filePath>.bboxes.json sidecar
  │              → { page, bbox:[x0,y0,x1,y1], tag, pageWidth, pageHeight }
  │
  │     if meta.kind === 'docx':
  │       loadDocx(docsDir, meta.filePath)
  │         ├── mammoth → HTML
  │         └── regex wraps each tag in <mark id="tag-…-N">
  │              → { html, occurrences:[{ tag, anchorId, snippet }] }
  │
  │     if meta.kind === 'xlsx':
  │       loadXlsx(docsDir, meta.filePath)
  │         ├── SheetJS reads workbook
  │         └── tag-regex scans every cell
  │              → { sheets, tagRows:[{ tag, sheet, rowIndex, values }] }
  │
  └─► Returns:
       tagIndex : Record<Tag, TagLocation[]>
       docs     : Record<DocSlug, DocPayload>   (rendered payload for viewers)

TagLocation:
  | { kind:'pdf',  slug, filename, page, bbox, pageWidth, pageHeight, note? }
  | { kind:'docx', slug, filename, anchorId, snippet }
  | { kind:'xlsx', slug, filename, sheet, rowIndex, values }
```

The tag index is the **deterministic ground truth** for highlights. It is also used as the validation set for the hallucination filter: every `(tag, doc)` pair the LLM emits must appear in this index or it gets dropped.

---

## Highlight mechanism

```
                  ┌──────────────────────────────────┐
                  │  Zustand Store (src/lib/store.ts)│
                  │   activeDoc:  DocSlug | null      │
                  │   highlights: Highlight[]         │
                  │     { tag, location: TagLocation }│
                  └───────────────┬──────────────────┘
                     ▲            │ reads
           writes    │            ▼
  ┌──────────────────┴──┐    ┌─────────────────────────┐
  │ selectTag(tag, locs)│    │  PdfViewer              │
  │   (tag click)       │    │   overlay <div> per bbox │
  │                     │    │   ring + shadow on match │
  │ applyBeatHighlights │    ├─────────────────────────┤
  │   (beat click)      │    │  DocxViewer             │
  │   resolves (tag,doc)│    │   .kb-tag-active on     │
  │   → TagLocations    │    │   <mark> elements        │
  │   auto-switches doc │    │   scrollIntoView()       │
  └─────────────────────┘    ├─────────────────────────┤
                             │  XlsxViewer             │
                             │   amber ring on the row │
                             │   matching tag in col[0]│
                             └─────────────────────────┘

Sources that write to the store:
  TagsSidebar   ──┐
  PdfViewer     ──┤
  DocxViewer    ──┼──► onTagClick(tag) → selectTag(tag, tagIndex[tag])
  XlsxViewer    ──┤
  FullGbrainGraph ┘  (clicking a tag node re-runs the walkthrough)
```

---

## Component tree

```
app/page.tsx
  └─► AppShell ('use client')
        ├─► Header (tab buttons: Brain / Files)
        │
        ├─► (always mounted; visibility-toggled)
        │   GraphView
        │     ├── header (page count, link count, Refresh button)
        │     └── FullGbrainGraph (SVG, deterministic layout, no physics)
        │
        └─► SeedGate
              │
              ├── phase === 'seed'  → SeedingView
              │     └── Landing (Seed Knowledge Base button)
              │           OR streaming UI (graph fills in + event log)
              │
              ├── phase === 'loading' → spinner
              │
              └── phase === 'demo'  → DemoLayout
                    ├── TagsSidebar
                    ├── DocTabs
                    ├── [PdfViewer | DocxViewer | XlsxViewer]
                    └── WalkthroughPanel
                          ├── tag <select>
                          ├── model <select>
                          ├── GbrainGraph (per-tag radial)
                          └── Beat cards (stream in)
```

---

## gbrain integration

```
src/lib/gbrain.ts — thin Node-side wrapper around the gbrain CLI

  runGbrain(args: string[])
    └── child_process.execFile(
          "gbrain", args,
          { env: { PATH: "~/.bun/bin:$PATH", ... },
            maxBuffer: 16 MB }
        )
        strips "[ai.gateway]" noise from stdout
        returns parsed JSON or text

  Exported functions actually used by the app:
  ┌─────────────────────────────────────────────────────────┐
  │ graph(slug, depth=1)                                    │
  │   → gbrain graph <slug> --depth <depth>                 │
  │   → GraphNode[]                                         │
  │                                                         │
  │ backlinks(slug)                                         │
  │   → gbrain backlinks <slug>                             │
  │   → Backlink[]                                          │
  │                                                         │
  │ search(query, limit=10)                                 │
  │   → gbrain search <query> --limit <limit>               │
  │   → SearchHit[]                                         │
  │                                                         │
  │ getPage(slug)                                           │
  │   → gbrain get <slug>                                   │
  │   → { slug, title, body, frontmatter } | null           │
  │                                                         │
  │ list(limit=200)                                         │
  │   → gbrain list -n <limit>                              │
  │   → string[] of slugs                                   │
  │                                                         │
  │ stats()                                                 │
  │   → gbrain stats                                        │
  │   → { pages, links }                                    │
  │                                                         │
  │ getRelatedContext(slug, depth=1)                        │
  │   convenience: graph + parallel getPage on neighbors    │
  └─────────────────────────────────────────────────────────┘

Brain lives at: ~/.gbrain/brain.pglite  (PGLite, no Postgres needed)
Seed source:    runtime — generated from demo_docs/ on Seed click.
                No committed brain content in the repo.
```

---

## Data schemas

```
Tag (src/lib/tags.ts)
  TAG_REGEX matches strings like "P-101", "LSL-201", "AE/TE-301".
  No master tag list — tags are whatever the regex finds in demo_docs/.
  isTag(s) is a type predicate using the regex.

DocSlug (src/lib/docs.ts)
  Union of slugs for committed docs. DOCS[] maps slug → on-disk path,
  display name, kind, and package ('pre_bid' | 'bid' | 'detailed_design').

TagLocation (src/lib/tagIndex.ts)
  | { kind:'pdf',  slug, filename, page, bbox, pageWidth, pageHeight, note? }
  | { kind:'docx', slug, filename, anchorId, snippet }
  | { kind:'xlsx', slug, filename, sheet, rowIndex, values }

Beat (src/app/api/walkthrough/route.ts — Zod schema)
  { text: string, highlights: { tag: Tag, doc: DocSlug }[1..3] }

SeedEvent (NDJSON line shape — see src/components/SeedingView.tsx)
  | { type:'phase';        label }
  | { type:'stats';        pages, links }
  | { type:'slugs_found';  count }
  | { type:'brain_node';   slug, title, kind, snippet }
  | { type:'brain_edge';   from, to, kind }
  | { type:'graph_ready';  nodes, edges }
  | { type:'doc_done';     slug, displayName, kind, tagCount, tags }
  | { type:'complete';     totalTagged, docCount }
  | { type:'error';        message }
```

---

## File map (current code)

```
src/
├── app/
│   ├── page.tsx                    server root — renders <AppShell />
│   ├── layout.tsx                  HTML shell, fonts, Tailwind
│   ├── globals.css                 Tailwind base + .kb-tag-active styles
│   └── api/
│       ├── seed/route.ts           POST — the seed pipeline (NDJSON stream)
│       ├── graph/route.ts          GET  — current brain nodes + edges
│       ├── tag-index/route.ts      GET  — built TagIndex + parsed doc payloads
│       ├── walkthrough/route.ts    POST — gbrain context + AI stream + filter
│       └── samples/[filename]/     GET  — serves demo_docs/ files by slug
│
├── components/
│   ├── AppShell.tsx                two-tab shell (Brain / Files)
│   ├── GraphView.tsx               Brain tab body
│   ├── SeedGate.tsx                Files tab — gates DemoLayout on seed completion
│   ├── SeedingView.tsx             streams /api/seed; Landing + live graph + log
│   ├── DemoLayout.tsx              post-seed layout (viewers + walkthrough)
│   ├── DocTabs.tsx                 tab bar over loaded docs
│   ├── TagsSidebar.tsx             left panel — every tag from the tag index
│   ├── WalkthroughPanel.tsx        right panel — per-tag beats with highlights
│   ├── GbrainGraph.tsx             per-tag radial SVG (deterministic, no physics)
│   ├── FullGbrainGraph.tsx         full brain force-directed SVG
│   ├── PdfViewer.tsx               PDF.js canvas + bbox overlay
│   ├── DocxViewer.tsx              mammoth HTML + tag <mark> highlighting
│   └── XlsxViewer.tsx              SheetJS table + row highlighting
│
└── lib/
    ├── tags.ts                     TAG_REGEX, isTag(), helpers (no master list)
    ├── docs.ts                     DOCS[] + TAG_DESCRIPTIONS + TAG_APPEARS_IN
    ├── store.ts                    Zustand: activeDoc, highlights, selectTag()
    ├── aiModels.ts                 AI Gateway model list + default
    ├── gbrain.ts                   shell-out client
    ├── tagIndex.ts                 builds TagIndex from demo_docs/
    ├── walkthroughContext.ts       fetches gbrain subgraph + builds prompt
    └── ingestion/
        ├── pdf.ts                  pdf-lib + .bboxes.json sidecar
        ├── docx.ts                 mammoth → HTML + <mark> injection
        └── xlsx.ts                 SheetJS → sheets + tagRows

demo_docs/                          actual engineering documents
  Bid/                                bid package
  Detailed Design/                    revised package (loaded live on stage)
  RFQ.pdf
  process_narrative.docx
  equipment_list.xlsx

scripts/
├── preflight.mjs                   pre-dev: ensure gbrain + wipe brain
├── setup.sh                        install Bun + clone/link gbrain
├── gen-demo-docs.ts                regenerates the demo doc set
├── extract-bid-bboxes.ts           tool: extract bbox sidecars from a PDF
├── gen-placeholders.ts             generates placeholder sample docs
└── copy-pdf-worker.mjs             postinstall: copy pdfjs worker to public/
```

---

## Hallucination filter

The LLM is not trusted to produce valid `(tag, doc)` highlight pairs. Every walkthrough beat goes through `filterBeat`:

```
validPairs = Set of "tag:doc_slug" strings built from tagIndex
  e.g. "LSL-201:dd_full_pid", "LSL-201:dd_instrument_list", "FT-301:dd_full_pid"

filterBeat(beat, validPairs):
  beat.highlights = beat.highlights.filter(h =>
    validPairs.has(`${h.tag}:${h.doc}`)
  )
  if beat.highlights.length === 0 → drop the beat entirely
```

The tag index is rebuilt from `demo_docs/` whenever the seed pipeline completes. Adding files and re-seeding refreshes it.
