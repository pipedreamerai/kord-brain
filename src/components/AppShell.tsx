'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/appStore';
import { FilesTab } from './FilesTab';
import { GraphTab } from './GraphTab';
import { ChatPanel } from './ChatPanel';
import { PagesTab } from './PagesTab';

export function AppShell() {
  const rightView = useAppStore((s) => s.rightView);
  const setRightView = useAppStore((s) => s.setRightView);
  const loadInitialState = useAppStore((s) => s.loadInitialState);
  const resetAll = useAppStore((s) => s.resetAll);
  const resetting = useAppStore((s) => s.resetting);
  const docCount = useAppStore((s) => s.docs.length);
  const graphNodes = useAppStore((s) => s.graph.nodes.length);
  const graphEdges = useAppStore((s) => s.graph.edges.length);
  const graphStats = useAppStore((s) => s.graph.stats);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  function handleReset() {
    if (resetting) return;
    const ok = window.confirm('Wipe all uploads, gbrain pages, chat, and graph state?');
    if (!ok) return;
    void resetAll();
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="shrink-0 px-6 py-3 border-b border-zinc-800 flex items-center gap-4 bg-zinc-950">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-white">kord-brain</h1>
          <span className="text-[11px] text-zinc-500">cross-doc engineering reasoning</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] font-mono text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
            {docCount} file{docCount === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {graphNodes} node{graphNodes === 1 ? '' : 's'} · {graphEdges} edge{graphEdges === 1 ? '' : 's'}
          </span>
          {graphStats && (
            <span>
              {graphStats.pages} pages · {graphStats.links} links
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Wipe uploads, gbrain pages, chat, and graph"
            className="ml-2 px-2 py-1 rounded border border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/60 hover:text-red-100 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-mono uppercase tracking-wide"
          >
            {resetting ? 'resetting…' : 'reset'}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0">
            <FilesTab />
          </div>
          <div className="w-[28%] min-w-[300px] border-l border-zinc-800 flex flex-col">
            <div className="shrink-0 flex border-b border-zinc-800 bg-zinc-950">
              {(['graph', 'pages'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setRightView(view)}
                  className={`flex-1 px-3 py-2 text-[10px] font-mono uppercase tracking-wide ${
                    rightView === view
                      ? 'bg-zinc-900 text-zinc-100'
                      : 'text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300'
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {rightView === 'graph' ? <GraphTab /> : <PagesTab />}
            </div>
          </div>
        </div>
        <ChatPanel />
      </div>
    </div>
  );
}
