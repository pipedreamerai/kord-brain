'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/appStore';

type PageDetail = {
  slug: string;
  title: string;
  type: string;
  markdown: string;
};

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: PageDetail }
  | { status: 'error' };

function typeClass(type: string) {
  if (type === 'document') return 'border-blue-500/30 bg-blue-950/20 text-blue-200';
  if (type === 'tag') return 'border-amber-500/30 bg-amber-950/20 text-amber-200';
  return 'border-zinc-700 bg-zinc-900 text-zinc-300';
}

export function PagesTab() {
  const graph = useAppStore((s) => s.graph);
  const graphLoading = useAppStore((s) => s.graphLoading);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, FetchState>>({});

  const items = useMemo(() => {
    return [...graph.nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'document' ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [graph.nodes]);

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

  // If the currently open slug disappears from the graph (after reset/delete),
  // collapse it. Don't auto-open anything — accordion starts closed.
  useEffect(() => {
    if (openSlug && !items.some((n) => n.slug === openSlug)) {
      setOpenSlug(null);
    }
  }, [items, openSlug]);

  // Drop cached markdown for slugs no longer in the graph so a re-upload
  // re-fetches fresh content.
  useEffect(() => {
    setCache((prev) => {
      const alive = new Set(items.map((n) => n.slug));
      let changed = false;
      const next: Record<string, FetchState> = {};
      for (const [slug, state] of Object.entries(prev)) {
        if (alive.has(slug)) next[slug] = state;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  const toggle = (slug: string) => {
    if (openSlug === slug) {
      setOpenSlug(null);
      return;
    }
    setOpenSlug(slug);
    const existing = cache[slug];
    if (existing && (existing.status === 'ready' || existing.status === 'loading')) return;

    setCache((prev) => ({ ...prev, [slug]: { status: 'loading' } }));
    fetch(`/api/pages?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { page: PageDetail | null };
        if (!data.page) throw new Error('not found');
        setCache((prev) => ({ ...prev, [slug]: { status: 'ready', data: data.page! } }));
      })
      .catch(() => {
        setCache((prev) => ({ ...prev, [slug]: { status: 'error' } }));
      });
  };

  return (
    <div className="h-full bg-zinc-950 text-zinc-100 flex flex-col">
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-[12px] text-zinc-600 font-mono">no gbrain pages yet</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1.5">
          {items.map((node) => {
            const counts = linkCounts.get(node.slug) ?? { out: 0, in: 0 };
            const open = node.slug === openSlug;
            const state = cache[node.slug];
            return (
              <div
                key={node.slug}
                className={`rounded border ${open ? 'border-zinc-400' : 'border-zinc-800'}`}
              >
                <button
                  onClick={() => toggle(node.slug)}
                  className={`w-full text-left px-3 py-2 transition ${
                    open ? 'bg-zinc-900' : 'bg-zinc-950 hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${typeClass(node.kind)}`}>
                      {node.kind}
                    </span>
                    <span className="truncate text-[12px] text-zinc-100">{node.title}</span>
                    <span className={`ml-auto shrink-0 text-[10px] text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}>
                      ▸
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    {node.slug} · out {counts.out} · in {counts.in}
                  </div>
                </button>

                {open && (
                  <div className="border-t border-zinc-800 p-3">
                    {!state || state.status === 'loading' || state.status === 'idle' ? (
                      <div className="font-mono text-[11px] text-zinc-500">loading…</div>
                    ) : state.status === 'error' ? (
                      <div className="font-mono text-[11px] text-red-400">failed to load page</div>
                    ) : (
                      <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-300">
                        {state.data.markdown}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
