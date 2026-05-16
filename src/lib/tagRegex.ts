/**
 * Generic engineering-tag pattern. Matches strings like:
 *   P-101, M-101, CB-101, MCC-1, LSL-201, CV-301, T-101,
 *   P-501A, RO-308, AE/TE-301, AE/602, J-BOX, IR-2.
 *
 * No whitelist — tags are discovered from whatever the user uploads.
 */
const PATTERN = /\b[A-Z]{1,5}(?:\/[A-Z]{1,5})?-(?:\d{1,4}[A-Z]?|[A-Z]+)\b/g;

export function tagRegex(): RegExp {
  return new RegExp(PATTERN.source, 'g');
}

export function isLikelyTag(s: string): boolean {
  return new RegExp(`^(?:${PATTERN.source})$`).test(s);
}

/** Tag → URL-safe lowercase slug for gbrain pages. `AE/TE-301` → `ae-te-301`. */
export function tagToSlug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
