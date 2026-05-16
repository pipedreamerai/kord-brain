export const TAGS = [
  'P-101',
  'M-101',
  'CB-101',
  'MCC-1',
  'LSL-201',
  'CV-301',
  'T-101',
  'IR-2',
] as const;

export type Tag = (typeof TAGS)[number];

export function isTag(s: string): s is Tag {
  return (TAGS as readonly string[]).includes(s);
}

export const TAG_REGEX = new RegExp(`\\b(${TAGS.join('|')})\\b`, 'g');
