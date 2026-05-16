#!/usr/bin/env bash
#
# Implementation — always invoked by wt.sh in the main repo root.
# Never run this directly; use ./wt.sh instead.
#
#   ./wt.sh new        — new worktree + Graphite; Ghostty: dev right, shell below dev, Claude in this pane
#   ./wt.sh start [N]  — start-of-day: create N worktrees and tile them in Ghostty (N=2 or 4, default 4)
#   ./wt.sh sync       — from inside a worktree: gt sync + restack (never removes the worktree)
#   ./wt.sh kill [P …] — kill given ports (in parallel); with no args, kills the current worktree
#
set -euo pipefail

# This script is always exec'd by wt.sh with REPO_ROOT already resolved as $1.
REPO_ROOT="${1:?REPO_ROOT not passed}"
shift

WORKTREE_DIR="$REPO_ROOT/.claude/worktrees"
BASE_PORT=3001
MAX_PORT=3008

usage() {
  cat <<EOF
Usage: wt.sh <command>

  new          Worktree + deps + Graphite; starts dev server, splits Ghostty, runs Claude here
  start [N]    Create N worktrees (N=2 or 4, default 4), tile Ghostty, run Claude in each pane
  sync         From a worktree: gt sync + restack (never deletes the worktree)
  kill [P …]   Stop dev, remove worktree(s), delete branch(es). With no args: current worktree.
               With one or more port args: removes them in parallel.
EOF
  exit 1
}

infer_worktree_name() {
  local cwd
  cwd="$(pwd)"
  if [[ "$cwd" == "$WORKTREE_DIR/"* ]]; then
    echo "$cwd" | sed "s|$WORKTREE_DIR/||" | cut -d'/' -f1
  else
    echo ""
  fi
}

get_port() {
  local wt_path="$1"
  local port_file="$wt_path/.worktree-port"
  if [[ -f "$port_file" ]]; then
    cat "$port_file"
  else
    echo ""
  fi
}

is_port_in_use() {
  lsof -i :"$1" -sTCP:LISTEN &>/dev/null
}

kill_port() {
  local port="$1"
  if is_port_in_use "$port"; then
    echo "[wt] Stopping dev server on port $port"
    lsof -ti :"$port" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

find_free_port() {
  for port in $(seq "$BASE_PORT" "$MAX_PORT"); do
    local wt_path="$WORKTREE_DIR/$port"
    if [[ ! -d "$wt_path" ]] && ! is_port_in_use "$port"; then
      echo "$port"
      return
    fi
  done
  echo ""
}

# Echo the first N currently-free ports (no worktree dir, nothing listening),
# one per line. Returns non-zero if fewer than N are available.
find_free_ports() {
  local count="$1"
  local -a ports=()
  for port in $(seq "$BASE_PORT" "$MAX_PORT"); do
    local wt_path="$WORKTREE_DIR/$port"
    if [[ ! -d "$wt_path" ]] && ! is_port_in_use "$port"; then
      ports+=("$port")
      if [[ ${#ports[@]} -ge $count ]]; then
        break
      fi
    fi
  done
  if [[ ${#ports[@]} -lt $count ]]; then
    return 1
  fi
  printf '%s\n' "${ports[@]}"
}

remove_one_worktree() {
  local name="${1:?Missing worktree id}"
  local wt_path="$WORKTREE_DIR/$name"

  if [[ ! -d "$wt_path" ]]; then
    echo "[wt] Worktree '$name' not found."
    return 1
  fi

  local port
  port="$(get_port "$wt_path")"
  if [[ -n "$port" ]]; then
    kill_port "$port"
  fi

  local branch
  branch="$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

  echo "[wt] Removing worktree $name"
  git -C "$REPO_ROOT" worktree remove "$wt_path" --force 2>/dev/null || rm -rf "$wt_path"

  if [[ -n "$branch" && "$branch" != "HEAD" && "$branch" != "main" ]]; then
    if git -C "$REPO_ROOT" rev-parse --verify "$branch" &>/dev/null; then
      git -C "$REPO_ROOT" branch -D "$branch" 2>/dev/null && echo "  Deleted branch '$branch'" || true
    fi
  fi

  echo "[wt] Worktree $name removed"
}

# Capture the ID of the current (focused) Ghostty terminal before long-running ops.
# Terminals don't expose a tty, but id is stable and unique across panes.
get_origin_term_id() {
  osascript -e 'tell application "Ghostty" to get id of focused terminal of selected tab of front window as text' 2>/dev/null || echo ""
}

ghostty_select_term_script() {
  local target_term_id="$1"
  cat <<EOF
      set currentTerm to missing value
      if "$target_term_id" is not "" then
        repeat with w in every window
          repeat with t in every tab of w
            repeat with term in every terminal of t
              if (id of term as text) is "$target_term_id" then
                set currentTerm to term
              end if
            end repeat
          end repeat
        end repeat
      end if
      if currentTerm is missing value then
        set currentTerm to focused terminal of selected tab of front window
      end if
EOF
}

# Splits the given Ghostty term right (for `pnpm dev`) and then splits that new
# pane down (for a plain shell). Used by both `new` and each pane spawned by
# `start` so every worktree gets the same 3-pane layout (claude | dev / shell).
split_dev_and_shell() {
  local target_term_id="${1:?Missing target term id}"
  local wt_path="${2:?Missing worktree path}"
  local port="${3:?Missing port}"

  osascript -e "
    tell application \"Ghostty\"
$(ghostty_select_term_script "$target_term_id")
      set devTerm to split currentTerm direction right
      input text \"cd $wt_path && PORT=$port pnpm dev\" & return to devTerm
      delay 0.5
      set plainTerm to split devTerm direction down
      input text \"cd $wt_path\" & return to plainTerm
    end tell
  "
}

# Create one worktree: branch, env, deps, Graphite. Echoes the worktree path on stdout;
# all human-readable output goes to stderr so callers can capture the path cleanly.
# Optional first arg: a specific port to use (skips auto-assignment).
create_worktree() {
  local port="${1:-}"

  if [[ -z "$port" ]]; then
    port="$(find_free_port)"
    if [[ -z "$port" ]]; then
      echo >&2 "[wt] No free port in range $BASE_PORT-$MAX_PORT (all in use or directories exist)."
      return 1
    fi
  fi

  local wt_path="$WORKTREE_DIR/$port"
  mkdir -p "$(dirname "$wt_path")"

  local prefix
  prefix="$(gt user branch-prefix 2>/dev/null | sed -n 's/^branch-prefix is set to "\(.*\)"$/\1/p')"
  prefix="${prefix%/}"
  if [[ -z "$prefix" ]]; then
    echo >&2 "[wt] No Graphite branch-prefix set; run \`gt user branch-prefix <prefix>\` to configure one."
    return 1
  fi
  local branch_name="${prefix}/${port}"
  echo >&2 "Creating worktree on port $port, branch $branch_name..."
  git -C "$REPO_ROOT" worktree add "$wt_path" -b "$branch_name" main >&2

  if [[ -f "$REPO_ROOT/.env.local" ]]; then
    grep -v '^NEXT_PUBLIC_APP_URL=' "$REPO_ROOT/.env.local" > "$wt_path/.env.local" || true
    echo "NEXT_PUBLIC_APP_URL=http://localhost:$port" >> "$wt_path/.env.local"
  else
    echo >&2 "Warning: no .env.local in repo root"
    echo "NEXT_PUBLIC_APP_URL=http://localhost:$port" > "$wt_path/.env.local"
  fi

  echo "$port" > "$wt_path/.worktree-port"

  echo >&2 "[wt] Installing dependencies"
  (cd "$wt_path" && pnpm install --frozen-lockfile) >&2

  echo >&2 "[wt] Tracking branch with Graphite"
  (cd "$wt_path" && gt track --parent main) >&2

  echo "$wt_path"
}

cmd_new() {
  local origin_term_id
  origin_term_id="$(get_origin_term_id)"

  local wt_path
  wt_path="$(create_worktree)" || exit 1
  local port
  port="$(get_port "$wt_path")"

  echo >&2 "[wt] Splitting Ghostty"
  split_dev_and_shell "$origin_term_id" "$wt_path" "$port"

  cd "$wt_path" && exec claude
}

cmd_start() {
  local count="${1:-4}"

  if [[ "$count" != "2" && "$count" != "4" ]]; then
    echo >&2 "[wt] start: only count=2 or count=4 supported (got: $count)"
    exit 1
  fi

  # Reserve N ports up front so we can split the panes immediately and let each
  # pane do its own create_worktree + pnpm install in parallel. Worktree dirs
  # don't exist yet at this point, but find_free_ports skips ports that are
  # already listening too, so two concurrent `wt.sh start` calls would still
  # collide — that's fine, this isn't expected to be invoked concurrently.
  local -a ports=()
  local p
  while IFS= read -r p; do
    [[ -n "$p" ]] && ports+=("$p")
  done < <(find_free_ports "$count")
  if [[ ${#ports[@]} -lt $count ]]; then
    echo >&2 "[wt] Could not find $count free ports in range $BASE_PORT-$MAX_PORT"
    exit 1
  fi

  local origin_term_id
  origin_term_id="$(get_origin_term_id)"

  echo >&2 "[wt] Tiling Ghostty into $count panes (ports: ${ports[*]})"

  # The new panes invoke wt.sh _init-port <port> <term_id>, which creates the
  # worktree for that specific port, splits its own pane into dev+shell, and
  # then execs claude. Splitting before any creation means all N installs run
  # concurrently across panes. We pass each spawned pane its own Ghostty term
  # id because by the time `_init-port` runs, focus has likely moved to the
  # last-created split — get_origin_term_id would give the wrong terminal.
  local self="$REPO_ROOT/wt.sh"

  if [[ "$count" == "2" ]]; then
    osascript -e "
      tell application \"Ghostty\"
$(ghostty_select_term_script "$origin_term_id")
        set rightTerm to split currentTerm direction right
        set rightId to id of rightTerm as text
        delay 0.5
        input text \"$self _init-port ${ports[1]} \" & rightId & return to rightTerm
      end tell
    "
  else
    osascript -e "
      tell application \"Ghostty\"
$(ghostty_select_term_script "$origin_term_id")
        set trTerm to split currentTerm direction right
        set trId to id of trTerm as text
        delay 0.5
        set blTerm to split currentTerm direction down
        set blId to id of blTerm as text
        delay 0.5
        set brTerm to split trTerm direction down
        set brId to id of brTerm as text
        delay 0.5
        input text \"$self _init-port ${ports[1]} \" & trId & return to trTerm
        input text \"$self _init-port ${ports[2]} \" & blId & return to blTerm
        input text \"$self _init-port ${ports[3]} \" & brId & return to brTerm
      end tell
    "
  fi

  # Origin pane runs its own creation, splits for dev+shell like `new` does,
  # then execs claude. Runs concurrently with the spawned panes above.
  local wt_path
  wt_path="$(create_worktree "${ports[0]}")" || exit 1
  echo >&2 "[wt] Splitting Ghostty"
  split_dev_and_shell "$origin_term_id" "$wt_path" "${ports[0]}"
  cd "$wt_path" && exec claude
}

# Internal: invoked by spawned panes during `wt.sh start`. Creates the worktree
# for a specific pre-assigned port, splits this pane into dev+shell to match
# the `new` layout, then execs claude. The second arg is the Ghostty term id
# of this pane, captured by `start` at split time — focus may have moved off
# this pane by now, so we can't rely on get_origin_term_id. Not in usage.
cmd_init_port() {
  local port="${1:?[wt] _init-port requires a port}"
  local target_term_id="${2:-}"
  if [[ -z "$target_term_id" ]]; then
    target_term_id="$(get_origin_term_id)"
  fi
  local wt_path
  wt_path="$(create_worktree "$port")" || exit 1
  echo >&2 "[wt] Splitting Ghostty"
  split_dev_and_shell "$target_term_id" "$wt_path" "$port"
  cd "$wt_path" && exec claude
}

cmd_sync() {
  local name
  name="$(infer_worktree_name)"
  if [[ -z "$name" ]]; then
    echo >&2 "[wt] Run this from inside a worktree under $WORKTREE_DIR/<port>/"
    exit 1
  fi

  local wt_path="$WORKTREE_DIR/$name"
  if [[ ! -d "$wt_path" ]]; then
    echo >&2 "[wt] Worktree '$name' not found."
    exit 1
  fi

  echo "[wt] Syncing trunk with Graphite"
  (cd "$REPO_ROOT" && gt sync)

  echo "[wt] Restacking worktree"
  (cd "$wt_path" && gt restack) || true

  echo "[wt] Sync complete"
}

cmd_kill() {
  # Multi-target mode: any args are treated as worktree ids/ports and removed
  # in parallel. Output from concurrent removals will interleave; each line is
  # prefixed with its worktree name so it's still readable.
  if [[ $# -gt 0 ]]; then
    local -a pids=()
    local arg
    for arg in "$@"; do
      remove_one_worktree "$arg" &
      pids+=($!)
    done
    local pid rc=0
    for pid in "${pids[@]}"; do
      wait "$pid" || rc=$?
    done
    exit "$rc"
  fi

  local name
  name="$(infer_worktree_name)"
  if [[ -z "$name" ]]; then
    echo >&2 "[wt] Run this from inside a worktree under $WORKTREE_DIR/<port>/, or pass one or more ports as args"
    exit 1
  fi

  remove_one_worktree "$name"
}

# --- Main ---
[[ $# -ge 1 ]] || usage

case "$1" in
  new)         cmd_new ;;
  start)       shift; cmd_start "$@" ;;
  _init-port)  shift; cmd_init_port "$@" ;;
  sync)        cmd_sync ;;
  kill)        shift; cmd_kill "$@" ;;
  *)           usage ;;
esac
