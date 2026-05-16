# Add Vercel AI Agent (v6) to kord-brain — Q&A over gbrain

**Date:** 2026-05-16
**Status:** Design — pending eng review
**Owner:** Wenny (software), Chris (domain validation)

## Context

The recent "blank canvas" + "Fix UI" commits stripped the prior AI surface
(`/api/walkthrough`, `WalkthroughPanel`, `vision.ts`, `aiModels.ts`, the seed and
tag-index endpoints). The current app is two tabs — Files and Graph — with no
conversational surface. `ai@^6` and `@ai-sdk/gateway@^3` are still in
`package.json` but unused.

We want to re-add an AI layer using the AI SDK v6 `Agent` primitive. Its job in
the demo is **Q&A over the brain**: Chris asks plain-English questions ("can
the system run if P-101 is offline?", "which docs mention the new pump
train?"), and the agent uses gbrain tools to gather evidence and answer with
tag-level citations that highlight inline in the currently-open document.

This is the Q&A leg of the §1 demo arc in `CLAUDE.md`. It is **not** the
ingestion-narration leg (that remains a future workstream — the Agent
primitive is reusable, so a second agent can be added later without touching
this one).

## Goals

1. A right-side **chat panel** inside the existing Files tab.
2. A reusable **`qaAgent`** built on `Agent` (AI SDK v6) that talks to gbrain
   via tool calls.
3. **Visible reasoning** — tool calls render as collapsible chips above the
   final answer.
4. **Tag-level citations** that drive the existing `highlightedTags` /
   `highlightedAnchors` props in the PDF/DOCX/XLSX viewers.

## Non-goals

- Conversation persistence (chat is per-tab session, matches the current "No
  data persistence" direction).
- Ingestion narration / 5-beat walkthrough (separate future agent).
- Per-page bbox or cell-precise citations (current viewers already highlight
  by tag; bbox sidecars are empty after the strip-down).
- Multi-agent orchestration.

## Architecture

```
ChatPanel (useChat from @ai-sdk/react)
   │  POST /api/chat  { messages }
   ▼
/api/chat/route.ts ── qaAgent.stream(req) ──► toUIMessageStreamResponse()
                       │
                       └── tools: search_brain, get_page,
                                  traverse_graph, find_backlinks,
                                  list_pages
                                  │
                                  ▼
                            src/lib/gbrain.ts ──► gbrain CLI
                                  │
                                  ▼
                              ~/.gbrain/brain.pglite

Stream parts arrive in ChatPanel:
   text-delta  ─► assistant bubble streams in
   tool-call   ─► chip: 🔎 search_brain("P-101")
   tool-result ─► chip expands to show JSON
   finish      ─► parse "Cites:" line → intersect with slugs seen in tool
                  results → write appStore.citedTags
                  → FilesTab passes Set into active viewer
                  → highlights light up
```

### Why `Agent`, not `streamText` directly

The user picked Approach A explicitly: "we are using the agents SDK and want
to build on that." The `Agent` primitive bundles model/tools/system into a
reusable object, which sets us up for a second agent (ingestion narration)
later without duplicating the boilerplate.

## Components

### 1. `src/lib/agents/qa.ts` (new)

The `qaAgent` instance and its tool definitions. Calls into the existing
`src/lib/gbrain.ts` client; does not shell out to the CLI directly.

```ts
import { Agent, stepCountIs, tool } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import * as gbrain from '@/lib/gbrain';

export const qaAgent = new Agent({
  model: gateway('anthropic/claude-opus-4-7'),
  stopWhen: stepCountIs(8),
  system: `You answer engineering questions against a knowledge graph (gbrain)
of cross-document tags (equipment, instruments, motors, breakers).

Rules:
- Use tools to gather evidence before answering. Don't guess from the question.
- Start with search_brain or list_pages to discover what's relevant.
- Pull pages with get_page and follow neighbors with traverse_graph as needed.
- Cite every claim by tag slug. If you can't ground a claim in a fetched page,
  say so explicitly instead of inventing.
- Keep answers tight: 2–4 sentences, then a "Cites:" line listing the tag
  slugs you actually used.`,
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
```

### 2. `src/app/api/chat/route.ts` (new)

Thin Next.js POST endpoint. Hands the request body to the agent and returns
the UI message stream.

```ts
import { qaAgent } from '@/lib/agents/qa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return qaAgent.respond({ request: req });
}
```

(Exact API name pending — `Agent#respond({ request })` vs
`Agent#stream(...).toUIMessageStreamResponse()`. Confirm against installed
`ai@^6.0.182` types during implementation. Either way, the route stays a
one-liner.)

### 3. `src/components/ChatPanel.tsx` (new)

Right-side chat panel using `useChat` from `@ai-sdk/react`.

Responsibilities:
- Render the message list. Each assistant message walks `parts[]`:
  - `text` → prose bubble (streams).
  - `tool-call` → collapsed chip showing tool name + truncated args.
  - `tool-result` → chip expands to show the result JSON.
- Textarea + send button. Disabled while a turn is in flight.
- On turn finish, parse the assistant's final `text` part for a line matching
  `^Cites:\s*(.+)$`, split on whitespace/commas, lowercase, intersect with the
  slug universe seen in this turn's `tool-result` parts, and call
  `appStore.setCitedTags(...)`.
- "Clear" button → resets messages and `citedTags`.

The component is ~200 lines max. No virtualization, no markdown rendering
beyond newlines (the agent's answers are 2–4 sentences plus a Cites line).

### 4. `src/components/FilesTab.tsx` (edited)

Becomes a 3-column shell:

```
┌──────────┬───────────────────────┬──────────────────┐
│  Files   │     Doc viewer        │    ChatPanel     │
│  (w-72)  │     (flex-1)          │    (w-96)        │
└──────────┴───────────────────────┴──────────────────┘
```

The current `DocViewer` helper passes `citedTags` (slug form, e.g. `"p-101"`)
into each viewer. **This requires small viewer edits to standardize on slug
form** — today they compare against raw tag form (`"P-101"`):

- `PdfViewer.tsx` line 166: `highlightedTags.has(b.tag)` →
  `highlightedTags.has(tagToSlug(b.tag))`
- `XlsxViewer.tsx` line 33: `highlightedTags.has(tag)` →
  `highlightedTags.has(tagToSlug(tag))`
- `DocxViewer.tsx`: today it takes `highlightedAnchors: Set<string>` of
  per-occurrence ids like `tag-P_101-1`. Change the prop to
  `highlightedTags: Set<string>` (slug form) and check
  `tagToSlug(m.dataset.tag!)`. Removes the per-occurrence concept entirely.

After these edits, all three viewers take the same `highlightedTags: Set<string>`
prop in slug form, and `appStore.citedTags` flows straight through.

The `bboxes={[]}` passed to `PdfViewer` stays empty for now — PDF highlighting
works when bbox sidecars are populated, and lights up nothing when they
aren't. That's fine for this milestone; DOCX and XLSX highlights will be the
demoable surface.

Empty viewer pane (no file selected): show "Pick a file to see citations
highlighted." Chat still works.

### 5. `src/lib/appStore.ts` (edited)

Add two pieces of state:

```ts
citedTags: Set<string>;
setCitedTags: (tags: Set<string>) => void;
```

`hydrate()` does not touch this — it's session-only.

### 6. `package.json` (edited)

Add `@ai-sdk/react@^2` (matches the `ai@^6` major). No other dep changes.

## Data shape decisions

### Why no structured output schema for citations

The AI SDK v6 `Agent` supports `experimental_output` with a Zod schema to
force structured output in addition to streamed text. We deliberately avoid it
here:

- The "Cites:" tail line is trivial to parse and easier on the UI (one stream
  of `text` parts, not two channels).
- Structured output occasionally interferes with tool-call streaming in v6
  (parallel-channel races).
- The defensive filter — "intersect with slugs we actually fetched this
  turn" — is the real hallucination guard. The Cites line is just a hint.

If this turns out to be fragile in practice, swap in
`experimental_output: z.object({ answer: z.string(), cited_tags: z.array(z.string()) })`
and parse from the structured channel instead. The UI change is small.

### Cited-tag filtering

When a turn finishes:

1. Walk all `tool-result` parts in the just-finished assistant message.
2. Extract every slug that appears (from `search_brain` hits, `get_page`
   results, `traverse_graph` nodes, etc).
3. Parse the `Cites:` line from the final `text` part.
4. Intersect → that's `citedTags`.

This means the model can only highlight tags it actually saw evidence for in
this turn. Even a perfectly-formatted hallucinated Cites line gets dropped.

## Error handling

- **gbrain CLI failure (binary missing, brain empty):** tool `execute`
  throws → AI SDK reports the error as a tool-result with `error: ...`. The
  agent sees this in the loop and either retries with a different tool or
  tells the user "I couldn't reach the brain." The user sees a red chip.
- **`stopWhen` hit (8 steps without an answer):** the stream ends with
  whatever text the agent has produced. ChatPanel renders it as-is; if no
  Cites line exists, `citedTags` stays empty.
- **Gateway / model failure:** AI SDK surfaces an error event on the stream;
  `useChat` exposes it via `error`. Render in a red toast under the input.
- **No conversation persistence** → refresh loses the chat. Acceptable
  trade-off for the demo.

## Testing

Manual, demo-driven. No automated tests for this milestone.

Smoke tests (each is a chat turn against a seeded brain):

1. "What is P-101?" → expects `get_page("p-101")`, answer mentions feedwater
   pump, Cites includes `p-101`.
2. "What documents mention CB-101?" → expects `find_backlinks("cb-101")`,
   answer lists doc slugs, Cites includes `cb-101` + the doc slugs.
3. "What's connected to M-101?" → expects `traverse_graph("m-101", 1)`,
   answer references neighbors, Cites includes them.
4. "What is XYZ-999?" (not in brain) → expects search → empty → agent says it
   doesn't know. Citations empty.
5. Open `pid.pdf` then ask about P-101 → verify PDF highlights are empty
   (bboxes file not present) but DOCX/XLSX (if those open) highlight cited
   tags.

Each smoke test is a manual click-through. Pass criteria: tool chips render,
text streams, citations land in the viewer.

## Risks

| Risk | Mitigation |
|------|------------|
| AI SDK v6 `Agent` API surface differs from what's documented | Implementation step starts by reading the installed package's `.d.ts` files; route handler stays a one-liner so adapting is cheap. |
| `useChat` (v6) parts-streaming UX differs in subtle ways from v5 | Build ChatPanel against installed types; iterate on chip rendering against a real stream early. |
| gbrain CLI shell-out is slow per tool call (~100ms × 8 steps = noticeable) | Acceptable for demo. If it bites, batch in a single tool call (e.g. `get_context(slug)` that returns root + neighbors in one shot) — `getRelatedContext()` already exists in gbrain.ts. |
| Model invents tags despite the rules | Cited-tag intersection drops them before highlight; user just sees fewer highlights, not wrong ones. |
| `pnpm` install for `@ai-sdk/react` pulls in a different React version than the rest of the app | Pin to a version known to work with React 19; resolve in implementation. |

## Implementation order (sketch — full plan comes from `writing-plans`)

1. Add `@ai-sdk/react` and confirm install.
2. Build `src/lib/agents/qa.ts` with the five tools. Smoke from a one-off
   script (`tsx scripts/qa-smoke.ts`) before any UI.
3. Wire `/api/chat/route.ts`. Hit it with `curl` to confirm the stream shape.
4. Build `ChatPanel.tsx`. Iterate on chip rendering.
5. Extend `appStore.ts` with `citedTags` + `setCitedTags`.
6. Edit `FilesTab.tsx` to split into three columns + wire `citedTags` into
   viewers.
7. Manual smoke tests 1–5 from the Testing section.

## Open questions

None blocking. Implementation may discover:

- Exact `Agent` response/stream API in installed `ai@6.0.182` — confirm from
  types.
- Whether `@ai-sdk/react@2` is the right major against `ai@6` — confirm from
  the AI SDK v6 release notes.
