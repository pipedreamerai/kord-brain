'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/appStore';

type GbrainPage = {
  slug: string;
  title: string;
  type: string;
  markdown: string;
};

function typeClass(type: string) {
  if (type === 'document') return 'border-blue-500/30 bg-blue-950/20 text-blue-200';
  if (type === 'tag') return 'border-amber-500/30 bg-amber-950/20 text-amber-200';
  return 'border-zinc-700 bg-zinc-900 text-zinc-300';
}

export function PagesTab() {
  const graph = useAppStore((s) => s.graph);
  const [pages, setPages] = useState<GbrainPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/pages')
      .then((res) => (res.ok ? res.json() : { pages: [] }))
      .then((data: { pages?: GbrainPage[] }) => {
        if (!alive) return;
        const nextPages = data.pages ?? [];
        setPages(nextPages);
        setSelectedSlug((current) => (
          current && nextPages.some((page) => page.slug === current)
            ? current
            : nextPages[0]?.slug ?? null
        ));
      })
      .catch(() => {
        if (alive) setPages([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [graph.nodes.length, graph.edges.length, graph.stats.pages, graph.stats.links]);

  const selected = pages.find((page) => page.slug === selectedSlug) ?? pages[0];
  const linkCounts = useMemo(() => {
    const counts = new Map<string, { out: number; in: number }>();
    for (const edge of graph.edges) {
      const from = counts.get(edge.from) ?? { out: 0, in: 0 };
      from.out += 1;
      counts.set(edge.from, from);
      const to = counts.get(edge.to) ?? { out: 0, in: 0 };
      to.in += 1;
      counts.set(edge.to, to);
    }
    return counts;
  }, [graph.edges]);

  return (
    <div className="h-full bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">gbrain pages</div>
          <div className="text-[11px] font-mono text-zinc-400">
            {pages.length} page{pages.length === 1 ? '' : 's'} {loading ? '· loading' : ''}
          </div>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-[12px] text-zinc-600 font-mono">
            {loading ? 'loading pages…' : 'no gbrain pages yet'}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-rows-[minmax(150px,42%)_1fr]">
          <div className="overflow-auto border-b border-zinc-800 p-2 space-y-2">
            {pages.map((page) => {
              const counts = linkCounts.get(page.slug) ?? { out: 0, in: 0 };
              const active = page.slug === selected?.slug;
              return (
                <button
                  key={page.slug}
                  onClick={() => setSelectedSlug(page.slug)}
                  className={`w-full text-left rounded border px-3 py-2 transition ${
                    active ? 'border-zinc-400 bg-zinc-900' : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${typeClass(page.type)}`}>
                      {page.type}
                    </span>
                    <span className="truncate text-[12px] text-zinc-100">{page.title}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    {page.slug} · out {counts.out} · in {counts.in}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 overflow-auto p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${typeClass(selected.type)}`}>
                {selected.type}
              </span>
              <h2 className="text-sm font-semibold truncate">{selected.title}</h2>
            </div>
            <div className="mb-3 font-mono text-[10px] text-zinc-500">{selected.slug}</div>
            <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-300">
              {selected.markdown}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
