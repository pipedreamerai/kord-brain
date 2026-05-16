import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = resolve(projectRoot, 'public', 'pdf.worker.min.mjs');

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`✓ Copied PDF worker → public/pdf.worker.min.mjs`);
