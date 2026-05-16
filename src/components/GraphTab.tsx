'use client';

import { useAppStore } from '@/lib/appStore';
import { FullGbrainGraph } from './FullGbrainGraph';

export function GraphTab() {
  const graph = useAppStore((s) => s.graph);
  const docCount = useAppStore((s) => s.docs.length);
  const hasData = graph.nodes.length > 0;

  return (
    <div className="flex flex-col h-full p-6 bg-zinc-950">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">Knowledge Graph</h2>
        {graph.stats && (
          <span className="text-[11px] text-zinc-500 font-mono">
            {graph.stats.pages} pages · {graph.stats.links} links
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 overflow-hidden relative">
          {hasData ? (
            <FullGbrainGraph nodes={graph.nodes} edges={graph.edges} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[12px] text-zinc-600 font-mono">empty graph</p>
                <p className="text-[11px] text-zinc-700 mt-1">
                  {docCount === 0
                    ? <>upload files in the <span className="text-blue-400">Files</span> tab to populate</>
                    : <>no edges yet — the gbrain pipeline may still be running</>}
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
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
