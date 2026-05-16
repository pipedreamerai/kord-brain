import * as XLSX from 'xlsx';
import { tagRegex } from '../tagRegex';

export type XlsxSheet = {
  name: string;
  header: string[];
  rows: string[][];
};

export type XlsxTagRow = {
  tag: string;
  sheet: string;
  rowIndex: number;
  values: string[];
};

export type XlsxDocInfo = {
  sheets: XlsxSheet[];
  tags: string[];
  tagRows: XlsxTagRow[];
};

export async function loadXlsx(buf: Buffer): Promise<XlsxDocInfo> {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

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
  const tagSet = new Set<string>();

  for (const sheet of sheets) {
    sheet.rows.forEach((row, i) => {
      const regex = tagRegex();
      const rowText = row.join(' ');
      const found = rowText.match(regex);
      if (!found) return;
      for (const tag of found) tagSet.add(tag);
      const firstTag = found[0];
      tagRows.push({ tag: firstTag, sheet: sheet.name, rowIndex: i, values: row });
    });
  }

  return { sheets, tags: [...tagSet].sort(), tagRows };
}
