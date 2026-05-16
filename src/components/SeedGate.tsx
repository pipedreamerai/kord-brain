'use client';

import { useState } from 'react';
import { SeedingView } from './SeedingView';
import { DemoLayout } from './DemoLayout';
import type { TagIndex, DocPayload } from '@/lib/tagIndex';

type Phase = 'seed' | 'loading' | 'demo';

export function SeedGate() {
  const [phase, setPhase] = useState<Phase>('seed');
  const [tagIndex, setTagIndex] = useState<TagIndex | null>(null);
  const [docs, setDocs] = useState<DocPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleSeedComplete() {
    setPhase('loading');
    setLoadError(null);
    try {
      const res = await fetch('/api/tag-index');
      if (!res.ok) throw new Error(`tag-index HTTP ${res.status}`);
      const data: { tagIndex: TagIndex; docs: DocPayload } = await res.json();
      setTagIndex(data.tagIndex);
      setDocs(data.docs);
      setPhase('demo');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setPhase('seed');
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <span className="text-zinc-500 text-sm font-mono animate-pulse">Loading demo…</span>
      </div>
    );
  }

  if (phase === 'seed') {
    return (
      <>
        {loadError && (
          <div className="fixed top-3 inset-x-0 flex justify-center z-50 pointer-events-none">
            <div className="bg-red-900/90 text-red-300 text-[11px] font-mono px-4 py-2 rounded-full shadow-lg">
              {loadError}
            </div>
          </div>
        )}
        <SeedingView onComplete={handleSeedComplete} />
      </>
    );
  }

  if (phase === 'demo' && tagIndex && docs) {
    return <DemoLayout tagIndex={tagIndex} docs={docs} />;
  }

  return null;
}
