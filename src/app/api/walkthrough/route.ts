import { NextResponse, type NextRequest } from 'next/server';
import { streamObject } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { TAGS, isTag, type Tag } from '@/lib/tags';
import { DOCS, type DocSlug } from '@/lib/docs';
import { getTagIndex } from '@/lib/tagIndex';
import { buildPrompt, buildWalkthroughContext } from '@/lib/walkthroughContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DOC_SLUGS = DOCS.map((d) => d.slug) as [DocSlug, ...DocSlug[]];

const Beat = z.object({
  text: z
    .string()
    .min(1)
    .describe('One short declarative sentence advancing the walkthrough.'),
  highlights: z
    .array(
      z.object({
        tag: z.enum([...TAGS] as [Tag, ...Tag[]]),
        doc: z.enum(DOC_SLUGS),
      }),
    )
    .min(1)
    .max(3)
    .describe('1–3 (tag, doc) pairs that should light up while this beat is read.'),
});

type BeatOut = z.infer<typeof Beat>;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tagRaw = (body as { tag?: unknown } | null)?.tag;
  if (typeof tagRaw !== 'string' || !isTag(tagRaw)) {
    return NextResponse.json(
      { error: `tag must be one of: ${TAGS.join(', ')}` },
      { status: 400 },
    );
  }
  const tag: Tag = tagRaw;

  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: 'AI_GATEWAY_API_KEY not set. Copy .env.example to .env.local and fill it in.' },
      { status: 500 },
    );
  }

  const { tagIndex } = await getTagIndex();
  const validPairs = new Set<string>();
  for (const [t, locs] of Object.entries(tagIndex)) {
    for (const loc of locs) validPairs.add(`${t}::${loc.slug}`);
  }

  const ctx = await buildWalkthroughContext(tag);
  const prompt = buildPrompt(ctx);

  const result = streamObject({
    model: gateway('anthropic/claude-opus-4-7'),
    output: 'array',
    schema: Beat,
    prompt,
  });

  const ctxPayload = {
    type: 'context' as const,
    root: ctx.rootSlug,
    neighbors: ctx.neighbors.map((n) => ({
      slug: n.slug,
      kind: n.kind,
      title: n.page.frontmatter.title ?? n.slug,
    })),
    edges: ctx.graph
      .filter((node) => node.depth === 0)
      .flatMap((node) =>
        node.links
          .filter((l) => l.to_slug !== node.slug)
          .map((l) => ({ from: node.slug, to: l.to_slug, kind: l.link_type })),
      ),
    backlinks: Array.from(
      new Set(ctx.incoming.map((b) => b.from_slug).filter((s) => s !== ctx.rootSlug)),
    ),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let i = 0;
      try {
        controller.enqueue(encoder.encode(JSON.stringify(ctxPayload) + '\n'));
        for await (const beat of result.elementStream) {
          const cleaned = filterBeat(beat, validPairs);
          if (!cleaned) continue;
          const payload = { i, ...cleaned };
          controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
          i++;
        }
        controller.enqueue(encoder.encode(JSON.stringify({ done: true, count: i }) + '\n'));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: message }) + '\n'),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

function filterBeat(beat: BeatOut, validPairs: Set<string>): BeatOut | null {
  const highlights = beat.highlights.filter((h) => validPairs.has(`${h.tag}::${h.doc}`));
  if (highlights.length === 0) return null;
  return { text: beat.text, highlights };
}
