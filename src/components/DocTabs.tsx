'use client';

import { DOCS } from '@/lib/docs';
import { useDemoStore } from '@/lib/store';

type Props = {
  mainView: 'docs' | 'graph';
  onViewChange: (view: 'docs' | 'graph') => void;
};

export function DocTabs({ mainView, onViewChange }: Props) {
  const activeDoc = useDemoStore((s) => s.activeDoc);
  const setActiveDoc = useDemoStore((s) => s.setActiveDoc);

  return (
    <nav className="flex gap-1 border-b border-zinc-200 px-4 bg-zinc-50/80 backdrop-blur" aria-label="Documents">
      {DOCS.map((doc) => {
        const active = mainView === 'docs' && activeDoc === doc.slug;
        return (
          <button
            key={doc.slug}
            type="button"
            onClick={() => {
              setActiveDoc(doc.slug);
              onViewChange('docs');
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {doc.displayName}
            <span className="ml-1.5 text-[10px] uppercase text-zinc-400 tracking-wide">.{doc.kind}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onViewChange('graph')}
        className={`ml-auto px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
          mainView === 'graph'
            ? 'border-emerald-600 text-emerald-700 bg-white'
            : 'border-transparent text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
        }`}
        aria-current={mainView === 'graph' ? 'page' : undefined}
      >
        Brain
        <span className={`ml-1.5 text-[10px] uppercase tracking-wide ${mainView === 'graph' ? 'text-emerald-400' : 'text-zinc-400'}`}>
          graph
        </span>
      </button>
    </nav>
  );
}
