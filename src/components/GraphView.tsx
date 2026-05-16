'use client';

import { useCallback, useEffect, useState } from 'react';
import { FullGbrainGraph, type BrainNode, type BrainEdge } from './FullGbrainGraph';

type GraphData = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  stats: { pages: number; links: number };
};

export function GraphView() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/graph');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full p-6 bg-zinc-950">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">Knowledge Graph</h2>
        {data && (
          <span className="text-[11px] text-zinc-500 font-mono">
            {data.stats.pages} pages · {data.stats.links} links
          </span>
        )}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto text-[11px] bg-emerald-800 text-emerald-200 border border-emerald-700 rounded px-3 py-1 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-950/60 border border-red-800 rounded p-3 mb-4">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-600 animate-pulse font-mono">
          loading brain…
        </div>
      )}

      {data && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 overflow-hidden">
            <FullGbrainGraph nodes={data.nodes} edges={data.edges} />
          </div>
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
              click Refresh after adding documents
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
