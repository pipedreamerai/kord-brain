import type { Tag } from './tags';

export type DocSlug =
  | 'pid'
  | 'electrical'
  | 'equipment_list'
  | 'process_narrative'
  | 'motor_spec';

export type DocKind = 'pdf' | 'docx' | 'xlsx';

export type DocMeta = {
  slug: DocSlug;
  filename: string;
  displayName: string;
  kind: DocKind;
};

export const DOCS: readonly DocMeta[] = [
  { slug: 'pid',               filename: 'pid.pdf',                displayName: 'P&ID',                   kind: 'pdf'  },
  { slug: 'electrical',        filename: 'electrical.pdf',         displayName: 'Electrical Single-Line', kind: 'pdf'  },
  { slug: 'equipment_list',    filename: 'equipment_list.xlsx',    displayName: 'Equipment List',         kind: 'xlsx' },
  { slug: 'process_narrative', filename: 'process_narrative.docx', displayName: 'Process Narrative',      kind: 'docx' },
  { slug: 'motor_spec',        filename: 'motor_spec.docx',        displayName: 'Motor Spec',             kind: 'docx' },
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
  'P-101':   'Feedwater pump',
  'M-101':   'Pump motor (100 HP, 480V induction)',
  'CB-101':  'Motor breaker',
  'MCC-1':   'Motor control center',
  'LSL-201': 'Low-low level switch (suction tank)',
  'CV-301':  'Discharge control valve',
  'T-101':   'Suction tank',
  'IR-2':    'PLC input rack',
};

export const TAG_APPEARS_IN: Record<Tag, DocSlug[]> = {
  'P-101':   ['pid', 'equipment_list', 'process_narrative'],
  'M-101':   ['electrical', 'equipment_list', 'motor_spec'],
  'CB-101':  ['electrical', 'equipment_list'],
  'MCC-1':   ['electrical'],
  'LSL-201': ['pid', 'electrical', 'process_narrative'],
  'CV-301':  ['pid', 'electrical', 'process_narrative'],
  'T-101':   ['pid', 'process_narrative'],
  'IR-2':    ['electrical'],
};
