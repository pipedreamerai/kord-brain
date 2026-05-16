import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import * as gbrain from '@/lib/gbrain';

export const qaAgent = new Agent({
  id: 'kord-qa',
  model: gateway('anthropic/claude-opus-4-7'),
  stopWhen: stepCountIs(8),
  instructions: `You answer engineering questions against a knowledge graph (gbrain)
of cross-document tags (equipment, instruments, motors, breakers).

Rules:
- Use tools to gather evidence before answering. Don't guess from the question.
- Start with search_brain or list_pages to discover what's relevant.
- Pull pages with get_page and follow neighbors with traverse_graph as needed.
- Cite every claim by tag slug. If you can't ground a claim in a fetched page,
  say so explicitly instead of inventing.
- If tool calls keep returning errors, stop and tell the user "I can't reach
  the knowledge graph right now." Do not guess from the question — saying you
  don't know is better than inventing an answer.
- Keep answers tight: 2-4 sentences, then a "Cites:" line listing the tag
  slugs you actually used (lowercase, space- or comma-separated).`,
  tools: {
    search_brain: tool({
      description: 'Keyword search across brain pages. Returns slug + snippet.',
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(8),
      }),
      execute: ({ query, limit }) => gbrain.search(query, limit),
    }),
    get_page: tool({
      description: 'Fetch the full markdown for one brain page by slug.',
      inputSchema: z.object({ slug: z.string() }),
      execute: ({ slug }) => gbrain.getPage(slug),
    }),
    traverse_graph: tool({
      description:
        'One- or two-hop neighbors of a slug. Use to find related tags/docs.',
      inputSchema: z.object({
        slug: z.string(),
        depth: z.number().int().min(1).max(2).default(1),
      }),
      execute: ({ slug, depth }) => gbrain.graph(slug, depth),
    }),
    find_backlinks: tool({
      description:
        'Pages that reference this slug. Use to find which docs mention a tag.',
      inputSchema: z.object({ slug: z.string() }),
      execute: ({ slug }) => gbrain.backlinks(slug),
    }),
    list_pages: tool({
      description:
        'List all slugs currently in the brain. Use when you need the universe of valid tags.',
      inputSchema: z.object({}),
      execute: () => gbrain.list(500),
    }),
  },
});
