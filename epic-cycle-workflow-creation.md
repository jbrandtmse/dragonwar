# Epic Cycle Workflow — Installation Kit

**Kit-Version:** 2026-08-26.1

**Requires BMAD Method v6.11.0 or later** (`_bmad/_config/manifest.yaml` → `installation.version`). This kit drives the v6.11 Phase-4 chain — `bmad-sprint-planning → bmad-build-auto → bmad-code-review` — and its rendered skills need `uv` (Python 3.11+ provisioned by uv) on PATH. For BMAD ≤ 6.10 projects use the last pre-6.11 kit release; do not install this kit there.

A self-contained kit for installing the `/epic-cycle` slash command and its BMAD skill customizations into any BMAD project. Run this as a Claude Code session — the session reads each step, performs the indicated file operations, and verifies the result.

## What this installs

| File | Purpose |
| --- | --- |
| `_bmad/custom/skill-rules.md` | Cross-cutting rules registry, loaded by every BMAD skill via `persistent_facts` |
| `_bmad/custom/bmad-build-auto.toml` | Loads `skill-rules.md` for the unattended build skill (the plan + implement stages) |
| `_bmad/custom/bmad-build.toml` | Loads `skill-rules.md` for the interactive build skill and disables its `open_spec` editor launch (manual runs in a pipeline project) |
| `_bmad/custom/bmad-qa-generate-e2e-tests.toml` | Loads `skill-rules.md` for the QA skill |
| `_bmad/custom/bmad-code-review.toml` | Loads `skill-rules.md` for the code-review skill |
| `.claude/commands/epic-cycle.md` | The slash command body (self-contained at runtime) |

Removed by this kit version (they targeted the deprecated `bmad-create-story` / `bmad-dev-story` shims, which the pipeline no longer invokes): `_bmad/custom/bmad-create-story.toml`, `_bmad/custom/bmad-dev-story.toml` — backed up, then deleted in Step 1.

Optional, project-defined later:

| File | Purpose |
| --- | --- |
| `_bmad/custom/branch-naming.yaml` | Per-project tracker / branch-naming convention overrides |

---

## Step 1: Detect prior state

Before writing any files, inspect what's already present and decide whether to back up.

Run these checks (the Claude session executes each; report findings inline):

```bash
# 0. BMAD version and runtime prerequisites (HARD gates)
grep -A1 "^installation:" _bmad/_config/manifest.yaml | grep version          # must be >= 6.11.0
uv --version                                                                  # must succeed
uv run --no-cache _bmad/scripts/resolve_config.py --project-root . --key core.project_name   # exit 0 = uv can run the BMAD scripts (Python >= 3.11); exit 3 = no Python 3.11+
test -f .claude/skills/bmad-build-auto/SKILL.md && echo "BUILD-AUTO-PRESENT" || echo "BUILD-AUTO-ABSENT"
test -f .claude/skills/bmad-sprint-planning/scripts/sprint_plan.py && echo "SPRINT-PLAN-PRESENT" || echo "SPRINT-PLAN-ABSENT"
test -f _bmad/scripts/render_skill.py && echo "RENDER-PRESENT" || echo "RENDER-ABSENT"
git check-ignore -q _bmad-output/implementation-artifacts && echo "OUTPUT-IGNORED" || echo "OUTPUT-TRACKED"   # must be TRACKED

# 1. Does the slash command already exist?
test -f .claude/commands/epic-cycle.md && echo "PRESENT" || echo "ABSENT"

# 2. Does it reference deprecated multi-agent patterns (excluding this kit's own Anti-Patterns bullet that forbids them), or is it the pre-6.11 command?
grep -E "TeamCreate|TeamDelete|SendMessage|team_name|shutdown_request|shutdown_response|STATUS: completed|STATUS: clarification_needed" .claude/commands/epic-cycle.md 2>/dev/null | grep -v "^- \*\*TeamCreate" | wc -l
grep -c "Halt after planning" .claude/commands/epic-cycle.md 2>/dev/null   # 0 with the file present = pre-6.11 command (the v6.11 command contains it many times)

# 3. Are the BMAD .toml customizations present? Which generation?
ls _bmad/custom/bmad-*.toml 2>/dev/null
ls _bmad/custom/bmad-create-story.toml _bmad/custom/bmad-dev-story.toml 2>/dev/null   # legacy (pre-6.11) files

# 4. Do any .toml files carry an `on_complete` hook?
grep -l "on_complete" _bmad/custom/bmad-*.toml 2>/dev/null

# 5. Does a prior rules registry exist?
ls _bmad/custom/*-skill-rules.md _bmad/custom/skill-rules.md 2>/dev/null
```

**Decision table:**

| Finding | Action |
| --- | --- |
| BMAD version < 6.11.0, or `BUILD-AUTO-ABSENT` / `SPRINT-PLAN-ABSENT` / `RENDER-ABSENT` | HALT. Tell the user to upgrade BMAD (`npx bmad-method install` in the project, choose the update path) or to use the pre-6.11 kit release. Nothing in this kit works against the old pipeline. |
| `uv` missing | HALT with the install pointer (https://docs.astral.sh/uv/). `bmad-build-auto` renders via `uv run` and halts on activation without it; every other BMAD skill resolves its customization through `uv run` too. |
| `OUTPUT-IGNORED` | HALT: `_bmad-output/implementation-artifacts` is gitignored. The pipeline's durable state (cycle logs, `sprint-status.yaml`, specs, `deferred-work.md`) must be committed on the epic branch — Rule 16's bookkeeping commits, resume, and the parallel merge queue all depend on it. Have the user drop `_bmad-output/` (or at least `implementation-artifacts/`) from `.gitignore` and commit the directory; resume after. |
| Slash command absent | Proceed to Step 2 — clean install. |
| Slash command present and the `Halt after planning` count (check 2, second command) is 0 | This is an upgrade from the shim-era pipeline. Back up, report, continue — the overwrite IS the upgrade. If a cycle log for an in-flight epic exists (`_bmad-output/implementation-artifacts/cycle-log-epic-*.md` with entries but no `epic_merged_to_feature`/`epic_merge_skipped`), WARN: that epic was logged by the old pipeline; the new command resumes it story-by-story (stories at `committed` are safe; a story mid-`dev_complete` under the old dev-story skill must be finished or reverted by hand first). |
| Legacy `bmad-create-story.toml` / `bmad-dev-story.toml` present | Back up each to `<file>.bak-<UTC>`, then DELETE both. The skills they customize are deprecated shims the pipeline never invokes; leaving the files is harmless but misleading. If the user still runs those shims by name and wants the rules loaded there, they can restore the backups. |
| Slash command present, `Halt after planning` count > 0, zero deprecated-pattern matches (after the exclusion) | A v6.11 command written by this kit — a plain re-run/upgrade. Back up to `.claude/commands/epic-cycle.md.bak-<UTC>` and continue. |
| Slash command present with deprecated-pattern matches | Back up to `.claude/commands/epic-cycle.md.bak-<UTC>`, report the matching lines to the user, continue. Note: `SendMessage` matches may be the PARALLEL kit's sanctioned orchestrator→runner resume (the same file will contain "orchestrator→runner resume") — report those as parallel-kit content, not legacy debris. |
| Slash command present containing `## Mode Resolution` (the parallel kit is installed) | Back up as above, then WARN the user before overwriting: this install removes the parallel kit's patches and any `model:` frontmatter pin. After Step 5 completes, re-run `skill-optimization-prompt.md` (if the project uses the model-tier pass) and `parallel-epic-cycle-workflow-creation.md` — both are idempotent. |
| `.toml` files absent | Proceed to Step 2. |
| `.toml` files present without `on_complete` | Back up each to `<file>.bak-<UTC>`, overwrite in Step 2. |
| `.toml` files present with `on_complete` | Back up each, overwrite in Step 2 (the new versions omit `on_complete`). |
| `_bmad/custom/skill-rules.md` present | Back up to `<file>.bak-<UTC>`. Before overwriting in Step 2, extract and PRESERVE: (a) the parallel kit's `## Rule 10` – `## Rule 12` blocks, re-inserted immediately before `## Rule 13` in the new file (so a parallel install is not silently un-installed); (b) everything under `## Project-specific rules` (rules numbered 17+ and any prose), re-appended verbatim. Report what was carried over. |
| Prior rules registry under a different name (e.g., `<project>-skill-rules.md`) | Rename to `skill-rules.md` after backing up, OR back up + delete (the new install creates `skill-rules.md` from scratch — manual merge if the prior registry had project-specific rules). |

**Backup convention:** `<original-path>.bak-<UTC-timestamp>` (e.g., `.claude/commands/epic-cycle.md.bak-2026-05-22T14-30-00Z`). Backups stay in place so the developer can diff post-install.

Surface the detection report to the user before writing anything. If anything looks unusual (e.g., a prior registry with custom project-specific rules), pause and ask whether to preserve those rules in the new `skill-rules.md`.

---

## Step 2: Write BMAD skill customizations

### File 1: `_bmad/custom/skill-rules.md`

Write the following content verbatim (the block is delimited by FOUR-backtick fences because it contains three-backtick fences of its own — everything between the four-backtick lines is the file):

````markdown
# BMAD Skill Rules

Loaded as `persistent_facts` by every BMAD skill on activation (via `_bmad/custom/<skill>.toml`). Project-specific rules can be appended below Rule 16.

## Rule 1 — Integration ACs (`bmad-build-auto` / `bmad-build` planning step)

Every story spec that introduces a service, module, or shared component MUST include at least one Integration AC — as a row in the spec's I/O & Edge-Case Matrix or an item under Tasks & Acceptance — of the form:

> *Consumer `X` reads from this service/module and produces observable effect `Y`.*

The integration AC must be testable by the consumer's automation tier (unit, integration, E2E, browser-MCP, API smoke), not by inspecting the introducing module's internal state.

A spec that introduces a service without naming any consumers must explicitly say so in an "Integration ACs" note under `## Design Notes` ("No consumers in this story; the first consumer will be Story X.Y."). Silence is not acceptable.

## Rule 2 — Consumed-by linkage (`bmad-build-auto` / `bmad-build` planning step)

Every service-introducing spec carries a `Consumed-by:` list under `## Design Notes` naming downstream consumer stories by ID and purpose.

Every consumer spec carries a `Consumes:` list under `## Design Notes`, and its Integration ACs exercise the consumer against a real instance — not a mock. These live in the non-frozen Design Notes section so later amendments never fight the spec's frozen intent block.

## Rule 3 — Real-runtime test evidence (`bmad-code-review`)

A code review MUST NOT approve a story whose code touches a user-facing surface unless the QA-generated test suite includes at least one test that exercises the deliverable against its real target runtime:

- UI / browser-deployed — browser-MCP or Playwright test asserting on observable DOM / render state.
- CLI / library — actual invocation with stdout / stderr / exit-code / produced-file assertions.
- Service / API — a real HTTP request with status code + response body + side-effect assertions.

This is distinct from the lead's manual per-story smoke, which runs *after* code review as a separate workflow gate. Rule 3 governs the *test artifacts* code review can inspect; the manual smoke is a later, independent check.

Pure non-user-facing stories (build pipeline, internal tooling, refactor) are exempt; note the exemption in the review. Missing real-runtime test evidence on a user-facing story is a HIGH finding.

## Rule 4 — Closing summary in the final message (`bmad-qa-generate-e2e-tests`, `bmad-code-review`, under `/epic-cycle`)

`bmad-build-auto` is exempt: its contract is the spec file itself — frontmatter `status` (`done` | `blocked` | `ready-for-dev`) plus the `## Auto Run Result` section (`Status:` / `Blocking condition:`). The lead reads the spec, never the agent's prose. Every other skill, when invoked under `/epic-cycle`, MUST end its final assistant message with these sections in order:

```markdown
## Files Modified
- <full path from repo root>
(or "(none)")

## Tests Added
- <full path from repo root>
(or "(none)")

## Decisions
- <one-line summary>
(or "(none)")

## Issues Encountered
- <one-line summary>
(or "(none)")
```

The closing summary is part of the agent's normal output. If the agent forgets the sections, the lead reconstructs the file list from `git status --short` — normal extraction.

If the skill cannot make confident progress for ANY reason — ambiguous ACs, missing prerequisite, a user-preference choice, an environment failure, or anything risking a stated constraint — halt BEFORE the closing summary and end with a `## Clarification Needed` section instead. State the question, what was tried, and what's blocking, in one paragraph.

Outside `/epic-cycle`, this rule does not apply — emit a normal completion summary.

## Rule 5 — NFR tripwire response (`bmad-build-auto`, `bmad-code-review`)

If an NFR is found to be unmeasurable, mathematically impossible, internally contradictory, or otherwise un-implementable as worded:

- **`bmad-build-auto`** cannot amend planning artifacts mid-run. HALT with status `blocked` and blocking condition `intent gap`, naming the NFR, why it is un-implementable, and the amendment you recommend. The lead amends the planning artifact (`prd.md`, `architecture.md`, or `epics.md`) in place, records original-vs-amended wording with rationale in the spec's `## Spec Change Log`, re-runs the epic-context pre-warm (the amendment makes the planning artifacts newer than `epic-<N>-context.md`), resets the spec's `status` (`draft` to re-plan, `in-progress` to re-implement), commits, and re-dispatches on the spec path.
- **`bmad-code-review`** files an NFR worked around with code comments + `deferred-work.md` instead of a planning-artifact amendment as a HIGH finding.

Do NOT work around with code comments + `deferred-work.md`.

## Rule 6 — ADR violations are HIGH severity (`bmad-build-auto`, `bmad-code-review`)

An AC implementation that violates an Accepted ADR (Architecture Decision Record — a short, numbered document under `docs/adr/` capturing a single committed architectural or technical decision and its rationale) — wrong tool stack, wrong architectural pattern, contradicts a committed methodology — is a HIGH-severity finding, not a LOW deferrable.

`bmad-build-auto` must consult the ADR registry (typically `docs/adr/`) for any architectural or methodology decisions referenced in the story's ACs / spec Design Notes — at planning time (record the governing ADRs in `## Design Notes`) and at implementation time (match implementation to ADR commitments).

`bmad-code-review` must:

1. Cross-check each AC against the project's ADR registry.
2. Verify that ADR-constrained implementations match the ADR's commitment.
3. File mismatches as HIGH. Auto-resolve inline where reasonable; otherwise pause for the lead.

## Rule 7 — Sub-agent tool inventory is harness-inherited (all skills)

Sub-agents spawned by `/epic-cycle` inherit whatever MCP namespaces and tools are mounted on the harness running the lead. There is no project-local mechanism to add a tool just for sub-agents.

**Implication:** ADR-tooled AC verifications (browser-MCP smokes, performance traces, audits) are placed on the **lead**, not on sub-agents. Sub-agent MCP propagation is best-effort defense-in-depth, not the primary gate. Note that `bmad-build-auto` itself spawns an implementation subagent and parallel review subagents (one nesting level below the stage agent); they inherit the same harness inventory.

## Rule 8 — Test discoverability (`bmad-qa-generate-e2e-tests`)

Generated tests MUST be discoverable by the project's default test suite — (a) correct naming convention, (b) not excluded by ignore files, (c) not tagged in a way that opts them out of the default run.

A test that exists but does not run in the default suite is invisible to CI and to the next story's regression check. Undiscoverable tests are a HIGH finding on subsequent code review.

## Rule 9 — Unattended menu protocol (`bmad-code-review`, `bmad-qa-generate-e2e-tests`, under `/epic-cycle`)

Interactive BMAD skills contain checkpoints — numbered menus, "halt and wait for confirmation" steps (`bmad-code-review` has four on its happy path plus a large-diff chunking offer; `bmad-qa-generate-e2e-tests` opens by asking what to test). `bmad-build-auto` has none (it is the unattended variant by design — its only exits are the HALT statuses); `bmad-build` is never a pipeline stage. When an interactive skill is invoked under `/epic-cycle`:

- If the spawn prompt **pre-answers** a checkpoint, take the pre-answered option and continue without waiting for a human.
- If a checkpoint is **not** pre-answered, it is a genuine decision point — stop and emit `## Clarification Needed` (Rule 4). Never guess, and never sit waiting for input that cannot arrive.
- **Exception — `/bmad-retrospective`:** deliberately human-in-the-middle even under `/epic-cycle`. Its checkpoints, party-mode dialogue, and WAIT points are NEVER pre-answered, and it is never invoked with `-H` / `--headless`. It runs lead-side, so every elicitation reaches the user directly.

Outside `/epic-cycle`, checkpoints elicit the user normally.

## Rule 13 — Working-directory discipline (all skills and their internal subagents, under `/epic-cycle`)

Every spawned agent operates from the absolute working directory stated in its spawn prompt — in a parallel run that is the epic worktree root, never the main checkout. Verify `git rev-parse --show-toplevel` equals the stated path BEFORE reading state, editing files, or auditing. Skills that spawn internal subagents (`bmad-code-review`'s review layers `blind-hunter` / `edge-case-hunter` / `verification-gap` / `acceptance-auditor`, `bmad-build-auto`'s implementation-handoff subagent and its review layers, party-mode personas) must pass the path and the verification requirement into every internal prompt. Findings produced from the wrong checkout are invalid — discard and re-run; never report them. (Pilot 2026-07-10: an Acceptance Auditor defaulted to the main checkout, saw a clean tree, and reported a completed story as unimplemented — 5 false CRITICAL findings.)

## Rule 14 — ASCII-escape discipline for source code (`bmad-build-auto`, `bmad-qa-generate-e2e-tests`, `bmad-code-review`)

Author non-ASCII characters in source code via escape sequences (`'\u2026'`, `'\uFEFF'`), never as literal bytes — literal invisible or exotic characters are unreviewable in diffs and get silently normalized by editing tools. A literal non-ASCII byte in code is a review finding; the fix is the escape form. Prose files (markdown docs, comments where project convention allows) are exempt. (Pilot: a literal U+FEFF inside a BOM-strip regex and a raw U+2026 both required review patches; the reviewer's own Edit tool normalized the literal BOM away mid-patch.)

## Rule 15 — Finding disposition bar (`bmad-code-review` + lead/runner, under `/epic-cycle`)

Every review finding is dispositioned AT REVIEW TIME — fix, or close with a named reason. "Deferred" is an explicit exception, never a default state. Each finding carries four fields: severity (high/med/low), **fix-risk** (low/med/high + one-line justification), footprint (in-story / in-epic / out-of-footprint), spec-status (clear / spec-bound). Disposition is a lookup, not a debate:

| Finding | Disposition |
| --- | --- |
| HIGH | Fix now (rework loop). Sole exception: explicit user waiver via `## Clarification Needed`, logged `high_waived`. |
| MED, fix-risk ≤ med, in-footprint | Fix now (rework loop). |
| MED, fix-risk high OR out-of-footprint | `escalated` — ledgered and surfaced at this epic's merge gate as a named decision. Does not block story `done`. |
| LOW two-way door (≈≤15 changed lines incl. its test, in-story footprint, spec-clear, suite green after) | Fix in-story: mechanical → reviewer patches; behavioral-but-trivial → `## Fix Pack`, ONE bounded dev iteration. Leftovers take the rows below. |
| Fix would alter AC'd/specified behavior (spec-bound) | Close `by-design` at emission; rationale recorded once. Reopens only via spec amendment (Rule 5 path or an X.0 product decision). |
| No realistic user-reachable failure (theoretical hardening) | Close `wontfix-theoretical` at emission + one line naming what would make it real. |
| Real issue, out-of-footprint | `routed` — ONE canonical ledger entry per root cause; later sightings append an `occurrence`, never a new entry. Occurrence count is a priority signal. |
| Genuine product/preference call | `decision-pending` — batched to the user at the next gate; decided once; terminal either way. |

Ledger (`_bmad-output/implementation-artifacts/deferred-work.md`): canonical entries carry `status:` (`open | escalated | routed | by-design | wontfix-theoretical | decision-pending | resolved-by:<story>`), originating story, severity + fix-risk, occurrences, rationale, suggested resolution. Status changes are APPENDED annotation lines (union-merge-safe) — never rewrite prior lines. Consult the ledger before filing; adjudicated items are never re-reported. Terminal-entry rationales are calibration context for future reviews. Cap: more than 8 `open`+`routed` entries at an epic's close makes the next Story X.0 a mandatory fix-or-close pass. Anything the size of real work is a story, not a fix-pack item.

**Three writers, one ledger.** (a) `bmad-build-auto` never writes the ledger — it records deferred findings in the spec's frontmatter `deferred:` list (`summary` / `evidence` / optional `location`, `severity`). The **lead harvests** every new item into `deferred-work.md` as a canonical entry after each `dev_complete` (status `open` or `routed` by footprint; severity from the item; fix-risk assessed by the lead; `source_spec:` = the spec path). (b) `bmad-code-review` appends its `defer` findings under its own upstream heading (`## Deferred from: code review of <spec-basename> (<date>)`); Rule 15 fields are appended as annotation lines beneath each bullet — never reformat upstream output. (c) The lead/runner writes dispositions and occurrences. A `deferred:` item that never reaches the ledger is invisible to Story X.0 triage — the harvest is mandatory, not best-effort.

## Rule 16 — Clean tree before every `bmad-build-auto` dispatch (lead/runner, under `/epic-cycle`)

`bmad-build-auto` requires a clean working tree at its step-01 version-control sanity check (HALT on a dirty tree / `version-control metadata not writable`) — that check runs on story-key and intent dispatches (the plan stage); a spec-path dispatch early-exits past it — and it commits only the reviewed-diff files at finalize, then verifies the whole tree is clean (HALT `finalization left repository dirty`). Either way, anything uncommitted when a dispatch starts ends the run. The lead's write-ahead bookkeeping (cycle log, `sprint-status.yaml`, `deferred-work.md`, a freshly planned spec, the epic-context cache, QA's test summary, saved patches) therefore MUST be committed before every dispatch: **write-ahead → bookkeeping commit → spawn.** Bookkeeping commits stage only `_bmad-output/implementation-artifacts/**` (cycle logs, `sprint-status.yaml`, `deferred-work.md`, `spec-*.md`, `epic-*-context.md`, `tests/test-summary.md`, `*.patch`) — never `.vscode/settings.json`, never source files — land on the epic branch under the SC-3 assertion, and use a `chore(epic-N): bookkeeping <story-id> <stage>` message. This requires `_bmad-output/implementation-artifacts` to be **tracked** (not gitignored) in the project — the pre-flight checks it. A `blocked` result naming either condition above is a missed bookkeeping commit until proven otherwise — fix the tree, do not re-spawn blindly.

**The one sanctioned source-file bookkeeping commit — the rework commit.** Before a rework re-dispatch (Rework Loop, Fix Pack, or a failed smoke that re-enters implement), QA's test files and the reviewer's applied patches are still uncommitted source changes (those spawns are forbidden to commit). The lead commits them together with the re-opened spec and the bookkeeping files as `chore(epic-N): rework <story-id> iteration <k>` on the epic branch (SC-3 assertion) so the tree is clean for the dispatch. That commit is part of the story's history, not a violation of this rule.

## Project-specific rules (add below as retros surface them)

> Add additional rules here as retrospectives identify durable patterns. Number sequentially after Rule 16. Each rule should state what it applies to, the obligation, and (briefly) why.
````

The customization mechanism (BMAD ≥ 6.11): each skill ships `.claude/skills/<skill>/customize.toml` (installer-owned, overwritten on update); project overrides live in `_bmad/custom/<skill-dir-name>.toml` (team, committed) and `<skill-dir-name>.user.toml` (personal, gitignored). Scalars replace, lists append, arrays-of-tables merge by `id`/`code`. The key is the **skill directory name**. An override that fails to parse makes the renderer HALT — Step 4 verifies every file below parses.

### File 2: `_bmad/custom/bmad-build-auto.toml`

```toml
# /epic-cycle: load the cross-cutting rules registry into the unattended build skill
# (plan + implement stages). Lists append to the skill's defaults.
[workflow]
persistent_facts = [
  "file:{project-root}/_bmad/custom/skill-rules.md",
]
```

### File 3: `_bmad/custom/bmad-build.toml`

```toml
# /epic-cycle: the interactive build skill is NOT a pipeline stage, but developers run it
# by hand in pipeline projects. Load the rules registry, and disable open_spec (its default
# launches `code -r` — an editor window — which must never fire from an unattended session).
[workflow]
persistent_facts = [
  "file:{project-root}/_bmad/custom/skill-rules.md",
]
open_spec = ""
```

### File 4: `_bmad/custom/bmad-qa-generate-e2e-tests.toml`

```toml
[workflow]
persistent_facts = [
  "file:{project-root}/_bmad/custom/skill-rules.md",
]
```

### File 5: `_bmad/custom/bmad-code-review.toml`

```toml
[workflow]
persistent_facts = [
  "file:{project-root}/_bmad/custom/skill-rules.md",
]
```

---

## Step 3: Write `.claude/commands/epic-cycle.md`

Write everything between the BEGIN and END markers below to that file path, verbatim, including the frontmatter. Overwrite any existing file (you should have already backed it up in Step 1).

```text
=== BEGIN .claude/commands/epic-cycle.md ===
```

---
description: Run the BMAD Method epic development cycle for one or more epics
---

You are executing the BMAD Method development implementation cycle for one or more epics. Stories run sequentially by default; independent stories within the same epic may be processed as a parallel batch — see "Smart Parallelism" below.

**Epic range:** $ARGUMENTS (e.g., `1-3` for Epics 1 through 3, `2` for a single epic). If empty, prompt the user for the range.

## Pre-flight Runtime Check

Uses the standard `Agent` tool to spawn pipeline-stage subagents and the `Skill` tool for lead-side skill invocations. No experimental flag required.

**Lead model gate (first action, before any other gate):** this command's `model: opus` frontmatter pin is officially documented but currently IGNORED at runtime (anthropics/claude-code #45191) — never assume it applied. Read your own model declaration from your system prompt ("You are powered by the model named …"). If the lead is an Opus-tier-or-higher model (Opus, or an above-Opus tier such as Fable/Mythos): proceed and log `lead_model_gate model=<detected> action=proceed`. Otherwise STOP and ask the user: switch the session (`/model opus`, or restart with `claude --model opus`) and re-invoke, or explicitly accept a lower-tier lead for this run — acceptance is logged `lead_model_gate model=<detected> action=user_accepted` so any later quality dip is attributable. Rationale: the lead's judgment artifacts (story specs, merge-conflict resolutions, ADR verdicts, DAG analysis) are the pipeline's least-reviewed outputs; the stage→model map assumes they come from the highest tier in the run. Stage subagents are unaffected either way — they receive explicit `model` parameters on their Agent calls, which DO work. Above-Opus note: the gate accepts Fable/Mythos-tier leads, but Opus is the intended price/performance point for the lead (~2x the cost for marginal lead-side gain) — treat an above-Opus lead as a deliberate exception for an exceptionally hard epic, never a standing default.

If `Agent` is a deferred tool, load its schema via `ToolSearch` with `"select:Agent"` before first use. If `Agent` is unavailable, halt and surface to the user.

**BMAD + runtime gate (second action):** read `installation.version` from `_bmad/_config/manifest.yaml` and require ≥ 6.11.0 — this command drives `bmad-build-auto`, which does not exist earlier (6.10 projects: use the pre-6.11 kit). Run `uv --version`; HALT with the install pointer (https://docs.astral.sh/uv/) if it fails — `bmad-build-auto` renders itself through `uv run _bmad/scripts/render_skill.py` and halts on activation without it. Then run `uv run --no-cache _bmad/scripts/resolve_config.py --project-root <abs-root> --key core.project_name`: exit 0 proves uv can run BMAD's scripts (Python ≥ 3.11 available or provisioned); exit 3 means no Python 3.11+ — HALT. Verify these exist: `.claude/skills/bmad-build-auto/SKILL.md`, `.claude/skills/bmad-code-review/SKILL.md`, `.claude/skills/bmad-qa-generate-e2e-tests/SKILL.md`, `.claude/skills/bmad-sprint-planning/scripts/sprint_plan.py` (on a plugin-namespaced install, the equivalent paths). Verify the durable state is tracked: `git check-ignore -q _bmad-output/implementation-artifacts` must FAIL (exit 1) — if the directory is gitignored, HALT: cycle logs, `sprint-status.yaml`, specs and the ledger must live on the epic branch (resume, bookkeeping commits, and the parallel merge queue depend on it); the user removes `_bmad-output/` from `.gitignore` (keeping `_bmad/render/`, `*.user.toml`, `.worktrees/` ignored). Log `runtime_gate bmad=<version> uv=<version>`.

**`SPRINT_PLAN` shorthand.** Throughout this command, `SPRINT_PLAN` means `uv run --no-cache <path-to>/bmad-sprint-planning/scripts/sprint_plan.py`, where `<path-to>` is `.claude/skills` (or the plugin-namespaced skills directory). Two more placeholders recur below: `<impl>` and `<planning>` (also written `<implementation_artifacts>` / `<planning_artifacts>`) are the `implementation_artifacts` / `planning_artifacts` values from `_bmad/config.toml` `[modules.bmm]` with `{project-root}` substituted — by default `_bmad-output/implementation-artifacts` and `_bmad-output/planning-artifacts`. It is BMAD's deterministic tracker script (JSON in, JSON out; `uv run` may print an `Installed N package(s)` line to stderr — ignore it). Its three subcommands replace the retired `/bmad-sprint-status mode=data|validate`:

- `SPRINT_PLAN status --status-file <impl>/sprint-status.yaml` → per-status counts, `open_action_items`, `recommendation.story_key`, `all_done`.
- `SPRINT_PLAN validate --status-file <impl>/sprint-status.yaml` → `valid`, `problems`.
- `SPRINT_PLAN generate --epic-file <planning>/epics.md --status-file <impl>/sprint-status.yaml --stories-dir <impl> --project <project_name> --date "<MM-DD-YYYY HH:MM>" --set <key>=<status> [--set …]` → the lead's ONLY sanctioned status writer. The merge itself never downgrades, but **`--set` is the script's repair path and is applied unconditionally — it WILL downgrade.** Before every `--set`, read the key's current value (`SPRINT_PLAN status` or the file) and refuse to write a lower rank (`backlog < ready-for-dev < in-progress < review < done`). `--set` on a key that is not in the generated plan fails (`ok: false`, "not in the generated plan") and writes nothing — a story must exist in the epic file first. Preserves comments; reports `explicit_set`. Use `--dry-run` when unsure. (`<epic-file>` may repeat for multi-file epics; `<project_name>` from `_bmad/config.toml` `[core] project_name`; `<impl>` / `<planning>` are the `implementation_artifacts` / `planning_artifacts` values from `_bmad/config.toml` `[modules.bmm]`.)

## Task Sequence

**Per Epic (setup, executed once per epic before any stories):**

1. **Lead** verifies a clean working tree across the parent repo and every submodule listed in `.gitmodules`; halts on dirty state.
2. **Lead** determines per-repo resume mode (see "Resume Semantics").
3. For repos in FRESH mode: **Lead** verifies (or creates with user authorization) the feature branch per Rule SC-1, then verifies (or creates) the epic branch `{TICKET}-epic{N}` per Rule SC-2.
4. **Lead** checks every affected repo out to `{TICKET}-epic{N}` and logs `epic_branch_checked_out`.
5. **Lead** executes `/bmad-sprint-planning` directly, **headless**, and branches on its readiness `gate` (see "Sprint Planning Per Epic").
6. If a previous epic's retrospective, `deferred-work.md`, or open `action_items` in `sprint-status.yaml` have unresolved items, **Lead** reviews them, triages, and creates Story X.0 via a `bmad-build-auto` plan spawn (see "Retrospective Review & Story X.0 Creation").

**Per Story (executed once per story in the epic):**

1. **Lead** asserts the branch, writes `story_planning` to the cycle log, and makes the bookkeeping commit (Rule 16 — the tree MUST be clean before every `bmad-build-auto` dispatch).
2. Agent — **PLAN**: `/bmad-build-auto` on the Opus tier, prompt = the explicit sprint-status story key plus `Halt after planning.` It writes `spec-{key}.md` and halts with status `ready-for-dev`. **Lead captures the spec path** and logs `story_created`.
3. **Lead** gates the spec: Integration-AC validation (Rules 1/2), ADR mapping (Rule 6); logs `spec_validated`; sets the story `ready-for-dev` via `SPRINT_PLAN generate --set`; bookkeeping commit (everything under `implementation-artifacts`: spec, log, tracker).
4. **Lead** sets the story `in-progress` (+ `epic-{N}` lift) via `SPRINT_PLAN`, bookkeeping commit; then Agent — **IMPLEMENT**: `/bmad-build-auto` on the Sonnet tier, prompt = the spec path. It implements (via its handoff subagent), self-reviews with its four layers, finalizes the spec `status: done`, and makes a local commit. **Lead** reads the spec frontmatter, harvests `deferred:` into the ledger (Rule 15), sets the story `review` via `SPRINT_PLAN`, and logs `dev_complete` with `build_sha=`.
5. **Lead** executes any ADR-tooled AC verifications (see "ADR-Aware Execution").
6. Agent: `/bmad-qa-generate-e2e-tests` (scope pre-answered to this story's deliverable = `git diff --name-only <baseline_revision>..HEAD`).
7. Agent: `/bmad-code-review` on the Opus tier, with the spec path as the explicit argument (`review_mode = full`). If the review leaves the story `in-progress` (unresolved high/medium findings), run the Rework Loop (max 3 iterations) before proceeding.
8. **Lead** performs per-story smoke (see "Per-Story Smoke").
9. **Lead** commits (QA tests, review patches, bookkeeping) and pushes — **only to the epic branch** in every affected repo, never to main/master/develop (Rule SC-3 + SC-6).

A story therefore produces several commits on the epic branch: bookkeeping commits, the plan commit (spec), `bmad-build-auto`'s finalize commit (`build_sha`), and the lead's post-smoke commit (`committed sha`). That is by design; the epic's `--no-ff` merge preserves the graph.

**End of Epic (executed once per epic after all stories):**

1. **Lead** sets `epic-{N}: done` via `SPRINT_PLAN generate --set epic-{N}=done` — a transition no skill writes (see "Status Ownership") — and logs `epic_status_done`.
2. If `_bmad/custom/model-overrides.yaml` is armed (`stack_risk: uncommon` or `review_tier: mixed`), **Lead** runs the model-tier checkpoint (see "Model Strategy") and logs `model_tier_checkpoint` — plus `model_tier_changed` if the policy file is updated.
3. **Lead** pauses: "Run a retrospective?" If yes, execute `/bmad-retrospective` fully interactive — the human-in-the-middle exception; see "Retrospective Per Epic".
4. **Lead** pauses: "Merge `{TICKET}-epic{N}` into the feature branch and delete the epic branch (local + remote)?" — per Rule SC-4. If yes, execute the merge in each affected repo (submodules-first, parent last).

## Execution Guidelines

Each pipeline-stage task is delegated via the `Agent` tool. Lead-side skills (sprint planning, retrospective) are invoked directly via the `Skill` tool. Story planning is a **spawned** stage in v6.11 (`bmad-build-auto` never advances to another story, so the old race-ahead concern that kept story creation lead-side is gone) — what stays lead-side is the *validation* of the plan. For `bmad-build-auto` stages the completion contract is the spec file (frontmatter `status` + `## Auto Run Result`), not prose. For QA/CR stages, if a return is missing closing-summary sections, the lead extracts the file list from `git status --short` plus `git diff --name-only <baseline_revision>..HEAD` — this is normal extraction.

`/bmad-code-review` triages findings into **decision-needed / patch / defer / dismiss** buckets at **low / medium / high** severity. Under `/epic-cycle` the review agent applies every patch-bucket finding and resolves decision-needed items using best judgment plus the BMAD skill rules; only a genuine user-preference or spec-contradiction question comes back as `## Clarification Needed`. The BMAD skills must be invoked via `Skill`; don't skip steps. `/bmad-retrospective` is the one deliberate human-in-the-middle exception to the autonomous loop — it MUST run in interactive mode, and every one of its elicitation stops must reach the user.

## Permission Mode (Critical)

Subagents **inherit the lead session's permission mode** — on current Claude Code builds the `Agent` tool's `mode` parameter is accepted but ignored ("Deprecated; ignored. Subagents inherit the parent session's permission mode"). The effective control is therefore how the lead session was started: for an unattended run launch it with `claude --permission-mode bypassPermissions` (or `--dangerously-skip-permissions`), or `--permission-mode auto` where the harness offers it with a configured environment. Keep passing `mode: "bypassPermissions"` on every `Agent` call anyway — it is harmless on current builds and still honoured on older ones. Without an unattended permission mode the subagent prompts for every file edit and bash command and the pipeline stalls. No permission mode auto-answers `AskUserQuestion` — that tool always elicits the human. Therefore `/bmad-retrospective` is lead-only (spawned subagents cannot reliably surface their elicitation). Run unattended cycles only in a trusted/isolated environment.

Pipeline-stage subagents must be spawned **synchronously** — never backgrounded. A backgrounded subagent never hands control back in an unattended run and the pipeline stalls (this is why `bmad-build-auto` mandates synchronous subagent calls). Parallel batches are still synchronous: N `Agent` calls in ONE message resolve together.

`bmad-build-auto` **requires** subagents of its own (it HALTs `blocked` / `no subagents` otherwise): the stage agent that runs it must be `subagent_type: "general-purpose"` (full tool set including `Agent`). Nested spawning to depth 3 (lead → build-auto stage agent → its handoff/review subagents) is verified on Claude Code (2026-08-26 spike).

## Model Strategy (Critical for cost + quality)

The pipeline runs **efficient implementer + expensive reviewer**: a Sonnet-tier model writes code and tests; an Opus-tier model reviews them. This also satisfies BMAD's own guidance that code review should run in "fresh context, ideally different LLM" than the implementer.

Per-skill model pinning ("skill optimization" — writing `model:` into each SKILL.md's frontmatter) is an **optional, per-project** pass: upstream BMAD v6 ships no `model:` frontmatter, the field is not an officially documented SKILL.md field, and some projects deliberately skip the pass. `/epic-cycle` must behave identically either way, so the command carries the default stage→model map itself:

| Stage | Skill | Model | Why |
| --- | --- | --- | --- |
| Plan | `/bmad-build-auto` + `Halt after planning.` | `opus` | The story spec is the highest-leverage context-fusion step; its judgment lets everything downstream run cheaper. Its epic-context compile subagent inherits this tier. |
| Implement | `/bmad-build-auto` on the planned spec | `sonnet` | Near-Opus coding quality. Its implementation-handoff subagent and its four self-review layers (`blind-hunter`, `edge-case-hunter`, `verification-gap`, `intent-alignment`) inherit this tier ("same model capability as the current session") — a cheap self-review, not the gate. |
| QA | `/bmad-qa-generate-e2e-tests` | `sonnet` | Bounded test implementation |
| Code review | `/bmad-code-review` | `opus` | The independent adversarial gate — BMAD's own template note: "Dev moves story to 'review', then runs code-review (fresh context, different LLM recommended)". Its review layers (`blind-hunter`, `edge-case-hunter`, `verification-gap`, `acceptance-auditor`) run at the model passed on this spawn because nested subagent spawns inherit the parent's model when no `model` parameter is given. Review MUST NOT run on a lighter model than the implementation. A project's `review_tier: mixed` (see the model-policy file below) re-tiers the three hunter layers only. |

On an **unpinned** project the map is the operative source. On a **pinned** project frontmatter resolves first and normally agrees with the map; if a pin disagrees, the pin wins — treat it as a deliberate project re-pin (never "correct" it), and the `model=` telemetry records what actually ran either way. The one skill that runs at two tiers is `bmad-build-auto`: a frontmatter pin on it documents the **plan** tier; the implement tier comes from the map or the policy file's `implement:` key, never from the frontmatter.

**Upstream levers (v6.11):** `bmad-build-auto`'s `implementation_handoff` and every skill's `review_layers[].instruction` are free-prose overrides in `_bmad/custom/<skill>.toml` — the sanctioned way to route one internal subagent to another model or an external tool. `/epic-cycle` does not need them (it passes `model` on the stage spawn), but a project that must run the implement stage inline (e.g. a runner without nested-spawn headroom) can put `model: sonnet` into the handoff prose there.

### Project model-policy file (`_bmad/custom/model-overrides.yaml`, optional — highest priority)

A project-local re-pin surface that survives BMAD upgrades (the installer never touches `_bmad/custom/`). When present, model resolution becomes: **overrides file → frontmatter → stage map → inherit**. Schema:

```yaml
# Project-local model policy. overrides win over SKILL.md frontmatter and the stage map.
stack_risk: uncommon            # uncommon | standard (default). uncommon arms the end-of-epic model-tier checkpoint.
review_tier: full-opus          # full-opus (default) | mixed — controls bmad-code-review's internal review layers
overrides:                      # optional: STAGE -> tier re-pins (plan | implement | qa | code-review)
  implement: opus               # bmad-build-auto implement stage (plan stays at its own key)
history:                        # append-only; every change records its evidence
  - date: 2026-07-19
    action: escalate-implement-to-opus
    evidence: "epic-2: high+med avg 2.5/story with implement=claude-sonnet-5; 2 rework loops (language semantics)"
    approved_by: user
```

Keys are **stages**, not skills, because `bmad-build-auto` serves two stages at two tiers. (Pre-6.11 policy files keyed `bmad-dev-story` / `bmad-quick-dev` / `bmad-qa-generate-e2e-tests`: read them as `implement` / `implement` / `qa` and offer to rewrite the file once.)

### Model-tier checkpoint (end of epic, lead-side)

Runs only when model-overrides.yaml exists with `stack_risk: uncommon` OR `review_tier: mixed`; evaluated immediately after `epic_status_done` against this epic's cycle log. (In Orchestrator Mode, the orchestrator runs it in the main checkout at the merge gate, after `epic_merged_to_feature`, against the epic's per-worktree cycle log.)

- **Escalation (uncommon stack):** if mean `cr_complete` high+med findings ≥ 2 per story with the implement stage on a Sonnet-tier model, OR ≥ 2 stories entered the rework loop for language-semantics defects, OR ≥ 2 stories' `dev_complete` show `review_loop_iteration ≥ 3` (build-auto's own bad-spec/patch loop thrashing) → recommend re-pinning `implement` / `qa` to `opus` for this project. Surface the evidence to the user; on approval, update `overrides:` + `history:`. Rationale: two rework iterations (extra Sonnet dev + extra Opus review) cost more than Opus-dev.
- **De-escalation offer (review layers):** after ≥ 2 consecutive epics with zero high and ≤ 1 medium finding per epic from Opus-tier review, the lead MAY offer `review_tier: mixed` (`blind-hunter` / `edge-case-hunter` / `verification-gap` → sonnet; `acceptance-auditor` stays at the parent model; never below the implementation tier).
- **Rollback (mandatory, not user-gated):** if `review_tier: mixed` is active and any `smoke_complete` in this epic recorded `defects_caught>0`, revert to `full-opus` immediately and record it.

**Telemetry is mandatory:** every evaluation logs `model_tier_checkpoint`; every change to model-overrides.yaml logs `model_tier_changed` with `direction=`, `stages=`, `from=`, `to=`, `reason=`, and `evidence=` (see Workflow Telemetry). A tier change absent from the cycle log did not happen — never edit the policy file without the paired log entry and matching `history:` record.

Lead-run gate skills (sprint planning, retrospective) and lead-side gates (spec validation, ADR verifications, smoke, merge-conflict decisions) execute inline on the lead's model — run the lead on an Opus-tier model so those judgment calls get maximum quality. Story planning is a spawned Opus stage, so it is tier-guaranteed independently of the lead.

## Skill Tool Invocation (Critical)

All BMAD skills must be invoked via the **`Skill` tool**, not interpreted inline. Agent spawn prompts must explicitly state: "use the `Skill` tool to invoke /bmad-build-auto" (or the relevant skill). Without this directive, agents may try to execute skill logic themselves. For `bmad-build-auto` this matters twice over: its SKILL.md is a bootstrap that runs `uv run render_skill.py` and then follows the rendered `workflow.md` — an agent that "reads the skill" instead of invoking it never renders and runs stale or unresolved workflow text.

## Agent Invocation Pattern (Required)

Each pipeline-stage subagent is a single `Agent` tool call. The `Agent` tool returns the agent's final assistant message as its result — that is the completion signal. No separate envelope, no team membership, no shutdown handshake.

For each pipeline stage, the lead:

1. **Resolves the stage's model.** Resolution order: (a) if `_bmad/custom/model-overrides.yaml` exists and its `overrides:` map names the **stage** (`plan` | `implement` | `qa` | `code-review`), that wins unconditionally (project model policy — see Model Strategy); (b) else if the stage skill's YAML frontmatter — `.claude/skills/<skill-name>/SKILL.md`, or the plugin-namespaced install path — declares a `model:` field (e.g. `opus` / `sonnet` / `haiku`), that wins for every stage except `implement` (a `bmad-build-auto` pin documents the plan tier only); (c) otherwise use the Model Strategy map above (plan → `opus`, implement → `sonnet`, qa → `sonnet`, code-review → `opus`); (d) for a stage not in the map, omit the parameter and let the sub-agent inherit the lead's model. Read the actual file and frontmatter — do not assume. On a vanilla BMAD install (c) is the operative source (upstream v6.11 still ships no `model:` frontmatter); projects that ran a model-pinning pass over their skills resolve via (b), and the pins normally agree with the map.
2. **Ensures the tree is clean** if the stage is `bmad-build-auto` (Rule 16): every pending bookkeeping write is committed first; `git status --short` must be empty in the stage's working directory (and in every mounted submodule).
3. **Spawns** the subagent via `Agent` with:
   - `subagent_type: "general-purpose"` (required for `bmad-build-auto` stages — they spawn their own subagents)
   - `model: <the model resolved in step 1>` — pass this so the stage runs on the model the pipeline intends, NOT the lead's inherited model. Omit the parameter only when step 1 resolved nothing (stage not in the map and no frontmatter declaration).
   - `mode: "bypassPermissions"`
   - `description: <3-5 word task description>`
   - `prompt: <full task — see Spawn Prompt Skeleton below>`
4. **Reads the result.** For `bmad-build-auto` stages: re-read the spec file from disk — frontmatter `status` (`ready-for-dev` after a plan spawn; `done` after an implement spawn; `blocked` otherwise) and the `## Auto Run Result` section (`Status:` / `Blocking condition:`); the agent's prose is advisory. For QA/CR stages: the returned message's closing-summary sections (`## Files Modified`, `## Tests Added`, `## Decisions`, `## Issues Encountered`).
5. **Falls back** to `git diff --name-only <baseline_revision>..HEAD` + `git status --short` if closing sections are missing.
6. **Records** the stage in the cycle log, setting `model=<the model the sub-agent actually ran on>` (the resolved stage model, or the inherited lead model when none was declared) per the telemetry spec.
7. **Proceeds** to the next stage. No shutdown step.

**Lead-run gate skills run on the lead's model.** `/bmad-sprint-planning` and `/bmad-retrospective` are invoked by the lead directly via the `Skill` tool (not spawned as sub-agents), so they execute in the lead's context and their frontmatter `model:` is NOT applied — there is no per-skill model switch for inline lead execution. This is by design (these gates must stay lead-side; see "Sprint Planning Per Epic" and "Retrospective Per Epic"). Honoring `model:` therefore applies to the spawned pipeline stages (plan / implement / qa / code-review) only.

### Spawn Prompt Skeleton

Every Agent spawn prompt must include, in this order:

1. The literal marker `**Epic Cycle Stage: <plan|implement|qa|code-review> for Story <id>**`.
2. The dispatch anchor: for **plan**, the sprint-status story key (e.g. `3-2-digest-delivery`) — never a spec path, never a spec folder; for **implement / qa / code-review**, the spec file path captured at `story_created`.
3. The list of files modified by upstream stages (for QA: `git diff --name-only <baseline_revision>..HEAD`; for code review: that list plus QA's `## Tests Added`).
4. The project's ADR registry path (typically `docs/adr/`) as factual context.
5. The directive: `Use the Skill tool to invoke /<bmad-skill-name>.` For `bmad-build-auto` the skill's own argument is the dispatch anchor from item 2 — for the plan stage append the exact sentence `Halt after planning.` to the argument.
6. The stage-specific rule block (see below) — for QA/CR including its **pre-answered checkpoints**: every interactive menu/halt the skill will hit, with the chosen option, so the agent never waits on input that cannot arrive (Rule 9). `bmad-build-auto` has no checkpoints; its block carries rules only.
7. The completion-contract directive — for QA/CR quote the closing-summary section names inline; for `bmad-build-auto` state that the spec file's frontmatter `status` + `## Auto Run Result` is the contract and that the agent must not push.
8. Skill-specific context.

### Stage-specific rule blocks (copy into spawn prompts)

**Plan spawn (`bmad-build-auto`, Opus tier) — append:**

```text
Dispatch: invoke /bmad-build-auto via the Skill tool with the argument `<story-key> Halt after planning.` — the sprint-status story key (e.g. `3-2-digest-delivery`) followed by that exact sentence. This is the skill's epic-story path: it resolves the epic/story numbers from the key, reuses the committed `<impl>/epic-<N>-context.md` (or would compile it via its own subagent — the lead pre-warms it so that never happens), loads the previous `done` story of this epic for continuity, plans the spec, verifies it against its READY-FOR-DEVELOPMENT standard, sets frontmatter `status: ready-for-dev`, and HALTs. Plan ONLY this story. Do NOT supply a spec folder or stories.yaml (folder+id dispatch is for bmad-spec projects, not this pipeline). Do NOT implement anything.

Rules for this stage (from skill-rules.md):

- Rule 1/2 (Integration ACs, Consumed-by/Consumes): if this story introduces a service, module, or shared component, the spec MUST carry at least one Integration AC (an I/O & Edge-Case Matrix row or a Tasks & Acceptance item of the form "consumer X reads from this and produces observable effect Y") — or an explicit "No consumers in this story; the first consumer will be Story X.Y." note under ## Design Notes — plus `Consumed-by:` / `Consumes:` lists under ## Design Notes.
- Rule 5 (NFR tripwire): an NFR that is unmeasurable, contradictory, or impossible as worded is an `intent gap` HALT that names the NFR and your recommended amendment — never plan around it.
- Rule 6 (ADRs): consult the ADR registry at the path above and record the ADRs that govern this story under ## Design Notes, so the implement stage and the reviewer can check against them.
- Rule 13 (working directory): operate from the absolute working directory stated above; verify `git rev-parse --show-toplevel` matches before reading planning artifacts; pass the same path + verification into the epic-context compile subagent.

Completion contract: the spec file (its path is your final report's first line, as `SPEC: <path>`) with frontmatter `status: ready-for-dev` and a `## Auto Run Result` section that contains the two lines `Status: <final status>` and `Blocking condition: <condition or none>` verbatim (the skill's HALT protocol spells them out only for the skeleton case — emit them for the existing-spec case too). If you HALT with `status: blocked`, report the blocking condition verbatim. A valid, committed `epic-<N>-context.md` already exists — reuse it; do not recompile. 🚫 Do NOT `git commit` or `git push` — the plan stage leaves the spec uncommitted for the lead's validation gate.
```

**Implement spawn (`bmad-build-auto`, Sonnet tier) — append:**

```text
Dispatch: invoke /bmad-build-auto via the Skill tool with the argument = the spec file path above (frontmatter status `ready-for-dev`). The skill resumes at its implement step: it captures `baseline_revision`, runs its implementation-handoff subagent against the spec, runs the spec's `## Verification` commands and the Matrix Test Audit (acceptance criteria are judged at its review step), runs its four review layers in parallel, triages (`patch` fixes inline; `defer` goes to the spec frontmatter `deferred:` list; `intent_gap` HALTs), then finalizes: `status: done`, followed by ONE local commit of the reviewed diff plus the spec. The tree is clean on entry (the lead verified it) and the skill verifies it is clean on exit.

Rules for this stage (from skill-rules.md):

- Rule 5 (NFR tripwire): an un-implementable NFR is an `intent gap` HALT with your recommended amendment; do NOT work around with code comments + deferred-work.md.
- Rule 6 (ADRs): match the implementation to the ADRs recorded under the spec's ## Design Notes and any others referenced by its ACs. An ADR conflict you cannot resolve within the spec is an `intent gap`, not a judgment call.
- Rule 13 (working directory): operate from the absolute working directory stated above; verify `git rev-parse --show-toplevel` matches before editing anything, and pass the same path + verification requirement into the handoff subagent and every review-layer subagent.
- Rule 14 (ASCII escapes): author non-ASCII characters in source via escape sequences (`'…'`), never literal bytes.
- Rule 15 (ledger): record deferred findings ONLY in the spec's frontmatter `deferred:` list exactly as the skill specifies — the lead harvests them into deferred-work.md; do not write the ledger yourself.
- Rule 16 (clean tree): your finalize commit lands on the current branch (the epic branch); commit exactly what the skill's finalize step specifies and nothing else. 🚫 NEVER `git push`.

Completion contract: the spec file's frontmatter `status` (`done` on success; `blocked` + blocking condition otherwise) and its `## Auto Run Result` section, which must contain the two lines `Status: <final status>` and `Blocking condition: <condition or none>` verbatim. On `blocked`, HALT and report — do not improvise a fix by re-running steps outside the skill.
```

**QA spawn — append:**

```text
Pre-answered checkpoint (Rule 9): the skill's first step asks what to test — answer: the deliverable of Story <id>, i.e. the files listed above (the diff since `<baseline_revision>`), whose acceptance criteria are the spec's Tasks & Acceptance and I/O & Edge-Case Matrix at <spec path>. Do not ask; do not broaden scope to unrelated features. If the project has no test framework yet, choose the stack-appropriate default, record the choice in ## Decisions, and proceed.

Rules for this stage (from skill-rules.md):

- Rule 8 (test discoverability): generated tests MUST be discoverable by the project's default test suite — (a) correct naming convention, (b) not excluded by ignore files, (c) not tagged in a way that opts them out of the default run.
- File-list completeness: append every test file you create to the spec's `## Verification` section (marked `(QA)`), so the spec remains the complete record of the story's files — not just your closing summary.

🚫 Do NOT `git commit` or `git push`. Leave ALL changes uncommitted in the working tree — the lead commits after the per-story smoke gate.

End your final message with these sections, in order:

## Files Modified
- <full path from repo root>
(or "(none)")

## Tests Added
- <full path from repo root>
(or "(none)")

## Decisions
- <one-line summary>
(or "(none)")

## Issues Encountered
- <one-line summary>
(or "(none)")

If you cannot make confident progress for ANY reason — ambiguous ACs, missing prerequisite, user-preference choice, environment failure, or anything risking a stated constraint — STOP before the closing summary and end with a "## Clarification Needed" section instead (Rule 4): the question, what was tried, what is blocking. Do not guess; do not soldier on.
```

**Code-review spawn — append:**

```text
Pre-answered checkpoints (Rule 9 — the skill halts at each of these; take the answer below and continue, do not wait for a human):

1. Step-01 target + context: the explicit argument is the spec file at <spec path> (Tier 1 — this sets `{review_mode}` = "full" and arms the acceptance-auditor layer; never declare "no spec"). Its frontmatter carries `baseline_commit: <sha>` (the lead mirrored build-auto's `baseline_revision` there) — use it as the diff baseline exactly as step-01 describes; do NOT fall through to Tier 3/4. Diff source, in the skill's own terms: commit range `<baseline_revision>..HEAD` plus uncommitted working-tree changes plus untracked files — construct `{diff_output}` as `git diff <baseline_revision>` and, for each untracked file, `git diff --no-index /dev/null <path>`. Set {story_key} = `<story-key>` explicitly (the skill only discovers it on its own sprint-status scan, which Tier 1 skips) so its step-04 sprint-status sync works. Step-01's summary confirmation ("HALT and wait for user confirmation to proceed") → confirmed.
1b. Large-diff offer (step-01: "if `{diff_output}` exceeds approximately 3000 lines, warn the user and offer to chunk") → decline; review in full.
1c. Spec layout: this is a `bmad-build-auto` spec. Its `## Tasks & Acceptance` section IS the "Tasks/Subtasks section" — append your `### Review Findings` subsection there; "the story file Status section" means the frontmatter `status:` field.
2. Decision-needed findings → resolve each with best judgment against skill-rules.md and the ADR registry. Only a genuine user-preference or spec-contradiction question becomes ## Clarification Needed.
3. Patch-handling menu → option 1 (apply every patch).
4. Final next-steps menu → option 3 (done). Do NOT start the next story.

Rules for this stage (from skill-rules.md):

- Rule 3 (real-runtime test evidence): user-facing surface approved without a real-runtime test in the QA suite = high finding. (Distinct from the lead's manual per-story smoke, which is a separate later gate.)
- Rule 5 (NFR tripwire): unmeasurable NFR worked around with code comments + deferred-work.md instead of planning-artifact amendment = high finding.
- Rule 6 (ADR violations): for each AC constrained by an Accepted ADR, verify implementation matches. Mismatch = high (not a low deferrable).
- Rule 1 (Integration ACs): service-introducing story missing an Integration AC = high finding.
- Rule 15 (finding disposition bar): disposition every finding AT REVIEW TIME per the Rule 15 lookup, emitting fix-risk (low/med/high + one-line justification) on each — spec-bound → close `by-design` at emission; theoretical (no realistic user-reachable failure) → close `wontfix-theoretical` + one line naming what would make it real; LOW two-way door (≈≤15 changed lines incl. its test, in-story footprint, spec-clear) → patch now if mechanical, else return it in a `## Fix Pack` section for one bounded dev iteration; MED with high fix-risk or out-of-footprint → `escalated` (recorded for the merge gate, non-blocking); real out-of-footprint → `routed` canonical entry — CONSULT deferred-work.md FIRST and append an occurrence instead of re-filing an adjudicated item; genuine product call → `decision-pending`.

Review-layer model policy: read `_bmad/custom/model-overrides.yaml` (relative to the working directory stated in this prompt). If it sets `review_tier: mixed`, launch the defect-discovery layers — `blind-hunter`, `edge-case-hunter`, `verification-gap` (by `id` in the skill's review_layers) — with an explicit `model: sonnet` parameter on their Agent calls, and launch `acceptance-auditor` with no model override so it inherits your model. If the file is absent or says `review_tier: full-opus`, launch every layer with no model override (they inherit your model). Never launch any review layer on a lighter tier than the model that implemented the story. State in ## Decisions which review tier was applied and which layers ran.

Every ledger write follows Rule 15: ONE canonical entry per root cause in _bmad-output/implementation-artifacts/deferred-work.md. The skill's step-04 appends `defer` findings under its own heading (`## Deferred from: code review of <spec-basename> (<date>)`, one bullet per finding) — keep that upstream shape, and add Rule 15's fields as indented annotation lines beneath each bullet: `status:` (open | escalated | routed | by-design | wontfix-theoretical | decision-pending | resolved-by:<story>), originating story ID, severity + fix-risk, occurrence list, rationale, suggested resolution. Append-only (union-merge-safe); never rewrite prior lines. Consult the ledger BEFORE filing anything — including the entries the lead harvested from this story's build-auto `deferred:` list — an adjudicated item gets an occurrence annotation, not a new entry.

🚫 Do NOT `git commit` or `git push`. You MAY edit files to apply patches and update tracking docs (the spec's `### Review Findings`, deferred-work.md, sprint-status.yaml), but the lead commits everything (submodules-first) after the per-story smoke gate. Do NOT change the spec's frontmatter `status:` (it is bmad-build-auto's machine state; the lead re-opens the spec when rework is needed) — record your verdict in sprint-status.yaml and in your closing summary only. Do NOT write cycle-log entries — that is the lead's job.

The skill sets the story's final status itself: `done` when all decision-needed + patch findings are resolved and no high/medium remains unresolved (mediums dispositioned `escalated` per Rule 15 are recorded for the merge gate, not blocking); otherwise back to `in-progress`. Do not override that decision.

End your final message with these sections, in order:

## Files Modified
- <full path from repo root>
(or "(none)")

## Tests Added
- <full path from repo root>
(or "(none)")

## Decisions
- final story status (`done` or `in-progress`), resolved/deferred/dismissed counts, any high-severity fix names
(or "(none)")

## Issues Encountered
- <one-line summary>
(or "(none)")

If you cannot make confident progress for ANY reason — a genuine user-preference or spec-contradiction question, a missing prerequisite, an environment failure — STOP before the closing summary and end with a "## Clarification Needed" section instead (Rule 4): the question, what was tried, what is blocking. Do not guess; do not soldier on.
```

### Clarification protocol

If an agent returns with a `## Clarification Needed` section instead of the closing summary, the lead:

1. Reads the question from the returned message.
2. Surfaces it to the user with Story ID + context.
3. Waits for the user's answer.
4. Re-spawns the same stage's agent with the clarification baked into the prompt or written to the spec's `## Design Notes` (committed first — Rule 16).
5. Logs `<stage>_clarification_requested` before the re-spawn; the re-spawn's normal success entry (`story_created` / `dev_complete` / `qa_complete` / `cr_complete`) closes it.

**`bmad-build-auto` results map onto this protocol by blocking condition** (read from the spec's `## Auto Run Result`; the plan/implement stages emit no `## Clarification Needed` section):

| Spec `status` / blocking condition | Lead action |
| --- | --- |
| `ready-for-dev` (plan spawn) | Success — log `story_created`, run the spec gates. |
| `done` (implement spawn) | Success — harvest `deferred:`, set `review`, log `dev_complete`. |
| `blocked`: `intent gap`, `unclear intent`, `missing previous-story continuity decision`, `matrix ambiguity`, `spec failed ready-for-development standard`, or an unresolved-questions list | Clarification path. Surface the condition + `## Auto Run Result` to the user with Story ID. On answer, follow the **re-dispatch protocol** below. Log `<stage>_clarification_requested` / `<stage>_complete`. |
| `blocked`: `version-control metadata not writable`, `finalization left repository dirty`, `no subagents`, `context compilation verification failed` | Pipeline/environment defect (a missed bookkeeping commit — Rule 16; a non-general-purpose spawn; a missing or unparseable `epics.md` / failed epic-context pre-warm). Halt loudly, fix the cause, re-dispatch per the protocol. Never "answer" these as clarifications. |
| `blocked`: `review repair loop exceeded 5 iterations (non-convergence)`, `implementation verification failed`, `patch verification failed`, `matrix test audit failed`, `handoff conflicts with spec` | Treat as a failed rework cap: surface to the user with the spec's `## Review Triage Log`. The spec is wrong more often than the code. |
| `blocked`: `no epic spec found`, `no stories.yaml found`, `story id not found in stories.yaml`, `ambiguous story file match`, `unrecognized status in existing story file`, `missing spec_file before implementation`, `planned spec file disappeared before implementation` | A `/epic-cycle` dispatch bug (folder+id dispatch used in sprint mode; a spec path that does not exist or whose frontmatter was hand-mangled). Fix the anchor and re-dispatch per the protocol. |
| `blocked`: `blocked spec supplied`, `story already blocked` | The lead re-dispatched on a spec still at `status: blocked` — a kit bug, not a new clarification. Apply the re-dispatch protocol (reset the status first). |

**Re-dispatch protocol (any re-spawn after a `blocked` result).** build-auto routes strictly by the spec's frontmatter `status`: `draft` → plan, `ready-for-dev` / `in-progress` → implement, `in-review` → review, `done` → follow-up review pass, `blocked` → HALT `blocked spec supplied`. So a re-spawn on an unchanged `blocked` spec can never proceed, and a re-spawn with the **story key** while a spec already exists creates `spec-<key>-2.md` and ignores the edited file. Therefore, before every re-dispatch:

1. Apply the answer to the spec. For a **plan-stage** halt the answer usually belongs inside the `<intent-contract>` block (build-auto preserves that block verbatim when it resumes a `draft`) and/or `## Design Notes`; for an **implement-stage** halt it belongs in the non-frozen sections (`## Design Notes`, `## Tasks & Acceptance`, `## Spec Change Log`). Note the change in `## Spec Change Log`.
2. Reset the frontmatter `status`: `draft` to re-plan (the next run re-derives the spec around the preserved intent block and honours `Halt after planning.`); `in-progress` (or `ready-for-dev`) to re-implement.
3. Bookkeeping commit (Rule 16).
4. Re-spawn the same stage **on the spec path** — never on the story key once a spec exists.

### Pipeline Flow

```
Lead resolves ADR registry path (typically docs/adr/) — included in every spawn prompt.

For each epic in range:
  Lead verifies clean working tree (parent + every submodule); halts on dirty state.

  # IDE file-sync toggle applicability — conditional, IRIS/ObjectScript projects only (see Source Control Branching)
  ideSync = (.vscode/settings.json exists AND objectscript.conn.active == true)
  If ideSync: record original value   # sync STAYS ON except inside the two branch-op windows; never stage settings.json
  If ideSync: set objectscript.conn.active = false   # >>> Window A start — wraps resume-checkout + SC-1/SC-2 + epic-branch checkout

  # Resume-mode detection (see Resume Semantics)
  For each affected repo, lead determines mode by cross-referencing:
    - cycle-log-epic-{N}.md existence + entries
    - sprint-status.yaml story states for this epic
      (SPRINT_PLAN status for the computed snapshot — per-status counts, recommendation.story_key;
       SPRINT_PLAN validate first if the YAML's integrity is in doubt; do not hand-parse)
    - spec-<key>.md frontmatter status per story (draft | ready-for-dev | in-progress | in-review | done | blocked)
    - {TICKET}-epic{N} branch presence locally and on remote
  Modes per repo: FRESH | RESUME | REMOTE_ONLY | LOCAL_ONLY | AMBIGUOUS | INTEGRITY_ERROR
    INTEGRITY_ERROR or AMBIGUOUS → halt and surface to user
    LOCAL_ONLY                   → halt and ask user (remote deletion intentional?)
    REMOTE_ONLY                  → fetch + checkout {TICKET}-epic{N}; then RESUME
    RESUME                       → run Cross-stage integrity checks; on pass, set resume point
    FRESH                        → fall through to SC-1 / SC-2

  # SC-1 / SC-2 — only where FRESH
  For each repo in FRESH:
    Lead verifies the feature branch
      If missing → STOP and ask user (TICKET, Description, root); validate; create; push; log feature_branch_created
    Lead verifies {TICKET}-epic{N}
      If missing → branch off the feature branch (deterministic); push; log epic_branch_created
  Lead checks every affected repo out to {TICKET}-epic{N}; logs epic_branch_checked_out
  If ideSync: restore objectscript.conn.active to original   # <<< Window A end — MANDATORY (try/finally; restore even on halt/failure)

  Lead executes /bmad-sprint-planning via Skill tool, HEADLESS; parses the trailing JSON:
    gate=FAIL or status=blocked → STOP; surface findings (and the saved implementation-readiness.md if written)
    gate=CONCERNS → surface once; continue
    gate=PASS → continue
  Lead logs sprint_planning_complete gate=<PASS|CONCERNS>
  If Epic N-1 retrospective exists OR deferred-work.md has unresolved items OR sprint-status.yaml action_items has status=open entries,
     AND no prior retro_review_* entry for this epic:
    Lead reads all sources, triages, creates Story X.0 via a bmad-build-auto PLAN spawn (freeform intent + "Halt after planning."),
      appends the triage table to the resulting spec; logs retro_review_complete
  Else if no prior retro_review_* entry:
    Lead logs retro_review_skipped reason=no_retro_no_open_ledger_no_open_action_items
  Else:
    (resume case — gate already passed; skip)

  # Epic-context pre-warm (see "Epic Context Pre-warm") — after any epics.md edit, before the first plan spawn
  Lead renders bmad-build-auto, spawns an Opus subagent on the rendered compile-epic-context.md for epic N, verifies the header,
    bookkeeping commit; logs epic_context_compiled

  For each story, strictly sequentially, starting from the resume point:
    If any file in planning_artifacts is newer than epic-{N}-context.md → re-run the pre-warm + bookkeeping commit first
    Lead asserts current branch == {TICKET}-epic{N} in every affected repo; halts on mismatch
    Lead records spawn_at=<UTC> and model=<id> at each Agent call

    # --- PLAN (Opus) ---
    Lead logs story_planning; bookkeeping commit (Rule 16: tree clean before every build-auto spawn)
    Lead invokes Agent for /bmad-build-auto with "<story-key> Halt after planning." (model=opus unless re-pinned)
      → re-reads spec-<key>.md: status ready-for-dev → captures spec path; logs story_created path=<spec> build_status=ready-for-dev
      → status blocked → Clarification protocol (build-auto table)
    Lead validates the spec: Integration ACs (Rules 1/2), ADR mapping (Rule 6)   # see "Lead Validates the Story Spec"
    Lead logs spec_validated; SPRINT_PLAN generate --set <key>=ready-for-dev; bookkeeping commit (everything under implementation-artifacts)

    # --- IMPLEMENT (Sonnet) ---
    Lead: SPRINT_PLAN generate --set <key>=in-progress --set epic-{N}=in-progress; bookkeeping commit
    Lead invokes Agent for /bmad-build-auto with the spec path (model=sonnet unless re-pinned)
      → re-reads spec: status done → build_sha = HEAD (its finalize commit); asserts tree clean
        Lead harvests spec frontmatter deferred: → deferred-work.md (Rule 15); SPRINT_PLAN generate --set <key>=review
        Lead mirrors baseline_revision into the spec frontmatter as baseline_commit (bmad-code-review reads that key)
        logs dev_complete build_sha=<sha> baseline_revision=<sha> review_loop_iteration=<n> followup_review_recommended=<bool> deferred=<n>
      → status blocked → Clarification protocol (build-auto table)
    Lead executes ADR-tooled AC verifications (lead-side, sequential per AC); logs adr_verifications_complete
    Lead invokes Agent for /bmad-qa-generate-e2e-tests (model=sonnet unless re-pinned) → reads ## Tests Added → logs qa_complete
    Lead invokes Agent for /bmad-code-review with the spec path (model=opus unless re-pinned) → reads return
      → verifies sprint-status.yaml moved to done|in-progress; if still review, SPRINT_PLAN generate --set <key>=<reviewer's final status>
      → logs cr_complete
    If review returned a ## Fix Pack (trivial LOW, Rule 15): the reviewer has already applied mechanical patches; behavioral-but-trivial items go through ONE rework iteration below (cycle_iteration+1) — bounded: exactly one fix-pack iteration per story; the smoke gate still follows
    While review left story in-progress (unresolved high/medium; mediums dispositioned `escalated` per Rule 15 do not block) AND rework iterations < 3:   # see Rework Loop
      Lead re-opens the spec (status in-progress; unresolved findings appended as unchecked Tasks & Acceptance items); REWORK commit (QA tests + reviewer patches + bookkeeping)
      Lead re-spawns /bmad-build-auto on the spec (model=sonnet; cycle_iteration+1) → harvest deferred:, logs dev_complete
      Lead re-runs ADR verifications if rework touched ADR-constrained ACs; SPRINT_PLAN generate --set <key>=review
      Lead resets spec baseline_commit to the iteration-1 baseline; re-spawns /bmad-code-review → logs cr_complete
    If still in-progress after 3 iterations: STOP; surface outstanding findings to user
    Lead performs per-story smoke (lead-side); logs smoke_complete
    Lead asserts current branch == {TICKET}-epic{N}; commits (QA tests, review patches, bookkeeping) + pushes ONLY to {TICKET}-epic{N} (submodules first if applicable)
    Lead logs committed; next story

  Lead: SPRINT_PLAN generate --set epic-{N}=done (no skill writes this transition); bookkeeping commit; logs epic_status_done
  If model-overrides.yaml is armed (stack_risk=uncommon or review_tier=mixed):   # model-tier checkpoint — see Model Strategy
    Lead evaluates this epic's cycle log against the escalation / de-escalation / rollback thresholds; logs model_tier_checkpoint
    On approved change (or the mandatory mixed-revert): update model-overrides.yaml overrides+history; logs model_tier_changed
  Lead pauses: "Run a retrospective?"   # human-in-the-middle gate — never auto-answered, never times out into a default
    If yes → /bmad-retrospective via Skill tool, fully interactive (all WAITs reach the user); logs epic_retro_complete
    If no  → logs epic_retro_skipped reason=user_declined
  Lead pauses: "Merge {TICKET}-epic{N} → feature, delete {TICKET}-epic{N}?" → if yes:
    If ideSync: set objectscript.conn.active = false   # >>> Window B start — wraps the merge branch ops
    For each affected repo, submodules-first then parent:
      checkout feature; pull; merge --no-ff {TICKET}-epic{N}; push feature; delete {TICKET}-epic{N} local + remote
    If ideSync: restore objectscript.conn.active to original   # <<< Window B end — MANDATORY (try/finally; restore even on conflict/halt)
    Logs epic_merged_to_feature
  Else:
    Logs epic_merge_skipped
  Logs epic complete; next epic
```

### Smart Parallelism (retired under v6.11 — stories run strictly sequentially in one checkout)

Story-level batching inside a single working tree is no longer possible:

- **Implement** spawns: each `bmad-build-auto` run makes its own finalize commit and then verifies the tree is clean — two concurrent runs in one checkout see each other's uncommitted work and HALT `finalization left repository dirty` (or race on the git index).
- **Plan** spawns: build-auto's step-01 version-control check ("require a clean working tree … HALT on a dirty tree") runs *after* it has loaded/compiled the epic context, so a sibling plan spawn that has already written its untracked `spec-<key>.md` makes the slower sibling halt; siblings also race on `epic-<N>-context.md`.

Concurrency therefore lives one level up — the parallel kit's per-epic worktrees (Orchestrator Mode). Within an epic: one story at a time, one stage at a time. Emitting multiple pipeline-stage `Agent` calls in one message is an anti-pattern under v6.11.

**Write-ahead rule (extended by Rule 16):** write the cycle log entry for a completed stage BEFORE the next dependent action, and COMMIT it before the next `bmad-build-auto` spawn. For `committed`: write immediately after `git push` returns success. If crashed between push success and log write, inspect `git log --oneline` on resume; if the matching commit exists, write the missing log entry — do NOT re-run the commit. The same applies to `dev_complete`: build-auto's finalize commit (`build_sha`) plus spec `status: done` without a `dev_complete` entry means the entry was lost, not the work — write it, harvest `deferred:`, set `review`, continue.

### Rework Loop (implement ↔ code review, bounded)

`/bmad-code-review` closes the story itself: when every decision-needed + patch finding is resolved and no high/medium severity remains, it sets the story (and sprint-status.yaml) to `done`; otherwise it sets `in-progress` and leaves unchecked review-finding items (action items) in the spec file.

`bmad-dev-story`'s review-continuation mode has no v6.11 successor, so the lead re-opens the spec for `bmad-build-auto` instead. When the review returns `in-progress`:

1. **Lead re-opens the spec:** set frontmatter `status: in-progress`; append every unresolved finding as an unchecked item under `## Tasks & Acceptance` (`- [ ] [Review] <finding> — <file:line> — <what the fix must do>`); leave the frozen `<intent-contract>` block untouched; note the iteration in `## Spec Change Log`. **Rework commit:** commit QA's tests, the reviewer's applied patches, and the bookkeeping files together (`chore(epic-N): rework <story-id> iteration <k>`) — they are still uncommitted (the QA and CR spawns are forbidden to commit), and a spec-path dispatch skips build-auto's pre-flight tree check, so anything left uncommitted would be silently absorbed into build-auto's next diff and finalize commit.
2. Re-spawn `/bmad-build-auto` on the spec (Sonnet tier, `cycle_iteration` incremented). Its resume table routes `in-progress` → implement: it captures a new `baseline_revision` (after the rework commit), works the open tasks (the handoff subagent sees the whole spec, including the review items), self-reviews, finalizes `status: done`, commits. Harvest `deferred:`; log `dev_complete`.
3. Re-run ADR-tooled verifications if the rework touched ADR-constrained ACs. Then `SPRINT_PLAN generate --set <key>=review` (the previous code review moved the tracker to `in-progress`; the re-review expects `review`).
4. Re-spawn `/bmad-code-review` — set the spec's `baseline_commit` back to the ORIGINAL iteration-1 baseline before spawning, so the reviewer sees the whole story (`<original baseline>..HEAD` + working tree), not just the fix.
5. **Cap: 3 rework iterations.** Non-convergence after 3 → STOP and surface the outstanding findings to the user (mirrors `bmad-build-auto`'s own 5-iteration review-repair cap). Endless implement↔review ping-pong is a signal the spec is wrong, not the code.

The Fix Pack path (trivial LOW, Rule 15): mechanical items are patched by the reviewer inline; behavioral-but-trivial items take exactly ONE iteration of the loop above.

Only a story at `done` proceeds to smoke + commit.

### Status Ownership (who writes sprint-status.yaml)

`bmad-build-auto` never touches `sprint-status.yaml` (only the interactive `bmad-build` syncs it, and that skill is not a pipeline stage), so under v6.11 the **lead** owns the early story transitions and writes them ONLY through `SPRINT_PLAN generate --set` (deterministic, preserves comments; `--set` is unconditional, so the lead checks the current value first and never writes a lower rank):

| Transition | Written by |
| --- | --- |
| file generation, `backlog` seeding, `epic-N` keys, `epic-N-retrospective: optional` | `/bmad-sprint-planning` (headless) via `sprint_plan.py generate` |
| story `backlog → ready-for-dev` (after the plan spawn is validated) | **the lead** — `SPRINT_PLAN generate --set <key>=ready-for-dev` |
| story `ready-for-dev → in-progress` + epic `backlog → in-progress` lift (immediately before the implement spawn) | **the lead** — `--set <key>=in-progress --set epic-{N}=in-progress` |
| story `in-progress → review` (after the implement spawn's spec reads `status: done`) | **the lead** — `--set <key>=review` |
| story `review → done` (or back to `in-progress`) | `/bmad-code-review` (its step-04 sync). The skill only sets `{story_key}` itself when it found the story via its sprint-status scan; on an explicit spec-path dispatch the spawn prompt must state the key, and the **lead verifies after `cr_complete`** that the file moved — if it still reads `review`, apply the reviewer's reported final status with `SPRINT_PLAN generate --set` (this is the one sanctioned lead write of `done`/`in-progress` for a story). |
| `epic-{N}-retrospective: optional → done`, `action_items` append | `/bmad-retrospective` via its `sprint_status.py update` |
| **epic `in-progress → done`** (after the last story reaches `done`) | **the lead** — `--set epic-{N}=done`; log `epic_status_done` |

Status enum (kebab-case, unchanged in BMAD v6.11): story `backlog → ready-for-dev → in-progress → review → done`; epic `backlog → in-progress → done`; retrospective `optional → done`; action items `open → in-progress → done`; legacy aliases `drafted` ≡ `ready-for-dev`, `contexted` ≡ `in-progress` (normalized by the script). Never downgrade a status — `--set` would happily do it (it is the script's repair path), so read before you write; never hand-edit the YAML.

**Do not confuse the two status vocabularies.** The spec file's frontmatter `status` is `bmad-build-auto`'s machine state: `draft | ready-for-dev | in-progress | in-review | done | blocked`. `in-review` (spec, mid-self-review) is NOT `review` (sprint-status, awaiting code review), and a spec at `done` means "build-auto finished", not "story done" — the story is `done` only when `bmad-code-review` says so. Never copy one vocabulary into the other.

### Per-Story Smoke (Critical Gate)

After code review (HIGH/MED resolved) and before commit, the lead performs a per-story smoke — a direct exercise of the story's deliverable in its target runtime. Mandatory; only the method varies.

**Method by deliverable runtime:**

- UI / browser-deployed: drive the dev server (or a deployed build) via browser-automation MCP. Navigate, exercise, assert on DOM / render / console.
- CLI / library: invoke the new command or library entrypoint against a real runtime. Assert on stdout / stderr / return code / produced files.
- Service / API: real HTTP request against the local server (or staging). Assert on status code + response body + side-effect surface.
- Other: whatever exercise mirrors production use. Minimum: the lead invoked the new code path against a real runtime and observed expected outcomes via an out-of-band channel.

The smoke is not a substitute for automated tiers; it's the final check that the wired-up system end-to-end produces the user-observable outcome the story promises.

**Mechanics:**

1. After `cr_complete` (HIGH/MED resolved), determine the smoke method from the story's diff (`git diff --name-only <baseline_revision>..HEAD`) plus the spec's Tasks & Acceptance / I/O matrix.
2. Execute, capture evidence (screenshots, stdout, response body).
3. On failure: do NOT commit as-is. Either (a) surface to user, or (b) treat the failure as an unresolved HIGH finding and run one Rework Loop iteration (re-open the spec with the failure as a `[Smoke]` task, rework commit, implement re-spawn, code-review re-spawn) then re-smoke. Failed smoke is HIGH, never deferrable.
4. On success: log `<UTC> TAB Story <id> TAB smoke_complete TAB method=<browser|cli|api|other> result=pass iterations=<N> defects_caught=<N> evidence=<path-or-summary> model=<lead-model>`. `iterations` is 1 for first-run pass, bump on re-smoke. `defects_caught` = count of bugs the smoke caught that automated tiers passed.
5. Proceed to commit.

### Epic Context Pre-warm (per epic, lead-driven)

`bmad-build-auto`'s epic-story path compiles `<implementation_artifacts>/epic-<N>-context.md` on first use — by spawning a subagent *before* its own clean-tree check, so the freshly written, untracked cache file would trip that check on the very first plan spawn of every epic (and again after any planning-artifact edit, which invalidates the cache). The lead therefore owns the compile:

1. Render the skill once: `uv run --no-cache _bmad/scripts/render_skill.py --project-root <abs-root> --skill <abs-root>/.claude/skills/bmad-build-auto`. It prints `read and follow <snapshot-dir>/workflow.md`; take `<snapshot-dir>`.
2. Spawn a synchronous Opus subagent (`general-purpose`, `model: opus`) whose prompt is: "Read fully and follow `<snapshot-dir>/compile-epic-context.md` for epic `<N>`. Working directory `<abs-root>` (Rule 13). Write only `<implementation_artifacts>/epic-<N>-context.md`."
3. Verify the file exists, is non-empty, and starts with `# Epic <N> Context:`; otherwise halt (`context compilation verification failed` — usually a missing or unparseable `epics.md`).
4. Bookkeeping commit; log `epic_context_compiled`.

Run it after sprint planning and the Story X.0 gate (both may edit planning artifacts) and again before any plan spawn whenever a file under `planning_artifacts` is newer than the cache (Rule 5 amendments, X.0 insertion, user edits). With a valid, committed cache the plan spawn reuses it and never recompiles.

### Retrospective Review & Story X.0 Creation (Critical Gate)

After sprint planning, before building the story list, review the previous epic's retrospective and create a cleanup story. Mandatory — closes the feedback loop between retrospectives and sprint planning.

1. Calculate previous epic number (N-1 if processing N).
2. Search for `_bmad-output/implementation-artifacts/epic-{N-1}-retro-*.md`. If multiple, latest by mtime; tie-break by lexicographic filename. Log which file was selected.
3. If a retrospective exists, extract: action items (status: completed / in-progress / not addressed), deferred review findings, preparation tasks for current epic.
4. Also read `_bmad-output/implementation-artifacts/deferred-work.md` if present, and the `action_items:` block of `sprint-status.yaml` (`SPRINT_PLAN status` → `open_action_items`; v6.11 retrospectives append their action items there with `status: open`).
5. Triage per Rule 15: terminal entries (`by-design`, `wontfix-theoretical`, decided `decision-pending`) are NOT triage input. Default-INCLUDE every `open`/`routed` entry that is (a) trivial + low fix-risk by now, or (b) has occurrences ≥ 2 — excluding one requires written justification (the burden flips to exclusion). Open action items are included unless the user explicitly defers them. Batch undecided `decision-pending` entries to the user in one sitting. Defer-with-rationale only what fails both include tests. If `open`+`routed` entries exceeded 8 at the previous epic's close, Story X.0 is a mandatory fix-or-close pass over the entire ledger.
6. Create Story X.0 in four steps (the tracker script rejects `--set` for any key not derived from the epic files, so the story must exist in `epics.md` first):
   - **6a:** Insert `### Story {N}.0: Epic {N-1} Deferred Cleanup` as the first story under Epic {N} in `epics.md`, in the same heading/format as the sibling stories, with a one-paragraph description and the included items as acceptance bullets (one per triaged item, naming its source). Re-run `SPRINT_PLAN generate` (no `--set`) so the key `{N}-0-epic-{N-1}-deferred-cleanup` appears as `backlog`; confirm it in `new_entries`.
   - **6b:** Re-run the epic-context pre-warm (the `epics.md` edit made the planning artifacts newer than `epic-{N}-context.md`); bookkeeping commit (epics.md + tracker + context + log).
   - **6c:** Spawn the normal **plan** stage with the story key + `Halt after planning.` — Story X.0 is now an ordinary epic story. Validate the spec as usual; append the full triage table under its `## Design Notes` (rows of `Item | Source (retro | deferred-work.md | action_items) | Triage Decision`; header notes which Epic N-1 the triage covers + the date).
   - **6d:** `SPRINT_PLAN generate --set {N}-0-epic-{N-1}-deferred-cleanup=ready-for-dev`; bookkeeping commit. Under the parallel kit, the orchestrator treats an `epics.md` change whose only diff is an appended Story X.0 as hash-exempt (re-record `epics_md_hash` without a re-approval).
7. Skip Story X.0 ONLY if all three sources are empty. If the retro is missing but the ledger or action items have entries, do NOT skip — execute steps 5-6 from those sources. If nothing is skipped, the pre-warm in 6b doubles as the epic's initial pre-warm; if X.0 is skipped, run the pre-warm now.
8. Log retro_review_complete or retro_review_skipped. Closing a previous epic's action item (`sprint_status.py update --set-action-status`) happens only with the user's confirmation, at the next retrospective — never silently here.

### Source Control Branching (Critical Gates)

These fire at the very start of each epic, before sprint planning or story work. Apply uniformly to the parent repo and every submodule in `.gitmodules`. For multi-repo projects (separate child repos rather than git submodules), the user enumerates affected repos up-front; the rules apply to each.

**Precondition — clean working tree.** Before any branching rule, the lead runs `git status --short` against the parent repo and every submodule and halts on dirty state. Non-negotiable. (If the IDE file-sync toggle below applies, run this clean-tree check FIRST; the toggle is then applied only transiently around each branch-changing operation and restored immediately after, so between operations `.vscode/settings.json` is back at its original value and the tree is clean. Never stage the transiently-toggled file into any commit.)

#### IDE file-sync toggle (conditional — IRIS/ObjectScript projects only)

Some IRIS/ObjectScript projects run an IDE extension that bidirectionally syncs the workspace with a live IRIS server (the VSCode-ObjectScript extension with `objectscript.conn.active: true` in `.vscode/settings.json`). When a git operation that **changes branches** rapidly rewrites the working tree, that sync fights the operation — it pushes the new tree to the server, the server recompiles and re-formats, then pushes the formatted files back to disk — producing phantom drift (e.g. spurious whitespace-only diffs), compile cascades, or partially-applied state that has to be reverted before the next commit.

This subsection is self-contained — it does not depend on any project's CLAUDE.md or rules files.

**Applicability — detect once, up front (after the initial clean-tree check):**

1. If `.vscode/settings.json` does NOT exist, or has no `objectscript.conn` block, or `objectscript.conn.active` is not `true` → the extension isn't actively syncing (or this isn't an ObjectScript/IRIS project). **SKIP this toggle entirely; it never applies.** Non-ObjectScript projects are never affected.
2. Otherwise the toggle is in effect for this run: record the original value (almost always `true`) so each window can restore it. The sync stays ENABLED except inside the branch-operation windows defined below.

**Scope — wrap ONLY branch-changing operations; do NOT disable the sync for the whole epic.** Disable the sync immediately before, and restore it immediately after, each git operation (or contiguous group of operations) that moves HEAD and rewrites the working tree: `checkout`, `checkout -b`, `merge`, `pull` (when it advances HEAD), `rebase`, `reset --hard`, `cherry-pick`, `stash apply`/`pop`, `revert`, `submodule update`. Within `/epic-cycle` there are two such windows (plus any resume-time checkout):

- **Window A — epic-start branching (SC-1 + SC-2 + checkout):** wrap the feature-branch checkout/creation, the epic-branch creation, and the `git checkout {TICKET}-epic{N}`. Restore the moment the epic branch is checked out.
- **Window B — SC-4 end-of-epic merge:** wrap the `checkout <feature>` / `pull` / `merge --no-ff` / branch deletes (per affected repo, submodules-first). Restore the moment the merge + deletes complete.

Read-only git ops (`status`/`diff`/`log`) and `add`/`commit`/`push`/`fetch` do NOT change branches and are NOT wrapped. The per-story pipeline stays on `{TICKET}-epic{N}` and only commits/pushes, so it runs with the sync **enabled**, as normal. Between windows the sync is on and `.vscode/settings.json` sits at its original value — clean — so the clean-tree check and the per-story commits never see a toggle-induced modification.

To wrap a window: set `objectscript.conn.active: false` → perform the branch operation(s) → set it back to the recorded original value.

**Restoration is MANDATORY and is the #1 failure mode of this rule.** Each window's restore must run — on success, on halt, on failure, on merge conflict, or on user cancellation. Treat each window like a `try/finally`: the restore belongs on the always-runs path, never only after the success path. The transiently-toggled `.vscode/settings.json` must never be `git add`-ed into any commit; if a window overlaps a commit (the SC-4 merge commit), verify settings.json is not staged. If you discover a window's restore was missed, restore immediately and tell the user the workspace was left disconnected from IRIS and for roughly how long.

**Crash recovery.** If a prior run crashed mid-window, `.vscode/settings.json` may be left at `active: false`. On a fresh run, if detection finds `active: false` where a live connection is expected, surface it to the user before proceeding — it may be an orphaned toggle from a crash, or an intentional manual disconnect; only the user knows.

This toggle is purely an IRIS/ObjectScript convenience; it has no effect on, and must not be applied to, non-ObjectScript projects.

#### Rule SC-1 — Feature branch verification (epic-start)

The lead checks for a feature branch in every affected repo. Branch name follows the project's configured pattern (see "Tracker format flexibility" below); default is `feature/{TICKET}_{Description}`.

- **If the feature branch exists** (locally or fetch-discoverable on remote): check it out, verify it's up to date with its remote, continue.
- **If the feature branch does NOT exist:** STOP and ask the user:
  1. Should the feature branch be created?
  2. The exact `{TICKET}` (validated against the project's `ticket_format` regex).
  3. The exact `{Description}` (validated against `description_format`).
  4. Which root does it branch from? Default precedence: `origin/develop` → `origin/main` → `origin/master`. The lead surfaces candidates the repo actually has and asks the user to confirm.

  **Root freshness check (mandatory, per affected repo, BEFORE creating anything):** `git fetch origin`, then compare the chosen remote root against its local counterpart: `git rev-list --left-right --count origin/{root}...{root}`.
  - **Local ahead (0 behind / N ahead):** STOP. The local branch carries N commit(s) origin does not have — basing on `origin/{root}` will REMOVE from the working tree every tracked file those commits added (this has deleted a project's entire `.claude/` + `_bmad/` tooling mid-session). Show the commits (`git log --oneline origin/{root}..{root}`) and ask the user: (a) push local `{root}` to origin first, then base on `origin/{root}` (recommended); (b) base on local `{root}` instead; (c) base on `origin/{root}` anyway, explicitly acknowledging the listed content disappears from the working tree. Log `root_freshness_resolved` with the choice.
  - **Diverged (both counts nonzero):** HALT and surface both commit lists — the user reconciles the trunk before any branching (same doctrine as a resume INTEGRITY_ERROR; never pick a side silently).
  - **Equal, or local behind:** proceed with `origin/{root}` (the normal case).

  On user authorization: validate the resulting branch name, then `git fetch origin && git checkout -b <validated-name> <confirmed-root> && git push -u origin <validated-name>` per affected repo. Log `feature_branch_created`.

Merging the feature branch into `develop` / `main` is OUT of scope for `/epic-cycle` — that's a PR-review / code-owner workflow. `/epic-cycle` creates and merges INTO the feature branch only.

##### Tracker format flexibility (per-project configuration)

The default assumes a JIRA-style tracker. Real projects use JIRA, Linear, GitHub Issues, Azure DevOps, or no tracker at all. The lead reads the project's branch-naming config from the first of these locations to exist:

1. `_bmad/custom/branch-naming.yaml` (preferred)
2. A `## Branch naming` section in CLAUDE.md
3. The defaults below

**Config schema:**

```yaml
# _bmad/custom/branch-naming.yaml
feature_pattern: "feature/{TICKET}_{Description}"  # template with {TICKET} and {Description}
epic_pattern: "{TICKET}-epic{N}"  # template for epic branch; {TICKET} reused from SC-1, {N} is epic number
ticket_format: "^([A-Z]+-\\d+|SPIKE|EXPLORE|REFACTOR)$"  # regex; tracker IDs OR named exceptions
ticket_required: true   # if false, {TICKET} may be empty
description_format: "^[a-z][a-z0-9-]{2,60}$"  # kebab-case, 3-60 chars, starts with letter
separator: "_"          # between TICKET and Description in the feature template
```

**Defaults if no config:**

| Field | Default |
| --- | --- |
| `feature_pattern` | `feature/{TICKET}_{Description}` |
| `epic_pattern` | `{TICKET}-epic{N}` |
| `ticket_format` | `^[A-Z]+-\d+$` (JIRA/Linear-style) |
| `ticket_required` | `true` |
| `description_format` | `^[a-z][a-z0-9-]{2,60}$` |
| `separator` | `_` |

**Validation at the SC-1 user prompt:**

1. Ask user for `{TICKET}` and `{Description}`, showing an example derived from the configured pattern.
2. Validate each against the configured regex.
3. If invalid: surface the mismatch with the offending regex shown. Offer: (a) re-enter, (b) override and use as-is (logs a warning), (c) update the project config.
4. If valid: render the branch name and confirm before creating.

**Ticketless work.** The default `ticket_format` allows `SPIKE`, `EXPLORE`, `REFACTOR` as named exceptions (e.g., `feature/SPIKE_audio-latency-probe`). Projects can broaden or narrow this list.

**Branch-name safety (non-negotiable).** Refuse any branch name with spaces, shell metacharacters (`*`, `?`, `[`, `]`, `;`, `&`, `|`, `<`, `>`, `$`, `` ` ``, newline), or git-reserved sequences (`..`, `@{`, leading `-`, trailing `.`). These guards are independent of the project config.

#### Rule SC-2 — Epic branch verification (epic-start)

After the feature branch is in place, the lead checks for an epic branch in every affected repo. The branch name follows the project's configured `epic_pattern` (see "Tracker format flexibility" below); default is `{TICKET}-epic{N}` (e.g., `PROJ-1234-epic1`). The ticket prefix is required so that multiple projects committing to the same repository under different tickets do not collide on a shared `epic1` / `epic2` namespace.

`{TICKET}` is the same value validated and recorded by SC-1 for the feature branch — the lead reuses it; do not re-prompt.

- **If the epic branch exists** (local or remote): check it out, continue.
- **If the epic branch does NOT exist:** create deterministically off the feature branch — no user prompt; the name is derived from the epic number and the SC-1 ticket. `git checkout <feature> && git pull && git checkout -b {TICKET}-epic{N} && git push -u origin {TICKET}-epic{N}`. Log `epic_branch_created`.

**Resume semantics:** mid-epic resume should find `{TICKET}-epic{N}` already in place. If the lead is resuming with prior `committed` entries in the cycle log but `{TICKET}-epic{N}` is missing locally AND on remote, that is a workspace-integrity error — halt and surface. Do NOT silently re-create.

**Ticketless projects.** If the project's `ticket_required` is `false` and no ticket was supplied at SC-1, the default `epic_pattern` resolves to a leading-hyphen name (`-epic1`), which is git-invalid. Projects in this mode MUST override `epic_pattern` (e.g., to `epic{N}` for single-project repos, or to `{DESCRIPTION}-epic{N}` to derive the prefix from the feature branch description). The lead validates the resolved epic branch name against the same branch-name safety rules as SC-1 and halts on failure.

#### Rule SC-3 — Commits go ONLY to the epic branch

Every commit during the epic cycle lands on `{TICKET}-epic{N}` in the affected repo. The lead asserts `git branch --show-current == "{TICKET}-epic{N}"` immediately before every `git commit` and halts on mismatch. Applies to submodules (each submodule's HEAD must be on its own `{TICKET}-epic{N}` before the parent's `git add <submodule-path>`).

Push frequency: per story, to the epic branch's remote.

#### Rule SC-4 — End-of-epic merge gate (user decision point)

After the retrospective gate (whether opted in or not), the lead pauses:

> "Epic {N} is complete. Merge `{TICKET}-epic{N}` into the feature branch and delete the epic branch (local + remote) in every affected repo?"

Before asking, surface every ledger entry dispositioned `escalated` during this epic (Rule 15: MED findings with high fix-risk or out-of-footprint) — each needs a decision now: fix-now story, route, or wontfix. If this is the range's FINAL epic, follow the merge with the ledger sweep: present every remaining `open`/`routed`/`decision-pending` entry with a recommended disposition — the end-of-project manual triage, sized for one sitting.

If **yes**, execute the merge — submodules-first, then the parent (mirrors per-story Submodule Commit Order to avoid broken pointers on the feature branch's remote). This is "Window B" for the IDE file-sync toggle: if that toggle applies, set `objectscript.conn.active: false` before the first `checkout` below and restore it immediately after the deletes complete (mandatory, `try/finally`; restore even if the merge conflicts and halts):

For each affected repo, ordered submodules-first:

1. `git checkout <feature>`
2. `git pull origin <feature>` (in case it moved while the epic was in flight)
3. `git merge --no-ff {TICKET}-epic{N} -m "Merge {TICKET}-epic{N}: <one-line summary>"` (preserves the epic branch's commit graph)
4. `git push origin <feature>`
5. `git branch -d {TICKET}-epic{N}` (refuses if not fully merged — the safety we want)
6. `git push origin --delete {TICKET}-epic{N}`

If submodules are involved, the parent's merge step (3) brings in submodule pointer updates that already exist on `{TICKET}-epic{N}` from per-story commits. Because the submodules' own feature branches were merged in the preceding pass, those pointers now resolve cleanly on the submodules' remotes. Verify with `git submodule status` before the final parent push.

If **no**, log `epic_merge_skipped reason=<short>` and leave `{TICKET}-epic{N}` intact.

#### Rule SC-5 — Epic re-open recreates the epic branch

If an epic is re-opened (e.g., the next epic's retrospective surfaces work that belongs on the prior epic, or the user explicitly reopens), the `{TICKET}-epic{N}` branch must be recreated.

- If the prior `{TICKET}-epic{N}` was merged and deleted: branch a new `{TICKET}-epic{N}` off the current feature-branch HEAD (picks up any interim feature-branch progress).
- If the prior `{TICKET}-epic{N}` was never merged and still exists: check it out as-is; do not branch a parallel `{TICKET}-epic{N}`.

Log `epic_branch_reopened reason=<short>`.

#### Rule SC-6 — NEVER commit directly to `main`, `master`, or `develop`

The lead refuses any commit (story, retrospective, hotfix, anything) when the current branch is `main`, `master`, or `develop` in any affected repo. Absolute defensive default. If the user explicitly directs a direct-to-trunk commit (emergency hotfix outside the epic cycle), that's OUT of scope — the user performs it manually.

Pairs naturally with remote branch protection on trunks.

#### Rule SC-7 — If unsure where to commit, STOP and ask

Branching state can drift across sessions. If the lead cannot confidently identify the right branch to commit to — multiple feature branches with similar names, missing epic branch mid-resume, ambiguous parent between `develop` and `main`, etc. — STOP and ask the user. Do not guess.

#### Rule SC-8 — Parallel epics on the same feature branch

Multiple `/epic-cycle` runs may execute concurrently against the same feature branch — typically when different agents drive Epic A and Epic B simultaneously.

**Per-agent isolation: one working tree per agent.** Git only allows one HEAD per working directory. Concurrent agents on different epic branches require either:

- `git worktree add <path> {TICKET}-epic{N}` (recommended) — separate worktrees share the same `.git` object store. Cleanup: `git worktree remove <path>` after the epic merges.
- Separate full clones (simpler but heavier).

A single working directory running two agents on different epic branches is not supported — it requires constant branch-switching that corrupts file state.

**Branch creation under parallelism.** Each agent runs Rule SC-2 independently. `{TICKET}-epic{N}` is created off the feature branch's current HEAD at the moment that agent starts. If Epic A started earlier and a hotfix or sibling-epic merge landed on feature in between, Epic B's `{TICKET}-epic{N}` branches off a newer feature HEAD. That's fine — the `--no-ff` merge at SC-4 handles three-way reconciliation.

**Per-story commits.** Independent branches, independent remotes — no race. Each agent's pre-commit branch assertion is per-agent and per-worktree.

**Merge serialization.** The `git push` to feature is a single-writer point on the remote, so SC-4 must serialize across agents:

- **Coordinated:** each SC-4 sequence starts with `git pull origin <feature>`. If Epic A already merged, Epic B's pull picks that up before its own merge runs. Standard three-way merge from there.
- **Near-simultaneous:** the user picks the order. The second agent re-pulls feature after the first lands.

**Conflict handling at merge time.** If `git merge --no-ff {TICKET}-epic{N}` produces conflicts (against another epic's already-merged work, a hotfix on feature, or any other drift since branching), the lead STOPs and surfaces to the user. Auto-resolution is forbidden — git's conflict heuristics can silently drop intentional changes. The user resolves in the working tree, then signals the lead to continue.

Submodules are independent under this rule too — each submodule's `{TICKET}-epic{N}` merges into its own feature branch sequentially; submodule conflicts require user resolution before the parent's submodule pointer is bumped.

**Out-of-scope coordination:** if two parallel epics' planning artifacts overlap (both stories' ACs touch the same files), that's a sprint-planning conflict the user resolves before parallel execution. Rule of thumb: if two epics' Files-to-Modify tables overlap by more than ~20%, run sequentially.

#### Sub-repository vs submodule terminology

"Submodule" = git submodule (registered in `.gitmodules`; `git -C <path>` operates on it as a child repo). "Sub-repository" = a non-submodule child repo under one umbrella (separate clones the umbrella project orchestrates). Rules SC-1 through SC-8 apply to both. If ambiguous, that's a SC-7 STOP-and-ask trigger.

### Resume Semantics (Critical)

`/epic-cycle` is designed to be resumable across interrupts, context exhaustion, explicit pauses, and clarification gates spanning days. A later session must pick up exactly where the prior one left off — no re-doing work, no skipping work.

#### Resume-mode detection (epic-start)

The lead determines mode before running SC-1 / SC-2:

1. Read `_bmad-output/implementation-artifacts/cycle-log-epic-{N}.md`.
2. Get this epic's story states from `sprint-status.yaml` via `SPRINT_PLAN status` (per-status counts, `recommendation.story_key`, `open_action_items`); run `SPRINT_PLAN validate` first if the file's integrity is in doubt. Also read each `spec-{N}-*.md` frontmatter `status` — it is `bmad-build-auto`'s own durable state and the tie-breaker when the log and the tracker disagree.
3. For each affected repo, check whether `{TICKET}-epic{N}` exists locally and on the remote.

| Cycle log | `{TICKET}-epic{N}` local | `{TICKET}-epic{N}` remote | Mode | Action |
| --- | --- | --- | --- | --- |
| Missing / empty | Missing | Missing | **FRESH** | Run SC-1, SC-2. Create branches. |
| Missing / empty | Exists | Exists | **AMBIGUOUS** | Halt; ask user whether to (a) adopt existing branch and start logging against it (existing commits accepted as-is), (b) start a new epic under different `N`, or (c) inspect manually. |
| Has entries | Exists | Exists | **RESUME** | Compute resume point from the log. |
| Has entries | Missing | Exists | **REMOTE_ONLY** | `git fetch && git checkout {TICKET}-epic{N}`; then RESUME. |
| Has entries | Exists | Missing | **LOCAL_ONLY** | Halt; ask user (remote deletion intentional?). |
| Has entries | Missing | Missing | **INTEGRITY_ERROR** | Halt loudly. Log claims work that branches no longer carry. |

Detection runs per affected repo. Different repos may legitimately be in different modes (parent RESUME, submodule FRESH).

#### Resume-point computation (within-epic)

For a repo in RESUME mode:

1. Bucket cycle-log entries by story ID; highest-stage entry per story is its resume anchor.
2. Earliest story whose anchor is not `committed` = resume point. Work resumes at the next pipeline stage after the anchor.
3. If a story has a `<stage>_clarification_requested` without that stage's subsequent success entry (`story_created` / `dev_complete` / `qa_complete` / `cr_complete`), the resume point is "answer the clarification + re-spawn" (re-dispatch protocol for build-auto stages). The lead surfaces the question before spawning.
4. **Reconcile with the spec's own state** (`bmad-build-auto` writes it durably; the log can lag by one crash): spec `ready-for-dev` + no `story_created` → the plan finished, the log entry was lost — write it, continue at validation. Spec `done` + `build_sha` (the commit touching the spec) reachable on the epic branch + no `dev_complete` → write the entry, harvest `deferred:`, continue at ADR verifications; never re-spawn the implement stage over finished work. Spec `in-progress`/`in-review` + dirty tree → build-auto died mid-run: surface the uncommitted diff to the user (keep and re-spawn — its resume table continues from `in-progress` — or discard); never auto-clean. Spec `blocked` → the clarification is still open.
5. `epic_context_compiled` present but `epic-{N}-context.md` missing or older than a planning artifact → re-run the pre-warm before the next plan spawn.

#### Cross-stage integrity checks (before resuming any stage)

1. **`committed sha=X` and `build_sha=Y` reachable on `{TICKET}-epic{N}`.** For every `committed` / `dev_complete` entry, verify `git merge-base --is-ancestor <sha> {TICKET}-epic{N}`. Failure = branch drift; halt.
2. **Local and remote `{TICKET}-epic{N}` HEADs match.** `git rev-parse {TICKET}-epic{N}` vs `git rev-parse origin/{TICKET}-epic{N}` (post-fetch). Diverged non-fast-forward = halt. Strictly ahead = log `resume_local_ahead`, push. Strictly behind = fetch + fast-forward.
3. **`sprint-status.yaml` agrees with cycle log and specs.** Story marked `done` in YAML with no `committed` entry (or vice versa), or `review` in YAML with a spec not at `done` = divergence; surface to user. Exemption: a story whose highest anchor is `cr_complete` with a Fix Pack or rework in flight legitimately reads `done` (code review wrote it) or `in-progress` before its `committed` entry exists — resume at the rework/smoke step, not as divergence. `SPRINT_PLAN validate` must report `valid: true`.
4. **Submodule pointer consistency.** If `{TICKET}-epic{N}` on the parent recorded a submodule pointer at commit S, the submodule's `{TICKET}-epic{N}` must contain S. Mismatch = INTEGRITY_ERROR.
5. **Clean tree before the first build-auto spawn** (Rule 16) — a dirty tree at resume is evidence (check 4 in resume-point computation), never something to silently commit or discard.

#### Resume interactions with parallel epics (SC-8)

If Epic A is being resumed and Epic B merged to feature in the interim, Epic A's `{TICKET}-epic{N}` is unaffected — reconciliation happens at Epic A's eventual SC-4 merge. If Epic A's own `{TICKET}-epic{N}` was force-pushed by another contributor during the pause, Check 1 fails and the lead halts.

#### Resume across the Story X.0 / retro-review gate

- `retro_review_complete` or `retro_review_skipped` entry → already done, skip.
- No such entry → run the gate.
- Entry present but Story X.0 has no `story_created` → treat Story X.0 as the first incomplete story and resume there.

#### Resume across the end-of-epic gates

- Log shows `epic_status_done` but no `epic_retro_*` entry → on an armed project (model-overrides.yaml `stack_risk: uncommon` or `review_tier: mixed`), run the model-tier checkpoint first if no `model_tier_checkpoint` entry exists for this epic (the evaluation is idempotent — re-running it is harmless); then resume at the retrospective question.
- `epic_retro_*` present but no `epic_merged_to_feature` / `epic_merge_skipped` → resume at the merge question.
- Both gates are user decision points; re-asking after a long pause is correct behavior. A run interrupted mid-retrospective resumes by re-asking the retrospective question (the skill's own output artifacts show how far it got); never auto-complete a half-finished retro.

#### Resume across Sprint Planning

Sprint planning is idempotent — `sprint-status.yaml` is regenerated each run. Always re-run on resume; the skill is a no-op when the YAML is current. The cycle log is append-only, so the new `sprint_planning_complete` entry coexists with the prior one (highest-timestamp wins).

#### Workspace-integrity errors are NOT auto-recoverable

INTEGRITY_ERROR or any cross-stage-check failure must halt. Auto-recovery paths ("the branches must have been pruned; recreate them") lose work. Only the user knows whether missing state was intentional (cleanup) or accidental (mistake).

When halting on an integrity error, surface:

1. What the log says happened (story IDs, stages, recorded shas).
2. What the workspace shows (branches present/missing, HEAD shas).
3. The specific check that failed.
4. Options for the user (re-create from log, abandon log, inspect manually).

Never guess.

#### Resume vs starting a new epic

If the cycle log for epic N is missing but cycle log for epic N-1 exists and shows N-1 completed, that's a normal FRESH start for epic N. SC-1 / SC-2 create the new branch. The retro-review gate triages N-1's deferred items into Story N.0.

If cycle logs for both epic N and epic N+1 are present with entries, two epics are in flight (parallel per SC-8). Resume each independently in its own worktree.

### Sprint Planning Per Epic (Critical Gate)

Before processing any stories for an epic:

1. Execute `/bmad-sprint-planning` directly via the `Skill` tool, **headless** — the skill defines no flag for this; pass the words `headless, intent sprint-planning` as its argument (its `## Headless Mode` section keys off being "invoked headless"). In v6.11 the skill opens with the implementation-readiness gate (it absorbed `bmad-check-implementation-readiness`), then hands the mechanical work to `sprint_plan.py generate`.
2. Parse the JSON block it ends with: `{status, intent, gate, status_file, findings, warnings}`.
   - `gate: FAIL` or `status: blocked` (duplicate epic versions, unreconciled orphans, an unconfirmed fix) → STOP; surface `findings` and the saved `implementation-readiness.md` if written. The user resolves interactively.
   - `gate: CONCERNS` → surface the findings once, log them, continue.
   - `gate: PASS` → continue.
3. `sprint-status.yaml` is now current, all stories tracked, status mismatches caught; run `SPRINT_PLAN validate` as a belt-and-braces check.
4. Log `sprint_planning_complete gate=<PASS|CONCERNS>`. Bookkeeping commit if the tracker changed.

Re-runs are idempotent — the script's merge is preserve-never-downgrade.

### Retrospective Per Epic (User Decision Point — the human-in-the-middle exception)

The retrospective is the ONE deliberate human-in-the-middle exception to the autonomous loop. Its value is the human's judgment about what just happened — automating it defeats its purpose. Concretely: never spawn it as a subagent, never pre-answer its party-mode elicitation or WAIT points (Rule 9's pre-answer protocol explicitly exempts it), and never pass its `-H` / `--headless` flag.

After all stories in an epic complete:

1. Announce: "Epic X is complete. Run a retrospective before moving to the next epic? (yes/no)"
2. **Wait for the user's response.** If the user is away, the run simply pauses at this gate — resume semantics pick it back up later; do not time out into a default answer.
3. **Yes:** execute `/bmad-retrospective` directly via the `Skill` tool, fully interactive, passing the explicit epic number (its `sprint_status.py detect-epic --epic {N}` gate then lists unfinished stories; if the range ended early, the machine verdict `rejected` is expected and the human overrides). Never pass `-H`. Log `epic_retro_complete verdict=<accepted|accepted-with-open-items|rejected>` when it finishes (the skill itself marks `epic-{N}-retrospective: done` and appends its action items to `sprint-status.yaml`). Bookkeeping commit.
4. **No:** log `epic_retro_skipped reason=user_declined`; continue.

`AskUserQuestion` always elicits the human regardless of `bypassPermissions`. The lead executes the skill — do NOT spawn an agent for it (spawned subagents cannot reliably surface elicitation).

### Lead Validates the Story Spec (Critical Gate)

Story creation is the Opus **plan** spawn of `bmad-build-auto` (`<story-key> Halt after planning.`). The gate is what happens between that spawn and the implement spawn: the lead reads the spec it produced (`spec-<key>.md` — capture the path from the agent's `SPEC:` line and confirm by globbing `spec-<epic>-<story>-*.md`) and validates it before any code exists. This replaces the pre-6.11 "lead creates the story file" gate; the race-ahead concern is gone (build-auto never advances to another story), the validation is not.

**Integration AC validation.** Read the spec's Tasks & Acceptance, I/O & Edge-Case Matrix, and Design Notes: does this story introduce a service, module, or component that later stories will consume? Indicators: a new file under `services/` or `lib/`; a new exported class/factory/module; a `Consumed-by:` list; an AC describing a public surface other stories will call.

If yes — the story is service-introducing — it MUST EITHER (a) contain at least one Integration AC of the form "consumer X reads from this service and produces observable effect Y," OR (b) carry an explicit note under `## Design Notes` stating "No consumers in this story; the first consumer will be Story X.Y." (the Rule 1 escape clause for services with no consumers yet in the epic). If neither is present, pause for the user:

> "Story <id> introduces <service-name>. No Integration AC and no 'no consumers yet' declaration found. Choose: (a) re-plan — the lead adds the Integration-AC requirement inside the spec's `<intent-contract>` block, sets frontmatter `status: draft`, commits, and re-spawns the plan stage on the spec path with `Halt after planning.` (re-dispatch protocol — never re-spawn with the story key, that creates `spec-<key>-2.md`); (b) name the future consumer story and add the 'No consumers in this story; the first consumer will be Story X.Y.' note to Design Notes (lead edit; commit); (c) proceed without (producer-consumer wire-up defects can ship green)."

**ADR mapping.** Note which ACs are ADR-constrained (Rule 6) and which are ADR-tooled (lead-executed verification later); confirm the spec's Design Notes name the governing ADRs — add them if the plan missed any (lead edit, non-frozen section).

**Spec sanity.** Frontmatter `status: ready-for-dev`; `## Auto Run Result` present; no `blocked`. A spec the READY-FOR-DEVELOPMENT standard rejected arrives as `blocked` / `spec failed ready-for-development standard` — clarification path, not a gate pass.

If NOT service-introducing (refactor, doc-only, internal cleanup, defect-fix), proceed. Then: log `spec_validated service_introducing=<bool> integration_ac=<present|declared-none|user-waived> adr_constrained_acs=<csv-or-empty>`; `SPRINT_PLAN generate --set <key>=ready-for-dev`; bookkeeping commit (everything under `implementation-artifacts`). This workflow gate is the binding enforcement.

### Context Handoff Between Stages (Critical)

The **spec file path** is the canonical context anchor, passed forward to every downstream agent. File lists flow from git (build-auto commits its work) and from the closing-summary sections of the QA/CR returns.

1. Plan → lead: the spec path (from the `SPEC:` line; verified by glob).
2. Lead → Implement: the spec path only (build-auto loads the spec's `context:` docs itself).
3. Implement → QA: lead reads `baseline_revision` from the spec frontmatter, computes `git diff --name-only <baseline_revision>..HEAD`, passes spec path + that list to QA.
4. QA → Code reviewer: lead reads `## Tests Added` from QA, passes spec path + `baseline_revision` + the diff list + QA's tests.
5. Code reviewer → Commit: lead stages the union of QA's tests, the reviewer's patches, and bookkeeping files (build-auto's own work is already committed).

If a QA/CR return is missing closing sections, fall back to `git status --short` plus the diff list above.

### Lead Context Management (long-run hygiene)

The lead's context window is the scarcest resource in a multi-epic run. Fresh context per stage is the point of the subagent design — both Anthropic's long-horizon-agent guidance and BMAD's own docs ("run each skill in a fresh context window") converge on it. Lead-side rules:

- The cycle log + `sprint-status.yaml` + spec files are the durable state — treat them as external memory (write-ahead, then act). Never rely on conversation memory for a resume or gating decision.
- Do NOT pull stage diffs, full test output, or whole spec files into the lead's context; the completion contracts exist precisely so stage detail stays in the stage. The lead reads a spec only at gates that require it (spec validation, ADR mapping, rework re-open, smoke planning) and otherwise reads only its frontmatter and `## Auto Run Result`.
- After a context compaction/summarization event, re-anchor before the next action: re-read the cycle-log tail, the sprint-status snapshot (`SPRINT_PLAN status`), the current spec path and its frontmatter `status`. The write-ahead rule guarantees that is sufficient to continue exactly where the run left off.
- Never load the rendered `bmad-build-auto` workflow into the lead's context — it runs inside the stage agent. The lead only ever reads spec frontmatter and the `## Auto Run Result` section.
- Budget: one story's pipeline should cost the lead only its gate-skill invocations, spawn prompts, returned closing summaries, and log writes.

### ADR-Aware Execution (Required)

Projects with an Accepted-Decisions registry (typically `docs/adr/`) commit to specific tooling, methodology, and architectural patterns. An AC satisfied by the wrong tool stack is equivalent to a HIGH-severity defect.

**Layer 1 — Lead-executed ADR-tooling gate (between `dev_complete` and the QA spawn).**

After dev returns and before QA is spawned, the lead inspects the story's ACs for any that map to ADR-committed agent-time tooling (visual verification, performance profiling, audits, etc.). For each matched AC, the lead drives the verification using its own tool inventory.

This gate exists because MCP tool inventories may not propagate reliably to spawned subagents. The lead always has the MCP servers at session level.

**Mechanics:**

1. Read the spec (path captured at `story_created`).
2. For each AC, consult the ADR registry. If any Accepted ADR commits to a specific tool stack for that AC, it's "ADR-tooled."
3. Drive each ADR-tooled AC verification using the relevant MCP / tool; record pass/fail + evidence paths.
4. Append one cycle-log entry per story: `<UTC> TAB Story <id> TAB adr_verifications_complete TAB <metadata>`.
5. On failure, surface to user before spawning QA.
6. Pass results to code reviewer's spawn-prompt context.
7. If no ADR-tooled ACs, emit `adr_verifications_complete result=none_required` and proceed.

**Layer 2 — ADR registry path in every spawn prompt.**

The lead resolves the ADR registry path once and includes it in every agent spawn prompt as factual context. Agents must consult ADRs for architectural and methodology decisions referenced in their ACs. Code reviewer must verify implementations match Accepted ADR commitments — violations are HIGH (Rule 6).

## When to Pause

Within each agent, halt and surface a clarification via `## Clarification Needed` if ANY hold:

- Ambiguous ACs or requirements.
- Missing prerequisite — story references data/code/context not present.
- Multiple reasonable design options where user preference matters.
- Environment or dependency failure blocking the work.
- Proceeding would risk breaking a stated constraint (security, compliance, performance, correctness, ADR).

Do not guess; do not soldier on. A short pause beats a wrong implementation unwound later.

## Handling Clarifications

When an agent returns with `## Clarification Needed`:

1. Read the question from the returned message.
2. Surface it to the user with Story ID + context.
3. Wait for the user's answer.
4. Re-spawn the same stage's agent with the clarification baked in (prompt, or the spec's `## Design Notes` — committed first, Rule 16).
5. Log `<stage>_clarification_requested` before re-spawn; the stage's normal success entry (`story_created` / `dev_complete` / `qa_complete` / `cr_complete`) closes it.

**Key distinction:** clarification-needed is not a completion — closing sections won't be present. Detect via the `## Clarification Needed` heading (QA/CR stages) or the spec's `status: blocked` (build-auto stages — see the blocking-condition table and re-dispatch protocol under "Clarification protocol").

## Submodule / Sub-Repository Commit Order (Critical, if Applicable)

Applies to projects with git submodules OR sub-repositories. Skip if neither applies.

When stories modify files in child-repo directories:

1. **Commit and push inside each affected child first.** For git submodules, this produces an updated submodule pointer the parent will reference.
2. **Then commit and push in the parent.** For submodules, stage both parent files AND the updated pointer (`git add <submodule-path>`). For sub-repositories, the parent references children only at workflow level; children should still be pushed first.

If the parent is pushed with a submodule pointer that doesn't exist on the submodule's remote, other developers get checkout failures. Always submodules-first.

After each story, run `git -C <child-path> status --short` for every affected child to detect changes.

## Completion Logging

At each story completion, write a brief log entry: story ID/name, files touched, key design decisions, issues auto-resolved vs requiring user input.

### Cycle Log Format (enables resume)

Per-stage log entries, append-only. File: `_bmad-output/implementation-artifacts/cycle-log-epic-{N}.md`.

**Format (TAB-separated, exactly four fields):**

```
<UTC-timestamp> TAB <Story <id> | Epic <N>> TAB <stage> TAB <metadata>
```

- Fields separated by a literal TAB (`\t`), not spaces.
- The **metadata** field is whitespace-separated `key=value` pairs. Multi-values comma-separated; no spaces or tabs inside values (percent-encode if needed). Keys are lowercase snake_case.
- Two entry kinds (distinguished by field 2):
  - **Story-level:** `Story <id>` (most entries).
  - **Epic-level:** `Epic <N>` (branch lifecycle + the optional epic summary).

**Valid story-level stages, in order:** `story_planning` (write-ahead marker before the plan spawn), `story_created` (plan spawn returned `ready-for-dev`), `spec_validated` (lead gate passed; `ready-for-dev` written), `dev_complete` (implement spawn returned `done`; `review` written), `adr_verifications_complete` (mandatory, between dev and qa; emits `result=none_required` if no ADR-tooled ACs), `qa_complete`, `cr_complete`, `smoke_complete` (mandatory, between cr and commit), `committed`. Clarification events use `<stage>_clarification_requested` (`<stage>` ∈ `plan | dev | qa | cr`), closed by that stage's normal success entry on the re-spawn — `story_created` for `plan`, `dev_complete`, `qa_complete`, `cr_complete` — never by a literal `<stage>_complete` (there is no `plan_complete`). Optional: `bookkeeping_committed sha=<short>` after each Rule 16 commit (aids resume forensics; not required).

**Valid epic-level stages:**

- `feature_branch_created` — SC-1 created the feature branch. Metadata: `repos=<paths>` `ticket=<id>` `description=<desc>` `root=<origin/branch>`.
- `epic_branch_created` — SC-2 created `{TICKET}-epic{N}`. Metadata: `repos=<paths>` `from=<feature-sha>`.
- `epic_branch_checked_out` — Lead checked out `{TICKET}-epic{N}` (resume or after creation). Metadata: `repos=<paths>` `head=<sha>`.
- `epic_branch_reopened` — SC-5 recreated after a prior merge. Metadata: `reason=<short>` `from=<feature-sha>`.
- `lead_model_gate` — Pre-flight lead-tier check. Metadata: `model=<detected>` `action=proceed|user_accepted`.
- `runtime_gate` — Pre-flight BMAD/uv check. Metadata: `bmad=<version>` `uv=<version>`. (Both pre-flight entries are written to the cycle log of the FIRST epic in the requested range, as `Epic <N>`, before any other entry.)
- `root_freshness_resolved` — SC-1 root freshness check needed a user decision. Metadata: `repo=<path>` `root=<origin/branch>` `choice=push_local_first|base_on_local|base_on_origin_anyway`.
- `epic_context_compiled` — Lead-driven epic-context pre-warm wrote `epic-{N}-context.md`. Metadata: `sha=<bookkeeping-commit>` `reason=<initial|planning_artifact_newer|x0_inserted|nfr_amendment>` `model=<id>`.
- `sprint_planning_complete` — Sprint planning done. Metadata: `gate=<PASS|CONCERNS>`.
- `retro_review_complete` / `retro_review_skipped` — Retro + Story X.0 gate done (start-of-epic triage of the PREVIOUS epic's retro artifacts). Metadata: `source_retro=<path-or-empty>` `included=<N>` `deferred=<N>` `dropped=<N>` for complete; `reason=<short>` for skipped.
- `epic_retro_complete` / `epic_retro_skipped` — End-of-epic retrospective gate (the fully interactive, human-in-the-middle run of `/bmad-retrospective` — distinct from `retro_review_*` above). Metadata: `reason=<short>` for skipped.
- `epic_status_done` — Lead set `epic-{N}: done` in sprint-status.yaml after the last story reached `done`. Metadata: `stories=<N>`.
- `model_tier_checkpoint` — End-of-epic tier evaluation (only when model-overrides.yaml is armed). Metadata: `stack_risk=<uncommon|standard>` `review_tier=<full-opus|mixed>` `implement_model=<id>` `high_med_avg=<per-story>` `review_loop_thrash=<N>` `rework_lang_defects=<N>` `review_high=<N>` `review_med=<N>` `result=hold|recommend_escalate|offer_mixed|revert_required`.
- `model_tier_changed` — model-overrides.yaml was updated (paired with a `history:` entry in the file). Metadata: `direction=escalate|de_escalate|revert` `scope=implement_qa|review` `stages=<csv>` `from=<tier>` `to=<tier>` `reason=<short>` `evidence=<percent-encoded summary of the triggering telemetry>` `approved_by=user|mandatory_rollback`. The *why* is non-optional: an entry without `reason=` and `evidence=` is a telemetry bug.
- `resume_local_ahead` — Resume check 2 found local ahead of remote; lead pushed. Metadata: `repo=<path>` `pushed_shas=<N>`.
- `epic_merge_skipped` — User declined SC-4 merge. Metadata: `reason=<short>`.
- `epic_merged_to_feature` — SC-4 merge completed. Metadata: `repos=<paths>` `feature_sha=<sha>` `merge_sha=<sha>` `submodules=<paths-or-empty>`.
- `epic_summary` (optional, once per epic after the last `committed`) — see Workflow Telemetry.

**Standardized telemetry (on every `*_complete` entry):**

- `spawn_at=<UTC>` — when the lead invoked `Agent` (omit on lead-driven stages).
- `model=<id>` — which model the agent ran (e.g., `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`). For spawned pipeline stages this is the model resolved per Agent Invocation Pattern step 1 (model-overrides.yaml, else frontmatter override, else the Model Strategy map) and passed on the `Agent` call. For lead-run gate stages, the lead's model. A run where every stage shows the lead's model is a signal that the `model` parameter was not passed on the spawns — `story_created` and `cr_complete` should show the Opus-tier id, `dev_complete` and `qa_complete` the Sonnet-tier id, unless a project re-pinned them.
- `cycle_iteration=N` — defaults to 1; increment on re-spawn after downstream rejection or clarification.

**Stage-specific telemetry (when available):**

- `story_created`: `path=<spec> build_status=ready-for-dev spec_tokens=N epic_context=<compiled|reused>`.
- `spec_validated`: `service_introducing=true|false integration_ac=<present|declared-none|user-waived> adr_constrained_acs=<csv-or-empty>`.
- `dev_complete`: `build_sha=<short> baseline_revision=<short> review_loop_iteration=N followup_review_recommended=true|false deferred=N loc_added=N loc_removed=N files=N nfr_tripwires=N adr_violations_surfaced=N` (`review_loop_iteration` and `followup_review_recommended` are read from the spec frontmatter; `deferred` is the count harvested into the ledger).
- `adr_verifications_complete`: `tool=<id> acs=<comma-separated-list> result=pass|fail|none_required evidence=<path-or-empty>`.
- `qa_complete`: `tests_added=N first_run_failures=N clarifications=N closing_sections_present=true|false`.
- `cr_complete`: `resolved=N fixed_at_source=N by_design=N wontfix_theoretical=N routed=N escalated=N decision_pending=N deferred=N dismissed=N high=N med=N low=N clarifications=N closing_sections_present=true|false`.
- `smoke_complete`: `method=<browser|cli|api|other> result=pass|fail iterations=N defects_caught=N evidence=<path>`.
- `committed`: `sha=<short-hash> submodules=<paths-or-empty>`.

**Cost telemetry (when available):** `input_tokens=N output_tokens=N cost_usd=X.XX` on any `*_complete` entry. Omit if not extractable.

**Example** (TABs shown as `→`; actual file uses literal tabs):

```
2026-05-18T13:55:02Z→Epic 1→feature_branch_created→repos=. ticket=PROJ-1234 description=initial-foundation root=origin/main
2026-05-18T13:55:10Z→Epic 1→epic_branch_created→repos=. from=a1b2c3d
2026-05-18T13:55:11Z→Epic 1→epic_branch_checked_out→repos=. head=a1b2c3d
2026-05-18T13:56:00Z→Epic 1→sprint_planning_complete→gate=PASS model=claude-opus-4-8
2026-05-18T13:56:30Z→Epic 1→retro_review_skipped→reason=no_retro_no_open_ledger_no_open_action_items
2026-05-18T13:57:10Z→Epic 1→epic_context_compiled→sha=b2c3d4e reason=initial model=claude-opus-4-8
2026-05-18T14:20:00Z→Story 1.5→story_planning→model=claude-opus-4-8
2026-05-18T14:23:11Z→Story 1.5→story_created→spawn_at=2026-05-18T14:20:05Z model=claude-opus-4-8 path=_bmad-output/implementation-artifacts/spec-1-5-render-engine.md build_status=ready-for-dev spec_tokens=1420 epic_context=compiled
2026-05-18T14:23:40Z→Story 1.5→spec_validated→service_introducing=true integration_ac=present adr_constrained_acs=ac5 model=claude-opus-4-8
2026-05-18T14:24:02Z→Story 1.5→dev_complete→spawn_at=2026-05-18T14:23:50Z model=claude-sonnet-5 build_sha=9f8e7d6 baseline_revision=a1b2c3d review_loop_iteration=1 followup_review_recommended=false deferred=1 files=3 loc_added=412 cycle_iteration=1
2026-05-18T14:25:00Z→Story 1.5→adr_verifications_complete→tool=chrome_devtools_mcp acs=ac5 result=pass evidence=path/to/evidence/ model=claude-opus-4-8
2026-05-18T14:29:47Z→Story 1.5→qa_complete→spawn_at=2026-05-18T14:25:30Z model=claude-sonnet-5 tests=tests/render-engine.test.ts tests_added=14 closing_sections_present=true
2026-05-18T14:33:18Z→Story 1.5→cr_complete→spawn_at=2026-05-18T14:30:15Z model=claude-opus-4-8 resolved=2 deferred=0 high=1 med=1 low=0 closing_sections_present=true
2026-05-18T14:34:00Z→Story 1.5→smoke_complete→method=browser result=pass iterations=1 defects_caught=0 evidence=path/to/screens/ model=claude-opus-4-8
2026-05-18T14:34:30Z→Story 1.5→committed→sha=abc1234 submodules=
2026-05-18T17:58:40Z→Epic 1→epic_status_done→stories=6
2026-05-18T18:02:11Z→Epic 1→epic_merged_to_feature→repos=. feature_sha=def5678 merge_sha=fed8765 submodules=
```

**Parsing rule:** split each line on TAB into exactly 4 fields; split metadata on whitespace into `key=value` tokens; split each value on `,` for lists.

On restart, scan the cycle log for the highest-stage entry per story / epic to compute the resume point.

## Workflow Telemetry

The cycle log is the primary telemetry surface. Standardized metadata + stage-specific keys make per-stage cost, quality, and model attribution computable without extra instrumentation.

**What the metadata enables:**

- Per-stage duration by model — `entry.timestamp − entry.spawn_at` grouped by `entry.model`.
- Bug rate by upstream model — `cr_complete.high + cr_complete.med` per story, grouped by `dev_complete.model`.
- Rework rate by model — count of `cycle_iteration > 1` entries grouped by model.
- Test-pyramid leak rate — `smoke_complete.defects_caught > 0` events.
- NFR-tripwire surfacing rate — `dev_complete.nfr_tripwires` grouped by model.
- Closing-section reliability — `closing_sections_present=false` rate grouped by model.

**`epic_summary` entry (optional, once per epic after the last `committed`):**

```
<UTC> TAB Epic <N> TAB epic_summary TAB stories=N wall_clock_hours=X.X total_high=N total_med=N total_low=N total_smoke_defects=N rework_events=N opus_stage_count=N sonnet_stage_count=N haiku_stage_count=N input_tokens_total=N output_tokens_total=N cost_usd=X.XX
```

Derivable from per-stage entries; a convenience, not a source of truth.

## Anti-Patterns (Do NOT Use)

- **TeamCreate / SendMessage / TeamDelete / team_name / shutdown handshakes** — Inter-agent messaging is unreliable. Use plain `Agent` tool calls; the return value IS the completion signal.
- **TaskCreate / TaskList / TaskUpdate** — Subagents poll TaskList and grab tasks regardless of `blockedBy` or ownership. The task system isn't needed; ignore it.
- **Dispatching `bmad-build-auto` without an explicit anchor** — Without a story key (plan) or spec path (implement) the skill scans for intent, picks the wrong story, or halts `unclear intent`. Under batches or resume that silently plans the wrong story. Always pass the anchor; never let it "find the next story".
- **Using the interactive `bmad-build` as a pipeline stage** — Its checkpoints (`[A]/[E]`, `[S]/[K]`, resume list, push/PR offer) and its `open_spec` editor launch have no place in an unattended run. `bmad-build-auto` is the same workflow with those removed and a machine HALT contract.
- **Folder+id dispatch in sprint mode** — Passing a spec folder / `stories.yaml` to build-auto on an `epics.md` + `sprint-status.yaml` project halts `no epic spec found`. That dispatch mode is for `bmad-spec` projects.
- **Spawning `bmad-build-auto` on a dirty tree** — It halts before planning and again at finalize (Rule 16). Uncommitted cycle-log or tracker writes are the usual culprit: write-ahead → bookkeeping commit → spawn.
- **Disabling every build-auto review layer to save cost** — The skill halts `no active review layers`. Trim by `id` in `_bmad/custom/bmad-build-auto.toml` if telemetry justifies it; keep at least one.
- **Inline skill execution** — Agents interpreting skill logic instead of invoking via the `Skill` tool. Always specify `Skill` explicitly in prompts. For `bmad-build-auto` this also skips the `uv run render_skill.py` bootstrap — the agent then follows unrendered, placeholder-ridden workflow text.
- **Missing context handoff** — Not passing the spec path, `baseline_revision`, and the diff file list between stages; code reviewers can't review effectively.
- **Parent-before-submodule push** — Broken submodule pointers on the remote. Always submodules-first.
- **Normalizing known test failures** — Carrying forward "N pre-existing failures, unrelated" erodes baseline reliability. Fix or formally defer in `deferred-work.md` immediately.
- **Deferred findings only in spec files** — Without centralized tracking in `deferred-work.md`, deferred items are invisible at the next epic's Story X.0 triage.
- **Re-filing an adjudicated finding** — a `by-design`/`wontfix`/`routed` ledger entry re-reported as new work re-purchases triage every epic (pilot: one root cause written up four times). Rule 15: consult the ledger first; append an occurrence to the canonical entry.
- **Reading only from `epics.md`** — `sprint-status.yaml` may contain additional stories (cleanup, hotfixes). Build the story list from both sources.
- **Skipping retrospective review before epic start** — Without explicitly reading the previous retro and triaging deferred items, accumulation goes silent.
- **Parallelizing without verifying disjoint files** — Two agents writing the same file produce non-deterministic state and corrupt the commit.
- **Deferring ADR-mandated agent-time verification without surfacing it** — "I can't do X from this environment" for work an Accepted ADR commits to specific tooling. The lead executes ADR-tooled verifications directly.
- **Treating ADR violations as LOW deferrable findings** — ADR violations are HIGH (Rule 6).
- **Skipping the per-story smoke** — Test pyramid passing while the deployed product is broken is recurring. Failed smoke is HIGH, never deferrable.
- **Smoke executed by a spawned subagent** — Subagents may lack runtime tooling. Smoke is lead-side.
- **Service-introducing story without an Integration AC** — Producer + consumer ship green with wiring never built. Lead validates integration-AC presence at the spec-validation gate.
- **`on_complete` hooks in BMAD `.toml` customizations** — Verification gates belong in the workflow's spawn-prompt skeleton, not the `.toml`. Keeping both creates two sources of truth.
- **Blocking the pipeline waiting for a "completion message"** — The `Agent` tool returns once when the subagent's run ends. Read the returned message directly.
- **Committing directly to `main`, `master`, or `develop`** — Rule SC-6 forbids this absolutely. Every workflow commit lands on `{TICKET}-epic{N}`; trunks are reached only via the SC-4 merge gate + an out-of-band PR.
- **Creating the feature branch silently** — Rule SC-1 mandates STOPping and asking. Silent defaults produce `feature/undefined_undefined` on remotes.
- **Skipping Source Control gates on a "resume" assumption** — Mid-resume should find the branches in place. If missing, that's a workspace-integrity error per SC-2 — halt; don't silently re-create. Silent recreation orphans prior commits.
- **Forgetting submodules need their own `{TICKET}-epic{N}`** — SC-2 applies per repo. Each submodule has its own.
- **Running parallel epics in a single working directory** — Git allows one HEAD per working tree. Parallel agents use `git worktree add` or separate clones (SC-8).
- **Auto-resolving merge conflicts at SC-4** — Three-way-merge conflicts at end-of-epic must be surfaced to the user. Git's auto-resolution can silently drop intentional changes.
- **Spawning pipeline sub-agents without passing the resolved model** — Omitting the `model` parameter on the `Agent` call makes every stage inherit the lead's model instead of the pipeline's intent (dev/qa → `sonnet`, code-review → `opus` per the Model Strategy map, unless `_bmad/custom/model-overrides.yaml` or a skill's frontmatter re-pins it). Resolve per Agent Invocation Pattern step 1 and pass it on the spawn. Lead-run gate skills are the exception — they run inline on the lead's model by design.
- **Letting a skill's interactive checkpoint block the run** — `bmad-code-review` has four happy-path halts (context confirm, decision-needed resolution, patch menu, next-steps menu) plus a large-diff chunking offer; `bmad-qa-generate-e2e-tests` opens by asking what to test. Pre-answer every checkpoint in the spawn prompt (Rule 9); an un-pre-answered checkpoint is a Clarification, never a silent wait. (`bmad-build-auto` has none — its only exits are HALT statuses.)
- **Expecting `bmad-build-auto` to sync sprint-status.yaml** — It never does (only the interactive `bmad-build` syncs). The lead writes `ready-for-dev` / `in-progress` / `review` through `SPRINT_PLAN generate --set`; `bmad-code-review` writes `done`/`in-progress`; the lead writes `epic-{N}: done`. Any other status write path (hand edits, prose instructions to the stage agent) desyncs tracking (see Status Ownership).
- **Hand-parsing or hand-editing sprint-status.yaml** — `SPRINT_PLAN status` returns per-status counts and the next story machine-readably; `SPRINT_PLAN validate` checks integrity; `SPRINT_PLAN generate --set` is the only writer. `/bmad-sprint-status` is a deprecated shim whose `mode=data`/`mode=validate` no longer exist.
- **Reading build-auto's prose instead of the spec** — The spec frontmatter `status` and `## Auto Run Result` are the contract; an agent's summary can claim `done` while the spec says `blocked`. Re-read the spec from disk after every build-auto spawn.
- **Confusing spec status with story status** — Spec `done` = build-auto finished; story `done` = code review passed. Spec `in-review` ≠ sprint-status `review`. Never copy one vocabulary into the other.
- **Backgrounding pipeline subagents** — A backgrounded subagent never hands control back in an unattended run and the pipeline stalls (the reason `bmad-build-auto` mandates synchronous subagent calls). Spawn stages synchronously; a parallel batch is N `Agent` calls in ONE message, which still resolve together.
- **Batching any pipeline stage in one working tree** — Two concurrent build-auto runs in one checkout see each other's uncommitted spec/context files or finalize commits and halt (dirty tree / `finalization left repository dirty`) or race on the index. Stories are strictly sequential within a checkout; concurrency is per-epic worktrees (parallel kit).
- **Letting the first plan spawn compile `epic-<N>-context.md`** — build-auto compiles it *before* its own clean-tree check and then halts on its own untracked output. The lead pre-warms and commits the cache (see Epic Context Pre-warm) after every planning-artifact change.
- **Re-dispatching on a `blocked` spec without resetting `status`** — build-auto routes by frontmatter status; a `blocked` spec always halts `blocked spec supplied`. Apply the answer, set `draft` (re-plan) or `in-progress` (re-implement), commit, re-spawn on the spec path — never on the story key (that creates `spec-<key>-2.md`).
- **Trusting `--set` never to downgrade** — `sprint_plan.py generate --set` is the script's repair path and writes unconditionally. Read the current value first.
- **Unbounded implement↔review rework** — Endless re-spawn ping-pong on unresolved findings is a signal the spec is wrong, not the code. Cap at 3 rework iterations, then surface to the user (see Rework Loop).
- **Skipping the `deferred:` harvest** — build-auto's deferred findings live only in spec frontmatter until the lead copies them into `deferred-work.md`; unharvested items are invisible to Story X.0 triage and the merge-gate sweep (Rule 15).
- **Automating the retrospective** — Spawning `/bmad-retrospective` as a subagent, pre-answering its elicitation or WAIT points, or passing its `-H` / `--headless` flag. The retrospective is the one deliberate human-in-the-middle gate in the loop; its output is only as good as the human answers it collects. (Distinct from the start-of-epic retro-REVIEW gate, which is lead-automated triage of the previous retro's written artifacts and needs no human.)
- **Mis-scoping or forgetting to restore the IDE file-sync toggle** — On IRIS/ObjectScript projects, disable `objectscript.conn.active` ONLY transiently around each branch-changing git operation (Window A: epic-start branching; Window B: SC-4 merge), and restore it immediately after each window. Do NOT leave the sync disabled for the whole epic — the per-story pipeline (commits/pushes, which don't change branches) must run with the sync ON. Each window's restore is mandatory `try/finally`-style: restore on success, halt, failure, merge conflict, or cancellation; an un-restored toggle leaves the workspace silently disconnected from IRIS (no error — just no sync). Never `git add` the transiently-toggled `.vscode/settings.json` into any commit.
- **Basing a new branch on a stale remote root** — when the local trunk is ahead of `origin/<trunk>` (unpushed commits), `checkout -b ... origin/<trunk>` silently removes those commits' files from the working tree — up to and including the project's own `.claude/` + `_bmad/` tooling (pilot incident, 2026-07-10). SC-1's root freshness check is mandatory before creating any branch from a root ref.

```text
=== END .claude/commands/epic-cycle.md ===
```

---

## Step 3b: Optional project model default (ask the user)

The command's `model: opus` frontmatter pin is documented but currently ignored at runtime (anthropics/claude-code #45191); the command therefore self-checks its lead model at pre-flight (the "Lead model gate"). To make sessions START on the right tier, ASK the user:

> "Pin this project's default session model to opus in `.claude/settings.json`? Every new Claude Code session in this project will start on Opus — a cost decision: right for epic-cycle-primary projects, decline for mixed-use repos."

On yes: merge `"model": "opus"` into `.claude/settings.json` (create the file if absent; preserve all existing keys; if a `model` key already exists with a different value, surface it and ask before changing). On no: record the decline and continue — the pre-flight gate still protects each run. Skip the question entirely if `.claude/settings.json` already sets a `model`.

## Step 4: Validate

After writing all files, run these checks:

1. **Slash command does NOT reference deprecated multi-agent patterns:**
   ```bash
   grep -E "TeamCreate|TeamDelete|SendMessage|team_name|shutdown_request|shutdown_response|STATUS: completed|STATUS: clarification_needed" .claude/commands/epic-cycle.md
   ```
   Expected: zero matches outside the Anti-Patterns section. Acceptable: the one mention in Anti-Patterns explicitly forbidding these patterns, and — when the parallel kit is installed — its sanctioned orchestrator→runner `SendMessage` lines in Parallel Orchestration / Permission Mode (filter with `| grep -vE "orchestrator|runner|TeamCreate"`).

1a. **No pre-6.11 pipeline references remain:**
   ```bash
   grep -cE "bmad-create-story|bmad-dev-story|bmad-dev-auto|bmad-quick-dev|mode=data|mode=validate" .claude/commands/epic-cycle.md
   ```
   Expected: only the mentions that explain the retired path — the `SPRINT_PLAN` shorthand, the Model Strategy policy-file migration note, the Rework Loop, and Anti-Patterns (≤ 6 lines); zero in Task Sequence, Pipeline Flow, or any spawn block.

1b. **Finding disposition bar (Rule 15), Rule 16, and the v6.11 stage doctrine installed:**
   ```bash
   grep -c "Rule 15" .claude/commands/epic-cycle.md          # >= 3 (CR block, rework loop, X.0, SC-4)
   grep -cE "^## Rule 1[3456]" _bmad/custom/skill-rules.md  # 4 (13, 14, 15, 16)
   grep -c "Fix Pack" .claude/commands/epic-cycle.md         # >= 2
   grep -c "Root freshness check" .claude/commands/epic-cycle.md  # 1 (SC-1)
   grep -c "Lead model gate" .claude/commands/epic-cycle.md       # 1 (pre-flight)
   grep -c "Halt after planning" .claude/commands/epic-cycle.md   # >= 4 (Task Sequence, skeleton, plan block, Pipeline Flow, X.0)
   grep -c "SPRINT_PLAN" .claude/commands/epic-cycle.md           # >= 10
   grep -c "bookkeeping commit" .claude/commands/epic-cycle.md    # >= 6
   grep -c "Auto Run Result" .claude/commands/epic-cycle.md       # >= 4
   grep -c "baseline_revision" .claude/commands/epic-cycle.md     # >= 5
   grep -cE "blind-hunter|edge-case-hunter|verification-gap|acceptance-auditor" .claude/commands/epic-cycle.md  # >= 3
   ```

1c. **Every customization override parses and loads the rules file** (the v6.11 renderer HALTs on an unparseable override, so this check is mandatory):
   ```bash
   for s in bmad-build-auto bmad-build bmad-qa-generate-e2e-tests bmad-code-review; do
     uv run --no-cache _bmad/scripts/resolve_customization.py --skill "$PWD/.claude/skills/$s" --key workflow.persistent_facts | grep -c "skill-rules.md"
   done
   uv run --no-cache _bmad/scripts/resolve_customization.py --skill "$PWD/.claude/skills/bmad-build" --key workflow.open_spec
   ```
   Expected: `1` four times (each merged `persistent_facts` list contains the rules file); the last command prints the JSON object `{"workflow.open_spec": ""}` (an empty string value). Any `ConfigError` / non-zero exit means an override does not parse — fix it before continuing; the renderer would HALT on it.

2. **All five customization files exist, and the legacy pair is gone:**
   ```bash
   ls _bmad/custom/
   ls _bmad/custom/bmad-create-story.toml _bmad/custom/bmad-dev-story.toml 2>/dev/null | wc -l   # 0
   ```
   Expected: `skill-rules.md`, `bmad-build-auto.toml`, `bmad-build.toml`, `bmad-qa-generate-e2e-tests.toml`, `bmad-code-review.toml` (plus `.bak-*` backups and any `.user.toml`).

3. **No `.toml` carries an `on_complete` hook:**
   ```bash
   grep -l "on_complete" _bmad/custom/bmad-*.toml
   ```
   Expected: zero matches. Verification gates and closing-summary instructions live in the slash command's spawn-prompt skeleton.

4. **No `.toml` references deprecated envelopes:**
   ```bash
   grep -E "STATUS: completed|STATUS: clarification_needed|SendMessage|shutdown_request" _bmad/custom/bmad-*.toml
   ```
   Expected: zero matches.

5. **Each `.toml` loads `skill-rules.md` via `persistent_facts`:**
   ```bash
   grep -c "persistent_facts" _bmad/custom/bmad-*.toml
   ```
   Expected: each file reports `1`.

6. **The slash command contains every section:** open `.claude/commands/epic-cycle.md` and confirm presence of: Pre-flight Runtime Check (with the BMAD + runtime gate and the `SPRINT_PLAN` shorthand), Task Sequence, Permission Mode, Model Strategy, Skill Tool Invocation, Agent Invocation Pattern (with Spawn Prompt Skeleton, Plan / Implement / QA / Code-review stage blocks, Clarification protocol with the build-auto blocking-condition table and re-dispatch protocol, Pipeline Flow), Smart Parallelism (retired), Rework Loop, Status Ownership, Per-Story Smoke, Epic Context Pre-warm, Retrospective Review & Story X.0 Creation, Source Control Branching (with the conditional IRIS/ObjectScript IDE file-sync toggle, Rules SC-1 through SC-8, and Tracker format flexibility), Resume Semantics, Sprint Planning Per Epic, Retrospective Per Epic, Lead Validates the Story Spec, Context Handoff Between Stages, Lead Context Management, ADR-Aware Execution, When to Pause, Handling Clarifications, Submodule / Sub-Repository Commit Order, Completion Logging, Workflow Telemetry, Anti-Patterns.

7. **Telemetry metadata is documented:**
   ```bash
   grep -c "spawn_at" .claude/commands/epic-cycle.md
   grep -c "model=" .claude/commands/epic-cycle.md
   grep -c "closing_sections_present" .claude/commands/epic-cycle.md
   ```
   First two ≥ 3 matches; third ≥ 2 matches.

8. **The slash command carries the model strategy and passes resolved models on spawns:**
   ```bash
   grep -c "Model Strategy" .claude/commands/epic-cycle.md
   grep -c "model resolved in step 1" .claude/commands/epic-cycle.md
   ```
   Expected: first ≥ 2, second ≥ 1 (the Agent Invocation Pattern resolves frontmatter-override-else-map and passes it on the `Agent` call).

9. **Interactive checkpoints are pre-answered and the rework loop is bounded:**
   ```bash
   grep -c "Pre-answered checkpoint" .claude/commands/epic-cycle.md
   grep -c "Rework Loop" .claude/commands/epic-cycle.md
   grep -c "SPRINT_PLAN status" .claude/commands/epic-cycle.md
   ```
   Expected: first ≥ 2 (QA + code-review stage blocks), second ≥ 3, third ≥ 3 (shorthand definition, resume detection, lead context management).

10. **Status ownership is documented with the v6 enum and the lead's writer:**
   ```bash
   grep -c "epic_status_done" .claude/commands/epic-cycle.md
   grep -c "ready-for-dev" .claude/commands/epic-cycle.md
   grep -c "generate --set" .claude/commands/epic-cycle.md
   ```
   Expected: first ≥ 3 (End of Epic step + Pipeline Flow + telemetry stage list), second ≥ 3, third ≥ 5.

11. **The retrospective human-in-the-middle exception is explicit:**
   ```bash
   grep -c "human-in-the-middle" .claude/commands/epic-cycle.md
   ```
   Expected: ≥ 4 (Execution Guidelines, Retrospective Per Epic heading + body, Pipeline Flow, telemetry stage list, Anti-Patterns).

12. **The slash command includes the conditional IRIS/ObjectScript IDE file-sync toggle:**
   ```bash
   grep -c "objectscript.conn.active\|IDE file-sync toggle" .claude/commands/epic-cycle.md
   ```
   Expected: ≥ 2 matches (the toggle subsection under Source Control Branching + the Pipeline Flow steps + the Anti-Pattern). The toggle must be conditional — it applies only when `.vscode/settings.json` has `objectscript.conn.active: true`, and is skipped entirely on non-ObjectScript projects.

---

## Step 5: Done

The workflow is ready to use. Projects can add custom rules to `_bmad/custom/skill-rules.md` (under "Project-specific rules") as retrospectives identify durable patterns, and can pin branch-naming conventions in `_bmad/custom/branch-naming.yaml` if the JIRA-style defaults don't fit. This kit document can be retained as the authoring source for future regeneration, or deleted — the slash command and customizations are self-contained at runtime.

**Upgrading from a pre-6.11 install:** `_bmad/custom/model-overrides.yaml` (if present) is keyed by skill in the old schema (`bmad-dev-story`, `bmad-quick-dev`, `bmad-qa-generate-e2e-tests`); offer to rewrite it to the stage-keyed schema (`implement`, `qa`) with a `history:` entry `action: schema-migrated-to-stages`. The `.bak-*` copies of `bmad-create-story.toml` / `bmad-dev-story.toml` can be deleted once the user is satisfied; restoring them only affects explicit by-name runs of those deprecated shims.

**Coexistence with `bmad-loop`:** if the project has the `bmad-loop` module installed (`_bmad/bmad-loop/`, `.bmad-loop/policy.toml`), tell the user that `/epic-cycle` and `bmad-loop` both drive `bmad-build-auto` and must not be run over the same stories concurrently — `bmad-loop` dispatches from a `bmad-spec` folder (`SPEC.md` + `stories.yaml`), `/epic-cycle` from `epics.md` + `sprint-status.yaml`; pick one per epic.

Record the install: create/update `_bmad/custom/kit-versions.yaml` with `epic-cycle-base: <this document's Kit-Version>` (companions record their own keys: `skill-optimization`, `parallel-epic-cycle`). The parallel kit's upgrade check reads this registry.

**Commit the OUTPUT, completely.** `git add -A && git commit` with a message naming the kit version applied — the output set is the installed files (`.claude/commands/epic-cycle.md`, `_bmad/custom/*` including `kit-versions.yaml`, `.claude/settings.json` if Step 3b ran, backups), NOT just the kit source documents. Verify `git status --short` is empty afterward; a dirty tree trips the next run's clean-tree gates. (Pilot finding 2026-07-11: an upgrade session committed only the kit documents and left every output file dirty.)

**⚠️ Tell the user explicitly — session restart required.** A session that has already invoked `/epic-cycle` holds the OLD command text in its context; this install/upgrade takes effect only in NEW sessions and invocations. Instruct the user, verbatim: close this session and any session currently mid-`/epic-cycle`, and start a fresh session before the next `/epic-cycle`.

**Companion documents** (normally in the same directory as this kit): `skill-optimization-prompt.md` — the optional per-skill model-tier pass; run it AFTER this kit so the `/epic-cycle` command exists to receive its `model: opus` pin — and `parallel-epic-cycle-workflow-creation.md` — parallel epic execution via worktrees and runner subagents; requires this kit and offers to chain both prerequisites itself. **If either companion was previously applied and you just re-ran this kit, re-apply them now:** this install overwrote `.claude/commands/epic-cycle.md`, removing the model pin and the parallel patches (both companions are idempotent and safe to re-run).
