# EXPECTED_INGESTION.md — what the brain should discover

**Scenario:** the brain has the Bid package (`bid_pid`, `bid_ga`, `bid_firm_quote`) pre-ingested at boot. Chris loads the Detailed Design packet (`dd_full_pid`, `dd_full_ga`, `dd_instrument_list`) live. This file is the **ground truth** for what the ingestion endpoint should emit — Wenny validates the brain's output against this.

Output shape follows CLAUDE.md §4: `ingestionSteps`, `tagDeltas`, `relationshipDeltas`, `highlights`. Full tag definitions and citations live in [`TAGS.md`](./TAGS.md).

---

## The 5 ingestion beats

Each beat should stream as a single short narration sentence with a list of `[tag, doc, page]` highlight targets. The brain may pick its own 5 beats; success = at least these 5 themes surface, with correct citations.

### Beat 1 — Files parsed

> "Reading the detailed-design package: 3 PDFs, 16 sheets, plus the instrument master list."

**Files received:**
- `Detailed Design/Full PID.pdf` — 9 process sheets (cover and ISA-key sheets stripped) covering pretreatment, chemical injection, RO trains, storage, polishing, CDI, future CDI, and CIP.
- `Detailed Design/Full GA Drawing.pdf` — 4-page detailed isometric + internal elevation.
- `Detailed Design/Instrument List.pdf` — master tag → vendor → SAP → range table.

**Highlights:** doc-card animation for each PDF entering the ingestion timeline.

### Beat 2 — Reading the new drawings (vision extraction, live)

> "Reading sheet 4… found `TK-01A/B/C`, the triplex multi-media filter. Sheet 6: three new chemical injection pump skids. Sheet 8: a 5672-gallon buffer tank `T-501` with nitrogen blanketing. Sheet 10: an entire new CDI polishing skid — `MDL-801`, `MDL-802`."

This is **the demo's wow moment**. Vision-LLM (Claude Opus 4.7 vision) runs page-by-page over the 3 DD PDFs (~16 pages total, ~60–90 s wall time). Tags appear in the UI as they're extracted from each page. The audience watches the brain literally read the drawings.

**Pacing:** ~3–5 seconds per page lets the beat narration stream alongside the extraction. Each page's results render incrementally — feels like real work, not a pre-baked highlight reel.

**Top new equipment to surface (must include at least these 6):**
- `TK-01A/B/C` (triplex multi-media filter) — `dd_full_pid` sheet 4
- `T-501` (5672-gal RO buffer tank) — `dd_full_pid` sheet 8
- `MDL-801`, `MDL-802` (CEDI modules — entire new technology) — `dd_full_pid` sheet 10
- `P-501A/B` (distribution pumps) — `dd_full_pid` sheets 8 & 10
- `F-601` (final 0.2 µm filter) — `dd_full_pid` sheet 9
- `UV-501` (Aquafine — replaces bid's `UV-200`) — `dd_full_pid` sheet 8

**New process chemistry (sodium bisulfite dechlorination — new function, not in bid):**
- `P-201A/B` injection pumps — `dd_full_pid` sheet 6
- `P-08A/B` sodium hypochlorite injection — `dd_full_pid` sheet 4 (chlorination upstream of dechlor)

**Validation:** every tag extracted by vision is checked against `TAGS.md` before being committed to the index. Vision-emitted tags that don't match the schema get logged as soft-warnings and dropped from the highlight layer — narration can still mention them, but no rectangle gets drawn. (Same `filterBeat` discipline used in the walkthrough.)

**Tag deltas — full list lives in `TAGS.md`. The brain must cite every `(tag, doc, page)` exactly.**

**UI:** annotated PDF page image renders in the right pane (split-pane layout: chat left, page right). Bboxes drawn server-side onto the rendered PNG — no custom PDF.js overlay component needed.

### Beat 3 — Relationships inferred

> "Mapped how the new equipment ties together — and what it ties back to in the bid."

**Critical new edges the brain should infer (minimum 5):**

1. `TK-01A/B/C` **replaces** `CF-200` + `CF-201` (pretreatment philosophy swap: carbon adsorption → multi-media filtration)
2. `P-08A/B` (chlorination) **paired with** `P-201A/B` (dechlorination) — a new control loop not present in the bid
3. `T-501` **fed by** `RO-301..RO-311` (combined 1st- and 2nd-pass permeate); **drains to** `P-501A/B`; **feeds** `MDL-801/802`
4. `P-501A/B` **VFD-controlled by** the distribution loop pressure; deliver to CDI skid + customer storage
5. `MDL-801/802` (CDI) **replaces** `IX1101/IX1102` as the primary polishing technology — IX vessels become `IX-601/602` and are now polishing/finishing, not primary

**Equipment renumbering (carried-over tags, +offset):**
- `PU-01/02` → `P-301/302` (renumbered into 300-series RO skid)
- `RO-01..RO-08` → `RO-301..RO-308` (+300)
- `RO-09..RO-11` → `RO-309..RO-311`
- `IX1101/1102` → `IX-601/602`

**Highlights:** draw an arrow on the `dd_full_pid` from `T-501` outlet to `MDL-801` inlet as the brain narrates the new flow path; simultaneously dim the bid's `CF-200/201` carbon-filter region on `bid_pid` to show what was removed.

### Beat 4 — Impacts, risks, and open checks

> "Three things worth flagging before sign-off."

**Open checks the brain must surface (must include at least the location inconsistency):**

1. **Project location inconsistency** — `dd_full_pid` title block says **MIDLAND, TX**; `dd_instrument_list` cover says **BEAUMONT, TX**. Same project number (`2034/001845`), same revision window. Either a copy-paste from a sibling project, or genuine ambiguity about the site. → highlight both title-block regions side-by-side.

2. **`TK-01` namespace collision within the DD set** — `TK-01A/B/C` on sheet 4 are MMF tanks; `TK-01` on sheet 12 is a 400-gal CIP cleaning tank. Same root tag, unrelated equipment. → highlight both sheet-4 and sheet-12 `TK-01` instances.

3. **Capacity bump (~30%)** — feed went from 107 GPM (bid) → 147 GPM (DD); product 80 GPM → 100 GPM. New buffer tank (`T-501`, 5672 gal) added to support the higher steady-state demand and the downstream CDI's flow tolerance. Worth confirming that the upstream feed source can sustain 147 GPM.

**Procurement / lead-time flags:**
- CEDI modules `MDL-801/802` (`VNX55-EP`) are a new technology — confirm spares on order.
- `T-501` (Design Tanks SD, 5672 gal FRP) is custom — long-lead.

**Future-design awareness:**
- `Skid 900` (`MDL-901/902`) is a placeholder for a second CDI bank. The DD already lays out the piping and instruments. Cite this if asked about future expansion.

**Highlights:** title-block regions on `dd_full_pid` sheet 1 and `dd_instrument_list` page 1; the two `TK-01` regions on `dd_full_pid` sheets 4 and 12.

### Beat 5 — Commit

> "Knowledge model updated. The buffer tank, the CDI skid, the new pretreatment, the dechlor loop, and the CIP system are now part of how the brain reasons about EH2 V1."

**State change:** in-memory graph now contains the union of bid baseline + DD packet, with relationships annotating which tags were **added / changed / removed / renumbered**. The "known system" view (sidebar) updates to show the as-built topology.

**Highlights:** the radial graph in `GbrainGraph.tsx` redraws with the new entities and edges; the Bid-only carbon filters (`CF-200/201`) fade out.

---

## Tag delta summary (validation table for Wenny)

`tagDeltas` returned by `/api/packet/ingest` must contain:

| Kind | Count (minimum) | Examples |
|---|---|---|
| `added` (equipment) | 23 | `TK-01A/B/C`, `T-501`, `MDL-801/802`, `P-501A/B`, `P-201A/B`, `P-202A/B`, `P-203A/B`, `F-101`, `F-601`, `UV-501`, `P-08A/B`, `P-701`, `MDL-901/902` (future), `HE-01`, `P-01`, `F-01` (CIP-sense) |
| `added` (instruments) | ~30 | Full 300/500/600-series instruments per `TAGS.md` |
| `changed` | 5 | `PU-01→P-301`, `PU-02→P-302`, `RO-01..08→RO-301..308`, `RO-09..11→RO-309..311`, `IX1101/02→IX-601/602`, `PU-03→P-203A/B` |
| `removed` | 3 | `CF-200`, `CF-201`, `FH-200` (replaced by `F-101`) |

Every entry must include `source: { doc, page, bbox_ref }` citations. Anything without a real bbox in the index gets logged as a soft-warning (per CLAUDE.md gotcha — degrade gracefully to scroll-only highlight, never crash).

---

## What a successful brain output looks like (JSON sketch)

```json
{
  "ingestionSteps": [
    { "id": "files", "narration": "Reading the detailed-design package…", "highlights": [...] },
    { "id": "tags", "narration": "Found 23 new equipment tags…", "highlights": [...] },
    { "id": "relations", "narration": "Mapped how the new equipment ties together…", "highlights": [...] },
    { "id": "risks", "narration": "Three things worth flagging…", "highlights": [...] },
    { "id": "commit", "narration": "Knowledge model updated.", "highlights": [...] }
  ],
  "tagDeltas": { "added": [...], "changed": [...], "removed": [...] },
  "relationshipDeltas": { "added": [...], "removed": [...] },
  "openChecks": [
    { "id": "midland_beaumont", "severity": "warn", ... },
    { "id": "tk01_namespace", "severity": "warn", ... },
    { "id": "feed_capacity_bump", "severity": "info", ... }
  ]
}
```

If the brain produces all 5 beats with correct citations + surfaces the Midland/Beaumont inconsistency unprompted, the demo lands.
