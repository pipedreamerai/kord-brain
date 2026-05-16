/**
 * Tag schema for the EH2 V1 water purification demo.
 * Source of truth: ../../TAGS.md (audited by Chris 2026-05-16).
 *
 * Tags are grouped by package + category for readability. The flat `TAGS`
 * const is what the rest of the app consumes — order here is presentation only.
 */

const BID_EQUIPMENT = [
  // Pretreatment
  'FH-200',           // Pre-treatment cartridge filter
  'CF-200',           // Carbon filter 1 of 2
  'CF-201',           // Carbon filter 2 of 2
  // RO skid (preliminary bid tags — later renumbered in DD)
  'F-01',             // Shelco pre-RO cartridge filter (bid sense; also reused on DD CIP skid)
  'PU-01',            // 1st-pass RO feed pump (Grundfos CRNE32-8)
  'PU-02',            // 2nd-pass RO feed pump
  'PU-03',            // pH control injection pump
  'RO-01', 'RO-02', 'RO-03', 'RO-04', 'RO-05', 'RO-06', 'RO-07', 'RO-08', // 1st-pass RO housings
  'RO-09', 'RO-10', 'RO-11', // 2nd-pass RO housings
  'TK-01',            // 35-gal caustic tank (bid sense; also reused on DD CIP skid)
  // Polishing
  'UV-200',           // Final TOC UV (bid — replaced in DD by Aquafine UV-501)
  'IX1101', 'IX1102', // Polishing mixed-bed DI vessels (bid tag scheme)
] as const;

const DD_EQUIPMENT_NEW = [
  // Pretreatment — chlorination upstream of MMF
  'P-08A', 'P-08B',          // Sodium hypochlorite injection pumps (Grundfos DDA-AR)
  'IQ-08A', 'IQ-08B',        // NaClO injection quills
  // Pretreatment — multi-media filter triplex (replaces bid CF-200/201)
  'TK-01A', 'TK-01B', 'TK-01C', // Triplex MMF tanks
  // Cartridge filter (replaces bid FH-200)
  'F-101',                   // Standalone pre-RO cartridge filter
  // Chemical injection skid
  'P-201A', 'P-201B',        // Sodium bisulfite (dechlor) — NEW process function
  'P-202A', 'P-202B',        // Antiscalant
  'P-203A', 'P-203B',        // Caustic for interpass pH
  'IQ-201A', 'IQ-201B',      // Sodium bisulfite injection quills
  'IQ-202A', 'IQ-202B',      // Antiscalant injection quills
  // RO permeate storage + distribution
  'T-501',                   // RO permeate storage tank (5672 gal, Design Tanks)
  'PCV-500',                 // N2 blanketing regulator (Cashco 1088)
  'CBV-501',                 // Conservation vent / filter (Cashco 3200)
  'P-501A', 'P-501B',        // Distribution pumps (Grundfos CRNE 15-4, VFD)
  'UV-501',                  // Final TOC UV (Aquafine OPV120TL — replaces bid UV-200)
  // Polishing + final filter
  'F-601',                   // Final 0.2 µm filter — NEW
  // CDI skid 800
  'MDL-801', 'MDL-802',      // CEDI VNX modules
  'P-701',                   // CIP / recirc pump (Skid 700)
  // Future CDI skid 900
  'MDL-901', 'MDL-902',      // Future CDI modules
  // CIP / cleaning skid (separately namespaced — F-01 and TK-01 collide with bid)
  'HE-01',                   // Immersion heater (18 kW)
  'P-01',                    // CIP booster pump (15 HP)
] as const;

const DD_EQUIPMENT_RENUMBERED = [
  // RO feed pumps (was PU-01/02)
  'P-301', 'P-302',
  // 1st-pass RO housings (was RO-01..RO-08)
  'RO-301', 'RO-302', 'RO-303', 'RO-304', 'RO-305', 'RO-306', 'RO-307', 'RO-308',
  // 2nd-pass RO housings (was RO-09..RO-11)
  'RO-309', 'RO-310', 'RO-311',
  // Polishing mixed-bed (was IX1101/02)
  'IX-601', 'IX-602',
] as const;

const DD_INSTRUMENTS = [
  // Conductivity + temp (combined probes, Mettler-Toledo Thornton)
  'AE/TE-301', 'AE/TE-302', 'AE/TE-303',
  // pH probes (Mettler-Toledo Thornton)
  'AE-304', 'AE-305',
  // Flow transmitters (Georg Fischer Signet)
  'FT-301', 'FT-302', 'FT-303',
  // Pressure transmitters (IFM Efector)
  'PIT-303', 'PIT-305', 'PIT-310', 'PIT-312', 'PIT-317',
  // Polished water analytics (600 series)
  'AE/602',                  // Conductivity (Mettler-Toledo, 0.002–500 µS/cm)
  'AE/AIT-601',              // Online TOC analyzer (SUEZ M500E)
  // T-501 instrumentation (500 series)
  'FE-501',                  // T-501 outlet flow element
  'PIT-501',                 // T-501 outlet pressure
  'LIT-501',                 // T-501 DP level transmitter (Rosemount)
  // Chemical tote level switches (Grundfos suction lance)
  'LSL-201', 'LSL-202', 'LSL-203',
] as const;

const DD_CONTROLS = [
  'MCP',          // Main Control Panel
  'RIO-003',      // Allen-Bradley Remote I/O panel (pretreatment)
  'RIO-004',      // Allen-Bradley Remote I/O panel (RO skid)
  'J-BOX-020',    // Junction box (MMF skid)
  'J-BOX-030',    // Junction box (chemical injection skid)
  'J-BOX-040',    // Junction box (RO container)
  'J-BOX-050',    // Junction box (CDI skid)
  'HV-507',       // Notable hand valve — RODI tank isolation (Bray Controls)
] as const;

export const TAGS = [
  ...BID_EQUIPMENT,
  ...DD_EQUIPMENT_NEW,
  ...DD_EQUIPMENT_RENUMBERED,
  ...DD_INSTRUMENTS,
  ...DD_CONTROLS,
] as const;

export type Tag = (typeof TAGS)[number];

export function isTag(s: string): s is Tag {
  return (TAGS as readonly string[]).includes(s);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Right-anchored alternation that matches any known tag string. No left-side
 * word boundary because tags include `/` (e.g. `AE/TE-301`) which is not a
 * word character — `\b` would behave unpredictably. False positives are
 * filtered downstream by `isTag()`.
 *
 * Vision extraction is the primary tag-location source; this regex is a
 * fallback used by text-layer scans in `ingestion/docx.ts` etc.
 */
export const TAG_REGEX = new RegExp(
  `(${TAGS.map(escapeRegex).join('|')})\\b`,
  'g',
);
