'use client';

import { FullGbrainGraph } from './FullGbrainGraph';
import { DOCS } from '@/lib/docs';
import { useSeedStore, type SeedEvent } from '@/lib/seedStore';

type Props = {
  onComplete: () => void;
};

export function SeedingView({ onComplete }: Props) {
  const phase = useSeedStore((s) => s.phase);
  const phaseLabel = useSeedStore((s) => s.phaseLabel);
  const stats = useSeedStore((s) => s.stats);
  const nodes = useSeedStore((s) => s.nodes);
  const edges = useSeedStore((s) => s.edges);
  const eventLog = useSeedStore((s) => s.eventLog);
  const complete = useSeedStore((s) => s.complete);
  const error = useSeedStore((s) => s.error);
  const runSeed = useSeedStore((s) => s.runSeed);
  const reset = useSeedStore((s) => s.reset);

  if (phase === 'idle') {
    return <Landing onSeed={runSeed} />;
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {phaseLabel && (
        <div className="shrink-0 px-6 py-2 border-b border-zinc-800 text-[11px] text-emerald-400 font-mono animate-pulse">
          {phaseLabel}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Graph panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-zinc-800 min-w-0">
          {stats && (
            <div className="mb-4 flex gap-5 text-[11px] font-mono">
              <span className="text-emerald-400">
                <span className="font-bold">{stats.pages}</span>
                <span className="text-zinc-500 ml-1">pages</span>
              </span>
              <span className="text-zinc-400">
                <span className="font-bold">{stats.links}</span>
                <span className="text-zinc-500 ml-1">links</span>
              </span>
              <span className="text-zinc-600">
                <span className="font-bold">{nodes.length}</span>
                <span className="text-zinc-700 ml-1">nodes discovered</span>
              </span>
              <span className="text-zinc-700">
                <span className="font-bold">{edges.length}</span>
                <span className="text-zinc-800 ml-1">edges traced</span>
              </span>
            </div>
          )}

          <div className="w-full max-w-2xl">
            <FullGbrainGraph nodes={nodes} edges={edges} />
          </div>

          {nodes.length === 0 && phase === 'seeding' && (
            <p className="text-[11px] text-zinc-600 italic mt-4 animate-pulse">
              querying gbrain…
            </p>
          )}

          {/* Legend */}
          {nodes.length > 0 && (
            <div className="mt-4 flex gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-zinc-500">brain</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-zinc-500">document</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-zinc-500">tag</span>
              </span>
            </div>
          )}
        </div>

        {/* Event log */}
        <aside className="w-72 shrink-0 overflow-y-auto p-3 flex flex-col gap-1.5 border-l border-zinc-800">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider px-1 mb-1">
            ingestion log
          </div>
          {eventLog.map((ev, i) => (
            <EventCard key={i} ev={ev} />
          ))}
          {phase === 'seeding' && (
            <div className="text-[10px] text-zinc-700 italic px-1 py-0.5 animate-pulse">
              streaming…
            </div>
          )}
        </aside>
      </div>

      {/* Footer */}
      {phase === 'done' && complete && (
        <div className="shrink-0 px-6 py-4 border-t border-zinc-800 flex items-center gap-6">
          <div className="text-[12px] font-mono text-zinc-400 flex gap-4">
            <span>
              <span className="text-emerald-400 font-bold">{complete.totalTagged}</span>
              <span className="text-zinc-600 ml-1">tags indexed</span>
            </span>
            <span>
              <span className="text-indigo-400 font-bold">{complete.docCount}</span>
              <span className="text-zinc-600 ml-1">documents parsed</span>
            </span>
            <span>
              <span className="text-amber-400 font-bold">{nodes.length}</span>
              <span className="text-zinc-600 ml-1">brain nodes</span>
            </span>
            <span>
              <span className="text-zinc-400 font-bold">{edges.length}</span>
              <span className="text-zinc-600 ml-1">edges</span>
            </span>
          </div>
          <button
            onClick={onComplete}
            className="ml-auto bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold px-6 py-2 rounded-md transition-colors"
          >
            Enter Demo →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="shrink-0 px-6 py-4 border-t border-zinc-800 flex items-center gap-4">
          <span className="text-red-400 text-sm truncate">{error}</span>
          <button
            onClick={reset}
            className="ml-auto text-[12px] text-zinc-400 underline underline-offset-2 hover:text-white transition-colors"
          >
            retry
          </button>
        </div>
      )}
    </div>
  );
}

// ── Landing screen ─────────────────────────────────────────────────────────────

function Landing({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="flex flex-col h-full bg-zinc-950 items-center justify-center">
      <div className="w-full max-w-sm text-center px-6">
        <p className="text-zinc-600 text-[11px] font-mono uppercase tracking-widest mb-2">
          kord-brain
        </p>
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">
          Cross-doc engineering reasoning
        </h1>
        <p className="text-zinc-500 text-sm mb-8">
          Click to ingest documents into the gbrain knowledge graph and build the tag index.
        </p>

        {/* Doc list preview */}
        <div className="border border-zinc-800 rounded-xl p-4 mb-6 text-left bg-zinc-900/40">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wide font-mono mb-3">
            {DOCS.length} documents · demo_docs/
          </div>
          <div className="space-y-2">
            {DOCS.map(d => (
              <div key={d.slug} className="flex items-center gap-2.5">
                <KindBadge kind={d.kind} />
                <span className="text-[12px] text-zinc-300 truncate">{d.displayName}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onSeed}
          className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold py-3 rounded-lg text-[15px] transition-colors"
        >
          Seed Knowledge Base
        </button>
        <p className="text-[11px] text-zinc-700 mt-3">
          Queries gbrain · builds tag index · visualizes the knowledge graph live
        </p>
      </div>
    </div>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────────

function EventCard({ ev }: { ev: SeedEvent }) {
  if (ev.type === 'phase') {
    return (
      <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono px-1 pt-2 pb-0.5 border-t border-zinc-900 first:border-t-0">
        {ev.label}
      </div>
    );
  }

  if (ev.type === 'stats') {
    return (
      <div className="bg-emerald-950/40 border border-emerald-900/50 rounded px-2.5 py-1.5 text-[10px] font-mono">
        <span className="text-emerald-400 font-semibold">gbrain</span>
        <span className="text-zinc-500 ml-2">
          {ev.pages} pages · {ev.links} links
        </span>
      </div>
    );
  }

  if (ev.type === 'slugs_found') {
    return (
      <div className="text-[10px] text-zinc-600 font-mono px-1">
        {ev.count} page slugs found
      </div>
    );
  }

  if (ev.type === 'brain_node') {
    const isDoc = ev.kind === 'document';
    const isTag = ev.kind === 'tag';
    return (
      <div className="flex items-center gap-2 px-1 py-0.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isDoc ? 'bg-indigo-500' : isTag ? 'bg-amber-500' : 'bg-zinc-600'
          }`}
        />
        <span className="text-[10px] font-mono text-zinc-400 truncate">{ev.slug}</span>
        <span
          className={`ml-auto text-[9px] font-mono shrink-0 ${
            isDoc ? 'text-indigo-600' : isTag ? 'text-amber-700' : 'text-zinc-700'
          }`}
        >
          {ev.kind}
        </span>
      </div>
    );
  }

  if (ev.type === 'doc_done') {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5">
        <div className="flex items-center gap-2 mb-1">
          <KindBadge kind={ev.kind as 'pdf' | 'docx' | 'xlsx'} />
          <span className="text-[11px] text-zinc-300 truncate">{ev.displayName}</span>
          <span className="ml-auto text-[10px] text-zinc-600 shrink-0">{ev.tagCount} tags</span>
        </div>
        {ev.tags.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {ev.tags.slice(0, 8).map(t => (
              <span key={t} className="text-[9px] bg-zinc-800 text-zinc-500 rounded px-1 font-mono">
                {t}
              </span>
            ))}
            {ev.tags.length > 8 && (
              <span className="text-[9px] text-zinc-700">+{ev.tags.length - 8}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (ev.type === 'complete') {
    return (
      <div className="bg-emerald-950/60 border border-emerald-800/60 rounded px-2.5 py-2 text-[10px] font-mono text-emerald-400">
        ✓ Complete — {ev.totalTagged} tags · {ev.docCount} docs
      </div>
    );
  }

  if (ev.type === 'error') {
    return (
      <div className="bg-red-950/40 border border-red-900/50 rounded px-2.5 py-1.5 text-[10px] text-red-400 font-mono">
        ✗ {ev.message}
      </div>
    );
  }

  return null;
}

function KindBadge({ kind }: { kind: 'pdf' | 'docx' | 'xlsx' }) {
  const cls =
    kind === 'pdf'
      ? 'text-red-500 bg-red-950/40'
      : kind === 'xlsx'
        ? 'text-green-500 bg-green-950/40'
        : 'text-blue-500 bg-blue-950/40';
  return (
    <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
      {kind}
    </span>
  );
}
