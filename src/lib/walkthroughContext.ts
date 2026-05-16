import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DOCS, TAG_DESCRIPTIONS, TAG_APPEARS_IN, docBySlug } from './docs';
import type { Tag } from './tags';
import { getTagIndex } from './tagIndex';

export type WalkthroughContext = {
  tag: Tag;
  tagSummary: string;
  pidStructure: string;
  electricalStructure: string;
  equipmentListJson: string;
  narrativeText: string;
  motorSpecText: string;
};

const samplesDir = path.resolve(process.cwd(), 'samples');

function describeBboxFile(raw: string, label: string): string {
  const parsed = JSON.parse(raw) as {
    pages?: { page: number; tags?: { tag: string; note?: string; kind?: string }[] }[];
  };
  const lines: string[] = [`${label} elements:`];
  for (const pg of parsed.pages ?? []) {
    for (const t of pg.tags ?? []) {
      const note = t.note ? ` — ${t.note}` : '';
      const kind = t.kind ? ` (${t.kind})` : '';
      lines.push(`  - ${t.tag}${kind}${note}`);
    }
  }
  return lines.join('\n');
}

export async function buildWalkthroughContext(tag: Tag): Promise<WalkthroughContext> {
  const { tagIndex, docs } = await getTagIndex();

  const tagSummaryLines = Object.entries(tagIndex).map(([t, locs]) => {
    const slugs = Array.from(new Set(locs.map((l) => l.slug))).map(
      (slug) => docBySlug(slug).displayName,
    );
    return `  - ${t} (${TAG_DESCRIPTIONS[t as Tag]}): appears in ${slugs.join(', ') || '(none)'}`;
  });
  const tagSummary = ['Tag schema and where each tag appears:', ...tagSummaryLines].join('\n');

  const pidRaw = await readFile(path.join(samplesDir, 'pid.bboxes.json'), 'utf8');
  const electricalRaw = await readFile(path.join(samplesDir, 'electrical.bboxes.json'), 'utf8');
  const pidStructure = describeBboxFile(pidRaw, 'P&ID');
  const electricalStructure = describeBboxFile(electricalRaw, 'Electrical single-line');

  const xlsx = docs.equipment_list;
  const equipmentListJson =
    xlsx?.kind === 'xlsx'
      ? JSON.stringify(
          xlsx.sheets.map((s) => ({
            sheet: s.name,
            header: s.header,
            rows: s.rows,
          })),
          null,
          2,
        )
      : '(equipment list unavailable)';

  const narrative = docs.process_narrative;
  const narrativeText =
    narrative?.kind === 'docx' ? narrative.text : '(process narrative unavailable)';

  const motorSpec = docs.motor_spec;
  const motorSpecText =
    motorSpec?.kind === 'docx' ? motorSpec.text : '(motor spec unavailable)';

  return {
    tag,
    tagSummary,
    pidStructure,
    electricalStructure,
    equipmentListJson,
    narrativeText,
    motorSpecText,
  };
}

export function buildPrompt(ctx: WalkthroughContext): string {
  const docList = DOCS.map((d) => `  - ${d.slug} ("${d.displayName}", ${d.kind})`).join('\n');
  const appearsIn = TAG_APPEARS_IN[ctx.tag]
    .map((s) => docBySlug(s).displayName)
    .join(', ');

  return [
    `You are a senior process/electrical engineer walking a colleague through component ${ctx.tag} (${TAG_DESCRIPTIONS[ctx.tag]}) across a multi-document engineering package for a hydrogen feedwater skid.`,
    ``,
    `Produce a tight 4–6 beat walkthrough. Each beat is one short, declarative sentence (≤ 30 words) that advances the explanation. The walkthrough must jump across documents — the value is showing how ${ctx.tag} connects content scattered in different files (${appearsIn}).`,
    ``,
    `Hard rules:`,
    `- Every beat must include 1–3 highlights. Each highlight names a tag AND the doc slug where that tag should light up.`,
    `- ONLY use tags and doc slugs from the lists below. Never invent tags. Never reference a (tag, doc) pair that isn't listed in "Tag schema".`,
    `- Highlights for beat N must include ${ctx.tag} unless the beat is explicitly about a downstream/upstream component.`,
    `- Lead with the click target (${ctx.tag}) in beat 1. End with something demo-worthy — e.g. a procurement risk or interlock condition.`,
    `- Stay strictly inside what the source documents say. If you don't know a value, omit it; do not invent specs.`,
    ``,
    `Documents available:`,
    docList,
    ``,
    ctx.tagSummary,
    ``,
    ctx.pidStructure,
    ``,
    ctx.electricalStructure,
    ``,
    `=== Equipment list (xlsx, doc slug: equipment_list) ===`,
    ctx.equipmentListJson,
    ``,
    `=== Process narrative (docx, doc slug: process_narrative) ===`,
    ctx.narrativeText,
    ``,
    `=== Motor spec (docx, doc slug: motor_spec) ===`,
    ctx.motorSpecText,
    ``,
    `Now produce the walkthrough for ${ctx.tag}. Output each beat as a JSON object as soon as it is ready.`,
  ].join('\n');
}
