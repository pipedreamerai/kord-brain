'use client';

import { useState } from 'react';
import { GraphView } from './GraphView';
import { SeedGate } from './SeedGate';

type RootView = 'brain' | 'files';

export function AppShell() {
  const [view, setView] = useState<RootView>('brain');

  return (
    <div className="flex flex-col h-screen">
      <header className="shrink-0 px-6 py-3 border-b border-zinc-800 flex items-center gap-4 bg-zinc-950">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-white">kord-brain</h1>
          <span className="text-[11px] text-zinc-500">cross-doc engineering reasoning</span>
        </div>
        <nav className="ml-6 flex items-center gap-1">
          <TabButton label="Brain" active={view === 'brain'} color="emerald" onClick={() => setView('brain')} />
          <TabButton label="Files" active={view === 'files'} color="blue" onClick={() => setView('files')} />
        </nav>
      </header>

      {/* Both views stay mounted so Files state (seeded docs) survives tab switches */}
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${view !== 'brain' ? 'hidden' : ''}`}>
          <GraphView />
        </div>
        <div className={`absolute inset-0 ${view !== 'files' ? 'hidden' : ''}`}>
          <SeedGate />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
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
      className={`px-3 py-1 text-[12px] font-medium rounded transition-colors ${
        active ? activeClass : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
      }`}
    >
      {label}
    </button>
  );
}
