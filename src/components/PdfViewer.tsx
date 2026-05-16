'use client';

import { useEffect, useRef, useState } from 'react';

export type PdfBboxEntry = {
  tag: string;
  page: number;
  bbox: [number, number, number, number];
  note?: string;
};

type Props = {
  url: string;
  bboxes: PdfBboxEntry[];
  highlightedTags: Set<string>;
  onTagClick: (tag: string) => void;
};

type Dims = {
  cssWidth: number;
  cssHeight: number;
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
};

export function PdfViewer({ url, bboxes, highlightedTags, onTagClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDims(null);

    async function render() {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper) return;

      try {
        // Browser-only import: pdfjs-dist uses DOMMatrix at module init
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const pdf = await pdfjs.getDocument(url).promise;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = wrapper.parentElement?.clientWidth ?? 800;
        const targetWidth = Math.min(containerWidth - 32, 1100);
        const scale = targetWidth / baseViewport.width;
        const scaled = page.getViewport({ scale });

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(scaled.width * dpr);
        canvas.height = Math.floor(scaled.height * dpr);
        canvas.style.width = `${scaled.width}px`;
        canvas.style.height = `${scaled.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2D context available');
        ctx.scale(dpr, dpr);

        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        if (cancelled) return;

        setDims({
          cssWidth: scaled.width,
          cssHeight: scaled.height,
          pdfWidth: baseViewport.width,
          pdfHeight: baseViewport.height,
          scale,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    render();
    return () => { cancelled = true; };
  }, [url]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!dims) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pdfX = x / dims.scale;
    const pdfY = (dims.cssHeight - y) / dims.scale;
    for (const b of bboxes) {
      if (b.page !== 1) continue;
      const [x0, y0, x1, y1] = b.bbox;
      if (pdfX >= x0 && pdfX <= x1 && pdfY >= y0 && pdfY <= y1) {
        onTagClick(b.tag);
        return;
      }
    }
  }

  return (
    <div ref={wrapperRef} className="flex justify-center p-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">
          PDF render failed: {error}
        </div>
      )}
      <div
        className="relative shadow-md border border-zinc-200 bg-white cursor-pointer"
        style={dims ? { width: dims.cssWidth, height: dims.cssHeight } : { width: 600, height: 776 }}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className="block" />
        {dims && bboxes
          .filter((b) => b.page === 1)
          .map((b, i) => {
            const [x0, y0, x1, y1] = b.bbox;
            const left = x0 * dims.scale;
            const top = dims.cssHeight - y1 * dims.scale;
            const width = (x1 - x0) * dims.scale;
            const height = (y1 - y0) * dims.scale;
            const highlighted = highlightedTags.has(b.tag);
            return (
              <div
                key={`${b.tag}-${b.page}-${i}`}
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
    </div>
  );
}
