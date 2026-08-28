# Bug report — `/epic-cycle` stage-subagent containment, notification routing, and dormant telemetry gates

**Filed:** 2026-08-28 (second report of the day)
**Kit version:** base `2026-08-28.1`, parallel `2026-08-28.1` — i.e. **these are bugs in the patch that fixed the previous two**
**BMAD:** 6.11.0 · **uv:** 0.12.5 · **Platform:** Windows 11, Git Bash
**Command file analysed:** `.claude/commands/epic-cycle.md` (1237 lines; all `L<n>` refer to it)
**Context:** DragonWar (DW-1), Epic 1 Stories 1.3–1.4, Orchestrator Mode + one epic-runner
**Reported by:** orchestrator session (Opus 5)

---

## Summary

The 2026-08-28.1 patch **worked** for the two bugs it targeted (see "What the patch fixed"). The
failures below are different — but bug 1 is the *same class* as one the patch addressed, reached by
a route the patch's wording does not cover.

| # | Failure | Root cause | Severity |
|---|---|---|---|
| 1 | A stage agent `SendMessage`-resumed its own returned handoff subagent, creating an orphan writer **no party had authority to stop** | The prohibition is a **closed enumeration of four directions**; the one that fired is not among them, and it is never propagated into stage prompts | **High** |
| 2 | That stage agent also returned an **interim message while still running** | "Interim messages are not a supported return" is specified for **runners only** (L74) | **High** |
| 3 | Stage/handoff completion notifications surface to the **orchestrator**, which has no handling rule | `### Notification handling` (L76–L84) enumerates runner returns only | **Med-High** |
| 4 | `ListAgents` is the prescribed liveness oracle but **cannot distinguish "returned to parent" from "still running"** | L83 / L84 / L885 make it the test; it answers a different question | **Med-High** |
| 5 | A `TOOLING:` clarification **neither runner nor orchestrator can satisfy** has no modelled outcome | L82 asserts the orchestrator "executes that one verification itself" | **Med** |
| 6 | The model-tier checkpoint **cannot fire on a default project**, even with its own criteria met | L226 arms it only if an **optional, non-default** file exists | **Med** |
| 7 | Two writers inside a single stage are **sanctioned by design**, producing false protocol alarms | build-auto's stage agent edits while its handoff subagent edits | **Low-Med** |
| 8 | A Rule 5 planning amendment on an epic branch trips a **full DAG re-approval** at merge | `epics_md_hash` exemption covers only Story X.0 insertions | **Low** |
| 9 | Orchestrator bookkeeping uses **repo-relative paths**, so a persisted shell cwd silently redirects writes into a runner worktree | No cwd assertion; the kit elsewhere forbids exactly this write | **Low** |

Nothing lost data. **Bugs 1–4 are one incident seen from four angles and should be patched together.**

---

## BUG 1 — the `SendMessage` prohibition is a closed list, and omits the direction that fired

### What happened

Story 1.4, implement stage. `1-4-placeholder-table-implement-1` (the stage agent) spawned its
implementation-handoff subagent, which **returned**. The stage agent then **`SendMessage`-resumed
that returned subagent** to hand it 16 code-review patch findings. Its own words to the runner:

> "sent the consolidated list of 16 patch findings to the implementation subagent (resumed via `SendMessage`)"

The resumed subagent became a live writer in the worktree whose supervising `Agent` call had already
returned — a de-facto background stage, invisible to the cycle log (its `stage_spawned` had been
closed by `dev_complete`).

### Evidence

`_bmad-output/implementation-artifacts/cycle-log-epic-1.md` L93, committed on `DW-1-epic1`:

```
2026-08-28T11:07:55Z  Story 1.4  protocol_violation
  stage=implement depth=2_to_3 agent=1-4-placeholder-table-implement-1
  violation=sendmessage_resumed_own_handoff_subagent_then_returned_interim_message_to_lead_while_still_running
  consequence=orphaned_writer_in_worktree_with_dead_supervisor
  detected_by=two_point_mtime_sampling+TaskStop_agent_listing
  lead_taskstop_attempt=refused_not_owner
  lead_action=waited_for_quiescence_did_not_respawn_single_writer_preserved
  outcome=stage_self_finalized_correctly commits=1 pushes=0 ci_triggered=0 tree_clean=true
  note=kit_gap_rule_forbids_lead_to_stage_sendmessage_but_not_stage_to_own_internal_subagent
```

The runner proved the live writer by sampling mtimes 46 s apart (`src/sim/physics/loader/index.ts`
changed between samples) and by `TaskStop` listing the handoff subagent as running. Its stop attempt
was **refused**:

> `owned by a1efb09ecd306b106; agent a58812e090f3939b5 cannot stop it`

### Root cause (command text)

Both prohibition sites are **closed enumerations of four directions**:

- **L1183:** "Runner→stage, orchestrator→stage, lead→stage, and runner→runner `SendMessage` are all forbidden"
- **L1184:** "Lead→stage, runner→stage, orchestrator→stage, and runner→runner `SendMessage` are all forbidden; orchestrator→runner is the sole sanctioned use"

Every listed direction is **downward from a supervisor to a pipeline stage**. The direction that
fired — **a stage agent to its own internal subagent** — is a fifth direction, one level deeper, and
appears in neither list. An agent reading L1184 literally is not prohibited from what it did.

Compounding it: **the prohibition is never propagated into stage prompts.** The implement-spawn block
(L304) mandates propagating prohibitions verbatim into the handoff subagent and every review layer —
but names only `git commit` / `git push` / `git reset` / `git rebase` / CI-triggering commands.
`SendMessage` appears in **no** `🚫` block in **any** stage skeleton (plan, implement, QA,
code-review). The one rule that would have prevented this never reaches the agent capable of
breaking it.

This is the same shape as the *previous* bug 2026-08-28.1 fixed (Rule 13 propagated the working
directory but not the git prohibitions). The patch fixed that instance; the **pattern** — a
prohibition stated only at supervisor level and never propagated downward — recurred one level
deeper within hours.

### Second-order defect: no orphan-stop authority

Once created, **nobody could stop the orphan.** `TaskStop` is owner-scoped; the runner is not the
owner (the stage agent is, and it had returned). The kit gives the runner no remedy, and the correct
action is non-obvious: re-spawning would have created a *second* writer, so the runner waited ~15
minutes for quiescence. That was correct and is nowhere in the command.

### Proposed patch

1. **Replace both enumerations with a universal rule:**
   > "`SendMessage` to any agent whose `Agent` call has already returned is forbidden, at every depth
   > and in every direction — supervisor→stage, stage→its own internal subagent, peer→peer. A
   > returned agent is finished. The only sanctioned use in the system is orchestrator→runner."

   Keep the four examples as illustrations, explicitly marked non-exhaustive.
2. **Add `SendMessage` to every stage skeleton's `🚫` block**, in the same breath as the git
   prohibitions and Rule 13, with the propagation mandate: "…and they may NOT `SendMessage` any
   agent, and you may NOT `SendMessage` them once they have returned to you. To give a returned
   subagent more work, spawn a fresh one."
3. **Add an orphan protocol** to Notification handling and Resume Semantics: on detecting a live
   writer whose supervisor has returned — evidence: two-point mtime sampling, `TaskStop` listing —
   (a) do NOT re-spawn, (b) attempt `TaskStop`, (c) on refusal wait for quiescence and reconcile,
   (d) log `protocol_violation`, (e) escalate to the orchestrator, which also cannot stop it and
   should record it. Name mtime sampling as the sanctioned detection technique.

---

## BUG 2 — "interim returns are forbidden" is specified for runners only

The same stage agent **returned an interim message to the runner while still running**.

L74 (runner spawn skeleton) says: *"Interim or progress messages are NOT a supported return: end your
turn ONLY with this contract or with `## Clarification Needed`."* That sentence exists **only** in the
runner's contract. The stage skeletons define their completion contract as the spec file's frontmatter
plus `## Auto Run Result`, but never forbid returning early while work continues.

**Patch:** add to each stage skeleton's completion-contract item: "Return exactly once, when your work
is complete. An interim or progress return while your own subagents are still working is forbidden —
it strands them as orphan writers (see BUG 1)."

---

## BUG 3 — Notification handling has no bucket for a non-runner notification

`### Notification handling` (L76–L84) classifies four runner returns plus a crash case. **Twice this
session a stage/handoff subagent's completion notification surfaced to the orchestrator session**
(task ids `a1efb09ecd306b106` "Implement Story 1.4 spec", `a9fd4c9e266f0d5d5` "Implement Story 1.4").
These are depth-2/3 agents the orchestrator never spawned.

Consequences observed:

- The orchestrator had no rule and improvised.
- One notification reported an unexplained file in the worktree
  (`test/export-py-version-gate.test.ts`). Acting on it, the orchestrator issued a conditional
  stand-down to the runner that had to be **rescinded** two messages later once the file proved benign
  (BUG 7) — wasted runner cycles during an active rework.

**Patch:** add a fifth bucket:

> **A notification from any agent that is not a runner** → it is not addressed to you, and its contents
> are a *stage's* view, not ground truth. Do NOT act on the worktree and do NOT relay its claims as
> fact. Confirm the owning runner's liveness (`ListAgents`); if alive, route the question to it — it is
> the only party that knows its own stage state. Log `runner_interim_status`.

---

## BUG 4 — `ListAgents` answers process liveness, not protocol state

L83, L84 and L885 all make `ListAgents` the liveness test ("confirm the runner is alive
(`ListAgents`)", "ONLY when `ListAgents` confirms the runner is dead", "then the runner's liveness
(`ListAgents`)").

During the BUG 1 incident the orchestrator ran `ListAgents` and saw:

```
epic-runner-1                              running    started 2h ago
1-4-placeholder-table-implement-handoff    completed  started 18m ago
1-4-placeholder-table-implement-1          running    started 32s ago
```

and concluded **"one active stage agent, which is fine."** That was wrong. `1-4-…-implement-1` had
**already returned** to the runner; `running` reflected its resumed continuation. `ListAgents` cannot
express "returned to its parent but still executing" — precisely the state the anti-pattern warns
about ("an agent that has 'returned' yet is still running"). The runner was right to distrust the
orchestrator's reading and gathered its own evidence.

**Patch:** state the limitation wherever `ListAgents` is prescribed:

> "`ListAgents` reports process liveness, not protocol state. An agent that has returned to its parent
> may still appear `running` if it was `SendMessage`-resumed. It is sufficient to establish whether a
> **runner** is alive or dead; it is **not** sufficient to establish that stage discipline holds. For
> that, ask the owning runner, or sample file mtimes."

---

## BUG 5 — a `TOOLING:` clarification neither party can satisfy

L82: *"the runner lacks an MCP/runtime tool. **The orchestrator executes that one verification
itself**, inside the epic's worktree, using its full session tool inventory."*

Story 1.4 needed Blender 5.2 to author `assets/src/dragonwar.blend` and run `tools/export.py`
headless. It was not installed, and the orchestrator could not simply "execute the verification":

- `winget install` → **`403 Forbidden`**. `download.blender.org` returns 403 for its own root from
  this network (`www.blender.org` resolves fine), so the origin host blocks it.
- The per-machine MSI → **exit 1603**, because the session is not elevated and an elevated retry needs
  an interactive UAC click unavailable in a non-interactive session.

Resolution required **user authorization** for a system change, then an out-of-band route (official
portable build from a mirror, SHA256 cross-checked against two mirrors *and* Microsoft's winget
manifest before execution). None of that is modelled: the kit assumes the orchestrator is a strict
superset of the runner's capability. It is not — they differ in *authority*, not only tools.

**Patch:** add a third outcome to L82:

> "If the orchestrator also cannot perform it — an uninstalled tool, an elevation requirement, a
> network block, or anything needing user authorization — do NOT improvise a re-scope. Escalate to the
> user with costed options (provision the tool / amend the story / pause the epic), log
> `runner_tooling_backstop … status=escalated_to_user`, and resume the runner only with an explicit
> decision."

---

## BUG 6 — the model-tier checkpoint cannot fire on a default project

L226: *"Runs only when model-overrides.yaml exists with `stack_risk: uncommon` OR `review_tier:
mixed`."* `_bmad/custom/model-overrides.yaml` is **optional and absent by default**; it does not exist
on this project.

Meanwhile the checkpoint's own escalation criteria are **already met**, measured from the cycle log:

| Story | CR `high` | CR `med` | high+med | rework (`cycle_iteration=2`) |
|---|---|---|---|---|
| 1.1 | 2 | 5 | 7 | yes |
| 1.2 | 3 | 0 | 3 | yes |
| 1.3 | 0 | 0 | 0 | no |
| 1.4 | 2 | 7 | 9 | yes |
| **mean** | | | **4.75** | **3 of 4 stories** |

The rule escalates `implement` to Opus when mean high+med ≥ 2/story on a Sonnet implementer **or** ≥ 2
stories enter rework. Both triggers are met by wide margins. **The gate will never evaluate**, because
arming it requires a file no default install creates. The telemetry is dutifully written by every
`cr_complete` entry and read by nothing.

**Patch:** decouple *evaluating* from *changing*. Evaluate unconditionally at end of epic and always
log `model_tier_checkpoint`; require the policy file plus user approval only to **apply** a change.
Failing that, have the pre-flight warn when accumulated telemetry crosses a threshold and no policy
file exists.

---

## BUG 7 — two writers inside one stage, sanctioned by design

build-auto's implement stage agent runs its own Matrix Test Audit and authors tests **while** its
implementation-handoff subagent is editing the same worktree. On Story 1.4 the stage agent added four
tests (Blender PATH resolution, Blender-too-old, missing-required-node, missing-lightmap-UV). The
handoff subagent observed one appear mid-session and reported:

> "`test/export-py-version-gate.test.ts` appeared in the working tree during my session, not authored
> by me, not among the 16 findings. Left untouched; flagged for provenance confirmation."

It was benign — the parent's audit coverage. But the kit forbids exactly this hazard at story level
("Parallelizing without verifying disjoint files"; "Batching any pipeline stage in one working tree")
while permitting it one level down, and it produced a real false alarm costing an investigation, an
orchestrator stand-down instruction, and a rescind.

**Patch:** require the stage agent to quiesce its handoff subagent before making its own edits, or to
announce files it authors so children can distinguish sibling work from foreign writes. Note the
hazard explicitly in the implement skeleton.

---

## BUG 8 — `epics_md_hash` re-approval is too broad for Rule 5 amendments

Configuration step 2 exempts only *"an inserted `Story X.0` heading + body"* from re-approval when
`epics_md_hash` no longer matches.

Story 1.4's smoke failure forced a Rule 5 amendment: the pinned CSP is unimplementable as written
(Babylon serves embedded glTF textures over `blob:`; the app does not boot). The fix amends **NFR-7 and
two story ACs** in `epics.md`, plus AD-17, SOLUTION-DESIGN and the L9 review rubric. None of it touches
epic boundaries or `depends_on`, yet at merge the hash mismatch demands a **full DAG re-analysis and
re-approval**.

**Patch:** exempt amendments that do not alter epic boundaries or dependency-relevant content; require
re-approval only when `depends_on`, epic membership, or story-to-epic assignment changes. Have the
orchestrator diff the parsed epic structure rather than the raw file hash.

---

## BUG 9 — orchestrator bookkeeping uses relative paths into a live worktree (hardening)

The kit repeatedly forbids the orchestrator writing to a worktree ("Never touch the main checkout or
another epic's worktree"; "The orchestrator never touches the worktree's tree or spec"), but every
orchestrator bookkeeping command is written **repo-relative**
(`_bmad-output/implementation-artifacts/cycle-log-parallel.md`).

In this session the orchestrator's shell cwd persisted from a read-only verification inside the epic
worktree; the next bookkeeping command therefore ran **there**, producing commit `636e164` on
`DW-1-epic1` that appended one line to the epic branch's stale copy of `cycle-log-parallel.md`, and
pushed it. Contained (one line, one file, zero source files, tree clean, no divergence) and logged as
`orchestrator_error fault=orchestrator` — but the kit invites it: a single stray `cd` silently
redirects orchestrator state into a runner's branch.

**Patch:** require absolute paths for all orchestrator writes, or a cwd assertion
(`git rev-parse --show-toplevel` must equal the main checkout) immediately before every orchestrator
bookkeeping commit — the mirror of Rule 13, which stage agents already must satisfy.

---

## What the 2026-08-28.1 patch fixed — do not regress these

Both previously-reported failures were **prevented** this session:

1. **Depth-3 git escape:** zero subagent commits, pushes or CI triggers across Stories 1.3 and 1.4.
   The runner verified against `git log --branches --not --remotes` and `gh run list` rather than
   trusting self-reports, exactly as the patched text requires. `dev_complete` L94 records
   `no_push_verified=true`.
2. **Artifact-based liveness diagnosis:** the orchestrator never diagnosed worktree state from files;
   it checked liveness and asked the runner, per the patched Resume Semantics. The runner likewise
   refused to re-spawn onto a suspected live writer.

Also working well and worth preserving:

- **The per-story smoke gate is the highest-yield gate in the pipeline.** It caught two defects the
  full test pyramid passed: GPL notices stripped from `dist` (Story 1.2), and Story 1.4's non-booting
  app (442 tests green — `NullEngine` never decodes images, so no automated tier could see the CSP
  block; both code-review iterations also passed it).
- **Write-ahead logging and resume** survived two kit upgrades, several session restarts and a
  15-minute orphan stall with no lost or repeated work.
- **The ledger drain is functioning:** 56 entries with only 2 open — per-story `ledger_adjudicated` is
  closing slices rather than letting them accumulate.

---

## Guidance for the patcher

The highest-value change is **BUG 1's universal rule plus propagation into the stage `🚫` blocks**.
Bugs 2, 3 and 4 are the same incident's blast radius and should land with it — together they are what
turned one bad `SendMessage` into an unstoppable orphan that neither the runner nor the orchestrator
could correctly classify. Bugs 5, 6, 8 and 9 are independent and individually small.

Note the meta-pattern: **twice now, a prohibition stated only at the supervisor level has been broken
one level below it.** Consider auditing every rule in the command for "is this propagated to every
depth that can violate it?" rather than patching instances one at a time.
