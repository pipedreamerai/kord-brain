import { create } from 'zustand';
import type { BrainNode, BrainEdge } from '@/components/FullGbrainGraph';
import { tagToSlug } from '@/lib/tagRegex';

export type UploadKind = 'pdf' | 'docx' | 'xlsx';

export type ScrollTarget = { tag: string; nonce: number };

export type PdfTagLocation = {
  page: number;
  bbox: [number, number, number, number];
};

export type UploadPdfPayload = {
  kind: 'pdf';
  pages: { number: number; width: number; height: number }[];
  tagLocations: Record<string, PdfTagLocation[]>;
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
  resetting: boolean;
  uploadError: string | null;
  lastUploadCount: number;
  citedTags: Set<string>;
  chatResetEpoch: number;
  initialLoaded: boolean;
  activeSlug: string | null;
  scrollTarget: ScrollTarget | null;

  loadInitialState: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteDoc: (slug: string) => Promise<void>;
  refreshGraph: () => Promise<void>;
  resetAll: () => Promise<void>;
  setCitedTags: (tags: Set<string>) => void;
  setActiveSlug: (slug: string | null) => void;
  /** Open the first doc that contains this tag and request a scroll to it. */
  focusCitation: (tagSlug: string) => void;
};

const EMPTY_GRAPH: GraphSnapshot = { nodes: [], edges: [], stats: { pages: 0, links: 0 } };

export const useAppStore = create<AppState>((set, get) => ({
  docs: [],
  graph: EMPTY_GRAPH,
  uploading: false,
  resetting: false,
  uploadError: null,
  lastUploadCount: 0,
  citedTags: new Set<string>(),
  chatResetEpoch: 0,
  initialLoaded: false,
  activeSlug: null,
  scrollTarget: null,

  setCitedTags: (tags: Set<string>) => set({ citedTags: tags }),
  setActiveSlug: (slug: string | null) => set({ activeSlug: slug, scrollTarget: null }),
  focusCitation: (tagSlug: string) => {
    const slug = tagSlug.toLowerCase();
    const docs = get().docs;
    const matched = docs.find((d) => d.tags.some((t) => tagToSlug(t) === slug));
    if (!matched) return;
    set({
      activeSlug: matched.slug,
      scrollTarget: { tag: slug, nonce: Date.now() },
    });
  },

  loadInitialState: async () => {
    if (get().initialLoaded) return;
    set({ initialLoaded: true });
    try {
      const [uploadsRes, graphRes] = await Promise.all([
        fetch('/api/uploads'),
        fetch('/api/graph'),
      ]);
      if (!uploadsRes.ok || !graphRes.ok) return;
      const uploadsData = (await uploadsRes.json()) as { docs: UploadedDoc[] };
      const graphData = (await graphRes.json()) as GraphSnapshot;
      // User may have uploaded / reset / deleted while fetches were in flight.
      // Their action wins — only sync if state is still pristine.
      const s = get();
      if (s.docs.length > 0 || s.uploading || s.resetting) return;
      set({ docs: uploadsData.docs ?? [], graph: graphData });
    } catch {
      // Initial sync is best-effort; missing state just means empty UI.
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

  resetAll: async () => {
    if (get().resetting) return;
    set({ resetting: true, uploadError: null });
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`reset HTTP ${res.status}`);
      set({
        docs: [],
        graph: EMPTY_GRAPH,
        citedTags: new Set<string>(),
        lastUploadCount: 0,
        chatResetEpoch: get().chatResetEpoch + 1,
        activeSlug: null,
        scrollTarget: null,
      });
    } catch (err) {
      set({ uploadError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ resetting: false });
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
      set({
        docs: get().docs.filter((d) => d.slug !== slug),
        activeSlug: get().activeSlug === slug ? null : get().activeSlug,
        scrollTarget: get().activeSlug === slug ? null : get().scrollTarget,
      });
      await get().refreshGraph();
    } catch (err) {
      set({ uploadError: err instanceof Error ? err.message : String(err) });
    }
  },
}));
