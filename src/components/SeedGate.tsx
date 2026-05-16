'use client';

import { useState } from 'react';
import { SeedingView } from './SeedingView';
import { DemoLayout } from './DemoLayout';
import { useSeedStore } from '@/lib/seedStore';

export function SeedGate() {
  const phase = useSeedStore((s) => s.phase);
  const tagIndex = useSeedStore((s) => s.tagIndex);
  const docs = useSeedStore((s) => s.docs);
  const [enteredDemo, setEnteredDemo] = useState(false);

  if (enteredDemo && phase === 'done' && tagIndex && docs) {
    return <DemoLayout tagIndex={tagIndex} docs={docs} />;
  }

  return <SeedingView onComplete={() => setEnteredDemo(true)} />;
}
