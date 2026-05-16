// Predev preflight: ensures the gbrain CLI and the pdf-extractor sidecar are
// reachable before starting Next.js. If gbrain is missing, runs setup.sh.
// If the pdf-extractor sidecar isn't up, runs `docker compose up -d pdf-extractor`.

import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP_SH = resolve(__dirname, 'setup.sh');
const REPO_ROOT = resolve(__dirname, '..');

const BUN_BIN_DIR = process.env.BUN_BIN_DIR ?? `${homedir()}/.bun/bin`;
const env = { ...process.env, PATH: `${BUN_BIN_DIR}:${process.env.PATH ?? ''}` };

const PDF_EXTRACTOR_URL =
  process.env.KORD_PDF_EXTRACTOR_URL ?? 'http://127.0.0.1:8765';

function log(msg) {
  process.stdout.write(`\x1b[1;36m[preflight]\x1b[0m ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`\x1b[1;33m[preflight]\x1b[0m ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`\n\x1b[1;31m[preflight]\x1b[0m ${msg}\n\n`);
  process.exit(1);
}

function gbrainReachable() {
  try {
    // `stats` succeeds even on an empty brain — that's the right reachability probe.
    execFileSync('gbrain', ['stats'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

async function pdfExtractorReachable() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${PDF_EXTRACTOR_URL}/healthz`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

function dockerAvailable() {
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return r.status === 0;
}

async function waitForPdfExtractor(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pdfExtractorReachable()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (!gbrainReachable()) {
  log('gbrain not reachable — running setup (this is automatic on first run)...');
  const result = spawnSync('bash', [SETUP_SH], { stdio: 'inherit', env });
  if (result.status !== 0) {
    fail('setup.sh failed — review errors above, then re-run: pnpm dev');
  }
  if (!gbrainReachable()) {
    fail('gbrain still not reachable after setup — review errors above.');
  }
}

if (!(await pdfExtractorReachable())) {
  if (!dockerAvailable()) {
    warn(
      `pdf-extractor sidecar not reachable at ${PDF_EXTRACTOR_URL} and docker is unavailable. ` +
        `PDF uploads will fail until you start the sidecar — see services/pdf-extractor/.`,
    );
  } else {
    log('pdf-extractor sidecar not reachable — starting via docker compose...');
    const up = spawnSync(
      'docker',
      ['compose', 'up', '-d', '--build', 'pdf-extractor'],
      { stdio: 'inherit', cwd: REPO_ROOT },
    );
    if (up.status !== 0) {
      fail('docker compose up pdf-extractor failed — review errors above.');
    }
    if (!(await waitForPdfExtractor())) {
      fail(`pdf-extractor still not reachable at ${PDF_EXTRACTOR_URL} after 30s.`);
    }
    log('pdf-extractor ready.');
  }
}
