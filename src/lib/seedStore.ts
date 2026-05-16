import { create } from 'zustand';
import type { BrainNode, BrainEdge } from '@/components/FullGbrainGraph';
import type { TagIndex, DocPayload } from './tagIndex';

export type SeedEvent =
  | { type: 'phase'; label: string }
  | { type: 'stats'; pages: number; links: number }
  | { type: 'slugs_found'; count: number }
  | { type: 'brain_node'; slug: string; title: string; kind: string; snippet: string }
  | { type: 'brain_edge'; from: string; to: string; kind: string }
  | { type: 'graph_ready'; nodes: BrainNode[]; edges: BrainEdge[] }
  | { type: 'doc_done'; slug: string; displayName: string; kind: string; tagCount: number; tags: string[] }
  | { type: 'complete'; totalTagged: number; docCount: number }
  | { type: 'error'; message: string };

export type SeedPhase = 'idle' | 'seeding' | 'done' | 'error';

type SeedStoreState = {
  phase: SeedPhase;
  phaseLabel: string;
  stats: { pages: number; links: number } | null;
  nodes: BrainNode[];
  edges: BrainEdge[];
  eventLog: SeedEvent[];
  complete: { totalTagged: number; docCount: number } | null;
  tagIndex: TagIndex | null;
  docs: DocPayload | null;
  error: string | null;

  runSeed: () => Promise<void>;
  reset: () => void;
};

const BLANK = {
  phase: 'idle' as SeedPhase,
  phaseLabel: '',
  stats: null,
  nodes: [],
  edges: [],
  eventLog: [],
  complete: null,
  tagIndex: null,
  docs: null,
  error: null,
};

export const useSeedStore = create<SeedStoreState>((set, get) => ({
  ...BLANK,

  reset: () => set({ ...BLANK }),

  runSeed: async () => {
    if (get().phase === 'seeding') return;
    set({ ...BLANK, phase: 'seeding' });

    try {
      const res = await fetch('/api/seed');
      if (!res.ok || !res.body) throw new Error(`/api/seed HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: SeedEvent;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }

          set((s) => ({ eventLog: [...s.eventLog.slice(-80), ev] }));

          if (ev.type === 'phase') {
            set({ phaseLabel: ev.label });
          } else if (ev.type === 'stats') {
            set({ stats: { pages: ev.pages, links: ev.links } });
          } else if (ev.type === 'brain_node') {
            set((s) => ({
              nodes: [...s.nodes, { slug: ev.slug, title: ev.title, kind: ev.kind }],
            }));
          } else if (ev.type === 'brain_edge') {
            set((s) => ({
              edges: [...s.edges, { from: ev.from, to: ev.to, kind: ev.kind }],
            }));
          } else if (ev.type === 'complete') {
            set({ complete: { totalTagged: ev.totalTagged, docCount: ev.docCount } });
          } else if (ev.type === 'error') {
            set({ error: ev.message, phase: 'error' });
            return;
          }
        }
      }

      // Pull the parsed document payload + tag index for the demo views.
      const ti = await fetch('/api/tag-index');
      if (!ti.ok) throw new Error(`/api/tag-index HTTP ${ti.status}`);
      const data: { tagIndex: TagIndex; docs: DocPayload } = await ti.json();
      set({ tagIndex: data.tagIndex, docs: data.docs });

      set((s) => (s.phase === 'seeding' ? { phase: 'done' } : {}));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), phase: 'error' });
    }
  },
}));
