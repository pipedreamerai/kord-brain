'use client';

import { useMemo, useState } from 'react';
import { useDemoStore } from '@/lib/store';
import { docBySlug } from '@/lib/docs';
import type { Tag } from '@/lib/tags';
import type { DocPayload, TagIndex } from '@/lib/tagIndex';
import { DocTabs } from './DocTabs';
import { PdfViewer, type PdfBboxEntry } from './PdfViewer';
import { DocxViewer } from './DocxViewer';
import { XlsxViewer } from './XlsxViewer';
import { TagsSidebar } from './TagsSidebar';
import { WalkthroughPanel } from './WalkthroughPanel';
import { GraphView } from './GraphView';

type Props = {
  tagIndex: TagIndex;
  docs: DocPayload;
};

export function DemoLayout({ tagIndex, docs }: Props) {
  const [mainView, setMainView] = useState<'docs' | 'graph'>('docs');
  const activeDoc = useDemoStore((s) => s.activeDoc);
  const highlights = useDemoStore((s) => s.highlights);
  const selectTag = useDemoStore((s) => s.selectTag);

  const activeMeta = docBySlug(activeDoc);
  const activePayload = docs[activeDoc];

  // Tags currently highlighted, scoped to the active doc
  const activeHighlightedTags = useMemo(() => {
    const s = new Set<string>();
    for (const h of highlights) {
      if (h.location.slug === activeDoc) s.add(h.tag);
    }
    return s;
  }, [highlights, activeDoc]);

  const activeHighlightedAnchors = useMemo(() => {
    const s = new Set<string>();
    for (const h of highlights) {
      if (h.location.kind === 'docx' && h.location.slug === activeDoc) {
        s.add(h.location.anchorId);
      }
    }
    return s;
  }, [highlights, activeDoc]);

  // Bboxes for the active PDF (used by PdfViewer for click hit-testing and overlays)
  const activePdfBboxes = useMemo<PdfBboxEntry[]>(() => {
    if (activeMeta.kind !== 'pdf') return [];
    const entries: PdfBboxEntry[] = [];
    for (const [tag, locs] of Object.entries(tagIndex)) {
      for (const loc of locs) {
        if (loc.kind === 'pdf' && loc.slug === activeDoc) {
          entries.push({ tag, page: loc.page, bbox: loc.bbox, note: loc.note });
        }
      }
    }
    return entries;
  }, [tagIndex, activeDoc, activeMeta.kind]);

  function handleTagClick(tag: string) {
    const locations = tagIndex[tag as Tag] ?? [];
    if (locations.length === 0) {
      console.warn(`Tag ${tag} clicked but no locations in index`);
      return;
    }
    selectTag(tag as Tag, locations);
    console.info(`Selected tag: ${tag} (${locations.length} location${locations.length === 1 ? '' : 's'})`);
  }

  return (
    <div className="flex flex-col h-screen text-zinc-900">
      <header className="px-6 py-3 border-b border-zinc-200 flex items-center gap-4 bg-white">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold">kord-brain</h1>
          <span className="text-[11px] text-zinc-500">cross-doc engineering reasoning</span>
        </div>
        <span className="ml-auto text-[10px] text-zinc-400 uppercase tracking-wide">Phase 1 scaffold</span>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 border-r border-zinc-200 bg-zinc-50 overflow-y-auto">
          <TagsSidebar tagIndex={tagIndex} onTagClick={handleTagClick} />
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <DocTabs mainView={mainView} onViewChange={setMainView} />
          <div className="flex-1 overflow-auto bg-zinc-100">
            {mainView === 'graph' ? (
              <div className="h-full">
                <GraphView />
              </div>
            ) : (
              <>
                {activeMeta.kind === 'pdf' && activePayload?.kind === 'pdf' && (
                  <PdfViewer
                    url={`/samples/${activeMeta.filename}`}
                    bboxes={activePdfBboxes}
                    highlightedTags={activeHighlightedTags}
                    onTagClick={handleTagClick}
                  />
                )}
                {activeMeta.kind === 'docx' && activePayload?.kind === 'docx' && (
                  <DocxViewer
                    html={activePayload.html}
                    highlightedAnchors={activeHighlightedAnchors}
                    onTagClick={handleTagClick}
                  />
                )}
                {activeMeta.kind === 'xlsx' && activePayload?.kind === 'xlsx' && (
                  <XlsxViewer
                    sheets={activePayload.sheets}
                    highlightedTags={activeHighlightedTags}
                    onTagClick={handleTagClick}
                  />
                )}
                {!activePayload && (
                  <div className="p-8 text-sm text-zinc-500">No payload loaded for {activeMeta.displayName}.</div>
                )}
              </>
            )}
          </div>
        </main>

        <aside className="w-80 border-l border-zinc-200 bg-white overflow-y-auto">
          <WalkthroughPanel tagIndex={tagIndex} />
        </aside>
      </div>
    </div>
  );
}
