# EXPECTED_QA.md — live demo questions and expected answers

**Scenario:** after the design packet ingests (per [`EXPECTED_INGESTION.md`](./EXPECTED_INGESTION.md)), Chris asks 2–3 natural-language questions live in the **"Ask the brain anything"** input. The brain queries the updated graph and streams answers with `[tag, doc, page]` citations that drive highlights.

This file is the **ground truth** for what good answers look like. Wenny uses these to prompt-tune `/api/qa` until the answers reliably land.

**5 questions total** — Chris picks the **2–3 strongest** for the live demo on the day. The remaining ones are backups in case the live questions go sideways.

Full tag definitions live in [`TAGS.md`](./TAGS.md). Underlying bid → DD diff lives in [`EXPECTED_INGESTION.md`](./EXPECTED_INGESTION.md).

---

## Q1 — "What changed compared to the original bid?"

**Why it lands:** broad opener, lets the brain show the whole story in one breath. Tests synthesis.

**Expected answer shape:**

> The system grew about 30% — feed went from 107 to 147 GPM, product from 80 to 100 GPM. Pretreatment was rebuilt around a triplex multi-media filter (`TK-01A/B/C`) plus an upstream chlorination / downstream dechlorination loop (`P-08A/B` + `P-201A/B`); the bid's dual carbon filters (`CF-200/CF-201`) are gone. The biggest addition is the back end: a 5672-gal buffer tank (`T-501`), VFD-controlled distribution pumps (`P-501A/B`), a new CEDI polishing skid (`MDL-801/802`), and a new 0.2 µm final filter (`F-601`). The RO trains themselves are the same Protec / Grundfos hardware, just renumbered from the bid's `RO-01..11` into the `RO-301..311` 300-series scheme.

**Citations the brain must produce (minimum):**
- `(TK-01A, dd_full_pid, 4)` + `(CF-200, bid_pid, 3)` — to highlight the carbon-filter removal side-by-side with the new MMF
- `(T-501, dd_full_pid, 8)` — the new buffer tank
- `(MDL-801, dd_full_pid, 10)` — the new CDI
- `(RO-301, dd_full_pid, 7)` + `(RO-01, bid_pid, 5)` — to show the renumber

**Hallucination check:** all 5 tag refs must resolve to real bbox entries. Any unresolved ref = `filterBeat` drops the highlight, narration still lands.

---

## Q2 — "Why was the buffer tank added?"

**Why it lands:** tests *reasoning* — the brain must connect the new T-501 to the new CDI downstream, not just list facts. This is the "engineering judgment" moment.

**Expected answer shape:**

> `T-501` was added because the as-built design adds an entire new CDI (continuous electrodeionization) polishing skid downstream of the RO trains — `MDL-801` and `MDL-802` on Skid 800. CDI modules need a steady, controlled feed: the bid's design fed RO permeate directly to the polishing mixed-bed vessels, but CDI is flow-sensitive and benefits from a buffer that decouples RO production rate from downstream demand. `T-501` (5672 gal FRP, with N₂ blanketing via `PCV-500` and a `CBV-501` conservation vent) gives that decoupling. `P-501A/B` then VFD-pumps from `T-501` at the rate CDI needs.

**Citations:**
- `(T-501, dd_full_pid, 8)` — the tank itself
- `(MDL-801, dd_full_pid, 10)` — the CDI downstream
- `(P-501A, dd_full_pid, 8)` — the distribution pump linking them

**What good looks like:** the brain explains the *causal chain* (CDI added → CDI needs steady feed → buffer tank added). Bad = "T-501 is a tank that was added."

---

## Q3 — "What got removed between bid and as-built?"

**Why it lands:** the symmetric counterpart to Q1's "what was added." Removal is harder for a brain to detect than addition — tests the `tagDeltas.removed` half of the diff.

**Expected answer shape:**

> Three things from the bid don't appear in the as-built:
>
> 1. The two carbon filters `CF-200` and `CF-201` — bid had these in series after the cartridge filter. The as-built replaces carbon adsorption with multi-media filtration (`TK-01A/B/C` triplex MMF) plus active dechlorination via sodium bisulfite injection (`P-201A/B`). Different chemistry, same goal of removing chlorine before the RO membranes.
> 2. The bid's pre-treatment cartridge filter `FH-200` (21 round × 30") — replaced by a slightly larger `F-101` (22 round × 30") in a standalone position.
> 3. The bid's on-skid caustic tank (35 gal `TK-01` on the RO skid) and its on-skid `PU-03` pH-control pump — pH adjustment moved off the RO skid onto a dedicated chemical injection skid (`P-203A/B`).

**Citations:**
- `(CF-200, bid_pid, 3)` and `(CF-201, bid_pid, 3)` — the removed carbon filters
- `(TK-01A, dd_full_pid, 4)` + `(P-201A, dd_full_pid, 6)` — what replaced them

**What good looks like:** the brain explains *why* something was removed (chemistry replacement), not just lists what's missing.

---

## Q4 — "Which documents reference the CDI skid?"

**Why it lands:** tests pure cross-doc retrieval. Should be fast and citation-heavy.

**Expected answer shape:**

> The CDI skid (`MDL-801`, `MDL-802`) shows up in two of the detailed-design documents:
>
> - `Detailed Design/Full PID.pdf` — sheet 10 has the full process diagram for Skid 800: CEDI VNX modules, dilute/concentrate ports, the `P-501A/B` distribution pumps that feed it, the `PIT/802/803/804` pressure instrumentation, and the `CIP-801/802/803` clean-in-place connections.
> - `Detailed Design/Full GA Drawing.pdf` — the CDI skid appears as a labeled equipment block in the container internal-elevation view.
>
> The bid package doesn't mention CDI at all — it ended in mixed-bed polishing (`IX1101/IX1102`), which has been demoted to a finishing step (`IX-601/602`) in the as-built. The Instrument List has the supporting 800-series instruments but doesn't reference the `MDL-` modules directly.

**Citations:**
- `(MDL-801, dd_full_pid, 10)`, `(MDL-802, dd_full_pid, 10)`
- `(MDL-801, dd_full_ga, 2)` *(or whichever GA page shows the CDI skid)*

**What good looks like:** correctly distinguishes which docs DO and DO NOT mention CDI. Bad = naming docs that don't reference it.

---

## Q5 — "Anything inconsistent across these documents?" (the easter egg)

**Why it lands:** the closer. Lands as "oh wow, the AI caught something a human would miss." The brain has the information in its catalog — `dd_full_pid` title block says "MIDLAND, TX" on every sheet, `dd_instrument_list` cover says "BEAUMONT, TX" — so this is a structured-query win, not a hallucination.

**Expected answer shape:**

> Two cross-doc inconsistencies in the detailed-design package:
>
> 1. **Project location mismatch.** The Full PID title block says the project is in **Midland, TX** — on every one of the 12 sheets. But the Instrument List cover page says **Beaumont, TX**. Same Evoqua project number (`2034/001845`), same March / December 2024 revision window. Either a copy-paste artifact from a sibling project, or a real ambiguity about which Electric Hydrogen site this water system is being built for. Worth confirming with M&H before the as-builts get filed.
> 2. **`TK-01` means two different tanks within the Full PID itself.** On sheet 4, `TK-01A/B/C` are the triplex multi-media filter vessels (pretreatment, 100 psig ASME). On sheet 12, `TK-01` is a 400-gallon FRP cleaning chemical tank on the standalone CIP / fouled-system skid. The CIP skid was clearly designed as a separate sub-skid and the tag namespace was reset to `01`, but a tag-only search would conflate the two.

**Citations:**
- `(_doc-full-pid, dd_full_pid, 1)` — the Midland title block
- `(_doc-instrument-list, dd_instrument_list, 1)` — the Beaumont cover
- `(TK-01A, dd_full_pid, 4)` + `(TK-01, dd_full_pid, 12)` — the two tanks

**Hint policy:** if rehearsal shows the brain consistently doesn't surface the Midland/Beaumont fact unprompted in Q5, add an explicit hint to the system prompt: *"Compare title-block metadata across documents in the catalog."* Don't add the hint until rehearsals prove it's needed — finding it unaided is more impressive.

**Fallback:** if both inconsistencies land in one answer, Q5 carries the close on its own. If only the `TK-01` one lands and Midland/Beaumont doesn't, the close still works.

---

## Demo question shortlist (Chris's pick for the live run)

Recommended live sequence:

1. **Q1** ("what changed") — broad opener, sets up the diff
2. **Q2** ("why the buffer tank") — proves reasoning, not just retrieval
3. **Q5** ("anything inconsistent") — easter-egg close

Q3 and Q4 stay in reserve. If Q1 underdelivers (vague summary), pivot to Q3 to force the brain into specifics. If Q2's causal-chain answer doesn't land, swap in Q4 (pure retrieval) instead.

**Hard rule (per CLAUDE.md §11):** every `[tag, doc, page]` ref the brain emits must resolve against the tag index. Unresolved refs get dropped before render. Success criterion = zero unresolved refs in a clean rehearsal pass.
