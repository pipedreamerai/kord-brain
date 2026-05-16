# Cross-Doc Engineering Reasoning Demo — Hackathon Plan

**Team:** Chris (P&ID / process engineering), Wenny (software)
**Stack:** gstack + gbrain
**Time:** 12-hour hackathon (2026-05-16)
**Working backwards from:** a 5-minute live demo where someone drops an electrical diagram into the app, picks a component, and gbrain walks them through how it plays out across the whole document set — referencing P&IDs, equipment lists, and specs in real time, with synchronized visual highlights.

---

## 0. This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## 1. The demo moment

Open with the file set already loaded: one P&ID, one electrical single-line, one equipment list (xlsx), one process narrative (docx), one motor spec (docx).

User clicks motor `M-101` on the electrical diagram. gbrain produces a guided walkthrough, one beat at a time. As each beat appears, the relevant element lights up in the relevant document, which auto-scrolls into view:

> **Beat 1** → "M-101 is a 100 HP, 480V induction motor fed from MCC-1 via breaker CB-101."
> → highlights M-101 + CB-101 on electrical diagram, opens motor spec docx to the rated-power line.
>
> **Beat 2** → "It drives feedwater pump P-101 on the P&ID."
> → swaps viewport to P&ID, highlights P-101.
>
> **Beat 3** → "P-101 supplies DI water at 5 bar to the electrolyzer stack inlet, per §3.2 of the process narrative."
> → opens narrative docx to §3.2, highlights the relevant paragraph.
>
> **Beat 4** → "The motor won't start unless suction tank level switch LSL-201 is satisfied and discharge valve CV-301 is in AUTO. Both interlocks are wired through PLC input rack IR-2."
> → highlights LSL-201, CV-301 on P&ID; IR-2 on electrical.
>
> **Beat 5** → "Equipment list flags CB-101 as 'long lead — 14 weeks.' If this fails, no easy hot swap."
> → opens xlsx, highlights the row.

The wow isn't any single beat — it's that **gbrain is reasoning across four file formats and highlighting in sync**. Engineering teams do this manually for hours per change.

**Stretch demo (only if time):** "Now propose: upgrade P-101 to 150 HP. What else needs to change?" Gbrain produces a list keyed to tag numbers, showing exactly which documents are affected. This is the Kord pitch in 30 seconds.

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
- File storage: local filesystem in `./samples/`. No S3.

---

## 3. The sample file set (Chris's first task, blocking everything else)

Build a coherent **fake hydrogen feedwater subsystem** — not EH2's real one. Single skid, one motor, one pump, one control loop, one tank, two interlocks. Small enough to fit on one page per document.

Reuse what already exists from Kord's file-comparison demo where possible — those PNG/SVG/PDF flow diagrams already exist. Add consistent tag numbers across all files.

**Tag schema (lock this in first, before drawing anything):**

| Tag | What | Appears in |
|---|---|---|
| `P-101` | Feedwater pump | P&ID, equipment list, narrative |
| `M-101` | Pump motor | Electrical, equipment list, motor spec |
| `CB-101` | Motor breaker | Electrical, equipment list |
| `MCC-1` | Motor control center | Electrical |
| `LSL-201` | Low-low level switch (suction tank) | P&ID, electrical (interlock), narrative |
| `CV-301` | Discharge control valve | P&ID, electrical (interlock), narrative |
| `T-101` | Suction tank | P&ID, narrative |
| `IR-2` | PLC input rack | Electrical |

**Files Chris needs to produce:**

1. **`pid.pdf`** — single-page P&ID. T-101 → P-101 → CV-301 → stack inlet. LSL-201 on tank. Standard ISA symbols. Use the Bluebeam BTX library SVGs already converted.
2. **`electrical.pdf`** — single-page single-line. MCC-1 bus, CB-101, overload, M-101. Interlock contacts from LSL-201 and CV-301 routed through IR-2.
3. **`equipment_list.xlsx`** — one sheet, ~8 rows, columns: Tag, Description, Rating, Vendor, Lead Time, P.O.#. Long-lead flag on CB-101.
4. **`process_narrative.docx`** — 1 page, numbered sections. §3.2 covers feedwater supply. References P-101, T-101, LSL-201 by tag.
5. **`motor_spec.docx`** — 1 page, motor datasheet style. References M-101.

**Ground truth doc:** Chris also writes a `EXPECTED_WALKTHROUGH.md` — what gbrain *should* say for `M-101`, beat by beat. This is the eval.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  UI (Next.js + Tailwind)                                 │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ Document viewer  │  │ Walkthrough panel           │  │
│  │ (PDF.js)         │  │ (streaming beats from       │  │
│  │ Multi-doc tabs   │  │  gbrain, click-to-highlight)│  │
│  │ Highlight overlay│  │                             │  │
│  └──────────────────┘  └─────────────────────────────┘  │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
             ▼                             ▼
┌────────────────────────┐    ┌──────────────────────────┐
│  Ingestion pipeline    │    │  gbrain reasoning module │
│  - pdf → text + bboxes │    │  - cross-doc index       │
│  - docx → mammoth      │    │  - walkthrough generator │
│       → HTML           │    │  - tag resolver          │
│  - xlsx → JSON rows    │    │  - beat → highlights map │
└────────────────────────┘    └──────────────────────────┘
             │                             │
             └──────────► Tag Index ◄──────┘
                  (Tag → [{doc, page, bbox}])
```

**Key data structure — the Tag Index:** for every tag in the schema, where it appears in every document (file, page, bounding box for PDFs, cell range for xlsx, paragraph anchor for docx). This is what makes highlight-on-beat work.

For PDFs, extract bboxes via `pdfplumber` or PyMuPDF text search. For drawings, bboxes are hand-annotated in a sidecar JSON during ingestion (Chris's other big task — see Hour 3-6).

**gbrain prompt structure:**
- System: "You are walking an engineer through component X. Output beats. Each beat is a single sentence + a list of `[tag, doc]` references that should be highlighted."
- Context: full text of all 5 docs + tag index summary + equipment list as JSON.
- Output: structured JSON, one beat at a time, streamed.

---

## 5. Work split

### Chris (domain — critical path, no Claude Code speedup on drawings)

| Priority | Task | Output |
|---|---|---|
| P0 | Lock tag schema (table above) | Approved schema |
| P0 | Draw P&ID + electrical (Bluebeam or similar) | `pid.pdf`, `electrical.pdf` |
| P0 | Fill equipment list, write narrative + spec | xlsx, two docx |
| P0 | Hand-annotate tag bboxes for the two drawings | `bboxes.json` |
| P0 | Write `EXPECTED_WALKTHROUGH.md` for M-101 | Eval ground truth |
| P1 | Walk through gbrain output, flag hallucinations | Issue list for Wenny |
| P1 | Write 1-2 alternative walkthrough scenarios (CV-301, T-101) | For Q&A in demo |
| P2 | Sanity-check stretch demo ("upgrade to 150 HP") | Validated change list |

### Wenny (software — Claude Code accelerated)

| Priority | Task | Output |
|---|---|---|
| P0 | Repo scaffold, Next.js + PDF.js viewer | Renders pdfs, click hit-test |
| P0 | Ingestion: pdf text extraction, docx → HTML, xlsx → json | All 5 files into structured form |
| P0 | Tag index builder (consume `bboxes.json` + text matches) | Tag → locations map |
| P0 | gbrain prompt + beat-streaming endpoint | API returns walkthrough |
| P0 | Walkthrough panel UI, click-to-highlight wiring | End-to-end demo flow |
| P1 | Multi-doc tab switching with auto-scroll on highlight | Cross-doc viewport |
| P1 | Animation polish (smooth pan/zoom on highlight) | Demo feels good |
| P2 | Stretch demo: "propose a change" mode | Optional second flow |

**Sync points:** check in every 2 hours. Chris's `bboxes.json` and Wenny's tag index need to interface — agree on JSON schema in Hour 0.

---

## 6. 12-hour timeline

The critical path is Chris's drawings (~4-5 hours of manual work, no Claude Code leverage). Wenny + Claude Code should finish each block well ahead of Chris and use the slack for polish.

### Hour 0 — Kickoff (15 min)
- Tag schema confirmed (table in §3)
- `bboxes.json` schema agreed (Wenny drafts, Chris signs off)
- Chris confirms drawing tool
- Wenny confirms gbrain access + gstack scaffold

### Hour 0-3 — Parallel foundations
- **Chris:** draws `pid.pdf` and `electrical.pdf`. This is the critical path — start immediately.
- **Wenny:** `create-next-app`, install deps, get PDF.js viewer rendering any PDF, click hit-test working. Then stub ingestion pipeline for all 5 formats (use placeholder files if Chris hasn't shipped yet).

**Checkpoint:** PDF viewer renders, click coordinates logged, ingestion runs without crashing on placeholder inputs.

### Hour 3-6 — Tag index + gbrain endpoint
- **Chris:** writes the three text/data files (xlsx, narrative.docx, motor_spec.docx). Hand-annotates `bboxes.json` for the two drawings. Drafts `EXPECTED_WALKTHROUGH.md`.
- **Wenny:** wire real ingestion against Chris's files as they land. Build tag index. Write the gbrain prompt and streaming endpoint. Get a first beat back from gbrain referencing real tags.

**Checkpoint:** clicking M-101 returns at least one valid beat from gbrain that references at least one real document.

### Hour 6-8 — End-to-end
- **Wenny:** walkthrough panel UI, beat-by-beat streaming, click-to-highlight on the active document. Validate against `EXPECTED_WALKTHROUGH.md`.
- **Chris:** read gbrain output, flag hallucinations and missing beats.

**Checkpoint:** M-101 produces all 5 beats, each highlights the right element in the active document.

### Hour 8-10 — Cross-doc highlights + polish
- **Wenny:** multi-doc tabs, auto-scroll on highlight, smooth pan/zoom animation. Make doc switches feel intentional, not jarring.
- **Chris:** prompt-tune with Wenny against ground truth. Prep 1-2 backup scenarios (CV-301, T-101) in case M-101 misfires live.

**Checkpoint:** full walkthrough plays smoothly without manual intervention.

### Hour 10-12 — Dress rehearsal + backup + stretch
- Run the demo 3 times end-to-end. Fix the top 3 issues.
- **Record backup video** before attempting stretch.
- If solid: add the "upgrade P-101 to 150 HP" stretch flow.
- Final dry run.

---

## 7. Demo script (target: 5 minutes)

**0:00 — Setup (30s)**
> "Engineers spend a huge chunk of every project cross-referencing documents. P&ID says one thing, electrical says another, equipment list contradicts both. We wanted to see what happens when you let an AI do this in real time."

Show files loaded. Don't dwell.

**0:30 — The hook (60s)**
> "Here's an electrical single-line for a hydrogen feedwater skid. I'm going to click on the pump motor."

Click M-101. First two beats stream in with highlights. Let it land.

**1:30 — The walkthrough (2 min)**
Let it play through all 5 beats. Narrate lightly — point out when it jumps documents.

**3:30 — The "and one more thing" (60s)**
Optional stretch: "Now watch this — I'm going to ask it to propose upgrading the pump." Show change-impact list.

**4:30 — Close (30s)**
> "This is twelve hours of hackathon work. It's reading raw PDFs and DOCX, building a tag graph, and reasoning across all of it. Imagine this on a real EPC project with 5,000 documents."

---

## 8. What we are NOT building

To protect velocity:
- Authentication, user accounts, permissions
- File upload UI — files are committed to the repo
- Persistence beyond an in-memory tag index
- Real version control or diffing (that's Kord)
- Any non-demo tag (no broader equipment library)
- Mobile or responsive design
- More than one walkthrough target until M-101 is rock solid
- Vector search / embeddings — the tag index is the index. Tags are deterministic.

---

## 9. Tech stack

- **Frontend:** Next.js (App Router — read `node_modules/next/dist/docs/` before writing), Tailwind, PDF.js for pdf rendering
- **Backend:** Next.js API routes (no separate server)
- **AI runtime:** Vercel AI Gateway with `anthropic/claude-opus-4-7` (provider-string), not a direct provider SDK
- **gbrain / gstack:** dev-time only (Garry Tan's Claude Code workflow toolkit and persistent-memory MCP server). Neither runs inside the demo.
- **Ingestion:** `pdf-parse` or PyMuPDF (via a Python sidecar if needed), `mammoth` for docx → HTML, SheetJS for xlsx
- **State:** Zustand or just React Context. No Redux.
- **Deploy:** localhost for demo. Optional: Vercel preview for sharing afterward.

---

## 10. Open questions to settle at kickoff

1. Drawing tool? (Bluebeam gives the BTX symbols already converted; draw.io is faster to iterate)
2. Fault scenario as a third demo flow (e.g., "LSL-201 fails low — walk me through what happens")? Compelling but adds scope — likely skip.
3. Should the demo audience see the AI prompts? Some technical audiences love this; some find it distracting.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| gbrain hallucinates tags that don't exist | Tag index is authoritative; post-process beats to validate every `[tag]` reference exists |
| Highlight overlay misaligned on PDFs | Hand-annotated bboxes (Chris does this) instead of relying on PDF text extraction for drawings |
| docx rendering looks bad | Keep docx files visually simple; test `mammoth` output early in Hour 0-3 |
| Live demo breaks | Record backup video in Hour 10-12 *before* trying stretch |
| Scope creep into a real product | Re-read §8 every checkpoint |
| Chris's drawings slip past Hour 3 | Wenny continues against placeholders; ingestion is format-agnostic, so swap-in is cheap |

---

## 12. Implementation notes (deviations from baseline)

Documented at `/Users/w/.claude/plans/cross-doc-engineering-reasoning-peppy-harp.md`:

1. **DOCX renderer:** in-browser `mammoth` → HTML instead of LibreOffice headless → PDF → PDF.js. Risk reduction for demo machine — no LibreOffice install required.
2. **AI runtime:** Vercel AI Gateway with `anthropic/claude-opus-4-7` (provider-string), not a direct provider SDK. gbrain/gstack are dev-time only; neither runs inside the demo per §9's "no separate server" constraint.

---

## Appendix: starter commands

```bash
npx create-next-app@latest . --typescript --tailwind --app
npm install pdfjs-dist xlsx mammoth zustand
mkdir -p samples src/lib/gbrain src/lib/ingestion src/components
# Sample data goes in ./samples/
# bboxes.json goes alongside each pdf
```
