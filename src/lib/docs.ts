import type { Tag } from './tags';

export type DocSlug =
  | 'pid'
  | 'instrument_list'
  | 'ro_spec'
  | 'equipment_list'
  | 'process_narrative';

export type DocKind = 'pdf' | 'docx' | 'xlsx';

export type DocMeta = {
  slug: DocSlug;
  /** URL-safe flat filename used in /docs/[filename] route */
  filename: string;
  /** Actual on-disk path relative to the demo_docs/ directory */
  filePath: string;
  displayName: string;
  kind: DocKind;
};

export const DOCS: readonly DocMeta[] = [
  {
    slug: 'pid',
    filename: 'bid_pid.pdf',
    filePath: 'Bid/PID.pdf',
    displayName: 'Bid P&ID',
    kind: 'pdf',
  },
  {
    slug: 'instrument_list',
    filename: 'instrument_list.pdf',
    filePath: 'Detailed Design/Instrument List.pdf',
    displayName: 'Instrument List',
    kind: 'pdf',
  },
  {
    slug: 'ro_spec',
    filename: 'ro_spec.pdf',
    filePath: 'Bid/RO Unit Description.pdf',
    displayName: 'RO Unit Description',
    kind: 'pdf',
  },
  {
    slug: 'equipment_list',
    filename: 'equipment_list.xlsx',
    filePath: 'equipment_list.xlsx',
    displayName: 'Equipment List',
    kind: 'xlsx',
  },
  {
    slug: 'process_narrative',
    filename: 'process_narrative.docx',
    filePath: 'process_narrative.docx',
    displayName: 'System Narrative',
    kind: 'docx',
  },
] as const;

export function docBySlug(slug: DocSlug): DocMeta {
  const d = DOCS.find(d => d.slug === slug);
  if (!d) throw new Error(`Unknown doc slug: ${slug}`);
  return d;
}

export function docByFilename(filename: string): DocMeta | undefined {
  return DOCS.find(d => d.filename === filename);
}

export const TAG_DESCRIPTIONS: Record<Tag, string> = {
  'FT-301':  '1st-pass feed flow transmitter (Georg Fischer Signet, 0.3–20 ft/s)',
  'FT-302':  '1st-pass reject flow transmitter (Georg Fischer Signet, 0.3–20 ft/s)',
  'FT-303':  '2nd-pass product flow transmitter (Georg Fischer Signet, 0.3–20 ft/s)',
  'PIT-305': '1st-pass high-pressure pump discharge transmitter (IFM Efector, 0–1450 psi)',
  'PIT-312': '2nd-pass high-pressure pump discharge transmitter (IFM Efector, 0–1450 psi)',
  'LSL-201': 'Pump suction level switch #1 — low-level alarm, Grundfos suction lance',
  'LIT-501': 'RODI buffer tank level transmitter (Rosemount 3051L, ±250 inH₂O)',
  'HV-507':  'Buffer tank outlet butterfly valve 4" (Bray, 175 PSI, DI EPDM)',
};

export const TAG_APPEARS_IN: Record<Tag, DocSlug[]> = {
  'FT-301':  ['instrument_list', 'equipment_list', 'process_narrative'],
  'FT-302':  ['instrument_list', 'equipment_list'],
  'FT-303':  ['instrument_list', 'equipment_list', 'process_narrative'],
  'PIT-305': ['instrument_list', 'equipment_list'],
  'PIT-312': ['instrument_list', 'equipment_list'],
  'LSL-201': ['instrument_list', 'equipment_list', 'process_narrative'],
  'LIT-501': ['instrument_list', 'equipment_list', 'process_narrative'],
  'HV-507':  ['equipment_list', 'process_narrative'],
};
