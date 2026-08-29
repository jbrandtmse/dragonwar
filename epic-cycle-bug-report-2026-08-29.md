# Bug report — `/epic-cycle` footprint authority, test falsifiability, ledger drain sizing, contract self-verification

**Filed:** 2026-08-29 (third report; first filed against kit `2026-08-29.1`)
**Kit version:** base `2026-08-29.1`, parallel `2026-08-29.1` (model pass reapplied)
**BMAD:** 6.11.0 · **uv:** 0.12.5 · **Platform:** Windows 11, Git Bash
**Command file analysed:** `C:/git/dragonwar/.claude/commands/epic-cycle.md` (1251 lines; all `L<n>` refer to it)
**Rules file:** `C:/git/dragonwar/_bmad/custom/skill-rules.md`
**Context:** DragonWar (DW-1), Epic 1 Stories 1.5–1.8, Orchestrator Mode + one epic-runner
**Reported by:** orchestrator session (Opus 5)

**Standing note — the 2026-08-28 containment bugs appear fixed.** Zero protocol violations across
Stories 1.5–1.8 under `2026-08-29.1`, against two in Stories 1.2–1.4. Rule 18 and the
`_bmad/custom/*.toml` prohibition propagation are holding, including at depth 3. Nothing below is a
recurrence; these are new findings from the next stretch of the same epic.

---

## Summary

Measured over Epic 1 (8 stories planned, 7 committed at filing time):

| Signal | Value |
|---|---|
| Runner clarifications | 9 across 8 stories |
| User decisions required | 7 |
| One-time `epics.md` / root-file footprint widenings | 5 (all in Stories 1.6–1.8) |
| Rework iterations | 3 (`cr_complete` 10 vs `committed` 7) |
| Ledger total | 57 → 84 |
| `owner:burndown` | 19 → 29 (against `ledger_cap` 8) |
| Test count | 518 → 659 |
| Protocol violations | 2, both pre-`2026-08-29.1` |
| **False halts** | **0** |

Zero false halts is the headline. Every one of the 9 clarifications was a real defect or a genuine
product decision; not one was the pipeline confusing itself. The gates work. Everything below is
about **cost** and **coverage**, not correctness.

- **BUG 1** is the largest and is an *internal contradiction*: the kit anticipates runners amending
  `epics.md` (L44) while the footprint rule forbids it (L72 + Rule 11).
- **BUG 2** is a coverage gap that let the pipeline's own QA stage *and its own ADR gate* emit
  evidence that could not fail.
- BUGs 3–5 are bounded defects with small patches. BUG 6 is documentation.

---

## BUG 1 — the footprint model forbids the planning amendments the kit itself expects runners to make

### What happened

Every story from 1.6 onward required a planning-artifact or root-file amendment that the runner had
correctly diagnosed but was not permitted to apply:

| Story | Amendment needed | Why the runner could not apply it |
|---|---|---|
| 1.6 | Cradle AC unsatisfiable — the placeholder table has no geometry beside the flippers, so no cradle pocket exists | `epics.md` out of footprint |
| 1.6 | AC 2's observable ("flipper angle changes on tick *t*") unreachable given the verbatim port AD-5/AD-15 mandate | `epics.md` out of footprint |
| 1.7 | New `vpinball/vpinball` dependency needs its `ATTRIBUTIONS.md` row *before* any file lands | root file out of footprint |
| 1.8 | AC 4's five goldens cannot start — no `InputTransition` can put a ball in play | `epics.md` out of footprint |
| 1.8 | DW-82: shipped `public/THIRD-PARTY-NOTICES.txt` omits the vpinball block while the port ships | `public/**` out of footprint |

Five widenings across three stories. **The exception path became the normal path.**

### Evidence

The contradiction is inside the command file itself.

**L44** (dependency-graph resolution) exempts from re-approval any `epics.md` diff that is "amended
NFRs / ACs / descriptions (**a runner's Rule 5 amendment** or retro-review gate does exactly that)".
The kit therefore *anticipates runners amending `epics.md`* and ships a purpose-built hash exemption
for it.

**L72** (Runner Spawn Skeleton item 5) gives the runner "allowed paths + submodules (Rule 11
applies; quote it)", where allowed paths come from `paths_hint` in
`C:/git/dragonwar/_bmad/custom/epic-dependencies.yaml` — for Epic 1 that is
`src/** test/** tools/** assets/src/** .github/workflows/** package.json`, i.e. code only.

**Rule 11** (`skill-rules.md`): "An epic-runner may modify only the paths and submodules declared in
its epic's footprint … Needing … a path owned by a concurrently running epic, is a
`## Clarification Needed` — never a judgment call."

**Rule 5** (L292, L306, L367) instructs the runner to HALT with "your recommended amendment" —
recommend, never apply.

So: L44 expects the amendment to happen; Rule 11 forbids the runner from making it; Rule 5 tells it
to recommend one and stop.

### Root cause (command text)

`paths_hint` exists to answer a **concurrency** question — which epic may touch which files, so two
runners in two worktrees do not collide. Rule 11 reuses it to answer an **authority** question —
what a runner is permitted to change at all. Those are different questions with different right
answers.

Planning artifacts are not contended between concurrent epics the way source files are (each epic
amends its own story blocks), and on a **greenfield** epic they are precisely the files most likely
to be wrong, because that is where specification meets a physics engine for the first time.

### Consequence

Roughly four of nine clarifications this epic were **authorization-only**: the finding was already
correct, already verified by the runner, and re-verified by the orchestrator. The round trip added
no information — only latency. Each costs: runner halt → notification → orchestrator verification →
user decision → `SendMessage` → resume.

### Proposed patch

Separate concurrency footprint from amendment authority.

1. Add an optional per-epic key to `epic-dependencies.yaml`:

   ```yaml
   epics:
     epic-1:
       depends_on: []
       paths_hint: ["src/**", "test/**"]
       planning_authority: amend      # recommend (default) | amend
   ```

2. When `planning_authority: amend`, the runner MAY edit `epics.md` **within its own epic's story
   blocks only**, under the amendment discipline that already produced the value on this epic: an
   inline `[AMENDED <date> — see the story change log below]` marker, plus a change-log entry stating
   what was unreachable, the evidence, and where the residual now lives.

3. The runner MUST list every amendment it made in its completion contract, for post-hoc orchestrator
   review. Add to L76's contract: `amendments: <file:line — one line each, or (none)>`.

4. Keep the HALT for anything touching **another epic's** stories, epic boundaries, or dependency
   statements. Those are exactly the cases `epics_md_hash` re-analysis exists for, and they should
   still reach the user.

5. Amend L72 to state which paths carry *authority* and which are merely the *concurrency* footprint,
   rather than the current undifferentiated "allowed paths + submodules".

**Rationale:** the *discipline* is what made these amendments safe — every one is auditable in
`epics.md` today, with its reasoning attached. The *boundary* contributed round trips, not safety.
Post-hoc review of a marked, logged, contract-reported amendment is nearly as safe as
pre-authorization and roughly an order of magnitude cheaper.

**Counter-argument, stated honestly:** the boundary is what forced orchestrator verification of each
amendment, and that verification caught real things (an earlier CSP grep missed two sites). The patch
above preserves that by making the contract report mandatory — verification moves from blocking to
post-hoc, rather than disappearing.

---

## BUG 2 — nothing requires a test to be demonstrated to fail; the pipeline's own gates emitted unfalsifiable evidence

### What happened

Five independent samples of assertions that could not fail, every one found by adversarial review or
by a later story tripping over it — **none found by any gate designed to catch it**:

1. Story 1.5's determinism test asserted ball position **with no ball spawned**. Both runs returned
   the same nothing.
2. Switch-tracker multi-tick hysteresis never exercised; device overflow never driven through
   `machine.step`.
3. **Two modules with no executed test host** — the host loop, and all of `sim/rules`.
4. `machine-serve-drain` was green **because of** the tunnelling defect DW-60 removes. It was
   measuring the bug; fixing the bug broke the test.
5. Four tests asserting `RulesStepResult.commands` `toEqual([])` — **vacuous at type level**, because
   the type is `readonly never[]`.

Sample 5 is the serious one. That assertion was the *recorded proof* of AD-5's "no rules round trip",
and it reached the telemetry: the Story 1.6 cycle log carries
`adr_verifications_complete … ad5_no_rules_round_trip=pass_commands_empty`. **The lead's own ADR gate
emitted a pass for an assertion the type system makes impossible to fail.**

Test count grew 518 → 659 across the epic. Count grew; discriminating power did not track it.

### Evidence

`C:/git/dragonwar/.worktrees/epic-1/_bmad-output/implementation-artifacts/cycle-log-epic-1.md`:

- Story 1.5 `qa_complete` → `note=closed_3_vacuous_pass_gaps;switch_tracker_multitick_hysteresis_never_exercised;device_overflow_never_driven_through_machine.step;determinism_test_ball_position_half_was_vacuous_no_ball_spawned`
- Story 1.5 `cr_complete` → `note=found_6_more_assertions_that_could_not_fail_and_TWO_modules_with_no_executed_test_host_loop_and_all_of_sim_rules`
- Story 1.6 `adr_verifications_complete` → the `ad5_no_rules_round_trip=pass_commands_empty` claim
- Type behind sample 5: `C:/git/dragonwar/.worktrees/epic-1/src/sim/rules/index.ts:30`

### Root cause (command text)

- **Rule 8** (L325) governs test **discoverability** only — naming convention, ignore files, tags.
- **Rule 3** requires real-runtime evidence for user-facing surfaces.
- **`qa_complete` telemetry** (L1133) records `tests_added=N first_run_failures=N` — quantity and
  initial redness, not discriminating power.
- The **ADR gate** ("Layer 1", lead-executed) records `result=pass|fail` with evidence paths and says
  nothing about whether the evidence could have come out otherwise.

Nowhere does the kit ask the question that matters: *would this test fail if the behaviour regressed?*

### Proposed patch

**New rule — falsifiability.** Every assertion a stage adds for an acceptance criterion must be
demonstrated to fail against a stated mutation: name the mutation, apply it, observe red, revert, and
record the mutation next to the test in the spec's `## Verification`. A test whose red has not been
observed is not evidence.

Concretely:

1. **QA spawn block**, after L325: "For each test you add against an acceptance criterion, name the
   mutation that would make it fail, apply it, confirm red, revert. Record the mutation alongside the
   test in `## Verification`. A test whose red you have not observed is not evidence."

2. **ADR gate (Layer 1)**: the lead's verification must state the mutation for each ADR-tooled AC. A
   `result=pass` recorded without one is not a pass. This is the half that failed here — the gate is
   lead-side and therefore trusted, which is exactly why it needs the requirement most.

3. **Telemetry**: extend `qa_complete` to `tests_added=N mutations_demonstrated=N`. A persistent gap
   between the two is the visible signal that would have surfaced this at Story 1.5 rather than 1.8.

4. **Optional, lint-shaped, probably out of kit scope but worth naming:** flag assertions whose
   expected value is structurally unreachable — `toEqual([])` against a `never[]` is statically
   detectable.

**Field note:** this project has since put the mutation requirement *into the acceptance criteria
themselves* ("a test that fails when the hardware rules run after `physics.step()`"). It works, but
only where someone remembered to write it. It belongs in the kit.

---

## BUG 3 — the burn-down gate is bounded; its inflow is not

### What happened

L641: "Exactly one burn-down story per epic — the gate is bounded." L530/L641 charter it when the
remainder exceeds `ledger_cap` (default 8).

Measured on Epic 1: ledger **57 → 84** total; `owner:burndown` **19 → 29** against a cap of **8**.

Per-story adjudication genuinely works — Story 1.6 closed four owned entries with commit and test
evidence, verified. But adversarial review at Opus tier files findings faster than one chartered
story can absorb them.

### Root cause (command text)

`ledger_cap` is a **trigger** threshold, not a **capacity** model. Nothing in the kit relates the cap
to how much one story can realistically close. The gate as written will charter a single story with
~29 acceptance bullets, which is either enormous or — more likely — re-owns most of them onward.
Re-owning en masse is the "relabelling instead of closing" anti-pattern the kit explicitly forbids,
reached by following the kit's own instructions.

### Proposed patch

Pick one, or combine:

- **Scale the charter:** `ceil(remaining / ledger_cap)` burn-down stories (`N.9`, `N.9b`, …), or
- **Make the overflow explicit:** state the policy when remainder ≫ cap, rather than leaving the
  runner to improvise between an oversized story and mass re-owning, and
- **Surface a drain ratio** either way: report closed-per-story against filed-per-story across the
  epic in `ledger_burndown_complete`, and surface it at the merge gate. An under-sized drain should be
  visible as a number, not inferred from a growing total.

---

## BUG 4 — `Story N.9` collides with an existing story

### What happened

L173, L531 and L641 all charter the burn-down story as `Story N.9`. DragonWar's Epic 1 already
contains `### Story 1.9: Dev tuning panel and the first feel ritual`
(`C:/git/dragonwar/.worktrees/epic-1/_bmad-output/planning-artifacts/epics.md:642`).

The convention silently assumes `N.9` is free. Here it is not, and the collision would produce a
duplicate heading and an ambiguous sprint key.

### Proposed patch

One sentence at each of the three sites: "…charter Story `N.<next free number>` — conventionally
`N.9`, but take the next unused number under Epic N if `N.9` already exists — and derive the sprint
key from the number actually used."

---

## BUG 5 — completion-contract facts are not verified by the emitter

### What happened

Story 1.7's clarification reported `HEAD 8f2e0f5`. That object **does not exist** in the repository;
actual HEAD was `ca377d1`. Everything else in the report was accurate, the tree was clean and pushed,
so nothing was at risk — but only because the orchestrator verifies independently.

### Root cause (command text)

L76 requires `unpushed_work: none` to be verified with `git log --branches --not --remotes`. It
requires nothing of the **shas the runner quotes**. The kit already has the right instinct at L311,
L329 and L377 — "verify against `git log --branches --not --remotes` … rather than trusting the
self-report" — but applies it only to *subagent protocol claims*, never to the runner's own reported
state, which is the one thing the orchestrator cannot see for itself.

### Proposed patch

1. Extend L76's completion contract: "Every sha you quote — in this contract or in a
   `## Clarification Needed` — must be read with `git rev-parse --short HEAD` (or
   `git rev-parse --short <ref>`) at the moment you write it, never recalled from earlier in your
   context."
2. Add to orchestrator notification handling: verify quoted shas resolve before acting on them; log
   `runner_report_error` with `reported=` / `actual=` on a mismatch. (This session logged one under
   that name; the stage is not currently in the kit's vocabulary.)

---

## BUG 6 — "unattended" does not describe the measured loop (documentation)

Not a defect. An expectation gap.

The Permission Mode section describes unattended runs and how to launch them. Measured reality on a
greenfield epic: **9 clarifications and 7 user decisions across 8 stories** — roughly one human round
trip per story, sometimes two.

Every halt was correct. This is emphatically **not** an argument for fewer halts. It is an argument
for the documentation to describe what the command actually is: a **supervised** loop whose halts are
load-bearing. A user who launches it expecting to walk away will experience correct behaviour as a
malfunction, and the likely reaction — pre-authorizing everything, or widening footprints blindly —
is worse than the wait.

**Patch:** a short paragraph near the top stating the expected human-interaction rate, noting that it
peaks on greenfield epics where planning artifacts meet reality for the first time, and that BUG 1's
patch is the main lever for reducing it without reducing the halts.

---

## What is working — please do not patch this away

- **Zero false halts** across 9 clarifications. This is the property that makes the gates survivable;
  a gate that cries wolf gets ignored by story three.
- **Halts moved earlier across the epic.** Story 1.6 halted mid-implement (expensive — code already
  written); 1.7 and 1.8 halted at plan, with 1.8 banking its Code Map and invariant-to-mutation table
  so re-dispatch is cheap rather than re-derived.
- **Catches that would otherwise have shipped:** `tickAt()` silently dropping its accumulator origin
  (every keypress stamped tens of thousands of ticks ahead — no flipper would have responded in a
  browser, whole suite green); `NUDGE_DIRECTIONS` untested, so inverted nudge keys would have reached
  users; `NudgeHandler.h`'s unmarked MAME-derived non-commercial licence caught **before the file
  landed**.
- **Rule 18 and the `.toml` propagation held.** Zero containment violations in Stories 1.5–1.8.
- **Write-ahead logging and resume survived** three mid-epic kit upgrades and session restarts, each
  time resuming exactly at the recorded point.
- **Two-layer verification caught errors in both directions** — the orchestrator found the runner's
  phantom sha; the runner found the orchestrator's earlier CSP grep miss and, unprompted, its own
  vacuous ADR verification. The redundancy is earning its cost.

---

## Evidence paths (absolute)

| What | Path |
|---|---|
| Command file under analysis | `C:/git/dragonwar/.claude/commands/epic-cycle.md` |
| Rules file | `C:/git/dragonwar/_bmad/custom/skill-rules.md` |
| Parallel config | `C:/git/dragonwar/_bmad/custom/parallel.yaml` |
| Dependency graph / `paths_hint` | `C:/git/dragonwar/_bmad/custom/epic-dependencies.yaml` |
| Orchestrator cycle log | `C:/git/dragonwar/_bmad-output/implementation-artifacts/cycle-log-parallel.md` |
| Epic 1 runner cycle log | `C:/git/dragonwar/.worktrees/epic-1/_bmad-output/implementation-artifacts/cycle-log-epic-1.md` |
| Ledger (read via `ledger.sh` only) | `C:/git/dragonwar/.worktrees/epic-1/_bmad-output/implementation-artifacts/deferred-work.md` |
| Amended epics (4 `[AMENDED]` markers) | `C:/git/dragonwar/.worktrees/epic-1/_bmad-output/planning-artifacts/epics.md` |
| `never[]` type behind sample 5 | `C:/git/dragonwar/.worktrees/epic-1/src/sim/rules/index.ts:30` |
| AD-5 seam, four pre-`step()` call sites | `C:/git/dragonwar/.worktrees/epic-1/src/sim/physics/machine.ts:140,141,145,147,154` |
| Story 1.8 sweep mandate | `C:/git/dragonwar/.worktrees/epic-1/_bmad-output/implementation-artifacts/story-1-8-sweep-mandate.md` |
| Kit sources (patch targets) | `C:/git/dragonwar/epic-cycle-workflow-creation.md`, `C:/git/dragonwar/parallel-epic-cycle-workflow-creation.md` |

---

## Suggested priority

| Bug | Severity | Patch size | Why |
|---|---|---|---|
| 1 — footprint authority | **High** | Medium | Internal contradiction; largest cost driver; ~4 of 9 clarifications were authorization-only |
| 2 — falsifiability | **High** | Small | Systemic quality gap; the pipeline's own gates emitted unfalsifiable evidence |
| 3 — drain sizing | Medium | Small | Following the kit's instructions leads into an anti-pattern the kit forbids |
| 5 — contract shas | Medium | Trivial | The contract is the orchestrator's only window into the worktree |
| 4 — `N.9` collision | Low | Trivial | Blocks the burn-down charter on any epic with 9+ stories |
| 6 — "unattended" docs | Low | Trivial | Mis-set expectations push users toward unsafe workarounds |
