# kord-brain

Cross-doc engineering reasoning demo. Click a component on an engineering diagram and an AI streams a multi-beat walkthrough with synchronized highlights across PDFs, DOCX, and XLSX.

See [`hackathon-plan.md`](./hackathon-plan.md) for full context and demo script.

## Setup

```bash
pnpm install
cp .env.example .env.local       # then fill in AI_GATEWAY_API_KEY
pnpm placeholders                # generate placeholder sample documents
pnpm dev                         # http://localhost:3000
```

## Layout

- [`samples/`](./samples/) — the 5 input documents (Chris owns content; `pnpm placeholders` generates working stubs).
- [`src/lib/tags.ts`](./src/lib/tags.ts) — locked tag schema. Single source of truth.
- [`src/lib/docs.ts`](./src/lib/docs.ts) — doc metadata + tag↔doc mapping.
- [`src/lib/ingestion/`](./src/lib/ingestion) — per-format parsers (pdf, docx, xlsx).
- [`src/lib/tagIndex.ts`](./src/lib/tagIndex.ts) — builds `tag → location[]` at boot.
- [`src/components/`](./src/components) — viewers and demo layout.
- [`src/app/api/tag-index/`](./src/app/api/tag-index) — JSON endpoint for the built index.

## Workflow

- Tag-schema edits go in `src/lib/tags.ts` only. Re-run `pnpm placeholders` afterwards.
- Real drawings ship with hand-annotated `<doc>.bboxes.json` sidecars validated against [`samples/bboxes.schema.json`](./samples/bboxes.schema.json).
- Phase 2 walkthrough endpoint (`/api/walkthrough`) will post-validate every AI-emitted tag against the index; hallucinated tags get dropped.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · `pdfjs-dist` · `mammoth` · `xlsx` (SheetJS) · `ai` SDK v6 + Vercel AI Gateway · Zustand · Zod.
