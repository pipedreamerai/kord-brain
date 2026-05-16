import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { isTag, TAG_REGEX, type Tag } from '../tags';

export type DocxOccurrence = {
  tag: Tag;
  anchorId: string;
  snippet: string;
};

export type DocxDocInfo = {
  filename: string;
  html: string;
  occurrences: DocxOccurrence[];
};

export async function loadDocx(samplesDir: string, filename: string): Promise<DocxDocInfo> {
  const buf = await readFile(path.join(samplesDir, filename));
  // mammoth wants a Buffer in Node; types accept { buffer: Buffer }
  const { value: rawHtml } = await mammoth.convertToHtml({ buffer: buf });

  const counters: Record<string, number> = {};
  const occurrences: DocxOccurrence[] = [];

  // Reset regex state because TAG_REGEX is shared (g-flagged)
  const regex = new RegExp(TAG_REGEX.source, 'g');

  const wrapped = rawHtml.replace(regex, (match, _g1: string, offset: number) => {
    if (!isTag(match)) return match;
    const tag = match;
    counters[tag] = (counters[tag] ?? 0) + 1;
    const n = counters[tag];
    const anchorId = `tag-${tag}-${n}`;
    occurrences.push({
      tag,
      anchorId,
      snippet: extractSnippet(rawHtml, offset, 120),
    });
    return `<mark id="${anchorId}" data-tag="${tag}" data-occurrence="${n}" class="kb-tag">${tag}</mark>`;
  });

  return { filename, html: wrapped, occurrences };
}

function extractSnippet(html: string, offset: number, radius: number): string {
  const start = Math.max(0, offset - radius);
  const end = Math.min(html.length, offset + radius);
  return html
    .slice(start, end)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
