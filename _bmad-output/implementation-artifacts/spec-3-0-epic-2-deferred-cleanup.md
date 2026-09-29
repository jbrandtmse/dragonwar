---
title: 'Story 3.0: Epic 2 Deferred Cleanup'
type: 'bugfix'
created: '2026-09-29'
status: 'done'
baseline_revision: '56ac0b91233329c07a977c016651c3bb46853431'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      TUNING.matchDelayMs.source (hashed into all five golden headers) still describes the end-of-ball bonus as a "count-up".
    evidence: |-
      src/sim/table/tuning.ts matchDelayMs source string reads "... bonus count-up are never cut ..."; since Story 3.0 (DW-236) the bonus counts down. Story 3.0 was authorised to re-record only the two bonusCountMs/bonusCountTicks .source leaves, so correcting it needs its own header-only golden re-record (the spec-2-15 task 12 hand-edit precedent).
    location: >-
      src/sim/table/tuning.ts (TUNING.matchDelayMs.source)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Eight Epic 2 defects that the author has already decided, and that no later Epic 3 story touches, are still open. (1) The end-of-ball bonus counts UP on the Backglass, but FR-20 and AD-3 say it counts down. The score line also shows the bonus-inclusive score from the first frame. (2) A Slam leaves the count emitting in Attract. (3) A `bonusCountMs` of 0 never renders. (4) Nothing bounds the count's length against the Backglass hold. (5) The hold drops every step after the first one in a frame. (6) The `bonusCountMs` provenance note misquotes the PRD. (7) The tilt spacing and settle marks are machine-wide, so player 2's nudge is judged against player 1's window. (8) A ball saved from a no-switch drain gets a second skill-shot attempt on its automatic re-launch.

**Approach:** Change the bonus display to a count-down that goes from the full bonus to zero. The score line starts at the pre-bonus score and rises by what each step pays, reaching the final score on the last step (the author's DW-237 decision: the bonus visibly pays into it while it counts down). The sim's arithmetic and the tick that pays the bonus into `GameState` do not change. Stop the count in Attract, clamp its pace to at least one tick, cap its pace in `resolveTuning()` so it always fits inside the hold, and fold every step in a frame. Correct the note, which is a golden header-only re-record. Keep the tilt marks per player. Close the skill shot when the launched ball drains before closing any playfield switch.

## Boundaries & Constraints

**Always:**
- The bonus payment is unchanged: the same `bonusTotal()` arithmetic, the same `ball_ended` payload, and the same score write on the drain tick. No golden `expectedHash`, `expectedGameStateHash`, `transitions`, `coilPrologue`, `durationTicks`, `checkpointTicks`, `expectedCheckpointHashes`, `tableHash` or `assetHash` moves. Only `header.gameStart.tuning.bonusCountMs.source` and `header.gameStart.tuning.bonusCountTicks.source` may change in the five goldens. Verify this per field by JSON parse, never by grep.
- The count-down steps come from one arithmetic path in `sim/rules/bonus.ts`. There is one step per nonzero category, in `BONUS_CATEGORIES` order. Each step's `remaining` is `(subtotal - running subtotal through that category) x multiplier`, and the last step's `remaining` is exactly 0. When a ball ends untilted with `total > 0`, the Backglass shows `BONUS <total>` at arming, read from `ball_ended.total`. After that, each step shows its `remaining`.
- The score line shows `pre = players[player].score - ball_ended.total` (the pre-bonus score, read at arming) at arming, and after each step `pre + (ball_ended.total - remaining)`, so it rises by what each step pays and equals the final score exactly when `remaining` reaches 0 (the step with `step === steps`). A tilted or zero-bonus ball end shows no BONUS row, and its score line shows the score unchanged (pre-bonus and final are the same).
- `bonus_count_step` is never emitted while `phase === 'attract'`. The schedule is cleared the first time the ball controller sees Attract. Steps still emit in `game_over`, so the last ball's count runs.
- `bonusCountTicks = Math.max(1, …)`, set at its single derivation site, like its three neighbours.
- `resolveTuning()` throws, naming the tunable, when `bonusCountMs` exceeds `BONUS_COUNT_MAX_MS`. That is a new exported constant in `sim/table/tuning.ts`, outside `TUNING`, so it is neither hashed nor shown as a panel row. Its value is derived, not chosen: it is the largest whole number of ms `v` for which `BONUS_CATEGORIES.length x ticks(v) < BALL_ENDED_HOLD_TICKS`. At 1000 Hz with 3 categories that is 999.
- Tilt marks are per player: `lastBobClosureTick` and `lastWarningTick` become `Map<playerIndex, tick>` and keep their names. A closure in `phase: 'game'` that has a current player updates only that player's marks. A closure in any other state updates one shared idle mark, which gates the spacing check of every player (this preserves the Attract-closure I/O row and its test at `test/rules-tilt.test.ts:950`). Per-player maps are cleared on any step whose `phase !== 'game'`. The DW-240 origins do not change: spacing runs from the last closure of any kind, and settle runs from the last counted warning. Every mark stays reset-safe (a mark greater than `tick` is discarded).
- The skill shot, once `launched`, closes with no award on the first `device_ball_entered` into a `parking` device (the drain), exactly as it closes on a playfield closure. The kind is read from `TABLE.ballDevices`, never a device-name literal.
- Non-ASCII characters in source use escapes (Rule 14). Every new pinning test gets its `mutation:` line (Rule 19), and every negative is paired with a positive.

**Never:**
- Never touch `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `assets/src/**`, `public/assets/**`, `tools/make-placeholder-blend.py` or `ATTRIBUTIONS.md` (contended with Epic 5).
- Never add a `GameState` or `machine` field, and never move the tick on which the bonus enters `GameState`.
- Never make the Backglass extend its hold to wait for the count.
- Never re-derive the running bonus from a later snapshot (AD-9).
- Never add a tilt check to the skill shot, bonus credit or letters. DW-246 belongs to Story 3.0a.
- Never fix DW-283 (duplicate letters, 3.0a) or DW-280 (tick reset at game start, 3.7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Count-down, multiplier | letters 3 (x5000), loops 1 (x10000), multiplier 2, score S+50000 after drain | arming: score line S, `BONUS 50,000`; step 1/2 `remaining` 20000, score line S+30000; step 2/2 `remaining` 0, score line S+50000 | No error expected |
| One category | loops 2 only, x1 | arming `BONUS 20,000`; one step (1/1) `remaining` 0 | No error expected |
| Zero bonus / tilted | total 0, or `tilted: true` | no step, no BONUS row, score line = snapshot score | No error expected |
| Last ball (game over) | untilted bonus on the final ball | the steps emit in `game_over` and the count completes inside the hold | No error expected |
| Slam mid-count | Slam 200 ticks after `ball_ended`, count due at +400/+800 | no `bonus_count_step` at or after the Slam tick | No error expected |
| `bonusCountMs: 0` | a nonzero bonus | steps at t+1, t+2 (…); the Backglass reaches `remaining` 0 and the final score, even in the arming frame | No error expected |
| Several steps in one frame | one `FrameOutput` carrying `ball_ended` plus steps, or two steps | the view reflects the LAST matching step | No error expected |
| Ceiling | `bonusCountMs` = `BONUS_COUNT_MAX_MS` / +1 | resolves / throws naming `bonusCountMs`; the dev panel reverts the +1 edit with that status text | resolve throw |
| Hot-seat nudge | P0 warns at T; a real drain at T+100 rotates to P1; P1's first closure at T+200 (inside P0's spacing, run A) or at T+600 (past spacing, inside P0's settle, run B) | each run warns P1 (P1 has no marks of its own yet); the controls, with the same closures and no drain, are ignored for P0 | No error expected |
| Attract closure | closure in Attract at 1, then game-phase closure at 100 | still ineligible (idle mark) | No error expected |
| Saved no-switch drain | plunge, no playfield switch, trough entry inside the save window, autolaunch, lit Top lane closed | `ball_saved`; no award, no letter | No error expected |
| Manual plunge | the same ball with no drain: plunge, then the lit Top lane | the award and a letter are paid | No error expected |

</intent-contract>

## Code Map

- `src/sim/rules/bonus.ts:81-113` -- `BonusCountUpStep`/`bonusCountUpSteps()` (a rising `running`, plus an extra multiplier step) → replace with `BonusCountDownStep`/`bonusCountDownSteps()`. `bonusTotal()` (:73) is unchanged.
- `src/sim/rules/ball-controller.ts` -- `:425` unclamped `bonusCountTicks` (neighbours clamped at `:456-458`); `:575-579` `pendingBonusCountSteps`; `:643-667` `armBonusCountSchedule()`; `:774-785` the per-tick drain (add the Attract gate here: the Slam has already flipped `phase` because `tiltController.step()` runs first, `sim/rules/index.ts`); `:1110-1146` the drain-tick score write and `ball_ended` (DO NOT MOVE); `:1195-1209` the arm call; `:1310` the DW-235 same-tick filter (keep).
- `src/sim/contracts/events.ts:208-228` -- `BonusCountStepEvent`: rename `running` → `remaining` and rewrite the doc comment for the count-down. This is outside the footprint but uncontended.
- `src/sim/table/tuning.ts:678-689` -- the `bonusCountMs` doc comment and `source` (DW-289). Also add `BONUS_COUNT_MAX_MS` and its check inside `resolveTuning()` (`:868`), in the DW-35 throw style of `msToTicks()` (`:786-809`).
- `src/sim/rules/tilt.ts:84-96,153-206` -- the marks, reset-safety and bob loop; `:10-32` the header prose to update.
- `src/sim/rules/modes/skill-shot.ts:164-213` -- `step()`: add the parking-entry close beside the playfield-closure resolution; `:127` doc.
- `src/presentation/backglass/frame.ts` -- `:187-195` `BackglassView.heldBallEnded` (widen it to carry pre-bonus score, final score, `bonusRemaining`, complete); `:363-387` the arming branch (derive the pre-bonus score, show total, fold same-frame steps after the `ball_ended`); `:412-445` the hold branch (`:431` `find` → fold all, the last wins); `:827-836` `buildBallEndedRows()`; `:210-219` the hold doc. Outside the footprint but uncontended.
- `src/host/dev/tuning-panel.ts:148-180` -- `hotApply()` already reverts on a `resolveTuning()` throw. There is no change here; it is the dev-panel surface for the ceiling.
- `test/replays/*.golden.json` (5) -- there is no re-record script, so this is a hand edit at the two `.source` JSON paths (precedent: `spec-2-15` task 12). Parsed: no golden presses `start`.
- Tests to rewrite or extend: `test/rules-bonus.test.ts:308` (count pacing) and `:362` (DW-235, keep green); `test/backglass-frame.test.ts:1113-1150` (the coupling describe: replace the `MAX_OWED_TICKS` premise, which is obsolete once all steps are folded, and the 4-step inequality with the ceiling test); `test/contracts.test.ts:218,265,321`; `test/rules-tilt.test.ts:933-1025` (Attract/restart rows must stay green); `:794` (the save re-serve script template); `test/tuning-panel.test.ts:467` (the unresolvable-edit pattern); `test/story-2-0-rename-provenance.test.ts:170` (the pattern for reading planning artifacts); `test/backglass-integration.test.ts`; `test/rules-match.test.ts` (the `running` references).

## Tasks & Acceptance

**Execution:**
- `src/sim/rules/bonus.ts` -- add `bonusCountDownSteps()` as described in Always, and delete the count-up helper -- DW-236.
- `src/sim/contracts/events.ts` -- rename `running` → `remaining` and fix the doc -- DW-236 (a semantic change must not hide behind an old field name).
- `src/sim/rules/ball-controller.ts` -- arm from `bonusCountDownSteps()`; `Math.max(1, …)` on `bonusCountTicks` (DW-286); in the per-tick drain, clear the schedule and emit nothing when `nextState.phase === 'attract'` (DW-285); update the comments that say "count-up".
- `src/sim/table/tuning.ts` -- correct the `source` to quote PRD FR-20 verbatim (`"the Backglass counts the bonus down"`) and state 3 steps x 400 ms = 1200 ms < 3000 ms plus the ceiling; the value stays 400 and the confidence `unverified` (DW-289). Add `BONUS_COUNT_MAX_MS` and the `resolveTuning()` rejection (DW-287).
- `test/replays/*.golden.json` -- write the identical new string into both `.source` leaves, in all five -- the header-only re-record.
- `src/presentation/backglass/frame.ts` -- the count-down view and rows, the pre-bonus freeze, and all steps folded in both the arming and hold branches -- DW-236/237/287.
- `src/sim/rules/tilt.ts` -- per-player marks plus the idle mark, cleared outside a game -- DW-284.
- `src/sim/rules/modes/skill-shot.ts` -- the parking-entry close -- DW-232.
- `test/rules-bonus.test.ts` -- rewrite Story 2.10's count-up expectations as count-down; add AC1 (sim steps), AC2, AC3 and AC4 (rules side).
- `test/backglass-frame.test.ts` -- AC1 (view and rows), AC4 (arming-frame fold), AC5 (ceiling vs hold; replaces `:1113-1150`'s two coupling tests, keeping the matchDelay test) and AC6.
- `test/tuning.test.ts` -- AC5 (`BONUS_COUNT_MAX_MS` resolves, +1 throws) and AC7 (provenance vs `prd.md` FR-20).
- `test/tuning-panel.test.ts` -- AC5 (the panel reverts a `BONUS_COUNT_MAX_MS + 1` edit).
- `test/rules-tilt.test.ts` -- AC8 (switch-script, two runs plus controls).
- `test/rules-modes.test.ts` -- AC9 (saved drain vs manual plunge).
- `test/backglass-integration.test.ts` -- AC10.
- `test/contracts.test.ts`, `test/rules-match.test.ts` -- update them for the `remaining` rename.

**Acceptance Criteria:**
- AC1 (DW-236, DW-237): Given an untilted ball end with total > 0, when the Backglass folds its frames, then the BONUS row shows `total` at arming and each step's `remaining`, down to 0, and the score line shows the pre-bonus score at arming, `pre + (total - remaining)` after each step (strictly rising across a multi-step count), and the final score exactly when `remaining` is 0.
- AC2: Given the same drain, when the rules run, then `ball_ended.total`, the final score and the drain-tick score write are unchanged (`statesByTick.get(drainTick)` already holds the bonus-inclusive score), and all five goldens pass with only the two `.source` leaves changed.
- AC3 (DW-285): Given a count in progress, when a Slam lands, then no `bonus_count_step` has `tick >=` the Slam tick. The paired run without the Slam emits every step.
- AC4 (DW-286): Given `bonusCountMs: 0`, when a ball ends with a bonus, then every step is emitted (one tick apart, the last `remaining` 0) and the Backglass reaches BONUS 0 and the final score.
- AC5 (DW-287): Given `bonusCountMs = BONUS_COUNT_MAX_MS`, when it is resolved, then `BONUS_CATEGORIES.length x bonusCountTicks < BALL_ENDED_HOLD_TICKS` (compared symbol to symbol), and `BONUS_COUNT_MAX_MS + 1` throws in `resolveTuning()` and is reverted by the dev panel with a status message.
- AC6 (DW-287): Given one `FrameOutput` carrying two or more `bonus_count_step`s (in the hold, and in the arming frame after `ball_ended`), when it is folded, then the view reflects the last step. The single-step frame is the control.
- AC7 (DW-289): Given `TUNING.bonusCountMs.source`, when every double-quoted phrase in it is checked against the FR-20 section of `prd.md`, then each one appears verbatim, at least one quote exists, and "count up"/"count-up" appears nowhere.
- AC8 (DW-284): Given a two-player Hot-seat `runRulesScript` run (adjustments `tiltWarnings: 3`) where P0 warns at T and a real drain rotates to P1, when P1's first bob closure lands inside P0's spacing window (run A) or inside P0's settle window (run B), then each run emits `tilt_warning { player: 1 }`. In the same scripts with no drain (P0 still up), the closure is ignored. The Attract-mark and restarted-timeline tests stay green.
- AC9 (DW-232): Given a saved no-switch drain, when the automatic re-launch closes the lit Top lane, then no `skillShotAward` and no letter is paid. The same ball's manual plunge, with no drain, into the lit lane is paid.
- AC10 (Integration, Rule 1): Given a real `createRules()` driven by `runRulesScript` (bank targets, then a trough drain), when every tick's events and state are folded through `advanceBackglass()`/`renderFrame()` as `boot.ts` does, then the ball_ended rows count BONUS down to 0 and the score line rises from the pre-bonus score by each step's payment, reaching the final score exactly on the last step.
- AC11: Given the story, when the gates run, then `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all pass.

## Spec Change Log

- 2026-09-29, lead spec gate: the score line RISES by each step's payment (author's DW-237 decision), replacing the planner's jump-on-completion reading, which followed the lead's own drifted epics.md wording (now amended). Touched: Intent Approach, Always (score line), I/O row 1, AC1, AC10, Design Notes, Verification (AC1 mutation, smoke). AD-6 amended for DW-232 (Rule 20).

## Review Triage Log

### 2026-09-29 — Review pass
- verdicts: 33 findings — high 0, medium 2, low 26, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind-hunter) BONUS_COUNT_MAX_MS = 999 leaves only 3 ticks between the last step and the hold release, so a batched frame can land past `holdUntilTick` and BONUS 0 never draws. — Real only near the ceiling. The ceiling is a dev-panel-only bound; the shipped 400 ms leaves 1800 ms of margin. The formula and the value 999 are prescribed verbatim by the intent contract's Always clause, so changing them is a spec change (by-design). Recorded as a residual risk.
  - `[false]` `[reject]` (blind-hunter) Hot-seat spacing ignores the other player's bob swing (run A warns player 2 inside player 1's spacing window). — This is the specified behaviour: the Always clause makes the marks per player and the Hot-seat I/O row requires run A to warn player 2. The code comments ("the player's own, or the idle mark") match it.
  - `[medium]` `[patch]` (blind-hunter) No test pins the clearing of the per-player tilt maps outside `phase: 'game'`. — Patched: added a one-controller pair to `test/rules-tilt.test.ts` (warning in game 1, Attract step, new game's closure at 300 warns; control with no Attract step is ignored). Mutation recorded under AC8.
  - `[low]` `[reject]` (blind-hunter) `HeldBallEnded.complete` is written but never read by production code. — The Code Map explicitly asks for `complete` on the widened view. It is presentation state only, costs nothing, and gives Epic 4's count cues a flag. By-design.
  - `[low]` `[patch]` (blind-hunter) The `bonusRemaining === null` guard in `foldBonusCountSteps()` is untested. — Patched: added a no-count hold test (zero and tilted, in the hold and in the arming frame, with a counting-hold control) to the AC 6 describe. Mutation recorded under AC6.
  - `[low]` `[patch]` (blind-hunter) The arming-branch fold has no recorded mutation, and many new tests lack `mutation:` lines. — Patched: the fold removal and the dropped `slice` were applied and observed red, and recorded under AC4 and AC6. The per-test list is rejected: Rule 19 asks for one demonstrated mutation per AC, not per test.
  - `[low]` `[patch]` (blind-hunter) The AC10 test claims to fold "exactly as boot.ts" folds, but the real loop batches ticks. — Patched: the comment now says it uses the same calls one tick per frame, and points to the AC 4 and AC 6 fold tests for batching. The test itself matches AC10 as worded (a `runRulesScript`-driven `createRules()`).
  - `[low]` `[patch]` (blind-hunter) The skill-shot docs say "the drain", but any parking device, including the Lock, closes it. — Patched: the header, the `step` doc and the inline comment now say "the trough drain, or the Lock". The behaviour follows the spec ("a `parking` device") and FR-18. The ball-search recover claim was checked: `recover()` queues the same trough-slot switch edge as a real entry.
  - `[low]` `[patch]` (blind-hunter) Stale "count-up" wording remains. — Patched: the three `test/rules-tilt.test.ts` assertion messages. `ball-controller.ts:572` is kept: it quotes Story 2.10's Design Notes heading, and the line above it records the change. `TUNING.matchDelayMs.source` is hashed provenance that the spec forbids re-recording here, so that part went to `deferred`.
  - `[false]` `[reject]` (blind-hunter) The spec's status contradicts itself, and it records no verification results. — Finalize writes `## Auto Run Result` with status and results. The interim `ready-for-dev` text was the pre-run placeholder.
  - `[low]` `[reject]` (blind-hunter) The "ceiling lives outside TUNING" test only catches that exact key name. — The property is structural: `BONUS_COUNT_MAX_MS` is an exported `const` beside `TUNING`, not inside its literal, and AC5's pinning tests are the ceiling-vs-hold and throw tests. Hardening the test would add complexity for a regression nobody is likely to write.
  - `[low]` `[reject]` (blind-hunter) The "LARGEST such ms" test copies the ms-to-ticks formula, and the source prose hard-codes 999. — `msToTicks()` is private and `resolveTuning()` throws above the ceiling, so the test has to compute it. The prose is hashed provenance that cannot reference a symbol. Drift needs a rounding change.
  - `[low]` `[reject]` (edge-case-hunter) The ceiling does not account for multi-tick frames; the last step can be dropped at the hold edge. — Same root cause as the first BONUS_COUNT_MAX_MS finding. Rejected on the same grounds.
  - `[low]` `[reject]` (edge-case-hunter) Two `ball_ended` events for the same player in one FrameOutput would mismatch total and steps. — Theoretical: it needs a stalled frame (up to 200 ticks) holding two drains, and a second ball cannot be served, launched and drained that fast. The first-`ball_ended` `find` is pre-existing.
  - `[low]` `[reject]` (edge-case-hunter) A missing `players[player]` or a later batched snapshot score makes the pre-bonus score wrong. — Arming is skipped in Attract, and players persist through `game_over`. A score change inside the arming frame needs the next ball served and scoring within one frame of the drain. The intent specifies "read at arming".
  - `[false]` `[reject]` (edge-case-hunter) One nudge's swing warns player 2 after a drain, bypassing spacing. — Specified behaviour (see the Hot-seat finding above).
  - `[low]` `[reject]` (edge-case-hunter) A category with count > 0 but a tuned value of 0 emits a step with an unchanged remaining. — The spec defines steps per nonzero category count, and a 0-valued scoring tunable is dev-only. By-design.
  - `[low]` `[reject]` (edge-case-hunter) Claim: the ceiling guarantees the count always fits the hold. — Same root cause as the first BONUS_COUNT_MAX_MS finding.
  - `[low]` `[patch]` (edge-case-hunter) Claim: AC10 folds "exactly as boot.ts". — Same root cause as the AC10 finding. Comment corrected.
  - `[medium]` `[patch]` (verification-gap) The per-player-map clear outside a game is not pinned. — Same root cause as the matching blind-hunter finding. Patched with the new tilt test and its mutation line.
  - `[low]` `[patch]` (verification-gap) The no-count guard in `foldBonusCountSteps()` is never exercised. — Same root cause as the matching blind-hunter finding. Patched.
  - `[low]` `[patch]` (verification-gap) The arming-frame half of AC6 and the Backglass half of AC4 have no `mutation:` line. — Same root cause as the matching blind-hunter finding. Mutations applied, observed red, recorded.
  - `[low]` `[patch]` (verification-gap) The "strictly rising" loop compares the test's own computed values. — Patched: it now pushes the parsed RENDERED score line. The jump-shape mutation was re-run and observed red.
  - `[low]` `[patch]` (verification-gap) `expect(armed.score).not.toBe(commas(finalScore))` can only fail if an earlier assertion fails. — Patched: the redundant assertion was deleted.
  - `[low]` `[reject]` (verification-gap) The "outside TUNING" test checks only the literal key. — Same root cause as the blind-hunter finding. Rejected on the same grounds.
  - `[false]` `[reject]` (verification-gap) The AC2 golden leaf diff is a scratchpad helper, not a test. — The spec's `## Verification` prescribes exactly that helper. It was run at implement and again after the patches: only the two `.source` leaves change in each golden, still LF. `test/replay-goldens.test.ts` also guards the hashes.
  - `[low]` `[reject]` (verification-gap, other) `complete` is never read. — Same root cause as the blind-hunter finding. By-design.
  - `[low]` `[reject]` (intent-alignment) Hold fit is checked as tick arithmetic, not display. — Same root cause as the first BONUS_COUNT_MAX_MS finding. The auditor notes that the diff follows the contract's own formula.
  - `[low]` `[patch]` (intent-alignment) The integration surface is not the real loop. — Same root cause as the AC10 finding. Comment corrected; the test matches AC10's wording.
  - `[low]` `[reject]` (intent-alignment) The pre-bonus score comes from the frame-end snapshot. — Same root cause as the edge-case-hunter finding. Matches "read at arming".
  - `[low]` `[patch]` (intent-alignment) The skill-shot scope is wider than "the drain" (it includes the Lock). — Same root cause as the blind-hunter finding. Docs corrected; the behaviour follows the spec's "parking device".
  - `[low]` `[patch]` (intent-alignment) Several new pinning tests have no mutation line. — Same root cause as the arming-fold finding. Per-AC lines added.
  - `[false]` `[reject]` (intent-alignment) The DW-235 tests were re-staged off the Slam route. — Not a defect: the Slam route can no longer carry a pending count (DW-285, pinned by AC3), and the re-staged tests still exercise the DW-235 same-tick filter through the one route that can.

## Design Notes

**Measured at this tree (lead guidance: measure before you prescribe).**
- The hold: `BALL_ENDED_HOLD_TICKS = msToTicks(3000)` = 3000 ticks at `TICK_HZ` 1000 (`frame.ts:219`). The frame cap is `MAX_OWED_TICKS` = 200 (`time.ts:101`).
- The pace: `bonusCountMs` 400 → `bonusCountTicks` 400. It is unclamped (`ball-controller.ts:425`); at 0 ms every step is due on the arming tick itself, after the drain has already run, so nothing is ever emitted.
- The steps today: at most `BONUS_CATEGORIES.length + 1` = 4, so the longest production count is 1600 ticks. After this story: at most 3 steps, 1200 ticks.
- The dev-panel range of `bonusCountMs`: there is no upper bound. The panel accepts anything `resolveTuning()` accepts: 0, or at least 0.5 ms; a negative value or a positive value that rounds to 0 ticks throws (DW-35). So "the longest count the range admits" is unbounded today. `BONUS_COUNT_MAX_MS` makes it 999 ms → 2997 < 3000.
- When the bonus enters `GameState`: on the drain tick, in the teardown map (`score + total`), on the same tick as `ball_ended`. The arming branch (`frame.ts:363-387`) reads that already-bonus-inclusive score, which is the DW-237 defect. The frame fold reads only `find(isBonusCountStepEvent)` (`:431`), and the arming branch ignores same-frame steps.
- The goldens (JSON-parsed): all five have `start: false` in every transition, so no rules game ever runs in them. `bonusCountMs.source` (and its `Ticks` sibling) is present in all five `gameStart.tuning` blocks, and `StaleReplayHeaderError` compares the whole tuning object. The header re-record is therefore required and pre-authorised.

**Governing ADs:**
- **AD-3**: "bonus count-down" as a display-paced sequence; timers authored in ms in `tuning.ts`; presentation never reports completion.
- **AD-2**: the tilt-window origins amendment, DW-240.
- **AD-5**: tilt.
- **AD-6**: `ball_launched` arms the skill shot, which closes on the next closure.
- **AD-7**: `tiltWarnings` is player-scoped, and the closure-state class keeps the `lastBobClosureTick`/`lastWarningTick`/`pendingBonusCountSteps` names so the inventory stays true.
- **AD-8**: the minimal pre-3.1 stack, where modes remove themselves.
- **AD-9**: payload-complete events, no later-snapshot joins, English only in the backglass.
- **AD-15**: provenance is hashed, so a header re-record is needed.
- **AD-1/AD-16**: `sim` never imports `presentation`, which is why the ceiling is a sim constant pinned against the presentation hold in a test.
- **AD-18**: the save re-serve.
- **AD-19**: modes consume device events.

**Decisions and why.**
- **The count-down shape.** One step per nonzero category, ending at 0, keeps a single arithmetic path and needs no separate multiplier step. The first displayed value (the total) comes from the `ball_ended` payload.
- **The score line rises with each step.** [Lead, spec gate 2026-09-29] The planner followed the epics.md wording as first inserted ("jumps on completion"), and flagged that the author's DW-237 decision reads "visibly pays into it while it counts down". The lead's insertion text had drifted from that decision; the AC was amended to restore it, and this spec follows: `pre + (total - remaining)` after each step.
- **The pre-bonus score is `score - total`,** as DW-237's note proposes. It needs no contract field.
- **The skill shot closes on the drain.** PRD FR-18 says "the Skill shot is only available until the first other switch closes", and the trough switch is such a switch. AD-6 still arms on `ball_launched`, but by the time the automatic re-launch happens there is nothing left to arm. A ball-search recover of a launched, stuck ball closes the skill shot the same way. The Top lane stays lit exactly as it does after a miss.
- **Tilt marks outside a game.** AD-7 says "the bob … its own history is physical and updates whatever the phase", and that history is pinned at `rules-tilt.test.ts:950`. The shared idle mark keeps both true.

**For the lead (not blocking).** Rule 20: the DW-232 decision (2026-09-28) was not written into AD-6, whereas DW-240 was written into AD-2. Consider adding one sentence: "a save's own automatic re-launch finds no skill shot to arm: the drain closed it (FR-18)". [Lead, spec gate 2026-09-29: written into AD-6 as an amendment.]

**Footprint extensions to report:** `src/sim/contracts/events.ts`, `src/presentation/backglass/frame.ts`, and `test/*.test.ts` outside `test/replays`. None of them is contended.

**Integration (Rules 1/2).** No new module is introduced; the story changes the step-event contract.
- Consumes: Story 2.10's bonus schedule, Story 2.6's Backglass, Story 2.9's save re-serve, Story 2.11's tilt controller, Story 2.7's skill shot.
- Consumed-by:
  - 3.0a: scoring stops under Tilt in the same skill-shot and bonus files.
  - 3.1: the mode stack must keep the drain close through the lifecycle events.
  - 3.9: Strikes are paid through this count-down.
  - Epic 4: count cues on `bonus_count_step`.

**Ledger inbox (Rule 17).**
- DW-232 is addressed by AC9.
- DW-236 is addressed by AC1 and AC2.
- DW-237 is addressed by AC1.
- DW-284 is addressed by AC8.
- DW-285 is addressed by AC3.
- DW-286 is addressed by AC4.
- DW-287 is addressed by AC5 and AC6.
- DW-289 is addressed by AC7.

None is declined.

**x0 triage (32 entries owned by Epic 3 at `ledger_load`).**

| Owner | Entries |
|---|---|
| 3-0 (this story) | DW-232, 236, 237, 284, 285, 286, 287, 289 |
| 3-0a | DW-246, 278, 283 |
| 3-1 | DW-206, 209, 290, 291 |
| 3-2 | DW-171, 174, 212, 221, 281, 282 |
| 3-6 | DW-173, 288 |
| 3-7 | DW-141, 175, 185, 219, 226, 228, 268, 273, 280 |
| 3-11 | none (its 10 were re-owned above) |

## Verification

**Commands** (in a shell with `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe`; baseline 129 files / 2089 tests, all green):
- `pnpm test` -- expected: all green, including `test/replay-goldens.test.ts`.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- Golden diff: a scratchpad Node helper parses each golden before and after and diffs the parsed objects leaf by leaf. Expected: exactly the two `.source` leaves change in each file.

**Mutations (Rule 19).** Each one is applied, observed red, reverted, and followed by a check that `git status --short` and `git diff --stat` are unchanged.
- AC1: arming reads the post-bonus snapshot score → the backglass-frame pre-bonus test goes red. Separately, the score line is held at `pre` until the last step (the jump shape) → the rising-score-line test goes red. Separately, the steps return a rising subtotal → the rules-bonus count-down test goes red.
  - mutation (applied 2026-09-29, reverted, tree byte-identical): `ballEndedScoreLine()` returns `finalScore` (the snapshot score) on every frame → `test/backglass-frame.test.ts`:"arming shows BONUS <total> and the PRE-bonus score; each step shows its remaining and a strictly rising score line; ..." went red.
  - mutation: `ballEndedScoreLine()` returns `complete ? finalScore : preBonusScore` (the jump shape) → the same `test/backglass-frame.test.ts` test went red (step 1 shows `pre`, not `pre + 20,000`).
  - mutation (re-run at review 2026-09-29, after the test was changed to push the RENDERED score into its rising check): the same jump shape → the AC 1 test went red again ("step 1: the score line is pre + (total - remaining)"), with the AC 6 fold tests.
  - mutation: `bonusCountDownSteps()` returns `remaining: running` (a rising subtotal) → `test/rules-bonus.test.ts`:"letters 2, loops 1, x3: two bonus_count_step ... remaining 30000 then 0" (both players), "the I/O row \"Count-down, multiplier\"" and "the I/O row \"One category\"" went red.
- AC2: the score is paid on the last step's tick instead of the drain tick → the rules-bonus drain-tick test goes red.
  - mutation: the drain-tick `score + total` write removed and the total paid when the `step === steps` event is emitted → `test/rules-bonus.test.ts`:"Story 3.0 AC 2 ... the bonus-inclusive score is ALREADY in statesByTick.get(drainTick) ..." (both players) went red.
- AC3: the Attract gate is deleted → the Slam test goes red.
  - mutation: the `phase === 'attract'` clear in `ball-controller.ts` disabled → `test/rules-bonus.test.ts`:"with the Slam at E+200: no bonus_count_step at or after the Slam tick" went red; its no-Slam control and the game_over positive stayed green.
- AC4: `Math.max(1, …)` is removed → the zero-ms test goes red.
  - mutation: `bonusCountTicks` unclamped → `test/rules-bonus.test.ts`:"at 0 ms: steps at E+1 and E+2, the last remaining 0" went red; the 1 ms control stayed green.
  - mutation (review 2026-09-29, Backglass half): the arming-branch fold removed (`heldBallEnded = armedHeld`) → `test/backglass-frame.test.ts`:"one FrameOutput carrying the drain tick and the two one-tick-apart steps ... arms straight to BONUS 0 and the final score" went red.
- AC5: `BONUS_COUNT_MAX_MS` is set to 1000 → the ceiling-vs-hold test goes red. Separately, the `resolveTuning` check is removed → the +1-rejected test and the panel test go red.
  - mutation: `BONUS_COUNT_MAX_MS = 1000` → `test/backglass-frame.test.ts`:"at bonusCountMs = BONUS_COUNT_MAX_MS, BONUS_CATEGORIES.length steps end strictly inside BALL_ENDED_HOLD_TICKS" went red.
  - mutation: the `resolveTuning()` ceiling check disabled → `test/tuning.test.ts`:"bonusCountMs = BONUS_COUNT_MAX_MS resolves; BONUS_COUNT_MAX_MS + 1 throws, naming bonusCountMs" went red, and (separate run) `test/tuning-panel.test.ts`:"Story 3.0 AC 5: a bonusCountMs edit to BONUS_COUNT_MAX_MS + 1 is reverted ..." went red.
- AC6: the fold is reverted to `find` → the multi-step frame test goes red.
  - mutation: the hold branch folds only `input.events.find(isBonusCountStepEvent)` → `test/backglass-frame.test.ts`:"in the hold: a frame carrying BOTH steps shows BONUS 0 and the final score; ..." went red; the arming-frame case stayed green (it has its own fold).
  - mutation (review 2026-09-29, arming frame): the arming-branch fold removed (`heldBallEnded = armedHeld`) → `test/backglass-frame.test.ts`:"in the arming frame: steps AFTER the ball_ended are folded in ..." went red (and the AC 4 Backglass test).
  - mutation (review 2026-09-29): the arming fold given every event, not only those after the `ball_ended` (the `slice` dropped) → the same arming-frame test went red on its `staleBefore` case.
  - mutation (review 2026-09-29): `foldBonusCountSteps()`'s `bonusRemaining === null` guard disabled → `test/backglass-frame.test.ts`:"a hold with no count (zero bonus or tilted) ignores a same-player step ..." went red; its counting-hold control stayed green.
- AC7: the old "categories count up, then the multiplier is applied" is restored → the provenance test goes red.
  - mutation: the old quote restored in `TUNING.bonusCountMs.source` → `test/tuning.test.ts`:"every double-quoted phrase appears verbatim in FR-20, ..." went red; the audit's own control stayed green.
- AC8: the marks are made machine-wide again → the Hot-seat test goes red. Separately, the idle mark is dropped → `rules-tilt.test.ts:950` goes red.
  - mutation: every player's marks keyed to 0 (machine-wide) → `test/rules-tilt.test.ts`:"run A: inside player 1's SPACING window ..." and "run B: ... SETTLE window ..." went red; both no-drain controls stayed green.
  - mutation: `spacedFromIdle` forced true (idle mark dropped) → `test/rules-tilt.test.ts`:"the Attract-time closure's spacing mark is genuinely recorded -- ..." went red.
  - mutation (review 2026-09-29): the `state.phase !== 'game'` clear of the per-player maps disabled → `test/rules-tilt.test.ts`:"a new game's player 1 is never judged against the previous game's marks; ..." went red; its same-game control is the other half of that test.
- AC9: the parking-entry close is deleted → the saved-drain test goes red.
  - mutation: the `device_ball_entered`/`parking` branch in `skill-shot.ts` disabled → `test/rules-modes.test.ts`:"saved no-switch drain: plunge, trough entry inside the save window, autolaunch, then the lit Top lane -- ball_saved, and no award, no letter" went red (plus the two moved `s_trough_2`/`s_lock_1` cases); the manual-plunge control stayed green.
- AC10: `renderFrame` shows `total` instead of `remaining` → the integration test goes red.
  - mutation: the BONUS row renders `finalScore - preBonusScore` (the total) → `test/backglass-integration.test.ts`:"the ball_ended screen reads (pre, BONUS total) -> (pre + 15,000, BONUS 10,000) -> (final, BONUS 0), ..." went red.

**Browser smoke (the lead runs it; the DMD is observed through an in-page rAF sampler cropping `#render-canvas`, because each screen lasts under 2 s):** Start a game, hit at least one DRAGON target, and drain. Expected:
- The end-of-ball screen shows PLAYER 1, the pre-bonus score, and `BONUS <total>`.
- BONUS steps down to 0 within about 1.2 s.
- The score line rises as BONUS steps down, and equals the final score exactly when BONUS reaches 0.
- The screen holds until about 3 s.

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** The eight Epic 2 defects are closed.
- The end-of-ball bonus now counts DOWN: one step per nonzero category, and the last `remaining` is exactly 0.
- The Backglass shows `BONUS <total>` at arming, with the pre-bonus score (`score - total`). The score line then rises by what each step pays and lands on the final score exactly at BONUS 0.
- The sim's payment is untouched: the same `bonusTotal()`, the same `ball_ended`, and the same drain-tick write.
- Attract clears the count (DW-285). `bonusCountTicks` is clamped to at least 1 (DW-286). `resolveTuning()` rejects `bonusCountMs > BONUS_COUNT_MAX_MS` (999) (DW-287). Every step in a frame is folded, in the hold and in the arming frame (DW-287).
- The `bonusCountMs` provenance now quotes FR-20 verbatim, re-recorded header-only in the goldens (DW-289).
- The tilt marks are per player, with a shared idle mark (DW-284).
- A launched skill shot closes with no award on any parking-device entry (DW-232).

baseline_revision: 56ac0b91233329c07a977c016651c3bb46853431

**Files changed.**
- `src/sim/rules/bonus.ts`: `bonusCountDownSteps()` replaces the count-up helper, sharing `bonusSubtotal()` with `bonusTotal()`.
- `src/sim/contracts/events.ts`: `BonusCountStepEvent.running` is renamed to `remaining`, with a count-down doc.
- `src/sim/rules/ball-controller.ts`: arms from the count-down, clamps `bonusCountTicks` with `Math.max(1, ...)`, and clears the schedule in Attract.
- `src/sim/table/tuning.ts`: corrected `bonusCountMs.source`; `BONUS_COUNT_MAX_MS` and its `resolveTuning()` rejection.
- `src/presentation/backglass/frame.ts`: `HeldBallEnded` (pre-bonus score, final score, remaining, complete), `foldBonusCountSteps()` (last step wins), and `ballEndedScoreLine()`.
- `src/sim/rules/tilt.ts`: per-player `Map` marks plus the idle mark, cleared outside a game, reset-safe.
- `src/sim/rules/modes/skill-shot.ts`: the parking-entry close.
- `test/replays/*.golden.json` (5): only the two `.source` leaves changed, confirmed by a per-leaf JSON diff. Still LF.
- Tests: `test/rules-bonus.test.ts`, `test/backglass-frame.test.ts`, `test/backglass-integration.test.ts`, `test/tuning.test.ts`, `test/tuning-panel.test.ts`, `test/rules-tilt.test.ts`, `test/rules-modes.test.ts`, `test/contracts.test.ts` and `test/rules-match.test.ts` cover AC1–AC10, the `remaining` rename, and the re-staged DW-235 pair.

**Footprint extensions (uncontended):** `src/sim/contracts/events.ts`, `src/presentation/backglass/frame.ts`, `src/sim/rules/modes/skill-shot.ts` (under `src/sim/rules/**`, so in footprint), and `test/*.test.ts`. No contended path was touched.

**Review findings.** 4 layers returned 33 findings: high 0, medium 2, low 26, false 5.
- **Patches applied (2 medium, 13 low rows, 9 root causes):**
  - a cross-game tilt-mark test;
  - a no-count fold-guard test;
  - arming-fold, slice and jump-shape mutations applied and recorded;
  - the "strictly rising" check now reads the rendered score;
  - a redundant assertion deleted;
  - the AC10 comment corrected;
  - the skill-shot docs now say "the trough drain, or the Lock";
  - three stale "count-up" test messages fixed.
- **Deferred (1, low):** `TUNING.matchDelayMs.source` still says "count-up". This is hashed provenance, and fixing it needs its own header-only golden re-record.
- **Rejected (18 rows),** each with its reason in the Review Triage Log:
  - the ceiling's 3-tick display margin (spec-prescribed formula);
  - per-player spacing (as specified);
  - `complete` unread (the Code Map asks for it);
  - the weak outside-TUNING test;
  - the copied ms-to-ticks formula;
  - a two-`ball_ended` frame (theoretical);
  - the pre-bonus score from the frame-end snapshot;
  - a 0-valued category;
  - the spec status placeholder;
  - the golden helper not being a test;
  - the DW-235 re-staging.

**Follow-up review recommended: false.** This first pass patched 1 medium root cause (two rows) and no high, and no specific unverified risk remains.

**Verification.**
- `pnpm test`: 129 files and 2118 tests, all passing (baseline 2089).
- `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all exit 0.
- Golden per-leaf JSON diff, re-run after the patches: only `header.gameStart.tuning.bonusCountMs.source` and `.bonusCountTicks.source` change in each of the five goldens. No hash, trajectory, transition or checkpoint moved, and line endings are LF.
- No non-ASCII bytes in added source or test lines.
- Matrix Test Audit: all 12 I/O rows are covered by tests that ran green.
- Every AC's pinning mutation is recorded under `## Verification`, each applied, observed red and reverted to a byte-identical tree.
- The browser smoke is left to the lead, per the spec.

**Residual risks.**
- (1) At a dev-panel `bonusCountMs` near the 999 ms ceiling, the last step lands 3 ticks before the hold releases. With multi-tick frames, BONUS 0 and the final score may not draw before the screen moves on. The shipped 400 ms leaves 1800 ms of margin. Widening the margin means changing the spec's derivation formula (for example, subtracting `MAX_OWED_TICKS` or a display allowance), which is a lead decision.
- (2) With the per-player marks (as specified), a bob still swinging from player 1's nudge after a quick drain can warn player 2.
- (3) The AC10 integration test folds one tick per frame. The real loop's batching is covered only by the AC4/AC6 unit-level fold tests and the lead's browser smoke.
