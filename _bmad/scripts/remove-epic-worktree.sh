#!/usr/bin/env bash
# Guarded teardown of an epic worktree ( /epic-cycle orchestrator mode ).
#
# Cross-platform: Git Bash on Windows, bash 3.2+ on macOS/Linux. Run from the MAIN
# checkout root, AFTER the epic merged (SC-4-P). Refuses while uncommitted or unpushed
# work exists anywhere in the worktree (superproject or mounted submodules) unless
# --force-abandon. Branch deletion is NOT done here and must happen AFTER this script
# (git refuses to delete a branch a mounted worktree still holds).
#
# usage: bash remove-epic-worktree.sh <epic-number> [worktree-base] [--force-abandon]
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: remove-epic-worktree.sh <epic-number> [worktree-base] [--force-abandon]" >&2
  exit 1
fi
EPIC="$1"; WT_BASE="${2:-.worktrees}"
FORCE_ABANDON="no"
for a in "$@"; do [ "$a" = "--force-abandon" ] && FORCE_ABANDON="yes"; done
WT_PATH="${WT_BASE}/epic-${EPIC}"

[ -e .git ] || { echo "ERROR: run from the main checkout root (no .git here)" >&2; exit 1; }
if [ ! -d "$WT_PATH" ]; then
  echo "ABSENT worktree=$WT_PATH (nothing to do)"
  exit 0
fi

# --- enumerate repos inside the worktree (superproject + initialized submodules) ---
REPOS="$WT_PATH"
if [ -f "$WT_PATH/.gitmodules" ]; then
  for sp in $(git config --file "$WT_PATH/.gitmodules" --get-regexp '^submodule\..*\.path$' | awk '{print $2}'); do
    [ -e "$WT_PATH/$sp/.git" ] && REPOS="$REPOS $WT_PATH/$sp"
  done
fi

# --- guards: nothing uncommitted, nothing unpushed ---------------------------------
BLOCKED="no"
for r in $REPOS; do
  d="$(git -C "$r" status --porcelain)"
  if [ -n "$d" ]; then
    BLOCKED="yes"; echo "UNCOMMITTED in $r:"; echo "$d"
  fi
  u="$(git -C "$r" log --oneline --branches --not --remotes 2>/dev/null || true)"
  if [ -n "$u" ]; then
    BLOCKED="yes"; echo "UNPUSHED in $r:"; echo "$u"
  fi
done
if [ "$BLOCKED" = "yes" ] && [ "$FORCE_ABANDON" != "yes" ]; then
  echo "REFUSED -- work would be lost. Push/commit first, or re-run with --force-abandon to discard." >&2
  exit 1
fi
[ "$BLOCKED" = "yes" ] && echo "WARN: --force-abandon -- discarding the work listed above" >&2

# --- remove (plain remove ALWAYS fails once submodules are present -> --force) ------
# Immediate retries cover transient Windows handle locks; a persistent failure means
# a process still holds files under the worktree -- close it and re-run.
OK="no"
for i in 1 2 3; do
  if git worktree remove --force "$WT_PATH" 2>/dev/null; then OK="yes"; break; fi
done
if [ "$OK" != "yes" ]; then
  # Windows: a lingering shell/editor handle makes the final rmdir fail AFTER git has already
  # deregistered the worktree and emptied it. Deregistered + empty is success with a warning,
  # not a failure (field report 2026-08-30) -- the directory is gitignored and git no longer tracks it.
  if ! git worktree list --porcelain | grep -qx "worktree $(cd "$WT_PATH" 2>/dev/null && pwd -W 2>/dev/null || echo "$WT_PATH")" \
     && [ -z "$(find "$WT_PATH" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
    echo "WARN: worktree deregistered and empty; the directory $WT_PATH is held open by another process and will be removed when it is released" >&2
    OK="yes"
  else
    echo "ERROR: worktree remove --force failed after retries (open handles under $WT_PATH? close editors/shells there and re-run)" >&2
    exit 1
  fi
fi

# --- prune per-submodule worktree registrations in the main checkout ----------------
if [ -f .gitmodules ]; then
  for sp in $(git config --file .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}'); do
    [ -e "$sp/.git" ] && git -C "$sp" worktree prune
  done
fi
git worktree prune
echo "REMOVED worktree=$WT_PATH (branches NOT deleted -- delete them now that the mount is gone)"
