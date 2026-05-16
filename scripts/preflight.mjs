// Predev preflight: confirms the gbrain sidecar is reachable before starting Next.js.
// Fails fast with a pointer to `pnpm setup` so the teammate isn't debugging a 500 in the browser.

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const BUN_BIN_DIR = process.env.BUN_BIN_DIR ?? `${homedir()}/.bun/bin`;
const env = { ...process.env, PATH: `${BUN_BIN_DIR}:${process.env.PATH ?? ''}` };

function fail(msg) {
  process.stderr.write(`\n\x1b[1;31m[preflight]\x1b[0m ${msg}\n  → Run: \x1b[1mpnpm setup\x1b[0m\n\n`);
  process.exit(1);
}

let out;
try {
  out = execFileSync('gbrain', ['list', '-n', '1'], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
} catch (e) {
  const detail = e.stderr?.toString?.().trim() || e.message;
  fail(`gbrain CLI not runnable: ${detail}`);
}

const hasPages = out.split('\n').some(line => line.trim() && !line.startsWith('[ai.gateway]'));
if (!hasPages) {
  fail('gbrain has no pages — seed import did not run.');
}
