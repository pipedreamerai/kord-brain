'use client';

import { useEffect, useRef, useState } from 'react';
import { useDemoStore, type Highlight } from '@/lib/store';
import { docBySlug, type DocSlug } from '@/lib/docs';
import { TAGS, isTag, type Tag } from '@/lib/tags';
import type { TagIndex } from '@/lib/tagIndex';
import { DEFAULT_WALKTHROUGH_MODEL, WALKTHROUGH_MODELS, type WalkthroughModel } from '@/lib/aiModels';
import { GbrainGraph } from './GbrainGraph';

type Props = {
  tagIndex: TagIndex;
};

type Beat = {
  i: number;
  text: string;
  highlights: { tag: Tag; doc: DocSlug }[];
};

type GbrainNeighbor = { slug: string; kind: 'tag' | 'document' | 'unknown'; title: string };
type GbrainEdge = { from: string; to: string; kind: string };
type GbrainContext = {
  root: string;
  neighbors: GbrainNeighbor[];
  edges: GbrainEdge[];
  backlinks: string[];
};

type Status = 'idle' | 'streaming' | 'done' | 'error';

export function WalkthroughPanel({ tagIndex }: Props) {
  const applyBeatHighlights = useDemoStore((s) => s.applyBeatHighlights);
  const clearHighlights = useDemoStore((s) => s.clearHighlights);

  const [tag, setTag] = useState<Tag>('M-101');
  const [model, setModel] = useState<WalkthroughModel>(DEFAULT_WALKTHROUGH_MODEL);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [gbrainCtx, setGbrainCtx] = useState<GbrainContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function resolveHighlights(hs: Beat['highlights']): Highlight[] {
    const out: Highlight[] = [];
    for (const h of hs) {
      const locs = tagIndex[h.tag] ?? [];
      const match = locs.find((l) => l.slug === h.doc);
      if (match) out.push({ tag: h.tag, location: match });
    }
    return out;
  }

  function applyBeat(beat: Beat) {
    setActiveBeat(beat.i);
    const resolved = resolveHighlights(beat.highlights);
    if (resolved.length > 0) applyBeatHighlights(resolved);
  }

  async function startWalkthrough() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBeats([]);
    setActiveBeat(null);
    setError(null);
    setStatus('streaming');
    setGbrainCtx(null);
    clearHighlights();

    try {
      const res = await fetch('/api/walkthrough', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, model }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => 'Request failed');
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let firstApplied = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          if ('error' in parsed && typeof parsed.error === 'string') {
            throw new Error(parsed.error);
          }
          if (parsed.done === true) {
            setStatus('done');
            continue;
          }
          if (parsed.type === 'context' && typeof parsed.root === 'string') {
            setGbrainCtx({
              root: parsed.root,
              neighbors: (parsed.neighbors as GbrainNeighbor[]) ?? [],
              edges: (parsed.edges as GbrainEdge[]) ?? [],
              backlinks: (parsed.backlinks as string[]) ?? [],
            });
            continue;
          }
          if (
            typeof parsed.i === 'number' &&
            typeof parsed.text === 'string' &&
            Array.isArray(parsed.highlights)
          ) {
            const beat = parsed as unknown as Beat;
            setBeats((prev) => [...prev, beat]);
            if (!firstApplied) {
              applyBeat(beat);
              firstApplied = true;
            }
          }
        }
      }
      setStatus((s) => (s === 'streaming' ? 'done' : s));
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <div className="p-4 flex flex-col h-full">
      <h2 className="text-sm font-semibold text-zinc-700 mb-2">Walkthrough</h2>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value as Tag)}
          disabled={status === 'streaming'}
          className="text-[11px] border border-zinc-300 rounded px-2 py-1 bg-white font-mono"
        >
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as WalkthroughModel)}
          disabled={status === 'streaming'}
          className="min-w-0 flex-1 text-[11px] border border-zinc-300 rounded px-2 py-1 bg-white"
          aria-label="Walkthrough model"
        >
          {WALKTHROUGH_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={startWalkthrough}
          disabled={status === 'streaming'}
          className="text-[11px] bg-zinc-900 text-white rounded px-3 py-1 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'streaming' ? 'Streaming…' : `Walk through ${tag}`}
        </button>
      </div>

      <p className="text-[10px] text-zinc-500 mb-3 leading-snug">
        Context is selected by <span className="font-semibold text-emerald-700">gbrain</span> (knowledge graph
        over the raw docs), then streamed through{' '}
        <code className="text-[10px] bg-zinc-100 px-1 py-0.5 rounded">
          {model}
        </code>{' '}
        via the AI Gateway. Each beat retargets highlights across the doc set.
      </p>

      {gbrainCtx && (
        <div className="mb-3 border border-emerald-200 bg-emerald-50/60 rounded p-2">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wide text-emerald-800 font-semibold">
              gbrain
            </span>
            <span className="text-[10px] text-emerald-900">
              context for <code className="bg-white/70 px-1 rounded">{gbrainCtx.root}</code> —{' '}
              {gbrainCtx.neighbors.length} pages, {gbrainCtx.edges.length} 1-hop edges
            </span>
          </div>
          <GbrainGraph
            root={gbrainCtx.root}
            neighbors={gbrainCtx.neighbors}
            edges={gbrainCtx.edges}
            onNodeClick={(slug, kind) => {
              if (status === 'streaming') return;
              if (kind !== 'tag') return;
              const upper = slug.toUpperCase() as Tag;
              if (!isTag(upper)) return;
              setTag(upper);
              setTimeout(() => startWalkthrough(), 0);
            }}
          />
          <div className="flex items-center gap-3 text-[9px] text-emerald-900/70 mt-1">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> root
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" /> document
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> tag
            </span>
            <span className="ml-auto italic">click a tag node →</span>
          </div>
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-3 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {beats.length === 0 && status !== 'streaming' && !error && (
        <div className="text-[12px] text-zinc-500 italic leading-snug">
          Pick a tag and click <em>Walk through</em>. Or click any tag in the docs/sidebar to
          highlight without invoking the model.
        </div>
      )}

      <div className="space-y-2 overflow-y-auto">
        {beats.map((b) => {
          const isActive = b.i === activeBeat;
          return (
            <button
              key={b.i}
              onClick={() => applyBeat(b)}
              className={`w-full text-left rounded p-2 border transition-colors ${
                isActive
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-white border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-amber-200 text-amber-900' : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {b.i + 1}
                </span>
                <span className="text-[12px] text-zinc-900 leading-snug">{b.text}</span>
              </div>
              <div className="flex flex-wrap gap-1 ml-7">
                {b.highlights.map((h, j) => (
                  <span
                    key={j}
                    className="text-[10px] font-mono bg-zinc-100 text-zinc-700 rounded px-1.5 py-0.5"
                  >
                    {h.tag}
                    <span className="text-zinc-400"> · </span>
                    <span className="text-zinc-500">{docBySlug(h.doc).displayName}</span>
                  </span>
                ))}
              </div>
            </button>
          );
        })}
        {status === 'streaming' && (
          <div className="text-[11px] text-zinc-500 italic px-2 py-1">…streaming</div>
        )}
      </div>
    </div>
  );
}
