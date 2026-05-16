'use client';

import { TAGS, type Tag } from '@/lib/tags';
import { TAG_DESCRIPTIONS } from '@/lib/docs';
import type { TagIndex } from '@/lib/tagIndex';
import { useDemoStore } from '@/lib/store';

type Props = {
  tagIndex: TagIndex;
  onTagClick: (tag: Tag) => void;
};

export function TagsSidebar({ tagIndex, onTagClick }: Props) {
  const highlights = useDemoStore((s) => s.highlights);
  const activeTag = highlights[0]?.tag;

  return (
    <div className="p-4">
      <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Tag Index
      </h2>
      <ul className="space-y-1">
        {TAGS.map((tag) => {
          const locs = tagIndex[tag] ?? [];
          const active = tag === activeTag;
          return (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onTagClick(tag)}
                className={`w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  active ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-zinc-100'
                }`}
              >
                <div className="font-mono text-[13px] font-semibold text-zinc-900">{tag}</div>
                <div className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                  {TAG_DESCRIPTIONS[tag] ?? <span className="text-zinc-300">—</span>}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  {locs.length} location{locs.length === 1 ? '' : 's'}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
