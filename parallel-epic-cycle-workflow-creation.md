# Parallel Epic Cycle — Installation Kit

**Kit-Version:** 2026-08-27.1

**Requires BMAD Method v6.11.0 or later and base kit ≥ 2026-08-27.1** (the v6.11 `bmad-build-auto` pipeline). Runners spawn `bmad-build-auto` stage agents, which spawn their own subagents — depth-3 nesting (orchestrator → runner → build-auto → handoff/review) verified on Claude Code 2026-08-26.

A self-contained kit that upgrades an installed `/epic-cycle` workflow with **parallel epic execution**: orchestrator/runner modes, submodule-aware git worktrees, a runtime-lock protocol, and a serialized merge queue. Run this as a Claude Code session — the session reads each step, performs the indicated file operations, and verifies the result.

Design rationale: `docs/bmad-6.11-refactor-proposal.md` §4.10 in the authoring repo (the original `parallel-epic-cycle-design.md` is not published). Mechanics verified by Phase-0 spikes on 2026-07-09 (git 2.51 on Windows 11; nested subagents; SendMessage-resume; gitlink-path submodule worktrees) and 2026-08-26 (depth-3 nesting).

## Prerequisites

**The base kit must already be installed** (`epic-cycle-workflow-creation.md`): this kit patches `.claude/commands/epic-cycle.md` at anchors the base kit writes verbatim, and appends to `_bmad/custom/skill-rules.md`. **You do not have to install it manually first** — Step 1a below detects a missing base kit and OFFERS to install it (and, optionally, the model-tier pass) before continuing, so this kit can be pointed at any fresh BMAD project and chain its own prerequisites with your consent. Canonical install order on a fresh project:

1. `npx bmad-method install` (BMAD ≥ 6.11, modules `core,bmm`, IDE `claude-code`) with `uv` on PATH
2. `epic-cycle-workflow-creation.md` (base kit — writes the command + `_bmad/custom` files)
3. (optional) the per-skill model-tier pass (`skill-optimization-prompt.md`) — runs AFTER the base kit because it also pins `model: opus` onto the now-existing `.claude/commands/epic-cycle.md`
4. **this kit**

Re-running the base kit later overwrites `.claude/commands/epic-cycle.md`, which removes both the model pin and this kit's patches — re-run steps 3 and 4 afterwards (all steps are idempotent via grep-guards).

## What this installs

| File | Action | Purpose |
| --- | --- | --- |
| `_bmad/custom/parallel.yaml` | create | Per-project parallel-execution config |
| `_bmad/scripts/new-epic-worktree.sh` | create | Submodule-aware epic worktree provisioning (cross-platform bash) |
| `_bmad/scripts/remove-epic-worktree.sh` | create | Guarded worktree teardown (cross-platform bash) |
| `_bmad/custom/skill-rules.md` | append | Rules 10–12 (submodule discipline, footprint discipline, runtime lock) — Rules 13–17 come from the base kit |
| `.claude/commands/epic-cycle.md` | patch (6 edits) | Mode Resolution, Parallel Orchestration + Runner-Mode Deltas, SC-8 addendum, anti-pattern revisions, permission-mode note, stage-block hardening |
| `.gitignore` | append | `.worktrees/` |
| `.gitattributes` | append | union merge for `deferred-work.md` |

Not installed by this kit: `_bmad/custom/epic-dependencies.yaml` — generated per project by the orchestrator's dependency-analysis step and approved by the user at run time.

---

## Step 1: Detect prior state

Run these checks and report findings before writing anything:

```bash
# 0. BMAD itself present, at >= 6.11, with uv, and TRACKED (worktrees only contain tracked files)?
ls -d .claude/skills/bmad-* >/dev/null 2>&1 && echo BMAD-PRESENT || echo BMAD-ABSENT
grep -A1 "^installation:" _bmad/_config/manifest.yaml | grep version      # >= 6.11.0
uv --version                                                              # must succeed
test -f .claude/skills/bmad-build-auto/SKILL.md && echo BUILD-AUTO-PRESENT || echo BUILD-AUTO-ABSENT
git ls-files --error-unmatch .claude/skills/bmad-build-auto/SKILL.md _bmad/scripts/render_skill.py _bmad/scripts/ledger.sh _bmad/config.toml _bmad/custom/skill-rules.md _bmad/custom/bmad-build-auto.toml .claude/commands/epic-cycle.md >/dev/null 2>&1 && echo BMAD-TRACKED || echo BMAD-UNTRACKED
git check-ignore -q _bmad-output/implementation-artifacts && echo OUTPUT-IGNORED || echo OUTPUT-TRACKED   # must be TRACKED (base-kit gate)

# 1. Base kit present, at the v6.11 generation, and anchors intact?
test -f .claude/commands/epic-cycle.md && echo CMD-PRESENT || echo CMD-ABSENT
grep -c "## Pre-flight Runtime Check" .claude/commands/epic-cycle.md
grep -c "Halt after planning" .claude/commands/epic-cycle.md              # >= 1 → v6.11 base kit; 0 → pre-6.11 base kit (stale)
grep -c "#### Rule SC-8" .claude/commands/epic-cycle.md
grep -c "## Anti-Patterns" .claude/commands/epic-cycle.md
test -f _bmad/custom/skill-rules.md && grep -c "## Project-specific rules" _bmad/custom/skill-rules.md

# 1.5 Optional model-tier pass applied? (command frontmatter pin)
head -5 .claude/commands/epic-cycle.md 2>/dev/null | grep -c "^model:"

# 2. Prior parallel install?
grep -c "Mode Resolution" .claude/commands/epic-cycle.md
ls _bmad/custom/parallel.yaml _bmad/scripts/new-epic-worktree.sh 2>/dev/null

# 3. Orchestrator run in flight? (HALT if so — see Step 8 "Mid-run upgrade")
grep -c "runner_dispatched" _bmad-output/implementation-artifacts/cycle-log-parallel.md 2>/dev/null
grep -c "epic_merged_to_feature\|epic_branches_deleted" _bmad-output/implementation-artifacts/cycle-log-parallel.md 2>/dev/null
ls -d .worktrees/epic-* 2>/dev/null
```

### Step 1a — Prerequisite chaining (offer, don't just halt)

The companion documents normally sit **in the same directory as this kit** (the authoring repo). Resolve them relative to this document's own location; if they are not there, ask the user for their path. Perform the offers in this order — base kit before model pass (the pass pins `model: opus` onto the command the base kit writes):

1. **BMAD absent** (check 0): stop and have the user run `npx bmad-method install` (modules `core,bmm`, IDE `claude-code`) — the BMAD installer is interactive and cannot be chained from here. Resume this kit afterwards.
2. **Base kit absent or anchors broken** (check 1): OFFER to install it now. On consent, execute `epic-cycle-workflow-creation.md` in full — its Steps 1–5, including its own detection and backups — then re-run this Step's checks and continue. On decline, HALT: this kit patches anchors only the base kit provides.
3. **Model-tier pass not applied** (check 1.5 = 0): OFFER the optional `skill-optimization-prompt.md`. On consent, execute it now. On decline, note the choice and continue — declining is a valid configuration, not an error (the command's stage→model map still governs spawned plan/implement/QA/CR stages; only the lead-session `model: opus` pin and per-skill pins are absent).
4. **Installed content stale (upgrade check):** read `Kit-Version` from this document and from each companion in the same directory; compare against `_bmad/custom/kit-versions.yaml` (file or entry missing → treat that install as stale). For any companion document newer than its recorded entry, OFFER its re-run in canonical order — base kit first (accept its overwrite warning; the overwrite IS the upgrade), then the model pass — then apply THIS kit's steps (grep-guards make the pass incremental). Re-running this kit alone NEVER refreshes base-owned sections (SC-1, the finding disposition bar, Story X.0, SC-4, Rules 13–17, the v6.11 plan/implement stage blocks, the ledger drain): a stale base kit requires the base re-run. After any upgrade re-run, the session-restart reminder in Step 8 is mandatory — an orchestrator session that is mid-`/epic-cycle` keeps its old doctrine until restarted.

**Decision table:**

| Finding | Action |
| --- | --- |
| BMAD-ABSENT | Step 1a item 1 — user runs the BMAD installer; resume after. |
| Orchestrator run in flight (check 3: more `runner_dispatched` than merged/deleted epics, or live `.worktrees/epic-*`) | HALT with the Step 8 "Mid-run upgrade" note. Do not patch the command, the rules, or `parallel.yaml` until the in-flight epics are merged (or the user has merged the feature branch into every open epic branch and stopped the runners). |
| BMAD version < 6.11.0, BUILD-AUTO-ABSENT, or `uv` missing | HALT — same gates as the base kit (upgrade BMAD / install uv). |
| BMAD-UNTRACKED | HALT and explain: an epic worktree is a checkout of the epic branch, so `.claude/skills/`, `_bmad/scripts/`, `_bmad/config.toml`, and `_bmad/custom/` must be committed or the runner cannot render `bmad-build-auto` inside its worktree. The user removes those paths from `.gitignore` (keeping `_bmad/render/`, `_bmad-output/`, `*.user.toml`, `.worktrees/` ignored) and commits them; resume after. |
| CMD-ABSENT, or any base anchor grep returns 0 | Step 1a item 2 — offer the base kit; HALT only if the user declines. A `Halt after planning` count of 0 with the command present means a pre-6.11 base kit: that is the stale-base path of item 4, not a clean install. |
| Command frontmatter has no `model:` line | Step 1a item 3 — offer the optional model-tier pass; continue either way. |
| Base anchors present, no "Mode Resolution" match | Clean parallel install — back up `.claude/commands/epic-cycle.md` and `_bmad/custom/skill-rules.md` to `<path>.bak-<UTC>`, proceed. |
| "Mode Resolution" already present | Prior parallel install. Back up, then apply only the steps whose grep-guard shows the content missing (each patch below states its guard). Report which were skipped. |
| `parallel.yaml` present | Leave it (it carries project tuning); report diff-worthy drift from the template instead of overwriting. Exception: if it lacks `build_auto_mode`, append `build_auto_mode: spawned` with the template's comment (additive, preserves tuning). |

---

## Step 2: Write `_bmad/custom/parallel.yaml`

Skip if the file already exists (Step 1). Otherwise write verbatim:

```yaml
# Parallel epic execution — read by /epic-cycle (orchestrator mode).
# Safe defaults; tune per project.

max_parallel_epics: 2            # raise only after reviewing a full parallel run's telemetry
worktree_base: .worktrees        # short path under repo root; use e.g. C:\wt\<proj> if MAX_PATH bites
runner_isolation: subagent       # subagent (supported) | headless (designed, Phase 3 — not yet implemented)
submodule_mode: gitlink-worktree # gitlink-worktree (default; shared objects, teardown-safe)
                                 # | clone-per-worktree (plain init; unpushed work dies at teardown)
                                 # | none (project has no submodules)
footprint_overlap_threshold: 0.20  # estimated file-overlap between two epics above this -> serialize them
merge_policy: queue-ask          # queue-ask (user approves each epic merge; only supported policy today)
story_parallelism: off           # off is the only supported value under BMAD v6.11 — story-level batching inside one
                                 # checkout is retired (bmad-build-auto's clean-tree checks); concurrency is per-epic worktrees
build_auto_mode: spawned         # spawned (default; runner spawns bmad-build-auto stage agents — depth-3 nesting)
                                 # | inline (runner invokes bmad-build-auto via Skill; implement tier must then be
                                 #   routed through _bmad/custom/bmad-build-auto.toml implementation_handoff — see Runner-Mode Deltas)

# Runtime-touching stages serialize behind named claim-file locks
# (<worktree_base>/.coordination/locks/<name>.lock). A project with no shared
# live runtime (no shared dev server/namespace/ports) can set stages: [].
# Note: the implement stage (bmad-build-auto) runs the project's tests during its
# Matrix Test Audit and self-review — add `implement` if those tests touch the shared runtime.
runtime_locks:
  - name: runtime
    stages: [smoke, qa, adr_verifications]   # add implement, or use [all-runtime] to include build-auto's test runs
    stale_minutes: 45
```

## Step 3: Write the worktree lifecycle scripts

Both scripts are **cross-platform bash** (single canonical implementation): Git Bash on Windows (ships with git-for-windows), native bash 3.2+ on macOS, any Linux bash. They are invoked as `bash _bmad/scripts/<name>.sh ...`, so no executable bit is required. Script output is deliberately pure ASCII (the orchestrator parses it; non-ASCII garbles on some Windows consoles). Write each verbatim.

### File: `_bmad/scripts/new-epic-worktree.sh` (verbatim)

```bash
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
```

### File: `_bmad/scripts/remove-epic-worktree.sh` (verbatim)

```bash
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
  echo "ERROR: worktree remove --force failed after retries (open handles under $WT_PATH? close editors/shells there and re-run)" >&2
  exit 1
fi

# --- prune per-submodule worktree registrations in the main checkout ----------------
if [ -f .gitmodules ]; then
  for sp in $(git config --file .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}'); do
    [ -e "$sp/.git" ] && git -C "$sp" worktree prune
  done
fi
git worktree prune
echo "REMOVED worktree=$WT_PATH (branches NOT deleted -- delete them now that the mount is gone)"
```

## Step 4: Append Rules 10–12 to `_bmad/custom/skill-rules.md`

### Step 4a — Rules 10–12

Grep-guard: skip the block below if `grep -c "Rule 10" _bmad/custom/skill-rules.md` ≥ 1 — but on such an upgrade also check `grep -c "runtime_lock_acquired" _bmad/custom/skill-rules.md`; if 0, append the Rule-12 lock-lifecycle sentence (the final sentence of Rule 12 below) to the existing Rule 12. For a clean install, insert the following block immediately **before** the line `## Rule 13 — Working-directory discipline` when present (base kits ≥ 2026-07-11.3 install Rules 13–15 and ≥ 2026-08-26.1 add Rule 16; this keeps numbering in reading order), else before `## Rule 15 — Finding disposition bar` when present, else before `## Project-specific rules (add below as retros surface them)`:

```markdown
## Rule 10 — Submodule worktree discipline (all skills, under `/epic-cycle`)

Inside a provisioned epic worktree: NEVER run `git submodule update` (it resets gitlink-mounted submodules to the recorded SHA and discards work in progress); NEVER create or remove git worktrees yourself (the orchestrator's `new-epic-worktree.sh` / `remove-epic-worktree.sh` own that lifecycle); commit early and push per story inside submodule branches so no work is ever unpushed at teardown time.

## Rule 11 — Footprint discipline (epic-runners, under `/epic-cycle`)

An epic-runner may modify only the paths and submodules declared in its epic's footprint (listed in the spawn prompt from `_bmad/custom/epic-dependencies.yaml`). Needing an undeclared submodule, or a path owned by a concurrently running epic, is a `## Clarification Needed` — never a judgment call.

## Rule 12 — Runtime lock (all skills, under `/epic-cycle`)

Stages named in `_bmad/custom/parallel.yaml` `runtime_locks[].stages` must hold the named lock for their duration (`all-runtime` is shorthand for every stage that executes project code against the shared runtime: `implement` — where `bmad-build-auto` runs the spec's Verification commands, its Matrix Test Audit, and its review layers' test runs — `qa`, `smoke`, `adr_verifications`): claim by creating `<worktree_base>/.coordination/locks/<name>.lock` (atomic create-new; content: `epic=<N> stage=<stage> acquired_at=<UTC>`), release by deleting it. If the lock exists, WAIT and retry with 30–90 s jitter — lock contention is normal, not an error. Never delete another epic's lock; a lock older than `stale_minutes` is reported to the orchestrator, which alone may sweep it after confirming the owner is dead. Log the lock lifecycle to the epic's cycle log — `runtime_lock_acquired` / `runtime_lock_released` on each transition, `runtime_lock_waiting` after the first minute of contention. A lock event that exists only in memory is invisible to telemetry and resume.
```

### Step 4b — Rules 13–17 are base-kit territory (13–15 since base Kit-Version 2026-07-11.3; 16 since 2026-08-26.1; 17 since 2026-08-27.1)

Rules 13 (working-directory discipline), 14 (ASCII-escape discipline), 15 (finding disposition bar + ledger grammar), 16 (clean tree before every `bmad-build-auto` dispatch), and 17 (the ledger drain) are installed by the BASE kit — they are general-purpose, not parallel-specific. If Step 1's checks show any of them missing from `_bmad/custom/skill-rules.md`, the base kit is stale: run the Step 1a item-4 upgrade path (base-kit re-run) rather than patching here. Rule 16 applies verbatim inside a worktree: the runner's bookkeeping commits land on the epic branch in the worktree; `.worktrees/` and `<worktree_base>/.coordination/` are gitignored so the orchestrator's `dispatch.yaml` writes never dirty a worktree.

## Step 5: Patch `.claude/commands/epic-cycle.md`

Six edits (5.4 and 5.6 carry three sub-edits each), each with a grep-guard and an exact anchor. The anchors are verbatim base-kit content — if an anchor is missing, HALT and reconcile with the base kit rather than improvising.

### Edit 5.1 — Mode Resolution

Guard: skip if `grep -c "## Mode Resolution" .claude/commands/epic-cycle.md` ≥ 1.
Anchor: insert immediately **before** the line `## Pre-flight Runtime Check`:

```markdown
## Mode Resolution (read this first)

This command runs in one of two modes:

- **RUNNER MODE** — this invocation's context contains the literal marker `**Epic Cycle Role: epic-runner for Epic {N}**` (placed by an orchestrator's spawn prompt). You are the per-epic lead for exactly that epic, working exclusively inside the worktree named in the spawn prompt. Execute the standard per-epic pipeline below (Task Sequence, Per Story, Rework Loop, smoke, commits) with the changes listed in "Runner-Mode Deltas". Ignore "Parallel Orchestration" entirely.
- **ORCHESTRATOR MODE** — every other invocation. If the requested range is a single epic, or `_bmad/custom/parallel.yaml` does not exist, or the approved dependency graph offers no concurrency for the range, run the classic sequential flow in the current checkout exactly as before — the degenerate case; no worktrees, no runners. Otherwise execute "Parallel Orchestration".

```

### Edit 5.2 — Parallel Orchestration + Runner-Mode Deltas

Guard: skip if `grep -c "## Parallel Orchestration" .claude/commands/epic-cycle.md` ≥ 1.
Anchor: insert immediately **before** the line `## Task Sequence`. The block is delimited by FOUR-backtick fences (it contains a YAML fence); insert everything between them:

````markdown
## Parallel Orchestration (Orchestrator Mode)

Runs epics concurrently when the approved dependency graph allows. Verified mechanics (2026-07-09 spikes): background runner subagents with completion notifications; SendMessage-resume preserves runner context across clarification pauses; gitlink-path submodule worktrees share objects and survive teardown; MCP tools reach subagents at depth 2 (build-auto's internal handoff/review subagents sit at depth 3 from the orchestrator and are unverified for MCP reach — Rule 7 keeps tool-dependent gates lead/orchestrator-side).

### Configuration and dependency graph

1. Read `_bmad/custom/parallel.yaml` (max_parallel_epics, worktree_base, submodule_mode, runtime_locks, merge_policy).
2. Resolve `_bmad/custom/epic-dependencies.yaml`. If missing, or its `epics_md_hash` no longer matches `epics.md` — except when the only difference is an inserted `Story X.0` heading + body (a runner's retro-review gate adds those; re-record the hash without re-approval) — analyze `epics.md` + PRD + architecture and propose, per epic: `depends_on` (hard dependencies — epic consumes another's deliverables), `submodules` (which it will modify), `paths_hint`, plus soft serialization edges where estimated file overlap exceeds `footprint_overlap_threshold`. Present the DAG and the resulting waves to the user for approval, then persist with `approved: true` and the current hash. HALT if the user does not approve.
3. Schema:

```yaml
epics_md_hash: "<sha256 of epics.md>"
analyzed_by: <model>
approved: true
epics:
  epic-2: { depends_on: [epic-1], submodules: [src/shared-lib], paths_hint: [src/api/**] }
```

### Dispatch loop

Scheduling is continuous, not strict waves: dispatch any epic whose `depends_on` are all MERGED (not merely complete), up to `max_parallel_epics`. For each dispatchable epic:

1. SC-1 applies once in the main checkout (feature branch verify/create — user prompt as usual).
2. Provision: `bash _bmad/scripts/new-epic-worktree.sh {N} {TICKET} <modified-submodules-csv> [worktree-base] [feature-branch]` — cross-platform (Git Bash on Windows, native bash on macOS/Linux); modified submodules come from epic-dependencies.yaml. The script performs SC-2 (epic branches, submodules included), mounts modified submodules as gitlink-path worktrees, plain-inits read-only ones, and verifies. Record `worktree_provisioned` in the parallel cycle log; update `dispatch.yaml`.
3. Assign the retro-review gate: the lowest-numbered epic of the current dispatch batch gets `retro_review: own`; the others get `retro_review: skip (handled by epic {M})`.
4. Spawn the runner: `Agent` tool, `name: "epic-runner-{N}"`, `run_in_background: true`, `mode: "bypassPermissions"`, `model:` = this command's model tier (opus unless re-pinned), prompt per the Runner Spawn Skeleton below. Log `runner_dispatched` with the model actually passed on the `Agent` call; runners record their own actual model on gate stages — a dispatch-vs-runner attribution mismatch is a telemetry bug, not a re-pin.

The orchestrator then WAITS on notifications. Between notifications it does nothing epic-specific — the runners own their pipelines. All durable state lives in the logs and `dispatch.yaml` (write-ahead, then act — same doctrine as the per-epic cycle log).

### Runner Spawn Skeleton

1. `**Epic Cycle Role: epic-runner for Epic {N}**`
2. `Use the Skill tool to invoke /epic-cycle with args: {N}`
3. Absolute paths: worktree root (your `{project-root}`), main checkout (READ-ONLY for you), coordination dir (`<worktree_base>/.coordination`).
4. Branch table: `{TICKET}-epic{N}` for the superproject and each modified submodule; mount type per submodule (gitlink-worktree vs read-only).
5. Footprint: allowed paths + submodules (Rule 11 applies; quote it).
6. Retro-review assignment (`own` or `skip: handled by epic {M}`).
7. Runtime-lock table from parallel.yaml (Rule 12 applies; quote it) + Rule 10 (quote it).
8. Clarification protocol: "If you must stop for ANY clarification, end your run with the `## Clarification Needed` section; you will be resumed with the answer in a follow-up message — your context is preserved. For a missing-tool problem, start the section body with `TOOLING:` and name the exact verification you could not run."
9. Completion contract: "End your final message with `## Epic Runner Complete` followed by: `epic: {N}`, `stories_completed: <n>`, `ready_for_merge: true|false`, `submodules_touched: <paths or (none)>`, `unpushed_work: none` (verify with `git log --branches --not --remotes` in every repo before claiming), `ledger: open_before=<n> resolved=<n> terminal=<n> chartered=<0|1> reowned=<n> open_after=<n>` (copied from your `ledger_burndown_*` entry), and a one-line-per-story summary table. Per-story cycle-log entries must carry real `spawn_at` values captured when each stage `Agent` call is made — never backfilled equal to the completion timestamp."

### Notification handling

On each runner notification, classify its final message:

- **`## Epic Runner Complete`, ready_for_merge=true** → **write-ahead first**: append `runner_complete` and `merge_enqueued` to the parallel log BEFORE any merge-gate interaction (a missing completion entry breaks resume and cost attribution — pilot epic-2 gap); then, if the user is present, proceed to the merge gate; either way, continue dispatching unblocked epics.
- **`## Clarification Needed`** (no `TOOLING:` prefix) → log `runner_clarification`; surface the question to the user with Epic + Story context; on answer, `SendMessage` to `epic-runner-{N}` with the answer; log `runner_resumed`. Other epics never pause.
- **`## Clarification Needed` with `TOOLING:`** → the runner lacks an MCP/runtime tool. The orchestrator executes that one verification itself, inside the epic's worktree, using its full session tool inventory; log `runner_tooling_backstop` with evidence; `SendMessage` the result to the runner.
- **Anything else (crash / context exhaustion / missing contract)** → run the standard per-epic resume detection against the worktree's cycle log; re-spawn a fresh `epic-runner-{N}` at the resume point; log `runner_redispatched`. Never re-run committed work (write-ahead rule).

### Runtime locks (orchestrator duties)

Runners claim/release per Rule 12. The orchestrator: never brokers healthy locks; sweeps a lock ONLY after the owning runner is confirmed dead (its agent ended without completing and will be re-dispatched); logs `runtime_lock_swept` with the stale content. Timeout alone never justifies a sweep.

### Merge queue — SC-4-P (serialized; user-gated per `merge_policy: queue-ask`)

One epic at a time, in the MAIN checkout. If the IRIS/ObjectScript IDE file-sync toggle applies to this project, it wraps this whole sequence (Window B) — worktrees themselves never need the toggle (they are not open in VS Code).

1. Ask the user: "Epic {N} is ready. Merge `{TICKET}-epic{N}` into `<feature>`?" Queue holds while other epics keep running. Surface the runner's `ledger:` line and the entries it re-owned to next-epic keys (Rule 17) before the question; on the range's FINAL epic, follow the merge with the ledger sweep (`LEDGER slice all` in the main checkout after the merge — every remaining non-terminal entry with a recommended disposition).
2. Submodules first, for each modified submodule: `git -C <sub> fetch origin && git -C <sub> merge --no-ff {TICKET}-epic{N} && git -C <sub> push origin <feature>`. Do NOT delete the submodule epic branch yet (git refuses while the worktree mounts it).
3. Superproject: `git merge --no-ff --no-commit {TICKET}-epic{N}`, then for EVERY affected submodule `git add <sub-path>` to re-record the gitlink at the submodule's post-merge feature HEAD, then commit. Never plain-merge: pointer drift leaves the main checkout permanently dirty.
4. Conflicts: gitlink conflict (`UU <sub>`) → deterministic, resolve via step 3's `git add <sub-path>` (pointer = submodule feature HEAD, which contains all merged epics). `sprint-status.yaml` conflict → take either side, then regenerate with `SPRINT_PLAN generate` (deterministic preserve-never-downgrade merge from the epic files) and re-apply any statuses the losing side carried with `--set`; verify with `SPRINT_PLAN validate` before committing. `deferred-work.md` auto-resolves (union merge attribute). `cycle-log-epic-*.md` never conflicts (one file per epic). ANY code conflict → STOP and surface to the user; auto-resolution forbidden.
5. Verify `git submodule status` (feature heads, no `+`/`-`), push feature. Log `epic_merged_to_feature`.
6. Retro gate (post-merge, main checkout, artifacts now on feature): "Run a retrospective for Epic {N}?" — fully interactive as always; the retro commit lands on the feature branch. Epics that `depends_on` this epic are not dispatched until this question is answered (yes → retro complete, or no → skipped); independent epics are unaffected.
7. Teardown: `bash _bmad/scripts/remove-epic-worktree.sh {N}` (guards: refuses on uncommitted/unpushed work; `--force-abandon` discards deliberately). THEN delete `{TICKET}-epic{N}` local+remote in the superproject and every affected submodule. Log `worktree_removed`, `epic_branches_deleted`.
8. Dispatch newly unblocked epics.

### Parallel state files

- `_bmad-output/implementation-artifacts/cycle-log-parallel.md` (main checkout; same TAB format as per-epic logs; field 2 is `Epic <N>`): stages `lead_model_gate`, `deps_approved`, `worktree_provisioned`, `runner_dispatched`, `runner_clarification`, `runner_resumed`, `runner_tooling_backstop`, `runner_redispatched`, `runner_complete`, `merge_enqueued`, `epic_merged_to_feature`, `epic_retro_complete|skipped`, `worktree_removed`, `epic_branches_deleted`, `runtime_lock_swept`, `parallel_summary`. Include `model=` and runner token counts where available; `parallel_summary` story counts include injected X.0 stories.
- `<worktree_base>/.coordination/dispatch.yaml` (orchestrator-owned): per epic — `state` (`provisioning|running|awaiting_clarification|awaiting_merge|merging|merged|failed`), `worktree`, `branch`, `runner`, `submodules_modified`, `last_event`. Write-ahead before each transition.
- Per-epic cycle logs stay INSIDE each worktree (committed on the epic branch) — per-epic resume semantics are unchanged.

### Parallel resume (orchestrator restart)

| Evidence | Action |
| --- | --- |
| `cycle-log-parallel.md` shows open epics; worktrees present; runners absent | For each open epic: run per-epic resume detection in its worktree; re-spawn runner at its resume point |
| Worktree missing but epic branch exists local/remote | Re-provision (script is idempotent), then per-epic RESUME |
| Worktree present but branch state contradicts the epic's cycle log | INTEGRITY_ERROR — halt and surface (never silently recreate) |
| dispatch.yaml `merging` but no `epic_merged_to_feature` | Inspect main checkout: merge commit exists → write the missing log entry; half-done conflicted merge → surface to the user |

### Status aggregation

On request, combine dispatch.yaml + each open worktree's `SPRINT_PLAN status` (run against that worktree's `sprint-status.yaml`) + its cycle-log tail + the merge queue into one table (epic, state, current story/stage, blockers).

## Runner-Mode Deltas

The runner is the per-epic lead of the classic flow, with exactly these changes:

| Classic per-epic lead duty | Runner mode |
| --- | --- |
| SC-1 / SC-2 branch creation + checkout | REMOVED — pre-provisioned. ASSERT instead: superproject and every modified submodule are on `{TICKET}-epic{N}`; halt on mismatch. |
| Pre-flight BMAD + runtime gate | KEPT — run it inside the worktree (`uv`, `_bmad/scripts/render_skill.py`, `.claude/skills/bmad-build-auto` must all be present there; they are tracked files, so a worktree has them). |
| Clean-tree gate, sprint planning (headless), retro-review/Story X.0 (only if assigned `own`), plan spawns (Opus) + spec validation, implement spawns (Sonnet), QA/CR spawns (synchronous, per the stage→model map), bookkeeping commits (Rule 16), rework loop, ADR gates, per-story smoke, per-story commits+pushes (submodules-first, SC-3) | KEPT verbatim — all inside the worktree. Treat the worktree root as `{project-root}` (spawn every stage agent with the worktree root as its working directory — the skill's own bootstrap resolves `{project-root}` from there, so each worktree renders its own `_bmad/render/` generation). Never touch the main checkout or another epic's worktree. |
| `bmad-build-auto` stage mode | Per `parallel.yaml` `build_auto_mode`: **`spawned`** (default) — spawn the stage agent exactly as the classic lead does (`general-purpose`, `model` per the map); **`inline`** — invoke `/bmad-build-auto` via `Skill` on the runner itself (plan runs at the runner's Opus tier; for implement, the project's `_bmad/custom/bmad-build-auto.toml` `implementation_handoff` prose must direct the handoff subagent to `model: sonnet`, else implementation silently runs at Opus). Inline trades the runner's context budget for one less nesting level; use only if a spawned stage agent fails to spawn its own subagents on the project's harness. |
| ADR-tooled verifications + smoke + QA e2e execution (+ the implement stage if `runtime_locks[].stages` lists `implement` / `all-runtime`) | KEPT, but wrapped in the runtime lock when parallel.yaml lists the stage (Rule 12). On a missing tool: `TOOLING:` clarification (the orchestrator runs it and resumes you). |
| Ledger drain: harvest-with-owner, per-story `ledger_adjudicated`, and the end-of-epic **burn-down gate** (`ledger_burndown_*`, including chartering and running Story N.9 through the full pipeline inside the worktree) | KEPT verbatim — runner-side, because the burn-down story is part of Epic N and must land on `{TICKET}-epic{N}` before the merge. The ledger lives inside the worktree (it merges with `merge=union`; `LEDGER` only ever adds lines). Re-own leftovers to specific next-epic story keys as Rule 17 requires; the orchestrator surfaces those at the merge gate. The epic-start `ledger_load` runs in the worktree too (its `owner:none` re-own happens there). |
| End-of-epic: retro question, SC-4 merge, `epic-{N}: done` write, IDE-sync windows | REMOVED — orchestrator-owned (retro runs post-merge, orchestrator-side, and receives the `ledger:` line from your completion contract as its argument context). Your last acts: burn-down gate logged, final story committed AND pushed, verify `unpushed_work: none` in every repo, append `epic_runner_complete` to your cycle log, emit the completion contract. |
| Clarifications | End your run with `## Clarification Needed`; you are resumed with the answer (context preserved). Do not poll or wait in-run. |

````

(The block above is delimited by FOUR-backtick fences because it contains a three-backtick YAML fence of its own — everything between the four-backtick lines is inserted.)

### Edit 5.3 — SC-8 addendum

Guard: skip if `grep -c "SC-8 is automated" .claude/commands/epic-cycle.md` ≥ 1.
Anchor: insert immediately **after** the SC-8 paragraph ending `run sequentially.` (the line beginning `**Out-of-scope coordination:**`):

```markdown

**Automation note:** SC-8 is automated by Orchestrator Mode (see "Parallel Orchestration") — worktree provisioning, merge serialization, and conflict policy above are enforced by the orchestrator and its scripts. Manual multi-session SC-8 (separate terminals per epic) remains supported and follows the same rules; the SC-4-P corrections apply to it too: parent merges use `--no-ff --no-commit` + gitlink re-record, and epic-branch deletion must wait until the epic's worktree is removed.
```

### Edit 5.4 — Anti-pattern revisions

Guard: skip if `grep -c "orchestrator→runner resume" .claude/commands/epic-cycle.md` ≥ 1.

(a) Replace the bullet beginning `- **TeamCreate / SendMessage / TeamDelete / team_name / shutdown handshakes**` with:

```markdown
- **TeamCreate / TeamDelete / team_name / shutdown handshakes / task-envelope messaging** — Team-style messaging as a completion signal is unreliable; the `Agent` tool's return value IS the completion signal. ONE sanctioned SendMessage use exists: orchestrator→runner resume — the orchestrator answering a runner's `## Clarification Needed` (or delivering tooling-backstop results) to continue it with context intact. Runners never SendMessage each other.
```

(b) Replace the bullet beginning `- **Backgrounding pipeline subagents**` with:

```markdown
- **Backgrounding pipeline STAGE subagents** — A backgrounded plan/implement/QA/CR stage never hands control back to its runner and the pipeline stalls (and `bmad-build-auto` itself forbids backgrounding its internal subagents); stages stay synchronous (a parallel batch is N `Agent` calls in ONE message). The exception is epic-RUNNERS in Orchestrator Mode: they are deliberately backgrounded because the orchestrator is built around their completion notifications.
```

(c) Append these bullets at the end of the Anti-Patterns list (after its final bullet, which begins `- **Basing a new branch on a stale remote root**`):

```markdown
- **Deleting epic branches before worktree teardown** — git refuses to delete a branch a mounted worktree holds; attempting it mid-merge aborts SC-4-P partway. Order: merge+push → `remove-epic-worktree.sh` → delete branches (verified 2026-07-09).
- **Plain-merging the superproject at SC-4-P** — `git merge --no-ff` without `--no-commit` + gitlink re-record records epic-tip submodule pointers, leaving the main checkout permanently dirty (`+` drift) and breaking every later clean-tree gate. Always re-record pointers at the submodules' post-merge feature heads.
- **Running `git submodule update` inside a provisioned epic worktree** — resets gitlink-mounted submodules to the recorded SHA and discards in-progress work (Rule 10). Only `new-epic-worktree.sh` ever initializes submodules.
- **Hand-rolling worktree lifecycle** — raw `git worktree add`/`remove` skips submodule mounts, unpushed-work guards, and prune steps; `worktree remove --force` on a plain-initialized submodule permanently destroys unpushed submodule commits. Use the scripts.
```

### Edit 5.5 — Permission Mode note

Guard: skip if `grep -c "Epic-runner subagents are the one sanctioned background spawn" .claude/commands/epic-cycle.md` ≥ 1.
Anchor: insert immediately **after** the paragraph ending `Parallel batches are still synchronous: N ` + "`Agent`" + ` calls in ONE message resolve together.`:

```markdown

Epic-runner subagents are the one sanctioned background spawn (Orchestrator Mode only): `run_in_background: true`, `mode: "bypassPermissions"`, named `epic-runner-{N}`. The orchestrator is re-invoked by their completion notifications and resumes them via SendMessage; their own nested stage spawns remain synchronous per the rule above.
```

### Edit 5.6 — Working-directory discipline in the stage spawn blocks (post-pilot hardening, 2026-07-10; v6.11 shape 2026-08-26)

Base kit ≥ 2026-08-26.1 already carries Rule 13 / Rule 14 bullets in the **Plan** and **Implement** spawn blocks and the file-list rule (spec `## Verification`) in the QA block, so only the skeleton item, the QA working-directory bullet, and the code-review bullet remain to patch. Guard each sub-edit by its own grep:

(a) Guard: skip if `grep -c "The absolute working directory" .claude/commands/epic-cycle.md` ≥ 1. Replace the Spawn Prompt Skeleton's final item `8. Skill-specific context.` with:

```markdown
8. Skill-specific context.
9. **The absolute working directory** — under a parallel run this is the epic worktree root, never the main checkout. Direct the agent to run every command from it and to verify before acting (`git rev-parse --show-toplevel` must equal the stated path), and to pass the same path + verification requirement into any internal subagents the skill spawns (Rule 13) — for `bmad-build-auto` that includes its epic-context compile subagent, its implementation-handoff subagent, and its review layers. An agent operating from the wrong checkout produces invalid results (pilot 2026-07-10: an acceptance-auditor layer defaulted to the main checkout and reported a completed story as unimplemented).
```

(b) Guard: skip if `grep -c "before writing tests" .claude/commands/epic-cycle.md` ≥ 1. In the **QA spawn** rule block, append after the `File-list completeness` bullet:

```markdown
- Rule 13 (working directory): operate from the absolute working directory stated above; verify `git rev-parse --show-toplevel` matches before writing tests.
```

(c) Guard: skip if `grep -c "every internal review subagent you spawn" .claude/commands/epic-cycle.md` ≥ 1. In the **Code-review spawn** rule block, append after the Rule 1 bullet:

```markdown
- Rule 13 (working directory): you AND every internal review subagent you spawn (`blind-hunter`, `edge-case-hunter`, `verification-gap`, `acceptance-auditor`) must operate from the absolute working directory stated in this prompt — verify `git rev-parse --show-toplevel` matches before reviewing, and pass the path + verification requirement into each layer's prompt. Findings produced from the wrong checkout are invalid: discard and re-run that layer; never report them.
```

(d) Pre-6.11 base kits (no `Halt after planning` in the command) are NOT patched here — they need the base-kit re-run (Step 1a item 4) first.

## Step 6: `.gitignore` and `.gitattributes`

Append (creating the file if absent), each guarded by a grep for the exact line:

- `.gitignore`: `.worktrees/`
- `.gitattributes`: `_bmad-output/implementation-artifacts/deferred-work.md merge=union`

## Step 7: Validate

```bash
grep -c "## Mode Resolution" .claude/commands/epic-cycle.md                     # >= 1
grep -c "## Parallel Orchestration" .claude/commands/epic-cycle.md              # >= 1
grep -c "## Runner-Mode Deltas" .claude/commands/epic-cycle.md                  # >= 1
grep -c "SC-4-P" .claude/commands/epic-cycle.md                                 # >= 2
grep -c "new-epic-worktree.sh" .claude/commands/epic-cycle.md                   # >= 2
grep -c "epic-runner-{N}" .claude/commands/epic-cycle.md                        # >= 2
grep -c "orchestrator→runner resume" .claude/commands/epic-cycle.md            # >= 1
grep -c "Rule 1[012]" _bmad/custom/skill-rules.md                               # >= 3
grep -cE "^## Rule 1[34567]" _bmad/custom/skill-rules.md                        # 5 (working-dir, ASCII-escape, disposition bar, clean-tree, drain — base kit)
grep -c "ledger_burndown" .claude/commands/epic-cycle.md                        # >= 6 (base kit + Runner-Mode Deltas)
test -f _bmad/scripts/ledger.sh && bash -n _bmad/scripts/ledger.sh              # base kit installed the ledger tool
grep -c "runtime_lock_acquired" _bmad/custom/skill-rules.md                     # >= 1 (Rule 12 lock-lifecycle logging)
grep -c "show-toplevel" .claude/commands/epic-cycle.md                          # >= 5 (skeleton item 9 + plan/implement/qa/cr bullets)
grep -ci "file-list completeness" .claude/commands/epic-cycle.md                # >= 1 (base kit, QA block)
grep -c "Halt after planning" .claude/commands/epic-cycle.md                    # >= 4 (v6.11 base kit present)
grep -c "build_auto_mode" .claude/commands/epic-cycle.md                        # >= 1 (Runner-Mode Deltas)
grep -c "max_parallel_epics" _bmad/custom/parallel.yaml                         # 1
grep -c "build_auto_mode" _bmad/custom/parallel.yaml                            # 1 (add the key to a pre-existing parallel.yaml if missing; default spawned)
ls _bmad/scripts/new-epic-worktree.sh _bmad/scripts/remove-epic-worktree.sh     # both exist
bash -n _bmad/scripts/new-epic-worktree.sh && bash -n _bmad/scripts/remove-epic-worktree.sh   # both parse
grep -c "merge=union" .gitattributes                                            # >= 1
grep -c "\.worktrees/" .gitignore                                               # >= 1
grep -c "escalated" .claude/commands/epic-cycle.md                              # >= 3 (Rule 15 dispositions)
grep -cE "^(epic-cycle-base|skill-optimization|parallel-epic-cycle):" _bmad/custom/kit-versions.yaml  # 2-3 (skill-optimization only if the pass ran)
```

Also confirm the base command still validates against the base kit's Step-4 greps (the patches only add content; they remove none of the base sections).

## Step 8: Done

Record the install: create/update `_bmad/custom/kit-versions.yaml` with `parallel-epic-cycle: <this document's Kit-Version>`.

**Commit the OUTPUT, completely.** `git add -A && git commit` with a message naming the kit versions applied — the output set is the installed files (command, `_bmad/custom/*` including `kit-versions.yaml`, scripts, settings, backups), NOT just the kit source documents; verify `git status --short` is empty afterward (a dirty tree trips the next run's clean-tree gates — pilot finding 2026-07-11).

**⚠️ Tell the user explicitly — session restart required.** A Claude Code session that has already invoked `/epic-cycle` (or loaded the BMAD skills) holds the OLD text in its context; nothing installed here takes effect in it. End this kit run by instructing the user, verbatim: close this session AND any session currently mid-`/epic-cycle`, and start a fresh session before the next `/epic-cycle` invocation. (Runner subagents spawned after the upgrade read the new command from disk, but a live orchestrator keeps its stale doctrine until restarted.)

**Mid-run upgrade — do not apply this kit (or a base-kit re-run) while an orchestrator run is in flight.** Evidence of one: `_bmad-output/implementation-artifacts/cycle-log-parallel.md` with epics not yet `epic_merged_to_feature`, or live `<worktree_base>/epic-*` directories. The upgrade commit lands in the main checkout; each runner's worktree is a checkout of its epic branch, which does not contain that commit, so runners keep the old command and rules — and live runners hold their old doctrine in context regardless. Finish and merge the in-flight epics first, then upgrade before the next dispatch. Only if waiting is impossible: merge the feature branch (carrying the upgrade commit) into every open epic branch by hand, stop the runners, and re-dispatch them at their resume points from a fresh orchestrator session. A sequential (single-epic) run may be upgraded at a story boundary — see the base kit's "Mid-epic upgrade" note.

Orchestrator usage: `/epic-cycle 2-4` on a project with `parallel.yaml` present runs the dependency analysis/approval and dispatches runners; `/epic-cycle 2` or a project without `parallel.yaml` behaves exactly as the classic sequential workflow. First run on a new project: expect the SC-1 feature-branch prompt and the dependency-graph approval gate before any dispatch. Keep `max_parallel_epics: 2` until a full parallel run's telemetry has been reviewed.
