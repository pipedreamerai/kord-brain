'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore, type UploadedDoc } from '@/lib/appStore';
import { PdfViewer } from './PdfViewer';
import { DocxViewer } from './DocxViewer';
import { XlsxViewer } from './XlsxViewer';

const FILES_BAR_KEY = 'kord:filesBarCollapsed';

export function FilesTab() {
  const docs = useAppStore((s) => s.docs);
  const uploading = useAppStore((s) => s.uploading);
  const uploadError = useAppStore((s) => s.uploadError);
  const uploadFiles = useAppStore((s) => s.uploadFiles);
  const deleteDoc = useAppStore((s) => s.deleteDoc);
  const citedTags = useAppStore((s) => s.citedTags);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(FILES_BAR_KEY) === '1') setCollapsed(true);
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(FILES_BAR_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  const active = docs.find((d) => d.slug === activeSlug) ?? null;
  const empty = docs.length === 0;

  function openPicker() {
    inputRef.current?.click();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    await uploadFiles(files);
  }

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx"
        className="hidden"
        onChange={onPick}
      />

      {empty ? (
        <EmptyState onUpload={openPicker} uploading={uploading} error={uploadError} />
      ) : (
        <>
          <aside
            className={`${collapsed ? 'w-9' : 'w-72'} shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden transition-[width] duration-200`}
          >
            <div
              className={`shrink-0 border-b border-zinc-800 flex items-center gap-2 min-w-0 ${collapsed ? 'justify-center px-1 py-2' : 'px-3 py-2'}`}
            >
              {!collapsed && (
                <>
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-mono whitespace-nowrap">
                    {docs.length} file{docs.length === 1 ? '' : 's'}
                  </span>
                  <button
                    onClick={openPicker}
                    disabled={uploading}
                    className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded transition-colors whitespace-nowrap"
                  >
                    {uploading ? 'uploading…' : '+ Upload'}
                  </button>
                </>
              )}
              <button
                onClick={toggleCollapsed}
                aria-label={collapsed ? 'Expand file list' : 'Collapse file list'}
                aria-expanded={!collapsed}
                title={collapsed ? 'Show files' : 'Hide files'}
                className="text-zinc-500 hover:text-zinc-200 p-0.5 shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
                </svg>
              </button>
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {docs.map((d) => (
                  <FileRow
                    key={d.slug}
                    doc={d}
                    active={d.slug === activeSlug}
                    citedTags={citedTags}
                    onClick={() => setActiveSlug(d.slug)}
                    onDelete={() => {
                      if (activeSlug === d.slug) setActiveSlug(null);
                      void deleteDoc(d.slug);
                    }}
                  />
                ))}
                {uploadError && (
                  <div className="text-[10px] text-red-400 bg-red-950/40 border border-red-900/60 rounded p-2 mt-2 font-mono">
                    {uploadError}
                  </div>
                )}
              </div>
            )}
          </aside>

          <main className="flex-1 min-w-0 bg-zinc-100 text-zinc-900 overflow-auto">
            {active ? (
              <DocViewer doc={active} citedTags={citedTags} />
            ) : (
              <div className="flex items-center justify-center h-full text-[12px] text-zinc-500">
                Pick a file to see citations highlighted.
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function FileRow({
  doc,
  active,
  citedTags,
  onClick,
  onDelete,
}: {
  doc: UploadedDoc;
  active: boolean;
  citedTags: Set<string>;
  onClick: () => void;
  onDelete: () => void;
}) {
  const citedCount = doc.tags.reduce(
    (n, t) => n + (citedTags.has(slugify(t)) ? 1 : 0),
    0,
  );
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group w-full text-left rounded px-2.5 py-2 transition-colors border cursor-pointer ${
        active
          ? 'bg-blue-950/60 border-blue-800'
          : citedCount > 0
            ? 'border-amber-900/40 bg-amber-950/20 hover:bg-amber-950/30'
            : 'border-transparent hover:bg-zinc-900/60'
      }`}
    >
      <div className="flex items-center gap-2">
        <KindBadge kind={doc.kind} />
        <span className="text-[12px] text-zinc-200 truncate flex-1">{doc.displayName}</span>
        {citedCount > 0 && (
          <span className="text-[9px] font-mono text-amber-300 bg-amber-950/60 border border-amber-900/60 rounded px-1 shrink-0">
            {citedCount} cited
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${doc.displayName}`}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 shrink-0 p-0.5"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600 font-mono">
        <span>{formatBytes(doc.bytes)}</span>
        <span>·</span>
        <span>{doc.tags.length} tag{doc.tags.length === 1 ? '' : 's'}</span>
      </div>
      {doc.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-0.5">
          {doc.tags.slice(0, 8).map((t) => (
            <span
              key={t}
              className={`text-[9px] rounded px-1 font-mono ${
                citedTags.has(slugify(t))
                  ? 'bg-amber-900/60 text-amber-200'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {t}
            </span>
          ))}
          {doc.tags.length > 8 && (
            <span className="text-[9px] text-zinc-600">+{doc.tags.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}

function DocViewer({ doc, citedTags }: { doc: UploadedDoc; citedTags: Set<string> }) {
  const noop = () => {};
  if (doc.payload.kind === 'pdf') {
    return (
      <PdfViewer
        url={`/api/uploads/${encodeURIComponent(doc.filename)}`}
        bboxes={[]}
        highlightedTags={citedTags}
        onTagClick={noop}
      />
    );
  }
  if (doc.payload.kind === 'docx') {
    return (
      <DocxViewer
        html={doc.payload.html}
        highlightedTags={citedTags}
        onTagClick={noop}
      />
    );
  }
  return (
    <XlsxViewer
      sheets={doc.payload.sheets}
      highlightedTags={citedTags}
      onTagClick={noop}
    />
  );
}

function EmptyState({
  onUpload,
  uploading,
  error,
}: {
  onUpload: () => void;
  uploading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm text-center px-6">
        <p className="text-zinc-600 text-[11px] font-mono uppercase tracking-widest mb-2">
          kord-brain
        </p>
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">
          No files yet
        </h1>
        <p className="text-zinc-500 text-sm mb-8">
          Upload PDFs, DOCX, or XLSX. Tags are extracted and pushed into the
          knowledge graph. Or ask the brain a question on the right.
        </p>
        <button
          onClick={onUpload}
          disabled={uploading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-lg text-[15px] transition-colors"
        >
          {uploading ? 'Uploading…' : 'Upload files'}
        </button>
        <p className="text-[11px] text-zinc-700 mt-3">
          .pdf · .docx · .xlsx
        </p>
        {error && (
          <p className="text-[11px] text-red-400 mt-4 font-mono">{error}</p>
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: 'pdf' | 'docx' | 'xlsx' }) {
  const cls =
    kind === 'pdf'
      ? 'text-red-500 bg-red-950/40'
      : kind === 'xlsx'
        ? 'text-green-500 bg-green-950/40'
        : 'text-blue-500 bg-blue-950/40';
  return (
    <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
      {kind}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function slugify(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
