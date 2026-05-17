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

export type UploadNote = { id: number; text: string };

export type UploadProgress = {
  total: number;
  doneFiles: number;
  currentIndex: number;
  currentFile: string | null;
  currentStep: string | null;
  /** 0..1 fraction within the current file (parse/push/tag-loop). */
  currentFraction: number;
  notes: UploadNote[];
};

const EMPTY_PROGRESS: UploadProgress = {
  total: 0,
  doneFiles: 0,
  currentIndex: 0,
  currentFile: null,
  currentStep: null,
  currentFraction: 0,
  notes: [],
};

export type RightView = 'graph' | 'pages';

type AppState = {
  docs: UploadedDoc[];
  graph: GraphSnapshot;
  uploading: boolean;
  uploadProgress: UploadProgress;
  graphLoading: boolean;
  resetting: boolean;
  uploadError: string | null;
  lastUploadCount: number;
  citedTags: Set<string>;
  chatResetEpoch: number;
  initialLoaded: boolean;
  activeSlug: string | null;
  scrollTarget: ScrollTarget | null;
  /** Single source of truth for tag selection — only one is ever selected. */
  selectedTag: string | null;
  rightView: RightView;

  loadInitialState: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteDoc: (slug: string) => Promise<void>;
  refreshGraph: () => Promise<void>;
  resetAll: () => Promise<void>;
  setCitedTags: (tags: Set<string>) => void;
  setActiveSlug: (slug: string | null) => void;
  setRightView: (view: RightView) => void;
  /**
   * Select a tag (from chat citation OR graph node). Pass null to clear.
   * Switches the right pane to the graph, opens the first containing doc,
   * and scrolls/pulses the bbox.
   */
  selectTag: (tagSlug: string | null) => void;
  /** Open the first doc that contains this tag and request a scroll to it. */
  focusCitation: (tagSlug: string) => void;
};

const EMPTY_GRAPH: GraphSnapshot = { nodes: [], edges: [], stats: { pages: 0, links: 0 } };

const MAX_NOTES = 12;
let noteSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  docs: [],
  graph: EMPTY_GRAPH,
  uploading: false,
  uploadProgress: EMPTY_PROGRESS,
  graphLoading: false,
  resetting: false,
  uploadError: null,
  lastUploadCount: 0,
  citedTags: new Set<string>(),
  chatResetEpoch: 0,
  initialLoaded: false,
  activeSlug: null,
  scrollTarget: null,
  selectedTag: null,
  rightView: 'graph',

  setCitedTags: (tags: Set<string>) => set({ citedTags: tags }),
  setActiveSlug: (slug: string | null) =>
    set({ activeSlug: slug, scrollTarget: null }),
  setRightView: (view) => set({ rightView: view }),
  selectTag: (tagSlug: string | null) => {
    if (tagSlug === null) {
      set({ selectedTag: null, scrollTarget: null });
      return;
    }
    const slug = tagSlug.toLowerCase();
    const docs = get().docs;
    const matched = docs.find((d) => d.tags.some((t) => tagToSlug(t) === slug));
    // Always commit selection + show the graph so the node is visible, even
    // if no uploaded doc contains the tag yet.
    set({
      selectedTag: slug,
      rightView: 'graph',
      activeSlug: matched ? matched.slug : get().activeSlug,
      scrollTarget: matched ? { tag: slug, nonce: Date.now() } : null,
    });
  },
  focusCitation: (tagSlug: string) => {
    get().selectTag(tagSlug);
  },

  loadInitialState: async () => {
    if (get().initialLoaded) return;
    set({ initialLoaded: true });
    console.log('[kord] loadInitialState: starting');
    try {
      const [uploadsRes, graphRes] = await Promise.all([
        fetch('/api/uploads'),
        fetch('/api/graph'),
      ]);
      console.log('[kord] loadInitialState: status', uploadsRes.status, graphRes.status);
      if (!uploadsRes.ok || !graphRes.ok) return;
      const uploadsData = (await uploadsRes.json()) as { docs: UploadedDoc[] };
      const graphData = (await graphRes.json()) as GraphSnapshot;
      console.log('[kord] loadInitialState: docs', uploadsData.docs?.length, 'nodes', graphData.nodes?.length);
      // User may have uploaded / reset / deleted while fetches were in flight.
      // Their action wins — only sync if state is still pristine.
      const s = get();
      if (s.docs.length > 0 || s.uploading || s.resetting) {
        console.log('[kord] loadInitialState: bailing', { docs: s.docs.length, uploading: s.uploading, resetting: s.resetting });
        return;
      }
      set({ docs: uploadsData.docs ?? [], graph: graphData });
      console.log('[kord] loadInitialState: applied');
    } catch (err) {
      console.log('[kord] loadInitialState: error', err);
    }
  },

  refreshGraph: async () => {
    set({ graphLoading: true });
    try {
      const res = await fetch('/api/graph');
      if (!res.ok) return;
      const data: GraphSnapshot = await res.json();
      set({ graph: data });
    } finally {
      set({ graphLoading: false });
    }
  },

  uploadFiles: async (files: File[]) => {
    if (files.length === 0) return;
    set({
      uploading: true,
      uploadError: null,
      uploadProgress: {
        ...EMPTY_PROGRESS,
        total: files.length,
        currentStep: 'Sending files…',
      },
    });

    const pushNote = (text: string) => {
      const prev = get().uploadProgress;
      const next = [...prev.notes, { id: ++noteSeq, text }];
      if (next.length > MAX_NOTES) next.splice(0, next.length - MAX_NOTES);
      set({ uploadProgress: { ...prev, notes: next } });
    };

    const updateProgress = (patch: Partial<UploadProgress>) => {
      set({ uploadProgress: { ...get().uploadProgress, ...patch } });
    };

    let pendingGraphRefresh: Promise<void> | null = null;
    const scheduleGraphRefresh = () => {
      if (pendingGraphRefresh) return;
      pendingGraphRefresh = get()
        .refreshGraph()
        .finally(() => {
          pendingGraphRefresh = null;
        });
    };

    try {
      const form = new FormData();
      for (const f of files) form.append('files', f, f.name);
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`upload HTTP ${res.status}`);
      if (!res.body) throw new Error('upload response has no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalDocs: UploadedDoc[] | null = null;
      let finalErrors: Array<{ filename: string; error: string }> = [];
      let finalUploadedCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let msg: { type: string; [k: string]: unknown };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          switch (msg.type) {
            case 'start':
              updateProgress({
                total: Number(msg.total ?? files.length),
                currentStep: 'Receiving…',
                currentFraction: 0,
              });
              break;
            case 'file-start': {
              const filename = String(msg.filename ?? '');
              const idx = Number(msg.index ?? 0);
              updateProgress({
                currentIndex: idx,
                currentFile: filename,
                currentStep: 'Reading…',
                currentFraction: 0.05,
              });
              pushNote(`▸ ${filename}`);
              break;
            }
            case 'parse-start': {
              const kind = String(msg.kind ?? '');
              updateProgress({
                currentStep: `Parsing ${kind.toUpperCase()}…`,
                currentFraction: 0.15,
              });
              break;
            }
            case 'parsed': {
              const tags = Array.isArray(msg.tags) ? (msg.tags as string[]) : [];
              const pageCount = typeof msg.pageCount === 'number' ? msg.pageCount : null;
              const detail = pageCount != null
                ? `${tags.length} tag${tags.length === 1 ? '' : 's'} · ${pageCount} page${pageCount === 1 ? '' : 's'}`
                : `${tags.length} tag${tags.length === 1 ? '' : 's'}`;
              updateProgress({
                currentStep: `Found ${detail}`,
                currentFraction: 0.35,
              });
              pushNote(`  parsed — ${detail}`);
              break;
            }
            case 'gbrain-doc': {
              updateProgress({
                currentStep: 'Writing doc page → gbrain',
                currentFraction: 0.5,
              });
              pushNote(`  gbrain put ${String(msg.slug ?? '')}`);
              break;
            }
            case 'gbrain-tag': {
              const tag = String(msg.tag ?? '');
              const i = Number(msg.i ?? 0);
              const of = Number(msg.of ?? 0);
              const fraction = of > 0 ? 0.5 + 0.45 * (i / of) : 0.5;
              updateProgress({
                currentStep: `Linking ${tag} (${i}/${of})`,
                currentFraction: fraction,
              });
              pushNote(`  link → ${tag} (${i}/${of})`);
              break;
            }
            case 'file-done': {
              const doc = msg.doc as UploadedDoc | undefined;
              const prev = get();
              if (doc) {
                const docs = prev.docs.filter((d) => d.slug !== doc.slug);
                docs.push(doc);
                set({ docs });
              }
              updateProgress({
                doneFiles: get().uploadProgress.doneFiles + 1,
                currentStep: 'Updating graph…',
                currentFraction: 1,
              });
              pushNote(`  ✓ ${String(msg.filename ?? '')}`);
              scheduleGraphRefresh();
              break;
            }
            case 'file-error': {
              const fn = String(msg.filename ?? '');
              const err = String(msg.error ?? 'failed');
              pushNote(`  ✗ ${fn}: ${err}`);
              updateProgress({
                doneFiles: get().uploadProgress.doneFiles + 1,
                currentStep: `Failed: ${fn}`,
              });
              break;
            }
            case 'all-done': {
              finalDocs = (msg.docs as UploadedDoc[]) ?? null;
              finalErrors = (msg.errors as Array<{ filename: string; error: string }>) ?? [];
              const uploaded = msg.uploaded as Array<unknown> | undefined;
              finalUploadedCount = uploaded?.length ?? 0;
              break;
            }
            default:
              break;
          }
        }
      }

      if (finalDocs) set({ docs: finalDocs });
      set({
        lastUploadCount: finalUploadedCount,
        uploadError:
          finalErrors.length > 0
            ? finalErrors.map((e) => `${e.filename}: ${e.error}`).join('; ')
            : null,
      });

      if (pendingGraphRefresh) await pendingGraphRefresh;
      await get().refreshGraph();
    } catch (err) {
      set({ uploadError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ uploading: false, uploadProgress: EMPTY_PROGRESS });
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
        selectedTag: null,
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
