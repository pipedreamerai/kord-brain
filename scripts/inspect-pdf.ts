import { readFile } from 'node:fs/promises';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: inspect-pdf.ts <file.pdf>');
    process.exit(1);
  }
  const buf = await readFile(file);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;

  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();
    const counts: Record<string, number> = {};
    const opNames: Record<number, string> = Object.fromEntries(
      Object.entries((pdfjs as any).OPS).map(([k, v]) => [v as number, k]),
    );
    for (const fn of ops.fnArray) {
      const name = opNames[fn] ?? String(fn);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    console.log(`\n=== Page ${p} ===`);
    console.log(`total ops: ${ops.fnArray.length}`);
    for (const [name, n] of sorted.slice(0, 15)) {
      console.log(`  ${name.padEnd(28)} ${n}`);
    }
    // Inspect font dictionary to spot Type3 / custom encodings.
    const commons = await (page as any).commonObjs;
    const fonts: string[] = [];
    const objs = (commons as any)._objs ?? {};
    for (const key of Object.keys(objs)) {
      if (!key.startsWith('g_d')) continue;
      const data = objs[key]?.data;
      if (data?.name?.startsWith?.('g_') === false || data?.loadedName) {
        fonts.push(`${data.loadedName ?? key} type=${data.type ?? '?'} encoding=${data.toUnicode ? 'toUnicode' : 'none'}`);
      }
    }
    if (fonts.length) {
      console.log('fonts:');
      for (const f of fonts.slice(0, 8)) console.log(`  ${f}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
