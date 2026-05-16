'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist/types/src/display/api';

export type PdfBboxEntry = {
  tag: string;
  page: number;
  bbox: [number, number, number, number];
  note?: string;
};

type PageDims = {
  cssWidth: number;
  cssHeight: number;
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
};

type Props = {
  url: string;
  bboxes: PdfBboxEntry[];
  highlightedTags: Set<string>;
  onTagClick: (tag: string) => void;
};

export function PdfViewer({ url, bboxes, highlightedTags, onTagClick }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [pageDims, setPageDims] = useState<PageDims[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setError(null);
    setPageDims([]);

    async function render() {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        loadingTask = pdfjs.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const numPages = pdf.numPages;
        const dims: PageDims[] = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const containerWidth = wrapper.parentElement?.clientWidth ?? 800;
          const targetWidth = Math.min(containerWidth - 32, 1100);
          const scale = targetWidth / baseViewport.width;
          const scaled = page.getViewport({ scale });

          const dpr = window.devicePixelRatio || 1;
          const canvas = canvasRefs.current[pageNum - 1];
          if (!canvas) continue;

          canvas.width = Math.floor(scaled.width * dpr);
          canvas.height = Math.floor(scaled.height * dpr);
          canvas.style.width = `${scaled.width}px`;
          canvas.style.height = `${scaled.height}px`;

          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No 2D context available');
          ctx.scale(dpr, dpr);

          await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
          if (cancelled) return;

          dims.push({
            cssWidth: scaled.width,
            cssHeight: scaled.height,
            pdfWidth: baseViewport.width,
            pdfHeight: baseViewport.height,
            scale,
          });
        }

        if (!cancelled) setPageDims(dims);
      } catch (err) {
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    render();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url]);

  // We need to know numPages before rendering canvases, so we do a two-pass approach:
  // first fetch numPages, then render. Instead, we pre-allocate canvases up to a reasonable max
  // and let the effect populate only what's needed.
  // Simpler: render canvases after we know pageDims length; effect re-runs on url change.
  // The canvasRefs array is populated via the ref callback below.

  function handleClick(e: React.MouseEvent<HTMLDivElement>, pageIndex: number) {
    const dim = pageDims[pageIndex];
    if (!dim) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pdfX = x / dim.scale;
    const pdfY = (dim.cssHeight - y) / dim.scale;
    const pageNum = pageIndex + 1;
    for (const b of bboxes) {
      if (b.page !== pageNum) continue;
      const [x0, y0, x1, y1] = b.bbox;
      if (pdfX >= x0 && pdfX <= x1 && pdfY >= y0 && pdfY <= y1) {
        onTagClick(b.tag);
        return;
      }
    }
  }

  // Pre-allocate enough canvas slots. We render up to 50 pages.
  const maxPages = 50;

  return (
    <div ref={wrapperRef} className="flex flex-col items-center gap-2 p-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4 w-full">
          PDF render failed: {error}
        </div>
      )}
      {Array.from({ length: maxPages }, (_, i) => {
        const dim = pageDims[i];
        const pageNum = i + 1;
        const pageBboxes = bboxes.filter((b) => b.page === pageNum);
        return (
          <div
            key={i}
            className="relative shadow-md border border-zinc-200 bg-white cursor-pointer"
            style={
              dim
                ? { width: dim.cssWidth, height: dim.cssHeight }
                : { width: 0, height: 0, overflow: 'hidden' }
            }
            onClick={(e) => handleClick(e, i)}
          >
            <canvas
              ref={(el) => { canvasRefs.current[i] = el; }}
              className="block"
            />
            {dim &&
              pageBboxes.map((b, bi) => {
                const [x0, y0, x1, y1] = b.bbox;
                const left = x0 * dim.scale;
                const top = dim.cssHeight - y1 * dim.scale;
                const width = (x1 - x0) * dim.scale;
                const height = (y1 - y0) * dim.scale;
                const highlighted = highlightedTags.has(b.tag);
                return (
                  <div
                    key={`${b.tag}-${pageNum}-${bi}`}
                    title={`${b.tag}${b.note ? ' — ' + b.note : ''}`}
                    className={`absolute pointer-events-none transition-all duration-300 rounded-sm ${
                      highlighted
                        ? 'bg-amber-300/40 ring-2 ring-amber-500 shadow-lg shadow-amber-300/40'
                        : 'ring-1 ring-blue-400/30'
                    }`}
                    style={{ left, top, width, height }}
                  />
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
