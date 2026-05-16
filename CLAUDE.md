# Cross-Doc Engineering Reasoning Demo — Hackathon Plan

**Team:** Chris (P&ID / process engineering), Wenny (software)
**Stack:** gstack + gbrain
**Time:** 12-hour hackathon (2026-05-16)
**Working backwards from:** a 5-minute live demo where Chris starts from an already-understood engineering document set, adds a small prepared design packet plus a plain-English intent, and gbrain visibly updates its knowledge model — then answers questions against the updated system with synchronized document highlights.

---

## Repo quickstart

`kord-brain` is a cross-doc engineering reasoning demo. Click a component on an engineering diagram and an AI streams a multi-beat walkthrough with synchronized highlights across PDFs, DOCX, and XLSX.

### Setup

```bash
pnpm install                     # installs deps AND provisions gbrain sidecar
vercel env pull                  # pulls AI_GATEWAY_API_KEY etc. into .env.local
pnpm placeholders                # generate placeholder sample documents
pnpm dev                         # http://localhost:3000
```

`vercel env pull` will prompt you to `vercel login` and link the project on first run (the team is `pipedreamer`, project `kord-brain`). After that it just refreshes `.env.local` in place.

`pnpm install` chains into `scripts/setup.sh` via `postinstall`. The setup script is idempotent and handles everything end-to-end: installs Bun if missing (`curl | bash`), clones gbrain to `~/.cache/kord-brain/gbrain`, runs `bun install && bun link`, `gbrain init` (PGLite, no Postgres), and imports `samples/gbrain-seed/`. `pnpm dev` runs a preflight that fails fast if gbrain isn't reachable. To re-run setup manually: `pnpm setup`.

### Layout

- `samples/` — the 5 input documents. Chris owns content; `pnpm placeholders` generates working stubs.
- `src/lib/tags.ts` — locked tag schema. Single source of truth.
- `src/lib/docs.ts` — doc metadata + tag-to-doc mapping.
- `src/lib/ingestion/` — per-format parsers for pdf, docx, and xlsx.
- `src/lib/tagIndex.ts` — builds `tag -> location[]` at boot.
- `src/components/` — viewers and demo layout.
- `src/app/api/tag-index/` — JSON endpoint for the built index.

### Workflow

- Tag-schema edits go in `src/lib/tags.ts` only. Re-run `pnpm placeholders` afterwards.
- Real drawings ship with hand-annotated `<doc>.bboxes.json` sidecars validated against `samples/bboxes.schema.json`.
- Phase 2 walkthrough endpoint (`/api/walkthrough`) will post-validate every AI-emitted tag against the index; hallucinated tags get dropped.

### Current stack

Next.js 16 App Router with Turbopack, React 19, Tailwind 4, `pdfjs-dist`, `mammoth`, `xlsx` (SheetJS), AI SDK v6 + Vercel AI Gateway, Zustand, and Zod.

---

## 1. The demo

Open with the baseline file set already loaded and already ingested by gbrain: one P&ID, one electrical single-line, one equipment list (xlsx), one process narrative (docx), and one motor spec (docx). The app shows a compact "known system" view: tags, documents, and relationships that gbrain already understands.

Chris explains the change he wants to make:

> "I want to add a redundant feedwater pump train so the electrolyzer can keep running if P-101 is down. I have the updated P&ID markup, an electrical update, and a short description of the design intent."

He adds a prepared design packet: new or revised files plus the written intent. This can be a lightweight local upload or a "Load design packet" button for the live demo; it does not need to be a full file-management product.

gbrain then updates knowledge in visible beats:

> **Ingestion beat 1** → parses the new packet and lists the files received.
> → shows the uploaded P&ID/electrical/docx cards entering the ingestion timeline.
>
> **Ingestion beat 2** → detects new and changed tags, such as `P-102`, `M-102`, `CB-102`, and tie-ins to `T-101` and `CV-301`.
> → highlights detected tags in the source files.
>
> **Ingestion beat 3** → infers relationships: `M-102` drives `P-102`; `P-102` is a redundant train for `P-101`; `CB-102` feeds `M-102`; both pumps share suction from `T-101`.
> → draws or lists a before/after graph delta.
>
> **Ingestion beat 4** → flags impacts and open checks: electrical load, breaker lead time, control logic, and any changed interlocks.
> → highlights affected rows, paragraphs, and drawing regions.
>
> **Ingestion beat 5** → commits the update to the in-memory demo knowledge model.
> → the "known system" view now includes the new pump train and updated relationships.

Chris can then ask natural-language questions:

- "What changed compared to the original design?"
- "Can the system run if P-101 is offline?"
- "What electrical items need procurement attention?"
- "Which documents mention the new pump train?"

gbrain answers with concise engineering reasoning plus citations/highlights across the updated document set.

The wow is that **gbrain is not just summarizing static files**. It is updating an engineering knowledge model from new design inputs, showing proof of ingestion, and answering questions against the changed system.

**Stretch demo (only if time):** ask gbrain to propose the next design check, such as "What else must change if both pumps need duty/standby auto-switchover?" It returns a short action list keyed to tags and documents.

---

## 2. Scope decision: standalone repo, portable to Kord later

**Standalone Next.js repo. Do not branch off Kord for this.**

Reasoning:

- Kord stability during demo prep > code reuse. A broken Kord migration mid-hackathon is the worst-case outcome.
- Chris is not a Kord dev. Onboarding him into Kord's codebase costs hours we don't have.
- The gbrain reasoning layer is the novel piece; everything else (viewers, ingestion) is commodity for a hackathon.
- After the demo, if it lands, port the gbrain module into Kord with the lessons learned.

**Portability constraints to enforce from day one:**

- Same file types as Kord: pdf, docx, xlsx.
- Same rendering target for docx: in-browser `mammoth` → HTML (see §12, deviates from Kord but lower demo-machine risk).
- gbrain reasoning + cross-doc index logic lives in its own module with a clean interface. No coupling to demo UI.
- File storage: local filesystem in `./samples/`. No S3, no durable project database.
- The "upload" path is demo-scoped: prepared local design packets only, with parsed artifacts and graph updates held in memory.

---

## 3. The sample file set (Chris's first task, blocking everything else)

Build a coherent **fake hydrogen feedwater subsystem** — not EH2's real one. The baseline system is a single skid with one motor, one pump, one control loop, one tank, and two interlocks. The update packet adds a small redundant pump train. Keep everything small enough to fit on one page per document.

Reuse what already exists from Kord's file-comparison demo where possible — those PNG/SVG/PDF flow diagrams already exist. Add consistent tag numbers across all files.

**Baseline tag schema (lock this in first, before drawing anything):**


| Tag       | What                                | Appears in                              |
| --------- | ----------------------------------- | --------------------------------------- |
| `P-101`   | Feedwater pump                      | P&ID, equipment list, narrative         |
| `M-101`   | Pump motor                          | Electrical, equipment list, motor spec  |
| `CB-101`  | Motor breaker                       | Electrical, equipment list              |
| `MCC-1`   | Motor control center                | Electrical                              |
| `LSL-201` | Low-low level switch (suction tank) | P&ID, electrical (interlock), narrative |
| `CV-301`  | Discharge control valve             | P&ID, electrical (interlock), narrative |
| `T-101`   | Suction tank                        | P&ID, narrative                         |
| `IR-2`    | PLC input rack                      | Electrical                              |


**Design packet tags:**


| Tag      | What                            | Appears in                         |
| -------- | ------------------------------- | ---------------------------------- |
| `P-102`  | Redundant feedwater pump        | P&ID update, equipment list update |
| `M-102`  | Redundant pump motor            | Electrical update, equipment list  |
| `CB-102` | Redundant motor breaker         | Electrical update, equipment list  |
| `XV-302` | Redundant train isolation valve | P&ID update, narrative update      |


**Baseline files Chris needs to produce:**

1. `pid.pdf` — single-page P&ID. T-101 → P-101 → CV-301 → stack inlet. LSL-201 on tank. Standard ISA symbols. Use the Bluebeam BTX library SVGs already converted.
2. `electrical.pdf` — single-page single-line. MCC-1 bus, CB-101, overload, M-101. Interlock contacts from LSL-201 and CV-301 routed through IR-2.
3. `equipment_list.xlsx` — one sheet, ~8 rows, columns: Tag, Description, Rating, Vendor, Lead Time, P.O.#. Long-lead flag on CB-101.
4. `process_narrative.docx` — 1 page, numbered sections. §3.2 covers feedwater supply. References P-101, T-101, LSL-201 by tag.
5. `motor_spec.docx` — 1 page, motor datasheet style. References M-101.

**Prepared design packet Chris needs to produce:**

1. `pid_update.pdf` or `pid_update_markup.pdf` — revised P&ID showing P-102 tied into the same suction tank and discharge header.
2. `electrical_update.pdf` — revised single-line showing CB-102 and M-102.
3. `design_intent.md` or `design_intent.docx` — short written description: "add redundant feedwater pump train for duty/standby operation."
4. Optional `equipment_list_update.xlsx` — rows for P-102, M-102, CB-102, and XV-302.
5. `bboxes_update.json` — hand-annotated regions for the new/changed drawing tags.

**Ground truth docs:** Chris writes `EXPECTED_INGESTION.md` and `EXPECTED_QA.md`:

- `EXPECTED_INGESTION.md` lists what gbrain should discover from the design packet: new tags, changed relationships, affected documents, and risks/checks.
- `EXPECTED_QA.md` contains 3-5 questions Chris will ask live, with the answer shape and citations/highlights gbrain should produce.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  UI (Next.js + Tailwind)                                 │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ Document viewer  │  │ Knowledge update panel      │  │
│  │ (PDF.js + HTML)  │  │ - ingestion timeline        │  │
│  │ Multi-doc tabs   │  │ - graph/tag deltas          │  │
│  │ Highlight overlay│  │ - Q&A with citations        │  │
│  └──────────────────┘  └─────────────────────────────┘  │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
             ▼                             ▼
┌────────────────────────┐    ┌──────────────────────────┐
│  Ingestion pipeline    │    │  gbrain knowledge layer  │
│  - pdf → text + bboxes │    │  - baseline graph        │
│  - docx → mammoth HTML │    │  - update graph          │
│  - xlsx → JSON rows    │    │  - tag resolver          │
│  - intent → text       │    │  - Q&A answer planner    │
└────────────────────────┘    └──────────────────────────┘
             │                             │
             └──────► Tag Index + Relationship Graph ◄────┘
                   (tag locations + edges + deltas)
```

**Key data structure — the Tag Index + Relationship Graph:** for every tag in the schema, track where it appears in every document (file, page, bounding box for PDFs, cell range for xlsx, paragraph anchor for docx). Also track relationships such as `drives`, `feeds`, `shares suction with`, `protected by`, `interlocked with`, and `mentioned in`. This is what makes update proof and highlight-on-answer work.

For PDFs, extract bboxes via `pdfplumber` or PyMuPDF text search. For drawings, bboxes are hand-annotated in a sidecar JSON during ingestion (Chris's other big task — see Hour 3-6).

**Knowledge update output shape:**

- `ingestionSteps`: ordered timeline entries such as parsed file, detected tags, inferred relationships, affected documents, unresolved checks.
- `tagDeltas`: added/changed/removed tags with source citations.
- `relationshipDeltas`: added/changed relationships with evidence.
- `highlights`: UI targets for each step and answer.
- `qaContext`: compact updated graph summary plus relevant source excerpts.

**gbrain prompt structure:**

- System: "You update an engineering knowledge model from new design inputs. Return only supported discoveries and cite the exact source locations used."
- Update context: baseline graph, full text/parsed rows for baseline docs, design packet text, tag index summary, and drawing bbox metadata.
- Update output: structured JSON for ingestion steps, graph/tag deltas, open checks, and highlight targets.
- Q&A context: updated graph, user question, and relevant source snippets.
- Q&A output: concise answer, cited evidence, and highlight targets.

---

## 5. Work split

### Chris (domain — critical path, no Claude Code speedup on drawings)


| Priority | Task                                                      | Output                       |
| -------- | --------------------------------------------------------- | ---------------------------- |
| P0       | Lock baseline + update packet tag schema                  | Approved schema              |
| P0       | Draw baseline P&ID + electrical                           | `pid.pdf`, `electrical.pdf`  |
| P0       | Fill baseline equipment list, narrative, and spec         | xlsx, two docx               |
| P0       | Draw prepared redundant-pump update packet                | update pdf/docx/xlsx files   |
| P0       | Hand-annotate baseline and update drawing bboxes          | `bboxes.json`, update bboxes |
| P0       | Write `EXPECTED_INGESTION.md` and `EXPECTED_QA.md`        | Eval ground truth            |
| P1       | Walk through gbrain discoveries, flag unsupported claims  | Issue list for Wenny         |
| P1       | Prepare 2-3 live questions about the updated design       | Demo Q&A script              |
| P2       | Sanity-check stretch scenario for duty/standby autoswitch | Validated change list        |


### Wenny (software — Claude Code accelerated)


| Priority | Task                                                     | Output                             |
| -------- | -------------------------------------------------------- | ---------------------------------- |
| P0       | Repo scaffold, Next.js + PDF.js/docx/xlsx viewers        | Renders baseline docs              |
| P0       | Ingestion: pdf text extraction, docx → HTML, xlsx → json | Baseline + update packet artifacts |
| P0       | Tag/relationship graph builder                           | Tag locations + relationship edges |
| P0       | Prepared "add design packet" flow                        | Loads update files + description   |
| P0       | gbrain update prompt + structured endpoint               | Ingestion steps + graph/tag deltas |
| P0       | Knowledge update panel + highlight wiring                | End-to-end update proof            |
| P1       | Q&A endpoint with citations/highlights                   | Chris can ask about updated design |
| P1       | Multi-doc tab switching with auto-scroll on highlight    | Cross-doc viewport                 |
| P1       | Animation polish for timeline and graph deltas           | Demo feels good                    |
| P2       | Stretch: next design check / duty-standby mode           | Optional second flow               |


**Sync points:** check in every 2 hours. Chris's bbox files, expected ingestion discoveries, and Wenny's graph delta schema need to interface — agree on JSON shape in Hour 0.

---

## 6. 12-hour timeline

The critical path is Chris's baseline drawings plus update packet (~4-5 hours of manual work, no Claude Code leverage). Wenny + Claude Code should finish each block against placeholders, then swap in Chris's real files as they land.

### Hour 0 — Kickoff (15 min)

- Baseline and update packet tag schema confirmed (tables in §3)
- Bbox and graph-delta JSON schemas agreed (Wenny drafts, Chris signs off)
- Chris confirms drawing tool
- Wenny confirms gbrain access + gstack scaffold

### Hour 0-3 — Parallel foundations

- **Chris:** draws baseline `pid.pdf` and `electrical.pdf`; starts the redundant-pump update packet.
- **Wenny:** `create-next-app`, install deps, get PDF.js/docx/xlsx viewers rendering placeholder files, and stub ingestion for baseline plus update packet artifacts.

**Checkpoint:** baseline docs render, update packet placeholders load, ingestion runs without crashing, and click coordinates/highlight targets can be logged.

### Hour 3-6 — Graph index + gbrain update endpoint

- **Chris:** finishes baseline text/data files, update packet files, bbox annotations, `EXPECTED_INGESTION.md`, and `EXPECTED_QA.md`.
- **Wenny:** wire real ingestion against Chris's files as they land. Build tag index + relationship graph. Write the gbrain update prompt and structured endpoint. Get first graph/tag deltas back from gbrain referencing real sources.

**Checkpoint:** loading the design packet returns at least one valid ingestion step, one tag delta, and one relationship delta with a real highlight target.

### Hour 6-8 — End-to-end

- **Wenny:** knowledge update panel, ingestion timeline, graph/tag delta display, and click-to-highlight wiring. Validate against `EXPECTED_INGESTION.md`.
- **Chris:** read gbrain discoveries, flag unsupported claims and missing changes.

**Checkpoint:** the redundant-pump packet ingests cleanly, shows step-by-step update proof, and highlights the right element for each step.

### Hour 8-10 — Q&A + cross-doc polish

- **Wenny:** Q&A endpoint and panel with cited answers, multi-doc tabs, auto-scroll on highlight, and smooth pan/zoom animation.
- **Chris:** prompt-tune with Wenny against ground truth. Finalize 2-3 reliable live questions and backup answers.

**Checkpoint:** Chris can ask about the updated design and get cited answers with synchronized highlights.

### Hour 10-12 — Dress rehearsal + backup + stretch

- Run the demo 3 times end-to-end. Fix the top 3 issues.
- **Record backup video** before attempting stretch.
- If solid: add the duty/standby autoswitch or "what should we check next?" stretch flow.
- Final dry run.

---

## 7. Demo script (target: 5 minutes)

**0:00 — Setup (30s)**

> "Engineers spend a huge chunk of every project cross-referencing documents. P&ID says one thing, electrical says another, equipment list contradicts both. We wanted to see what happens when you let an AI do this in real time."

Show the baseline hydrogen feedwater skid already loaded and understood by gbrain: documents, tags, and a compact relationship view.

**0:30 — The hook (60s)**

> "Chris wants to add a redundant feedwater pump train. He has a markup, an electrical update, and a short description. Let's add that design packet and see what gbrain learns."

Load the prepared design packet. The ingestion timeline starts streaming.

**1:30 — The knowledge update (2 min)**
Let gbrain show the update step by step: files parsed, tags detected, relationships inferred, affected documents highlighted, and graph/tag deltas committed.

**3:30 — Ask anything (60s)**
Chris asks 2-3 prepared natural-language questions about the updated design. Answers cite source docs and drive highlights.

**4:30 — Close (30s)**

> "This is twelve hours of hackathon work. It is reading raw PDFs, DOCX, and spreadsheets; updating a tag graph; and answering against the changed engineering system. Imagine this on a real EPC project with 5,000 documents."

---

## 8. What we are NOT building

To protect velocity:

- Authentication, user accounts, permissions
- General-purpose file management, folders, permissions, or document lifecycle
- Arbitrary unprepared uploads; the live update flow uses prepared demo packets
- Persistence beyond an in-memory tag/relationship graph
- Real version control or diffing (that's Kord)
- Any non-demo tag (no broader equipment library)
- Mobile or responsive design
- More than one design-update scenario until the redundant pump packet is rock solid
- Vector search / embeddings — the tag index is the index. Tags are deterministic.

---

## 9. Tech stack

- **Frontend:** Next.js (App Router — read `node_modules/next/dist/docs/` before writing), Tailwind, PDF.js for pdf rendering
- **Backend:** Next.js API routes (no separate server)
- **AI runtime:** Vercel AI Gateway with `anthropic/claude-opus-4-7` (provider-string), not a direct provider SDK
- **gbrain / gstack:** gbrain is the knowledge-update/reasoning layer for the demo; gstack remains dev-time workflow support.
- **Ingestion:** `pdf-parse` or PyMuPDF (via a Python sidecar if needed), `mammoth` for docx → HTML, SheetJS for xlsx
- **State:** Zustand or just React Context. No Redux.
- **Deploy:** localhost for demo. Optional: Vercel preview for sharing afterward.

---

## 10. Open questions to settle at kickoff

1. Drawing tool? (Bluebeam gives the BTX symbols already converted; draw.io is faster to iterate)
2. Does the prepared design packet load through a simple picker/dropzone, or a safer "Load redundant pump packet" button?
3. Should the demo audience see the graph delta/timeline only, or also a compact prompt/evidence view?

---

## 11. Risks and mitigations


| Risk                                       | Mitigation                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| gbrain hallucinates tags or relationships  | Tag/relationship graph is authoritative; validate every cited tag and edge against source evidence |
| Update packet appears fake or too scripted | Show concrete ingestion steps, graph/tag deltas, and source highlights for each discovery          |
| Highlight overlay misaligned on PDFs       | Hand-annotated bboxes (Chris does this) instead of relying on PDF text extraction for drawings     |
| Q&A answers cite stale baseline knowledge  | Pass only the updated graph and relevant updated snippets into the Q&A prompt                      |
| docx rendering looks bad                   | Keep docx files visually simple; test `mammoth` output early in Hour 0-3                           |
| Live demo breaks                           | Record backup video in Hour 10-12 *before* attempting stretch                                      |
| Scope creep into a real product            | Re-read §8 every checkpoint                                                                        |
| Chris's update packet slips past Hour 3    | Wenny continues against placeholders; ingestion is format-agnostic, so swap-in is cheap            |


---

## 12. Implementation notes (deviations from baseline)

Documented at `/Users/w/.claude/plans/cross-doc-engineering-reasoning-peppy-harp.md`:

1. **DOCX renderer:** in-browser `mammoth` → HTML instead of LibreOffice headless → PDF → PDF.js. Risk reduction for demo machine — no LibreOffice install required.
2. **AI runtime:** Vercel AI Gateway with `anthropic/claude-opus-4-7` (provider-string), not a direct provider SDK.
3. **Demo persistence:** updated knowledge lives in memory for the session. If needed, write parsed artifacts to `./samples/derived/` as rebuildable cache, not source of truth.

---

