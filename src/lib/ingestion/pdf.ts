import { PDFDocument } from 'pdf-lib';
import { tagRegex } from '../tagRegex';
import { extractPdfTagsWithVision } from './pdf-vision';

export type PdfPageInfo = { number: number; width: number; height: number };

export type PdfTagSource = 'text-layer' | 'vision' | 'none';

export type PdfDocInfo = {
  pages: PdfPageInfo[];
  /** Distinct tags found in the document. */
  tags: string[];
  /** Page-keyed text content (best-effort; may be empty if extraction fails). */
  pageText: Record<number, string>;
  /** Where the tags came from — useful for logging and UI hints. */
  tagSource: PdfTagSource;
};

export async function loadPdf(
  buf: Buffer,
  opts: { filename?: string } = {},
): Promise<PdfDocInfo> {
  const pdf = await PDFDocument.load(new Uint8Array(buf));
  const pages: PdfPageInfo[] = pdf.getPages().map((p, i) => ({
    number: i + 1,
    width: p.getWidth(),
    height: p.getHeight(),
  }));

  const pageText: Record<number, string> = {};
  try {
    // Lazy-load to avoid worker-related side effects in Next bundling.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
    });
    const doc = await loadingTask.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? (it as { str: string }).str : ''))
        .join(' ');
      pageText[i] = text;
    }
  } catch {
    // Text extraction is best-effort; the doc still uploads.
  }

  const regex = tagRegex();
  const tagSet = new Set<string>();
  for (const text of Object.values(pageText)) {
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) {
      tagSet.add(m[0]);
    }
  }

  if (tagSet.size > 0) {
    return {
      pages,
      tags: [...tagSet].sort(),
      pageText,
      tagSource: 'text-layer',
    };
  }

  // Text layer was empty or unparseable — fall back to Claude vision.
  // Engineering drawings exported from CAD are usually raster-only.
  try {
    const vision = await extractPdfTagsWithVision(buf, opts);
    console.log(
      `[pdf-vision] ${opts.filename ?? '<pdf>'}: ${vision.tags.length} tags from ${vision.rawCount} raw (model=${vision.model})`,
    );
    return {
      pages,
      tags: vision.tags,
      pageText,
      tagSource: vision.tags.length > 0 ? 'vision' : 'none',
    };
  } catch (err) {
    console.warn(
      `[pdf-vision] failed for ${opts.filename ?? '<pdf>'}:`,
      err instanceof Error ? err.message : err,
    );
    return { pages, tags: [], pageText, tagSource: 'none' };
  }
}
