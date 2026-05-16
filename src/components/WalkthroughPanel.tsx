'use client';

import { useDemoStore } from '@/lib/store';
import { docBySlug } from '@/lib/docs';

export function WalkthroughPanel() {
  const highlights = useDemoStore((s) => s.highlights);

  return (
    <div className="p-4 flex flex-col h-full">
      <h2 className="text-sm font-semibold text-zinc-700 mb-1">Walkthrough</h2>
      <p className="text-[11px] text-zinc-500 mb-4 leading-snug">
        Phase 2 streams beats from{' '}
        <code className="text-[10px] bg-zinc-100 px-1 py-0.5 rounded">anthropic/claude-opus-4-7</code>{' '}
        via Vercel AI Gateway here. Phase 1 wires the highlight pipeline.
      </p>

      {highlights.length === 0 ? (
        <div className="text-[12px] text-zinc-500 italic leading-snug">
          Click a tag in any document, in the sidebar, or in the equipment list to highlight it
          across the document set.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-zinc-700 uppercase tracking-wide">
            Active highlights ({highlights.length})
          </div>
          {highlights.map((h, i) => {
            const meta = docBySlug(h.location.slug);
            return (
              <div
                key={i}
                className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] leading-tight"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold text-amber-900">{h.tag}</span>
                  <span className="text-zinc-500">in</span>
                  <span className="text-zinc-700 font-medium">{meta.displayName}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {h.location.kind === 'pdf' && (
                    <>
                      pdf · page {h.location.page} · bbox [
                      {h.location.bbox.map((n) => n.toFixed(0)).join(', ')}]
                      {h.location.note ? ` · ${h.location.note}` : ''}
                    </>
                  )}
                  {h.location.kind === 'docx' && (
                    <>docx · {h.location.anchorId}</>
                  )}
                  {h.location.kind === 'xlsx' && (
                    <>xlsx · {h.location.sheet} · row {h.location.rowIndex + 2}</>
                  )}
                </div>
                {h.location.kind === 'docx' && h.location.snippet && (
                  <div className="text-[10px] text-zinc-600 mt-1 italic line-clamp-2">
                    &hellip;{h.location.snippet}&hellip;
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
