#!/usr/bin/env bash
#
# Idempotent setup for the kord-brain demo.
#
# Brings up the gbrain sidecar a teammate needs to run `pnpm dev`:
#   1. Bun (>= 1.3.10) — checked, not auto-installed
#   2. gbrain CLI       — git-cloned and `bun link`ed if missing
#   3. PGLite brain     — `gbrain init` if not already initialized
#   4. Seed content     — `gbrain import samples/gbrain-seed/`
#   5. Health check     — `gbrain doctor --fast`
#
# Re-running is safe; each step skips if already satisfied.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_DIR="$REPO_ROOT/samples/gbrain-seed"
GBRAIN_REPO="${GBRAIN_REPO:-https://github.com/garrytan/gbrain.git}"
GBRAIN_SRC="${GBRAIN_SRC:-$HOME/.cache/kord-brain/gbrain}"

log() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; exit 1; }

# 1. Bun -----------------------------------------------------------------------
if [ -x "$HOME/.bun/bin/bun" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi
if ! command -v bun >/dev/null 2>&1; then
  die "Bun is not installed. Install it and re-run: pnpm setup

    curl -fsSL https://bun.sh/install | bash

Then open a new shell so ~/.bun/bin is on PATH."
fi
BUN_VERSION="$(bun --version)"
log "Bun $BUN_VERSION detected."

# 2. gbrain CLI ----------------------------------------------------------------
if ! command -v gbrain >/dev/null 2>&1; then
  log "gbrain CLI not on PATH. Installing from $GBRAIN_REPO..."
  mkdir -p "$(dirname "$GBRAIN_SRC")"
  if [ ! -d "$GBRAIN_SRC/.git" ]; then
    git clone "$GBRAIN_REPO" "$GBRAIN_SRC"
  else
    log "Existing checkout at $GBRAIN_SRC — pulling latest."
    git -C "$GBRAIN_SRC" pull --ff-only
  fi
  (cd "$GBRAIN_SRC" && bun install && bun link)
fi
GBRAIN_VERSION="$(gbrain --version 2>/dev/null || gbrain --help 2>&1 | head -1)"
log "gbrain ready ($GBRAIN_VERSION)."

# 3. Init brain (PGLite default, no Postgres needed) ---------------------------
if [ ! -f "$HOME/.gbrain/config.json" ]; then
  log "Initializing gbrain (PGLite engine, ~/.gbrain/brain.pglite)..."
  gbrain init
else
  log "gbrain already initialized at ~/.gbrain — skipping init."
fi

# 4. Seed content --------------------------------------------------------------
if [ -d "$SEED_DIR" ] && [ -n "$(ls -A "$SEED_DIR" 2>/dev/null)" ]; then
  log "Importing seed pages from samples/gbrain-seed/..."
  gbrain import "$SEED_DIR"
else
  warn "No seed content at $SEED_DIR — skipping import."
fi

# 5. Health check --------------------------------------------------------------
log "Running gbrain doctor..."
gbrain doctor --fast || warn "doctor reported issues — review above."

log "Done. Start the app with: pnpm dev"
