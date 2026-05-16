# Cross-Doc Engineering Reasoning Demo — Hackathon Plan

**Team:** Subrina (software), Chris (P&ID / domain)
**Stack:** gstack + gbrain
**Working backwards from:** a 5-minute live demo where someone drops an electrical diagram into the app, picks a component, and gbrain walks them through how it plays out across the whole document set — referencing P&IDs, equipment lists, and specs in real time, with synchronized visual highlights.

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

**Recommendation: standalone Next.js (or Vite) repo. Do not branch off Kord for this.**

Reasoning:
- Kord stability during demo prep > code reuse. A broken Kord migration the night before is the worst-case outcome.
- Chris is not a Kord dev. Onboarding him into Kord's codebase costs hours.
- The gbrain reasoning layer is the novel piece; everything else (viewers, ingestion) is commodity for a hackathon.
- After the demo, if it lands, port the gbrain module into Kord with the lessons learned.

**Portability constraints to enforce from day one:**
- Same file types as Kord: pdf, docx, xlsx.
- Same rendering target for docx: LibreOffice headless → PDF → PDF.js. Don't reach for Syncfusion or anything else.
- gbrain reasoning + cross-doc index logic lives in its own module with a clean interface. No coupling to demo UI.
- File storage: local filesystem in `./samples/`. Don't build S3 integration.

---

## 3. The sample file set (Chris's first task, blocking everything else)

Build a coherent **fake hydrogen feedwater subsystem** — not EH2's real one. Single skid, one motor, one pump, one control loop, one tank, two interlocks. Small enough to fit on one page per document.

Reuse what you already have from Kord's file-comparison demo where possible — those PNG/SVG/PDF flow diagrams already exist. Add consistent tag numbers across all files.

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

1. **`pid.pdf`** — single-page P&ID. T-101 → P-101 → CV-301 → stack inlet. LSL-201 on tank. Standard ISA symbols. Use the Bluebeam BTX library SVGs you already converted.
2. **`electrical.pdf`** — single-page single-line. MCC-1 bus, CB-101, overload, M-101. Interlock contacts from LSL-201 and CV-301 routed through IR-2.
3. **`equipment_list.xlsx`** — one sheet, ~8 rows, columns: Tag, Description, Rating, Vendor, Lead Time, P.O.#. Long-lead flag on CB-101.
4. **`process_narrative.docx`** — 1 page, numbered sections. §3.2 covers feedwater supply. References P-101, T-101, LSL-201 by tag.
5. **`motor_spec.docx`** — 1 page, motor datasheet style. References M-101.

**Ground truth doc:** Chris also writes a `EXPECTED_WALKTHROUGH.md` — what gbrain *should* say for `M-101`, beat by beat. This is your eval.

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
│  - docx → LibreOffice  │    │  - walkthrough generator │
│       → pdf → text     │    │  - tag resolver          │
│  - xlsx → JSON rows    │    │  - beat → highlights map │
└────────────────────────┘    └──────────────────────────┘
             │                             │
             └──────────► Tag Index ◄──────┘
                  (Tag → [{doc, page, bbox}])
```

**Key data structure — the Tag Index:** for every tag in the schema, where it appears in every document (file, page, bounding box for PDFs, cell range for xlsx, paragraph anchor for docx). This is what makes highlight-on-beat work.

For PDFs, extract bboxes via `pdfplumber` or PyMuPDF text search. For drawings, bboxes are hand-annotated in a sidecar JSON during ingestion (Chris's other big task — see Phase 1).

**gbrain prompt structure:**
- System: "You are walking an engineer through component X. Output beats. Each beat is a single sentence + a list of `[tag, doc]` references that should be highlighted."
- Context: full text of all 5 docs + tag index summary + equipment list as JSON.
- Output: structured JSON, one beat at a time, streamed.

---

## 5. Work split

### Chris (domain, ~60% of his time on content, 40% on validation)

| Priority | Task | Output |
|---|---|---|
| P0 | Lock tag schema (above table) | Approved schema |
| P0 | Draw P&ID + electrical (Bluebeam or similar) | `pid.pdf`, `electrical.pdf` |
| P0 | Fill equipment list, write narrative + spec | xlsx, two docx |
| P0 | Hand-annotate tag bboxes for the two drawings | `bboxes.json` |
| P0 | Write `EXPECTED_WALKTHROUGH.md` for M-101 | Eval ground truth |
| P1 | Walk through gbrain output, flag hallucinations | Issue list for Subrina |
| P1 | Write 1-2 alternative walkthrough scenarios (CV-301, T-101) | For Q&A in demo |
| P2 | Sanity-check stretch demo ("upgrade to 150 HP") | Validated change list |

### Subrina (software)

| Priority | Task | Output |
|---|---|---|
| P0 | Repo scaffold, Next.js + PDF.js viewer | Renders pdfs, click hit-test |
| P0 | Ingestion: pdf text extraction, docx → pdf, xlsx → json | All 5 files into structured form |
| P0 | Tag index builder (consume `bboxes.json` + text matches) | Tag → locations map |
| P0 | gbrain prompt + beat-streaming endpoint | API returns walkthrough |
| P0 | Walkthrough panel UI, click-to-highlight wiring | End-to-end demo flow |
| P1 | Multi-doc tab switching with auto-scroll on highlight | Cross-doc viewport |
| P1 | Animation polish (smooth pan/zoom on highlight) | Demo feels good |
| P2 | Stretch demo: "propose a change" mode | Optional second flow |

**Sync points:** end-of-day standup. Chris's `bboxes.json` and Subrina's tag index need to interface — agree on JSON schema in Phase 0.

---

## 6. Phased timeline (assumes 2-day hackathon, adjust if different)

### Phase 0 — Pre-hackathon (1-2 hours, this week)
- Agree on tag schema (5 min Slack)
- Agree on `bboxes.json` format (Subrina drafts, Chris signs off)
- Repo created, gbrain access confirmed, gstack scaffolded
- Chris confirms drawing tool (Bluebeam? draw.io? Visio?)

### Phase 1 — Day 1 morning: parallel foundations
- Chris: drawings + tag-bbox annotation
- Subrina: repo, ingestion, PDF.js viewer rendering raw files

**Phase 1 done when:** all 5 files in repo, viewer can render them, tag index builds without errors.

### Phase 2 — Day 1 afternoon: gbrain integration
- Subrina: prompt engineering, beat streaming, basic highlight overlay
- Chris: writes `EXPECTED_WALKTHROUGH.md`, starts validating gbrain output

**Phase 2 done when:** clicking M-101 produces a streaming walkthrough with at least 3 beats that correctly reference at least 3 documents.

### Phase 3 — Day 2 morning: cross-doc highlights + polish
- Subrina: auto-scroll, multi-doc tabs, animation
- Chris: refine prompts based on what gbrain gets wrong

**Phase 3 done when:** full M-101 walkthrough plays smoothly, highlights land in the right place, no broken beats.

### Phase 4 — Day 2 afternoon: dress rehearsal, stretch, demo prep
- Run the demo 3 times end-to-end
- Fix the top 3 things that look bad
- If everything's solid: add the "upgrade to 150 HP" stretch flow
- Record a backup video in case live fails

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
> "This is two days of hackathon work. It's reading raw PDFs and DOCX, building a tag graph, and reasoning across all of it. Imagine this on a real EPC project with 5,000 documents."

---

## 8. What we are NOT building

To protect velocity:
- ❌ Authentication, user accounts, permissions
- ❌ File upload UI — files are committed to the repo
- ❌ Persistence beyond an in-memory tag index
- ❌ Real version control or diffing (that's Kord)
- ❌ Any non-demo tag (no broader equipment library)
- ❌ Mobile or responsive design
- ❌ More than one walkthrough target until M-101 is rock solid
- ❌ Vector search / embeddings — the tag index is the index. Tags are deterministic.

---

## 9. Tech stack

- **Frontend:** Next.js 14 (App Router), Tailwind, PDF.js for pdf rendering
- **Backend:** Next.js API routes (no separate server)
- **gbrain:** via gstack scaffold
- **Ingestion:** `pdf-parse` or PyMuPDF (via a Python sidecar if needed), LibreOffice headless for docx, SheetJS for xlsx
- **State:** Zustand or just React Context. No Redux.
- **Deploy:** localhost for demo. Optional: Vercel preview for sharing afterward.

---

## 10. Open questions for Chris before kickoff

1. Drawing tool preference? (Bluebeam gives us the BTX symbols we already have; draw.io is faster to iterate)
2. Do we want a fault scenario as a third demo flow (e.g., "LSL-201 fails low — walk me through what happens")? Compelling but adds scope.
3. Should the demo audience see the AI prompts? (Some technical audiences love this; some find it distracting.)

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| gbrain hallucinates tags that don't exist | Tag index is authoritative; post-process beats to validate every `[tag]` reference exists |
| Highlight overlay misaligned on PDFs | Hand-annotated bboxes (Chris does this) instead of relying on PDF text extraction for drawings |
| docx → pdf conversion produces weird formatting | Keep docx files visually simple; test conversion early in Phase 1 |
| Live demo breaks | Record backup video at end of Phase 4 |
| Scope creep into a real product | Re-read §8 every morning |

---

## Appendix: starter commands for Claude Code

```bash
# Phase 0
npx create-next-app@latest hackathon-demo --typescript --tailwind --app
cd hackathon-demo
npm install pdfjs-dist xlsx zustand
mkdir -p samples src/lib/gbrain src/lib/ingestion src/components

# Add gstack
# (follow internal gstack setup)

# Sample data goes in ./samples/
# bboxes.json goes alongside each pdf
```

Suggested initial prompt to Claude Code:

> Read `hackathon-plan.md`. We're starting Phase 1. Scaffold the repo per §9, build the PDF.js viewer component, and stub out the ingestion pipeline for all 5 file types. Don't build the gbrain integration yet — that's Phase 2. Use the file structure described in §4. Ask before adding any dependency not listed in §9.

---

## Implementation refinements (post-plan)

After scaffolding, two deliberate refinements vs. §9 — both documented at `/Users/w/.claude/plans/cross-doc-engineering-reasoning-peppy-harp.md`:

1. **DOCX renderer:** in-browser `mammoth` → HTML instead of LibreOffice headless → PDF → PDF.js. Risk reduction for demo machine.
2. **AI runtime:** Vercel AI Gateway with `anthropic/claude-opus-4-7` (provider-string), not a direct provider SDK. gbrain/gstack are dev-time only (Garry Tan's Claude Code workflow toolkit and persistent-memory MCP server respectively); neither runs inside the demo per §9's "no separate server" constraint.
