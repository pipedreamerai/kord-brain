import { PDFDocument } from 'pdf-lib';
import { tagRegex } from '../tagRegex';

export type PdfPageInfo = { number: number; width: number; height: number };

export type PdfDocInfo = {
  pages: PdfPageInfo[];
  /** Distinct tags found anywhere in the document text layer. */
  tags: string[];
  /** Page-keyed text content (best-effort; may be empty if extraction fails). */
  pageText: Record<number, string>;
};

export async function loadPdf(buf: Buffer): Promise<PdfDocInfo> {
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

  return { pages, tags: [...tagSet].sort(), pageText };
}
