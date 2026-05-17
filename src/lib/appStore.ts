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
  kindsByTag?: Record<string, string>;
  descriptionsByTag?: Record<string, string>;
  summaryByPage?: Record<number, string>;
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
    set({ initialLoaded: true, graphLoading: true });

    // Fire docs and graph independently so the file list paints fast while the
    // slower gbrain graph walk fills in behind it. Don't clobber concurrent
    // user actions: if docs are already populated (upload completed) or a reset
    // is in flight, drop the stale result.
    void (async () => {
      try {
        const res = await fetch('/api/uploads');
        if (!res.ok) return;
        const data = (await res.json()) as { docs: UploadedDoc[] };
        const s = get();
        if (s.docs.length > 0 || s.resetting) return;
        set({ docs: data.docs ?? [] });
      } catch {
        // Best-effort — empty UI is the fallback.
      }
    })();

    void (async () => {
      try {
        const res = await fetch('/api/graph');
        if (!res.ok) return;
        const data = (await res.json()) as GraphSnapshot;
        const s = get();
        if (s.graph.nodes.length > 0 || s.resetting) return;
        set({ graph: data });
      } catch {
        // Best-effort — empty UI is the fallback.
      } finally {
        set({ graphLoading: false });
      }
    })();
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

    // Per-tag pushes happen incrementally as vision returns; we want the graph
    // to animate during the upload, not just at the end. Coalesce: at most one
    // refresh in flight at a time.
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
            case 'page-vision': {
              const page = Number(msg.page ?? 0);
              const tags = Array.isArray(msg.tags) ? (msg.tags as string[]) : [];
              const source = String(msg.source ?? '');
              const summary =
                typeof msg.summary === 'string' && msg.summary.length > 0
                  ? ` — ${msg.summary.slice(0, 80)}${msg.summary.length > 80 ? '…' : ''}`
                  : '';
              const label =
                source === 'text-layer'
                  ? `text-layer`
                  : source === 'vision-failed'
                    ? `vision failed`
                    : `vision`;
              updateProgress({
                currentStep: `Page ${page}: ${tags.length} tag${tags.length === 1 ? '' : 's'} (${label})`,
              });
              pushNote(`  page ${page} (${label}): ${tags.length} tag${tags.length === 1 ? '' : 's'}${summary}`);
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
                currentFraction: 0.95,
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
              // Each tag adds a node + edge; refresh the graph so it animates
              // alongside the notes feed instead of waiting for file-done.
              scheduleGraphRefresh();
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
