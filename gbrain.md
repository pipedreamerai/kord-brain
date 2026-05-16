# How gbrain Is Used in kord-brain

gbrain is a TypeScript/Bun knowledge graph engine. It stores markdown pages with typed wikilinks in a PGLite database, and exposes a CLI for graph traversal, backlink lookup, and page retrieval. kord-brain uses it as a **context selector**: instead of dumping all documents into the LLM prompt, gbrain decides which pages are relevant for a given tag, and only those pages become the LLM's context.

---

## 1. What gbrain is (runtime picture)

```
~/.gbrain/brain.pglite          ← PGLite database (SQLite in-process, no Postgres)
       │
       │  stores
       ▼
  Pages + Links
  ┌──────────────────────────────────────────────────┐
  │ Page: slug="lsl-201"                             │
  │   title: "LSL-201 — Pump Suction Level Switch"  │
  │   type: "tag"                                    │
  │   markdown: "...Grundfos 98071114...             │
  │              [[instrument_list]] [[ft-301]]..."  │
  ├──────────────────────────────────────────────────┤
  │ Page: slug="instrument_list"                     │
  │   type: "document"                               │
  │   markdown: "...[[ft-301]] [[lsl-201]]..."       │
  └──────────────────────────────────────────────────┘
       │
       │  queried via
       ▼
~/.bun/bin/gbrain               ← Bun script (#!/usr/bin/env bun)
       │
       │  called via
       ▼
src/lib/gbrain.ts               ← Node.js shell-out client
       │
       │  used by
       ▼
src/lib/walkthroughContext.ts   ← builds LLM prompt context
src/app/api/walkthrough/route.ts ← streams the walkthrough
```

---

## 2. The knowledge graph: what's seeded

The brain is seeded from `samples/brain-md/` — 13 flat markdown files with `[[wikilink]]` references. Every `[[slug]]` becomes a directed edge in the graph.

```
samples/brain-md/
├── ft-301.md          (tag page)
├── ft-302.md          (tag page)
├── ft-303.md          (tag page)
├── pit-305.md         (tag page)
├── pit-312.md         (tag page)
├── lsl-201.md         (tag page)
├── lit-501.md         (tag page)
├── hv-507.md          (tag page)
├── pid.md             (document page)
├── instrument_list.md (document page)
├── equipment_list.md  (document page)
├── process_narrative.md (document page)
└── ro_spec.md         (document page)
```

Tag pages describe what a component is, where it appears, and what it connects to:

```
--- lsl-201.md ---

title: LSL-201 — Pump Suction Level Switch #1
type: tag

# [[lsl-201]] — Pump Suction Level Switch #1

Grundfos rigid suction lance. Digital switch output.
Dry-run protection for the RO feed pump.

## Appears in
- [[instrument_list]]
- [[equipment_list]]
- [[process_narrative]]

## Related tags
- [[ft-301]]   ← if lsl-201 trips, feed flow goes to zero
- [[lit-501]]  ← downstream level
- [[pit-305]]  ← discharge pressure collapses before lsl-201 catches it
```

Document pages describe what a document contains and which tags appear in it:

```
--- instrument_list.md ---

title: Instrument List — Evoqua Project 2034/001845
type: document

# [[instrument_list]] — Instrument List

Formal instrument schedule...
[[ft-301]], [[ft-302]], [[ft-303]] — Georg Fischer Signet
[[lsl-201]] — Grundfos 98071114
[[lit-501]] — Rosemount 3051L2AA2AD11AAM5Q4 (14-week lead)
...
```

Each `[[slug]]` in the markdown becomes a directed link edge in the PGLite graph. After seeding, the graph has ~90 typed edges connecting 13 pages.

**How to seed (manual):**

```bash
export PATH="$HOME/.bun/bin:$PATH"
gbrain import samples/brain-md --no-embed
gbrain extract links --source fs --dir samples/brain-md
gbrain stats   # → Pages: 13, Links: ~90
```

---

## 3. The subprocess mechanism

gbrain is never run as a persistent server. Every call is a fresh subprocess.

```
src/lib/gbrain.ts

const GBRAIN_BIN = process.env.GBRAIN_BIN ?? 'gbrain';
const BUN_BIN_DIR = process.env.BUN_BIN_DIR ?? `${homedir()}/.bun/bin`;

const SPAWN_ENV = {
  ...process.env,
  PATH: `${BUN_BIN_DIR}:${process.env.PATH}`,   ← inject Bun so the shebang resolves
};

async function runGbrain(args: string[]): Promise<string> {
  const { stdout } = await execFileP(GBRAIN_BIN, args, {
    env: SPAWN_ENV,
    maxBuffer: 16 * 1024 * 1024,                ← 16 MB cap on stdout
  });
  return stripGatewayNoise(stdout);              ← strips "[ai.gateway]" log lines
}
```

Why PATH injection? The `gbrain` binary is a Bun script (`#!/usr/bin/env bun`). The Next.js dev server may not have `~/.bun/bin` on its PATH if it was started from a non-login shell. Injecting it at spawn time makes the shebang resolve regardless.

```
Next.js server process
    │
    └─► child_process.execFile("gbrain", [...args], { env: { PATH: "~/.bun/bin:..." } })
            │
            └─► /usr/bin/env bun ~/.bun/bin/gbrain [...args]
                      │
                      └─► reads ~/.gbrain/brain.pglite
                          writes JSON to stdout
                          exits
```

---

## 4. The four CLI commands used

### 4a. `gbrain graph <slug> --depth 1`

Returns the 1-hop subgraph reachable from a slug — every page that `slug` links to, and every page those pages link to (at depth 1, just the direct neighbors).

```
gbrain graph lsl-201 --depth 1

Output (JSON array):
[
  {
    "slug": "lsl-201",
    "title": "LSL-201 — Pump Suction Level Switch #1",
    "type": "tag",
    "depth": 0,                    ← this is the root node
    "links": [
      { "to_slug": "instrument_list", "link_type": "appears_in" },
      { "to_slug": "equipment_list",  "link_type": "appears_in" },
      { "to_slug": "process_narrative", "link_type": "appears_in" },
      { "to_slug": "ft-301",          "link_type": "related" },
      { "to_slug": "lit-501",         "link_type": "related" },
      { "to_slug": "pit-305",         "link_type": "related" }
    ]
  },
  { "slug": "instrument_list", "depth": 1, "links": [...] },
  { "slug": "equipment_list",  "depth": 1, "links": [...] },
  ...
]
```

TypeScript type:
```
type GraphLink = { to_slug: string; link_type: string };
type GraphNode = {
  slug: string;
  title: string;
  type: string;
  depth: number;      // 0 = root, 1 = neighbor
  links: GraphLink[];
};
```

### 4b. `gbrain backlinks <slug>`

Returns all pages that link **to** this slug (incoming edges, not outgoing).

```
gbrain backlinks lsl-201

Output (JSON array):
[
  {
    "from_slug": "ro_spec",
    "to_slug": "lsl-201",
    "link_type": "references",
    "context": "Shutdown alarms: low suction [[lsl-201]] closes feed valve...",
    "link_source": "fs"
  },
  {
    "from_slug": "process_narrative",
    "to_slug": "lsl-201",
    "link_type": "references",
    "context": "[[lsl-201]] is the primary dry-run protection..."
  }
]
```

This captures references from pages that `lsl-201` doesn't link to itself — like `ro_spec`, which mentions the tag in its shutdown alarm list.

### 4c. `gbrain get <slug>`

Returns the full markdown content of a single page, with YAML frontmatter.

```
gbrain get lsl-201

Output (raw text):
---
title: LSL-201 — Pump Suction Level Switch #1
type: tag
component_kind: instrument
---

# [[lsl-201]] — Pump Suction Level Switch #1

Grundfos rigid suction lance level alarm, part 98071114...
```

Parsed into:
```
type Page = {
  slug: string;
  frontmatter: Record<string, string>;   // { title, type, component_kind }
  markdown: string;                       // body after the --- delimiters
};
```

### 4d. `gbrain search <query> --limit N`

Keyword search across all pages. Returns slug, relevance score, and a snippet. (Used less in the current walkthrough flow, available for Q&A work.)

```
gbrain search "lead time" --limit 5

Output (text lines):
[0.92] equipment_list -- Rosemount 3051L at 14 weeks is longest-lead...
[0.81] lit-501 -- 14-week lead time, order before MCC/PLC package
...
```

---

## 5. How `buildWalkthroughContext` combines the three calls

When a user clicks "Walk through LSL-201", `walkthroughContext.ts` runs three gbrain calls in parallel, then fetches pages for every neighbor found.

```
buildWalkthroughContext("LSL-201")
    │
    │  step 1: parallel fan-out
    ├─► graph("lsl-201", 1)       ← gbrain graph lsl-201 --depth 1
    │     returns: GraphNode[] with depth-0 root + depth-1 neighbors
    │
    └─► backlinks("lsl-201")      ← gbrain backlinks lsl-201
          returns: Backlink[] (pages that mention lsl-201)

    │  step 2: collect all neighbor slugs
    │    from graph nodes at depth > 0: instrument_list, equipment_list,
    │                                   process_narrative, ft-301, lit-501, pit-305
    │    from backlinks not already in graph: ro_spec
    │
    │  step 3: parallel page fetch
    ├─► getPage("lsl-201")         ← root page (the tag itself)
    ├─► getPage("instrument_list")
    ├─► getPage("equipment_list")
    ├─► getPage("process_narrative")
    ├─► getPage("ft-301")
    ├─► getPage("lit-501")
    ├─► getPage("pit-305")
    └─► getPage("ro_spec")

    │  step 4: classify each neighbor
    │    "instrument_list" → kind:'document'  (matches a DocSlug in DOCS[])
    │    "ft-301"          → kind:'tag'        (matches /^[a-z]+-\d+$/)
    │    anything else     → kind:'unknown'
    │
    └─► returns WalkthroughContext {
          tag: "LSL-201",
          rootSlug: "lsl-201",
          rootPage: Page,           // lsl-201.md content
          neighbors: GbrainNeighbor[], // 7 neighbor pages with kind
          graph: GraphNode[],       // raw graph structure
          incoming: [               // backlink slugs + context snippets
            { from_slug: "ro_spec", context: "..." }
          ]
        }
```

**Total subprocess calls: 3 batch + N page fetches in parallel.**

For LSL-201 that's: 2 (graph + backlinks) + 8 (root + 7 neighbors) = **10 subprocess calls**, all resolved before the LLM gets any context.

---

## 6. How gbrain context becomes the LLM prompt

`buildPrompt(ctx)` in `walkthroughContext.ts` assembles the prompt from the gbrain output:

```
buildPrompt(ctx: WalkthroughContext) → string

Prompt structure:
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM ROLE                                                     │
│ "You are a senior process/instrumentation engineer walking a    │
│  colleague through component LSL-201 (Pump Suction Level        │
│  Switch #1)..."                                                 │
│                                                                 │
│ GROUNDING STATEMENT                                             │
│ "The context below was selected by gbrain. gbrain ingested      │
│  raw engineering docs, extracted entity wiki-links, and         │
│  returned the subgraph reachable from lsl-201. The LLM only    │
│  sees what gbrain says is connected."                           │
│                                                                 │
│ HARD RULES                                                      │
│ - Only use tags and doc slugs from the lists below              │
│ - Never reference a (tag, doc) pair not in the gbrain context   │
│ - Stay strictly inside what gbrain pages say                    │
│                                                                 │
│ GRAPH EDGES (from GraphNode.links where depth=0)                │
│   lsl-201 → instrument_list (appears_in)                        │
│   lsl-201 → equipment_list  (appears_in)                        │
│   lsl-201 → process_narrative (appears_in)                      │
│   lsl-201 → ft-301  (related)                                   │
│   lsl-201 → lit-501 (related)                                   │
│   lsl-201 → pit-305 (related)                                   │
│                                                                 │
│ BACKLINKS                                                       │
│   "Backlinks: ro_spec"                                          │
│                                                                 │
│ ROOT PAGE (full markdown of lsl-201.md)                         │
│   "Grundfos rigid suction lance...                              │
│    Dry-run protection for the RO feed pump..."                  │
│                                                                 │
│ NEIGHBOR PAGES (full markdown of each)                          │
│   === Connected document: instrument_list ===                   │
│   ...instrument_list.md content...                              │
│                                                                 │
│   === Connected component: ft-301 ===                           │
│   ...ft-301.md content...                                       │
│                                                                 │
│   === Connected document: ro_spec ===                           │
│   ...ro_spec.md content (from backlinks)...                     │
│   ...                                                           │
│                                                                 │
│ OUTPUT INSTRUCTION                                              │
│ "Output each beat as a JSON object as soon as it is ready."     │
└─────────────────────────────────────────────────────────────────┘
```

**Key property:** the LLM has no access to the raw engineering PDFs. It only knows what gbrain's markdown pages contain. gbrain is the sole arbiter of what's relevant.

---

## 7. The context line sent to the UI

Before the LLM starts streaming, the route emits the gbrain context as the **first NDJSON line**. This is what powers the radial graph visualization.

```
/api/walkthrough emits (line 0):
{
  "type": "context",
  "root": "lsl-201",
  "neighbors": [
    { "slug": "instrument_list", "kind": "document", "title": "Instrument List — Evoqua..." },
    { "slug": "equipment_list",  "kind": "document", "title": "Equipment List — Evoqua..." },
    { "slug": "ft-301",          "kind": "tag",       "title": "FT-301 — 1st Pass Feed Flow..." },
    { "slug": "lit-501",         "kind": "tag",       "title": "LIT-501 — RODI Buffer Tank..." },
    { "slug": "pit-305",         "kind": "tag",       "title": "PIT-305 — 1st Pass HP Pump..." },
    { "slug": "ro_spec",         "kind": "unknown",   "title": "RO Unit Description..." }
  ],
  "edges": [
    { "from": "lsl-201", "to": "instrument_list", "kind": "appears_in" },
    { "from": "lsl-201", "to": "ft-301",          "kind": "related" },
    ...
  ],
  "backlinks": ["ro_spec"]
}
```

`WalkthroughPanel` receives this line and calls `setGbrainCtx(...)`, which triggers `GbrainGraph` to render:

```
GbrainGraph (320×220 SVG, no physics lib, deterministic layout):

                    instrument_list (indigo)
                           ●
                          ↗
            ro_spec  ●          ● equipment_list (indigo)
           (gray)   ↗            ↖
                                  ●  lsl-201  (emerald, root, center)
            pit-305  ●           ↙
            (amber)   ↘         ↗
                         ●  ft-301 (amber)
                        ↗
                   lit-501 (amber)

  emerald = root tag
  indigo  = document node  (matches a DocSlug)
  amber   = tag node       (matches /^[a-z]+-\d+$/)
  gray    = unknown
  clicking an amber node re-runs the walkthrough on that tag
```

---

## 8. End-to-end data flow

```
User: "Walk through LSL-201"
    │
    ▼
WalkthroughPanel.startWalkthrough()
  POST /api/walkthrough { tag: "LSL-201", model: "..." }
    │
    ▼
route.ts: buildWalkthroughContext("LSL-201")
    │
    ├── gbrain graph lsl-201 --depth 1    ─┐
    │      → GraphNode[]                  ├─ parallel (Promise.all)
    └── gbrain backlinks lsl-201          ─┘
           → Backlink[]
    │
    ▼  collect neighbor slugs: instrument_list, equipment_list,
    │  process_narrative, ft-301, lit-501, pit-305, ro_spec (from backlinks)
    │
    ├── gbrain get lsl-201           ─┐
    ├── gbrain get instrument_list   ├─ parallel (Promise.all, N+1 calls)
    ├── gbrain get equipment_list    │
    ├── gbrain get process_narrative │
    ├── gbrain get ft-301            │
    ├── gbrain get lit-501           │
    ├── gbrain get pit-305           │
    └── gbrain get ro_spec           ─┘
    │
    ▼
  WalkthroughContext {
    rootPage: lsl-201 markdown,
    neighbors: [7 Page objects],
    graph: GraphNode[],
    incoming: [{ from_slug:"ro_spec", context:"..." }]
  }
    │
    ▼
  buildPrompt(ctx)
    → single string with graph edges + all page markdowns
    │
    ▼
  streamObject(AI Gateway, Beat schema)
    → streams Beat[] as they complete
    │
    ▼  for each beat:
  filterBeat(beat, validPairs)
    → drops any (tag, doc) not present in tagIndex
    → ensures highlight coords exist before emitting
    │
    ▼
  NDJSON stream to client:

  LINE 0: { type:"context", root, neighbors, edges, backlinks }
              │
              └─► WalkthroughPanel: setGbrainCtx() → GbrainGraph renders

  LINE 1: { i:0, text:"LSL-201 is the primary dry-run protection...",
                 highlights:[{tag:"LSL-201", doc:"instrument_list"}] }
              │
              └─► WalkthroughPanel: setBeats(), applyBeat(0)
                     └─► resolveHighlights() → tagIndex["LSL-201"]
                              finds location in instrument_list (xlsx row)
                         applyBeatHighlights() → Zustand store
                              XlsxViewer highlights row 5

  LINE 2: { i:1, text:"10-week lead time on this Grundfos lance...",
                 highlights:[{tag:"LSL-201", doc:"equipment_list"}] }
              └─► highlights jump to equipment_list spreadsheet

  LINE 3: { i:2, text:"PLC shuts pump on LSL trip before PIT-305 detects...",
                 highlights:[{tag:"LSL-201", doc:"process_narrative"},
                              {tag:"PIT-305", doc:"instrument_list"}] }
              └─► highlights jump across two docs simultaneously

  ...
  LINE N: { done:true, count:5 }
```

---

## 9. What gbrain is NOT doing here

- **Not doing vector/semantic search.** `gbrain import --no-embed` skips embeddings. All graph traversal is purely structural — edges from `[[wikilinks]]` in the seed markdown.
- **Not parsing the actual engineering PDFs.** The brain-md pages are human-written summaries of what's in those documents. gbrain never reads the PDFs directly.
- **Not persisting walkthrough state.** Each request shells out fresh; nothing is written back to the brain during a walkthrough.
- **Not selecting highlights.** gbrain provides the context; the LLM decides which (tag, doc) pairs to highlight per beat; `filterBeat` then validates those choices against the tag index.

---

## 10. Gotchas specific to this integration

```
GOTCHA 1: Wikilink slug casing
  [[M-101]] resolves to slug "m-101" (path-derived, lowercase).
  gbrain does NOT match [[M-101]] to slug "m-101" — write [[m-101]].
  Adding "slug:" to frontmatter causes gbrain to skip the file entirely.

GOTCHA 2: extract links --source db returns 0 edges
  Always use: gbrain extract links --source fs --dir samples/brain-md
  (gbrain bug or design — db source extracts nothing)

GOTCHA 3: Bun must be on PATH at spawn time
  gbrain binary is a Bun script. runGbrain() injects ~/.bun/bin defensively.
  If gbrain is installed elsewhere, set BUN_BIN_DIR env var.

GOTCHA 4: No embeddings = no hybrid search
  gbrain query (semantic) returns "No results".
  gbrain search (keyword) works.
  gbrain graph / backlinks / get all work (graph traversal is not embedding-based).

GOTCHA 5: [ai.gateway] noise in stdout
  gbrain emits "[ai.gateway] ..." log lines on stdout.
  stripGatewayNoise() filters these before JSON.parse.
  Without it, JSON.parse throws on lines that aren't valid JSON.
```
