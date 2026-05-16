# How gbrain is used in kord-brain

gbrain is a TypeScript/Bun knowledge-graph engine. It stores markdown pages with typed `[[wikilinks]]` in a PGLite database and exposes a CLI for graph traversal, backlink lookup, and page retrieval. kord-brain uses gbrain as the **runtime knowledge graph** for an otherwise stateless app — every dev server start nukes the brain, the user clicks **Seed Knowledge Base**, and the app fills it on demand by parsing `demo_docs/`.

This doc covers:
1. What gbrain does and doesn't do natively.
2. How `demo_docs/` (raw PDFs/DOCX/XLSX) becomes gbrain pages on a Seed click.
3. The CLI calls the running app makes and how they flow into the LLM prompt.

---

## 1. What gbrain is (runtime picture)

```
~/.gbrain/brain.pglite       ← PGLite database (in-process SQLite, no Postgres)
       │   wiped at every `pnpm dev` (scripts/preflight.mjs)
       │
       │  written by
       ▼
gbrain import <tmpdir>        ← Bun script (#!/usr/bin/env bun)
                                  imports markdown pages
                                  upsert by path-derived slug
                                  extracts [[wikilinks]] → edges
       │
       │  read by
       ▼
src/lib/gbrain.ts             ← Node-side execFile wrapper
       │
       │  used by
       ▼
/api/seed         (writes — via tmpdir import)
/api/graph        (reads — list + graph per slug)
/api/walkthrough  (reads — graph + backlinks + getPage)
```

**Important: gbrain does not parse PDFs / DOCX / XLSX out of the box.** Its only input is markdown with `[[wikilinks]]`. kord-brain bridges that gap inside `/api/seed` (see §3).

What gbrain *does* offer (per `gbrain --help`):

```
SETUP       init / migrate / upgrade / doctor / integrations
PAGES       get / put / delete / list
SEARCH      search (tsvector keyword) / query (hybrid RRF) / ask
IMPORT      import <dir> / sync (git→brain) / export
FILES       files upload / signed-url / sync / verify   ← binary attachments only
EMBEDDINGS  embed (per slug / all / stale)
LINKS       link / unlink / backlinks / graph / graph-query
TAGS        tags / tag / untag
TIMELINE    timeline / timeline-add
```

We only use `init`, `list`, `import`, `extract links`, `get`, `graph`, `backlinks`, `stats`, and `delete`.

---

## 2. The seed pipeline — how raw docs become brain pages

When the user clicks **Seed Knowledge Base**, `/api/seed` runs this pipeline per doc in `demo_docs/`:

```
Stage 1: raw doc → plain text   (deterministic, no LLM)
────────────────────────────────────────────────────────
  pdf  → loadPdf(...)   uses pdfjs-dist; pulls text per page
  docx → loadDocx(...)  uses mammoth; pulls text + HTML
  xlsx → loadXlsx(...)  uses SheetJS; flattens sheets to text

  These are the same parsers the tag index uses, so the LLM
  sees the same content that highlights resolve against.


Stage 2: text → brain-md         (one LLM call per doc)
────────────────────────────────────────────────────────
  streamObject({
    model: gateway('anthropic/claude-opus-4-7'),
    schema: SeedExtraction,
    system: "You convert an engineering document into a
             knowledge-graph page set. Emit valid wikilinks
             using lowercase path-derived slugs only.",
    prompt: {
      docSlug:    DOCS[i].slug,
      kind:       DOCS[i].kind,
      displayName: DOCS[i].displayName,
      text:       <stage-1 output>,
      knownSlugs: [...slugs already in the brain],
    },
  })

  Expected output:
    {
      docPage: { slug, title, type:'document', markdown },
      tagPages: [
        { slug, title, type:'tag', markdown },
        ...
      ]
    }

  Hard constraints in the prompt:
    • Every [[wikilink]] is a lowercase path-derived slug.
    • Document slugs come from the DOCS table (passed in).
    • Tag slugs are tag-string-lowercased (e.g. "LSL-201" → "lsl-201").
    • A tag page may only reference docs whose slug appeared in knownSlugs
      or in the current docPage.


Stage 3: write to tmpdir + gbrain import
────────────────────────────────────────────────────────
  const dir = mkdtemp(os.tmpdir(), 'kord-brain-seed-')
  await writeFile(`${dir}/${docPage.slug}.md`,  docPage.markdown)
  for (const tp of tagPages) {
    await writeFile(`${dir}/${tp.slug}.md`, tp.markdown)
  }

  await runGbrain(['import', dir, '--no-embed'])
  await runGbrain(['extract', 'links', '--source', 'fs', '--dir', dir])

  // upsert-by-slug — re-running a seed adds new pages without
  // disturbing existing ones.


Stage 4: emit NDJSON events to the UI
────────────────────────────────────────────────────────
  for each new page:
    emit { type:'brain_node', slug, title, kind, snippet:markdown.slice(0,200) }
  for each new edge from `gbrain graph <slug> --depth 1`:
    emit { type:'brain_edge', from, to, kind:link.link_type }
  emit { type:'doc_done', slug, displayName, kind, tagCount, tags:[...] }
```

After every doc, the loop continues to the next file. After every doc in `demo_docs/` has been processed:

```
Stage 5: build the tag index from demo_docs/
────────────────────────────────────────────────────────
  const { tagIndex, docs } = await getTagIndex()
    // reads PDFs/DOCX/XLSX directly and builds tag → [TagLocation[]]
    // for the highlight overlay and hallucination filter.

  emit { type:'graph_ready', nodes, edges }
  emit { type:'complete',    totalTagged, docCount }
```

---

## 3. The four CLI commands the running app uses

### 3a. `gbrain list -n <limit>`

Used to discover which slugs are already in the brain so the seed pipeline can skip them.

```
gbrain list -n 500

Output: one slug per line
  bid_pid
  dd_full_pid
  lsl-201
  ft-301
  ...
```

### 3b. `gbrain graph <slug> --depth N`

Returns the 1-hop subgraph reachable from a slug.

```
gbrain graph lsl-201 --depth 1

[
  {
    "slug": "lsl-201",
    "title": "LSL-201 — Pump Suction Level Switch",
    "type": "tag",
    "depth": 0,
    "links": [
      { "to_slug": "dd_instrument_list", "link_type": "appears_in" },
      { "to_slug": "ft-301",             "link_type": "related"   },
      ...
    ]
  },
  { "slug": "dd_instrument_list", "depth": 1, "links": [...] },
  ...
]
```

TypeScript wrapper:

```ts
type GraphLink = { to_slug: string; link_type: string };
type GraphNode = {
  slug: string;
  title: string;
  type: string;
  depth: number;      // 0 = root, 1 = neighbour
  links: GraphLink[];
};

graph(slug, depth = 1): Promise<GraphNode[]>
```

### 3c. `gbrain backlinks <slug>`

Returns all pages that link **to** this slug (incoming edges).

```
gbrain backlinks lsl-201

[
  { "from_slug": "rfq",
    "to_slug": "lsl-201",
    "link_type": "references",
    "context": "Shutdown alarms: low suction [[lsl-201]] closes feed valve…"
  },
  ...
]
```

### 3d. `gbrain get <slug>`

Returns the full markdown of a page, with YAML frontmatter.

```
gbrain get lsl-201

---
title: LSL-201 — Pump Suction Level Switch
type: tag
---

# [[lsl-201]] — Pump Suction Level Switch
...
```

Parsed into:

```ts
type Page = {
  slug: string;
  frontmatter: Record<string, string>;
  markdown: string;
};
```

---

## 4. How walkthrough context is assembled

When a user clicks a tag, `/api/walkthrough` calls `buildWalkthroughContext(tag)` in `src/lib/walkthroughContext.ts`:

```
buildWalkthroughContext("LSL-201")
    │
    ├─► graph("lsl-201", 1)                ┐
    └─► backlinks("lsl-201")               ├─ parallel
                                            ┘
    │
    │   neighbour slugs collected from both responses
    │
    ├─► getPage("lsl-201")                  ┐
    ├─► getPage("dd_instrument_list")       │
    ├─► getPage("dd_full_pid")              ├─ parallel
    ├─► getPage("ft-301")                   │
    └─► getPage(...)                        ┘
    │
    └─► WalkthroughContext {
          tag, rootSlug, rootPage,
          neighbors: GbrainNeighbor[],   // classified as 'document' | 'tag' | 'unknown'
          graph:     GraphNode[],
          incoming:  Backlink[]
        }
```

`buildPrompt(ctx)` assembles a prompt for `streamObject(...)`:

```
SYSTEM
  "You are a senior process/instrumentation engineer walking
   a colleague through component LSL-201..."

GROUNDING
  "Context below was selected by gbrain. The LLM only sees
   what gbrain says is connected. Tag occurrences in the UI
   are validated against the tag index."

HARD RULES
  • Only reference tags and doc slugs that appear in the
    lists below.
  • Never reference a (tag, doc) pair not in the gbrain
    context — the post-filter will drop it.

GRAPH EDGES (from GraphNode.links where depth=0)
  lsl-201 → dd_instrument_list (appears_in)
  lsl-201 → dd_full_pid        (appears_in)
  lsl-201 → ft-301             (related)
  ...

BACKLINKS
  Backlinks: rfq, process_narrative

ROOT PAGE
  <full markdown of lsl-201>

NEIGHBOUR PAGES
  === Connected document: dd_instrument_list ===
  <full markdown>

  === Connected component: ft-301 ===
  <full markdown>
  ...

OUTPUT INSTRUCTION
  "Output each beat as a JSON object as soon as it is ready."
```

The LLM has no access to the raw engineering PDFs — only what gbrain pages say. gbrain is the sole arbiter of relevance.

---

## 5. The subprocess mechanism

gbrain is not a persistent server. Every call is a fresh subprocess.

```
src/lib/gbrain.ts

const GBRAIN_BIN  = process.env.GBRAIN_BIN  ?? 'gbrain';
const BUN_BIN_DIR = process.env.BUN_BIN_DIR ?? `${homedir()}/.bun/bin`;

const SPAWN_ENV = {
  ...process.env,
  PATH: `${BUN_BIN_DIR}:${process.env.PATH}`,   // inject Bun so the shebang resolves
};

async function runGbrain(args: string[]) {
  const { stdout } = await execFileP(GBRAIN_BIN, args, {
    env: SPAWN_ENV,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stripGatewayNoise(stdout);
}
```

Why PATH injection? The `gbrain` binary is a Bun script (`#!/usr/bin/env bun`). The Next.js dev server may not have `~/.bun/bin` on its PATH if it was launched from a non-login shell. Injecting it at spawn time makes the shebang resolve regardless.

```
Next.js server process
    │
    └─► child_process.execFile("gbrain", […args], { env: { PATH: "~/.bun/bin:…" } })
            │
            └─► /usr/bin/env bun ~/.bun/bin/gbrain […args]
                      │
                      └─► reads ~/.gbrain/brain.pglite
                          writes JSON to stdout
                          exits
```

---

## 6. What gbrain is NOT doing here

- **Not parsing engineering PDFs/DOCX/XLSX.** The seed pipeline does that (Stage 1) with `pdfjs-dist`, `mammoth`, and `xlsx`.
- **Not doing semantic search.** `gbrain import --no-embed` skips embeddings. `gbrain query` returns "No results" without them. We use `gbrain graph` / `backlinks` / `get`, which are pure graph traversal and don't need embeddings.
- **Not persisting walkthrough state.** Each walkthrough request shells out fresh; nothing is written back to the brain.
- **Not selecting highlights.** gbrain provides context; the LLM decides which `(tag, doc)` pairs to highlight per beat; `filterBeat` validates those choices against the tag index (`tagIndex.ts`).
- **Not surviving server restarts.** The preflight wipes the PGLite file before Next.js boots. The user re-seeds on every run.

---

## 7. Gotchas specific to this integration

```
GOTCHA 1: Wikilink slug casing
  [[M-101]] resolves to slug "m-101" (path-derived, lowercase).
  gbrain does NOT match [[M-101]] to slug "m-101" — emit [[m-101]].
  Adding "slug:" to frontmatter causes gbrain to skip the file.

GOTCHA 2: extract links --source db returns 0 edges
  Always use: gbrain extract links --source fs --dir <tmpdir>
  (gbrain bug or design — db source extracts nothing.)

GOTCHA 3: Bun must be on PATH at spawn time
  gbrain binary is a Bun script. runGbrain() injects ~/.bun/bin defensively.
  Override via BUN_BIN_DIR env if installed elsewhere.

GOTCHA 4: No embeddings = no hybrid search
  gbrain query   → "No results" (needs --embed)
  gbrain search  → keyword works (tsvector)
  gbrain graph / backlinks / get → all work without embeddings

GOTCHA 5: [ai.gateway] noise on stdout
  gbrain emits "[ai.gateway] …" log lines on stdout when calling its own
  LLM helpers. stripGatewayNoise() filters them before JSON.parse so the
  parser doesn't choke on non-JSON lines.

GOTCHA 6: Re-seed must skip existing slugs
  `gbrain import` is upsert-by-slug. That's fine for content updates, but
  the seed pipeline should still skip docs whose slug is already in the
  brain to avoid pointless re-extraction. Stage 1 of /api/seed compares
  DOCS[i].slug against `gbrain list -n 500` before processing.

GOTCHA 7: Nuking the brain
  scripts/preflight.mjs runs `rm -f ~/.gbrain/brain.pglite` (and
  associated WAL/journal files) then `gbrain init` before `next dev`
  starts. Do not commit a "keep brain" escape hatch; the demo identity
  is "empty → seed → populated."
```

---

## 8. Why this split

| Layer | Owns | Source of truth for |
|---|---|---|
| `demo_docs/` (filesystem) | the actual documents | every fact in the system |
| Stage 1 parsers (`pdfjs` / `mammoth` / `xlsx`) | extraction | what text the LLM sees |
| Stage 2 LLM call | knowledge structuring | what gets written into gbrain |
| **gbrain** | the typed-link graph | which pages are related and how |
| `tagIndex.ts` | pixel coords / cell positions / docx anchors | where every tag *is* in the original docs |
| `filterBeat` | validation gate | which highlights the UI is allowed to render |
| LLM (walkthrough) | narrative | what the user reads in each beat |

Each layer audits the next. The LLM can hallucinate freely; nothing it emits reaches the UI without passing through gbrain (during seed) and through the tag index (during walkthrough).
