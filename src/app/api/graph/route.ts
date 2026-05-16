import { NextResponse } from 'next/server';
import * as gbrain from '@/lib/gbrain';
import { getAllDocs } from '@/lib/uploads';
import { tagToSlug } from '@/lib/tagRegex';
import type { BrainNode, BrainEdge } from '@/components/FullGbrainGraph';

export const dynamic = 'force-dynamic';

export async function GET() {
  const docs = await getAllDocs();

  // Seed traversal with everything we know was just uploaded — tag pages get
  // discovered via depth-1 edges.
  const seedSlugs = new Set<string>();
  for (const d of docs) {
    seedSlugs.add(d.slug);
    for (const t of d.tags) seedSlugs.add(tagToSlug(t));
  }

  // Augment with whatever `gbrain list` returns (may be empty in some setups).
  const listed = await gbrain.list(500);
  for (const s of listed) seedSlugs.add(s);

  const nodeMap = new Map<string, BrainNode>();
  const edgeSet = new Set<string>();
  const edges: BrainEdge[] = [];

  for (const slug of seedSlugs) {
    const nodes = await gbrain.graph(slug, 1).catch(() => []);
    for (const node of nodes) {
      if (!nodeMap.has(node.slug)) {
        nodeMap.set(node.slug, { slug: node.slug, title: node.title, kind: node.type });
      }
      for (const link of node.links) {
        const key = `${node.slug}→${link.to_slug}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: node.slug, to: link.to_slug, kind: link.link_type });
        }
      }
    }
  }

  const stats = await gbrain.stats().catch(() => ({ pages: 0, links: 0 }));

  return NextResponse.json({
    nodes: [...nodeMap.values()],
    edges,
    stats,
  });
}
