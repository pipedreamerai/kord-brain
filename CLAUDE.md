# kord-brain

Hackathon demo (GStack x GBrain, 2026-05-16): show **gbrain building a knowledge graph from uploaded engineering docs, live**, then let a chat UI answer questions by querying that graph.

## Demo arc (what every change should serve)

1. User uploads a batch of PDF/DOCX/XLSX → tags are extracted → gbrain pages + `mentions` links are pushed → graph view animates in.
2. User uploads more files → new nodes/edges appear in the same graph; shared tags become hubs.
3. User asks a question in chat → Vercel AI SDK calls gbrain tools (`search`, `graph`, `getPage`) → answer cites which docs/tags it used.

The wow is **gbrain visibly doing work on screen** — not the answer quality. Don't hide gbrain behind abstractions.

## Architecture

```
Browser (Next.js App Router, React 19)
  ├─ FilesTab           upload + preview PDF/DOCX/XLSX
  ├─ GraphTab           FullGbrainGraph SVG, polled after each upload
  └─ (TODO) ChatTab     AI SDK useChat → /api/chat

Server (Next.js route handlers, Node runtime)
  ├─ POST /api/uploads          ingest → parse → push to gbrain
  ├─ DELETE /api/uploads/[fn]   remove file + gbrain page + rewrite tag pages
  ├─ GET  /api/graph            walk gbrain to build {nodes, edges, stats}
  ├─ POST /api/reset            nuke uploads + gbrain pages (called on page load)
  └─ (TODO) POST /api/chat      AI SDK streamText with gbrain tools

gbrain CLI sidecar (Bun, PGLite at ~/.gbrain/brain.pglite)
  └─ shelled out from src/lib/gbrain.ts via child_process.execFile

pdf-extractor sidecar (Python + FastAPI + PyMuPDF + Tesseract, Docker)
  └─ HTTP POST from src/lib/ingestion/pdf-extractor-client.ts → :8765/extract
     returns per-page text + word bboxes + vector-path counts; falls back to
     Tesseract OCR inside the container for raster-only pages.
```

**No DB in this repo.** All persistence is (a) files in `./uploads/` + `.meta.json`, and (b) gbrain's PGLite store outside the repo. State persists across page loads — hit the "reset" button in the header (or `POST /api/reset`) to nuke uploads + gbrain pages + chat.

## Key files

- `src/lib/gbrain.ts` — typed wrapper around the `gbrain` CLI (`putPage`, `deletePage`, `link`, `graph`, `backlinks`, `search`, `getPage`, `list`, `stats`). Sets `PATH=$HOME/.bun/bin:$PATH` because `gbrain` has a `#!/usr/bin/env bun` shebang.
- `src/lib/uploads.ts` — ingest pipeline. `ingestUpload()` parses the file, extracts tags via `tagRegex.ts`, then calls `pushToGbrain()` to write the doc page + upsert each tag page + link them. `deleteUpload()` rewrites tag pages so dangling mentions don't linger.
- `src/lib/tagRegex.ts` — the generic engineering-tag pattern (`P-101`, `AE/TE-301`, etc). No whitelist — discovered from whatever is uploaded.
- `src/lib/ingestion/{pdf,docx,xlsx}.ts` — per-format parsing; each returns `{ payload, tags }`. PDFs go through the pdf-extractor sidecar via `pdf-extractor-client.ts` — no in-process PDF parsing and no Claude-vision upload.
- `services/pdf-extractor/` — Python FastAPI + PyMuPDF + Tesseract sidecar. `POST /extract` returns `{pages: [{number, width, height, text, spans: [{text, bbox}], vector_paths, source}]}`. Built and run via `docker compose up -d pdf-extractor`.
- `src/lib/appStore.ts` — Zustand store. `uploadFiles` POSTs the form, then calls `refreshGraph` to re-fetch `/api/graph`.
- `src/app/api/graph/route.ts` — walks every seed slug (docs + tags + whatever `gbrain list` returns) at depth 1 and dedupes into `{nodes, edges}` for the SVG.
- `src/components/FullGbrainGraph.tsx` — pure SVG renderer; docs on inner ring, tags on outer ring, animated brain in the center.

## What still needs building for the demo

The chat piece is **not yet wired** even though `ai` and `@ai-sdk/gateway` are in `package.json`. To finish the demo:

1. Add `src/app/api/chat/route.ts` — `streamText` from `ai`, model via `@ai-sdk/gateway`, with tools that thinly wrap `gbrain.search`, `gbrain.graph`, `gbrain.getPage`, `gbrain.backlinks`. The system prompt should tell the model to call tools rather than guess, and to cite the slugs it used.
2. Add a `ChatTab` (or replace `GraphTab` with a split) using `useChat` from `@ai-sdk/react`. Render tool calls inline so judges see gbrain being queried.
3. Stats already flow via `/api/graph` — surface "pages X · links Y" near the chat so the graph and the AI feel like one system.

Keep tools mapped 1:1 to gbrain commands. The whole point is that the LLM doesn't have its own retrieval layer — gbrain *is* the retrieval layer.

## Setup quirks

- `pnpm install` runs `scripts/setup.sh` which installs Bun, `git clone + bun link`s gbrain, and runs `gbrain init` (PGLite, no Postgres). CI/Vercel builds skip it via `CI=1` / `VERCEL=1` guards.
- Dev server: `pnpm dev` (port from `.worktree-port`, default 3002). `predev` runs `scripts/preflight.mjs` which checks gbrain reachability AND `http://localhost:8765/healthz`; if the pdf-extractor sidecar is down it runs `docker compose up -d --build pdf-extractor` automatically.
- Env: `AI_GATEWAY_API_KEY` in `.env.local` is the Vercel AI Gateway key — use it for the chat route. `KORD_PDF_EXTRACTOR_URL` overrides the sidecar URL (default `http://localhost:8765`).
- `gbrain` must be on PATH for the Node server to find it. The wrapper prepends `~/.bun/bin` defensively; if it still can't find gbrain, the symptom is a 500 from `/api/uploads` on the very first upload.
- `docker` must be installed for the pdf-extractor sidecar. Without it, PDF uploads fail; DOCX/XLSX still work.

## Conventions

- gbrain is the source of truth for tags and entities. **Don't** hardcode tag lists, ontologies, or whitelists in TS — `tagRegex.ts` is intentionally generic so the graph reflects whatever the user uploaded.
- Slugs are lowercase kebab (`ae-te-301`); display names keep original casing (`AE/TE-301`). Convert via `tagToSlug()`.
- Tag pages are rebuilt from the current upload set on every change — never mutate a tag page incrementally without re-reading it (`pushToGbrain` already does this).
- All gbrain calls go through `src/lib/gbrain.ts`. Don't shell out to `gbrain` from anywhere else.
- The graph view is server-driven: any change that should be visible must end with a `gbrain.putPage`/`deletePage`/`link` call before the client re-fetches `/api/graph`.

## What this repo is *not*

- Not a long-lived app — `/api/reset` wipes everything on page load. Don't add migrations, auth, or persistence schemes.
- Not a generic RAG demo — the differentiator is the live graph + gbrain's typed links. Vector search alone isn't the point.
- Not Postgres-backed in v0 — PGLite is the default and works fine; don't propose a Postgres switch unless gbrain breaks on PGLite.
