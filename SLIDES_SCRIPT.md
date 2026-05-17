# kord-brain × gbrain — demo script

Open `/slides`. Use **→ / space** to advance, **← / h** to go back, **1–8** to jump, **r** to replay the current voiceover, **m** to mute, **s** to toggle the on-screen script (teleprompter). Voiceover plays automatically when a slide opens; if the browser blocks audio on slide 1, click **▶ start audio** in the footer once and subsequent slides will play on their own.

Regenerate audio with `./scripts/gen-voiceover.sh` (override voice via `VOICE=Daniel ./scripts/gen-voiceover.sh`). The narration text lives in that script as heredocs — edit there, re-run, done.

---

## 01 — cover

> "kord-brain. The pitch is one sentence: you drop engineering docs in, gbrain builds a knowledge graph, and the chat agent answers by querying that graph — not by RAG, not by vectors. Same gbrain on both sides of the arrow."

*(advance)*

---

## 02 — the claim

> "What's different about this demo. In a typical RAG setup, the LLM has its own retrieval stack — a vector index, sometimes a graph in TypeScript, sometimes a curated tag whitelist. Here, none of that exists. The only retrieval layer is gbrain. If the LLM cites something, it came out of a gbrain tool call you can watch happen."

*(advance)*

---

## 03 — three loops

> "Three loops, all going through gbrain. Write: uploads become gbrain pages and `mentions` links. Read: the graph view is the server walking gbrain at depth 1 and shipping the result. Retrieve: the chat agent's only tools are gbrain commands. Same store, three views."

*(advance)*

---

## 04 — write loop

> "When you drop a file, we parse it, run a generic engineering-tag regex over the text — no whitelist, anything matching the pattern is a tag. Then we `putPage` for the document, and for each tag we re-read the existing tag page, append a mention, write it back, and `link` the doc to the tag with type `mentions`. Tag pages are rebuilt from current state every time, which is why deletes stay consistent."

*(advance)*

---

## 05 — read loop

> "After every upload the client re-fetches `/api/graph`. Server seeds with every doc slug, every tag slug, and whatever `gbrain list` returns. For each seed it calls `gbrain.graph` at depth one, dedupes nodes and edges, and ships JSON. The SVG renders docs on the inner ring and tags on the outer ring — that's literally just gbrain's adjacency, drawn."

*(advance)*

---

## 06 — retrieve loop

> "Chat. `useChat` from the AI SDK hits `/api/chat`, which runs the qaAgent — Opus 4.7 through Vercel AI Gateway. The agent has exactly five tools, each one a thin wrapper around a gbrain command: `search_brain`, `get_page`, `traverse_graph`, `find_backlinks`, `list_pages`. The system prompt forces it to cite the slugs it actually pulled. You'll see the tool calls stream into the chat UI live — that's gbrain being queried in real time."

*(advance)*

---

## 07 — what is NOT in this repo

> "Worth saying out loud what we *didn't* build. There's no tag list in TypeScript. No vector index. No graph code on our side. No ontology. No DB schema. The LLM has no retrieval layer of its own. All of it lives in gbrain's PGLite store, outside the repo, at `~/.gbrain/brain.pglite`."

*(advance)*

---

## 08 — the punchline

> "So the whole demo collapses to seven verbs: `putPage`, `link`, `graph`, `search`, `getPage`, `backlinks`, `list`. Upload uses the first two. The graph view uses one. The chat agent uses the rest. That's the whole system — and nothing the LLM cites was retrieved any other way."

*(end — open the app, run the demo arc: upload a batch → watch graph form → ask a chat question → point at the tool calls)*

---

## Q&A cheats

- **"Why not Postgres?"** PGLite is gbrain's default, runs in-process, zero setup. Works for the demo. Same gbrain CLI swaps to Postgres later by changing one config.
- **"How does delete stay consistent?"** Tag pages are rebuilt from the current upload set every change. Reset is `wipeAndInit` — rm the PGLite dir and `gbrain init` — because `gbrain delete` is a 72h soft-delete and would leak orphans.
- **"Is the LLM doing the graph reasoning?"** No — the LLM picks which gbrain commands to call. gbrain does the graph walk. The LLM writes the narrative on top of the slugs it got back.
- **"What stops it from hallucinating tags?"** The system prompt says cite-or-say-you-don't-know, and the cites have to be slugs that came out of a tool result. If tools fail, it's told to say so, not guess.
