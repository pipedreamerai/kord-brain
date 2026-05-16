import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPdf } from '../src/lib/ingestion/pdf';

const DEFAULT_DIR = path.resolve('uploads');

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error('AI_GATEWAY_API_KEY not set — pass it via --env-file=.env.local');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const files =
    args.length > 0
      ? args
      : ['PID.pdf', 'Instrument_List.pdf', 'GA_Drawing.pdf'].map((n) =>
          path.join(DEFAULT_DIR, n),
        );

  for (const arg of files) {
    const file = path.isAbsolute(arg) ? arg : path.resolve(arg);
    const name = path.basename(file);
    const buf = await readFile(file);
    const t0 = Date.now();
    const info = await loadPdf(buf, { filename: name });
    const ms = Date.now() - t0;
    console.log(
      `\n=== ${name} (${(buf.byteLength / 1024).toFixed(0)} KB, ${ms} ms) ===`,
    );
    console.log(`source: ${info.tagSource}, pages: ${info.pages.length}, tags: ${info.tags.length}`);
    console.log(`sample: ${info.tags.slice(0, 20).join(', ')}${info.tags.length > 20 ? ', ...' : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
