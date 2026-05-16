// Predev preflight: ensures the gbrain sidecar is ready before starting Next.js.
// If gbrain is missing or unseeded, runs setup.sh automatically instead of failing.

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

function gbrainReady() {
  try {
    const out = execFileSync('gbrain', ['list', '-n', '1'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    return out.split('\n').some(line => line.trim() && !line.startsWith('[ai.gateway]'));
  } catch {
    return false;
  }
}

if (!gbrainReady()) {
  log('gbrain not ready — running setup (this is automatic on first run)...');
  const result = spawnSync('bash', [SETUP_SH], { stdio: 'inherit', env });
  if (result.status !== 0) {
    fail('setup.sh failed — review errors above, then re-run: pnpm dev');
  }
  if (!gbrainReady()) {
    fail('gbrain still not ready after setup — review errors above.');
  }
}
