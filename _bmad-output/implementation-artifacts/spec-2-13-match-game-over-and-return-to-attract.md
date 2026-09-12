---
title: 'Story 2.13: Match, game over and return to Attract'
type: 'feature'
created: '2026-09-11'
status: 'done'
baseline_revision: 'a588a667e5d44a521ddc8e8e036eb120e11bf26f'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A finished game never finishes.
- After the last ball, the machine sits in `game_over` forever. Start is honoured only in `attract` (`src/sim/rules/ball-controller.ts:696`), and nothing moves `game_over` to Attract.
- There is no `game_ended`, no Match, and no reader of `GameAdjustments.matchProbability`.
- Serving is unsafe (DW-244, measured at this tree, below). A voided game's ball left loose by a Slam drains into the NEW game and ends its ball 1. A ball already resting in the shooter lane gets a second ball stacked on it at the next serve, from Start or from any ball start.
- The Backglass cannot identify players or show everything it has. `DmdRow.emphasis` has no renderer (DW-198). The Attract scores are bare numbers. With four players the BALL row falls off the 32-dot panel, and a mode block drops from three players (DW-197).
- The bonus count-up schedule outlives a game into the next one (DW-235).

**Approach:**
- **Game over and Match.** The last ball's drain fires `game_ended { scores[] }`.
  - `matchDelayMs` later, the ball controller draws the Match number from `GameState.rng` with a single draw, weighted so the chance of matching equals `matchProbability`. It fires `match_drawn { number, winners[] }`.
  - It then paces ten `match_reveal_step` events at `matchRevealMs`. The last step resolves the Match.
- **Leaving game over.** From resolution, Start starts a new game at once, and otherwise the machine enters Attract `attractMs` later. Attract entry uses the same helper the Slam path uses.
- **Stray clearing (DW-244).** Every ball start clears stray balls itself.
  - It issues one `RecoverCommand`, which removes any loose ball.
  - It pulses `c_trough_eject` only into an empty lane. A ball resting in the lane is the ball being served.
- **The Backglass.**
  - The ball number moves onto a shared status line with the mode name, so four players plus a mode fit (DW-197).
  - Emphasis is rendered as inverted dots (DW-198).
  - Attract scores are labelled `PLAYER n`.
  - Attract opens with a keys screen built from a host-supplied `ViewConfig`.
  - A new `game_over` screen shows the final scores, `GAME OVER`, and the Match reveal.
- **DW-235.** A new game clears any pending bonus count-up steps.

**Author decisions this story is built on (binding; not re-opened here):**
1. **DW-244: "clean up the strays, then start"** (author, 2026-09-11, relayed by the lead).
   - **When.** Before serving: for Start in Attract, and for every new ball.
   - **What.** The machine clears stray balls itself:
     - a **loose** ball (outside every device) is removed through Story 2.12's `RecoverCommand` path;
     - a ball already **resting in `bd_shooter`** is the ball being served, so there is no trough eject and nothing stacks.
   - **The invariant (AD-6, amended).** Exactly one ball is in play after the serve, never two.
   - **Left to this story:** how the stray recover reports its `recovered` count, and how it orders against the serve. Both are specified and pinned below.
   - **Rule 19 binding.** Each route has its own pinning test, observed **red on today's code**, and each negative ("no stacking", "no misattributed drain") is paired with its positive **in the same test**:
     - route 1: the loose ball IS removed;
     - routes 1b and 2: the resting ball IS served, launches, and plays as that ball.
   - Expected values are never derived from the table or constant under test.
2. **DW-197 and DW-198** (author, 2026-09-06).
   - The ball number gets a shared line rather than its own row, so four players plus a mode fit.
   - `DmdRow.emphasis` is rendered: the current player's row is highlighted.
   - **Rule 19 binding.** The pinning test asserts that **the rendered dots differ** between an emphasised and an unemphasised row, and the named mutation "render with emphasis forced false" must be observed red.
   - The Attract scores screen must identify players too.
3. **DW-200** stays resolved: no mode line when only the base mode runs. It is not regressed. **DW-206** is not decided: an unlabelled mode still contributes no rows, fields included.

## Boundaries & Constraints

**Always:**
- **Dependency and naming rules** (AD-1, AD-16).
  - `sim/rules/**` never imports `sim/physics/**`, `presentation/**` or `host/**`.
  - `presentation/**` imports only `sim/contracts` and `sim/table` from `sim/`.
  - `host/**` may import `presentation/**`, but never `sim/rules` or `sim/physics`.
  - Device, coil and switch names are never string literals outside `src/sim/table/dragonwar.ts` and `test/**`. Property access such as `TABLE.ballDevices.bd_trough.ejectCoil` and `machine.deviceSlots.bd_shooter[0]` is the in-tree precedent and is allowed.
- **Ownership** (AD-18). Only the ball controller pulses `c_trough_eject`, mutates `ballsInPlay`, moves `phase` to or from `game_over`, and issues the stray-clearing `RecoverCommand`. The Slam's Attract entry calls the ball controller's exported helper; it never re-implements it.
- **Closure state** (AD-7, the closure-state class). The game-over sequence (its tick marks, drawn number and winners) and the pending stray clear are closure state in `createBallController`, never `GameState`. They must be:
  - reproducible from tick 0;
  - bounded: one draw, ten steps and one Attract transition, then cleared; the pending stray clear expires after one tick;
  - reset-safe: a mark strictly greater than `tick` is discarded, following the `tilt.ts:88-97` precedent.
- **Timers** (AD-3). Every new timer is a top-level `entry(value, source, confidence)` `…Ms` tunable in `sim/table/tuning.ts`, converted once. Tests author their offsets as literals at the probe (`5000`, `250`, `8000`, `0.08`) and never re-import them.
- **Randomness** (AD-3). The Match number comes from exactly one `nextRng()` step of `GameState.rng`, taken at the draw tick. No other randomness is added.
- **Payload completeness** (AD-9).
  - `game_ended { scores }`, `match_drawn { number, winners }` and `match_reveal_step { step, steps, shown }` are payload-complete.
  - The Backglass reveals only the `shown` of the steps it has received, never `match_drawn.number` early.
  - Rules never format text. English literals live in `presentation/backglass` only.
- **Stray-clear reporting** (the AD-6 detail left to this story).
  - Its report is the machine report on the tick after the ball start.
  - It emits `ball_missing { count }` only when `count > 0`, and it never serves.
  - Ball search's own recover answer (branch (a), `ball-controller.ts:912-917`) is unchanged.
- **Tests.** Every drain-driving test runs at `NO_BALL_SAVE_TUNING` and asserts that `ball_ended` actually arrived.
- **Golden refresh.** The harness lives in the scratchpad, never under `test/`. It writes LF line endings, is verified per field by JSON parse (never grep), and appends to `notes`.

**Block If:**
- A route pinning test (AC 5, AC 6, AC 7) cannot be made red on today's code at its stated assertion. The author's Rule 19 binding makes that a premise failure: HALT and report the observed values.
- Any golden field moves other than `header.gameStart.tuning`, which gains exactly seven blocks, plus an appended `notes`. That includes `header.tableHash` (`e22fbdcf` in all five, measured at this gate) and `header.assetHash` (`ab163ff`), and any `expectedHash`, `expectedGameStateHash`, checkpoint hash, `transitions` or `coilPrologue`. **"Checkpoint hash" concretely means `roll-and-drain`'s `checkpointTicks: [5000, 9280]` and its `expectedCheckpointHashes` `{"5000":"9561e345","9280":"796ae0e9"}` -- it is the ONLY golden carrying those two fields** (measured at this gate; named here because "any checkpoint hash" is easy to read as covering nothing). No golden presses Start, so no game logic this story adds can run in one. A moved state hash means something did: HALT.
- Any widening of `GameState`, `MachineState`, `PlayerState`, `GamePhase` or `GameAdjustments` would be required.
- `src/sim/loop/**` would need an edit, or `src/sim/physics/**` beyond the ONE sanctioned change named below; `check:ad7` must stay at exactly 3 passing tests.
  - **Sanctioned (author decision 2026-09-11, DW-257; relayed by the orchestrator, applied at this spec gate):** `src/sim/physics/devices.ts`'s `recover()` returns each ball it removes to `bd_trough`'s lowest empty slot and closes that slot's switch, instead of only despawning it. This is AC 14. It is the whole of the permitted physics edit: no other function in `src/sim/physics/**` changes, and `recover()`'s signature and its `recovered` return value do not change. The lead reports it under `footprint_extensions:`.
- `HARDWARE_COILS` membership would change, `c_autolaunch` would be disabled anywhere, or `c_mouth` would be pulsed.
- `check:ad7`, `check:corridor` or `check:reachability` goes red.
- A third-party file (font, sound, code) would be needed. The CLAUDE.md provenance rule applies.

**Never:**
- Never decide or pre-empt: DW-204, DW-206, DW-210, DW-211, DW-212, DW-226, DW-232, DW-236, DW-237, DW-240, DW-245, DW-246, DW-251, DW-255, DW-258, DW-140, DW-141, DW-142, DW-158, DW-159, DW-161, DW-173.
- Never edit Story 3.7's block (DW-268) or any other epic's block in `epics.md`.
- Never remove the ball resting in `bd_shooter`, and never pulse `c_trough_eject` from `startBall()` while `machine.deviceSlots.bd_shooter[0]` is true.
- Never serve from the stray-clear report, and never emit `ball_missing { count: 0 }` for it.
- Never pre-build any of these:
  - the `highscore_entry` phase or credits (Epic 6);
  - Match flashers or audio (Epic 4);
  - the Walk-up (4.6);
  - rebinding or persistence of bindings (6.4).
- Never change the boot Attract's coil enables. The goldens flip in that Attract (Design Notes, *AD-5 drift*).
- Never rename `matchProbability` or change its unit, and never touch the dev replay recorder's `GameStart` literal (`boot.ts:413`, `matchProbability: 0`; DW-185, routed to 3.7).
- Never write a key-code literal outside `src/host/input/**` and `test/**`.
- Never touch `.github/workflows/ci.yml`.
- Never assert a negative without its positive in the same test, never compare a value with itself, and never delete an existing assertion to make it pass. An amended test states its new expectation.

## I/O & Edge-Case Matrix

"G" is the last ball's drain tick. Production tuning gives M = G+5000 and R = G+7500, so Attract lands at G+15500.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Game over | The last player's last ball drains at G | Same tick, in order: `ball_ended`, then `game_ended { scores }`, where `scores[i]` is `players[i].score` after the bonus pays. `phase: 'game_over'` and the `HARDWARE_COILS` disable batch (both existing). No `match_drawn` at G | No error expected |
| Match draw | No Start; tick M = G + 5000 | `match_drawn { number, winners }`. `number` ∈ {0,10,…,90}; `winners` holds, ascending, each player whose `score mod 100 === number`. `GameState.rng` advances by exactly one step | No error expected |
| Reveal | k = 1..10, at M + 250·k | `match_reveal_step { step: k, steps: 10, shown: (number + 10·k) mod 100 }`. Step 10 shows `number`; it is the resolution tick R | No error expected |
| Weighted draw | `v` = the draw's `[0,1)` value; `p` = `matchProbability` clamped to [0,1]; W = the players' last-two-digit values that are multiples of ten; C = the other multiples of ten | If W ≠ ∅: `v < p` picks W[⌊v/p·\|W\|⌋], otherwise C[⌊(v−p)/(1−p)·\|C\|⌋], so P(match) = p. If W = ∅: MATCH_NUMBERS[⌊10v⌋] with `winners: []` | `p` < 0 behaves as 0 and `p` > 1 as 1. No throw |
| Start during the reveal | `game_over`, Start at a tick < R | Ignored: no `ball_will_start`, and `phase` stays `game_over` | No error expected |
| Start after resolution | `game_over`, Start at a tick ≥ R | A new game on that tick: `players` becomes one fresh player; `ballsInPlay: 0`; the pending Attract transition and any pending bonus steps are cancelled; ball 1 starts with the stray clear | No error expected |
| Attract after Match | No Start | At exactly R + 8000: `phase: 'attract'`, `modes: []`, `hardwareEnabled: false`, the disable batch. `players` is kept (last scores). At R + 7999 the phase is still `game_over` | No error expected |
| Start in Attract | `players` non-empty from the last game | `players` is replaced by one fresh player on that Start | No error expected |
| Slam | `slam_tilt` in a game | Existing 2.11 result, reached through the shared Attract helper: `players` and `ballsInPlay` kept, `slamTilted: true`, `ballSave` disarmed. No `game_ended` and no Match (a voided game) | No error expected |
| Stray: loose ball at Start (route 1) | `attract` after a Slam: the voided ball is loose and `ballsInPlay` stale at 1; Start at t | At t: `ballsInPlay: 0`, one `pulse c_trough_eject`, one `RecoverCommand`. At t+1 physics removes the loose ball before the serve spawns: `ball_missing { count: 1 }`, one ball on the table (the served one, in the lane), no second serve. No `ball_ended` until that ball is plunged and drains | No error expected |
| Stray: resting ball at Start (route 1b) | `attract` with `bd_shooter` `[true]`; Start at t | No `c_trough_eject`. One `RecoverCommand`, and at t+1 `recovered: 0`, so no `ball_missing`. Still one ball. Its plunge gives `ball_launched`, `ballNumber: 1`, `ballsInPlay: 1` | No error expected |
| Stray: lane ball at a mid-game ball start (route 2) | Ball N ends while a served ball rests in `bd_shooter` | No `c_trough_eject` on the start tick, and one `RecoverCommand`. The lane ball plays as ball N+1 | No error expected |
| Stray report, count 0 | The stray-clear report `recovered: 0` | No event and no command | No error expected |
| Stray report, lane empty | The stray-clear report arrives with `bd_shooter` `[false]`, because the serve failed | No `c_trough_eject` from this report. Ball search's report with the lane empty in `game` still serves (unchanged) | No error expected |
| Stray drain on the Start tick | A parking entry on the same tick Start creates a game | No `ball_ended` on that tick | No error expected |
| DW-235 | Bonus steps pending from the previous game (a last-ball end, or a ball end followed by a Slam) when a new game starts | No `bonus_count_step` fires at or after the new game's Start tick | No error expected |
| Score screen, 4 players + mode (DW-197) | 4 players (current 2, ball 2); `skill_shot` publishing `timerTicks 4500`, `value 7` | Rows `10`@(2,0), `20`@(66,0), `30`@(2,8) emphasised, `40`@(66,8), `ARM YOURSELF`@(2,16), `BALL 2`@(91,16), `4.5  7`@(2,24). Every row lies inside the 32 rows | No error expected |
| Score screen, 1 player + mode | 1 player, `skill_shot` with `timerTicks 4500` | `0`@(2,0) emphasised, `ARM YOURSELF`@(2,8), `BALL 1`@(91,8), `4.5`@(2,16) | No error expected |
| Base only (DW-200) | Only the base mode active, 1 player | `0`@(2,0) and `BALL 1`@(91,8). No mode text and no fields line | No error expected |
| Grid overflow | 3–4 players, a score whose separated form exceeds 10 characters | That cell shows plain digits (`123456789`) | No throw |
| Emphasis (DW-198) | A row with `emphasis: true` | The box cols [col−1, col+6n−1] × rows [row, row+7], clipped to the panel, is inverted: a dot is lit exactly where the glyph pixel is unlit | No error expected |
| Attract scores | 2 players, 25000 and 0 | `PLAYER 1 25,000`@(2,0), `PLAYER 2 0`@(2,8) | No error expected |
| Attract keys | A fresh Attract entry at E; the default bindings | E..E+2999: `attract_keys` with `L FLIP SHIFT LEFT`, `R FLIP SHIFT RIGHT`, `PLUNGE ENTER`, `START 1` on rows 0, 8, 16, 24. Then the prompt/scores cycle. The keys screen does not return until Attract is re-entered | No error expected |
| No ViewConfig | `renderFrame(view, snapshot)` with no third argument | The keys rows carry the action labels only | No throw |
| Game-over screen | `phase: 'game_over'`, after the last ball's hold | Players block (no emphasis). Status line: `GAME OVER`@(2, status row); on the right nothing, then each step's two-digit `shown`, then `MATCH 00`@(79, status row) on a winning resolution, or the bare two digits on a losing one | No error expected |
| Restarted timeline | A game-over mark from a later tick than the current one | It is discarded: no Attract transition and no step from it | No error expected |
| Goldens | The change is complete | All five goldens gain exactly seven `gameStart.tuning` blocks and an appended `notes`; nothing else differs | `StaleReplayHeaderError` if missed |

</intent-contract>

## Code Map

Every anchor below was read at `a080bf83653bf034a527311ec350ca9a78c51c3e`, with a clean tree.

**Rules**
- `src/sim/rules/ball-controller.ts`: the owner of the whole lifecycle.
  - `applyDeviceEvents` `:96-157` and `deriveDeviceSlots` `:169-188` are unchanged.
  - `HARDWARE_COILS` `:262` must not change. `SHOOTER_LAUNCH_COIL` is at `:291`; `emptyPlayer()` at `:293-307`.
  - `applyRecovery` `:352-357` zeroes `ballsInPlay` on any non-null `recovered`, which covers the stray report too. No change.
  - `createBallController` starts at `:369`. Its closure state:
    - `awaitingSaveLaunch` `:410`;
    - `awaitingSaveRelaunch` `:480`;
    - `pendingBonusCountSteps` `:501`, which DW-235 resets;
    - `armBonusCountSchedule` `:525-546`.
  - `startBall()` `:549-623`: the resets are at `:557-571`. **The unconditional trough pulse at `:608` is the DW-244 site.** It returns the `StartBallResult` shape at `:332-337`, which gains `recoverCommands`.
  - `step()` `:625-944`. The pieces this story touches:
    - `observe()` `:631`;
    - the bonus-step drain `:645-651`, where the game-over schedule's emission joins;
    - Start `:694-721`: honoured only from `'attract'` at `:696`; the new game is created at `:697`;
    - the drain branch `:800-903`, whose game-over block is `:869-873`;
    - branch (a) `:912-917` (unchanged for search);
    - search `step()` `:937`.
- `src/sim/rules/tilt.ts`: the Slam write at `:115-149`, the minimum Attract write this story subsumes. `disableHardwareCoils` is at `:53`. It already imports `HARDWARE_COILS` from `ball-controller.ts:35`, the precedent for importing the new helper.
- `src/sim/rules/index.ts`: `DEFAULT_ADJUSTMENTS` `:235-240` (`matchProbability: 0.08` literal; the comment at `:206-215` says it has no reader). The stage order is at `:262-346`. `recoverCommands` already flows to the loop at `:343`.
- `src/sim/rules/rng.ts`: `nextRng` `:29-41` and `nextRngInt` `:51-54`. Match uses `nextRng` once.
- `src/sim/rules/ball-search.ts`: the phase gate at `:297`, so `game_over` and Attract stop the search with no new code. `reset()` is at `:330`.
- `src/sim/rules/modes/skill-shot.ts`: the only other `rng` consumer (the lane draw). Match draws after it, at game end.

**Contracts, table and tuning**
- `src/sim/contracts/events.ts`: `SemanticEvent` `:304-322` gains three members. `BallMissingEvent` is at `:177-181`.
- `src/sim/contracts/replay.ts`: `GameAdjustments` `:17-22` is unchanged (`matchProbability`).
- `src/sim/table/tuning.ts`:
  - `entry()` `:49`;
  - `ballSearchMs`/`ballSearchStepMs` `:392-393`, the style model;
  - `bonusCountMs` `:681-685`, which the lead-in must outlast through the hold (see below);
  - `resolveTuning()` `:833-870`, which derives each `…Ticks`;
  - `shotWindowTicks` is the sanctioned reader.
- `src/sim/table/dragonwar.ts`: untouched, so `tableHash` does not move.

**Presentation**
- `src/presentation/backglass/frame.ts`:
  - `DmdRow` doc `:48-64`: "nothing renders it yet" must be rewritten.
  - `DmdScreen` `:67` gains `'attract_keys' | 'game_over'`.
  - `BackglassView` `:121-127` and `INITIAL_BACKGLASS_VIEW` `:130-136`.
  - Holds: `BALL_ENDED_HOLD_TICKS` `:150` (3000); the Attract holds `:159-161`.
  - `isAttractScreen`/`attractScreenAt` `:163-181`.
  - `advanceBackglass` `:231-424`. The ball_ended arming is at `:242`. The live hold at `:294-324` is where `game_over` still holds. The Attract branch is at `:417-421`, and the fallback at `:423`, which today renders `game_over` as `score`.
  - `LEFT_MARGIN_COL` `:426`, `LINE_PITCH_ROWS` `:428`, `formatScore` `:431`.
  - `MODE_DISPLAY_NAMES` `:460` (DW-200). `buildModeRows` `:500-524` is DW-206's surface: its behaviour for an unlabelled mode is kept.
  - `buildScoreRows` `:527-548` (today's layout: BALL on its own line at `players.length`). `buildAttractScoresRows` `:551-558` gives bare numbers.
  - `renderFrame` `:595-626`, including the `never` default arm.
- `src/presentation/backglass/raster.ts`: `rasterise()` `:39-69` ignores `emphasis`. `LINE_WIDTH_COLS` 21 is at `:18`.
- `src/presentation/backglass/font.ts`: `GLYPH_W` 5, `GLYPH_H` 7, `GLYPH_ADVANCE` 6, `FONT_5X7` (A–Z 0–9 `. , : -` space). Unchanged, and no new font.

**Host**
- `src/host/input/index.ts`: `KEY_MAP` `:84-93` (`ShiftLeft`, `ShiftRight`, `Enter`, `Digit1`, arrows, `Space`) is the only home of key codes.
- `src/host/boot.ts`:
  - the real `GameStart` adjustments at `:285` (`matchProbability: 0.08` literal);
  - the frame fold and render at `:297-298` (`advanceBackglass` then `renderFrame(backglassView, output.snapshot)`);
  - the dev recorder at `:413`, which stays as it is.

**Tests and harnesses**
- `test/util/switch-script.ts`: `runRulesScript` `:238`, with options `tuning`, `adjustments`, `initialState`, `machineReports` (`:170-187`) and result `recoverCommands` (`:199`).
- `test/ball-search-integration.test.ts`: the cup instrument (`CUP_WALL_*` `:94-122`, `buildCupDoc` `:127`, `place()` `:174`, capture `:203-219`, `startAndSettle` `:222`). AC 7 adds its route-2 case here.
- `test/rules-tilt-integration.test.ts:64-72`: `burstTransitions()` emits two `nudge_up` edges at 2-tick spacing, deliberately under the Slam count. Ten edges at the same cadence trip the Slam: measured `slam_tilt` 4 ticks after the first edge (2505 for edges from 2501, 455 for edges from 451). ACs 5 and 6 author their own ten-edge burst.
- `test/ball-search-physics.test.ts:109-119`: 2.12's AC 8, "a recover and a pulse `c_trough_eject` in the SAME step keep the newly served ball". It is the committed ordering pin this design relies on.
- `test/backglass-frame.test.ts`: tests amended to the new contract:
  - `:174-175` (`game_over` "selects the score screen");
  - `:739-748` (the hold end in `game_over` expects `'score'`);
  - `:1106-1161` (the Attract cycle and cold boot start on the prompt);
  - `:1180-1204` (mode rows);
  - `:1208-1262` (the DW-200 rows and dot bands at row 16);
  - `:1277-1300` (the long BALL row);
  - `:1314` `DISPLAY_LITERALS`, which gains `GAME OVER`, `MATCH`, `L FLIP`, `R FLIP`, `PLUNGE`.
  - The existing inequality pattern is at `:1101`.
- `test/backglass-raster.test.ts:18`: the `DmdRow` fixture helper.
- Other tests that call `renderFrame` or assert Attract/score rows; re-run and amend as needed: `test/backglass-integration.test.ts` (8 calls), `test/rules-modes-integration.test.ts` (2), `test/ball-render.test.ts` (1), `test/ball-search-integration.test.ts` (1, `screenAtMissing` stays `'score'`).
- `test/contracts.test.ts:240-342`: `describeEvent` and its `never` tail.
- `test/tuning.test.ts:27-114`: `scalarKeys` and its ratchet. `:274-282` is the derived-ticks pattern.
- `test/host-game-seed.test.ts:117-135`: the regex over `boot.ts`'s adjustments literal. It is amended so `matchProbability` reads `TUNING.matchProbability.value`, mirroring `tiltWarnings`.
- `test/replay-goldens.test.ts` and `test/golden-line-endings.test.ts`: the five goldens.

**Measured at this tree** (scratch probes, never committed; real `createLoop`, `NO_BALL_SAVE_TUNING`, production pitch, seed 0):
- **Route 1.**
  - Setup: Start at 2, plunge 401→1601 (`ball_launched` at 1620), ten `nudge_up` edges from 2501 (`slam_tilt` at 2505), Start at 2620.
  - At 2621 there are two balls, `ballsInPlay` is still **1**, and the trough drops 3→2.
  - The voided ball drained at 8248, giving **`ball_ended(p0)` for the new game's ball 1**. At 8249 the trough ejected again with **two balls in the lane corridor**.
  - The cabinet was still ringing 65 ticks after the Start, and the served ball launched itself at 2685. That is why AC 5 starts 1000 ticks after the Slam.
- **Route 1b.** Slam at 455 with the served ball resting in the lane (it stays in the lane). Start at 570 gives, at 571, a trough 3→2 drop and **two balls in the lane**.
- **Route 2** (2.12's cup and real search, S = 15401).
  - `eject_failed(bd_shooter)` at S+2001. The trough serve into the lane lands at S+2251, and the cup ball stays counted.
  - The cup ball was `place()`d at (257, 30) at S+2300. It drained, giving `ball_ended(p0)` at **S+2577** (17978), with no `ball_missing` (the drain closure cancelled the pass). At S+2578 **two balls were in the lane**.
  - The other drain points measured: (234, 40) gave S+2621; (300, 40) gave S+2733.
- **The same shape via a dev pulse.** A second ball served into the lane while ball 1 was in play; ball 1's drain at 5915 was followed at 5916 by two balls in the lane.
- **Ordering** (machine level). A loose ball plus one step carrying `[recover, pulse c_trough_eject]` gave `recovered: 1`, the loose ball gone, the served ball kept, and **in the same step** `s_trough_3` opening and `s_shooter_lane` closing. So at t+1 rules see the report and the paired served arrival in one batch: `deviceSlots.bd_shooter` already reads `[true]` when the ball controller runs.
- **Goldens** (JSON-parsed). No transition frame in any of the five has `start: true`, and `two-ball-collision` has no transitions. So no golden leaves Attract: no ball start, no game over, no Match draw, and no stray recover can run in one. `adjustments.matchProbability` is `0` in all five headers.
- **Scoring values.** `skillShotAward` 25000, `bonusLetterValue` 5000, `bonusLoopValue` 10000, `bonusStrikeValue` 25000, and the base mode awards nothing. Every score is therefore a multiple of 5000, so W = {00} whenever a player exists.
- **Coils.** Physics boots every coil enabled (`src/sim/physics/machine.ts:265-272`). `hold-and-release` flips `flipper_l` in the boot Attract.

## Tasks & Acceptance

**Execution** (in dependency order):
1. **Red first.** Write the three route pinning tests and run them on today's code before any `src/` edit. Record each observed red value in `## Verification`'s Rule 19 log.
   - `test/stray-clear-integration.test.ts` (new, GPL-3.0 header): AC 5 (route 1) and AC 6 (route 1b), with real `createLoop` and real input.
   - `test/ball-search-integration.test.ts`: a new `it` for AC 7 (route 2) on the existing cup instrument.
   - If any of them is not red at its stated assertion, apply the Block-If.
2. `src/sim/contracts/events.ts`: add three members to `SemanticEvent`, each doc-commented as payload-complete (AD-9):
   - `GameEndedEvent { type: 'game_ended'; scores: readonly number[]; tick }`;
   - `MatchDrawnEvent { type: 'match_drawn'; number: number; winners: readonly number[]; tick }`;
   - `MatchRevealStepEvent { type: 'match_reveal_step'; step: number; steps: number; shown: number; tick }`.
3. `src/sim/table/tuning.ts`: add four top-level entries (sources and confidence in Design Notes, *Tunables*):
   - `matchProbability: entry(0.08, …, 'unverified')`;
   - `matchDelayMs: entry(5000, …, 'unverified')`;
   - `matchRevealMs: entry(250, …, 'unverified')`;
   - `attractMs: entry(8000, …, 'unverified')`.

   `test/tuning.test.ts`: list all four in `scalarKeys`, with a Story 2.13 comment. Add a test asserting the four resolved values and the derived `matchDelayTicks` 5000, `matchRevealTicks` 250 and `attractTicks` 8000, as literals.
4. `src/sim/rules/match.ts` (new, GPL-3.0 header). Pure functions, no closure:
   - `MATCH_NUMBERS` (0…90, step 10);
   - `MATCH_REVEAL_STEPS = MATCH_NUMBERS.length`;
   - `matchNumberFor(value, scores, probability)`, the I/O row *Weighted draw*;
   - `drawMatch(rng, scores, probability)`, which takes one `nextRng` and returns `{ number, winners, rng }`;
   - `revealShown(number, step) = (number + 10·step) % 100`.
5. `src/sim/rules/ball-controller.ts`:
   - (a) **The Attract helper.** Export `enterAttract(state, tick)`. It returns `phase: 'attract'`, `modes: []` and `hardwareEnabled: false`, plus the `HARDWARE_COILS` disable batch. Nothing else is touched: `players`, `ballsInPlay`, `rng` and `tilt` are kept.
   - (b) **A new game.** The Start branch honours Start when `phase === 'attract'`, or when `phase === 'game_over'` and the game-over sequence is either absent or at or past its resolution tick. A new game:
     - replaces `players` with `[emptyPlayer()]` and sets `currentPlayer: 0`;
     - sets `machine.ballsInPlay: 0`;
     - clears `pendingBonusCountSteps` (DW-235) and the game-over sequence;
     - then calls `startBall`.

     The Hot-seat branch is unchanged. The drain branch does not run on a tick where a new game was created.
   - (c) **The stray clear in `startBall()`.**
     - If `state.machine.deviceSlots.bd_shooter[0]` is true, emit no trough pulse. Otherwise emit the existing pulse.
     - Always add one `RecoverCommand { type: 'recover', tick }`, and set `pendingStrayClear = { tick }`.
     - `StartBallResult` gains `recoverCommands`, and every caller merges them.
   - (d) **The stray report.**
     - On `tick === pendingStrayClear.tick + 1` with `machineReport.recovered !== null`: emit `ball_missing { count }` only if `count > 0`; no serve; clear the pending clear.
     - The pending clear expires when `tick > pendingStrayClear.tick + 1`.
     - Any other report takes the existing branch (a).
   - (e) **Game over.** In the game-over block, after the `ball_ended` push, push `game_ended { scores }` and arm the sequence. Its marks, from G:
     - `matchTick = G + matchDelayTicks`;
     - the reveal step ticks `matchTick + k·matchRevealTicks`;
     - `resolvedTick = matchTick + 10·matchRevealTicks`;
     - `attractTick = resolvedTick + attractTicks`.

     At the top of `step()`, beside the bonus drain, with reset-safety first:
     - at `matchTick`: call `drawMatch(nextState.rng, scores, adjustments.matchProbability)`, write the returned `rng` into `nextState`, and emit `match_drawn`;
     - at each step tick: emit its `match_reveal_step`;
     - at `tick >= attractTick`: apply `enterAttract` and clear the sequence.

     This runs before the Start handling, so a Start on the Attract tick starts a game.
   - Rewrite the file header (`:3-8`) and the Start comment to describe the new lifecycle.
6. `src/sim/rules/tilt.ts`: the Slam uses `enterAttract` for phase, modes, `hardwareEnabled` and the disable batch, then layers `tilt: { tilted: false, slamTilted: true }` and the `ballSave` disarm exactly as today. Update the comment at `:127-137`, which says the Slam "does not build a second path": it now uses the shared one.
7. `src/sim/rules/index.ts`: `DEFAULT_ADJUSTMENTS.matchProbability` reads `TUNING.matchProbability.value`. Rewrite the `:206-215` comment, because `matchProbability` now has a reader.
8. `src/presentation/backglass/view-config.ts` (new, GPL-3.0 header):
   - `export interface ViewConfig { readonly bindings: Readonly<Partial<Record<InputAction, readonly string[]>>> }` (`InputAction` comes from `sim/contracts/input`);
   - `EMPTY_VIEW_CONFIG`.
9. `src/presentation/backglass/raster.ts`: in `rasterise()`, an emphasised row's box is inverted as in the I/O row *Emphasis*. It is computed from that row's own glyph mask. Unemphasised rows are unchanged. Update the header.
10. `src/presentation/backglass/frame.ts`, following Design Notes, *The Backglass*:
    - the new `DmdScreen` members and `BackglassView.heldMatch`;
    - `INITIAL_BACKGLASS_VIEW.screen: 'attract_keys'`;
    - the players block, the status line and the fields line;
    - the labelled Attract scores;
    - the keys screen and the game-over screen;
    - the `advanceBackglass` order;
    - `renderFrame(view, snapshot, viewConfig = EMPTY_VIEW_CONFIG)`.

    Rewrite the `DmdRow` and `DmdScreen` doc comments.
11. `src/host/input/index.ts`: export `viewConfigFromKeyMap(keyMap = KEY_MAP): ViewConfig`, which inverts the map to action → codes in map order. `src/host/boot.ts`:
    - build it once and pass it as `renderFrame`'s third argument;
    - the real `GameStart` adjustments read `matchProbability: TUNING.matchProbability.value`.
12. Tests (each follows `## Verification`'s mutation plan):
    - `test/rules-match.test.ts` (new, headless): AC 2 (draw units and timeline), AC 3 and AC 11.
    - `test/rules-stray-clear.test.ts` (new, headless): AC 8.
    - `test/game-over-integration.test.ts` (new, real loop): ACs 1, 2 and 3 end to end, folded through the real Backglass and rasterised.
    - `test/backglass-frame.test.ts` and `test/backglass-raster.test.ts`: ACs 4, 9 and 10; the amendments listed in the Code Map; the `matchDelayTicks > BALL_ENDED_HOLD_TICKS` inequality beside `:1101`.
    - `test/host-input.test.ts`: AC 4's integration half.
    - `test/contracts.test.ts`: AC 13.
    - `test/host-game-seed.test.ts`: the regex amendment.
    - `test/rules-devices-headless.test.ts`: append `rules-match.test.ts` and `rules-stray-clear.test.ts` to `ENTRY_FILES`, with a Story 2.13 comment. Its completeness ratchet (`:223-245`) requires every `test/rules-*.test.ts` not named `*-integration.test.ts`. `stray-clear-integration.test.ts` and `game-over-integration.test.ts` do not start with `rules-`, so they are outside it.
13. Goldens: `test/replays/{roll-and-drain,hold-and-release,full-plunge,nudge-coupling,two-ball-collision}.golden.json`. Run a scratchpad harness that sets each `header.gameStart.tuning` to the live `resolveTuning()` output, which is exactly seven new blocks: `matchProbability`, `matchDelayMs`, `matchDelayTicks`, `matchRevealMs`, `matchRevealTicks`, `attractMs`, `attractTicks`. It appends a Story 2.13 `notes` line and writes LF. Verify per field (`## Verification`).
14. **DW-257, the sanctioned physics edit** (AC 14; author decision 2026-09-11). `src/sim/physics/devices.ts`, `recover()` ONLY:
    - **Red first**, as task 1: write `test/physics-recover-trough.test.ts` (new, GPL-3.0 header) and run it on today's code. Both halves of AC 14 must be red at their stated assertions before the edit. If either is not, apply the Block-If and report the observed values.
    - Today `recover()` calls `physics.removeBall(ball)` for every ball outside a device and opens no slot. Change it to park each removed ball into `bd_trough`'s lowest empty slot and close that slot's switch -- the same parking operation an entering ball already gets (AD-6), reusing the existing park path rather than a second implementation of it.
    - Do NOT change `recover()`'s signature or the meaning of its `recovered` return value: it still counts balls taken out of the simulated set, which is what Story 2.12's `ball_missing { count }` and this story's AC 8 report.
    - If the trough is somehow full, the ball is still removed and the overflow is NOT ejected (AD-18's phasing; nothing may pulse `c_mouth`, and an overflow eject here would re-enter the loop this fix exists to close). That branch is unreachable while the four-ball invariant holds -- assert the invariant rather than build a path for its violation.
    - Nothing else in `src/sim/physics/**` changes. Re-run 2.12's ball-search tests: they must stay green, and `recovered` must still be 1 per recovered ball.

**Acceptance Criteria:**
- **AC 1: game over shows final scores and fires `game_ended`** (epics AC 1; AD-6, AD-7, AD-9, AD-5).
  - **Given** a real `createLoop` with `NO_BALL_SAVE_TUNING` as both `GameStart.tuning` and the loop's `tuning`, adjustments `ballsPerGame: 1`, and the seven `HARDWARE_COILS` disabled after the plunge so the ball drains.
  - **When** Start, a 1200-tick plunge, and the drain at tick G.
  - **Then**, reading only `FrameOutput`:
    - G's events contain `ball_ended` followed by `game_ended { scores: [s] }`, where `s === snapshot.game.players[0].score` at G;
    - `phase` is `'game_over'` from G;
    - folded through `advanceBackglass`/`renderFrame`/`rasterise`, the screen is `'ball_ended'` through G+2999 (the last ball's hold, 2.10's count-up kept) and `'game_over'` from G+3000;
    - the `game_over` frame's player band (rows 0–7) carries the dots of `s`, and its status band carries `GAME OVER`;
    - the frame before G shows `'score'`, which is the positive that the screen changed.
- **AC 2: the Match draw, its odds, its reveal, and MATCH on a win** (epics AC 2; AD-3, AD-9, AD-14, AD-15).
  - **Given** the headless draw functions, and AC 1's real loop run twice: once with `matchProbability: 1` (run W) and once with `0` (run L).
  - **When** the Match runs.
  - **Then**, for the draw:
    - over rng states 0–99,999 with `scores [25000]` and `p = 0.08`, every number is in {0,…,90} step 10 and all ten occur;
    - the win fraction lies in 0.08 ± 0.0035 (4σ of the binomial with N = 100,000, computed in the test from literals);
    - `matchNumberFor` at `v = 0.0799999` with `p = 0.08` wins, and at `v = 0.08` (on the bound) loses;
    - with W = ∅ (`scores [25005]`), every draw has `winners: []`;
    - `p = 1.5` behaves as 1, and `p = −0.2` as 0;
    - winners with `scores [100, 250, 3100]` and number 0 are `[0, 2]`.
  - **Then**, in the real loop:
    - the premise, asserted in both runs: `game_ended.scores[0] % 100 === 0`. Every scoring value at this tree is a multiple of 5000, so W = {00}; if the premise fails, the run cannot discriminate W from L. It is asserted, never assumed;
    - in both runs, `match_drawn` arrives at exactly G+5000 and nothing earlier;
    - `match_reveal_step` arrives at G+5250, G+5500, …, G+7500 (ten events, `steps: 10`);
    - run W: `number: 0`, `winners: [0]`, and the `shown` sequence is `[10,20,30,40,50,60,70,80,90,0]` (authored literal);
    - run L: `winners: []` and `number` ∈ {10,…,90};
    - the Backglass status line shows no number through G+5249, each step's two-digit `shown` after it, and at G+7500 `MATCH 00` in run W against the bare two digits in run L. The two runs' rasterised status bands differ;
    - display-only: every `players[i].score` at G+7500 equals its value at G, `players.length` is unchanged, and the only event at G+7500 is the final `match_reveal_step`. Free play has no credit to award.
- **AC 3: leaving game over** (epics AC 3; AD-5, AD-7, AD-3).
  - **Given** run L continued, plus two headless twins from a `game_over` state produced by a scripted last drain.
  - **When**:
    - (i) no Start;
    - (ii) Start pressed at R−5 and released at R−3, then pressed at R = G+7500;
    - (iii) the machine in Attract after (i), then Start.
  - **Then**:
    - (i): `phase` reads `'game_over'` at R+7999 and `'attract'` at R+8000. `hardwareEnabled` is false, `modes: []`, and the disable batch is issued (headless).
    - (ii): the R−5 press yields no `ball_will_start` and leaves `game_over`. The press at R yields `ball_will_start` at R, `phase: 'game'`, `players.length === 1` with score 0 and `ballNumber` 1, and `ballsInPlay` 0. At R+8000 the phase is still `'game'`. The headless run shows (i)'s Attract transition as the positive.
    - (iii): `players` is non-empty in Attract, and after Start it is exactly one fresh player.
- **AC 4: Attract shows the keys once, from `ViewConfig`, then cycles labelled last scores** (epics AC 4; AD-14, AD-9, AD-4). This is an Integration AC.
  - **Given** a view folded from a `game_over` frame into an Attract snapshot at E, with two players' scores.
  - **When** it runs to E+30000.
  - **Then**:
    - the screen is `'attract_keys'` exactly on E..E+2999, then `'attract_prompt'` on E+3000..E+5999, then `'attract_scores'` on E+6000..E+8999, and it wraps;
    - `'attract_keys'` never recurs within that stay, and it does recur after a fresh re-entry. That re-entry is the same test's positive for "once per entry";
    - with `viewConfigFromKeyMap(KEY_MAP)` (real host map, real renderer), the keys rows are exactly `L FLIP SHIFT LEFT`, `R FLIP SHIFT RIGHT`, `PLUNGE ENTER` and `START 1` at rows 0/8/16/24;
    - with `{ flipper_l: ['KeyZ'] }` the first row is `L FLIP Z`;
    - the scores rows are `PLAYER 1 25,000` and `PLAYER 2 0`;
    - a cold boot (no players) shows keys, then the prompt only.
- **AC 5: DW-244 route 1, a voided game's loose ball is removed before the serve** (AD-6, AD-9, AD-18, AD-4). Red first.
  - **Given** a real `createLoop` (committed document, `NO_BALL_SAVE_TUNING` both ways, `tiltWarnings: 1`, `ballsPerGame: 3`), set up as follows:
    - Start at 2 (released at 3), plunger held 401→1601;
    - ten `nudge_up` rising edges at 2-tick spacing from 2501;
    - the premise, at tick 3500: `slam_tilt` has arrived; `phase: 'attract'`; exactly one ball, outside the lane corridor (x ≥ 480, y ≤ 140) and every device, with its id recorded; `ballsInPlay` 1; trough 3.
  - **When** Start is pressed at T = 3501 (released at 3502), the loop runs 10,000 ticks with no input, and then a 1200-tick plunge is made.
  - **Then**:
    - `ballsInPlay` reads 0 at T (today: 1);
    - at T+1 the trough drops 3→2 with `bd_shooter` `[true]`;
    - exactly one `ball_missing { count: 1 }` arrives in the run, at T+1, and `snapshot.balls.length` is 1 with the recorded id absent from T+1. That is the positive: **the loose ball IS removed**;
    - from T+1 until the plunge: `balls.length` stays 1, the trough stays 2, and no `ball_ended` and no `ball_launched` arrive (the negatives: no stacking, no misattributed drain);
    - the plunge yields `ball_launched` with `currentPlayer` 0, `players[0].ballNumber` 1 and `ballsInPlay` 1.
  - If the served ball launches itself before the plunge because the cabinet is still ringing, move T later, record the reason, and never drop the assertion.
- **AC 6: DW-244 route 1b, a resting ball is the ball served** (AD-6). Red first.
  - **Given** the same loop: Start at 2, and the served ball resting (T0 = 400).
  - Ten `nudge_up` edges from 451. The premise: `slam_tilt` arrives, the ball stays in the lane with `bd_shooter` `[true]`, `phase: 'attract'`, trough 3, one ball, its id recorded.
  - **When** Start at T = 1501, 3000 quiet ticks, then a 1200-tick plunge.
  - **Then**:
    - the trough stays 3 and `balls.length` stays 1 from T through the plunge. That is the negative, no stacking (today: 3→2 at T+1 and two balls in the lane);
    - no `ball_missing` arrives, and no `ball_launched` arrives between the Slam and the plunge (the premise that the ball genuinely rests);
    - the plunge yields `ball_launched` with the recorded ball id leaving the lane, `players[0].ballNumber` 1 and `ballsInPlay` 1. That is the positive: **the resting ball IS served** and plays as ball 1.
  - If the Slam's cabinet ringing launches the resting ball before the plunge, move T later, record the reason, and never drop the assertion.
- **AC 7: DW-244 route 2, a search-served lane ball is the next ball** (AD-6, AD-18). Red first.
  - **Given** AC 2 of 2.12's cup run through S+2251: the search's trough serve lands in the lane, `ballsInPlay` 1, trough 2, and the served ball's id is recorded.
  - At S+2300 the cup ball is `place()`d at (257, 30, 13.5).
  - **When** the loop runs until `ball_ended` (measured at S+2577), then 2000 quiet ticks, then a 1200-tick plunge.
  - **Then**:
    - `ball_ended { player: 0 }` arrives, and `ball_will_start` arrives on the same tick;
    - no `ball_missing` arrives anywhere in the run: the drain closure cancelled the search pass before its `RecoverCommand`, and the stray clear's report is `recovered: 0` because nothing is loose;
    - from that tick through the plunge the trough stays 3 and `balls.length` stays 1. That is the negative (today: two balls in the lane at S+2578);
    - the plunge yields `ball_launched` with the recorded id, `players[0].ballNumber` 2 and `ballsInPlay` 1. That is the positive: **the lane ball IS served** as ball 2.
- **AC 8: the stray clear's reporting and guards** (AD-6, AD-4, AD-18).
  - **Given** `runRulesScript` with `machineReports`.
  - **When**, and **then**:
    - (i) Attract with `ballsInPlay` 1 and the lane empty, Start at t, report `{ recovered: 1 }` at t+1: at t, one `pulse c_trough_eject` and `recoverCommands [{ tick: t }]`, with `ballsInPlay` 0. At t+1, `ball_missing { count: 1 }` and no coil command.
    - (ii) The same run with `{ recovered: 0 }`: no `ball_missing` at all. (i) is the positive in the same test.
    - (iii) The same Start, with the report `{ recovered: 0 }` at t+1 and no lane closure scripted (the serve failed): no `c_trough_eject` at t+1. The positive in the same test: the identical report at t+5, which is not the stray clear's tick, in `game` with the lane empty, pulses `c_trough_eject` through branch (a).
    - (iv) Attract with `bd_shooter` `[true]`, then Start: no `c_trough_eject`, but `recoverCommands [{ tick: t }]`. `s_shooter_lane` opening at t+50 then yields `ball_launched` with `ballNumber` 1.
    - (v) Mid-game, `ballsInPlay` 1 and `bd_shooter` `[true]`, drain at D: `ball_ended` and `ball_will_start` at D with no `c_trough_eject`. The lane opening at D+20 yields `ball_launched` with `ballNumber` 2. The same script with `bd_shooter` `[false]` pulses at D.
    - (vi) Attract with `ballsInPlay` 1: Start and a trough-slot close on the same tick t yield no `ball_ended` at t. In `game` with `ballsInPlay` 1, the same close yields `ball_ended` at t.
  - Also, 2.12's `test/ball-search-physics.test.ts:109-119` stays green unchanged: a recover and a same-step serve keep the served ball.
- **AC 9: DW-197, the ball number shares the status line, and four players plus a mode fit** (AD-9).
  - **Given** `renderFrame` over constructed states.
  - **When** the I/O rows *Score screen, 4 players + mode*, *1 player + mode*, *Base only*, 2 players + mode, 3 players, and *Grid overflow* render.
  - **Then**:
    - rows equal the authored literal `{ text, col, row, emphasis }` lists, e.g. `BALL 1`@(91,8) and `BALL 2`@(91,16);
    - in the 4-player frame, each of the status and fields bands (rows 16–23 and 24–31) is non-empty (the differential band form), and the rows sit at those coordinates (today they sit at row ≥ 32 and are clipped);
    - DW-200: in the base-only frame, the status band's left segment (cols 2–85) has no lit dot and its BALL segment does. The DW-206 case (an unlabelled mode publishing `timerTicks`) still contributes no row and no dot.
- **AC 10: DW-198, emphasis is rendered, and Attract identifies players** (AD-9).
  - **Given** `rasterise` of the one-row frame `{ text: '8', col: 2, row: 0 }` with `emphasis` true and false, and a 2-player score frame with `currentPlayer: 1`.
  - **When** each is rasterised.
  - **Then**:
    - **the dot buffers differ**: emphasised, dot (1,0) is lit and every pixel lit in the unemphasised `8` is unlit; unemphasised, dot (1,0) is unlit;
    - in the 2-player frame, the line-1 box (cols 1–7 for a one-digit score, rows 8–15) has its background dots lit, while the line-0 box at (1,0) is unlit;
    - Attract scores are labelled (AC 4's rows).
- **AC 11: DW-235, a new game drops the previous game's count-up** (AD-7, AD-3).
  - **Given** `runRulesScript` from a mid-game state (ball 1 of 3, `bonus.byCategory.letters` 2, `ballsInPlay` 1). A drain at D arms steps at D+400… (`total > 0`); `s_slam_tilt` closes at D+100.
  - **When** Start is pressed at D+200.
  - **Then** no `bonus_count_step` has `tick ≥ D+200`. The identical script without the Start emits `bonus_count_step` at D+400, in the same test.
- **AC 12: tunables, the Match name, and goldens** (AD-15, AD-14).
  - **Given** the finished change.
  - **When** `resolveTuning()` runs, `test/host-game-seed.test.ts` reads `boot.ts`, and the goldens load.
  - **Then**:
    - the four entries resolve to the literals in task 3, with sources and confidence, listed in `scalarKeys`;
    - `DEFAULT_ADJUSTMENTS.matchProbability === 0.08` (literal);
    - `boot.ts`'s real `GameStart` reads `TUNING.matchProbability.value`;
    - production `matchDelayTicks` exceeds `BALL_ENDED_HOLD_TICKS`;
    - all five goldens differ from `a080bf8` only in seven new `gameStart.tuning` blocks and an appended `notes`, with no `StaleReplayHeaderError`.
- **AC 13: the new events are in the closed union** (AD-9).
- **AC 14: DW-257, a recovered ball returns to the trough** (AD-6 as amended today, AD-9, AD-18). Red first. Author decision 2026-09-11.
  - **Given** a headless machine at boot: `bd_trough` full (4 closed slot switches) and the asserted four-ball invariant.
  - **When** a ball is put outside every device and `recover()` runs, repeated four times over (more recoveries than the trough has slots), each time asserting the premise first (the ball really is outside every device, and `recovered` came back 1).
  - **Then** BOTH halves, in the same test:
    - *the negative* -- the trough never empties: after every recovery the machine still totals 4 balls (closed trough slots + simulated balls + balls parked elsewhere), and NO serve ever answers `eject_failed`. Red today: the count falls 4, 3, 2, 1 and the fifth serve fails.
    - *the positive* -- the recovered ball is really THERE and really USABLE: immediately after a recovery the trough's lowest empty slot has become a closed slot switch, and a `pulse c_trough_eject` then spawns a ball from it at the authored eject pose and speed and opens that switch. A recovery followed by an eject returns a playable ball, not a phantom slot count. Red today: there is no slot to eject from.
  - **And** `recover()`'s `recovered` return value still counts the balls it took out of the simulated set, so Story 2.12's `ball_missing { count }` and this story's stray-clear report (AC 8) are unchanged -- asserted by 2.12's existing ball-search tests staying green and by AC 5's `ball_missing { count: 1 }`.
  - **And** a ball resting on the plunger tip is still spared (2.12's AC 8 stays green), and a ball parked in `bd_lock` is still untouched (`c_mouth` is never pulsed, AD-18).
  - **Note** the count identity above is the anti-vacuity guard: asserting only "a slot closed" would pass on a machine that had invented a fifth ball.
  - **Given** `SemanticEvent` with `game_ended`, `match_drawn` and `match_reveal_step`.
  - **When** `describeEvent` executes one example of each in `test/contracts.test.ts`.
  - **Then** each returns its authored text, templating every payload field, and `pnpm typecheck` passes with the `never` tail intact.

## Spec Change Log

- **2026-09-11, lead (spec gate), author decision on DW-257 -- AC 14 added.** The author decided that `recover()` must RETURN recovered balls to the trough rather than destroy them. The plan had measured the consequence of destruction correctly (four recoveries exhaust the trough, then `eject_failed` and a hard hang) but recorded it as accepted; the hang is reachable by ordinary play, so the author fixed the cause. Added AC 14 and task 14; narrowed the `src/sim/physics/**` Block-If to sanction `devices.ts`'s `recover()` and nothing else; declared the footprint extension; narrowed the physics-diff verification command; added two Rule 19 mutations. The clean-up-the-strays decision behind ACs 5-8 is UNCHANGED. Spine: AD-6's "the one command that lets physics despawn every ball outside a device" amended to the trough return (consistent with AD-6's own four-ball invariant, so no new AD id); AD-9's issuer list already named both issuers and needed no further change.
- **2026-09-11, lead (spec gate), other amendments.** `epics.md` 2.13 AC 2 `matchPercent` (default 8) -> `matchProbability` (default 0.08, i.e. 8 %), and the same correction in spine AD-15's tunables list: the shipped contract is a fraction and no reader treats it as a percent, so the name was simply wrong and the odds are identical. `epics.md` 2.13 AC 1 now states the final-scores timing explicitly (the scores appear when the last ball's end-of-ball hold releases, not on the drain tick), because the literal reading would cut Story 2.10's shipped bonus count-up. Spine AD-5's "Tilt, game over and Attract disable all of them together" narrowed to an Attract entered from a game: the shipped machine boots every coil enabled and two goldens flip in the boot Attract, so the spine had been asserting something the goldens contradict. Spine AD-6 now records how the stray clear reports (`ball_missing` only when `count > 0`, never a serve) -- the detail AD-6 had left to this story, written where Story 3.7 will look for it.
- **2026-09-11, lead (spec gate), the six `LEAD CHECK` lines.** All six recommendations accepted as written, each for the reason the plan gave: `matchDelayMs` is kept (it is the game-over dwell the architecture reconciliation S-8 already required, and AC 12 pins its inequality against the 3 s hold, so it is not a free parameter); Start during the reveal stays ignored (epics AC 3's own Given is "Match has resolved"); the stray clear reports `ball_missing` only when `count > 0`; the 2x2 players grid and the shared fields line both stay (they are what makes four players plus a mode fit, which is DW-197's whole promise); the `START 1` / `PLUNGE ENTER` wording stays; and AC 1's final scores appear after the hold.

## Review Triage Log

### 2026-09-11 — Review pass
- verdicts: 15 findings — high 0, medium 6, low 5, false 4, maybe-false 0
- findings:
  - `[false]` `reject` Blind Hunter: the shared mode-fields status line (`buildFieldsText()`) has no independent length safeguard, unlike the mode-name segment beside it — refuted: the spec's own Design Notes ("The Backglass", "Fields line") state explicitly "The rasteriser's 21-character clamp is the only truncation," so the blanket `raster.ts` clamp is the documented, intended mechanism for this line, not an oversight. No mode publishes enough fields to overflow it today.
  - `[low]` `patch` Blind Hunter: the new bare `'START'` display literal (Attract keys row, `frame.ts`'s `ATTRACT_KEYS_ROW_SPECS`) was never added to `test/backglass-frame.test.ts`'s `DISPLAY_LITERALS` leak-audit, unlike every other new string this story introduced — verified: a bare `'START'` is a substring of `ball-controller.ts`'s `START_BUTTON` identifier, the exact collision `'MATCH '` already dodges for `MATCH_NUMBERS`. Fixed: added `"'START'"` (quote characters included) to `DISPLAY_LITERALS`, mirroring the `'MATCH '` precedent's own reasoning; confirmed against both the positive control and the sim/** leakage scan.
  - `[false]` `reject` Blind Hunter: `recover()`'s new "trough has no empty slot" throw has no test and could stop the whole sim loop — refuted: the spec's own task 14 explicitly mandates exactly this ("assert the invariant rather than build a path for its violation"); it is deliberate fail-fast design for a branch the spec itself calls unreachable while AD-6 holds, not an oversight. A future story that widens the invariant (locks/multiball) owns re-testing this branch then.
  - `[medium]` `patch` Blind Hunter: `buildGameOverRows()` (the whole new `game_over` screen) has no direct unit tests — only one narrow, single-player, winning-resolution path is exercised via `game-over-integration.test.ts`. Verified and grouped with the verification-gap layer's identical finding below (same root cause: the game-over screen's own Design-Notes-mandated "no emphasis" rule, and its pre-reveal/resolved-but-lost text states, were never exercised in a way that could distinguish correct from wrong behaviour). See the grouped fix under the verification-gap row below.
  - `[low]` `patch` Blind Hunter: `GameEndedEvent.scores` is documented as payload-complete ("a consumer never needs to join this to a later snapshot") but `buildGameOverRows()` re-reads `snapshot.game.players` live instead, and the reasoning the two are equivalent isn't written anywhere — verified real but minor. Fixed: added a doc-comment note on `GameEndedEvent` explaining why the live read is safe (scores cannot change after G) and that `scores` still serves as the durable contract Story 6.5's `highscore_entry` is specified to read.
  - `[medium]` `patch` Blind Hunter: `matchRevealTicks` is never validated positive; `ticksSinceMatch % matchRevealTicks` becomes `NaN` (never `=== 0`) if `matchRevealMs` resolves to 0, silently stopping every `match_reveal_step` from firing — verified REAL and reachable: the shipped dev tuning panel (`src/host/dev/tuning-panel.ts`, Story 1.9) accepts any finite, non-negative number including exactly 0 for any `TUNING` entry (`resolveTuning()` only rejects negative `…Ms` values, never zero), and hot-applies it to the running sim. Grouped with the edge-case-hunter's identical finding below; fixed with one guard clause.
  - `[false]` `reject` Blind Hunter: a same-tick collision between the stray-clear's own report and an unrelated ball-search recovery could route a genuine ball-search serve into the "silent, never serve" branch — refuted after tracing: during `pendingStrayClear`'s own 1-tick window a serve was JUST issued by `startBall()`, so suppressing a second serve is the CORRECT behaviour regardless of which mechanism produced the `recovered` count (a second serve there would violate AD-6's own "exactly one ball in play" invariant, the exact hazard DW-244 exists to close). `ball_missing` still fires with the correct count either way — nothing is swallowed.
  - `[medium]` `patch` Edge-Case Hunter: `matchDelayTicks <= 0` (`matchTick <= armTick`) would make `match_drawn` never fire at all — verified REAL and reachable via the same dev tuning panel path as the row above: the top-of-`step()` check for `tick === gameOverSequence.matchTick` runs earlier in the SAME tick the sequence is armed (before it exists), so an exactly-0 `matchDelayTicks` makes that check's one chance already missed, with no later tick ever equal to `matchTick` again. Fixed: `matchTick` now clamps `matchDelayTicks` to at least 1; production's authored value (5000) is unaffected.
  - `[medium]` `patch` Edge-Case Hunter: `matchRevealTicks` resolving to 0 makes the modulo check evaluate to `NaN` — same root cause and same fix as the Blind Hunter's `matchRevealTicks` row above (grouped). Fixed: guarded with `matchRevealTicks > 0 &&`.
  - `[low]` `reject` Edge-Case Hunter: the Attract scores line (`PLAYER n <score>`) could exceed the 21-column line width for a score >= 1,000,000,000 — real in principle, but `wontfix-theoretical`: this table's scoring (multiples of 5000 in this epic, and no foreseeable epic reaching ten-digit pinball scores) never realistically approaches this magnitude. Would become real only if a future story added scoring capable of reaching nine-plus-digit totals.
  - `[false]` `reject` Edge-Case Hunter: the fields line (mode-published fields joined on one row) has no independent overflow guard — same finding as the Blind Hunter's row above (grouped); refuted for the identical reason (the spec's own Design Notes name the rasteriser's blanket clamp as the sole, intended truncation for this line).
  - `[low]` `reject` Edge-Case Hunter: `formatScoreCell`'s own plain-digit fallback could itself exceed its documented 10-character cap for an 11+-digit score — real in principle, `wontfix-theoretical` for the identical reason as the Attract-scores row above (grouped root cause: no realistic path to a score anywhere near this magnitude in this table's scoring model).
  - `[low]` `patch` Edge-Case Hunter: `modeDisplayName()`'s own doc comment still says `buildModeRows()` reads its `undefined` return as "render nothing," but this story's diff deleted `buildModeRows()` (replaced by the new shared status/fields line) — verified: confirmed the function no longer exists in `frame.ts`. Fixed: comment now names `buildScoreRows()` and notes the Story 2.13 rename.
  - `[medium]` `patch` Verification Gap: the real production wiring of a genuine `ViewConfig` into `renderFrame()` (`src/host/boot.ts`, task 11: `viewConfigFromKeyMap()` built once, passed as `renderFrame`'s third argument) is exercised by no test or source-scan anywhere — verification-gap findings arrive pre-verified; confirmed the cited evidence (boot.ts is documented as untested-by-execution in `test/module-coverage.test.ts`'s own allowlist, and no other test scans this specific call). Fixed: added a source-scan test in `test/host-game-seed.test.ts`, mirroring that file's own existing regex pattern for the adjacent `matchProbability` literal; demonstrated it would catch the regression (reverting the wiring makes the new assertions fail while everything else stays green).
  - `[medium]` `patch` Verification Gap: the `game_over` screen's Design-Notes-mandated "no emphasis" rule (`buildPlayersRows(state.players, null)`, hardcoded) is only ever exercised by a single-player scenario (`game-over-integration.test.ts`), where `currentPlayer === 0` is indistinguishable from "always false" — verification-gap finding, pre-verified; demonstrated that reverting to `buildPlayersRows(state.players, state.currentPlayer)` (matching the score screen) passes every existing assertion. Fixed (grouped with the Blind Hunter's broader "no direct unit tests" row above): added a `test/backglass-frame.test.ts` describe block with a 4-player, non-zero-`currentPlayer` case asserting every row's `emphasis` is `false`, plus a pre-reveal (`heldMatch: null`) and a resolved-but-lost (bare two digits, no `MATCH` prefix) case.
- Intent-Alignment Auditor: purely descriptive per its own mandate (no itemized findings to triage). It corroborated the AC 5/AC 14 trough-count reconciliation this implementation pass already made (Auto Run Result, below) as internally consistent with the diff's own tests, characterizing it as a documented divergence between the I/O Matrix row's own event/outcome-level wording (silent on trough-slot counts) and AC 14's internal ball-inventory surface — not a defect.
- No `intent_gap` or `bad_spec` entries. All 7 `patch` groups applied in this pass; `pnpm typecheck`, the full `pnpm test` (126 files / 2057 tests, 0 failing, 0 skipped), `pnpm lint:boundaries`, `pnpm check:headers`, `pnpm check:attributions` and `pnpm check:ad7` (exactly 3) all re-verified green afterward, and the physics/forbidden-path diff scopes (`src/sim/physics/devices.ts` only, `recover()` only; `src/sim/loop`, `dragonwar.ts`, `public/assets`, `.github` all empty) re-confirmed unchanged.

## Design Notes

### Governing architecture decisions (Rule 6)

- **AD-3.**
  - Match draws from `GameState.rng`; no other randomness.
  - `matchDelayMs`, `matchRevealMs` and `attractMs` are authored in ms and converted once. The reveal drives presentation by step events; presentation never reports completion.
  - Match becomes `rng`'s second consumer, drawing at game end, after every lane draw of that game. Story 2.14's rotation keeps that order.
- **AD-4.** Commands land on the next tick. The stray `RecoverCommand` rides the same `recoverCommands` channel ball search uses (`rules/index.ts:343`), and its report comes back as the machine report on t+1. The loop is untouched.
- **AD-5.** Game over and an Attract entered from a game disable `HARDWARE_COILS`, and `c_autolaunch` stays live. Drift noted below.
- **AD-6, as amended today.** The stray-clearing clause and the invariant (exactly one ball in play after the serve) are this story's core. A ball on the plunger tip counts as inside `bd_shooter`: measured, and pinned by 2.12. `ballsInPlay`'s meaning is unchanged.
- **AD-7.** `GameState` is not widened. The game-over sequence and the pending stray clear join the closure-state class, meeting its bar: reproducible, bounded, reset-safe.
- **AD-9, as amended today.** `RecoverCommand` now has two issuers, ball search and the ball controller's serve path. `match_drawn { number, winners[] }` is exactly AD-9's own example. `game_ended` and `match_reveal_step` are payload-complete. Rules never format text.
- **AD-14.** `matchProbability` is a sim adjustment that applies at the next game. `ViewConfig { bindings }` passes from the host to presentation for Attract.
- **AD-15.** Four new tunables carry provenance, and the golden header budget is spent on them.
- **AD-16.** New files carry GPL-3.0 headers. No device-name literals appear. Key codes stay in `host/input`.
- **AD-18.** The ball controller alone pulses the trough, mutates `ballsInPlay` and issues the stray recover. No `c_mouth` pulse.
- **AD-19.** Start arrives as `button_pressed`, and no new device vocabulary is added.
- **Also relevant:**
  - **AD-1:** the layer arrows. `ViewConfig` lives in presentation, and the host imports it (host → presentation).
  - **AD-8:** the minimal mode stack; `modes: []` in Attract.

**No AC contradicts any AD's Rule.**

### AD drift at the seams this story touches (named, not silently followed)

- **AD-5, "Tilt, game over and Attract disable all of them together."**
  - The shipped machine boots every coil enabled (`machine.ts:265-272`), so the **boot** Attract has live flippers, slings and pops.
  - The `hold-and-release` and `roll-and-drain` goldens flip in that Attract, so changing it would move golden trajectories, which is a Block-If.
  - This story makes the Rule true for every Attract entered from a game, at game over, on the Attract transition and after a Slam, and leaves boot unchanged.
  - LEAD: record this under AD-5 (Rule 20 light path), or accept it as known drift.
- **AD-15's tunables list names `matchPercent`.** The shipped name is `matchProbability` (see below). LEAD: apply-and-report amendment.
- **AD-6** left the stray recover's reporting and ordering to this story. They are specified here: `ball_missing` only when `count > 0`; never a serve; one tick after the start; physics' recover runs before the same step's serve. LEAD: a Rule 20 note under AD-6 would put the rule where Story 3.7 will look for it.
- **AD-7's inventory note** on `pendingBonusCountSteps`, "no `ball_will_start` reset needed", stays true: DW-235's reset is at new-game creation, not at `ball_will_start`. `gameOverSequence` and `pendingStrayClear` join the class. The AD says to re-derive the inventory, so no list edit is owed.
- **AD-4's** sequence diagram still draws the three-argument `rules.step`. That is harmless and untouched.
- **AD-18's** "Lock arbiter in `sim/rules/ball-controller/`" names a directory where the shipped code is a file. That is Structural Seed drift and irrelevant here.
- **AD-19:** none found.

### `matchPercent` against `matchProbability`: `matchProbability` ships

The planning text says `matchPercent` (default 8): epics AC 2 and AD-15's tunables list. The shipped contract is `GameAdjustments.matchProbability`, a fraction:
- 0.08 in `DEFAULT_ADJUSTMENTS` and in `boot.ts:285`'s real `GameStart`;
- 0 in the dev recorder and all five golden headers.

AD-14 and PRD FR-22 both say "Match probability". This story keeps `matchProbability` everywhere:
- it adds `TUNING.matchProbability` (0.08, the table default with provenance, AD-15), following the `tiltWarnings` precedent (DW-36);
- `DEFAULT_ADJUSTMENTS` and `boot.ts`'s real `GameStart` both read it.

Renaming instead would change the `GameAdjustments` contract, five golden headers' `gameStart.adjustments`, `boot.ts` twice and `test/host-game-seed.test.ts`, and add a `/100` at the one reader, all for no change in behaviour.

**Owed amendment (Rule 5, apply-and-report tier: "correcting a wrong … name the AC cites"; the lead applies it; build-auto cannot):**
- `epics.md` Story 2.13 AC 2: "`matchPercent` (default 8)" → "`matchProbability` (default 0.08, i.e. 8 %)".
- `ARCHITECTURE-SPINE.md` AD-15: the list item `matchPercent` → `matchProbability` (Rule 20).

This matches the resolution the epic context asked for.

### Tunables (sources and confidence)

- **`matchProbability: 0.08`.** Source: "PRD FR-22: 'probability is a Setting defaulting to 8%' (chosen deliberately 2026-08-27; conventional, not sourced; the research marks it unverified). The table default `GameAdjustments.matchProbability` reads (AD-14, the `tiltWarnings` precedent)." Confidence `'unverified'`, per reconcile-research N-3.
- **`matchDelayMs: 5000`.** Source: "authored: AD-3 names the game-over scores and the Match reveal as display-paced sequences (reconcile-prd S-8); no artifact states a duration. It must exceed the Backglass's 3000 ms `ball_ended` hold, so the last ball's end-of-ball screen and bonus count-up are never cut and the final scores show for 2 s before the Match." Confidence `'unverified'`. The inequality is pinned by AC 12.
- **`matchRevealMs: 250`.** Source: "authored: no artifact states a pace; ten reveal steps (one per multiple of ten) × 250 ms = 2.5 s." Confidence `'unverified'`.
- **`attractMs: 8000`.** Source: "authored: epics AC 3 names attractMs, not a duration; long enough to read four final scores and the Match result, short enough that an idle machine returns to Attract promptly." Confidence `'unverified'`.

LEAD CHECK: `matchDelayMs` is a tunable no AC names. Without it, rules would have to start the Match before the presentation's 3 s end-of-ball hold ends. Either the reveal would be hidden behind the last ball's screen, or the last ball's bonus count-up (2.10's AC 2) would have to be cut. Recommendation: keep it. It is the "game-over scores" dwell the architecture reconciliation (S-8) already said someone must own.

### The rules timeline

**Production sequence** (1 tick = 1 ms):
- G: `ball_ended`, `game_ended`, `game_over`.
- G+400…: the last ball's count-up (2.10, unchanged).
- M = G+5000: `match_drawn`.
- G+5250…G+7500: ten reveal steps; R = G+7500 resolves the Match.
- R+8000 = G+15500: Attract.

**Start.**
- Start in `game_over` is ignored before R and starts a game from R. The AC's Given is "Match has resolved".
- LEAD CHECK: a Start during the 2.5 s reveal is ignored. Recommendation: keep it. The Match finishes, and it keeps DW-254 theoretical: R is past the last ball's hold, so a new game can never inherit a live `ball_ended` hold. Honouring Start during the reveal (abandoning it) is the alternative.

**The draw reads `players[i].score` at M.** Scores cannot change after G, because the last ball paid its bonus at G. Winners are computed from `score mod 100`.

**Epic 2 consequence.** Every score ends in 00, so W = {00}. A Match either pays every player together (probability `p`) or pays none. Epic 3's scoring freeze (Story 3.11) changes this only if it adds values that are not multiples of 100.

**If no player's last two digits are a multiple of ten**, a match is impossible, and the draw is uniform with `winners: []` (I/O row *Weighted draw*).

**Why one draw.** `v < p` decides win or loss, and the rest of `v` picks within the chosen set. So P(match) = p exactly, and `rng` advances once per game.

### The stray clear: reporting and ordering

**The ordering (measured, not reasoned).** At t, `startBall` issues the recover and, if the lane is empty, the serve. At t+1:
1. physics runs `recover()` before `applyCommands()`, so the loose ball goes and the new ball spawns inside `s_shooter_lane`'s zone. The recover spares it (2.12's AC 8, and probe D);
2. the same step reports `recovered` together with the paired `device_ball_left bd_trough` / `device_ball_entered bd_shooter`;
3. rules apply `applyRecovery` (`ballsInPlay` 0), then `applyDeviceEvents` (the paired arrival changes nothing, per DW-187), then `deriveDeviceSlots` (lane `[true]`);
4. only then does the ball controller answer the report.

So even branch (a) would not double-serve in the normal case. The hazard is branch (a) itself:
- it emits `ball_missing { count: 0 }` at every ball start, a spurious event in every game's stream;
- it re-serves whenever the lane reads empty at t+1 (a failed serve).

The stray clear therefore gets its own branch: count > 0 → `ball_missing`, count 0 → nothing, and never a serve.

**Reporting.** `ball_missing` means "this many balls were outside every device and were removed". A loose voided ball at a serve is exactly that, so the event vocabulary needs no new member. A normal ball start (count 0) emits nothing, so no existing game's event stream changes.

LEAD CHECK: `ball_missing { count }` for a stray clear, emitted only when count > 0. Recommendation: keep it. No new union member, and an Epic 4 "ball missing" cue fits a stray removal. The alternative is a new `strays_cleared` event.

**Zeroing `ballsInPlay` at a new game.** Probe A measured the stale 1 on the Start tick. Zeroing makes AD-6's invariant true on the Start tick itself. The t+1 `applyRecovery` would repeat it. Ball search's spurious one-tick origin is harmless either way, because a pass is re-created at the real `ball_launched`, but the snapshot on the Start tick must not claim a ball in play.

**The drain guard on the Start tick.** A voided ball entering the trough on the exact tick Start creates the game would otherwise end the new ball 1, through the parking entry at `ballsInPlay` 0. That is a one-tick window, unreachable later because the t+1 recover removes a loose ball before physics steps.

**Couplings, recorded, not decided:**
- **DW-257 (DECIDED by the author 2026-09-11, at this spec gate; now this story's AC 14).** The plan was right that the stray clear is a second way a ball leaves the machine for good, and right that four Starts after a Slam exhaust the trough into `eject_failed` and a hang. It was wrong to accept it: the hang is reachable by ordinary play (Slam, then Start before the old ball drains, four times), and it would have shipped. The author's answer is to fix the cause rather than guard the symptom: **`recover()` returns recovered balls to the trough** (AD-6 amended, and AD-9's issuer list already names both issuers). The clean-up-the-strays decision is unchanged. AD-6's four-ball invariant now holds across any number of recoveries, and because ball search and this story's serve path share the one `recover()`, ball search's hang closes with it. Rejected: keep the destroy plus a no-hang guard (balls still lost, machine degrades 4 -> 3 -> 2); recover only on ball search and refuse Start while a ball is loose (loses the half of DW-244 that handles the slam-voided loose ball); defer and ship the hang.
- **DW-230** is not made reachable: `startBall` resets `awaitingSaveLaunch`, and a reuse serve pulses nothing.
- **DW-263 and DW-268** are unaffected: no ball is launched at a ball start, and the only lane ball is resting.
- **DW-254** stays theoretical, as above.

### The Backglass

**Players block.** Used by the score and `game_over` screens; positional, like a real panel.
- P ≤ 2: one score per line (col 2, rows 0/8).
- P ≥ 3: a 2×2 grid. Player i is at row ⌊i/2⌋·8 and col 2 (even i) or 66 (odd i).
- Each cell is at most 10 characters. `formatScore`, else plain digits.
- `blockLines` is P, or 2 when P ≥ 3.

**Status line** at row `blockLines·8`.
- The score screen: the top mode's authored name at col 2, truncated to 21 − |BALL text| − 1 characters (none for base, per DW-200), and `BALL n` right-aligned at col `128 − 2 − (6·len − 1)`.
- The `game_over` screen: `GAME OVER` at col 2, and right-aligned nothing, then `shown` as two digits, then `MATCH nn` if `winners` is non-empty at resolution.

**Fields line** at row `(blockLines+1)·8`. Only for a named top mode with at least one field. The published fields' display values are joined with two spaces, in the order `timerTicks` (seconds, one decimal), `value`, `charge`, `strikesRemaining`. The rasteriser's 21-character clamp is the only truncation. So at any P ≤ 4, every score, the ball number, the mode name and the fields are visible: DW-197's "silently drops" is gone, and 2.6's AC 5 ("the name and any … it publishes") holds on one line.

LEAD CHECK: two layout calls within the author's "shared or shortened line":
- the 2×2 grid for 3–4 players, whose cells are positional and unlabelled like a real panel, with the current player's cell inverted;
- the mode's fields share one line.

Recommendation: keep both. Four labelled rows would leave no line for BALL, the mode, `GAME OVER` or the Match.

**Emphasis** (`raster.ts`) is inverse video over the row's own text box. It identifies the current player on a 1-bit panel, the "highlighted" of the author's "highlighted or boxed". The box's right column is the glyph gutter, and its left column is col−1. In every layout here, box columns never overlap another row's text.

**Attract.**
- From each fresh Attract entry (origin E): `attract_keys` for 3000 ticks (a presentation constant beside the Attract holds), then the existing prompt/scores cycle measured from E+3000.
- Keys rows: `L FLIP`, `R FLIP`, `PLUNGE`, `START`, each followed by `keyLabel(code)` for the action's codes. `keyLabel(code)`:
  - splits the `KeyboardEvent.code` at lower→upper and letter↔digit boundaries;
  - drops a leading `Key` or `Digit` word when it is followed by one character;
  - uppercases, drops characters the font lacks, and joins with spaces.
  - Examples: `ShiftLeft` → `SHIFT LEFT`, `Digit1` → `1`, `KeyZ` → `Z`, `Enter` → `ENTER`.
- `keyLabel` is a formatting rule over the W3C code vocabulary, not a key→action map. Key codes exist only in `host/input`'s `KEY_MAP` and in the data it hands over, which keeps Story 6.4's "the key→action map is the only place key codes exist".
- The scores screen reads `PLAYER n score`.
- LEAD CHECK: `START 1` / `PLUNGE ENTER` wording. Recommendation: keep it.

**`advanceBackglass` order.**
1. `ball_ended` arming (unchanged; sets `heldMatch: null`).
2. The live hold (unchanged, plus folding this frame's `match_drawn` and `match_reveal_step` into `heldMatch`, so a retuned lead-in could never lose them).
3. TILT, WARNING and the warning hold (unchanged, `game`-gated).
4. **New:** `phase === 'game_over'` gives the `game_over` screen, folding match events into `heldMatch { number, winners, shown, resolved }`.
5. Attract (with the keys segment; `isAttractScreen` includes `attract_keys`).
6. The score screen.

Every non-`game_over`, non-hold branch returns `heldMatch: null`. The last ball's hold therefore still shows first (2.10 kept), and the final scores follow from G+3000.

LEAD CHECK: AC 1's "When phase becomes game_over, Then the Backglass shows final scores". The final scores appear when the last ball's 3 s end-of-ball hold releases, not on G itself, so 2.10's count-up is not cut. Recommendation: keep it.

**DW-236, DW-237 and DW-251** (the end-of-ball screen) are untouched: that screen is neither changed nor cut.

### Ledger entries (Rule 17 inbox)

- **DW-197:** addressed by AC 9, tasks 10 and 12, and the I/O rows *Score screen …*, *Base only* and *Grid overflow*.
- **DW-198:** addressed by AC 10 and AC 4 (Attract labels), tasks 9, 10 and 12, and the I/O rows *Emphasis* and *Attract scores*. The author's Rule 19 condition is AC 10's first clause and its mutation.
- **DW-235:** addressed by AC 11, task 5(b), and the I/O row *DW-235*.
- **DW-244:** addressed by ACs 5, 6, 7 and 8, tasks 1 and 5(b)–(d), and the I/O rows *Stray …*.

No entry is declined.

### Consumes, Consumed-by, Integration ACs (Rules 1, 2)

**Consumes:**
- Story 2.5: Start, Hot seat, `startBall`, the drain and game over.
- Story 2.6: the fold, render and raster pipeline.
- Story 2.7: `MODE_DISPLAY_NAMES` and the skill shot's `rng` draw.
- Story 2.9: the save flags `startBall` resets.
- Story 2.10: `pendingBonusCountSteps` and the 3 s hold it fits.
- Story 2.11: the Slam write and the disable batch.
- Story 2.12: `RecoverCommand`, the machine report, `applyRecovery`, `recover()` sparing `bd_shooter`, the search's phase gate, and the cup instrument.
- Story 1.7: `KEY_MAP`.
- AD-14's `GameStart.adjustments`.

**Produced here, and consumed here** (introduced shared components):
- `match.ts`: its consumer is the ball controller. Integration AC 2: `match_drawn` and the steps in a real loop's `FrameOutput`.
- `enterAttract`: its consumers are the ball controller's Attract transition (AC 3) and `tilt.ts`'s Slam (2.11's tests, green unchanged).
- `ViewConfig`: produced by `host/input`'s `viewConfigFromKeyMap`, consumed by `renderFrame`. Integration AC 4, over real instances.
- The three events: their consumer is the Backglass fold (ACs 1 and 2, real loop).

**Consumed-by:**
- **Story 6.4:** replaces the static map with persisted bindings, and "once per cycle".
- **Story 6.5:** inserts `highscore_entry` after game over and reads `game_ended.scores`.
- **Epic 4:** Match flashers and audio on `match_drawn` / `match_reveal_step`, and the walk-up into the Attract sequence.
- **Story 2.14:** `rng` order, with the lane first and the Match last.
- **Story 3.7:** the stray clear at a ball start after a multiball drain, and DW-268's question.
- **Story 3.2:** a ball parked in `bd_lock` is outside the simulation, so the stray recover never touches it.

### Footprint (Rule 11)

- **In the epic footprint:** `src/sim/rules/{ball-controller,tilt,index,match}.ts`, `src/sim/table/tuning.ts`, `src/presentation/backglass/{frame,raster,view-config}.ts`.
- **Established extensions** (listed as required): `src/sim/contracts/events.ts`, `src/host/input/index.ts`, `src/host/boot.ts`.
- **Tests:** `test/**`, including the five `test/replays/*.golden.json`, which change header-only.
- **Footprint extension, declared (Rule 11 (b); no contended epic owns it -- Epic 2 is the only epic running):** `src/sim/physics/devices.ts`, `recover()` only, for AC 14 (author decision, DW-257). The lead reports this path under `footprint_extensions:` in the completion contract.
- **Nothing else** is edited: not `src/sim/loop/**`, the rest of `src/sim/physics/**`, `src/sim/table/dragonwar.ts`, `public/assets/**` or `.github/**`.
- No third-party file is added. The key labels are formatted from the existing `FONT_5X7`, so no font is added.

### Anti-vacuity plan, by named shape

- **A negative with no positive.** Every "no stacking", "no misattributed drain", "no serve", "no `ball_missing`", "no Attract", "keys never recur" and "no step" negative has its positive in the same test (ACs 3–8, 10, 11).
- **A check that never ran.** Each route test asserts its premise from `FrameOutput`: the Slam arrived, the ball is loose or resting, and the counts. AC 1 and AC 2 assert that `ball_ended` arrived.
- **A value comparison posing as a reference check.** None is planned. The `ballsInPlay`/`players` checks are by value, and say so.
- **An expectation taken from the code under test.** Coordinates, ticks (G+5000…), the `shown` sequence, the key rows, 0.08, the 4σ tolerance, and the grid columns are all authored literals. Nothing is re-imported from `tuning.ts` or `frame.ts` constants.
- **A clause never asserted.** Each AC clause above maps to an assertion. The I/O rows without a dedicated AC (*Restarted timeline*, *No ViewConfig*, *Grid overflow*, the *Weighted draw* clamps) have unit tests in task 12.
- **Traps.**
  - `toPhysics()` negates y.
  - `NullEngine` rasterises nothing, so the dot buffer from `rasterise()` is the honest headless observable.
  - No flipper or plunger is rendered (DW-249).
  - Tilt warnings carry across balls.
  - Colourised output scraping fails on Windows. Use the JSON reporter for nested runs (DW-107).

## Verification

**Commands.** In every shell, first run `export BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"`. A result of `0 skipped` is the proof that it was exported.
- `pnpm typecheck`: exits 0 across all three tsconfigs. The `renderFrame` and `describeEvent` `never` arms force the new screens and events.
- `pnpm test`: 0 failing and **0 skipped**. Measure the baseline at your own tree first, and account for the delta: the new files and the amended cases listed in the Code Map.
- `pnpm lint:boundaries`: `OK`, with N+2 files, for `match.ts` and `view-config.ts`.
- `pnpm check:headers` and `pnpm check:attributions`: exit 0.
- `pnpm check:ad7`: exits 0 with **exactly 3** passing tests.
- `pnpm check:corridor` and `pnpm check:reachability`: exit 0.
- These must be empty: `git diff --stat -- src/sim/loop src/sim/table/dragonwar.ts public/assets .github`.
- `git diff --stat -- src/sim/physics` must show **exactly one file**, `src/sim/physics/devices.ts`, and `git diff -- src/sim/physics/devices.ts` must touch only `recover()` (AC 14, the sanctioned edit). Any other physics file, or any other function in `devices.ts`, is the Block-If.
- `git ls-files --others --exclude-standard`: only the new test and source files. No harness.

**Manual checks:**
- **Structural golden comparison (authoritative).** Parse each golden at `a080bf83653bf034a527311ec350ca9a78c51c3e` and at HEAD, and compare field by field:
  - `header.gameStart.tuning` gains exactly the seven blocks named in task 13, in `resolveTuning()` order;
  - `notes` is a strict append;
  - every other field is deeply equal, `header.tableHash` `e22fbdcf` and `header.assetHash` `ab163ff` included; for `roll-and-drain` that explicitly includes its two `expectedCheckpointHashes`.
  - **Trap, measured at this gate -- the obvious probe for "no golden presses Start" is vacuous.** `start` is nested at `transitions[i].frame.start`, NOT at `transitions[i].start`. A check written against the top-level path reads `undefined` for every frame in every golden and "confirms" the claim without testing it -- exactly this epic's recurring vacuity shape. Read the nested path. Verified there at this gate: `frame.start` is `true` in zero frames across all five.
  - **The decisive fact is stronger than "no Start", and is the one to assert:** `finalRng` is `0` in all five goldens -- `GameState.rng` never advances in any golden at all, not even from the existing skill-shot consumer, because no golden ever leaves `phase: 'attract'` (they serve via `coilPrologue`, bypassing `startBall`). `rng` IS inside the hashed `GameState` (`contracts/state.ts:166`, hashed by `replay.ts:115-122`), so a reachable stray draw WOULD move `expectedHash` and `expectedGameStateHash`. Match cannot move a golden because the draw is unreachable, not because `rng` is unhashed. Assert `finalRng === 0` per golden, and the 52/52 `replay-goldens` baseline.
  - Tuning key count is a cheap independent check: `header.gameStart.tuning` goes from **57** top-level keys to **64** (measured at this gate). `resolveTuning()` derives a `…Ticks` only for top-level `…Ms` keys, and `matchProbability` is not one, so four new tunables give three new tick keys = seven new blocks.
- `HARDWARE_COILS` is unchanged, with 7 coils.
- Re-read these comments; each must describe the new behaviour:
  - `ball-controller.ts:3-8` and the Start comment;
  - `tilt.ts:127-137`;
  - `rules/index.ts:206-215`;
  - `frame.ts`'s `DmdRow`, `DmdScreen` and `advanceBackglass` docs;
  - `raster.ts`'s header.
- **Browser smoke (the lead's)** at a 1280×900 viewport:
  - boot shows the keys screen for about 3 s, then PRESS START;
  - Start pressed twice (two players) shows the current player's score inverted;
  - play to game over: the last ball's bonus screen, then the final scores with GAME OVER, the reveal cycling on the status line, then Attract with the keys and the labelled scores;
  - DW-244: plunge, give three fast nudges (a Slam), then Start. Exactly one ball appears in the lane.

**Rule 19 mutations: at least one pinning mutation per AC.** State the expected red before each run. Revert from a saved copy, never with `git checkout --` or `git stash`, and confirm `git status --short` and `git diff --stat` are unchanged afterwards.

| AC | Mutation | Expected red |
| --- | --- | --- |
| AC 1 | Do not push `game_ended` | The G event list |
| AC 1 | Map `game_over` to the score screen | The `'game_over'`-from-G+3000 assertion |
| AC 2 | `matchNumberFor` ignores `p` (uniform) | The win fraction (~0.10, outside 0.08 ± 0.0035) |
| AC 2 | `v <= p` wins | The on-the-bound case |
| AC 2 | Render `heldMatch.number` before any step | The "no number through G+5249" assertion |
| AC 2 | Never show `MATCH` | Run W's status text, and the W/L band difference |
| AC 2 | Set `matchRevealMs` to 1 | The literal step ticks |
| AC 3 | Honour Start in `game_over` before R | The R−5 negative |
| AC 3 | Keep the Attract transition after a new game | "Still `'game'` at R+8000" |
| AC 3 | `>` instead of `>=` for `attractTick` | "Attract at R+8000" |
| AC 4 | Render the keys rows from a hard-coded default | The `KeyZ` case |
| AC 4 | Show keys at every cycle | "Never recurs within the stay" |
| AC 5 | Omit the stray `RecoverCommand` from `startBall` | Two balls at T+1; no `ball_missing` (the red today) |
| AC 5 | Omit the new-game `ballsInPlay: 0` | `ballsInPlay` 1 at T |
| AC 6 | Drop the lane-occupied check in `startBall` | Trough 3→2 and two balls (the red today) |
| AC 7 | Drop the lane-occupied check in `startBall` | Trough 3→2 at the start tick+1 (the red today) |
| AC 8 | Route the stray report through branch (a) | (ii) emits `ball_missing { count: 0 }`; (iii) pulses at t+1 |
| AC 8 | Remove the Start-tick drain guard | (vi) `ball_ended` at t |
| AC 9 | Put BALL on its own line (today's layout) | The status-line coordinates; the 4-player bands |
| AC 9 | Remove the 2×2 grid | The 4-player frame's rows and bands |
| AC 10 | **Render with emphasis forced false** (the author's named mutation) | The dots-differ assertion and the line-1 box |
| AC 10 | Drop the `PLAYER n` label | The Attract rows |
| AC 11 | Remove the `pendingBonusCountSteps` clear at a new game | A step at D+400 in the Start run (the red today) |
| AD-7 (I/O Matrix "Restarted timeline") | Remove the `armTick` reset-safety guard (`gameOverSequence !== null && tick < gameOverSequence.armTick`) in `ball-controller.ts`'s `step()` | `test/rules-match.test.ts`'s "reset-safety -- I/O Matrix 'Restarted timeline'" test: Start on the restarted low-tick timeline is refused (`phase` stays `'game_over'` instead of becoming `'game'`), because the stale sequence's own `resolvedTick` (~22520) is never reached. Observed red 2026-09-11, reverted; tree confirmed byte-identical after revert |
| AC 12 | Revert one golden's `gameStart.tuning` | `StaleReplayHeaderError` on exactly that golden |
| AC 12 | Set `matchDelayMs` to 2000 | The hold inequality |
| AC 12 | Remove `attractMs` from `scalarKeys` | The ratchet |
| AC 13 | Template a wrong field in one new arm | Its executing assertion |
| AC 14 | Revert `recover()` to `removeBall` only (today's code) | The negative: the machine's four-ball total falls to 3 on the first recovery, and the fifth serve answers `eject_failed` |
| AC 14 | Close the trough slot switch WITHOUT parking a ball into it | The positive: `pulse c_trough_eject` spawns nothing, and the four-ball count identity breaks (a phantom slot) |

## Auto Run Result

Status: done
Blocking condition: none

### Implement + review record, 2026-09-11 (build-auto)

**Where it ran.** Verified working directory `C:/git/dragonwar/.worktrees/epic-2`, branch `DW-1-epic2`, exactly matching `git rev-parse --show-toplevel`. `baseline_revision` captured as `a588a667e5d44a521ddc8e8e036eb120e11bf26f` (HEAD at dispatch). One implementation-handoff subagent was launched synchronously per step-03 and returned once with a full report; four review-layer subagents (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) were launched together in one turn per step-04 and each returned once. No subagent committed, pushed, or used `SendMessage`; all edits after the handoff subagent's return (the Matrix Test Audit gap-fill and the seven review patches) were applied directly by this stage agent, per Rule 18's containment override (the step-03 handoff subagent can never be re-engaged).

**Summary of implemented change.** All 14 ACs landed: `game_ended`/Match draw/reveal/resolution timeline on the ball controller's closure state (`gameOverSequence`); Attract entry unified behind an exported `enterAttract()` helper, reused by the Slam path; DW-244's stray clear (`RecoverCommand` on every ball start, no trough pulse into an occupied lane, a one-tick-later silent-unless-`count>0` report); DW-235's bonus-schedule clear on a new game; DW-197/198's Backglass rework (shared status line, 2x2 grid, rendered emphasis, labelled Attract scores, a `ViewConfig`-driven keys screen, a new `game_over` screen); and AC 14/DW-257's sanctioned physics edit — `recover()` parks a removed ball into `bd_trough` instead of destroying it.

**Files changed** (full diff at `a588a66`..working tree; `git diff --stat` and `git ls-files --others` both re-verified against this list):
- `src/sim/rules/match.ts` (new) — the pure Match draw/reveal functions (`drawMatch`, `matchNumberFor`, `revealShown`, `MATCH_NUMBERS`).
- `src/sim/rules/ball-controller.ts` — `enterAttract()`, the game-over sequence, DW-244's stray clear, DW-235's clear-on-new-game, the Start-tick drain guard.
- `src/sim/rules/tilt.ts` — the Slam now calls the shared `enterAttract()`.
- `src/sim/rules/index.ts` — `DEFAULT_ADJUSTMENTS.matchProbability` reads `TUNING.matchProbability.value`.
- `src/sim/table/tuning.ts` — four new tunables (`matchProbability`, `matchDelayMs`, `matchRevealMs`, `attractMs`).
- `src/sim/contracts/events.ts` — `GameEndedEvent`, `MatchDrawnEvent`, `MatchRevealStepEvent` added to the closed union.
- `src/presentation/backglass/frame.ts`, `raster.ts`, `view-config.ts` (new) — DW-197/198's rework, the `attract_keys`/`game_over` screens, rendered emphasis.
- `src/host/input/index.ts` — `viewConfigFromKeyMap()`. `src/host/boot.ts` — wires it into `renderFrame`; the real `GameStart` reads `TUNING.matchProbability.value`.
- `src/sim/physics/devices.ts` — the ONE sanctioned edit, `recover()` only (AC 14/DW-257), confirmed by `git diff --stat -- src/sim/physics` (one file) and `git diff -- src/sim/physics/devices.ts` (one function).
- Tests: `test/rules-match.test.ts`, `test/rules-stray-clear.test.ts`, `test/stray-clear-integration.test.ts`, `test/game-over-integration.test.ts`, `test/physics-recover-trough.test.ts` (all new); `test/backglass-frame.test.ts`, `test/backglass-raster.test.ts`, `test/contracts.test.ts`, `test/host-input.test.ts`, `test/host-game-seed.test.ts`, `test/tuning.test.ts`, `test/rules-devices-headless.test.ts`, `test/ball-search-integration.test.ts` (all amended).
- `test/replays/{roll-and-drain,hold-and-release,full-plunge,nudge-coupling,two-ball-collision}.golden.json` — header-only refresh (seven new `gameStart.tuning` blocks, an appended `notes`), verified field-by-field by JSON parse against `a080bf8`.

**A noted, resolved interaction (AC 5 vs AC 14).** AC 5's own literal text ("at T+1 the trough drops 3→2") was authored before AC 14/DW-257 was added at the same spec gate, and is mathematically superseded by it: `recover()` now parks the loose ball into the trough's one open slot in the SAME tick the paired eject pulls a ball from the trough, netting the trough at 3 (unchanged) rather than 2. Verified by hand-deriving the tick-level mechanics against the Design Notes' own measured ordering ("physics runs `recover()` before `applyCommands()`") and confirmed by the intent-alignment auditor independently. The implementation subagent's own resolution (favouring AC 14, the later and more specific author decision, over AC 5's now-superseded literal) is accepted as-is — the underlying behaviour (no stacking, ball supply conserved, correct serve) is unchanged and is what both ACs actually care about. `test/stray-clear-integration.test.ts` and the pre-existing `test/ball-search-integration.test.ts` assertion both state their amended expectation explicitly, per the spec's own "an amended test states its new expectation" rule.

**Matrix Test Audit.** Every I/O & Edge-Case Matrix row was traced to a covering, passing test, with one gap found and closed in this pass: the "Restarted timeline" row (a game-over mark from a later tick than the current one is discarded, AD-7) had no test anywhere, despite the spec's own Anti-vacuity plan naming it as covered "in task 12." Added `test/rules-match.test.ts`'s reset-safety describe block, driving `createRules()` directly across two out-of-order `.step()` calls on one instance (the only way to exercise the branch, mirroring `test/rules-tilt.test.ts`'s own precedent for the identical shape). Rule 19 mutation applied and reverted: removing the `armTick` guard reddened the new test's own positive assertion (Start on the restarted timeline refused instead of succeeding); reverted, tree confirmed byte-identical. The `mutation:` line was added to `## Verification`'s table.

**Review findings breakdown** (full detail in `## Review Triage Log` above): 15 findings across four review layers, 0 high, 6 medium, 5 low, 4 false, 0 maybe-false. All 6 medium and 3 of the 5 low findings were real and patched in this pass (7 patch groups after de-duplication): the `'START'` display-literal leak-audit gap; the `game_over` screen's untested "no emphasis" rule (grouped, two layers); a documentation note on `GameEndedEvent.scores`; `matchRevealTicks`/`matchDelayTicks` zero-value guards (two dev-tuning-panel-reachable edge cases, grouped across two layers into two separate one-line clamps); a stale `buildModeRows()` doc-comment reference; and a source-scan test for `boot.ts`'s real `ViewConfig` wiring. The remaining 2 low findings were rejected `wontfix-theoretical` (score-magnitude overflow paths requiring a nine-plus-digit pinball score, unreachable under this or any foreseeable epic's scoring model). 4 findings were verified `false` and refuted with evidence (the fields-line truncation and the trough-throw findings both match the spec's own explicit design intent; the same-tick stray-clear/ball-search collision was traced and shown to be correct behaviour, not a bug). No `intent_gap` or `bad_spec` entries; no items deferred to spec frontmatter.

**Follow-up review recommendation: `true`.** Two or more medium-verdict entries were patched in this first pass (6). Named unverified risk: three independent review layers converged on the same underlying class of defect (a newly-added `…Ms` tunable resolving to exactly 0, reachable only via the shipped dev tuning panel, silently breaking this story's new timing arithmetic) from different angles, and two concrete instances were found and fixed (`matchDelayTicks`, `matchRevealTicks`); a third instance of the same shape elsewhere in this story's new arithmetic (e.g. `attractTicks`, traced and found harmless in this pass, but not swept as exhaustively as the two fixed ones) has not been independently re-verified by a fresh reviewer.

**Verification performed** (all commands re-run after the review-pass patches, in this exact tree):
- `pnpm typecheck`: exit 0 across all three tsconfigs.
- `pnpm test`: 126 files / 2057 tests, 0 failing, **0 skipped** (BLENDER exported in every shell; the export-py-skip-visibility self-check confirms 0 expected skips on this platform).
- `pnpm lint:boundaries`: OK, 110 files.
- `pnpm check:headers`, `pnpm check:attributions`: exit 0.
- `pnpm check:ad7`: exactly 3 passing tests.
- `pnpm check:corridor`, `pnpm check:reachability`: exit 0 (re-confirmed once, unaffected by the review-pass patches).
- `git diff --stat -- src/sim/loop src/sim/table/dragonwar.ts public/assets .github`: empty.
- `git diff --stat -- src/sim/physics`: exactly `src/sim/physics/devices.ts`; `git diff -- src/sim/physics/devices.ts` touches only `recover()`.
- Goldens: structural, per-field JSON-parse comparison against `a080bf8` for all five (own scratchpad harness, never committed) — `header.gameStart.tuning` gains exactly the seven named blocks (57→64 keys) and `notes` is a strict append; `header.tableHash` (`e22fbdcf`) and `header.assetHash` (`ab163ff`) unchanged in all five; `roll-and-drain`'s `expectedCheckpointHashes` unchanged; no `transitions[i].frame.start` is `true` anywhere; `finalRng === 0` for all five (verified by an actual `runReplay()` run per golden, via a temporary in-repo harness, removed after use) plus the pre-existing `test/replay-goldens.test.ts` 52/52 baseline.
- Re-read comments: `ball-controller.ts:3-8`/the Start comment, `tilt.ts:127-137`, `rules/index.ts:206-215`, `frame.ts`'s `DmdRow`/`DmdScreen`/`advanceBackglass` docs, and `raster.ts`'s header all describe the new behaviour.
- Manual browser smoke: not performed (requires a live browser; the spec notes this is the lead's own step).

**Residual risks.** (1) The dev-tuning-panel-reachable tunable-validation class of risk named above (follow-up recommended). (2) The AC 5/AC 14 literal-count reconciliation, while verified correct, touches wording in the frozen `<intent-contract>` block that this pass could not edit — the lead may want to fold the corrected expectation back into AC 5's own text at the next convenient spec touch, purely for future readers' sake (no behavioural action needed). (3) `footprint_extensions:` should record `src/sim/physics/devices.ts` (DW-257/AC 14) per the spec's own instruction.

### Plan-stage record, 2026-09-11 (build-auto, halted after planning)

**Where it ran.** Verified working directory `C:/git/dragonwar/.worktrees/epic-2`, branch `DW-1-epic2`, clean tree at `a080bf83653bf034a527311ec350ca9a78c51c3e`. Epic context `epic-2-context.md` was reused as valid (no planning artifact is newer), and `spec-2-12-ball-search.md` was loaded for continuity. No subagent was spawned. Nothing was committed, and nothing outside this spec file was written. The scratch probes live only in the session scratchpad.

**Measurements** (Code Map, *Measured at this tree*):
- all three DW-244 routes, reproduced red on today's code in the real loop;
- the machine-level recover and serve ordering;
- the goldens, JSON-parsed: none presses Start, so the Match draw cannot move any of them, and the refresh is header-only (seven `gameStart.tuning` blocks);
- every scoring value is a multiple of 5000;
- the boot Attract has live coils (AD-5 drift).

**Gate.** Verified against the READY-FOR-DEVELOPMENT standard after one repair pass, which tightened AC 2's display-only clause and corrected the `burstTransitions` note.

**Lead items:**
- the `matchPercent` → `matchProbability` amendment (Rule 5 tier 1: `epics.md` 2.13 AC 2 and spine AD-15);
- the optional Rule 20 notes under AD-5 (boot-Attract drift) and AD-6 (stray-clear reporting);
- six `LEAD CHECK:` lines in Design Notes, each with a recommendation already taken.
