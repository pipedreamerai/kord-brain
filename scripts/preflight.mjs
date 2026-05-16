// Predev preflight: ensures the gbrain sidecar is reachable before starting Next.js.
// If the binary is missing, runs setup.sh automatically. An empty brain is fine —
// content is pushed in on file upload.

import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP_SH = resolve(__dirname, 'setup.sh');

const BUN_BIN_DIR = process.env.BUN_BIN_DIR ?? `${homedir()}/.bun/bin`;
const env = { ...process.env, PATH: `${BUN_BIN_DIR}:${process.env.PATH ?? ''}` };

function log(msg) {
  process.stdout.write(`\x1b[1;36m[preflight]\x1b[0m ${msg}\n`);
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
