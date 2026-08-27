#!/usr/bin/env bash
# Provision a submodule-aware git worktree for one epic ( /epic-cycle orchestrator mode ).
#
# Cross-platform: Git Bash on Windows, bash 3.2+ on macOS/Linux. Run from the MAIN
# checkout root. Idempotent: re-running for an existing, correctly branched worktree
# reports EXISTS and exits 0.
#
# Modified submodules are mounted as WORKTREES OF THE MAIN CHECKOUT'S SUBMODULE CLONES
# at the gitlink path (shared object store; commits survive teardown; branch-exclusivity
# mutex prevents two epics claiming one submodule branch). Read-only submodules get a
# plain `submodule update --init`.
#
# usage: bash new-epic-worktree.sh <epic-number> <ticket> [modified-submodules-csv] [worktree-base] [feature-branch]
#   e.g. bash _bmad/scripts/new-epic-worktree.sh 3 PROJ-1 "textkit,src/tablekit"
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: new-epic-worktree.sh <epic-number> <ticket> [modified-submodules-csv] [worktree-base] [feature-branch]" >&2
  exit 1
fi
EPIC="$1"; TICKET="$2"; MOD_CSV="${3:-}"; WT_BASE="${4:-.worktrees}"; FEATURE="${5:-}"
EPIC_BRANCH="${TICKET}-epic${EPIC}"
WT_PATH="${WT_BASE}/epic-${EPIC}"

[ -e .git ] || { echo "ERROR: run from the main checkout root (no .git here)" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    if [ "$(git config --get core.longpaths || true)" != "true" ]; then
      echo "WARN: core.longpaths is not true; deep submodule gitdirs may exceed MAX_PATH" >&2
    fi ;;
esac

# Relative URLs misresolve inside linked worktrees (pilot lesson, commit 964b9c8): warn early.
ORIGIN_URL="$(git config --get remote.origin.url || true)"
case "$ORIGIN_URL" in
  ../*|./*) echo "WARN: remote.origin.url is a relative path ('$ORIGIN_URL'); submodule init inside worktrees may misresolve. Absolutize it." >&2 ;;
esac
if [ -f .gitmodules ]; then
  for u in $(git config --file .gitmodules --get-regexp '^submodule\..*\.url$' 2>/dev/null | awk '{print $2}'); do
    case "$u" in
      ../*|./*) echo "WARN: .gitmodules has relative URL '$u'; read-only submodule init inside worktrees may misresolve. Absolutize it (pilot fix 964b9c8)." >&2 ;;
    esac
  done
fi

SUBS=""
if [ -f .gitmodules ]; then
  SUBS="$(git config --file .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')"
fi

MODS=()
if [ -n "$MOD_CSV" ]; then
  IFS=',' read -r -a MODS <<< "$MOD_CSV"
fi
for m in "${MODS[@]:-}"; do
  [ -z "$m" ] && continue
  printf '%s\n' $SUBS | grep -qx "$m" || { echo "ERROR: '$m' is not a submodule path in .gitmodules" >&2; exit 1; }
done

is_modified() {
  local q="$1" x
  for x in "${MODS[@]:-}"; do [ "$x" = "$q" ] && return 0; done
  return 1
}

# --- idempotent resume (checked BEFORE the dirty gate so re-runs always resolve) ---
# On resume we do NOT exit early: a prior run may have died mid-provisioning, so we
# fall through to the submodule steps (each has its own already-done guard) + verify.
RESUME="no"
if [ -d "$WT_PATH" ]; then
  cur="$(git -C "$WT_PATH" branch --show-current)"
  if [ "$cur" = "$EPIC_BRANCH" ]; then
    RESUME="yes"
    echo "EXISTS worktree=$WT_PATH branch=$EPIC_BRANCH (resuming provisioning checks)"
  else
    echo "ERROR: worktree $WT_PATH exists but is on '$cur', expected '$EPIC_BRANCH'. Resolve manually." >&2
    exit 1
  fi
fi

# Clean-tree gate. The worktree base is excluded: it is normally gitignored, but other
# epics' live worktrees must never read as dirt even when the ignore line is missing.
DIRT="$(git status --short -- . ":(exclude)$WT_BASE")"
[ -z "$DIRT" ] || { echo "ERROR: main checkout is dirty; commit or stash first" >&2; echo "$DIRT" >&2; exit 1; }
for sp in $SUBS; do
  if [ -e "$sp/.git" ]; then
    [ -z "$(git -C "$sp" status --short)" ] || { echo "ERROR: submodule '$sp' is dirty; clean it first" >&2; exit 1; }
  fi
done

# --- superproject worktree ------------------------------------------------------
if [ "$RESUME" != "yes" ]; then
  [ -n "$FEATURE" ] || FEATURE="$(git branch --show-current)"
  if git show-ref --verify --quiet "refs/heads/$EPIC_BRANCH"; then
    git worktree add "$WT_PATH" "$EPIC_BRANCH"
  else
    git worktree add "$WT_PATH" -b "$EPIC_BRANCH" "$FEATURE"
    git -C "$WT_PATH" push -u origin "$EPIC_BRANCH"
  fi
fi
ABS_WT="$(cd "$WT_PATH" && pwd)"

# --- submodules (each step guarded so resume completes partial provisioning) ------
for sp in $SUBS; do
  if is_modified "$sp"; then
    # gitlink-path mount: worktree of the MAIN checkout's submodule clone.
    if [ -e "$ABS_WT/$sp/.git" ]; then
      mcur="$(git -C "$ABS_WT/$sp" branch --show-current)"
      [ "$mcur" = "$EPIC_BRANCH" ] || { echo "ERROR: mounted submodule $sp is on '$mcur', expected '$EPIC_BRANCH'" >&2; exit 1; }
      continue
    fi
    # rmdir is deliberate -- the dir left by `worktree add` must be empty; refuse otherwise.
    [ -d "$ABS_WT/$sp" ] && rmdir "$ABS_WT/$sp"
    recorded="$(git rev-parse "${EPIC_BRANCH}:${sp}")"
    if git -C "$sp" show-ref --verify --quiet "refs/heads/$EPIC_BRANCH"; then
      git -C "$sp" worktree add "$ABS_WT/$sp" "$EPIC_BRANCH"
    else
      git -C "$sp" worktree add "$ABS_WT/$sp" -b "$EPIC_BRANCH" "$recorded"
      git -C "$ABS_WT/$sp" push -u origin "$EPIC_BRANCH"
    fi
  else
    # read-only: plain init at the recorded gitlink (skip if already initialized)
    [ -e "$ABS_WT/$sp/.git" ] && continue
    git -C "$WT_PATH" submodule update --init --recursive -- "$sp"
  fi
done

# --- verify ------------------------------------------------------------------------
if git -C "$WT_PATH" submodule status | grep -q '^-'; then
  echo "ERROR: uninitialized submodules remain:" >&2
  git -C "$WT_PATH" submodule status >&2
  exit 1
fi
mkdir -p "$WT_BASE/.coordination/locks"
echo "PROVISIONED worktree=$WT_PATH branch=$EPIC_BRANCH modified_submodules=${MOD_CSV:-'(none)'}"
git -C "$WT_PATH" submodule status | sed 's/^/  submodule: /'
