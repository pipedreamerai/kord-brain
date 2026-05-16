'use client';

import { useRef, useState } from 'react';
import { useAppStore, type UploadedDoc } from '@/lib/appStore';
import { PdfViewer } from './PdfViewer';
import { DocxViewer } from './DocxViewer';
import { XlsxViewer } from './XlsxViewer';

export function FilesTab() {
  const docs = useAppStore((s) => s.docs);
  const uploading = useAppStore((s) => s.uploading);
  const uploadError = useAppStore((s) => s.uploadError);
  const uploadFiles = useAppStore((s) => s.uploadFiles);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          <aside className="w-72 shrink-0 border-r border-zinc-800 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-mono">
                {docs.length} file{docs.length === 1 ? '' : 's'}
              </span>
              <button
                onClick={openPicker}
                disabled={uploading}
                className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded transition-colors"
              >
                {uploading ? 'uploading…' : '+ Upload'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {docs.map((d) => (
                <FileRow
                  key={d.slug}
                  doc={d}
                  active={d.slug === activeSlug}
                  onClick={() => setActiveSlug(d.slug)}
                />
              ))}
              {uploadError && (
                <div className="text-[10px] text-red-400 bg-red-950/40 border border-red-900/60 rounded p-2 mt-2 font-mono">
                  {uploadError}
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 bg-zinc-100 text-zinc-900 overflow-auto">
            {active ? (
              <DocViewer doc={active} />
            ) : (
              <div className="flex items-center justify-center h-full text-[12px] text-zinc-500">
                Select a file from the left to preview.
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
  onClick,
}: {
  doc: UploadedDoc;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded px-2.5 py-2 transition-colors border ${
        active
          ? 'bg-blue-950/60 border-blue-800'
          : 'border-transparent hover:bg-zinc-900/60'
      }`}
    >
      <div className="flex items-center gap-2">
        <KindBadge kind={doc.kind} />
        <span className="text-[12px] text-zinc-200 truncate">{doc.displayName}</span>
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
              className="text-[9px] bg-zinc-800 text-zinc-400 rounded px-1 font-mono"
            >
              {t}
            </span>
          ))}
          {doc.tags.length > 8 && (
            <span className="text-[9px] text-zinc-600">+{doc.tags.length - 8}</span>
          )}
        </div>
      )}
    </button>
  );
}

function DocViewer({ doc }: { doc: UploadedDoc }) {
  const noop = () => {};
  const empty = new Set<string>();
  if (doc.payload.kind === 'pdf') {
    return (
      <PdfViewer
        url={`/api/uploads/${encodeURIComponent(doc.filename)}`}
        bboxes={[]}
        highlightedTags={empty}
        onTagClick={noop}
      />
    );
  }
  if (doc.payload.kind === 'docx') {
    return (
      <DocxViewer
        html={doc.payload.html}
        highlightedAnchors={empty}
        onTagClick={noop}
      />
    );
  }
  return (
    <XlsxViewer
      sheets={doc.payload.sheets}
      highlightedTags={empty}
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
          knowledge graph.
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
