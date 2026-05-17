#!/usr/bin/env bash
# Regenerate the voiceover for /slides. Outputs 8 m4a files into public/slides-audio/.
# Override the voice with VOICE=Daniel ./scripts/gen-voiceover.sh
set -euo pipefail

VOICE="${VOICE:-Samantha}"
RATE="${RATE:-185}"
OUT="public/slides-audio"
mkdir -p "$OUT"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

gen() {
  local n=$1
  say -v "$VOICE" -r "$RATE" -o "$TMP/$n.aiff"
  afconvert -f m4af -d aac "$TMP/$n.aiff" "$OUT/$n.m4a" >/dev/null
  printf '  %s.m4a (%s bytes)\n' "$n" "$(stat -f %z "$OUT/$n.m4a")"
}

echo "voice: $VOICE   rate: $RATE wpm   → $OUT/"

gen 01 <<'EOF'
kord-brain. You drop engineering documents in, gbrain builds a knowledge graph from them, and the chat agent answers by querying that graph. Same gbrain on both sides of the arrow.
EOF

gen 02 <<'EOF'
What's different here. In a typical RAG setup, the language model has its own retrieval stack — a vector index, sometimes a graph in TypeScript, sometimes a curated tag whitelist. Here, none of that exists. The only retrieval layer is gbrain.
EOF

gen 03 <<'EOF'
Three loops, all going through gbrain. Write: uploads become gbrain pages and "mentions" links. Read: the graph view is the server walking gbrain at depth one. Retrieve: the chat agent's only tools are gbrain commands. Same store, three views.
EOF

gen 04 <<'EOF'
When you drop a file, we parse it, run a generic engineering tag regex over the text — no whitelist. Then we put a page for the document, and for each tag we re-read the existing tag page, append a mention, write it back, and link the document to the tag. Tag pages are rebuilt from current state every time.
EOF

gen 05 <<'EOF'
After every upload the client re-fetches the graph endpoint. The server seeds with every document slug, every tag slug, and whatever gbrain list returns. For each seed it walks the graph at depth one, dedupes nodes and edges, and ships JSON. The SVG renders documents on the inner ring and tags on the outer ring.
EOF

gen 06 <<'EOF'
Chat. The client hits the chat endpoint, which runs the Q A agent — Opus 4.7 through the Vercel A I Gateway. The agent has exactly five tools, each one a thin wrapper around a gbrain command. The system prompt forces it to cite the slugs it actually pulled. You'll see the tool calls stream into the chat U I live.
EOF

gen 07 <<'EOF'
Worth saying out loud what we did not build. No tag list in TypeScript. No vector index. No graph code on our side. No ontology. No database schema. The language model has no retrieval layer of its own. All of it lives in gbrain's PGLite store.
EOF

gen 08 <<'EOF'
So the whole demo collapses to seven verbs: put page, link, graph, search, get page, backlinks, and list. Upload uses the first two. The graph view uses one. The chat agent uses the rest. Nothing the language model cites was retrieved any other way.
EOF

echo "done."
