---
title: 'Story 3.0: Epic 2 Deferred Cleanup'
type: 'bugfix'
created: '2026-09-29'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md'
warnings: [multiple-goals, oversized]
deferred: []
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
- AC2: the score is paid on the last step's tick instead of the drain tick → the rules-bonus drain-tick test goes red.
- AC3: the Attract gate is deleted → the Slam test goes red.
- AC4: `Math.max(1, …)` is removed → the zero-ms test goes red.
- AC5: `BONUS_COUNT_MAX_MS` is set to 1000 → the ceiling-vs-hold test goes red. Separately, the `resolveTuning` check is removed → the +1-rejected test and the panel test go red.
- AC6: the fold is reverted to `find` → the multi-step frame test goes red.
- AC7: the old "categories count up, then the multiplier is applied" is restored → the provenance test goes red.
- AC8: the marks are made machine-wide again → the Hot-seat test goes red. Separately, the idle mark is dropped → `rules-tilt.test.ts:950` goes red.
- AC9: the parking-entry close is deleted → the saved-drain test goes red.
- AC10: `renderFrame` shows `total` instead of `remaining` → the integration test goes red.

**Browser smoke (the lead runs it; the DMD is observed through an in-page rAF sampler cropping `#render-canvas`, because each screen lasts under 2 s):** Start a game, hit at least one DRAGON target, and drain. Expected:
- The end-of-ball screen shows PLAYER 1, the pre-bonus score, and `BONUS <total>`.
- BONUS steps down to 0 within about 1.2 s.
- The score line rises as BONUS steps down, and equals the final score exactly when BONUS reaches 0.
- The screen holds until about 3 s.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none
