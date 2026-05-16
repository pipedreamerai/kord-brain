#!/usr/bin/env bash
#
# Thin permanent delegator — all logic lives in wt-impl.sh in the main repo root.
# This file never needs to change; update wt-impl.sh instead.
#
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
_GIT_COMMON="$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir 2>/dev/null || echo "")"
if [[ -n "$_GIT_COMMON" ]]; then
  REPO_ROOT="$(cd "$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir)" && cd .. && pwd)"
else
  REPO_ROOT="$SCRIPT_DIR"
fi
exec bash "$REPO_ROOT/wt-impl.sh" "$REPO_ROOT" "$@"
