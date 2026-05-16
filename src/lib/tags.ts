export const TAGS = [
  'FT-301',
  'FT-302',
  'FT-303',
  'PIT-305',
  'PIT-312',
  'LSL-201',
  'LIT-501',
  'HV-507',
] as const;

export type Tag = (typeof TAGS)[number];

export function isTag(s: string): s is Tag {
  return (TAGS as readonly string[]).includes(s);
}

export const TAG_REGEX = new RegExp(`\\b(${TAGS.join('|')})\\b`, 'g');
