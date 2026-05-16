import { DOCS, TAG_DESCRIPTIONS, TAG_APPEARS_IN, docBySlug, type DocSlug } from './docs';
import type { Tag } from './tags';
import { getPage, graph, backlinks, type Page, type GraphNode } from './gbrain';

export type GbrainNeighbor = {
  slug: string;
  kind: 'tag' | 'document' | 'unknown';
  page: Page;
};

export type WalkthroughContext = {
  tag: Tag;
  rootSlug: string;
  rootPage: Page;
  neighbors: GbrainNeighbor[];
  graph: GraphNode[];
  incoming: { from_slug: string; context: string }[];
};

function tagToSlug(tag: Tag): string {
  return tag.toLowerCase();
}

function classify(slug: string): GbrainNeighbor['kind'] {
  if ((DOCS as readonly { slug: string }[]).some((d) => d.slug === slug)) return 'document';
  if (/^[a-z]+-\d+$/.test(slug)) return 'tag';
  return 'unknown';
}

export async function buildWalkthroughContext(tag: Tag): Promise<WalkthroughContext> {
  const rootSlug = tagToSlug(tag);

  const [graphData, incomingRaw] = await Promise.all([
    graph(rootSlug, 1),
    backlinks(rootSlug),
  ]);

  const neighborSlugs = new Set<string>();
  for (const node of graphData) {
    if (node.depth === 0) continue;
    if (node.slug === rootSlug) continue;
    neighborSlugs.add(node.slug);
  }
  for (const b of incomingRaw) {
    if (b.from_slug !== rootSlug) neighborSlugs.add(b.from_slug);
  }

  const slugArr = Array.from(neighborSlugs);
  const [rootPage, ...neighborPages] = await Promise.all([
    getPage(rootSlug),
    ...slugArr.map((s) => getPage(s)),
  ]);

  const neighbors: GbrainNeighbor[] = slugArr
    .map((slug, i) => ({ slug, kind: classify(slug), page: neighborPages[i] }))
    .filter((nb): nb is GbrainNeighbor => nb.page !== null);

  const incoming = incomingRaw.map((b) => ({ from_slug: b.from_slug, context: b.context }));

  return {
    tag,
    rootSlug,
    rootPage: rootPage ?? { slug: rootSlug, frontmatter: {}, markdown: '' },
    neighbors,
    graph: graphData,
    incoming,
  };
}

export function buildPrompt(ctx: WalkthroughContext): string {
  const appearsIn = (TAG_APPEARS_IN[ctx.tag] ?? [])
    .map((s) => docBySlug(s).displayName)
    .join(', ') || '(no doc index yet)';

  const docList = DOCS.map(
    (d) => `  - ${d.slug} ("${d.displayName}", ${d.kind})`,
  ).join('\n');

  const graphSummary = ctx.graph
    .filter((n) => n.depth === 0)
    .flatMap((n) =>
      n.links.map((l) => `  - ${n.slug} → ${l.to_slug} (${l.link_type})`),
    )
    .join('\n');

  const neighborSections = ctx.neighbors
    .map((nb) => {
      const header = nb.kind === 'document'
        ? `=== Connected document: ${nb.slug} (gbrain slug) ===`
        : `=== Connected component: ${nb.slug} ===`;
      const fm = nb.page.frontmatter.title ? `Title: ${nb.page.frontmatter.title}\n` : '';
      return `${header}\n${fm}${nb.page.markdown}`;
    })
    .join('\n\n');

  const backlinkLine = ctx.incoming.length
    ? `Backlinks (pages that mention ${ctx.rootSlug}): ${Array.from(new Set(ctx.incoming.map((b) => b.from_slug))).join(', ')}`
    : 'Backlinks: (none)';

  return [
    `You are a senior process/instrumentation engineer walking a colleague through component ${ctx.tag} (${TAG_DESCRIPTIONS[ctx.tag] ?? 'no description on file'}) across a multi-document engineering package for the Evoqua 2-pass RO + CDI water purification unit at Electric Hydrogen (project 2034/001845).`,
    ``,
    `The context below was selected by gbrain (a knowledge-graph engine). gbrain ingested the raw engineering docs, extracted entity wiki-links, and returned the subgraph reachable from ${ctx.rootSlug}. The LLM only sees what gbrain says is connected.`,
    ``,
    `Produce a tight 4–6 beat walkthrough. Each beat is one short, declarative sentence (≤ 30 words) that advances the explanation. The walkthrough must jump across documents — the value is showing how ${ctx.tag} connects content scattered in different files (${appearsIn}).`,
    ``,
    `Hard rules:`,
    `- Every beat must include 1–3 highlights. Each highlight names a tag AND the doc slug where that tag should light up.`,
    `- ONLY use tags and doc slugs from the lists below. Never invent tags. Never reference a (tag, doc) pair that isn't supported by the gbrain context.`,
    `- Highlights for beat N must include ${ctx.tag} unless the beat is explicitly about a downstream/upstream component.`,
    `- Lead with the click target (${ctx.tag}) in beat 1. End with something demo-worthy — e.g. a procurement risk or interlock condition.`,
    `- Stay strictly inside what the gbrain pages below say. If you don't know a value, omit it; do not invent specs.`,
    ``,
    `Documents available (use these doc slugs in highlights):`,
    docList,
    ``,
    `=== Graph (1-hop edges from ${ctx.rootSlug}) ===`,
    graphSummary || '  (no edges)',
    ``,
    backlinkLine,
    ``,
    `=== Root page (gbrain slug: ${ctx.rootSlug}) ===`,
    ctx.rootPage.markdown,
    ``,
    neighborSections,
    ``,
    `Now produce the walkthrough for ${ctx.tag}. Output each beat as a JSON object as soon as it is ready.`,
  ].join('\n');
}

export type { DocSlug };
