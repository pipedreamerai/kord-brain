import { NextResponse } from 'next/server';
import * as gbrain from '@/lib/gbrain';
import type { BrainNode, BrainEdge } from '@/components/FullGbrainGraph';

// gbrain list returns nothing when items are stored as chunks; use known seed slugs as anchors
const SEED_SLUGS = [
  'bid_pid', 'bid_firm_quote', 'dd_instrument_list', 'equipment_list', 'process_narrative',
  'ft-301', 'ft-302', 'ft-303', 'pit-305', 'pit-312', 'lsl-201', 'lit-501', 'hv-507',
];

export async function GET() {
  let slugs = await gbrain.list(200);
  if (slugs.length === 0) slugs = SEED_SLUGS;

  const graphResults: Awaited<ReturnType<typeof gbrain.graph>>[] = [];
  for (const s of slugs) {
    graphResults.push(await gbrain.graph(s, 1).catch(() => []));
  }

  const nodeMap = new Map<string, BrainNode>();
  const edgeSet = new Set<string>();
  const edges: BrainEdge[] = [];

  for (const nodes of graphResults) {
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

  const brainStats = await gbrain.stats();

  return NextResponse.json({
    nodes: Array.from(nodeMap.values()),
    edges,
    stats: brainStats,
  });
}
