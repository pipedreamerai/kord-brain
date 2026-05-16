import { create } from 'zustand';
import type { BrainNode, BrainEdge } from '@/components/FullGbrainGraph';

export type UploadKind = 'pdf' | 'docx' | 'xlsx';

export type UploadPdfPayload = {
  kind: 'pdf';
  pages: { number: number; width: number; height: number }[];
};
export type UploadDocxPayload = {
  kind: 'docx';
  html: string;
  text: string;
};
export type UploadXlsxPayload = {
  kind: 'xlsx';
  sheets: { name: string; header: string[]; rows: string[][] }[];
  tagRows: { tag: string; sheet: string; rowIndex: number; values: string[] }[];
};
export type UploadPayload = UploadPdfPayload | UploadDocxPayload | UploadXlsxPayload;

export type UploadedDoc = {
  slug: string;
  filename: string;
  displayName: string;
  kind: UploadKind;
  uploadedAt: number;
  bytes: number;
  tags: string[];
  payload: UploadPayload;
};

export type GraphSnapshot = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  stats: { pages: number; links: number };
};

type AppState = {
  docs: UploadedDoc[];
  graph: GraphSnapshot;
  uploading: boolean;
  uploadError: string | null;
  lastUploadCount: number;
  hydrated: boolean;
  citedTags: Set<string>;

  hydrate: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteDoc: (slug: string) => Promise<void>;
  refreshGraph: () => Promise<void>;
  setCitedTags: (tags: Set<string>) => void;
};

const EMPTY_GRAPH: GraphSnapshot = { nodes: [], edges: [], stats: { pages: 0, links: 0 } };

export const useAppStore = create<AppState>((set, get) => ({
  docs: [],
  graph: EMPTY_GRAPH,
  uploading: false,
  uploadError: null,
  lastUploadCount: 0,
  hydrated: false,
  citedTags: new Set<string>(),

  setCitedTags: (tags: Set<string>) => set({ citedTags: tags }),

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      await fetch('/api/reset', { method: 'POST' });
      set({
        docs: [],
        graph: EMPTY_GRAPH,
        hydrated: true,
      });
    } catch (err) {
      set({ uploadError: err instanceof Error ? err.message : String(err), hydrated: true });
    }
  },

  refreshGraph: async () => {
    const res = await fetch('/api/graph');
    if (!res.ok) return;
    const data: GraphSnapshot = await res.json();
    set({ graph: data });
  },

  uploadFiles: async (files: File[]) => {
    if (files.length === 0) return;
    set({ uploading: true, uploadError: null });
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f, f.name);
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`upload HTTP ${res.status}`);
      const data = await res.json() as {
        uploaded: { slug: string }[];
        docs: UploadedDoc[];
        errors: { filename: string; error: string }[];
      };
      set({
        docs: data.docs ?? [],
        lastUploadCount: data.uploaded.length,
        uploadError: data.errors.length > 0
          ? data.errors.map((e) => `${e.filename}: ${e.error}`).join('; ')
          : null,
      });
      await get().refreshGraph();
    } catch (err) {
      set({ uploadError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ uploading: false });
    }
  },

  deleteDoc: async (slug: string) => {
    const doc = get().docs.find((d) => d.slug === slug);
    if (!doc) return;
    set({ uploadError: null });
    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(doc.filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`delete HTTP ${res.status}`);
      set({ docs: get().docs.filter((d) => d.slug !== slug) });
      await get().refreshGraph();
    } catch (err) {
      set({ uploadError: err instanceof Error ? err.message : String(err) });
    }
  },
}));
