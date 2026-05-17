'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Slide = { kicker: string; node: ReactNode; script: string };

// ──────────────────────────────────────────────────────────────────────────
// Atoms
// ──────────────────────────────────────────────────────────────────────────

type Tone = 'neutral' | 'highlight' | 'dim' | 'no' | 'gbrain';

function Box({
  children,
  tone = 'neutral',
  size = 'md',
}: {
  children: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tones: Record<Tone, string> = {
    neutral: 'border-zinc-300 text-zinc-800 bg-white',
    highlight: 'border-amber-500 text-amber-900 bg-amber-50',
    dim: 'border-zinc-200 text-zinc-400 bg-zinc-50',
    no: 'border-zinc-300 text-zinc-400 bg-zinc-50 line-through decoration-zinc-400 decoration-2',
    gbrain: 'border-zinc-900 text-zinc-900 bg-zinc-900/5 shadow-sm',
  };
  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  };
  return (
    <span
      className={`inline-flex items-center justify-center border rounded font-mono ${tones[tone]} ${sizes[size]} whitespace-nowrap`}
    >
      {children}
    </span>
  );
}

function Arrow({
  down,
  label,
  size = 'md',
}: {
  down?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sz = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <span className={`inline-flex items-center gap-1.5 text-zinc-400 ${sz}`}>
      <span>{down ? '↓' : '→'}</span>
      {label && <span className="font-mono text-xs text-zinc-500">{label}</span>}
    </span>
  );
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border font-mono text-[11px] ${
        tone === 'highlight'
          ? 'border-amber-500 text-amber-900 bg-amber-50'
          : 'border-zinc-300 text-zinc-600 bg-white'
      }`}
    >
      {children}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Slides
// ──────────────────────────────────────────────────────────────────────────

const slides: Slide[] = [
  // 1 — COVER
  {
    kicker: 'demo · 2026-05-16',
    script:
      "kord-brain. You drop engineering documents in, gbrain builds a knowledge graph from them, and the chat agent answers by querying that graph. Same gbrain on both sides of the arrow.",
    node: (
      <div className="flex flex-col items-center gap-16">
        <div className="text-center">
          <div className="text-7xl font-bold tracking-tight">
            kord-brain <span className="text-zinc-300">×</span> gbrain
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Box size="lg">PDF · DOCX · XLSX</Box>
          <Arrow size="lg" />
          <Box size="lg" tone="gbrain">gbrain</Box>
          <Arrow size="lg" />
          <Box size="lg">graph + chat</Box>
        </div>
      </div>
    ),
  },

  // 2 — THE CLAIM
  {
    kicker: 'the claim',
    script:
      "What's different here. In a typical RAG setup, the LLM has its own retrieval stack — a vector index, sometimes a graph in TypeScript, sometimes a curated tag whitelist. Here, none of that exists. The only retrieval layer is gbrain.",
    node: (
      <div className="flex flex-col items-center gap-14">
        <div className="grid grid-cols-2 gap-10 items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-400">typical RAG</div>
            <div className="flex items-center gap-2">
              <Box tone="no">LLM</Box>
              <Arrow />
              <Box tone="no">vector index</Box>
            </div>
            <div className="flex items-center gap-2">
              <Box tone="no">LLM</Box>
              <Arrow />
              <Box tone="no">graph in TS</Box>
            </div>
            <div className="flex items-center gap-2">
              <Box tone="no">LLM</Box>
              <Arrow />
              <Box tone="no">tag whitelist</Box>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs font-mono uppercase tracking-widest text-amber-700">here</div>
            <div className="flex items-center gap-2">
              <Box tone="highlight">LLM</Box>
              <Arrow />
              <Box tone="gbrain">gbrain</Box>
            </div>
            <div className="text-xs font-mono text-zinc-500 mt-2">↑ only retrieval layer</div>
          </div>
        </div>
      </div>
    ),
  },

  // 3 — THREE LOOPS
  {
    kicker: 'three loops',
    script:
      'Three loops, all going through gbrain. Write: uploads become gbrain pages and "mentions" links. Read: the graph view is the server walking gbrain at depth one. Retrieve: the chat agent\'s only tools are gbrain commands. Same store, three views.',
    node: (
      <div className="flex flex-col gap-7 w-full">
        {[
          {
            label: 'WRITE',
            chain: ['upload', 'parse', 'tags[]', 'gbrain.putPage', 'gbrain.link'],
          },
          {
            label: 'READ',
            chain: ['client', '/api/graph', 'gbrain.graph', '{nodes, edges}', 'SVG rings'],
          },
          {
            label: 'RETRIEVE',
            chain: ['user', '/api/chat', 'qaAgent', 'tools[5]', 'gbrain'],
          },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-4">
            <div className="w-24 text-xs font-mono uppercase tracking-widest text-zinc-400 text-right">
              {row.label}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {row.chain.map((step, idx) => (
                <span key={step} className="flex items-center gap-2">
                  <Box tone={step === 'gbrain' || step.startsWith('gbrain.') ? 'gbrain' : 'neutral'} size="sm">
                    {step}
                  </Box>
                  {idx < row.chain.length - 1 && <Arrow size="sm" />}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },

  // 4 — WRITE
  {
    kicker: 'loop 1 — write',
    script:
      "When you drop a file, we parse it, run a generic engineering-tag regex over the text — no whitelist. Then we putPage for the document, and for each tag we re-read the existing tag page, append a mention, write it back, and link the doc to the tag. Tag pages are rebuilt from current state every time.",
    node: (
      <div className="flex flex-col items-center gap-10">
        <div className="flex items-center gap-3">
          <Box>file.pdf</Box>
          <Arrow label="loadPdf" />
          <Box>text + tags</Box>
          <Arrow label="tagRegex" />
          <Box tone="highlight">tags[]</Box>
        </div>
        <div className="text-zinc-300 text-2xl">↓</div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 items-center">
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-400 text-right">doc</div>
          <div className="flex items-center gap-2">
            <Box tone="gbrain">putPage(docSlug)</Box>
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-400 text-right">
            for each tag
          </div>
          <div className="flex items-center gap-2">
            <Box tone="gbrain">putPage(tagSlug)</Box>
            <Arrow />
            <Box tone="gbrain">link(doc → tag, "mentions")</Box>
          </div>
        </div>
        <div className="flex gap-3 mt-3">
          <Pill>no whitelist</Pill>
          <Pill>no TS tag store</Pill>
          <Pill>tag pages rebuilt from current state</Pill>
        </div>
      </div>
    ),
  },

  // 5 — READ
  {
    kicker: 'loop 2 — read',
    script:
      "After every upload the client re-fetches /api/graph. The server seeds with every doc slug, every tag slug, and whatever gbrain.list returns. For each seed it walks the graph at depth one, dedupes nodes and edges, and ships JSON. The SVG renders docs on the inner ring and tags on the outer ring.",
    node: (
      <div className="flex flex-col items-center gap-9">
        <div className="flex items-center gap-3">
          <Box>docSlugs</Box>
          <span className="text-zinc-400 font-mono">∪</span>
          <Box>tagSlugs</Box>
          <span className="text-zinc-400 font-mono">∪</span>
          <Box tone="gbrain">gbrain.list()</Box>
        </div>
        <Arrow down label="seed set" />
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-zinc-500">for each →</span>
          <Box tone="gbrain">gbrain.graph(slug, depth=1)</Box>
        </div>
        <Arrow down label="dedupe" />
        <div className="flex items-center gap-3">
          <Box tone="highlight">{'{ nodes, edges, stats }'}</Box>
        </div>
        <Arrow down />
        {/* mini ring diagram */}
        <svg width="240" height="120" viewBox="0 0 240 120">
          <circle cx="120" cy="60" r="50" fill="none" stroke="#d4d4d8" strokeDasharray="3 3" />
          <circle cx="120" cy="60" r="22" fill="none" stroke="#d4d4d8" strokeDasharray="3 3" />
          <circle cx="120" cy="60" r="6" fill="#18181b" />
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <circle
                key={`out${deg}`}
                cx={120 + 50 * Math.cos(rad)}
                cy={60 + 50 * Math.sin(rad)}
                r="5"
                fill="#f59e0b"
              />
            );
          })}
          {[30, 150, 270].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <circle
                key={`in${deg}`}
                cx={120 + 22 * Math.cos(rad)}
                cy={60 + 22 * Math.sin(rad)}
                r="5"
                fill="#3f3f46"
              />
            );
          })}
        </svg>
        <div className="flex gap-6 -mt-2 text-xs font-mono text-zinc-500">
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-700 mr-1.5 align-middle" />
            docs (inner)
          </span>
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5 align-middle" />
            tags (outer)
          </span>
        </div>
      </div>
    ),
  },

  // 6 — RETRIEVE (chat agent)
  {
    kicker: 'loop 3 — retrieve',
    script:
      "Chat. useChat hits /api/chat, which runs the qaAgent — Opus 4.7 through the Vercel AI Gateway. The agent has exactly five tools, each one a thin wrapper around a gbrain command. The system prompt forces it to cite the slugs it actually pulled. You'll see the tool calls stream into the chat UI live.",
    node: (
      <div className="flex flex-col items-center gap-7">
        <div className="flex items-center gap-3">
          <Box>useChat()</Box>
          <Arrow />
          <Box>/api/chat</Box>
          <Arrow />
          <Box tone="highlight">qaAgent · Opus 4.7</Box>
        </div>
        <Arrow down label="5 tools, 1:1 with gbrain" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 items-center">
          {[
            ['search_brain', 'gbrain.search'],
            ['get_page', 'gbrain.getPage'],
            ['traverse_graph', 'gbrain.graph'],
            ['find_backlinks', 'gbrain.backlinks'],
            ['list_pages', 'gbrain.list'],
          ].map(([tool, call]) => (
            <div key={tool} className="contents">
              <div className="flex justify-end">
                <Box size="sm">{tool}</Box>
              </div>
              <div className="flex items-center gap-2">
                <Arrow size="sm" />
                <Box size="sm" tone="gbrain">
                  {call}
                </Box>
              </div>
            </div>
          ))}
        </div>
        <Arrow down />
        <div className="flex items-center gap-3">
          <Box>answer</Box>
          <span className="font-mono text-zinc-400">+</span>
          <Box tone="highlight">Cites: ae-te-301 p-101</Box>
        </div>
      </div>
    ),
  },

  // 7 — WHAT WE DON'T HAVE
  {
    kicker: 'what is NOT in this repo',
    script:
      "Worth saying out loud what we did NOT build. No tag list in TypeScript. No vector index. No graph code on our side. No ontology. No database schema. The LLM has no retrieval layer of its own. All of it lives in gbrain's PGLite store.",
    node: (
      <div className="flex flex-col items-center gap-7">
        <div className="grid grid-cols-2 gap-x-14 gap-y-5">
          <Box tone="no">tags const in TS</Box>
          <Box tone="no">vector index</Box>
          <Box tone="no">graph traversal in TS</Box>
          <Box tone="no">tag whitelist / ontology</Box>
          <Box tone="no">retrieval layer in the LLM</Box>
          <Box tone="no">DB schema, migrations</Box>
        </div>
        <div className="mt-4 text-xs font-mono uppercase tracking-widest text-zinc-400">
          everything above lives in
        </div>
        <Box tone="gbrain" size="lg">
          gbrain (PGLite @ ~/.gbrain/brain.pglite)
        </Box>
      </div>
    ),
  },

  // 8 — CLOSING
  {
    kicker: 'the punchline',
    script:
      "So the whole demo collapses to seven verbs: putPage, link, graph, search, getPage, backlinks, list. Upload uses the first two. The graph view uses one. The chat agent uses the rest. Nothing the LLM cites was retrieved any other way.",
    node: (
      <div className="flex flex-col items-center gap-10">
        <Box tone="gbrain" size="lg">
          gbrain = pages + typed links + search
        </Box>
        <div className="flex items-center gap-3">
          <Box>upload</Box>
          <Box>graph view</Box>
          <Box>chat agent</Box>
        </div>
        <div className="text-3xl text-zinc-300 font-mono">↓ all three ↓</div>
        <div className="flex items-center gap-2">
          <Box tone="highlight">putPage</Box>
          <Box tone="highlight">link</Box>
          <Box tone="highlight">graph</Box>
          <Box tone="highlight">search</Box>
          <Box tone="highlight">getPage</Box>
          <Box tone="highlight">backlinks</Box>
          <Box tone="highlight">list</Box>
        </div>
        <div className="text-xs font-mono uppercase tracking-widest text-zinc-400 mt-4">
          nothing the LLM cites was retrieved any other way
        </div>
      </div>
    ),
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default function SlidesPage() {
  const [i, setI] = useState(0);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showScript, setShowScript] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioSrc = `/slides-audio/${String(i + 1).padStart(2, '0')}.m4a`;

  // Slide change → swap src and try to play.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.src = audioSrc;
    a.currentTime = 0;
    setProgress(0);
    if (muted) return;
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => setBlocked(true));
    }
  }, [audioSrc, muted]);

  // Mute toggle.
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const replay = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'l') {
        e.preventDefault();
        setI((x) => Math.min(slides.length - 1, x + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'h') {
        e.preventDefault();
        setI((x) => Math.max(0, x - 1));
      } else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(slides.length - 1);
      else if (e.key === 'm' || e.key === 'M') setMuted((x) => !x);
      else if (e.key === 'r' || e.key === 'R') replay();
      else if (e.key === 's' || e.key === 'S') setShowScript((x) => !x);
      else if (/^[1-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10) - 1;
        if (n < slides.length) setI(n);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slide = slides[i];

  return (
    <main className="fixed inset-0 bg-white text-zinc-900 flex flex-col">
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration > 0) setProgress(a.currentTime / a.duration);
        }}
        onEnded={() => setProgress(1)}
        onPlay={() => setBlocked(false)}
      />

      <header className="px-10 pt-6 flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-zinc-400">
        <span>kord-brain × gbrain</span>
        <span>{slide.kicker}</span>
        <span>
          {String(i + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
        </span>
      </header>

      <section className="flex-1 flex items-center justify-center px-16">
        <div className="w-full max-w-5xl flex items-center justify-center">{slide.node}</div>
      </section>

      {/* Per-slide script panel (teleprompter) */}
      {showScript && (
        <div className="px-16 pb-4 border-t border-zinc-200 bg-zinc-50/80 backdrop-blur">
          <div className="max-w-5xl mx-auto pt-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">
              script · slide {String(i + 1).padStart(2, '0')}
            </div>
            <p className="text-zinc-800 text-lg leading-relaxed">{slide.script}</p>
          </div>
        </div>
      )}

      {/* Per-slide audio progress (full width, very thin) */}
      <div className="h-0.5 bg-zinc-100">
        <div
          className="h-full bg-zinc-900 transition-[width] duration-100 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <footer className="px-10 pb-6 pt-4 flex items-center justify-between text-[11px] font-mono text-zinc-400">
        <button
          onClick={() => setI((x) => Math.max(0, x - 1))}
          className="hover:text-zinc-700 transition disabled:opacity-30"
          disabled={i === 0}
        >
          ← prev
        </button>

        <div className="flex items-center gap-5">
          <button
            onClick={replay}
            className="hover:text-zinc-700 transition"
            title="replay (r)"
          >
            ↻ replay
          </button>
          <button
            onClick={() => setMuted((x) => !x)}
            className={`hover:text-zinc-700 transition ${muted ? 'text-amber-700' : ''}`}
            title="mute (m)"
          >
            {muted ? '○ muted' : '● sound'}
          </button>
          <button
            onClick={() => setShowScript((x) => !x)}
            className={`hover:text-zinc-700 transition ${showScript ? 'text-amber-700' : ''}`}
            title="script (s)"
          >
            {showScript ? '▼ script' : '▲ script'}
          </button>
          {blocked && !muted && (
            <button
              onClick={replay}
              className="px-2 py-0.5 border border-amber-500 text-amber-700 rounded hover:bg-amber-50 transition"
            >
              ▶ start audio
            </button>
          )}
          <div className="flex gap-1.5">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === i ? 'w-6 bg-zinc-900' : 'w-1.5 bg-zinc-300 hover:bg-zinc-500'
                }`}
                aria-label={`slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}
          className="hover:text-zinc-700 transition disabled:opacity-30"
          disabled={i === slides.length - 1}
        >
          next →
        </button>
      </footer>
    </main>
  );
}
