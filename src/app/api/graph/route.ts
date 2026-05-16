import { NextResponse } from 'next/server';
import * as gbrain from '@/lib/gbrain';
import type { BrainNode, BrainEdge } from '@/components/FullGbrainGraph';

export async function GET() {
  const slugs = await gbrain.list(200);

  const graphResults = await Promise.all(slugs.map((s) => gbrain.graph(s, 1)));

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
