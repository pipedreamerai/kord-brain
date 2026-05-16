# Tag schema — EH2 V1 water purification demo

**Status:** locked by Chris on 2026-05-16 after verifying against the real EH2 drawings. Supersedes the fake feedwater schema in `CLAUDE.md §3` (P-101 / M-101 / etc).

**Source of truth:** every tag below was visually verified on a P&ID sheet or in the Instrument List table. Vendor names, models, and capacities are pulled directly from the equipment specifications block on each sheet.

---

## Document set

| Slug | Filename | Package | Role |
|---|---|---|---|
| `bid_pid` | `Bid/PID.pdf` | Bid (May 2023) | **Baseline** — preliminary 2-pass RO schematic |
| `bid_ga` | `Bid/GA Drawing.pdf` | Bid | Baseline — proposed container GA |
| `bid_firm_quote` | `Bid/Firm Quote.pdf` | Bid | Baseline — equipment list, vendor selections |
| `dd_full_pid` | `Detailed Design/Full PID.pdf` | Detailed Design (Dec 2024) | **Design packet** — full 12-sheet as-built P&ID (9 process sheets) |
| `dd_full_ga` | `Detailed Design/Full GA Drawing.pdf` | Detailed Design | Design packet — detailed isometric & internal elevation |
| `dd_instrument_list` | `Detailed Design/Instrument List.pdf` | Detailed Design | Design packet — master instrument tag → spec table |
| `rfq` | `RFQ.pdf` | Pre-bid | **Design intent** — the original ask that drove the bid |

**Confidentiality:** real EH2 / Evoqua / M&H documents. Project numbers `22MH194` (M&H) and `2034/001845` (Evoqua) must be redacted before any external distribution.

---

## Tag conventions (verified from legend sheets)

**Equipment tag format:** `<TYPE>-<NUM>[<INSTANCE>]`
- `<TYPE>` follows EH2 / Evoqua convention: `TK`=tank, `P`=pump, `F`=filter, `RO`=RO vessel, `IX`=ion exchange vessel, `UV`=UV unit, `HE`=heat exchanger, `MDL`=CEDI module, `CF`=carbon filter, `FH`=filter housing.
- `<INSTANCE>` is `A/B/C…` for parallel duty (e.g. `TK-01A/B/C`, `P-501A/B`).
- DD packages use a **300/500/600/700/800/900-series numbering scheme** keyed to physical skid location: 100 = pretreatment, 200 = chemical injection, 300 = RO trains, 500 = storage + distribution, 600 = polishing + final, 700 = CIP recirc, 800 = CDI, 900 = future CDI.

**Instrument tag format:** `<ISA-CODE>[/|-]<NUM>` per ISA-5.1.
- First letter = measured variable: `A`=analytical, `F`=flow, `L`=level, `P`=pressure, `T`=temperature.
- Modifiers: `E`=element, `T`=transmitter, `I`=indicator, `S`=switch, `H`=high, `L`=low, `V`=valve.
- Combined: `AE/TE-301` = analytical element + temperature element on same probe; `PIT-303` = pressure indicating transmitter; `LSL-201` = level switch low.
- Slash separator (`AE/TE-301`, `AE/602`, `PI/01A`) is the real EH2 convention and NOT a typo.

---

## Baseline tags (Bid package — what the brain already knows)

### Equipment

| Tag | Description | Vendor / model | Appears in |
|---|---|---|---|
| `FH-200` | Pre-treatment cartridge filter (21 round × 30", 5 µm, 316L SS) | (Evoqua spec) | bid_pid (sheet 3) |
| `CF-200` | Carbon filter — bed 1 of 2 (42"D × 60"H, 60 ft³ SVC, acid-washed carbon, 150 psig ASME, 316L SS) | (Evoqua spec) | bid_pid (sheet 3) |
| `CF-201` | Carbon filter — bed 2 of 2 (in series with CF-200) | (Evoqua spec) | bid_pid (sheet 3) |
| `F-01` | Pre-RO cartridge filter (5 µm) | Shelco 12FOSS-3-P-F-G8-V, 304L SS | bid_pid (sheet 5) |
| `PU-01` | 1st-pass RO feed pump (30 HP) | Grundfos CRNE32-8 PGAE-HQQE | bid_pid (sheet 5), bid_firm_quote |
| `PU-02` | 2nd-pass RO feed pump (30 HP) | Grundfos CRNE32-8 PGAE-HQQE | bid_pid (sheet 5), bid_firm_quote |
| `PU-03` | pH control injection pump (caustic) | (small dosage pump) | bid_pid (sheet 5) |
| `RO-01`..`RO-08` | 1st-pass RO membrane housings (8 vessels, 8" × 4-element, 450 psi ASME, FRP/SS, 2" grooved) | Protec | bid_pid (sheet 5) |
| `RO-09`..`RO-11` | 2nd-pass RO membrane housings (3 vessels, same family) | Protec | bid_pid (sheet 5) |
| `TK-01` (bid sense) | 35-gallon caustic tank (NOT skid-mounted) | — | bid_pid (sheet 5) |
| `UV-200` | Final TOC reduction UV (8× 185 nm lamps, 240 mJ/cm² at 80 GPM, 316L SS) | (Evoqua spec) | bid_pid (sheet 6) |
| `IX1101` | Polishing mixed-bed DI vessel (30 ft³, FRP, 100 psi non-code, virgin mixed-bed resin) | (Evoqua spec) | bid_pid (sheet 6) |
| `IX1102` | Polishing mixed-bed DI vessel (matching pair to IX1101) | (Evoqua spec) | bid_pid (sheet 6) |

### Baseline performance envelope
- **Feed:** 107 GPM nominal, 30–80 psig, 3" PVC SCH 80
- **Product:** 80 GPM @ 35 psig nominal to customer storage
- **Reject:** 80 GPM to drain

### Baseline instruments
Loosely tagged — bid P&ID uses informal `PI/01..PI/17`, `AE/01..AE/07`, `FT/01..FT/03`, `TE/01..TE/05`, `LAL/0233..LAL/0236` (4-digit), and unlabeled dosage pumps. Bid is preliminary, so the tag scheme is not load-bearing.

---

## Design packet tags (Detailed Design — what the brain learns)

Split into **added**, **changed** (carried over from bid with material delta), and **removed** (in bid but dropped from DD).

### ➕ NEW equipment in Detailed Design

| Tag | Description | Vendor / model | Appears in |
|---|---|---|---|
| `TK-01A`, `TK-01B`, `TK-01C` | Triplex multi-media filter (anthracite 18" + filter sand 8" + garnet 4", 100 psig ASME Sect VIII) | PTIXTA54X72A, Spec S5111-020 | dd_full_pid (sheet 4), dd_full_ga |
| `P-08A`, `P-08B` | Sodium hypochlorite chemical injection pumps (chlorination upstream of MMF) | Grundfos DDA-AR 7.5-16, 3000:1 turndown, 2 GPH @ 232 psig | dd_full_pid (sheet 4) |
| `IQ-08A`, `IQ-08B` | Sodium hypochlorite injection quills | — | dd_full_pid (sheet 4) |
| `F-101` | Standalone pre-RO cartridge filter (22 round × 30", 5 µm, 150 psig, 304L SS) | (Evoqua spec) | dd_full_pid (sheet 5) |
| `P-201A`, `P-201B` | **Sodium bisulfite chemical injection (dechlor)** — NEW process function | Grundfos DDA-AR 7.5-16 | dd_full_pid (sheet 6) |
| `P-202A`, `P-202B` | Antiscalant injection (flow-paced from `FT-301`) | Grundfos DDA-AR 7.5-16 | dd_full_pid (sheet 6) |
| `P-203A`, `P-203B` | Caustic (NaOH 50%) injection for interpass pH bump (pH-paced from `AE-304`) | Grundfos DDA-AR 7.5-16 | dd_full_pid (sheet 6) |
| `IQ-201A/B`, `IQ-202A/B` | Injection quills (sodium bisulfite + antiscalant) | — | dd_full_pid (sheet 6) |
| `T-501` | **RO permeate storage / buffer tank** (5672 gal working volume, 8' ⌀ × 15'-8" H, FRP white-pigmented with N₂ blanketing) | Design Tanks Sioux Falls SD | dd_full_pid (sheet 8), dd_full_ga, dd_instrument_list |
| `PCV-500` | N₂ blanketing regulator on T-501 (1.5" W.C. set point) | Cashco 1088, SS316/PTFE/Viton | dd_full_pid (sheet 8) |
| `CBV-501` | Conservation vent / filter on T-501 (1.5" W.C. pressure, 2" W.C. vacuum, 1.12 HEPA) | Cashco 3200 | dd_full_pid (sheet 8) |
| `P-501A`, `P-501B` | **RO product distribution pumps** (105.3 GPM @ 70 psi, VFD) | Grundfos CRNE 15-4 N-FGJ-A-E-HQQE | dd_full_pid (sheet 8), dd_full_pid (sheet 10) |
| `UV-501` | Final TOC reduction UV (different vendor than bid `UV-200`) | Aquafine OPV120TL | dd_full_pid (sheet 8) |
| `F-601` | **Final 0.2 µm filter** — NEW between IX vessels and product outlet | (Evoqua spec, 304L SS) | dd_full_pid (sheet 9) |
| `MDL-801`, `MDL-802` | **CEDI (Continuous Electrodeionization) modules** — entire new polishing technology added on Skid 800 | VNX55-EP, FLA 2–13.2 DC A | dd_full_pid (sheet 10), dd_full_ga |
| `MDL-901`, `MDL-902` | **Future CDI modules** (Skid 900 placeholder for second CDI bank) | VNX55-EP | dd_full_pid (sheet 11) |
| `P-701` | CIP / recirculation pump on Skid 700 (VFD) | (Grundfos) | dd_full_pid (sheet 10) |
| `HE-01` | Immersion heater on CIP skid (18 kW, 480 V 3-phase, 21.65 A) | — | dd_full_pid (sheet 12) |
| `P-01` | CIP skid booster pump (15 HP TEFC, 200 GPM @ 140 ft TDH, 316 SS) | — | dd_full_pid (sheet 12) |
| `F-01` (CIP sense) | CIP skid cartridge filter housing (12 round × 40", 5 µm, 316L SS) — **DIFFERENT** equipment from bid_pid `F-01` | — | dd_full_pid (sheet 12) |

### 🔄 CHANGED equipment (carried over with material delta — usually renumbered)

| Bid tag | DD tag | What changed |
|---|---|---|
| `PU-01` | `P-301` | Same Grundfos CRNE32-8 pump, **renumbered** + capacity bumped from 107→147 GPM feed |
| `PU-02` | `P-302` | Same pump family, **renumbered** + capacity bump |
| `RO-01..RO-08` | `RO-301..RO-308` | Same Protec 8"/4-element FRP vessels, **renumbered with +300 offset** |
| `RO-09..RO-11` | `RO-309..RO-311` | Same 2nd-pass vessels, renumbered |
| `IX1101` | `IX-601` | Same 30 ft³ mixed-bed vessel, **tag scheme migrated from 4-digit to 3-digit** |
| `IX1102` | `IX-602` | Same, renumbered |
| `PU-03` + bid `TK-01` (caustic tank, 35 gal, on RO skid) | `P-203A/B` + chemical tote | Caustic pH-adjust **moved off RO skid onto a dedicated chemical injection skid**, no longer needs the 35-gal on-skid tank |
| `UV-200` | `UV-501` | UV unit **changed vendor**: was Evoqua-spec 8-lamp 185 nm; now Aquafine OPV120TL |

### ➖ REMOVED equipment (in bid, gone in DD)

| Tag | Why dropped |
|---|---|
| `CF-200`, `CF-201` | **Dual carbon filters removed.** Pretreatment philosophy changed from carbon adsorption to multi-media filtration (`TK-01A/B/C` MMF triplex) + upstream sodium bisulfite dechlorination (`P-201A/B`). Carbon was no longer load-bearing once active dechlor was added. |
| `FH-200` | Bid's pre-treatment cartridge filter replaced by `F-101` (slightly larger, same vendor family). |

### Performance envelope (after change)

| | Bid | Detailed Design | Δ |
|---|---|---|---|
| Feed flow | 107 GPM | 147 GPM | +37% |
| RO product flow | 80 GPM | 100 GPM nominal | +25% |
| Distribution flow | (delivered direct) | 105.3 GPM via `P-501A/B` | NEW |
| 1st-pass RO permeate | (not calc'd) | `FI-301 + FI-302 − FI-303` | NEW |
| 2nd-pass RO permeate | (not calc'd) | `FI-301 − FI-303` | NEW |

---

## Instruments (Detailed Design — from Instrument List + verified on Full PID)

| Tag(s) | Function | Vendor | Range | Output |
|---|---|---|---|---|
| `AE/TE-301`, `AE/TE-302`, `AE/TE-303` | Conductivity + temperature (combined probe) | Mettler-Toledo Thornton (SAP W2T815334, P/N 58 031 409) | 0.02–50000 µS/cm | 4–20 mA |
| `AE-304`, `AE-305` | pH probe (RO feed + interpass) | Mettler-Toledo Thornton (W2T547559) | 0–14 pH | 4–20 mA |
| `FT-301`, `FT-302`, `FT-303` | Paddle flow meter (RO feed, 1st-pass, 2nd-pass) | Georg Fischer Signet (W2T302031) | 0.3–20 ft/s | 4–20 mA |
| `PIT-303`, `PIT-310`, `PIT-317` | Pressure transmitter — low range | IFM Efector PN2294 (W2T547882) | −14.5 to 145 psi | 4–20 mA |
| `PIT-305`, `PIT-312` | Pressure transmitter — high range (RO discharge) | IFM Efector PN2292 (W2T821363) | 0–1450 psi | 4–20 mA |
| `AE/602` | Polished water conductivity | Mettler-Toledo Thornton (W2T822480) | 0.002–500 µS/cm | 4–20 mA |
| `AE/AIT-601` | Online TOC analyzer | SUEZ WTS M500E (W2T901585) | 0.03–25000 ppb | 4–20 mA |
| `FE-501` | T-501 outlet flow element | Georg Fischer Signet | 0.3–20 ft/s | 4–20 mA |
| `PIT-501` | T-501 outlet pressure | IFM Efector PN2294 | −14.5 to 145 psi | 4–20 mA |
| `LSL-201`, `LSL-202`, `LSL-203` | Chemical tote low-level switches | Grundfos suction lance (W2T822321) | — | digital |
| `LIT-501` | T-501 DP level transmitter | Rosemount / Emerson (W2T910443) | −250 to 250 inH₂O | 4–20 mA |

Additional instruments visible on Full PID sheets but not in the Instrument List excerpt:
`PT/301..PT/317`, `AE/301..AE/307`, `AIT/301..AIT/302`, `FI/301..FI/305`, `FE/302..FE/305`, `TE/301..TE/304`, `TT/301`, `TI/301..TI/302`, `DI/301..DI/302`, `FV-301..FV-306`, plus `PSV-301..PSV-304` and the entire 700/800/900-series families on the CDI sheets.

---

## Cross-doc inconsistencies (real, discoverable by the brain)

These are **load-bearing for the demo** — they're the cases where the brain shows its value by catching things humans miss in cross-doc review.

### 1. Project location mismatch (Midland vs Beaumont)
- `Detailed Design/Full PID.pdf` title block: **"ELECTRIC HYDROGEN, MIDLAND, TX"** on every sheet
- `Detailed Design/Instrument List.pdf` cover page: **"Electric Hydrogen, Beaumont, TX"**

Same project (`2034/001845`), same revision date window (Dec 2024 / Mar 2024), two different sites. Either a copy-paste from a sibling project, or a real ambiguity about which EH2 site the package was for.

### 2. `TK-01` namespace collision (within DD)
- `Detailed Design/Full PID.pdf` sheet 4: `TK-01A`, `TK-01B`, `TK-01C` are the triplex multi-media filter tanks (RO pretreatment, on Skid 00).
- `Detailed Design/Full PID.pdf` sheet 12: `TK-01` is a **400-gallon FRP cleaning chemical tank** on the standalone CIP / fouled-system cleaning skid (with `HE-01`, `P-01`, `F-01`).

Same drawing set, same tag root, two unrelated tanks. The CIP skid is treated as a separate sub-skid and reuses the namespace from `01`. An engineer doing pure tag-search would conflate them.

### 3. `F-01` namespace collision (cross-package + within DD)
- `Bid/PID.pdf` sheet 5: `F-01` = Shelco pre-RO cartridge filter (5 µm, 304L SS).
- `Detailed Design/Full PID.pdf` sheet 12: `F-01` = a different cartridge filter housing on the CIP skid (12 round × 40", 5 µm, 316L SS).

The bid `F-01` becomes DD `F-101` (renumbered as pretreatment). The DD `F-01` is brand-new on a separately namespaced sub-skid. Same tag, three different filters across the corpus.

---

## How bboxes get produced (AI-native, no hand annotation)

**Decided 2026-05-16, replaces CLAUDE.md §5's hand-annotation plan.**

Tag locations are extracted by Claude Opus 4.7's vision API, not hand-annotated. Two phases:

1. **Setup phase (baseline, off-stage, cached):** for each of the 3 bid PDFs, send each page as an image to the vision API with a prompt asking for every equipment/instrument tag visible with `bbox: [x0, y0, x1, y1]` PDF user-space coordinates. Cache the resulting `{tag, doc, page, bbox}` triples. Re-runs only if the bid PDFs change (cache key = SHA of PDFs + extraction prompt).
2. **Demo phase (packet, live on stage):** when Chris loads the 3 DD PDFs, the same vision extraction runs **live** — this is part of the demo's wow moment ("the brain reads the new drawings"). Roughly 16 pages × 3–5 s per page ≈ 60–90 s, which paces the ingestion beats naturally.

This schema (`TAGS.md`) stays authoritative for **what tags exist**; the vision extraction supplies **where on the page each one is**. Tags emitted by the AI walkthrough are still validated against this schema before highlighting (per `filterBeat` in `src/app/api/walkthrough/route.ts`).

**Cross-doc inconsistencies (Midland/Beaumont, `TK-01` namespace)** also come out of the vision pass — the model can highlight title-block regions or non-tag text just as easily as equipment tags.

## What's still TBD

- **Wenny's task:** translate this schema into `src/lib/tags.ts` (TAGS const) and `src/lib/docs.ts` (DocSlug union + DOCS array + TAG_APPEARS_IN map). Existing fake-feedwater entries get fully replaced.
- **Wenny's task:** build the vision-extraction pipeline (`src/lib/ingestion/vision.ts`) that takes a PDF page → image → vision API → `{tag, bbox}[]`, with caching keyed on PDF content hash.
- **Wenny's task:** build the "Load design packet" upload flow that streams the 5 ingestion beats from `EXPECTED_INGESTION.md` as vision extraction + gbrain delta computation runs.
- **Chris's task:** audit this schema for accuracy (the equipment / instrument tags above came from Chris's verified review of the drawings). No bbox annotation work needed.
