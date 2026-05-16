'use client';

import { FullGbrainGraph } from './FullGbrainGraph';
import { useSeedStore } from '@/lib/seedStore';

export function GraphView() {
  const phase = useSeedStore((s) => s.phase);
  const nodes = useSeedStore((s) => s.nodes);
  const edges = useSeedStore((s) => s.edges);
  const stats = useSeedStore((s) => s.stats);
  const error = useSeedStore((s) => s.error);

  const hasData = nodes.length > 0;

  return (
    <div className="flex flex-col h-full p-6 bg-zinc-950">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">Knowledge Graph</h2>
        {stats && (
          <span className="text-[11px] text-zinc-500 font-mono">
            {stats.pages} pages · {stats.links} links
          </span>
        )}
        {phase === 'seeding' && (
          <span className="text-[11px] text-emerald-400 font-mono animate-pulse">
            seeding…
          </span>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-950/60 border border-red-800 rounded p-3 mb-4">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 overflow-hidden relative">
          {hasData ? (
            <FullGbrainGraph nodes={nodes} edges={edges} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[12px] text-zinc-600 font-mono">
                  blank canvas
                </p>
                <p className="text-[11px] text-zinc-700 mt-1">
                  open the <span className="text-blue-400">Files</span> tab and click <span className="text-emerald-400">Seed Knowledge Base</span>
                </p>
              </div>
            </div>
          )}
        </div>
        {hasData && (
          <div className="mt-3 flex items-center gap-5 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> brain
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" /> document
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> tag / entity
            </span>
            <span className="ml-auto text-zinc-700">
              {nodes.length} nodes · {edges.length} edges
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
