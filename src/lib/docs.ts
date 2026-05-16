import type { Tag } from './tags';

export type DocSlug =
  | 'bid_pid'
  | 'bid_ga'
  | 'bid_firm_quote'
  | 'dd_full_pid'
  | 'dd_full_ga'
  | 'dd_instrument_list'
  | 'rfq';

export type DocKind = 'pdf' | 'docx' | 'xlsx';

/**
 * One of two packages a document belongs to. Drives bid-vs-as-built diff logic.
 * `pre_bid` covers the RFQ that drove the bid.
 */
export type DocPackage = 'pre_bid' | 'bid' | 'detailed_design';

export type DocMeta = {
  slug: DocSlug;
  /** URL-safe flat filename used in /docs/[filename] route */
  filename: string;
  /** Actual on-disk path relative to the demo_docs/ directory */
  filePath: string;
  displayName: string;
  kind: DocKind;
  package: DocPackage;
};

export const DOCS: readonly DocMeta[] = [
  // Baseline (bid) — what the brain understands at boot
  {
    slug: 'bid_pid',
    filename: 'bid_pid.pdf',
    filePath: 'Bid/PID.pdf',
    displayName: 'Bid P&ID',
    kind: 'pdf',
    package: 'bid',
  },
  {
    slug: 'bid_ga',
    filename: 'bid_ga.pdf',
    filePath: 'Bid/GA Drawing.pdf',
    displayName: 'Bid GA Drawing',
    kind: 'pdf',
    package: 'bid',
  },
  {
    slug: 'bid_firm_quote',
    filename: 'bid_firm_quote.pdf',
    filePath: 'Bid/Firm Quote.pdf',
    displayName: 'Bid Firm Quote',
    kind: 'pdf',
    package: 'bid',
  },
  // Design packet (detailed design) — loaded live on stage
  {
    slug: 'dd_full_pid',
    filename: 'dd_full_pid.pdf',
    filePath: 'Detailed Design/Full PID.pdf',
    displayName: 'Detailed Design P&ID',
    kind: 'pdf',
    package: 'detailed_design',
  },
  {
    slug: 'dd_full_ga',
    filename: 'dd_full_ga.pdf',
    filePath: 'Detailed Design/Full GA Drawing.pdf',
    displayName: 'Detailed Design GA',
    kind: 'pdf',
    package: 'detailed_design',
  },
  {
    slug: 'dd_instrument_list',
    filename: 'dd_instrument_list.pdf',
    filePath: 'Detailed Design/Instrument List.pdf',
    displayName: 'Instrument List',
    kind: 'pdf',
    package: 'detailed_design',
  },
  // Design intent (RFQ)
  {
    slug: 'rfq',
    filename: 'rfq.pdf',
    filePath: 'RFQ.pdf',
    displayName: 'Original RFQ',
    kind: 'pdf',
    package: 'pre_bid',
  },
] as const;

export function docBySlug(slug: DocSlug): DocMeta {
  const d = DOCS.find((d) => d.slug === slug);
  if (!d) throw new Error(`Unknown doc slug: ${slug}`);
  return d;
}

export function docByFilename(filename: string): DocMeta | undefined {
  return DOCS.find((d) => d.filename === filename);
}

export function docsByPackage(pkg: DocPackage): DocMeta[] {
  return DOCS.filter((d) => d.package === pkg);
}

/**
 * Optional human-readable description per tag. Not every tag has one —
 * use a sensible fallback at the call site (e.g. show the tag itself, or "—").
 */
export const TAG_DESCRIPTIONS: Partial<Record<Tag, string>> = {
  // Bid equipment
  'FH-200':  'Pre-treatment cartridge filter (5 µm, 21 round × 30", 316L SS)',
  'CF-200':  'Carbon filter — bed 1 of 2 (42"D × 60"H, acid-washed carbon)',
  'CF-201':  'Carbon filter — bed 2 of 2 (in series with CF-200)',
  'F-01':    'Bid: Shelco pre-RO cartridge filter (5 µm, 304L SS). Also reused on DD CIP skid as 12×40" 316L cartridge housing — a namespace collision worth flagging.',
  'PU-01':   '1st-pass RO feed pump — Grundfos CRNE32-8 PGAE-HQQE, 30 HP (bid tag; becomes P-301 in DD)',
  'PU-02':   '2nd-pass RO feed pump — same family as PU-01 (bid tag; becomes P-302 in DD)',
  'PU-03':   'pH control dosage pump (bid; consolidated into P-203A/B chemical skid in DD)',
  'TK-01':   'Bid: 35-gal on-skid caustic tank. DD sheet 12: 400-gal FRP CIP cleaning tank. Same tag string, two unrelated tanks — flag as inconsistency.',
  'UV-200':  'Final TOC reduction UV — 8× 185 nm lamps, 80 GPM (bid; replaced in DD by Aquafine UV-501)',
  'IX1101':  'Polishing mixed-bed DI vessel — 30 ft³, FRP, virgin mixed-bed resin (bid; renumbered to IX-601 in DD)',
  'IX1102':  'Polishing mixed-bed DI vessel — pair to IX1101 (bid; renumbered to IX-602 in DD)',

  // DD equipment — pretreatment
  'TK-01A':  'Multi-media filter tank A — Triplex MMF (anthracite/sand/garnet), 100 psig ASME Sect VIII, model PTIXTA54X72A',
  'TK-01B':  'Multi-media filter tank B — Triplex MMF (matching TK-01A)',
  'TK-01C':  'Multi-media filter tank C — Triplex MMF (matching TK-01A)',
  'P-08A':   'Sodium hypochlorite chemical injection pump A — Grundfos DDA-AR 7.5-16, 3000:1 turndown',
  'P-08B':   'Sodium hypochlorite chemical injection pump B — duty/standby with P-08A',
  'F-101':   'Pre-RO cartridge filter — 22 round × 30", 5 µm, 304L SS, 150 psig non-code (replaces bid FH-200)',

  // DD equipment — chemical injection skid
  'P-201A':  'Sodium bisulfite (dechlor) injection pump A — Grundfos DDA-AR 7.5-16. NEW process function not in bid.',
  'P-201B':  'Sodium bisulfite injection pump B — duty/standby with P-201A',
  'P-202A':  'Antiscalant injection pump A — Grundfos DDA-AR 7.5-16, flow-paced from FT-301',
  'P-202B':  'Antiscalant injection pump B — duty/standby with P-202A',
  'P-203A':  'Caustic (NaOH 50%) interpass injection pump A — pH-paced from AE-304',
  'P-203B':  'Caustic injection pump B — duty/standby with P-203A',

  // DD equipment — RO permeate storage + distribution
  'T-501':   'RO permeate storage / buffer tank — 5672 gal working volume, 8\' Ø × 15\'-8" H, FRP with N₂ blanketing (Design Tanks SD). NEW in DD; decouples RO production rate from CDI demand.',
  'PCV-500': 'N₂ blanketing regulator on T-501 — Cashco 1088, set 1.5" W.C.',
  'CBV-501': 'Conservation vent / filter on T-501 — Cashco 3200, 1.5" W.C. pressure / 2" W.C. vacuum, 1.12 HEPA',
  'P-501A':  'RO product distribution pump A — Grundfos CRNE 15-4 N-FGJ-A-E-HQQE, 105.3 GPM @ 70 psi, VFD',
  'P-501B':  'RO product distribution pump B — duty/standby with P-501A',
  'UV-501':  'Final TOC reduction UV — Aquafine OPV120TL (replaces bid UV-200)',
  'F-601':   'Final 0.2 µm filter — 7 round × 40", 304L SS, 150 psig non-code. NEW in DD.',

  // DD equipment — CDI skid (Skid 800)
  'MDL-801': 'CEDI VNX module 1 of 2 — VNX55-EP, 2–13.2 DC A. NEW polishing technology added in DD.',
  'MDL-802': 'CEDI VNX module 2 of 2 — parallel to MDL-801',
  'P-701':   'CIP / recirculation pump on Skid 700 (VFD-controlled)',

  // DD equipment — future CDI (Skid 900)
  'MDL-901': 'Future CEDI module 1 of 2 — placeholder for second CDI bank',
  'MDL-902': 'Future CEDI module 2 of 2 — placeholder for second CDI bank',

  // DD equipment — CIP / cleaning skid (separately namespaced)
  'HE-01':   'CIP skid immersion heater — 18 kW, 480 V 3-phase, 21.65 A',
  'P-01':    'CIP skid booster pump — 15 HP TEFC, 200 GPM @ 140 ft TDH, 316 SS',

  // DD equipment — renumbered carries (same hardware, +offset tag)
  'P-301':   '1st-pass RO feed pump — same Grundfos CRNE32-8 as bid PU-01, renumbered into 300-series',
  'P-302':   '2nd-pass RO feed pump — same as bid PU-02',
  'RO-301':  '1st-pass RO housing 1 of 8 — Protec 8"/4-element, 450 psi ASME (was RO-01 in bid)',
  'RO-302':  '1st-pass RO housing 2 of 8 (was RO-02)',
  'RO-303':  '1st-pass RO housing 3 of 8 (was RO-03)',
  'RO-304':  '1st-pass RO housing 4 of 8 (was RO-04)',
  'RO-305':  '1st-pass RO housing 5 of 8 (was RO-05)',
  'RO-306':  '1st-pass RO housing 6 of 8 (was RO-06)',
  'RO-307':  '1st-pass RO housing 7 of 8 (was RO-07)',
  'RO-308':  '1st-pass RO housing 8 of 8 (was RO-08)',
  'RO-309':  '2nd-pass RO housing 1 of 3 (was RO-09)',
  'RO-310':  '2nd-pass RO housing 2 of 3 (was RO-10)',
  'RO-311':  '2nd-pass RO housing 3 of 3 (was RO-11)',
  'IX-601':  'Polishing mixed-bed DI vessel 1 of 2 — 30 ft³ FRP (was IX1101)',
  'IX-602':  'Polishing mixed-bed DI vessel 2 of 2 (was IX1102)',

  // DD instruments
  'AE/TE-301': 'Conductivity + temperature combined probe — Mettler-Toledo Thornton, 0.02–50000 µS/cm',
  'AE/TE-302': 'Conductivity + temperature probe — same family as AE/TE-301',
  'AE/TE-303': 'Conductivity + temperature probe — 3rd of 3',
  'AE-304':    'pH probe — Mettler-Toledo Thornton, 0–14 pH (drives caustic injection P-203A/B)',
  'AE-305':    'pH probe — interpass',
  'FT-301':    'RO feed flow transmitter — Georg Fischer Signet, 0.3–20 ft/s (paces antiscalant injection)',
  'FT-302':    '1st-pass reject flow transmitter',
  'FT-303':    '2nd-pass product flow transmitter',
  'PIT-303':   'Low-range pressure transmitter — IFM Efector PN2294, −14.5 to 145 psi',
  'PIT-305':   '1st-pass high-pressure pump discharge transmitter — IFM Efector PN2292, 0–1450 psi',
  'PIT-310':   'Low-range pressure transmitter',
  'PIT-312':   '2nd-pass high-pressure pump discharge transmitter — IFM Efector PN2292, 0–1450 psi',
  'PIT-317':   'Low-range pressure transmitter',
  'PIT-501':   'T-501 outlet pressure — IFM Efector',
  'AE/602':    'Polished water conductivity sensor — Mettler-Toledo, 0.002–500 µS/cm',
  'AE/AIT-601':'Online TOC analyzer — SUEZ WTS M500E, 0.03–25000 ppb',
  'FE-501':    'T-501 outlet flow element — Georg Fischer Signet',
  'LIT-501':   'T-501 DP level transmitter — Rosemount/Emerson 3051L, ±250 inH₂O',
  'LSL-201':   'Chemical tote low-level switch — Grundfos suction lance',
  'LSL-202':   'Chemical tote low-level switch — 2nd of 3',
  'LSL-203':   'Chemical tote low-level switch — 3rd of 3',

  // DD controls
  'MCP':       'Main Control Panel — Allen-Bradley',
  'RIO-003':   'Allen-Bradley Remote I/O — pretreatment skid',
  'RIO-004':   'Allen-Bradley Remote I/O — RO container',
  'HV-507':    'RODI buffer tank outlet isolation — Bray Controls hand valve',
};

/**
 * Optional list of doc slugs that mention each tag. Partial — populated as
 * vision extraction finds locations. Consumers should fall back to `[]`.
 */
export const TAG_APPEARS_IN: Partial<Record<Tag, DocSlug[]>> = {
  // Bid-only equipment
  'FH-200':  ['bid_pid'],
  'CF-200':  ['bid_pid'],
  'CF-201':  ['bid_pid'],
  'PU-01':   ['bid_pid', 'bid_firm_quote'],
  'PU-02':   ['bid_pid', 'bid_firm_quote'],
  'PU-03':   ['bid_pid'],
  'UV-200':  ['bid_pid'],
  'IX1101':  ['bid_pid'],
  'IX1102':  ['bid_pid'],

  // Cross-package tags (real namespace collisions per TAGS.md)
  'F-01':    ['bid_pid', 'dd_full_pid'],
  'TK-01':   ['bid_pid', 'dd_full_pid'],

  // DD-only equipment
  'TK-01A':  ['dd_full_pid', 'dd_full_ga'],
  'TK-01B':  ['dd_full_pid', 'dd_full_ga'],
  'TK-01C':  ['dd_full_pid', 'dd_full_ga'],
  'F-101':   ['dd_full_pid'],
  'P-08A':   ['dd_full_pid'],
  'P-08B':   ['dd_full_pid'],
  'P-201A':  ['dd_full_pid'],
  'P-201B':  ['dd_full_pid'],
  'P-202A':  ['dd_full_pid'],
  'P-202B':  ['dd_full_pid'],
  'P-203A':  ['dd_full_pid'],
  'P-203B':  ['dd_full_pid'],
  'T-501':   ['dd_full_pid', 'dd_full_ga', 'dd_instrument_list'],
  'PCV-500': ['dd_full_pid'],
  'CBV-501': ['dd_full_pid'],
  'P-501A':  ['dd_full_pid', 'dd_full_ga'],
  'P-501B':  ['dd_full_pid', 'dd_full_ga'],
  'UV-501':  ['dd_full_pid', 'dd_full_ga'],
  'F-601':   ['dd_full_pid'],
  'MDL-801': ['dd_full_pid', 'dd_full_ga'],
  'MDL-802': ['dd_full_pid', 'dd_full_ga'],
  'P-701':   ['dd_full_pid'],
  'MDL-901': ['dd_full_pid'],
  'MDL-902': ['dd_full_pid'],

  // DD renumbered equipment
  'P-301':   ['dd_full_pid', 'dd_full_ga'],
  'P-302':   ['dd_full_pid', 'dd_full_ga'],
  'RO-301':  ['dd_full_pid'],
  'RO-308':  ['dd_full_pid'],
  'RO-309':  ['dd_full_pid'],
  'RO-311':  ['dd_full_pid'],
  'IX-601':  ['dd_full_pid'],
  'IX-602':  ['dd_full_pid'],

  // DD instruments (mostly on Full PID + Instrument List)
  'AE/TE-301': ['dd_full_pid', 'dd_instrument_list'],
  'AE/TE-302': ['dd_full_pid', 'dd_instrument_list'],
  'AE/TE-303': ['dd_full_pid', 'dd_instrument_list'],
  'AE-304':    ['dd_full_pid', 'dd_instrument_list'],
  'AE-305':    ['dd_full_pid', 'dd_instrument_list'],
  'FT-301':    ['dd_full_pid', 'dd_instrument_list'],
  'FT-302':    ['dd_full_pid', 'dd_instrument_list'],
  'FT-303':    ['dd_full_pid', 'dd_instrument_list'],
  'PIT-303':   ['dd_full_pid', 'dd_instrument_list'],
  'PIT-305':   ['dd_full_pid', 'dd_instrument_list'],
  'PIT-310':   ['dd_full_pid', 'dd_instrument_list'],
  'PIT-312':   ['dd_full_pid', 'dd_instrument_list'],
  'PIT-317':   ['dd_full_pid', 'dd_instrument_list'],
  'PIT-501':   ['dd_full_pid', 'dd_instrument_list'],
  'AE/602':    ['dd_full_pid', 'dd_instrument_list'],
  'AE/AIT-601':['dd_full_pid', 'dd_instrument_list'],
  'FE-501':    ['dd_full_pid', 'dd_instrument_list'],
  'LIT-501':   ['dd_full_pid', 'dd_instrument_list'],
  'LSL-201':   ['dd_full_pid', 'dd_instrument_list'],
  'LSL-202':   ['dd_full_pid', 'dd_instrument_list'],
  'LSL-203':   ['dd_full_pid', 'dd_instrument_list'],

  // DD controls
  'MCP':       ['dd_full_pid'],
  'RIO-003':   ['dd_full_pid'],
  'RIO-004':   ['dd_full_pid'],
  'HV-507':    ['dd_full_pid'],
};
