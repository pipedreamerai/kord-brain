import { NextResponse } from 'next/server';
import { graph, getPage, stats, list } from '@/lib/gbrain';
import { DOCS } from '@/lib/docs';
import { getTagIndex } from '@/lib/tagIndex';

export const dynamic = 'force-dynamic';

// Known brain-md slugs — used as fallback when `gbrain list` returns nothing
const FALLBACK_SLUGS = [
  'bid_pid', 'bid_firm_quote', 'dd_instrument_list', 'equipment_list', 'process_narrative',
  'ft-301', 'ft-302', 'ft-303', 'pit-305', 'pit-312', 'lsl-201', 'lit-501', 'hv-507',
];

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: object) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      try {
        // ── Phase 1: gbrain stats ─────────────────────────────────────────────
        emit({ type: 'phase', label: 'Connecting to gbrain…' });
        let brainStats = { pages: 0, links: 0 };
        try {
          brainStats = await stats();
          emit({ type: 'stats', ...brainStats });
        } catch {
          emit({ type: 'stats', pages: 0, links: 0 });
        }

        // ── Phase 2: Discover all page slugs ─────────────────────────────────
        emit({ type: 'phase', label: 'Discovering knowledge graph…' });
        let slugs = await list(200);
        if (slugs.length === 0) slugs = FALLBACK_SLUGS;
        emit({ type: 'slugs_found', count: slugs.length });

        // ── Phase 3: Fetch page content in parallel, emit sequentially ────────
        const pagePromises = slugs.map(s => getPage(s).catch(() => null));
        const pages = await Promise.all(pagePromises);

        const knownNodes = new Map<string, { slug: string; title: string; kind: string }>();

        for (const page of pages) {
          if (!page) continue;
          const kind = page.frontmatter.type ?? 'unknown';
          const title = page.frontmatter.title ?? page.slug;
          knownNodes.set(page.slug, { slug: page.slug, title, kind });
          emit({ type: 'brain_node', slug: page.slug, title, kind, snippet: page.markdown.slice(0, 200) });
          await delay(50);
        }

        // ── Phase 4: Build graph edges ────────────────────────────────────────
        emit({ type: 'phase', label: 'Tracing edges…' });
        const graphPromises = slugs.map(s => graph(s, 1).catch(() => []));
        const graphResults = await Promise.all(graphPromises);

        const seenEdges = new Set<string>();

        for (const graphData of graphResults) {
          for (const node of graphData) {
            // Add any nodes discovered via graph traversal (depth-1 neighbours)
            if (!knownNodes.has(node.slug)) {
              const kind = node.type ?? 'unknown';
              const title = node.title ?? node.slug;
              knownNodes.set(node.slug, { slug: node.slug, title, kind });
              emit({ type: 'brain_node', slug: node.slug, title, kind, snippet: '' });
            }
            for (const link of node.links) {
              const key = `${node.slug}→${link.to_slug}`;
              if (!seenEdges.has(key)) {
                seenEdges.add(key);
                emit({ type: 'brain_edge', from: node.slug, to: link.to_slug, kind: link.link_type });
              }
            }
          }
        }

        emit({
          type: 'graph_ready',
          nodes: Array.from(knownNodes.values()),
          edges: Array.from(seenEdges).map(k => {
            const [from, to] = k.split('→');
            return { from, to, kind: 'link' };
          }),
        });

        // ── Phase 5: Parse engineering documents ──────────────────────────────
        emit({ type: 'phase', label: 'Parsing engineering documents…' });
        const { tagIndex, docs } = await getTagIndex();

        for (const meta of DOCS) {
          const docData = docs[meta.slug];
          if (!docData) {
            emit({ type: 'doc_done', slug: meta.slug, displayName: meta.displayName, kind: meta.kind, tagCount: 0, tags: [] });
            await delay(60);
            continue;
          }
          const tags = (Object.entries(tagIndex) as [string, unknown[]][])
            .filter(([, locs]) => (locs as { slug: string }[]).some(l => l.slug === meta.slug))
            .map(([tag]) => tag);
          emit({ type: 'doc_done', slug: meta.slug, displayName: meta.displayName, kind: meta.kind, tagCount: tags.length, tags: tags.slice(0, 12) });
          await delay(120);
        }

        // ── Done ──────────────────────────────────────────────────────────────
        const totalTagged = (Object.values(tagIndex) as unknown[][]).filter(l => l.length > 0).length;
        emit({ type: 'complete', totalTagged, docCount: Object.keys(docs).length });
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
