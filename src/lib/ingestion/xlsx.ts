import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { isTag, type Tag } from '../tags';

export type XlsxSheet = {
  name: string;
  header: string[];
  rows: string[][];
};

export type XlsxTagRow = {
  tag: Tag;
  sheet: string;
  rowIndex: number; // 0-based, relative to first data row (after header)
  values: string[];
};

export type XlsxDocInfo = {
  filename: string;
  sheets: XlsxSheet[];
  tagRows: XlsxTagRow[];
};

export async function loadXlsx(samplesDir: string, filename: string): Promise<XlsxDocInfo> {
  const buf = await readFile(path.join(samplesDir, filename));
  const wb = XLSX.read(buf, { type: 'buffer' });

  const sheets: XlsxSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
    const [headerRow = [], ...rest] = aoa;
    return {
      name,
      header: (headerRow as unknown[]).map((c) => (c == null ? '' : String(c))),
      rows: (rest as unknown[][]).map((row) => row.map((c) => (c == null ? '' : String(c)))),
    };
  });

  const tagRows: XlsxTagRow[] = [];
  for (const sheet of sheets) {
    sheet.rows.forEach((row, i) => {
      const first = row[0];
      if (first && isTag(first)) {
        tagRows.push({ tag: first, sheet: sheet.name, rowIndex: i, values: row });
      }
    });
  }

  return { filename, sheets, tagRows };
}
