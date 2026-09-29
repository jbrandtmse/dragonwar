---
title: 'Story 3.0: Epic 2 Deferred Cleanup'
type: 'bugfix'
created: '2026-09-29'
status: 'done'
baseline_revision: '2ac0ae746c58267a47b62bf46abf551ca0bfe017'
baseline_commit: '2ac0ae746c58267a47b62bf46abf551ca0bfe017'
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
- `resolveTuning()` throws, naming the tunable, when `bonusCountMs` exceeds `BONUS_COUNT_MAX_MS`. That is a new exported constant in `sim/table/tuning.ts`, outside `TUNING`, so it is neither hashed nor shown as a panel row. Its value is derived, not chosen: it is the largest whole number of ms `v` for which `BONUS_CATEGORIES.length x ticks(v) + MAX_OWED_TICKS < BALL_ENDED_HOLD_TICKS`, so the frame that carries the last step is still folded inside the hold. At 1000 Hz with 3 categories that is 933. [Amended at code review 2026-09-29: the first derivation (999) guaranteed emission inside the hold but not display, because one frame batches up to `MAX_OWED_TICKS` ticks.]
- Tilt marks [amended at code review 2026-09-29, rework 1 -- AD-2/DW-240 and FR-14]: the SPACING mark `lastBobClosureTick` is ONE machine-wide physical mark, updated by every bob closure whoever is up and whatever the phase (spacing runs from the last closure of any kind; the bob is one pendulum and its continued swing cannot warn anyone inside the window). It replaces the idle mark and keeps the Attract-closure I/O row and its test at `test/rules-tilt.test.ts:950` true. The SETTLE mark `lastWarningTick` is per player (`Map<playerIndex, tick>`), updated only by that player's counted warning, and cleared on any step whose `phase !== 'game'`. The DW-240 origins do not change: spacing runs from the last closure of any kind, and settle runs from the last counted warning. Every mark stays reset-safe (a mark greater than `tick` is discarded).
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
| Hot-seat nudge | P0 warns at T; a real drain at T+100 rotates to P1; P1's first closure at T+200 (inside the machine-wide spacing window, run A) or at T+600 (past spacing, inside P0's settle, run B) | run A: ignored (physical debounce, whoever is up); run B: warns P1 (P1 has no settle mark of its own yet); the run-B control, with the same closure and no drain, is ignored for P0 (P0's own settle) | No error expected |
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

- [x] [Review] (high, Rule 6 / AD-2 DW-240, FR-14) Per-player tilt SPACING contradicts the ratified origin -- `src/sim/rules/tilt.ts` (the marks, reset-safety, bob loop, header prose) -- collapse the spacing mark to ONE machine-wide physical mark updated by every bob closure whoever is up and whatever the phase (it replaces `idleBobClosureTick`); keep the settle mark per player and cleared outside a game; rewrite the AC8 tests to the amended AC8 (run A ignored, run B warns P1, run-B control ignored for P0), adapt the idle-mark tests (including the review's "stale IDLE mark" reset-safety test) and QA's settle-survives test to the single spacing mark, and write fresh `mutation:` lines for AC8 in `## Verification` (spacing made per player -> run A red; settle made machine-wide -> run B red; spacing reset-safety discard disabled -> its test red).

**Acceptance Criteria:**
- AC1 (DW-236, DW-237): Given an untilted ball end with total > 0, when the Backglass folds its frames, then the BONUS row shows `total` at arming and each step's `remaining`, down to 0, and the score line shows the pre-bonus score at arming, `pre + (total - remaining)` after each step (strictly rising across a multi-step count), and the final score exactly when `remaining` is 0.
- AC2: Given the same drain, when the rules run, then `ball_ended.total`, the final score and the drain-tick score write are unchanged (`statesByTick.get(drainTick)` already holds the bonus-inclusive score), and all five goldens pass with only the two `.source` leaves changed.
- AC3 (DW-285): Given a count in progress, when a Slam lands, then no `bonus_count_step` has `tick >=` the Slam tick. The paired run without the Slam emits every step.
- AC4 (DW-286): Given `bonusCountMs: 0`, when a ball ends with a bonus, then every step is emitted (one tick apart, the last `remaining` 0) and the Backglass reaches BONUS 0 and the final score.
- AC5 (DW-287): Given `bonusCountMs = BONUS_COUNT_MAX_MS`, when it is resolved, then `BONUS_CATEGORIES.length x bonusCountTicks < BALL_ENDED_HOLD_TICKS` (compared symbol to symbol), and `BONUS_COUNT_MAX_MS + 1` throws in `resolveTuning()` and is reverted by the dev panel with a status message.
- AC6 (DW-287): Given one `FrameOutput` carrying two or more `bonus_count_step`s (in the hold, and in the arming frame after `ball_ended`), when it is folded, then the view reflects the last step. The single-step frame is the control.
- AC7 (DW-289): Given `TUNING.bonusCountMs.source`, when every double-quoted phrase in it is checked against the FR-20 section of `prd.md`, then each one appears verbatim, at least one quote exists, and "count up"/"count-up" appears nowhere.
- AC8 (DW-284; amended at code review 2026-09-29, rework 1): Given a two-player Hot-seat `runRulesScript` run (adjustments `tiltWarnings: 3`) where P0 warns at T and a real drain rotates to P1, when P1's first bob closure lands inside the spacing window of the last closure (run A), then it is ignored whoever is up (AD-2, FR-14); when it lands past spacing but inside P0's settle window (run B), then it emits `tilt_warning { player: 1 }`. The run-B control with no drain (P0 still up) is ignored. The Attract-closure and restarted-timeline tests stay green.
- AC9 (DW-232): Given a saved no-switch drain, when the automatic re-launch closes the lit Top lane, then no `skillShotAward` and no letter is paid. The same ball's manual plunge, with no drain, into the lit lane is paid.
- AC10 (Integration, Rule 1): Given a real `createRules()` driven by `runRulesScript` (bank targets, then a trough drain), when every tick's events and state are folded through `advanceBackglass()`/`renderFrame()` as `boot.ts` does, then the ball_ended rows count BONUS down to 0 and the score line rises from the pre-bonus score by each step's payment, reaching the final score exactly on the last step.
- AC11: Given the story, when the gates run, then `pnpm test`, `typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all pass.

### Review Findings

_Code review 2026-09-29 (`bmad-code-review`, full mode, first review of this story). Scope: `56ac0b9..HEAD` (build commit `f3c89cb`) plus QA's uncommitted working tree and its one untracked file, run from `C:/git/dragonwar/.worktrees/epic-3` (verified with `git rev-parse --show-toplevel`). Review tier: `full-opus` (`_bmad/custom/model-overrides.yaml`); all four layers ran with no model override: blind-hunter, edge-case-hunter, verification-gap and acceptance-auditor. None failed. Containment was checked after them: `git status --short` and the unpushed commits were unchanged. Raw rows: 28. After grouping: 1 high, 2 medium and 6 low entries (13 rows), plus 15 rejected rows. Rule 3: the real-runtime tier is `test/backglass-integration.test.ts` (a real `createRules()` folded through `advanceBackglass()`/`renderFrame()`/`rasterise()`), which is the Story 2.11/2.12 precedent; panel pixels are the lead's browser smoke. Rule 1: no new module is introduced, and AC10 is the Integration AC._

- _After the patches: `pnpm test` 129 files / 2126 tests, all passing (2124 + 2 added by review). `pnpm typecheck`, `pnpm lint:boundaries` and `pnpm check:headers` exit 0. No added `src`/`test` line has a non-ASCII byte._
- _Goldens: a per-leaf JSON diff against both `HEAD` and `56ac0b9` shows only `header.gameStart.tuning.{bonusCountMs,bonusCountTicks,matchDelayMs,matchDelayTicks}.source` changed in each of the five. No hash, trajectory, transition or checkpoint leaf moved, and every file is still LF._

**Decision needed (unresolved, blocks `done`):**
- [x] [Review][Decision] (high, Rule 6) [Lead 2026-09-29: resolved by conforming to AD-2 (option 1); AC8 and the epics.md criterion amended; worked in rework 1 -- see the [Review] task above] **Per-player tilt SPACING contradicts AD-2's author-ratified DW-240 origin and PRD FR-14.** AD-2's Rule (amended 2026-09-28, DW-240) says `tiltWarningSpacingMs` "runs from the last tilt-bob closure **of any kind**", held in AD-7's marks. FR-14 says "the bob's continued swing cannot produce two warnings inside the debounce window". AC8 run A requires the opposite: player 0 warns at T, and player 1's closure at T+200, inside the same 500-tick window, warns again. The rules cannot tell a second nudge from the same bob still swinging. The spec also argues against itself: its idle mark exists because "the bob is one pendulum" (AD-7), but in-game closures never feed the idle mark, so that argument holds from Attract into a game and not from player to player. The per-player SETTLE split (run B) conflicts with nothing: settle runs from a counted warning, and warnings are per player (FR-14, FR-17). **Minimal conformant alternative:** make spacing machine-wide physical debounce (every closure, in any state and for any player, updates one mark, which replaces the idle mark), and keep settle per player. Run A would then be ignored and run B would still warn. Fix-risk low (about 10 lines in `tilt.ts`, and run A plus its control flip), but it is spec-bound: it narrows AC8 and the epics.md Story 3.0 AC ("within the spacing or settle window ... judged against that player's own marks"). That makes it a Rule 5 ask-first amendment, which goes to `## Clarification Needed`. If per-player spacing is kept instead, AD-2 (and possibly FR-14) needs a Rule 20 amendment. [src/sim/rules/tilt.ts:190-205; test/rules-tilt.test.ts, AC8 run A] (lead observation (c); blind-hunter + acceptance-auditor)

**Patch (applied):**
- [x] [Review][Patch] (med) **The DW-287 ceiling guaranteed emission, not display.** At 999 ms the last step landed 3 ticks before the hold released. One `FrameOutput` batches up to `MAX_OWED_TICKS` (200) ticks, and the hold branch folds a frame only while its snapshot tick is inside the hold. At the ceiling, the frame carrying the last step could therefore arrive after the release, and BONUS 0 and the final score were never drawn. That misses the story's intent ("the count still renders", DW-237's "visibly pays into it") and the epics AC ("a test fails if the count could outlast the hold"). `BONUS_COUNT_MAX_MS` is now derived as the largest whole ms `v` with `BONUS_CATEGORIES.length x ticks(v) + MAX_OWED_TICKS < BALL_ENDED_HOLD_TICKS`, which is **933** (3 x 933 + 200 = 2999; 934 gives 3002). The AC5 tests pin all three symbols in both directions. The hashed `bonusCountMs.source` changed, so the goldens were re-recorded header-only. **For the lead:** the intent contract's Always clause still states the old formula and "999". AC5 as worded still holds. This is a Rule 5 apply-and-report amendment: record it in `## Spec Change Log`. [src/sim/table/tuning.ts:808; test/backglass-frame.test.ts, AC 5 describe] fix-risk low: one constant and its tests; the shipped 400 ms is unchanged. (lead observation (b); blind-hunter + acceptance-auditor)
- [x] [Review][Patch] (med, Rule 19) **The idle mark's own reset-safety branch was unpinned.** The only restarted-timeline test closes in a game, so it never sets `idleBobClosureTick`. Deleting that discard branch left the suite green, yet it would silence every warning and tilt after a restarted tick count. Added the test "a stale IDLE mark from a higher timeline is discarded too". [test/rules-tilt.test.ts, I/O matrix describe] fix-risk low: test only. (verification-gap)
- [x] [Review][Patch] (low) **DW-292: `TUNING.matchDelayMs.source` still called the bonus a "count-up".** It now says "count-down". The five goldens' `matchDelayMs.source`/`matchDelayTicks.source` leaves were re-recorded by hand, header-only (pre-authorised). The JSON leaf diff above confirms only `.source` leaves moved. Ledger: DW-292 `resolved-by:3-0-epic-2-deferred-cleanup`. [src/sim/table/tuning.ts:760] fix-risk low. (lead observation (a); blind-hunter + acceptance-auditor)
- [x] [Review][Patch] (low, Rule 19) **The "tilted" half of the Zero bonus / tilted row could not fail.** Every tilted fixture carried `total: 0`, so the zero-total conjunct alone decided it. Added a tilted payload with `total: 15_000`, which must still show no BONUS row and an unchanged score line. [test/backglass-frame.test.ts, the I/O row "Zero bonus / tilted"] fix-risk low: test only. (verification-gap)
- [x] [Review][Patch] (low) **The I/O row "Last ball (game over)" had no Backglass half.** It was pinned only on the rules side. Added a hold folded from `game_over` snapshots down to BONUS 0 and the final score. [test/backglass-frame.test.ts, AC 6 describe] fix-risk low: test only. (blind-hunter)
- [x] [Review][Patch] (low) **A test doc named the wrong story for Strikes.** "Story 3.7's War" is now "Story 3.9's Strikes". [test/backglass-integration.test.ts:435] fix-risk low. (blind-hunter)

**Defer:**
- [x] [Review][Defer] (low) **AD-7's closure-state inventory is stale for this story's fields.** `pendingBonusCountSteps` is still called the "bonus count-up schedule", "bonus count-up steps dropped" remains, the tilt marks are listed as scalars, and `idleBobClosureTick` is missing. [spine AD-7] Deferred: this is a spine text fix, out of footprint, and the same root cause as DW-291, owned by 3-1-the-mode-stack. Filed as `occurrence=3-0-epic-2-deferred-cleanup`. Fix-risk low. If lead observation (c) produces a Rule 20 spine edit, it can refresh these lines in the same commit. (blind-hunter + acceptance-auditor)

**Closed at emission:**
- [x] [Review][Dismiss] (low, `by-design`) **The pre-bonus score is `snapshot.score - ball_ended.total`, an event-to-snapshot join (AD-9).** The arming-time snapshot read has existed since Story 2.6, because AD-9's own `ball_ended { player, bonusByCategory, multiplier, total, tilted }` carries no score. The spec's Decisions prescribe `score - total` ("It needs no contract field"). The t+N drift AD-9 prevents needs the ended player's score to change within one frame cap of their drain. Nothing can do that today: the next ball waits on a manual plunge, and in Hot seat the ended player's score is frozen. Reopen via an AD-9 amendment adding `score` to `ball_ended` if a later story makes that score movable within `MAX_OWED_TICKS` of the drain. Fix-risk med (a contract field plus an AD-9 example amendment). (acceptance-auditor)

**Rejected (15 rows):**
- `wontfix-theoretical` (edge-case-hunter, 2 rows): a step due exactly on the game-over sequence's `attractTick` is emitted on the tick the state becomes Attract. That needs `matchDelayMs + reveal + attractMs` tuned shorter than the count. Production `matchDelayMs` 5000 exceeds the 3000-tick hold (pinned by AC 12), and the fix adds a branch. It would become real if the game-over lead-in were ever tuned below `BONUS_CATEGORIES.length x bonusCountTicks`.
- `wontfix-theoretical` (blind-hunter + edge-case-hunter, 2 rows): the ceiling check is in ms and ignores `resolveTuning()`'s `tickHz`, and it rejects 933.1-933.4 ms, which would fit. No caller passes `tickHz`, and `TICK_HZ` 1000 is ratified (AD-3). A whole-ms ceiling is what the spec specifies. It would become real if a non-default `tickHz` reached `resolveTuning()`.
- `false` (edge-case-hunter): a negative pre-bonus score from a missing `players[player]`. `ball_ended.player` always indexes an existing player in `game`/`game_over`, and arming is gated off in Attract.
- `false` (edge-case-hunter): a step whose `total` differs from the held count's. Only one schedule is live at a time, and every drain cancels the previous one.
- `false` (edge-case-hunter): a count cancelled mid-hold leaves the score line short. The sim cancels only in Attract (DW-285), and the hold branch is gated off in Attract, so that screen is no longer shown.
- `false` (edge-case-hunter): `ResolvedTuning.bonusCountTicks` stays 0 at 0 ms. The spec puts the clamp at the single derivation site, as its three neighbours do, and the controller is the only reader.
- `false` (blind-hunter): the story status "disagrees". Frontmatter `status` is build-auto's machine state, and `review` in `sprint-status.yaml` is the pipeline stage.
- reject (blind-hunter + acceptance-auditor, 2 rows): the Auto Run Result says 2118 tests. It records the implement stage's run; QA's section records 2124, and this review records 2126. The fix would be an edit to the spec's run record.
- `low` reject (blind-hunter): the skill-shot header's "a ball-search recover closes it the same way" has no test. The parking-entry branch is pinned by AC9, and recover's park-into-trough edge is Story 2.13's. A dedicated test needs a full ball-search run.
- `low` reject (blind-hunter): `tests/test-summary.md` is a generic path that parallel epics share. This is a QA-stage artifact convention, not story code, and was raised to the lead.
- `low` reject (blind-hunter): `commas()` is duplicated across test files. Test-only duplication with no named divergence.
- `low` reject (verification-gap): the `steps.length === 0` conjunct cannot decide. It is defensive and harmless.

#### Re-review 1

_Code review 2026-09-29 (`bmad-code-review`, full mode, re-review 1 of the rework). Scope: `2ac0ae7..HEAD` (rework build commit `e7c7cb6`: `src/sim/rules/tilt.ts`, `test/rules-tilt.test.ts`, this spec) plus the lead's uncommitted tracking edits. Run from `C:/git/dragonwar/.worktrees/epic-3`, verified with `git rev-parse --show-toplevel`. Review tier: `full-opus`. All four layers ran with no model override: blind-hunter, edge-case-hunter, verification-gap and acceptance-auditor. None failed. Containment was checked after them: HEAD was still `e7c7cb6`, the unpushed commits were unchanged, and no layer edited a file._

_Checklist item (1), the round-1 HIGH (Rule 6, AD-2 DW-240 / FR-14, per-player tilt SPACING), is **FIXED**:_
- _`src/sim/rules/tilt.ts:108,202-203`: `lastBobClosureTick` is one machine-wide `number | null`. Every `tilt_bob_closed` sets it before any gate, so it moves whoever is up, whatever the phase, and whether the closure is tilted or ignored. It replaces `idleBobClosureTick`, and no phase change clears it._
- _`:109,131-133,239-246`: `lastWarningTick` is a per-player `Map`. Only that player's counted warning sets it, and it is cleared on any step whose `phase !== 'game'`._
- _Both marks are reset-safe (`:124-127`)._
- _This matches AD-2's DW-240 clause (spacing runs from the last tilt-bob closure "of any kind" and gates both the warning and the tilt; settle runs from the last counted warning and gates warnings only). It also matches AD-7's inventory line, which lists `lastBobClosureTick` and `lastWarningTick` as closure state discarded when tick runs backwards, and FR-14._
- _AC8 is pinned as amended, through a real two-player `runRulesScript` drain and rotation: run A is ignored (with a positive control that has no earlier closure), run B warns player 2, and the run-B control is ignored for player 1._
- _The AC8 `mutation:` lines under `## Verification` describe the current code. All three required mutations were re-applied here and observed red: spacing per player, settle machine-wide, and the spacing discard. The stale counts and one mislabel were corrected (see below)._

_Rule 3: the Hot-seat row runs through a real `createRules()` via `runRulesScript`. The Backglass real-runtime tier is unchanged from round 1._

_Raw rows: 25. After grouping: 0 high, 0 medium, 4 low (7 rows, all patched), plus 18 rejected rows._

_After the patches:_
- _`pnpm test`: 129 files / 2128 tests, all green._
- _`pnpm typecheck`, `pnpm lint:boundaries` and `pnpm check:headers` exit 0._
- _`test/rules-tilt.test.ts` is ASCII and LF._
- _Every mutation below was applied to `src/sim/rules/tilt.ts` from a scratchpad backup and then restored. After each restore, `git status --short`, `git diff --stat` and `git diff | sha1sum` matched their pre-mutation values._

**Patch (applied):**
- [x] [Review][Patch] (low, Rule 19) **Three AC8 `mutation:` lines still carried pre-review counts ("44 tests", "other 43/42").** They were not re-run after the rework-1 review added two tests and moved two others. The three lines are settle machine-wide, the spacing discard deleted, and the mark set after the no-player gate. Each was re-applied against the 46-test file and observed red: 2, 2 and 1 red respectively, the rest green. Each line was annotated. [spec `## Verification`, AC8] fix-risk low: tracking text only. (blind-hunter + verification-gap)
- [x] [Review][Patch] (low, Rule 19) **The "every closure moves the one spacing mark" `mutation:` line mislabelled its mutation as "the pre-rework shape".** At `2ac0ae7` the per-player mark was set right after the no-player gate, before the `tilted` and `spaced` gates, so ignored and tilted closures did move it. The line now describes the mutation itself. It was re-run after the patch below: the IGNORED and TILTED tests went red, the other 44 stayed green. The rework-1 Triage Log row that makes the same "pre-rework update shape" claim is left as history. [spec `## Verification`, AC8 "every closure" line] fix-risk low. (edge-case-hunter + verification-gap)
- [x] [Review][Patch] (low) **The AC8 `run()` helper silently ignored `withDrain` when `withFirstClosure` was false.** `run(x, false, false)` still scripted the drain. Each flag now adds its own edge independently, and `build()` sorts by tick. The three existing call shapes produce identical scripts. [test/rules-tilt.test.ts:1102-1113] fix-risk low: test helper only. (blind-hunter + edge-case-hunter)
- [x] [Review][Patch] (low) **The IGNORED-closure test's positive sat exactly on the inclusive 500-tick spacing boundary (900 = 400 + 500).** The rework-1 review moved two other tests off that boundary for the same reason. The positive is now at 1000 (600 after the ignored closure), and the test title and message were updated. [test/rules-tilt.test.ts:1049-1066] fix-risk low: test only. (blind-hunter)

**Rejected (18 rows):**
- reject, spec edit (blind-hunter + acceptance-auditor, 2 rows): the frontmatter `deferred:` still lists the `matchDelayMs.source` item, which was resolved as DW-292. This predates the rework, and the ledger entry is terminal. It is for the lead.
- reject, spec edit (blind-hunter + edge-case-hunter + acceptance-auditor, 3 rows): the Auto Run Result and the rework-1 Triage Log still call `56ac0b9` "frontmatter `baseline_commit`", but the lead repointed `baseline_commit` to `2ac0ae7`. The lead's Change Log entry records the repoint and names both baselines. It is for the lead.
- reject, spec edit (blind-hunter + acceptance-auditor, 4 rows):
  - the Change Log says "the frozen intent block is left as written", yet the Always clause and the Hot-seat row inside it were amended;
  - the SUPERSEDED list omits the AD-7 Defer entry, the "Decision needed (unresolved, blocks `done`)" heading, the first round's rejected Hot-seat row, and the renamed "stale IDLE mark" test;
  - residual risk 1's wording.
  
  All of this is stale prose the lead has already recorded as superseded (the acceptance-auditor's row is the AD-7 Defer entry). It is for the lead.
- reject, spec edit (blind-hunter + edge-case-hunter, 2 rows): the rewritten Auto Run Result no longer describes the whole story. It is not lost: the footprint extensions survive in Design Notes ("Footprint extensions to report"), and the whole-story result is in git at `a336152`.
- reject, spec edit (blind-hunter): the Matrix Test Audit says "every other row's tests are unchanged", but the restarted-timeline describe gained tests. This is Auto Run Result prose.
- reject (blind-hunter): DW-284's ledger trailer does not record the ruling that spacing stays machine-wide and settle becomes per player. The lead's `ledger_adjudicated` gate owns that `resolved-by` note (Rule 17 (2)), which should state this split. Raised to the lead.
- reject (blind-hunter): run A's positive control has no targeted mutation. Rule 19 asks for one demonstrated mutation per AC. AC8's run-A mutation (spacing per player) is recorded, and the control itself has an observed-red line (the phantom tick-0 mark).
- reject (blind-hunter): the cycle-log `self_review=26_rows_0_high_3_med_21_low` omits the 2 false rows. That is the lead's log, not story code.
- `false` (edge-case-hunter): two same-tick bob closures at `tiltWarningSpacingMs` 0. Physics emits `s_tilt_bob` as edges, one make per outside→inside transition (AD-2), so one switch cannot close twice in one tick. A spacing of 0 is also "no debounce" by definition. The finding also predates the rework.
- `false` (edge-case-hunter): the spec's `status: 'done'` versus `review` in `sprint-status.yaml`. The frontmatter status is build-auto's machine state; `sprint-status.yaml` records the pipeline stage.
- reject, outside the rework range and LOW (verification-gap): `test/rules-tilt.test.ts:1167,1219` hold two "sanity" `toEqual([])` assertions on steps with no device events, which cannot fail. They are not pinning assertions (the step call is what advances the controller), and they come from `f3c89cb`/`a336152`.

## Spec Change Log

- 2026-09-29, lead after rework 1: text that still describes the pre-rework tilt design -- the Intent's Problem (7) and Approach ("Keep the tilt marks per player"), the Attract-closure I/O row's "(idle mark)", the Execution line for `tilt.ts`, and the Design Notes' idle-mark bullet -- is SUPERSEDED by the amended Always clause, the Hot-seat I/O row and AC8 (spacing machine-wide, settle per player). Likewise the Design Notes' 999 ms figure is superseded by 933 (Always clause). The frozen intent block is left as written. `baseline_commit` now points at rework 1's baseline `2ac0ae7` so the re-review is scoped to the rework (original story baseline `56ac0b9`).

- 2026-09-29, rework 1 (lead, after code review 1; trigger=high; primary cause: **spec** -- the lead's own insertion wording in epics.md made the spacing mark per player, against AD-2/DW-240 and FR-14): the spacing mark is one machine-wide physical mark; only settle is per player. Touched: Always (tilt marks), I/O row Hot-seat, AC8, the AC8 mutation line (marked stale). Also recorded: code review raised `BONUS_COUNT_MAX_MS` from 999 to 933 (a frame of margin), and the Always clause now states that derivation.

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

### 2026-09-29 — Review pass (rework 1, follow-up)
- verdicts: 26 findings — high 0, medium 3, low 21, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind-hunter) The QA settle test's "past spacing" return at T+1100 is exactly 500 ticks after player 2's closure, so its control leans on the inclusive boundary. — Patched: player 1's return moved to T+1200 (grouped with the game-boundary test, 600 → 700). Mutation lines re-run and updated.
  - `[medium]` `[patch]` (blind-hunter) Nothing pins that a closure while tilted moves the spacing mark ("tilted or not"). — Patched: added "a closure while TILTED still moves the spacing mark ..." with its positive past spacing. The counted-only-update mutation turned it red.
  - `[low]` `[patch]` (blind-hunter) Run A's no-drain half cannot fail on spacing (player 1 is inside their own settle too), so run A has no real control. — Patched: the no-drain half was replaced by the same drain and closure at T+200 with no earlier closure at T, which warns player 2. Mutation re-run and recorded.
  - `[low]` `[reject]` (blind-hunter) The positive half of "the spacing mark survives a game boundary" also depends on the settle clear. — The coupling is recorded in the Verification mutation line. A regression that fails two tests is not a defect, and decoupling it means restaging a working test.
  - `[low]` `[patch]` (blind-hunter) The new tilt.ts header and a test comment put in quotes AD-7 text ("its own history is physical and updates whatever the phase") that the spine does not contain. — Patched: the header now quotes AD-7's real "The bob is never reset by command" and paraphrases the rest outside the quote marks. The test comment was unquoted the same way.
  - `[low]` `[reject]` (blind-hunter) The Attract-closure I/O row still says "(idle mark)". — The row is inside the read-only intent contract, and its expected behaviour ("still ineligible") still holds. The fix is a spec edit, which is the lead's to make.
  - `[low]` `[reject]` (blind-hunter) The Execution task for tilt.ts still says "per-player marks plus the idle mark". — The fix is a spec edit. The [Review] task and the amended Always clause supersede it. Raised to the lead under residual risks.
  - `[low]` `[reject]` (blind-hunter) The Design Notes still describe the idle mark and the 999 ms ceiling. — The fix is a spec edit, which is the lead's to make.
  - `[low]` `[reject]` (blind-hunter) The Auto Run Result was not updated for code review or rework 1. — The fix is a spec edit, and finalize rewrites that section in this pass anyway.
  - `[low]` `[reject]` (blind-hunter) The [Review] rework task is still unchecked. — The fix is a spec edit. The task is ticked at finalize as completion bookkeeping, not as a review patch.
  - `[low]` `[reject]` (blind-hunter) The Spec Change Log does not record the rework's execution. — The fix is a spec edit. The Change Log records intent amendments. The execution is recorded under Verification (Rework 1) and in this log.
  - `[low]` `[reject]` (blind-hunter) The Defer entry about AD-7's inventory is out of date after the rework. — The fix is a spec or spine edit. The spine text is owned by 3-1 (DW-291 occurrence). The now-accurate gap is noted under residual risks for that owner.
  - `[false]` `[reject]` (blind-hunter) Rework 1 did not re-run check:attributions, build, check:dist or check:size. — This run ran all eight gates after implement and again after the review patches, and each exited 0 (recorded under Verification).
  - `[low]` `[patch]` (blind-hunter) The settle map's reset-safety discard has no mutation after rework 1 reordered it. — Patched: `discardFutureMarks(lastWarningTick, tick)` was deleted, "a stale mark from a DIFFERENT (higher) timeline ..." went red, and the line is recorded.
  - `[low]` `[reject]` (blind-hunter) The settle-machine-wide mutation line gives no "other N stayed green" total. — Cosmetic. The line names every test that went red.
  - `[false]` `[reject]` (blind-hunter) The frontmatter is inconsistent: review_loop_iteration is 0, followup_review_recommended is false, and baseline_revision differs from baseline_commit. — `review_loop_iteration` counts this skill's bad_spec loopbacks, not the lead's reworks. `baseline_revision` is re-captured by step-03 on every implement pass by design, and `baseline_commit` is the story's original baseline.
  - `[low]` `[reject]` (edge-case-hunter) The Intent ("Keep the tilt marks per player") and the Execution list contradict the machine-wide spacing mark. — The lead's rework-1 amendment (Always clause, Hot-seat row, AC8, Spec Change Log) governs, and settle is still per player. Rewording the intent is a spec edit for the lead. Raised under residual risks.
  - `[medium]` `[patch]` (verification-gap) Ignored and tilted in-game closures must move the one spacing mark, and no test checks it. The pre-rework update shape stayed green. — Patched: added "an IGNORED in-game closure still moves the spacing mark ..." (at adjustments(1), so the tilt path skips settle and only spacing decides) and the TILTED test, each with a positive. Mutation: the counted-only update turned both red; the other 44 stayed green.
  - `[low]` `[patch]` (verification-gap) Run A's no-drain half checks nothing about spacing. — Same root cause as the blind-hunter run-A finding. Patched with the positive control.
  - `[low]` `[patch]` (verification-gap) The run-B control has no mutation line. — Patched: `settled` forced true turned it red. Recorded.
  - `[low]` `[patch]` (verification-gap) The QA settle test and the game-boundary test say "past spacing" but sit on the 500-tick boundary. — Same root cause as the first blind-hunter finding. Patched: moved to T+1200 and 700.
  - `[low]` `[reject]` (verification-gap) The Execution list and the Attract-closure I/O row still describe the idle mark. — Same as the blind-hunter spec-text rows. Spec edit.
  - `[low]` `[reject]` (verification-gap) The [Review] task is unticked. — Same as the blind-hunter row. It is ticked at finalize.
  - `[low]` `[reject]` (intent-alignment) The diff implements the amended reading (R1) and contradicts the intent's unamended Problem (7), Approach and stale R2 prose. — The lead ruled R1 (Spec Change Log, rework 1), and the fix is a spec edit. Raised under residual risks.
  - `[low]` `[reject]` (intent-alignment) The cross-game and settle-survival tests drive `createTiltController()` directly, not the real game-start path. — `runRulesScript` builds a fresh controller per run and cannot carry a mark across games. A real-path version needs new multi-game script infrastructure, which is more than a direct correction. The Hot-seat row itself runs through the real rules.
  - `[medium]` `[patch]` (intent-alignment) The "every closure" subcases (tilted, ignored, no current player, same tick as a Slam) are implemented but unpinned. — Same root cause as the verification-gap finding. The tilted and ignored cases are patched. The no-player path is the Attract test's branch, and a Slam flips the phase so the loop sees no player.

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
- AC8 (rework 1, 2026-09-29; the spacing mark is ONE machine-wide physical mark `lastBobClosureTick`, updated by every closure in any phase; the settle mark `lastWarningTick` is a per-player `Map`, cleared on any step outside `phase: 'game'`): spacing made per player → run A goes red. Separately, settle made machine-wide → run B goes red. Separately, the spacing mark's reset-safety discard disabled → its test goes red. Each mutation below was applied to `src/sim/rules/tilt.ts` from a scratchpad copy, `test/rules-tilt.test.ts` was run (44 tests), the file was restored, and `git status --short`, `git diff --stat` and `git diff | sha1sum` were compared with their pre-mutation values: identical after every restore.
  - mutation: the spacing mark keyed by `currentPlayer` (a per-player `Map`, with its own reset-safety discard, so only the per-player property differs) → `test/rules-tilt.test.ts`:"run A: after a real drain rotates to player 2, their first closure at T+200 -- inside the SPACING window of player 1's closure at T -- is ignored ..." went red; the other 43 stayed green (run B, its control and every Attract/restart test). [Re-run at the rework-1 review, after that test's no-drain half was replaced by a positive control (the same drain and closure at T+200 with no earlier closure at T, which warns player 2): it went red again, and was the only one of 46.]
  - mutation: `lastWarningTick` keyed to 0 for every player (settle machine-wide) → "run B: after a real drain rotates to player 2, their first closure at T+600 -- past spacing, inside player 1's SETTLE window -- warns player 2 ..." went red, and so did the QA test "player 1's own settle mark survives player 2's turn: ..." (on its step where player 2's closure at T+600 must warn); run A and the run-B no-drain control stayed green. [Re-run at re-review 1 against the 46-test file: the same 2 red, the other 44 green.]
  - mutation: the `lastBobClosureTick` reset-safety discard (`tick < lastBobClosureTick` → `null`) deleted → "a stale SPACING mark set in Attract from a higher timeline is discarded too -- ..." went red, and so did "a stale mark from a DIFFERENT (higher) timeline is discarded when tick restarts lower -- ..." (that test sets both marks in a game); the other 42 stayed green. [Re-run at re-review 1 against the 46-test file: the same 2 red, the other 44 green.]
  - mutation: the spacing mark set only after the no-player gate (so an Attract closure is not recorded: the Attract-closure I/O row) → "the Attract-time closure's spacing mark is genuinely recorded -- a later closure in phase \"game\", inside the spacing window, is still gated by it" went red; the other 43 stayed green. [Re-run at re-review 1 against the 46-test file: the same 1 red, the other 45 green.]
  - mutation: the `state.phase !== 'game'` clear of the settle map deleted → "a new game's player 1 is never judged against the previous game's SETTLE mark; ..." went red (its same-game control is the other half of that test). "the spacing mark survives a game boundary: ..." also went red, on its positive half: its closure (now at 700) is past spacing but inside game 1's uncleared settle.
  - mutation: `lastBobClosureTick = null` added to the outside-a-game clear (the spacing mark cleared by a phase change) → "the spacing mark survives a game boundary: a game-1 closure at 100, an Attract step, then the new game's closure at 300 is ignored; at 700 (past spacing) it warns" went red; the other 43 stayed green. [Re-run at the rework-1 review after its positive moved from 600 to 700, off the inclusive 500-tick boundary: red again, the only one of 46.] The Attract-closure test above cannot catch this: its closure is itself in Attract, so the clear runs before the closure re-sets the mark.
- AC9: the parking-entry close is deleted → the saved-drain test goes red.
  - mutation: the `device_ball_entered`/`parking` branch in `skill-shot.ts` disabled → `test/rules-modes.test.ts`:"saved no-switch drain: plunge, trough entry inside the save window, autolaunch, then the lit Top lane -- ball_saved, and no award, no letter" went red (plus the two moved `s_trough_2`/`s_lock_1` cases); the manual-plunge control stayed green.
- AC10: `renderFrame` shows `total` instead of `remaining` → the integration test goes red.
  - mutation: the BONUS row renders `finalScore - preBonusScore` (the total) → `test/backglass-integration.test.ts`:"the ball_ended screen reads (pre, BONUS total) -> (pre + 15,000, BONUS 10,000) -> (final, BONUS 0), ..." went red.

**QA stage (2026-09-29).** The tests below are added to existing files, all of which the default `pnpm test` discovers. Each mutation was applied from a scratchpad backup, observed red and restored. `git diff -- src test | sha1sum` matched its pre-mutation value after every restore (`8e7dd31…`), and `git diff --stat -- src` was empty.
- (QA) `test/backglass-integration.test.ts`: describe "Story 3.0 QA -- a real createRules() run folded like the real loop: three steps at an earned multiplier, and batched frames" (4 tests). It uses a real `createRules()` via `runRulesScript`, with an x2 earned on the real Top lanes, 3 letters and 1 loop from real switches, and 1 seeded strike, paid by player 2 in Hot seat. Frames are folded through `advanceBackglass()`/`renderFrame()`/`rasterise()` in the real loop's shape: every owed tick's events and the last tick's snapshot, at 1, 17 and `MAX_OWED_TICKS` ticks per frame.
- (QA) `test/backglass-frame.test.ts`: in the AC 5 describe, "every bonusCountMs resolveTuning() ADMITS near the ceiling, fractional ms included, fits the hold; ...". It sweeps MAX-2 to MAX+2 in 0.1 ms steps.
- (QA) `test/rules-tilt.test.ts`: in the AC 8 describe, "player 1's own settle mark survives player 2's turn: ...", with a control. [Adapted at rework 1 to the single spacing mark: player 2's closure moved to T+600 and player 1's return to T+1200 (T+1100 at rework 1, moved at its review off the inclusive 500-tick spacing boundary), so every closure is past the spacing window of the one before it and only settle decides.]
- AC1 / AC10 (QA): mutation: `bonusCountDownSteps()` applies the multiplier to the FIRST step's `remaining` only → `test/backglass-integration.test.ts`:"three steps at an earned x2: BONUS 100,000 -> 70,000 -> 50,000 -> 0 on the DMD, ..." went red (and "AC 6 through the real rules: ..."). Every pre-existing `rules-bonus`/`backglass-frame` test stayed green, because no earlier test counted three steps.
- AC4 (QA, real rules): mutation: the arming-branch fold given `[]` → `test/backglass-integration.test.ts`:"AC 4 through the real rules: at bonusCountMs 0 the whole count shares the drain's own frame, ..." went red; the other three QA tests stayed green.
- AC5 (QA, boundary): mutation: the `resolveTuning()` check changed to `bonusCountMs >= BONUS_COUNT_MAX_MS + 1` (a whole-ms bound that admits 999.5 ms, which rounds to 1000 ticks, and 3 x 1000 = 3000 does not fit) → `test/backglass-frame.test.ts`:"every bonusCountMs resolveTuning() ADMITS near the ceiling, ..." went red. Every pre-existing AC 5 test in `backglass-frame`, `tuning` and `tuning-panel` stayed green.
- AC6 (QA, real rules): mutation: the hold branch folds only the frame's FIRST `bonus_count_step` → `test/backglass-integration.test.ts`:"AC 6 through the real rules: a frame carrying ONLY the three steps ..." went red; its one-tick-per-frame control half and the other QA tests stayed green.
- AC8 (QA; re-run at rework 1 against the per-player settle map, the only per-player mark now): mutation: the settle map `lastWarningTick` cleared whenever `state.currentPlayer` changes → `test/rules-tilt.test.ts`:"player 1's own settle mark survives player 2's turn: back up at T+1200 (inside their settle window) they are ignored, at T+3000 they warn; ..." went red. Run A, run B, the run-B control and the other tilt tests stayed green (43 of 44). [Re-run at the rework-1 review with the test at T+1200: red again, the only one of 46.]
- AC3, AC9 (QA re-check, no new test): both recorded mutations were re-applied and went red again. The Attract clear disabled → "with the Slam at E+200: ..." (its control stayed green). The parking branch disabled → "saved no-switch drain: ..." plus the `s_trough_2`/`s_lock_1` cases (the manual-plunge control stayed green).
- Suite after QA: `pnpm test` 129 files / 2124 tests green (was 2118); `pnpm typecheck` and `pnpm lint:boundaries` exit 0.

**Code review (2026-09-29).** Each mutation was applied from a scratchpad backup, observed red and restored. `git diff | sha1sum` matched its pre-mutation value after every restore.
- AC5 (review, the ceiling now keeps one frame cap of margin, `BONUS_COUNT_MAX_MS` = 933): mutation: `BONUS_COUNT_MAX_MS = 999` (the first derivation) → `test/backglass-frame.test.ts`:"at bonusCountMs = BONUS_COUNT_MAX_MS, BONUS_CATEGORIES.length steps plus one MAX_OWED_TICKS frame end strictly inside BALL_ENDED_HOLD_TICKS" went red, and so did the QA sweep "every bonusCountMs resolveTuning() ADMITS near the ceiling, ...". The same two went red at `= 934`.
  - mutation: `BONUS_COUNT_MAX_MS = 932` → "and BONUS_COUNT_MAX_MS is the LARGEST such whole ms: ..." went red; the other AC 5 tests stayed green.
- AC8 (review, reset safety of an Attract-set mark; corrected at rework 1, which replaced `idleBobClosureTick` with the one machine-wide spacing mark `lastBobClosureTick`): the review's test is now "a stale SPACING mark set in Attract from a higher timeline is discarded too -- ...". mutation (re-run at rework 1): the `lastBobClosureTick` discard branch in `tilt.ts` deleted → that test went red, together with "a stale mark from a DIFFERENT (higher) timeline is discarded ..."; the other 42 tilt tests stayed green.
- AC1 (review, the tilted conjunct): mutation: `hasCount = ballEndedEvent.total > 0` (the `!tilted` conjunct dropped) → `test/backglass-frame.test.ts`:"the I/O row \"Zero bonus / tilted\": ..." went red.
- I/O row "Last ball (game over)" (review, Backglass half): mutation: the `ball_ended` hold branch gated on `game.phase === 'game'` instead of `!== 'attract'` → `test/backglass-frame.test.ts`:"the I/O row \"Last ball (game over)\": with game_over snapshots the hold still counts down to BONUS 0 and the final score" went red (together with Story 2.11's game-over warning-drop test).
- Suite after review: `pnpm test` 129 files / 2126 tests green; `pnpm typecheck`, `pnpm lint:boundaries` and `pnpm check:headers` exit 0.

**Rework 1 (2026-09-29).** `src/sim/rules/tilt.ts`: one machine-wide spacing mark, a per-player settle map cleared outside a game. `test/rules-tilt.test.ts`: the AC 8 describe rewritten (run A, run B, run-B control, the settle cross-game pair, a new spacing-survives-a-game-boundary pair, and the adapted QA settle test), and the review's reset-safety test adapted. The file still has 44 tests. The AC8 mutations are recorded above. Suite after rework 1: `pnpm test` 129 files / 2126 tests green; `pnpm typecheck`, `pnpm lint:boundaries` and `pnpm check:headers` exit 0. No added `src`/`test` line has a non-ASCII byte, and both files are LF.

**Rework 1 review (2026-09-29).** Each mutation was applied to `src/sim/rules/tilt.ts` from a scratchpad backup, `test/rules-tilt.test.ts` was run (46 tests), and the file was restored; `git diff | sha1sum` (`0d37903...`), `git status --short` and `git diff --stat` matched their pre-mutation values after every restore.
- AC8 (review, every closure moves the one spacing mark -- ignored and tilted closures included; two tests added to the I/O matrix describe, each with a positive past spacing): mutation: the mark set in the no-player branch and, in a game, only after the `tilted` and `spaced` gates (so a tilted closure or one ignored by spacing does not move it) → `test/rules-tilt.test.ts`:"an IGNORED in-game closure still moves the spacing mark: 100 warns, 400 is ignored, 800 (only 400 after it) does not tilt; ..." and "a closure while TILTED still moves the spacing mark: the next ball's closure 200 later is ignored; ..." went red; the other 44 stayed green. [Corrected at re-review 1: this line first called the mutation "the pre-rework shape", but at `2ac0ae7` the per-player mark was set right after the no-player gate, BEFORE the `tilted` and `spaced` gates. The mutation itself is unchanged. It was re-run at re-review 1, after the IGNORED test's positive moved from 900 to 1000 (off the inclusive 500-tick boundary): the same 2 red, the other 44 green.]
- AC8 (review, settle-map reset safety after rework 1 reordered the discards): mutation: `discardFutureMarks(lastWarningTick, tick)` deleted → "a stale mark from a DIFFERENT (higher) timeline is discarded when tick restarts lower -- ..." went red; the other 45 stayed green.
- AC8 (review, the run-B control): mutation: `settled` forced true (the settle check disabled) → "run B, control: the same closures with no drain are ignored -- player 1 is still up and inside their OWN settle window" went red, with the four AC 2 settle tests, the cross-game settle test and the QA settle-survives test (7 of 46).
- AC8 (review, run A's positive control): mutation: `lastBobClosureTick` initialised to 0 instead of `null` (a phantom closure at tick 0) → "run A: ... the control without player 1's closure at T warns player 2" went red on its control half (27 of 46 red in all: every test with a first closure inside 500 ticks of tick 0).
- Suite after the rework-1 review: `pnpm test` 129 files / 2128 tests green (`test/rules-tilt.test.ts` 46); `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions`, `pnpm build`, `pnpm check:dist` and `pnpm check:size` exit 0.

**Browser smoke (the lead runs it; the DMD is observed through an in-page rAF sampler cropping `#render-canvas`, because each screen lasts under 2 s):** Start a game, hit at least one DRAGON target, and drain. Expected:
- The end-of-ball screen shows PLAYER 1, the pre-bonus score, and `BONUS <total>`.
- BONUS steps down to 0 within about 1.2 s.
- The score line rises as BONUS steps down, and equals the final score exactly when BONUS reaches 0.
- The screen holds until about 3 s.

## Auto Run Result

Status: done
Blocking condition: none

**Summary (rework 1, 2026-09-29).** The one open `[Review]` item is closed. The tilt SPACING mark `lastBobClosureTick` is now ONE machine-wide physical mark. Every bob closure updates it, whoever is up and whatever the phase, tilted or ignored, and a phase change never clears it. It replaces `idleBobClosureTick`, so spacing runs from the last closure of any kind (AD-2/DW-240, FR-14). The SETTLE mark `lastWarningTick` stays a per-player `Map`: only that player's counted warning sets it, and it is cleared on any step outside `phase: 'game'`. Both marks are discarded when greater than `tick`. In Hot seat, run A (player 2's closure at T+200) is ignored, run B (T+600) warns player 2, and the run-B control is ignored for player 1. The rest of the story (bonus count-down, DW-285/286/287/289, skill-shot close) was delivered by `f3c89cb` and `a336152` and was not re-derived in this pass.

baseline_revision: 2ac0ae746c58267a47b62bf46abf551ca0bfe017 (the story's original baseline is `56ac0b9`, frontmatter `baseline_commit`)

**Files changed in this pass.**
- `src/sim/rules/tilt.ts`: one machine-wide spacing mark updated before every gate, a per-player settle map cleared outside a game, reset-safe discards, and the header prose. The AD-7 quote was corrected at review.
- `test/rules-tilt.test.ts` (46 tests, was 44):
  - The AC 8 describe was rewritten: run A with a positive control, run B, the run-B control, the settle cross-game pair, a spacing-survives-a-game-boundary pair, and the adapted QA settle test.
  - The review's reset-safety test was adapted to the spacing mark.
  - Two tests were added at review: an ignored closure and a tilted closure each move the spacing mark.
- `_bmad-output/implementation-artifacts/spec-3-0-epic-2-deferred-cleanup.md`: the `[Review]` task was ticked, the stale AC8 `mutation:` lines were replaced, the QA and review AC8 lines were corrected, the Rework 1 and Rework 1 review Verification notes were added, and this triage log and result were written.

**Review findings (follow-up pass).** Four layers returned 26 findings: high 0, medium 3, low 21, false 2.
- **Patched (3 medium rows, 1 root cause; 7 low rows, 5 root causes):**
  - ignored and tilted closures now pinned as moving the spacing mark;
  - run A's control replaced by a genuine positive;
  - the two "past spacing" tests moved off the inclusive 500-tick boundary;
  - the AD-7 misquote corrected;
  - the settle discard and run-B control mutations applied and recorded.
- **Deferred:** none new. The existing `deferred:` item, `matchDelayMs.source`, was already resolved at code review as DW-292 and is untouched.
- **Rejected (16 rows, 2 of them false),** each with its reason in the Review Triage Log:
  - stale spec prose outside Verification, which only the lead may edit: the Attract-closure row's "(idle mark)", the Execution list, the Design Notes, the Change Log, the Intent's Approach, and the AD-7 Defer entry;
  - the old Auto Run Result, rewritten here;
  - the unticked task, ticked here;
  - the settle-coupled positive of the game-boundary test;
  - a cosmetic mutation-line count;
  - the direct-controller cross-game tests;
  - two false rows: the gate set was not re-run, and the frontmatter is inconsistent.

**Follow-up review recommended: false.** This is a follow-up pass (`followup_pass` = true), and it patched no `high`. The work has converged. Patched counts by entry verdict: high 0, medium 1, low 5.

**Verification.**
- `pnpm test`: 129 files, 2128 tests, all passing. It was 2126 at entry; the review added 2 tilt tests.
- `pnpm typecheck`, `lint:boundaries`, `check:headers`, `check:attributions`, `build`, `check:dist` and `check:size` all exit 0. They were run after implement and again after the review patches.
- No golden was touched in this pass. No added `src`/`test` line has a non-ASCII byte, and both changed files are LF.
- Matrix Test Audit: the Hot-seat row is covered by run A, run B and the run-B control (real `runRulesScript` drain and rotation). The Attract-closure row is covered by the test at `test/rules-tilt.test.ts` "the Attract-time closure's spacing mark is genuinely recorded". Every other row's tests are unchanged and ran green.
- Rule 19: every AC8 pinning test touched in this pass has a fresh `mutation:` line under `## Verification`. Each was applied, observed red and reverted, and the tree was byte-identical after every restore.
- Rule 13 containment: the handoff and review subagents made no commit; `git log` HEAD was unchanged until finalize.

**Residual risks (for the lead).**
1. Stale pre-amendment prose remains in parts of the spec that this skill may not edit:
   - Intent Problem (7) and Approach ("Keep the tilt marks per player");
   - the Attract-closure I/O row's "(idle mark)";
   - the Execution line for `tilt.ts`;
   - the Design Notes' idle-mark and 999 ms bullets;
   - the AD-7 Defer entry's "idleBobClosureTick is missing".

   The behaviour matches the amended Always clause, the Hot-seat row and AC8.
2. The spine's AD-7 closure-state inventory (owned by 3-1 via DW-291) should now read: `lastBobClosureTick` is one machine-wide scalar, never cleared by phase; `lastWarningTick` is a per-player `Map`, cleared outside a game. `idleBobClosureTick` no longer exists.
3. The cross-game settle clear is pinned only against a directly driven controller. `runRulesScript` cannot carry a controller across games.
