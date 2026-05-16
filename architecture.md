# kord-brain Architecture

Cross-document engineering reasoning demo. Click a tag on any engineering document; the system streams an AI walkthrough with synchronized highlights across PDFs, DOCX files, and spreadsheets — grounded in a gbrain knowledge graph.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js + React 19)                                       │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────────────┐  ┌──────────────┐  │
│  │ TagsSidebar  │  │   Document Viewers        │  │ Walkthrough  │  │
│  │              │  │  ┌────┐ ┌──────┐ ┌────┐  │  │ Panel        │  │
│  │ [FT-301]     │  │  │PDF │ │ DOCX │ │XLSX│  │  │              │  │
│  │ [LSL-201]    │  │  │.js │ │mammoth│ │SheetJS│ │  gbrain card │  │
│  │ [CV-301] ... │  │  └────┘ └──────┘ └────┘  │  │ radial graph │  │
│  └──────┬───────┘  └──────────┬───────────────┘  │ beats stream │  │
│         │                     │                   └──────┬───────┘  │
│         └─────────────────────┴──────────────────────────┘          │
│                           Zustand Store                              │
│                    { activeDoc, highlights }                         │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTP
                    ┌──────────────┴──────────────┐
                    │  Next.js API Routes          │
                    │  POST /api/walkthrough       │
                    │  GET  /api/tag-index         │
                    │  GET  /samples/[filename]    │
                    └──────┬──────────────┬────────┘
                           │              │
              ┌────────────▼───┐    ┌─────▼──────────────┐
              │ gbrain CLI     │    │ Vercel AI Gateway  │
              │ (~/.bun/bin/   │    │ anthropic/claude-  │
              │  gbrain)       │    │ opus-4-7           │
              │                │    │                    │
              │ PGLite brain   │    │ streamObject()     │
              │ ~/.gbrain/     │    │                    │
              └────────────────┘    └────────────────────┘
```

---

## Request Flow: "Walk Through M-101"

```
User clicks "Walk through M-101"
           │
           ▼
WalkthroughPanel.startWalkthrough()
  POST /api/walkthrough { tag: "M-101", model: "..." }
           │
           ▼
  ┌────────────────────────────────────────────────────┐
  │  /api/walkthrough/route.ts                         │
  │                                                    │
  │  1. validate tag ∈ TAGS                            │
  │  2. getTagIndex()  ──────────────────────────────► │
  │     builds validPairs: Set<"tag:doc">              │
  │  3. buildWalkthroughContext(tag)                   │
  │     │                                              │
  │     ├─► gbrain graph m-101 --depth 1              │
  │     │     → GraphNode[]                            │
  │     ├─► gbrain backlinks m-101                    │
  │     │     → Backlink[]                             │
  │     └─► gbrain get <slug> × N (neighbor pages)   │
  │           → Page[] (markdown + frontmatter)        │
  │                                                    │
  │  4. buildPrompt(ctx) → LLM system + context        │
  │  5. streamObject(AI Gateway, Beat schema)          │
  │  6. filterBeat(beat, validPairs)                   │
  │     drops (tag,doc) pairs not in tag index         │
  │                                                    │
  │  NDJSON output stream:                             │
  │  {"type":"context", root, neighbors, edges, ...}   │
  │  {"i":0, "text":"...", "highlights":[...]}         │
  │  {"i":1, "text":"...", "highlights":[...]}         │
  │  ...                                               │
  │  {"done":true, "count":6}                          │
  └────────────────────────────────────────────────────┘
           │
           ▼ NDJSON stream
  WalkthroughPanel (client)
  ├── line type=context → render GbrainGraph + provenance card
  └── line type=beat    → append beat; on click → applyBeatHighlights()
```

---

## Tag Index: How Locations Are Built at Boot

```
src/app/page.tsx (server component)
  └─► getTagIndex()
        │
        ├─► loadPdf(samplesDir, "pid.pdf")
        │     ├── pdf-lib reads page count + dimensions
        │     └── reads pid.pdf.bboxes.json (hand-annotated)
        │           → { page, bbox:[x0,y0,x1,y1], tag, pageWidth, pageHeight }
        │
        ├─► loadDocx(samplesDir, "process_narrative.docx")
        │     ├── mammoth converts DOCX → HTML
        │     └── regex wraps each tag in <mark id="tag-LSL-201-1">
        │           → { html, occurrences:[{ tag, anchorId, snippet }] }
        │
        └─► loadXlsx(samplesDir, "equipment_list.xlsx")
              ├── SheetJS reads workbook
              └── scans col[0] for tags
                    → { sheets, tagRows:[{ tag, sheet, rowIndex, values }] }

Result: TagIndex = Record<Tag, TagLocation[]>
  "LSL-201" → [
    { kind:"pdf",  slug:"pid",               page:1, bbox:[120,340,200,360], ... },
    { kind:"docx", slug:"process_narrative", anchorId:"tag-LSL-201-1", snippet:"..." },
    { kind:"xlsx", slug:"equipment_list",    sheet:"Sheet1", rowIndex:3, values:[...] },
  ]
```

---

## Highlight Mechanism

```
                  ┌──────────────────────────────────┐
                  │  Zustand Store                   │
                  │  activeDoc: DocSlug              │
                  │  highlights: Highlight[]         │
                  │    { tag, location: TagLocation }│
                  └──────────────────────────────────┘
                     ▲                    │ reads
           writes    │                   ▼
  ┌──────────────────┴──┐    ┌─────────────────────────┐
  │ selectTag(tag, locs)│    │  PdfViewer              │
  │   (tag click)       │    │  overlay divs at bboxes │
  │                     │    │  ring + shadow on match │
  │ applyBeatHighlights │    ├─────────────────────────┤
  │   (beat click)      │    │  DocxViewer             │
  │   resolves (tag,doc)│    │  .kb-tag-active on      │
  │   → TagLocations    │    │  <mark> elements        │
  │   auto-switches doc │    │  scrollIntoView()       │
  └─────────────────────┘    ├─────────────────────────┤
                             │  XlsxViewer             │
                             │  amber ring on row      │
                             │  matching tag in col[0] │
                             └─────────────────────────┘

Click sources that write to store:
  TagsSidebar   ──┐
  PdfViewer     ──┤──► onTagClick(tag) → selectTag(tag, tagIndex[tag])
  DocxViewer    ──┤
  XlsxViewer    ──┤
  GbrainGraph   ──┘  (re-triggers walkthrough on related tag)
```

---

## Component Tree

```
app/page.tsx  (server, calls getTagIndex())
  └─► DemoLayout
        ├─► TagsSidebar
        │     └── Tag buttons (TAGS array)
        │           onClick → selectTag() in store
        │
        ├─► DocTabs
        │     └── Tab per DOCS entry
        │           onClick → setActiveDoc() in store
        │
        ├─► [Document Viewer — switches on activeDoc.kind]
        │     ├── PdfViewer
        │     │     ├── Canvas per page (PDF.js)
        │     │     └── Overlay divs per bbox (highlight layer)
        │     ├── DocxViewer
        │     │     └── dangerouslySetInnerHTML (mammoth HTML)
        │     └── XlsxViewer
        │           └── <table> per sheet (SheetJS)
        │
        └─► WalkthroughPanel
              ├── Tag selector <select>
              ├── Model selector <select>
              ├── "Walk through" <button>
              ├── GbrainGraph (SVG, shown after context line)
              │     └── Nodes: root (emerald), docs (indigo), tags (amber)
              │           onNodeClick → re-run walkthrough on that tag
              └── Beats list
                    └── Beat cards (stream in)
                          onClick → applyBeatHighlights()
```

---

## gbrain Integration

```
src/lib/gbrain.ts
  runGbrain(args: string[])
    └── child_process.execFile(
          "gbrain", args,
          { env: { PATH: "~/.bun/bin:$PATH" } }   ← bun shebang needs this
        )
        strips "[ai.gateway]" noise from stdout
        returns parsed JSON

  Exported functions:
  ┌─────────────────────────────────────────────────────────┐
  │ graph(slug, depth=1)                                    │
  │   → gbrain graph <slug> --depth <depth>                 │
  │   → GraphNode[] (slug, type, label, neighbors)          │
  │                                                         │
  │ backlinks(slug)                                         │
  │   → gbrain backlinks <slug>                             │
  │   → { from_slug, context }[]                            │
  │                                                         │
  │ search(query, limit=10)                                 │
  │   → gbrain search <query> --limit <limit>               │
  │   → SearchHit[]                                         │
  │                                                         │
  │ getPage(slug)                                           │
  │   → gbrain get <slug>                                   │
  │   → { slug, title, body, frontmatter } | null           │
  └─────────────────────────────────────────────────────────┘

Brain lives at: ~/.gbrain/brain.pglite  (PGLite, no Postgres needed)
Seed source:    samples/brain-md/       (13 markdown files, wikilinks)
```

---

## Data Schemas

```
Tag (src/lib/tags.ts)
  'FT-301' | 'FT-302' | 'FT-303' | 'PIT-305' | 'PIT-312'
  | 'LSL-201' | 'LIT-501' | 'HV-507' | ...

DocSlug (src/lib/docs.ts)
  'pid' | 'instrument_list' | 'ro_spec' | 'equipment_list' | 'process_narrative'

TagLocation (src/lib/tagIndex.ts)
  | { kind:'pdf',  slug, page, bbox:[x0,y0,x1,y1], pageWidth, pageHeight }
  | { kind:'docx', slug, anchorId, snippet }
  | { kind:'xlsx', slug, sheet, rowIndex, values }

Beat (Zod schema in /api/walkthrough/route.ts)
  { text: string, highlights: { tag: Tag, doc: DocSlug }[1..3] }

WalkthroughStream (NDJSON)
  line 0: { type:'context', root, neighbors, edges, backlinks }
  line N: { i:N, text:string, highlights:Highlight[] }
  last:   { done:true, count:N }
```

---

## File Map

```
src/
├── app/
│   ├── page.tsx                    server root — calls getTagIndex(), renders DemoLayout
│   ├── layout.tsx                  HTML shell, fonts, Tailwind
│   ├── globals.css                 Tailwind base + custom .kb-tag-active styles
│   └── api/
│       ├── walkthrough/route.ts    POST — gbrain context + AI stream + hallucination filter
│       ├── tag-index/route.ts      GET  — exposes built index as JSON
│       └── samples/[filename]/route.ts  GET — serves demo_docs/ files by slug
│
├── components/
│   ├── DemoLayout.tsx              3-column shell; wires onTagClick to viewers
│   ├── DocTabs.tsx                 tab bar; sets activeDoc in store
│   ├── TagsSidebar.tsx             left panel; lists all tags + click handler
│   ├── WalkthroughPanel.tsx        right panel; streams NDJSON, renders beats
│   ├── GbrainGraph.tsx             deterministic radial SVG; no physics lib
│   ├── PdfViewer.tsx               PDF.js canvas + bbox overlay divs
│   ├── DocxViewer.tsx              renders mammoth HTML; toggles .kb-tag-active
│   └── XlsxViewer.tsx              renders SheetJS table; highlights matching rows
│
└── lib/
    ├── tags.ts                     TAGS const, Tag type, isTag(), TAG_REGEX
    ├── docs.ts                     DOCS[], TAG_DESCRIPTIONS, TAG_APPEARS_IN
    ├── store.ts                    Zustand — activeDoc, highlights, selectTag()
    ├── aiModels.ts                 model list for AI Gateway; default model
    ├── gbrain.ts                   shell-out client: graph(), backlinks(), getPage()
    ├── tagIndex.ts                 builds TagIndex at boot; cached in module scope
    ├── walkthroughContext.ts       fetches gbrain subgraph + builds LLM prompt
    └── ingestion/
        ├── pdf.ts                  pdf-lib + .bboxes.json sidecar loader
        ├── docx.ts                 mammoth → HTML + <mark> injection
        └── xlsx.ts                 SheetJS → sheets + tagRows

samples/
├── brain-md/       13 markdown files seeding the gbrain knowledge graph
├── bboxes.schema.json  JSON schema for hand-annotated PDF bbox sidecars
└── gbrain-seed/    additional seed corpus

demo_docs/          actual engineering documents (PDF, XLSX, DOCX)
scripts/
├── preflight.mjs   checks gbrain is reachable before pnpm dev starts
├── setup.sh        (incomplete) should auto-install Bun + gbrain + seed brain
└── gen-placeholders.ts  generates stub sample documents
```

---

## Hallucination Filter

The LLM is not trusted to produce valid (tag, doc) highlight pairs. Every beat goes through `filterBeat`:

```
validPairs = Set of "tag:doc" strings built from tagIndex
  e.g. "LSL-201:pid", "LSL-201:process_narrative", "CB-101:equipment_list"

filterBeat(beat, validPairs):
  beat.highlights = beat.highlights.filter(h =>
    validPairs.has(`${h.tag}:${h.doc}`)
  )
  if highlights.length === 0 → drop beat entirely
```

This ensures every highlight the UI renders corresponds to a real, locatable occurrence in an actual document.
