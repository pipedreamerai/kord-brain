'use client';

import { useAppStore } from '@/lib/appStore';
import { FullGbrainGraph } from './FullGbrainGraph';

export function GraphTab() {
  const graph = useAppStore((s) => s.graph);
  const docCount = useAppStore((s) => s.docs.length);
  const graphLoading = useAppStore((s) => s.graphLoading);
  const selectedTag = useAppStore((s) => s.selectedTag);
  const selectTag = useAppStore((s) => s.selectTag);
  const setActiveSlug = useAppStore((s) => s.setActiveSlug);
  const hasData = graph.nodes.length > 0;

  return (
    <div className="h-full bg-zinc-950">
      <div className="h-full min-h-0 border border-zinc-800 overflow-hidden relative">
        {graphLoading && (
          <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-zinc-900/80 border border-zinc-700 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-emerald-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            refreshing
          </div>
        )}
        {hasData ? (
          <FullGbrainGraph
            nodes={graph.nodes}
            edges={graph.edges}
            selectedSlug={selectedTag}
            onSelectNode={(slug, kind) => {
              if (kind === 'tag') selectTag(slug);
              else if (kind === 'document') setActiveSlug(slug);
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[12px] text-zinc-600 font-mono">
                {graphLoading ? 'loading graph…' : 'empty graph'}
              </p>
              <p className="text-[11px] text-zinc-700 mt-1">
                {docCount === 0
                  ? <>upload files on the left to populate</>
                  : <>no edges yet — the gbrain pipeline may still be running</>}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
