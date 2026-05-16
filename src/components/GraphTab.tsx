'use client';

import { useAppStore } from '@/lib/appStore';
import { FullGbrainGraph } from './FullGbrainGraph';

export function GraphTab() {
  const graph = useAppStore((s) => s.graph);
  const docCount = useAppStore((s) => s.docs.length);
  const hasData = graph.nodes.length > 0;

  return (
    <div className="h-full bg-zinc-950">
      <div className="h-full min-h-0 border border-zinc-800 overflow-hidden relative">
        {hasData ? (
          <FullGbrainGraph nodes={graph.nodes} edges={graph.edges} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[12px] text-zinc-600 font-mono">empty graph</p>
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
