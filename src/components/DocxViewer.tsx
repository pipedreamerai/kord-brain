'use client';

import { useEffect, useRef } from 'react';

type Props = {
  html: string;
  highlightedAnchors: Set<string>;
  onTagClick: (tag: string, anchorId: string) => void;
};

export function DocxViewer({ html, highlightedAnchors, onTagClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let firstHighlighted: HTMLElement | null = null;
    el.querySelectorAll<HTMLElement>('mark[data-tag]').forEach((m) => {
      const highlighted = highlightedAnchors.has(m.id);
      m.classList.toggle('kb-tag-active', highlighted);
      if (highlighted && !firstHighlighted) firstHighlighted = m;
    });
    if (firstHighlighted) (firstHighlighted as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedAnchors, html]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const mark = target.closest('mark[data-tag]') as HTMLElement | null;
    if (!mark) return;
    const tag = mark.dataset.tag;
    if (!tag) return;
    onTagClick(tag, mark.id);
  }

  return (
    <div className="p-6 flex justify-center">
      <div
        ref={ref}
        onClick={handleClick}
        className="kb-docx max-w-3xl w-full bg-white shadow-md border border-zinc-200 px-10 py-8"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
