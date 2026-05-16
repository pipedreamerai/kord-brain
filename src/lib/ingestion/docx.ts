import mammoth from 'mammoth';
import { tagRegex } from '../tagRegex';

export type DocxOccurrence = {
  tag: string;
  anchorId: string;
  snippet: string;
};

export type DocxDocInfo = {
  html: string;
  text: string;
  tags: string[];
  occurrences: DocxOccurrence[];
};

export async function loadDocx(buf: Buffer): Promise<DocxDocInfo> {
  const { value: rawHtml } = await mammoth.convertToHtml({ buffer: buf });
  const { value: text } = await mammoth.extractRawText({ buffer: buf });

  const counters: Record<string, number> = {};
  const occurrences: DocxOccurrence[] = [];
  const regex = tagRegex();

  const wrapped = rawHtml.replace(regex, (match: string, ...args: unknown[]) => {
    const tag = match;
    const offset = args[args.length - 2] as number;
    counters[tag] = (counters[tag] ?? 0) + 1;
    const n = counters[tag];
    const anchorId = `tag-${tag.replace(/[^A-Za-z0-9]/g, '_')}-${n}`;
    occurrences.push({
      tag,
      anchorId,
      snippet: extractSnippet(rawHtml, offset, 120),
    });
    return `<mark id="${anchorId}" data-tag="${tag}" data-occurrence="${n}" class="kb-tag">${tag}</mark>`;
  });

  const tags = [...new Set(occurrences.map((o) => o.tag))].sort();

  return { html: wrapped, text: text.trim(), tags, occurrences };
}

function extractSnippet(html: string, offset: number, radius: number): string {
  const start = Math.max(0, offset - radius);
  const end = Math.min(html.length, offset + radius);
  return html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
