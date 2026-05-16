'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/appStore';
import { FilesTab } from './FilesTab';
import { GraphTab } from './GraphTab';

type RootView = 'files' | 'graph';

export function AppShell() {
  const [view, setView] = useState<RootView>('files');
  const hydrate = useAppStore((s) => s.hydrate);
  const docCount = useAppStore((s) => s.docs.length);
  const graphNodes = useAppStore((s) => s.graph.nodes.length);
  const graphEdges = useAppStore((s) => s.graph.edges.length);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex flex-col h-screen">
      <header className="shrink-0 px-6 py-3 border-b border-zinc-800 flex items-center gap-4 bg-zinc-950">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-white">kord-brain</h1>
          <span className="text-[11px] text-zinc-500">cross-doc engineering reasoning</span>
        </div>
        <nav className="ml-6 flex items-center gap-1">
          <TabButton
            label="Files"
            badge={docCount > 0 ? docCount : undefined}
            active={view === 'files'}
            color="blue"
            onClick={() => setView('files')}
          />
          <TabButton
            label="Graph"
            badge={graphNodes > 0 ? `${graphNodes}·${graphEdges}` : undefined}
            active={view === 'graph'}
            color="emerald"
            onClick={() => setView('graph')}
          />
        </nav>
      </header>

      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${view !== 'files' ? 'hidden' : ''}`}>
          <FilesTab />
        </div>
        <div className={`absolute inset-0 ${view !== 'graph' ? 'hidden' : ''}`}>
          <GraphTab />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  badge,
  active,
  color,
  onClick,
}: {
  label: string;
  badge?: string | number;
  active: boolean;
  color: 'emerald' | 'blue';
  onClick: () => void;
}) {
  const activeClass =
    color === 'emerald'
      ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
      : 'bg-blue-900/60 text-blue-300 border border-blue-700';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[12px] font-medium rounded transition-colors flex items-center gap-1.5 ${
        active ? activeClass : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className={`text-[10px] font-mono rounded px-1 ${
          active ? 'bg-black/30' : 'bg-zinc-800 text-zinc-500'
        }`}>{badge}</span>
      )}
    </button>
  );
}
