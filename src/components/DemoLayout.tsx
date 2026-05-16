'use client';

import { useMemo } from 'react';
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

type Props = {
  tagIndex: TagIndex;
  docs: DocPayload;
};

export function DemoLayout({ tagIndex, docs }: Props) {
  const activeDoc = useDemoStore((s) => s.activeDoc);
  const highlights = useDemoStore((s) => s.highlights);
  const selectTag = useDemoStore((s) => s.selectTag);

  const activeMeta = docBySlug(activeDoc);
  const activePayload = docs[activeDoc];

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
    <div className="flex flex-col h-full text-zinc-900">
      <div className="flex flex-1 min-h-0">
        <aside className="w-64 border-r border-zinc-200 bg-zinc-50 overflow-y-auto">
          <TagsSidebar tagIndex={tagIndex} onTagClick={handleTagClick} />
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <DocTabs />
          <div className="flex-1 overflow-auto bg-zinc-100">
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
          </div>
        </main>

        <aside className="w-80 border-l border-zinc-200 bg-white overflow-y-auto">
          <WalkthroughPanel tagIndex={tagIndex} />
        </aside>
      </div>
    </div>
  );
}
