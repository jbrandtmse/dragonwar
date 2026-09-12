---
title: 'Story 2.14: The lit Top lane -- rotation, and when it may move'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Several test-tuning overrides (this diff's own new ones, and pre-existing
      ones its diff reuses the shape of) author millisecond values as exactly
      1ms, which would throw resolveTuning()'s DW-35 "rounds to 0 ticks" guard
      if TICK_HZ ever moves from its current provisional 1000 to the
      alternate provisional value of 480.
    evidence: |-
      src/sim/contracts/time.ts:37 declares TICK_HZ = 1000 with the comment
      "1000 on PASS, 480 on FAIL", marking it explicitly provisional pending
      Spike 1 ratification. src/sim/table/tuning.ts's msToTicks() throws when
      a nonzero ms value rounds to 0 ticks at the live tickHz; at tickHz=480,
      Math.round(1 * 480 / 1000) = 0, so every "value: 1" override (this
      diff's own new NO_BALL_SAVE_TUNING in
      test/rules-modes-integration.test.ts, and FAST_GAME_OVER_TUNING's
      matchDelayMs/matchRevealMs/attractMs in test/rules-modes.test.ts) would
      throw at load time. Not new to this diff: test/rules-modes.test.ts's own
      pre-existing NO_BALL_SAVE_TUNING (Story 2.9) already carries the
      identical ballSaveMs: 1 pattern, as do test/game-over-integration.test.ts
      and test/game-over-restart-integration.test.ts -- a pre-existing,
      epic-wide convention this diff reuses rather than a defect it
      introduces. Found by the build-auto review gate's edge-case-hunter
      layer, 2026-09-12.
    location: >-
      src/sim/contracts/time.ts:37; src/sim/table/tuning.ts (msToTicks);
      test/rules-modes-integration.test.ts (NO_BALL_SAVE_TUNING);
      test/rules-modes.test.ts (FAST_GAME_OVER_TUNING)
    severity: medium
baseline_revision: 'ca60879b911c78bb4a3f3ba829be0e3be3453e90'
---

<intent-contract>

## Intent

**Problem:** The lit Top lane is drawn afresh from `GameState.rng` at every ball start (`src/sim/rules/modes/skill-shot.ts:80`, the single `nextRngInt(state.rng, TOP_LANES.length)` call). Measured over 200,000 seeds with the shipped arithmetic: **11.20%** of games light one lane on all three balls and **55.51%** repeat on a consecutive pair -- while `epics.md` Story 2.7 AC 5 says the lit lane differs across balls, and PRD FR-18 describes the Skill shot as *"the lit Top lane, rotating each plunge"*. A deterministic advance, not a draw. Story 2.7's own AC 6 pin cannot see the defect: it asserts not-all-same for one seed it chose for itself (DW-205).

**Approach:** The **starting position** is drawn **once per game** from `GameState.rng`; the lit lane then **advances one position through `TOP_LANES` in its declared order, wrapping, per the player's own `players[p].ballNumber`** (author decisions DW-205 2026-09-07 and DW-214 the same day, both binding and not re-opened here). A three-ball repeat becomes impossible **by construction**, `epics.md` Story 2.7 AC 5 stays true **verbatim with no rewording**, and `GameStart.seed` keeps a real, observable effect in the shipped product -- which a fixed start would have destroyed, taking `test/rules-modes-integration.test.ts`'s mutation-proven DW-201 pin with it. The starting position lives in `createSkillShotMode()`'s factory closure (AD-7's sanctioned closure-state class), never in `GameState`: a machine-scoped field would re-record all five golden state hashes, which AD-7 itself says needs the author's grant.

**Author decisions this story is built on (binding; not re-opened here):**
1. **DW-205 (author, 2026-09-07)** -- the lit lane advances in sequence each plunge rather than being drawn. Chartered as this story because none of Stories 2.9-2.13 owns the skill shot and closing it amends ratified artifacts.
2. **DW-214 (author, 2026-09-07)** -- **seeded starting offset, then deterministic advance.** The author recorded that their earlier phrasing ("retires the seed dependency in this path") is what pointed at a fixed start, and that its consequence -- the shipped seed becoming wholly unobservable -- was not in front of them at the time.

## Boundaries & Constraints

**Always:**
- **Dependency and naming rules** (AD-1, AD-16). `sim/rules/**` never imports `sim/physics/**`, `presentation/**` or `host/**`. Lane, switch and device names are never string literals outside `src/sim/table/dragonwar.ts` and `test/**`; `TOP_LANES` stays derived from `TABLE.laneWiring` by `set === 'top'` sorted ascending by `order` (DW-149), never hand-typed.
- **The declared order is `TABLE`'s** (AD-11, AD-19). "One position through `TOP_LANES` in its declared order" means ascending `order` -- the same order `base.ts`'s `rotateLit` treats as `'right'`. Production values are `top_1:0, top_2:1, top_3:2`.
- **Randomness** (AD-3). Exactly one `nextRngInt()` step per **game** on the lane path, taken at the game's first ball start. No other ball start advances `rng`, and no other randomness is added. **Match still draws last** (Story 2.13's AD-3 note: "Match draws after every lane draw of that game, and 2.14's rotation must keep that order").
- **Closure state** (AD-7, the closure-state class). The game's starting position is a `number | null` in `createSkillShotMode()`'s closure, meeting the class bar: reproducible from tick 0 (`createRules()` builds every controller fresh inside `createLoop()`, and a replay always starts from `GameStart` at tick 0), bounded (one small integer), restart-safe (overwritten at the next game's first ball start).
- **Per-player advance** (AD-7). The advance is keyed on the **mode entry's own** `player` and that player's `players[p].ballNumber`, never on `currentPlayer` and never on a machine-wide plunge counter. A machine-wide counter is arithmetically **wrong**: in a three-player game each player would advance by three positions, i.e. **none**, and every player would face the same lane on all three balls -- the precise defect this story exists to remove.
- **The lit-lane write is unchanged in shape.** The skill-shot mode still writes exactly one Top lane to `players[p].lanes.lit` once at its `start()`, and the base mode's all-false reset still lands first (`modes/index.ts:100-101`, ascending priority).
- **Tests.** Every expected lane is an authored literal (`'top_1'`, `'top_2'`, `'top_3'`) written at the probe. Never re-import `TOP_LANES`, `TABLE.laneWiring` or the `(start + n) % 3` formula into an expectation. Every negative carries its positive in the same test. Every three-ball script asserts that a Top lane was genuinely lit at each probe tick.
- **Seed choice is load-bearing** (measured, below). A pinned seed is only evidence if the **shipped** mechanism's own sequence for that seed **differs** from the rotation's. Verify that per seed at implementation time.

**Block If:**
- Any of the three rewritten sequence pins is **green on today's code** at its sequence assertion. That means the pin cannot distinguish a rotation from a draw, and it is a premise failure, not a convenience: HALT and report the observed values.
- Any golden field moves. `test/replays/**` must be byte-unchanged: `header.tableHash` (`e22fbdcf` in all five), `header.assetHash` (`ab163ff`), every `expectedHash`, `expectedGameStateHash`, `roll-and-drain`'s `expectedCheckpointHashes`, `transitions`, `coilPrologue` and `header.gameStart`. No golden ever starts a game (verified per field at this gate), so nothing this story changes may run in one. A moved hash means something did: HALT.
- Any widening of `GameState`, `MachineState`, `PlayerState`, `ActiveModeState`, `GamePhase`, `GameAdjustments` or `RngState` would be required. All five golden state hashes cover `GameState` in full (`gameStateHash()` hashes the whole tree), and AD-7 says moving state into the tree re-records them and needs the author's grant.
- `src/sim/rules/rng.ts`'s arithmetic, `src/sim/loop/**`, `src/sim/physics/**`, `src/sim/table/dragonwar.ts`, `src/sim/table/tuning.ts`, `public/assets/**` or `.github/**` would need an edit.
- `pnpm check:ad7` (exactly 3 passing), `pnpm check:corridor` or `pnpm check:reachability` goes red.
- A third-party file would be needed. The CLAUDE.md provenance rule applies.

**Never:**
- **Never decide DW-204** (`decision-pending`, the author's decision sheet): whether the paying lane freezes at `ball_launched`, or whether the spine/epics rationale sentence is corrected instead. **Leave lane change during flight exactly as shipped.** Story 2.14's criteria are all about which lane is lit at each ball start; none of them is about lane change during flight. Story 2.14's change log suggests carrying DW-204's answer into the same pass to avoid editing the DW-202 composition tests twice -- that is an efficiency note, not a licence. Where a DW-202 composition test must be touched, touch it for the rotation alone and leave its post-launch behaviour and every one of its assertions intact.
- Never decide or pre-empt: DW-200, DW-206, DW-210, DW-211, DW-212, DW-226, DW-232, DW-236, DW-237, DW-240, DW-245, DW-246, DW-249, DW-251, DW-255, DW-258, DW-263, DW-268.
- **Never edit `_bmad-output/planning-artifacts/epics.md` or any prior story's spec.** AC 8's amendments are the lead's (Rule 5 / Rule 11). This spec names the exact text; it does not apply it.
- Never change the skill shot's **resolution** rule (AD-6, as amended 2026-09-06): the first playfield closure of any kind at or after `ball_launched` resolves it, and an **unlit** Top lane is a **miss, not a skip**.
- Never delete `test/rules-modes-integration.test.ts`'s DW-201 block, and never leave it asserting a lane the rotation now fixes for a reason unrelated to the seed.
- Never re-record a golden, never touch the dev replay recorder's `GameStart` literal (`boot.ts:413`), and never fix DW-185 (the replay runner discarding `header.gameStart.seed`; routed to 3.7).
- Never pre-build Story 3.1's mode framework (lifecycle events, priority registry, fan-out abstraction) or Story 3.10's extra ball.
- Never assert a negative without its positive in the same test, never compare a value with itself, and never delete an existing assertion to make it pass. An amended test states its new expectation.

## I/O & Edge-Case Matrix

`s` is the game's starting position, `nextRngInt(seedAtGameStart, 3).value`. `L[i]` is `TOP_LANES[i]`, i.e. `top_1`, `top_2`, `top_3` at `order` 0, 1, 2.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Game's first ball | Start from Attract with `rng = S`; the mode stack starts player 0's ball 1 | Exactly one `nextRngInt(S, 3)` step: `gameLaneStart = s`, `state.rng` becomes the advanced value. `players[0].lanes.lit` has exactly `L[s]` true among the Top set, no `inout` lane lit | No error expected |
| Same player, ball 2 | `ball_starting` for player 0, `ballNumber` 2 | `L[(s+1) mod 3]` lit. **`state.rng` is byte-identical to its value after ball 1** -- no draw | No error expected |
| Same player, ball 3 | `ballNumber` 3 | `L[(s+2) mod 3]` lit; `rng` still unchanged. The three balls are three distinct lanes | No error expected |
| Wrap | `s = 2`, `ballNumber` 2 then 3 | `L[0]` then `L[1]` -- `top_1` then `top_2`. Index arithmetic is normalised, so a `ballNumber` of 0 cannot index outside the set | No throw |
| Hot seat, second player's ball 1 | Player 1 added during player 0's ball 1; `ball_starting` for player 1, `ballNumber` 1 | `L[s]` lit for player 1 -- the same lane player 0's ball 1 had, because the offset is drawn **once per game**. **No second draw:** `rng` unchanged | No error expected |
| Hot seat, second player's ball 2 | `ball_starting` for player 1, `ballNumber` 2 | `L[(s+1) mod 3]`, advanced by that player's OWN ball number. Player 0's lanes are untouched | No error expected |
| A second game in one rules instance | Game 1 reaches `game_over`; Start at or past the Match resolution; player 0's ball 1 | A **fresh** `nextRngInt` step from the then-current `rng` (which game 1's Match has already advanced). Game 2's opening lane is that draw's own, not game 1's | No error expected |
| `ballsPerGame` above 3 | Adjustments raise `ballsPerGame` to 5; `s = 2` | `top_3, top_1, top_2, top_3, top_1` -- no two consecutive balls share a lane at any length; a three-ball window is always three distinct lanes | No error expected |
| Attract | No game; a button, a lane and a playfield switch close | No mode pushed, `rng` untouched, no lane written (Story 2.7 AC 7, unchanged) | No error expected |
| Lane change before the plunge | `lane_change_pressed { side }` while the skill shot is armed | Unchanged: the base mode rotates the whole lit pattern within each set and the award reads `lanes.lit` live | No error expected |
| Lane change during flight | A flipper press after `ball_launched` | **Unchanged, deliberately** -- DW-204 is the author's, not this story's. Both DW-202 composition tests keep their behaviour and their assertions | No error expected |
| Match order | One full game at seed S | Exactly one lane-path step, then the Match's own single step at game end. The Match number for a given seed **moves** relative to today, because the game now consumes one step instead of one per ball | No error expected |
| Seed reaches `rng` (DW-201) | Two different seeds, each through a real `createLoop()` | Two different opening Top lanes, each reproducible. Mutating `sim/loop/index.ts`'s `rng: options.gameStart?.seed ?? 0` to `rng: 0` collapses them to one | No error expected |
| Goldens | The change is complete | `test/replays/**` byte-unchanged; all five hashes unmoved. No golden presses Start (verified per field), so no lane draw and no Match draw runs in one | `StaleReplayHeaderError` if a header is touched |

</intent-contract>

## Code Map

Every anchor below was read at `7672785d485a9c3509baba84e47875c53bb8360f`, with a clean tree.

**Rules -- the change**
- `src/sim/rules/modes/skill-shot.ts` -- the whole production change lives here.
  - Header comment `:1-28` describes the draw and must be rewritten (AD-3, AD-7 reasoning).
  - `buildTopLanes()` `:44-48` and `const TOP_LANES` `:50` -- **unchanged**: `TABLE.laneWiring` filtered to `set === 'top'`, sorted ascending by `order`. This is the "declared order" the AC names. Module-private; do not export it into a test expectation.
  - `createSkillShotMode()` `:78` -- gains the one closure field. It has none today.
  - `start(state, player)` `:79-90` -- `:80` is the single `nextRngInt(state.rng, TOP_LANES.length)` call the epic AC names; `:81` picks `TOP_LANES[value]`; `:83-87` writes `lanes.lit`; `:89` returns `{ ...state, players, rng, modes }`. This is the entire edit surface.
  - `step()` `:92-141` -- **unchanged**. Resolution (the `launched` gate `:112`, the live `lanes.lit` read `:120`, the award `:124-135`) is AD-6's and DW-204's, not this story's.
- `src/sim/rules/modes/index.ts` -- `createModeStack()` `:82`; `pendingStartPlayer` `:89`; the **DEFERRED START** rule `:94-106`: a `ball_starting` seen this tick starts the modes on the **following** tick, `base.start()` then `skillShot.start()`. This is why `players[p].ballNumber` is already correct at the draw. Comment-only touch at most.
- `src/sim/rules/modes/base.ts` -- `rotateLit()` `:68-83` is the in-tree precedent for the wrapping index normalisation `((i + shift) % n + n) % n`; `start()` `:100-110` resets every lane to false before the skill shot writes. **Unchanged.**
- `src/sim/rules/rng.ts` -- `nextRng` `:29-41`, `nextRngInt` `:51-54`. **Unchanged**; the arithmetic is Block-If.

**Rules -- read-only evidence**
- `src/sim/rules/ball-controller.ts`
  - `emptyPlayer()` `:311-325`, `ballNumber: 0` at `:323`.
  - `startBall()` increments at `:698-700` (`ballNumber: player.ballNumber + 1`) in the same call that emits `ball_will_start` / `ball_starting`; the mode stack runs a tick later, so the increment has landed. `test/game-over-two-player-integration.test.ts:145,154,169,177` is the committed corroboration.
  - **The one new-game site** `:924-936`: `players: [emptyPlayer()]`, `currentPlayer: 0`, `phase: 'game'`, then `startBall(created, 0, tick)`. Every game therefore begins at **player 0, `ballNumber` 1** -- exactly once per game. That is the "new game" discriminator this story keys the draw on.
  - The Match draw `:834-835` -- `GameState.rng`'s second consumer, once at game end.
- `src/sim/rules/index.ts` `:328` -- the mode stack steps **after** the ball controller, on `controllerResult.state`.
- `src/sim/contracts/state.ts` -- `PlayerLaneState` `:90-97`, `PlayerState` `:101`, `ballNumber` `:126`, `RngState = number` `:152`, `GameState.rng` `:166`, `GamePhase` `:27` (`attract | game | highscore_entry | game_over`).
- `src/sim/loop/index.ts:308` -- `rng: options.gameStart?.seed ?? 0`, the one hop DW-201's evidence pins.
- `src/sim/loop/replay.ts:381` -- `createLoop({ collisionDoc })` with **no** `gameStart`, so `runReplay()` discards `header.gameStart.seed` and every golden runs at `rng: 0` (DW-185, routed to 3.7). `gameStateHash()` `:133` hashes the whole `GameState`.

**Tests**
- `test/rules-modes.test.ts` (559 lines) -- the headless pins.
  - `AC 1` `:119-137` -- asserts one Top lane lit and `rng` advanced, on the game's **first** ball. Stays green unchanged (ball 1 is the draw).
  - `DW-202` `:176-259` -- `attractState()` at `rng: 12345`, `drawTop3ThenRotateToTop1AndClose()` `:216-233` with sanity assertions at ticks 6 and 8, then two `it`s at `:235` and `:243`. **Measured: seed 12345's starting position is index 2 = `top_3` under the rotation, identical to today's ball-1 draw, so every assertion here holds unchanged.** Only the `:178-181` comment that cites the old AC 6 pin needs a prose touch.
  - `AC 6` `:475-559` -- the block to rewrite. `attractState(rng)` `:477-495`; `threeBallDrawSequence(seed)` `:508-525` drives Start at 5, plunges/drains at 7/10, 12/20, 22/30 and probes ticks **6, 11, 21**; `SEED = 12345` / `EXPECTED_SEQUENCE = ['top_3','top_1','top_2']` `:540-541`; `OTHER_SEED = 42` / `OTHER_SEQUENCE = ['top_2','top_2','top_3']` `:542-543`.
  - `AC 7` `:445-473` -- Attract: no mode, `rng` never advanced. Stays green unchanged.
- `test/rules-modes-integration.test.ts` (272 lines) -- the real-loop pins.
  - The **DW-201 block** `:56-108`: `drawnTopLaneForSeed(seed)` `:76-91` drives a real `createLoop({ collisionDoc, gameStart })`, presses Start once, and returns the lit Top lane at the tick the skill shot arms. Two `it`s at `:93` and `:104` pin `12345 -> top_3`, `42 -> top_2`, `0 -> top_1` plus the inequality. `:56-73` records the named mutation (`rng: 0` in `sim/loop/index.ts`) that reddens it. **This is AC 3's subject: rewrite, do not delete.**
  - `gameStart(seed)` `:41-48`, `pressStartOnce()` `:51-54` -- reuse both.
  - AC I1 `:110-186` and AC I2 `:188-272` -- unchanged; AC I2 runs at seed 0 and depends on `top_1` being lit on ball 1, which the rotation preserves.
- `test/util/switch-script.ts` -- `runRulesScript()` `:238` builds a **fresh** `createRules()` per call `:240`, so the closure resets per script; `DEFAULT_INITIAL_STATE` `:213-230` boots Attract at `rng: 0`; options `tuning`, `adjustments`, `initialState`, `machineReports`; results include `statesByTick`.
- `test/lighting-integration.test.ts:21,51` -- a comment calling seed 12345's "first draw" `top_3`. Still true; prose touch only.
- `test/rules-match.test.ts:178-245` -- the game-over timeline at `ballsPerGame: 1`. A one-ball game consumes **one** lane step under both mechanisms, so the Match number there does not move. `test/game-over-integration.test.ts:49` and `test/game-over-two-player-integration.test.ts:56` both run `matchProbability: 1`, whose number and winners are rng-independent; `test/game-over-restart-integration.test.ts:52` runs `ballsPerGame: 1`. **No test in the tree pins a Match number that depends on how many lane draws precede it.** Re-verify rather than assume.

**Measured at this tree** (scratch Node harness transcribing `rng.ts`'s own four lines verbatim; never committed; and a per-field JSON parse of the goldens)

| seed | shipped 3-ball draw | rotation start | rotation 3-ball | discriminating? |
|---|---|---|---|---|
| 0 | `top_1, top_1, top_1` | 0 | `top_1, top_2, top_3` | yes |
| 1 | `top_2, top_1, top_2` | 1 | `top_2, top_3, top_1` | yes |
| 2 | `top_3, top_1, top_1` | 2 | `top_3, top_1, top_2` | yes |
| 42 | `top_2, top_2, top_3` | 1 | `top_2, top_3, top_1` | yes |
| **12345** | `top_3, top_1, top_2` | 2 | `top_3, top_1, top_2` | **NO -- identical** |

- Over seeds 0..199,999: the shipped mechanism gives **11.20%** all-three-same and **55.51%** consecutive-pair repeat (reproducing DW-205's own figures exactly); the rotation gives **0%** all-three-same by construction. Starting positions are uniform: **33.26 / 33.36 / 33.37 %**. **11.120% of seeds have a shipped sequence byte-identical to their rotation sequence, and 12345 is one of them.**
- `rng` after a three-ball game at seed 12345: shipped `1199742488`, rotation `1831578158`; the Match's raw `[0,1)` draw therefore moves `0.817934 -> 0.306752`. The coupling Story 2.13's AD-3 note predicted is real and is observable in principle.
- **Goldens, parsed per field** (never grepped): all five carry `header.gameStart.seed = 12345`, `tableHash e22fbdcf`, `assetHash ab163ff`. Transition counts are 2/2/1/2/0. **No transition in any golden has `frame.start === true`** (`frame` keys are `flipper_l, flipper_r, menu, nudge_l, nudge_r, nudge_up, plunger, start`), and **no transition carries a top-level `start` key at all** -- so the naive `transitions[i].start` probe reads `undefined` everywhere and would have "confirmed" the claim vacuously. Because `replay.ts:381` passes no `gameStart`, every golden also runs at `rng: 0` regardless of that header seed. No golden starts a game: no lane draw, no Match draw, no hash this story can move.

## Tasks & Acceptance

**Execution** (in dependency order):

1. **Red first (Rule 19 premise check).** Before any `src/` edit, write the three rewritten sequence pins (task 4's first bullet) and run them on today's code.
   - Each of seeds **0, 1 and 2** must be **red at its sequence assertion**, showing the shipped values in the Code Map table.
   - **Do not use seed 12345 as a discriminating pin.** Its shipped and rotation sequences are identical (measured); a pin on it stays green whether or not the rotation exists.
   - Record each observed red in `## Verification`. If any of the three is green, apply the Block-If and HALT with the observed values.

2. `src/sim/rules/modes/skill-shot.ts` -- **the rotation.**
   - Add one closure field to `createSkillShotMode()`: `let gameLaneStart: number | null = null;`
   - In `start(state, player)`:
     - read `const ballNumber = state.players[player]?.ballNumber ?? 1;`
     - **draw once per game.** When `gameLaneStart === null` **or** (`player === 0` **and** `ballNumber === 1`), take exactly one `nextRngInt(state.rng, TOP_LANES.length)`, keep its `value` as `gameLaneStart`, and carry its advanced `rng` into the returned state. Otherwise return `state.rng` **unchanged**.
     - compute the index with the wrapping normalisation `base.ts:78-79` already uses: `((gameLaneStart + ballNumber - 1) % n + n) % n`, `n = TOP_LANES.length`. Light `TOP_LANES[index]` exactly as `:81-87` does today.
   - Rewrite the file header: one draw per game (AD-3), why `gameLaneStart` is closure state and how it meets AD-7's class bar, why the advance is keyed on the mode entry's own `player` and `ballNumber`, and why `player === 0 && ballNumber === 1` is the game boundary (`ball-controller.ts:924-936` is the single new-game site).
   - *Rationale:* `players[p].ballNumber` already exists, is player-scoped (correct for Hot seat), is inside the hashed `GameState`, and is already incremented when the mode stack starts -- a per-ball advance needs no new state field.

3. `src/sim/rules/modes/index.ts` -- comment only. Extend the DEFERRED START header note to record that the one-tick defer is what makes `players[p].ballNumber` correct at `skillShot.start()`. No behaviour change. *A later reader must not "fix" the defer without seeing what depends on it.*

4. `test/rules-modes.test.ts` -- the headless pins.
   - **Rewrite the block this file titles `AC 6`** (`:475-559`; that is Story **2.7**'s AC 6, not this spec's) as Story 2.14's rotation pin. Keep `attractState()` and `threeBallDrawSequence()`. Drive seeds **0, 1 and 2** -- one per starting position, each verified at implementation time to start at 0, 1 and 2 -- and for each assert: the three-lane sequence as **authored lane literals**; that the three lanes are **distinct** (`new Set(seq).size === 3`); and that a second identical run reproduces it byte-for-byte. State in a comment why 12345 is excluded.
   - **Add: one draw per game.** Assert `rng` at the tick before ball 1's draw differs from `rng` after it, and that `rng` is **identical** at the ball-2 and ball-3 probe ticks. Positive and negative in the same test.
   - **Add: hot seat.** Two players (a second Start during player 0's ball 1). Assert player 1's ball 1 lights the **same** lane as player 0's ball 1, that `rng` did **not** advance for it, and that each player's own ball 2 advances one position -- with the other player's `lanes.lit` untouched.
   - **Add: a second game in one rules instance.** One `runRulesScript` driving game 1 to `game_over` and Start again past the Match resolution; assert game 2 takes a **fresh** draw (`rng` advances again) and opens on the lane that draw implies, as an authored literal.
   - **Add: wrap.** From the starting-position-2 seed, assert ball 3 is `top_2` as an authored literal.
   - Leave every other describe block in the file **unchanged** -- the blocks this file titles `AC 1`, `AC 2`, `AC 3`, `AC 4`, `AC 5` and `AC 7` (Story **2.7**'s numbering, not this spec's), plus `DW-203`, the two Matrix rows and `AD-7 player scoping`. In the `DW-202` block change **only** the `:178-181` comment that cites the old `AC 6` pin; every assertion there stays byte-identical.
   - *Unit-tests the I/O Matrix rows: first ball, ball 2, ball 3, wrap, both hot-seat rows, second game, and Attract (already covered by AC 7).*

5. `test/rules-modes-integration.test.ts` -- **AC 3: the DW-201 evidence, rewritten, not deleted.**
   - Keep the block, `drawnTopLaneForSeed()`, both `it`s and all three literals (`12345 -> top_3`, `42 -> top_2`, `0 -> top_1`) -- measured unchanged under the rotation -- and keep the inequality.
   - Retitle and re-comment: the seed now decides the game's **starting position**, which the rotation advances; the named mutation (`sim/loop/index.ts:308` to a bare `rng: 0`) still collapses all three to one lane.
   - **Add an `it` that carries the evidence past ball 1:** for seed 12345, drive a real loop through ball 1's drain into ball 2 and assert its lit lane is `top_1` (authored literal), so the block pins the seed's effect on the whole rotation rather than on a single draw.
   - **Add the Integration AC:** in **one** real loop, run a game to `game_over`, press Start past the Match resolution, and assert the second game's opening lane comes from a fresh draw rather than repeating game 1's start.
   - Leave AC I1 and AC I2 unchanged.

6. `test/lighting-integration.test.ts:21,51` -- comment only, where it calls 12345's `top_3` the "first draw". Say "the game's starting position". No assertion changes.

7. `## Verification` in this spec -- record each Rule 19 mutation with the exact assertion that went red, per the discipline (apply, observe, revert from a saved copy, confirm `git status --short` and `git diff --stat` byte-identical).

8. **AC 8 is a check, not an edit.** Do **not** touch `epics.md` or `spec-2-7-*.md`. After the lead's amendment lands, run the named greps in `## Verification` and record the result.

**Acceptance Criteria** (epic AC mapping in brackets):

- **AC 1 [epic AC 1] -- the rotation.** Given a game whose starting position is `s`, when the player starts balls 1, 2 and 3, then the lit Top lane is `TOP_LANES[s]`, `TOP_LANES[(s+1) mod 3]` and `TOP_LANES[(s+2) mod 3]` in that order; no two consecutive balls of that player share a lane; and the sequence is produced by advancing, not by drawing.
- **AC 2 [epic AC 2] -- every starting position, not one chosen seed.** Given the three possible starting positions, when each is driven through a full three-ball game, then each yields three **distinct** lanes; the pin covers all three rather than one seed the test picked for itself; and freezing the advance reddens all three.
- **AC 3 [epic AC 3] -- the seed pin, preserved.** Given `test/rules-modes-integration.test.ts`'s DW-201 block, when the draw is replaced, then the block is **rewritten and still passing on its own claim**: two different seeds give two different opening lanes in a real `createLoop()`, each reproducible, and the seed's effect is additionally pinned on ball 2. The block is not deleted, and `GameStart.seed` retains an observable effect in the shipped product.
- **AC 4 -- one draw per game, Match still last.** Given one game, when it runs from Start to game over, then `GameState.rng` advances exactly **once** on the lane path -- at the game's first ball start -- and not at all at later ball starts; the Match's own single draw is the game's last step.
- **AC 5 -- Hot seat.** Given two to four players, when each takes their balls, then each player's lane advances one position per **their own** `ballNumber`, all players share the one starting position drawn for the game, and no player's lane state disturbs another's.
- **AC 6 -- a second game.** Given one rules instance, when a second game starts after game over, then it takes a **fresh** starting draw rather than continuing the previous game's rotation.
- **AC 7 -- nothing else moves.** Given the change is complete, when the suite runs, then `test/replays/**` is byte-unchanged, all five golden hashes are unmoved, and `pnpm check:ad7` (exactly 3), `pnpm check:corridor`, `pnpm check:reachability`, `pnpm lint:boundaries`, `pnpm check:headers` and `pnpm check:attributions` are green.
- **AC 8 [epic AC 4] -- no ratified artifact describes a game the code no longer plays.** Given the ratified text that describes the superseded random draw -- named verbatim under `## Design Notes`, *Owed amendments* -- when this story lands, then each is amended in the **same commit** with the reasoning recorded, and the named greps return no hit. **The lead applies these; build-auto verifies them.**
- **AC 9 -- DW-204 untouched.** Given lane change during flight, when this story lands, then its behaviour and both DW-202 composition tests' assertions are byte-identical to today's, and nothing in the diff answers DW-204.

## Spec Change Log

## Review Triage Log

### 2026-09-12 — Review pass
- verdicts: 16 findings — high 0, medium 1, low 9, false 6, maybe-false 0
- findings:
  - `false` `reject` [blind-hunter] `## Auto Run Result` still reads `Status: ready-for-dev` after frontmatter moved to `in-review` — refuted: this section is rewritten by this same skill's own Finalize step before the spec reaches `done`; the mismatch is a normal in-flight state of an unfinished run, not a persisting defect.
  - `low` `patch` [blind-hunter] `## Verification`'s `pnpm test` bullet said "+9 new" against a list of 8 items, net arithmetic not reconciling to the stated total — verified real; fixed in this pass (corrected the count and the arithmetic breakdown to reconcile at both the 2075 and final 2076 totals).
  - `low` `patch` [verification-gap, "Other findings"] Same root cause as the row above: the "Match-number coupling" paragraph separately cited "2074 passing", stale from before the Matrix Test Audit's own added test — fixed in this pass (updated to 2076, the final measured count).
  - `low` `reject` [blind-hunter] `NO_BALL_SAVE_TUNING` (this diff's own new copy in `test/rules-modes-integration.test.ts`) duplicates an identical struct already in `test/rules-modes.test.ts`, `test/game-over-integration.test.ts` and `test/game-over-restart-integration.test.ts` — real (a fifth copy of the same override), but a full de-duplication would touch files outside this story's declared footprint (`test/game-over-*-integration.test.ts`) or add new shared test infrastructure; more than a direct correction, rejected per the LOW bar.
  - `low` `reject` [blind-hunter] `skill-shot.ts`'s new `const ballNumber = state.players[player]?.ballNumber ?? 1` silently defaults instead of asserting, unlike the neighbouring explicit `target` handling — verified unreachable: `pendingStartPlayer` (`modes/index.ts`) is always captured from a genuine `ball_starting` event's own player field, itself always a valid index maintained by `ball-controller.ts`'s single new-game site and its bounded (`< 4`) Hot-seat append; no path in this codebase calls `start()` with an invalid player. Fix (an explicit guard) is more than a direct correction for a demonstrated-unreachable case.
  - `low` `reject` [edge-case-hunter] Same root cause as the row above: "`ballNumber` present but 0 or negative is never validated" — verified unreachable: `emptyPlayer()`'s transient `ballNumber: 0` is always incremented to 1 by `startBall()` in the same state the ball controller returns, before any `ball_starting` fires; `ballNumber` only ever increments thereafter. Rejected with the paired row.
  - `false` `reject` [blind-hunter] "Dead defensive arithmetic" in `laneIndex = ((gameLaneStart + ballNumber - 1) % n + n) % n` (the `+ n) % n` term is unreachable since both operands are always non-negative) — refuted: this is the exact wrapping idiom task 2 of this spec explicitly mandates ("the wrapping normalisation `base.ts:78-79` already uses"), copied for consistency with the established in-tree convention; harmless, spec-directed, not a functional defect.
  - `low` `reject` [blind-hunter] Hot-seat coverage (AC 5) stops at 2 players; the game supports up to 4 — verified the advance formula never branches on player count (only on the mode entry's own `player` and that player's own `ballNumber`), so a 3rd/4th player follows identically by construction; a dedicated 4-player scripted test is more than a direct correction for a scenario the code has no distinct path for. This also matches the spec's own task 4 scoping ("Two players") under the epic AC's "two to four" wording.
  - `false` `reject` [edge-case-hunter] `test/rules-modes-integration.test.ts:395-402`'s one un-checked `loop.advance()` immediately before the G-search loop could theoretically miss a same-tick drain — refuted: a ball cannot travel from the shooter lane to a trough switch within a single simulation tick of the autolaunch pulse (every comparable real-loop drain test in this suite bounds the search at up to 20000 ticks); the identical "one throwaway advance before the checking loop" shape is pre-existing precedent in `test/game-over-integration.test.ts:66-74`, not introduced by this diff.
  - `medium` `defer` [edge-case-hunter] `NO_BALL_SAVE_TUNING`/`FAST_GAME_OVER_TUNING`'s `value: 1` ms overrides would throw `resolveTuning()`'s DW-35 guard if `TICK_HZ` (explicitly provisional, `src/sim/contracts/time.ts:37`) ever moves from 1000 to its alternate provisional value 480 — real, but pre-existing (the identical pattern already exists in `test/rules-modes.test.ts`'s own Story-2.9 `NO_BALL_SAVE_TUNING` and in two `game-over-*-integration` test files this diff never touches) and out of this story's footprint to fix broadly. Recorded in frontmatter `deferred:`.
  - `low` `patch` [edge-case-hunter] The rewritten `skill-shot.ts` header deleted the pre-existing FIRST-closure resolve-timing rule and the rationale for why `launched` is mode-local state (`ActiveModeState`), unrelated to this story's own rotation change and not preserved anywhere else in the file — verified real (confirmed absent from both the header and `step()`'s own local comments). Fixed in this pass: the deleted paragraph was restored into the header immediately before the Story 2.14 rotation paragraph, with a one-line note that this story leaves it unchanged.
  - `false` `reject` [intent-alignment] AD-11/AD-19's "declared order = `rotateLit('right')`'s own direction" equivalence is asserted only in a code comment, with no test driving both and checking agreement — refuted as a live risk: the skill-shot's advance never calls or depends on `rotateLit`; both independently read the same ascending `TABLE.laneWiring` `order` field, so there is no functional coupling that could silently drift and break behaviour. The comment is descriptive cross-reference, not a load-bearing consistency requirement between two code paths.
  - `low` `reject` [intent-alignment] AD-3's "Match still draws last" ordering is evidenced only as an emergent property of the AC6 second-game tests' hand-computed literals, not by a dedicated assertion isolating the ordering itself — real gap in directness, but the existing second-game tests (headless and integration) cannot pass their literal expectations unless the Match fires between the two games' draws, so the ordering is already genuinely (if indirectly) pinned; no AC in this story specifically requires an isolated ordering test (the Match mechanism itself is Story 2.13's, unchanged here), and adding one is more than a trivial addition.
  - `low` `reject` [intent-alignment] The game-boundary predicate `player === 0 && ballNumber === 1` has no adversarial direct-call test analogous to AC 5's player-vs-currentPlayer mismatch test — verified no path in this codebase can currently construct `ballNumber === 1` for player 0 other than through the single new-game construction site (confirmed independently by this same reviewer), so there is nothing reachable to adversarially construct today; the existing AC 6 mutation (dropping the boundary check) already gives this predicate a pinning test. A speculative future-proofing test against a hypothetical future ballNumber-reset feature is more than a direct correction.
  - `false` `reject` [intent-alignment] The new DW-201 ball-2 test pins a stronger claim (rotation surviving into ball 2) than the literal I/O-matrix row text (ball-1-only, seed-to-seed difference) — not a defect: the auditor itself frames this as an intentional strengthening in the direction the spec's own "Approach" narrative motivates (protecting the DW-201 pin against the mechanism this story actually changed), not a divergence requiring action.
  - `false` `reject` [intent-alignment] AC 8's wording-preservation requirement is not auditable from within this diff alone (the amended files are outside this diff's own file set) — by design: the spec's Never section forbids touching those files in this diff; the requirement was independently verified by this reviewer and by build-auto itself via the four named greps against the already-landed lead commit `0d56bcf4`, outside this diff.

## Design Notes

### Governing architecture decisions (Rule 6)

- **AD-3 -- one clock, no unseeded randomness.** The lane path still draws only from `GameState.rng` via `sim/rules/rng.ts`; no `Math.random`, no wall clock, no new timer. What changes is the **number of steps a game consumes on that path: one, instead of one per ball started.** Story 2.13's AD-3 note requires that "Match draws after every lane draw of that game, and 2.14's rotation must keep that order" -- it does, and more strictly: the single lane draw happens at the game's first ball start, thousands of ticks before the Match's own single draw at game end. **Reasoning about the two consumers explicitly, as the dispatch requires:** `rng` is seeded once at `createLoop()` (`loop/index.ts:308`) and is **never reset at game start**, so it is a per-loop stream shared by every game in a session. Under the shipped code a three-ball single-player game consumed three steps; under the rotation it consumes one. A given seed's Match number therefore **moves** -- measured at seed 12345, the Match's raw draw goes `0.817934 -> 0.306752`. That is expected and unavoidable: DW-214's decision requires the seed to keep an effect, and any change in step count is hash-visible by construction. Measured consequence in the tree: **no test pins a Match number that depends on the preceding lane-draw count** (the two `matchProbability: 1` integration tests are rng-independent; `rules-match.test.ts` and the restart test run `ballsPerGame: 1`, which consumes exactly one step under both mechanisms). Re-verify; do not assume.
- **AD-6 -- the skill-shot clause, as amended 2026-09-06.** Untouched. The mode still closes on the **first playfield closure of any kind at or after `ball_launched`**, an **unlit** Top lane is a **miss, not a skip**, and only the lit Top lane pays. This story changes *which* lane is lit at each ball start and nothing about resolution. AD-6's "lane change matters before the plunge, not during" rationale sentence is the subject of DW-204 and is not settled here.
- **AD-7 -- `GameState` ownership and the closure-state class.** `GameState` is **not widened**. `players[p].ballNumber` is already the per-ball counter, already player-scoped (correct for Hot seat), already hashed, and already correct when the mode stack starts (the one-tick deferred start). The game's starting position joins the closure-state class in `createSkillShotMode()`, meeting its stated bar: reproducible from tick 0, bounded (one integer), restart-safe (overwritten at the next game's first ball start). **Why not `machine`:** `gameStateHash()` hashes the whole tree, so a machine-scoped field re-records all five goldens' `expectedGameStateHash` and `expectedHash`; AD-7 says exactly that, and says such a move needs the author's grant. **Why not a player field:** the starting position is a *game* fact, and AD-7's Prevents names "machine facts on a player". AD-7 also instructs that the closure inventory be **re-derived from the `create*()` factories** rather than maintained by hand, so no list edit is owed -- the class membership is recorded here and in the file header. The consequence AD-7 already states holds for one more field: `GameState` remains not a mid-game resume point.
- **AD-8 -- the minimal mode stack.** The skill shot keeps its priority 200, its direct `start()`/`step()`, and no lifecycle events. Story 3.1 still owns the generalisation.
- **AD-15 -- tunables, replays and state hashes.** No tunable is added or changed, so no golden header moves. `test/replays/**` must be byte-unchanged (a Block-If).
- **AD-19 / AD-11 -- the vocabulary and the declared order.** `TOP_LANES` stays derived from `TABLE.laneWiring`; no lane-name literal enters `src/`.
- **AD-1 / AD-16 -- boundaries.** One rules file changes; no import direction moves.
- **AD-14 -- `GameStart` is the only bundle into `sim/`.** `GameStart.seed` keeps its effect; the host's `deriveGameSeed()` path is untouched.

**No AC contradicts any AD's Rule.** One AD's *wording* is overtaken and is listed as an owed amendment below.

### AD drift at the seams this story touches (named, not silently followed)

- **AD-7's Rule text** parenthesises lanes as "owned by the base mode; **the skill-shot mode writes the lit Top lane once on `ball_starting` from `rng` and never again**". The ownership half stays exactly true. The "from `rng`" half is overtaken: on the game's first ball the write **is** a fresh `rng` draw, but on later balls it is that draw's value advanced by the player's own ball number. This is a narrowing the spine could not have anticipated -- `epics.md` Story 2.14 and the author's DW-205/DW-214 decisions are the later, more specific ratified text -- not a contradiction of the Rule's purpose (lane ownership and single-write discipline). **LEAD: Rule 20 light path, amend AD-7's parenthetical in the same commit** (suggested wording under *Owed amendments*).
- **AD-3's** "All rules randomness (Match, skill-shot lane) draws from a seeded PRNG in `GameState.rng`" stays true as written. **LEAD: a one-line Rule 20 record is still worth it** -- "the lane path consumes exactly one step per game, taken at the game's first ball start, before the Match's own single step at game end" is a numeric invariant Epic 3 stories will assume, and it exists nowhere in the spine today.
- **The spine's `## Deferred` section does not mirror DW-204**, although Rule 20 says `decision-pending` entries with architectural weight are mirrored there with their DW id, and DW-204 is squarely about an AD-6 clause. **LEAD: mirroring it would put the open question where the next planner looks.** Recorded, not acted on -- build-auto does not write the spine.
- **AD-18, AD-9, AD-5, AD-19:** no drift found at the seams this story touches.

### Why the advance is per player, and what that implies

A machine-wide plunge counter is the obvious reading of "advances one position each plunge" and it is **arithmetically wrong**: with three lanes and P players, each player's own balls advance by P positions, so at **P = 3** every player faces the **same lane on every ball** -- a guaranteed three-ball repeat, the exact defect DW-205 exists to remove, made certain instead of 11.20% likely. The AC's own "a three-ball repeat is impossible **by construction**" therefore selects the per-player reading, and `epics.md`'s change log says so directly ("`players[p].ballNumber` ... is player-scoped (correct for Hot seat)"). Two derived consequences, recorded rather than discovered later:

1. All players in a game share the one starting position, so **every player's ball 1 lights the same lane**. That follows from "drawn once per game" and is not a defect.
2. "The same lane is never lit on two consecutive balls" is true **per player**. Across a Hot-seat rotation two consecutive *machine* plunges by different players on the same ball number light the same lane. No criterion forbids that, and the alternative (a per-player draw) would take one `rng` step per player and contradict "once per game".
3. **Extra balls (Story 3.10) are the open edge.** If an extra ball does not increment `ballNumber`, the lane will not advance for it. That is Epic 3's to settle when extra balls become real; nothing here pre-empts it.

### Ledger entries (Rule 17 inbox)

- **DW-205** -- addressed by AC 1 and AC 2, tasks 2 and 4, and the I/O rows *Game's first ball*, *Same player, ball 2*, *Same player, ball 3* and *Wrap*. The author's decision (advance, do not draw) is implemented literally, and the 11.20% / 55.51% figures are reproduced at this tree.
- **DW-214** -- addressed by AC 3, AC 4 and AC 6, tasks 2 and 5, and the I/O rows *Seed reaches `rng` (DW-201)* and *A second game in one rules instance*. The author's decision (seeded starting offset, then deterministic advance) is implemented literally; the fixed start the earlier phrasing pointed at is explicitly not built, and the DW-201 pin stays alive and writable.

No entry is declined. **DW-204 is not in this story's slice and is not decided here** (see *Never*); it stays `decision-pending` for the author's decision sheet.

### Owed amendments (AC 8) -- named verbatim; the LEAD applies them

Build-auto may not edit `epics.md`, the spine, or a prior story's spec (Rule 5 / Rule 11 / Rule 20). Each item below is apply-and-report tier: it corrects text that describes a mechanism the code no longer runs, and changes no product promise.

1. **`epics.md` Story 2.7 AC 1** (`:1458-1460`) -- the text that actually describes the superseded draw. Today: *"**Then** it draws the lit Top lane once from `GameState.rng`, writes it to the player's lane state, and the Backglass shows ARM YOURSELF"*. Suggested: *"**Then** it lights the game's rotating Top lane -- the starting position drawn once per game from `GameState.rng`, advanced one position per the player's own ball number (Story 2.14) -- writes it to the player's lane state, and the Backglass shows ARM YOURSELF."*
2. **`epics.md` Story 2.7 AC 5** (`:1476-1478`) -- **no change.** *"the lit lane differs across balls under the seeded PRNG and replays identically for the same seed"* stays **true verbatim** under the rotation, and the author's DW-214 trailer requires exactly that ("satisfies `epics.md` Story 2.7 AC 5 verbatim with NO rewording"). **This is a divergence from Story 2.14 AC 4's own Given**, which asserts that AC 5 describes the superseded draw. It does not; AC 1 does. AC 4's *Then* -- "no ratified artifact is left describing a game the code no longer plays" -- is satisfied by amending AC 1 instead. **LEAD: correct AC 4's Given to cite Story 2.7 AC 1** (apply-and-report: a wrong reference the AC cites), or read it as "whichever of Story 2.7's criteria describe the superseded draw". Raised rather than resolved silently, because amending AC 5 would contradict a binding author decision.
3. **`spec-2-7-plunge-skill-shot-and-lane-change.md` AC 6** (`:144`) -- describes the draw directly. Today: *"the two runs produce byte-identical lane-draw sequences; the recorded sequence for S is pinned literally in the test; not all three draws are the same lane; and a second seed S' (chosen and verified at implementation time) produces a different sequence."* Two corrections are owed, not one: the sequence is now a **rotation from a seeded starting position**, and **"a different seed produces a different sequence" is only true for about two thirds of seed pairs** -- with three starting positions, two seeds sharing a start produce identical sequences, so the clause must keep (and lean on) its "chosen and verified at implementation time" qualifier.
4. **`spec-2-7-...md` AC 1** (`:139`) -- *"`state.rng` has advanced from its pre-tick value"* is now true only at the game's **first** ball start. Amend to say so.
5. **`ARCHITECTURE-SPINE.md` AD-7** (`:128`) -- the parenthetical *"the skill-shot mode writes the lit Top lane once on `ball_starting` from `rng` and never again"*. Suggested: *"...writes the lit Top lane once on `ball_starting` and never again: the game's starting position is drawn from `rng` at the game's first ball start, and the lane then advances one position through the declared Top order per the player's own `ballNumber` [AMENDED 2026-09-12, Story 2.14 -- author decisions DW-205/DW-214]"*.
6. **`ARCHITECTURE-SPINE.md` AD-3** (`:85`) -- optional one-line record of the step-count invariant (above, *AD drift*).

Each amendment carries its reasoning in this spec's `## Spec Change Log` and an inline `[AMENDED 2026-09-12 -- see the story change log]` marker at the amended text, per Rule 5.

### Consumes, Consumed-by, Integration ACs (Rules 1, 2)

**This story introduces no service, module or shared component** -- it changes the behaviour of one existing function, `createSkillShotMode().start()`. Rule 1's "no consumers" note therefore does not apply in its literal form; the changed behaviour's consumers already exist and are exercised, and AC 3 and AC 6 are Integration ACs run against a **real `createLoop()`** with real physics, never a mock and never a hand-built `modes[]` fixture.

**Consumes:**
- Story 2.7: the mode stack, the base mode's lane reset, `TOP_LANES`, `players[p].lanes.lit`, and the DW-201 / DW-202 / DW-203 pins.
- Story 2.5: `startBall()`, `players[p].ballNumber`, the new-game site, Hot seat and the ball lifecycle.
- Story 2.13: the game-over sequence and the Match -- the second `rng` consumer, and the reason the step-count change is observable in a Match number.
- Story 1.8: the five replay goldens and `gameStateHash()`.
- AD-14's `GameStart.seed`, through `sim/loop/index.ts:308`.

**Consumed-by:**
- **Story 3.1** (the mode stack's generalisation): the skill shot's `start()` keeps its shape, and the closure field moves with it.
- **Story 3.10** (extra ball): owns whether an extra ball advances the lane (above).
- **Story 3.11** (the scoring freeze) and **Epic 4** (insert cues): read the lit lane, unchanged.
- **Story 3.7 / DW-175**: once the goldens are re-recorded through the rules layer, the lane path's step count becomes golden-visible. Landing this before that re-recording is strictly cheaper.

### Footprint (Rule 11)

- **In the epic footprint:** `src/sim/rules/modes/{skill-shot,index}.ts`, `test/rules-modes.test.ts`, `test/rules-modes-integration.test.ts`, `test/lighting-integration.test.ts`.
- **Nothing else is edited:** not `src/sim/loop/**`, `src/sim/physics/**`, `src/sim/table/**`, `src/sim/contracts/**`, `src/host/**`, `src/presentation/**`, `public/assets/**` or `.github/**`. No `footprint_extensions:` are expected; if one becomes necessary, say so plainly in `## Auto Run Result` so the lead reports it.
- No third-party file is added. The CLAUDE.md provenance rule is not engaged.

### Anti-vacuity plan, by named shape

This epic has recorded 70 vacuities, every one found by deliberate falsification and none by a passing run. Named shapes, and what closes each here:

- **An expectation that both mechanisms satisfy** (the shape this story is *about*, and a new measured instance). Seed 12345's shipped three-ball sequence `top_3, top_1, top_2` is **byte-identical** to its rotation sequence, and 11.120% of seeds share that coincidence. `test/rules-modes.test.ts`'s existing primary pin uses 12345, so it would stay **green whether or not the rotation is implemented**. Closed by: pinning seeds **0, 1 and 2** instead, each measured to differ under the two mechanisms, and by task 1 requiring all three to be observed **red on today's code** before any `src/` edit.
- **An expectation derived from the value or table under test.** Every expected lane is an authored literal (`'top_1'`, `'top_2'`, `'top_3'`). No test re-imports `TOP_LANES`, `TABLE.laneWiring`, or the `(start + ballNumber - 1) % n` formula into an expectation, and no expected sequence is computed by the code path being tested.
- **A negative with no positive.** "`rng` did not advance" is always paired, in the same test, with the positive that a Top lane genuinely **was** lit and **which** one. "Player 1's lanes are untouched" is paired with player 1's own asserted lane. "Game 2 does not continue game 1's rotation" is paired with game 2's own asserted opening lane.
- **A check that never ran.** Every three-ball script asserts a Top lane was genuinely lit at each of ticks 6, 11 and 21 (the existing helper already does; keep it), and every real-loop probe asserts the skill shot genuinely armed before reading anything.
- **A value comparison posing as a reference check.** None planned. The `rng` comparisons are by value over a `number` and say so.
- **A clause never asserted.** Each AC clause maps to an assertion; the I/O rows without a dedicated AC (*Wrap*, *`ballsPerGame` above 3*, *Attract*) are covered by task 4's unit tests and the unchanged AC 7 block.
- **A guard nobody has watched fail** (AD-6's own recorded lesson). The `player === 0 && ballNumber === 1` game-boundary condition is not defence in depth -- AC 6's second-game test is its pinning test, and its mutation (drop the condition, leaving only `gameLaneStart === null`) must be observed red.

**Measured traps** carried forward from this epic: `toPhysics()` negates y; `NullEngine` rasterises nothing; no flipper or plunger is rendered (DW-249, Story 5.4), so flipper behaviour is unit-test-only; tilt warnings carry across a player's balls; colourised output scraping fails on Windows -- use the **JSON reporter** for nested runs (DW-107); a bash heredoc containing non-ASCII fails to parse, so scratch helpers go to the session scratchpad, never under `test/`.

## Verification

**Commands.** In **every** shell, first `export BLENDER="C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe"` and `export PNPM_CONFIG_STRICT_DEP_BUILDS=false`. A result of `0 skipped` is the proof `BLENDER` was exported; four earlier stages wrongly concluded Blender was absent without it.

- `pnpm typecheck` -- expected: exits 0 across all three tsconfigs. **Observed: exits 0, all three (`tsconfig.sim.json`, `tsconfig.app.json`, `tsconfig.node.json`).**
- `pnpm test` -- expected: **0 failing, 0 skipped**. Stated baseline at dispatch: **129 files / 2067 tests**. Re-measure at your own tree first and account for the delta: no new test file, roughly **+6 to +10** tests across `test/rules-modes.test.ts` and `test/rules-modes-integration.test.ts`, and the file count unchanged at 129. **Observed at the implementation subagent's own pass: 129 files / 2075 tests, 0 failing, 0 skipped (net +8: +8 new in `test/rules-modes.test.ts` -- the 3 sequence pins, wrap, one-draw-per-game, Hot seat scripted, Hot seat direct (added during Rule 19 mutation testing -- see below), second-game -- minus the 2 removed old seed-12345/42 pins = +6, plus +2 new in `test/rules-modes-integration.test.ts` -- ball-2-carries-the-evidence, second-game Integration AC = **+8 net**, matching 2075 - 2067. Slightly above the stated +6-to-+10 estimate's midpoint because of the Hot-seat direct check the AC 5 mutation forced -- see the Rule 19 record.)** **Observed after the implementation gate's own Matrix Test Audit added the missing "`ballsPerGame` above 3" row test (below), a ninth new test in `test/rules-modes.test.ts` (9 - 2 removed = +7, plus the same +2 in `test/rules-modes-integration.test.ts` = **+9 net**): 129 files / 2076 tests, 0 failing, 0 skipped**, matching 2076 - 2067 -- confirmed with a final, standalone re-run after all Rule 19 mutations (including this new test's own) were applied and reverted: 129 files / 2076 tests, 0 failing, 0 skipped, unchanged.
- `pnpm lint:boundaries` -- expected: 0 violations. **Observed: OK -- 110 .ts file(s) under src/ cruised, no violations.**
- `pnpm check:headers` -- expected: green (no new file, so no new header). **Observed: OK.**
- `pnpm check:attributions` -- expected: green. **Observed: OK.**
- `pnpm check:ad7` -- expected: **exactly 3** passing. **Observed: 3 passing.**
- `pnpm check:corridor` -- expected: green. **Observed: 1 passing.**
- `pnpm check:reachability` -- expected: green. **Observed: 1 passing (the full reachability sweep, all `SHOT_CASES` entries agree with the sweep's own best-approach verdicts).**
- `git diff --stat -- test/replays` -- expected: **empty**. Any output is the golden Block-If. **Observed: empty.**
- `git diff --stat -- src/sim/loop src/sim/physics src/sim/table src/sim/contracts src/host src/presentation public/assets .github` -- expected: **empty**. **Observed: empty.**

**Task 1, Rule 19 premise check (run BEFORE any `src/` edit, on the shipped per-ball-draw code).** The three rewritten sequence pins (seeds 0, 1, 2) in `test/rules-modes.test.ts`, run alone via `npx vitest run test/rules-modes.test.ts -t "the starting position advances through TOP_LANES"`:

- **Observed RED, all three, at the sequence assertion**, showing exactly the shipped values from the Code Map's measured table:
  - seed 0: received `['top_1','top_1','top_1']` (expected `['top_1','top_2','top_3']`).
  - seed 1: received `['top_2','top_1','top_2']` (expected `['top_2','top_3','top_1']`).
  - seed 2: received `['top_3','top_1','top_1']` (expected `['top_3','top_1','top_2']`).
- Premise confirmed: none of the three could distinguish a rotation from a draw before the production edit. The production edit (task 2) was then applied, and the SAME three assertions were re-run and observed GREEN (see `pnpm test`'s observed count above).

**Rule 19 mutations** (apply, observe red, revert **from a saved copy** -- never `git checkout --` or `git stash` -- then confirm `git status --short` and `git diff --stat` are byte-identical to before; each was applied to a clean, saved-copy-backed tree, observed, reverted, and the revert diffed byte-identical against the saved copy before the next mutation):

- **AC 1** -- in `skill-shot.ts`, froze the advance (`laneIndex = gameLaneStart % n`, dropping `+ ballNumber - 1`). **Observed RED**: all three rewritten sequence pins (seeds 0, 1, 2), each collapsing to three copies of its own starting lane (`['top_1','top_1','top_1']`, `['top_2','top_2','top_2']`, `['top_3','top_3','top_3']`) -- exactly as predicted. **Reverted, confirmed byte-identical to the saved copy.**
- **AC 2** -- in `skill-shot.ts`, restored the per-ball draw (unconditional `nextRngInt` at every `start()`, index read directly with no `+ ballNumber - 1` term). **Observed RED**: all three sequence pins, reproducing the shipped sequences verbatim (`['top_1','top_1','top_1']`, `['top_2','top_1','top_2']`, `['top_3','top_1','top_1']`). **Additionally verified the predicted seed-12345 coincidence**: under this SAME mutation, the DW-202 block's own seed-12345 sanity check (`test/rules-modes.test.ts`'s "DW-202" describe, which asserts tick 6's lit lane is `top_3`) stayed **GREEN** -- confirming why 12345 is excluded as a non-discriminating pin. **Reverted, confirmed byte-identical.**
- **AC 3** -- in `src/sim/loop/index.ts:308`, replaced `rng: options.gameStart?.seed ?? 0` with a bare `rng: 0`. **Observed RED**: both original DW-201 `it`s (the inequality `a !== b` and the two literal assertions `top_3`/`top_2`/`top_1`, all collapsing to `top_1` since every seed now boots at `rng: 0`) **and** the new "ball 2 carries the evidence" `it` (ball 1's own opening lane read `top_1` instead of the expected `top_3`). **Reverted, confirmed byte-identical.**
- **AC 4** -- in `skill-shot.ts`, made the draw unconditional (dropped the `gameLaneStart === null || (player === 0 && ballNumber === 1)` guard, keeping the `+ ballNumber - 1` advance term). **Observed RED**: the "one draw per game" test's ball-2 assertion (`rng` at ball 2 read `3663131626`, expected the post-ball-1 value `1831565813` -- a fresh draw had clearly happened). **Reverted, confirmed byte-identical.**
- **AC 5** -- in `skill-shot.ts`, keyed the `ballNumber` read on `state.currentPlayer` instead of the mode entry's own `player`. **First observed GREEN on the scripted Hot-seat test** -- a genuine finding, not silently accepted: `startBall()` (`ball-controller.ts:746`) sets `currentPlayer: playerIndex` in the SAME call that emits `ball_starting`, and the mode stack's own one-tick DEFERRED START captures `pendingStartPlayer` from that SAME (already-updated) `currentPlayer` the SAME tick, so by the time the deferred `start()` call reads `state.currentPlayer` one tick later, it is BY CONSTRUCTION always equal to the mode entry's own `player` argument -- no script driven through the real ball controller's own rotation can ever construct a mismatch. Closed by adding a direct unit-level test (mirroring this file's own pre-existing "AD-7 player scoping" describe block's identical technique for `step()`) that calls `createSkillShotMode().start()` directly with a hand-built `GameState` where `player` (1) and `currentPlayer` (0) deliberately diverge and each has its OWN distinct `ballNumber`. **Observed RED** on that direct test under this mutation (received `top_2`, i.e. `state.currentPlayer`'s own ballNumber 4 -> index `(1+4-1)%3=1`; expected `top_3`, i.e. player 1's own ballNumber 2 -> index `(1+2-1)%3=2`), while the scripted Hot-seat test stayed green as predicted (both are now in the suite; the direct test is the one this mutation's Rule 19 entry is pinned against). **Reverted, confirmed byte-identical.**
- **AC 6** -- in `skill-shot.ts`, dropped the `player === 0 && ballNumber === 1` disjunct, leaving only `gameLaneStart === null`. **Observed RED**: the second-game test's fresh-draw assertion (`rng` after game 2's own draw read `3663131628`, identical to the value BEFORE it -- game 2 took no step at all and silently reused game 1's own starting position). **Reverted, confirmed byte-identical.**
- **AC 9** -- in `skill-shot.ts`, cached the drawn lane on the `ActiveModeState` entry at `start()` (`drawnLane`) and read it directly in `step()` instead of re-deriving live from `target.lanes.lit`. **Observed RED on BOTH** DW-202 composition tests: the "lane change rotates it, entering the NEW lane pays" test paid `0` instead of the award (the cached `top_3` no longer matched the rotated-to `top_1` the player actually entered), and its own control (the falsifying case) paid the award (`25000`) instead of `0` (the cached `top_3` matched even though `top_3` was no longer lit) -- both unchanged from Story 2.7's own recorded mutation shape, confirming this story left that behaviour alone. **Reverted, confirmed byte-identical.**
- **AC 7** -- no code mutation; the golden Block-If and the empty diff scopes above are the check (both observed empty, above).
- **AC 8** -- no code mutation; re-introducing an amended phrase makes the grep below return a hit (see Manual checks below -- the lead's amendments were already landed by the time this check ran, so all four greps were run directly rather than deferred).
- **I/O Matrix row "`ballsPerGame` above 3"** [ADDED at the implementation gate's Matrix Test Audit -- the implementation subagent's own task-4 pass left this row without a dedicated test, an omission this gate caught rather than one the spec asked for and got skipped] -- `test/rules-modes.test.ts`'s new `'ballsPerGame above 3: a 5-ball game never repeats a lane on two consecutive balls, at any length'` drives `createSkillShotMode().start()` directly (the "AC 5 (direct)" technique) for `ballNumber` 1 through 5 from starting position 2, pinning the authored literal sequence `top_3, top_1, top_2, top_3, top_1`. **mutation: in `skill-shot.ts`, froze the advance (`laneIndex = gameLaneStart % n`, dropping `+ ballNumber - 1`, same mutation as AC 1) -> observed RED**: sequence collapsed to `['top_3','top_3','top_3','top_3','top_3']` against the expected literal. Applied to a saved copy, reverted, diffed byte-identical to the saved copy before the next check.

After all eight mutations were applied, observed, reverted and diff-confirmed, `git status --short` showed only the six files this story actually changed (the five `src`/`test` files plus this spec's own `## Verification` section), and `git diff --stat -- test/replays` and the out-of-scope-directories diff were BOTH still empty.

**Manual checks:**

- **Goldens, per field, never by grep.** Re-parsed all five `test/replays/*.golden.json` in the scratchpad. **Observed**: `tableHash` `e22fbdcf` and `assetHash` `ab163ff` in all five; `header.gameStart.seed` `12345` in all five; transition counts `2/2/1/2/0` (full-plunge, hold-and-release, nudge-coupling, roll-and-drain, two-ball-collision); reading `transitions[i].frame.start` (not the absent top-level `transitions[i].start`) confirms **no transition in any golden has `frame.start === true`**, and no transition carries a top-level `start` key at all; `expectedHash`, `expectedGameStateHash` and `roll-and-drain`'s `expectedCheckpointHashes` (`{"5000":"9561e345","9280":"796ae0e9"}`) all read exactly as the Code Map recorded them. Combined with the empty `git diff --stat -- test/replays` above, no golden moved and no golden ever starts a game.
- **AC 8.** The lead's amendments had **already landed** by the time this check ran (visible in `epics.md`, `spec-2-7-plunge-skill-shot-and-lane-change.md` and `ARCHITECTURE-SPINE.md`, each carrying an `[AMENDED 2026-09-12, Story 2.14 spec gate -- author decisions DW-205/DW-214]` marker at the amended text -- including `spec-2-7`'s own AC 1 line 139 and `epics.md`'s own AC 4 Given-reference correction, both named as apply-and-report items in this spec's Design Notes). All four greps were run directly (not deferred):
  - `grep -n "draws the lit Top lane once from" _bmad-output/planning-artifacts/epics.md` -- **no match** (confirmed).
  - `grep -n "byte-identical lane-draw sequences" _bmad-output/implementation-artifacts/spec-2-7-plunge-skill-shot-and-lane-change.md` -- **no match** (confirmed).
  - `grep -n "writes the lit Top lane once on .ball_starting. from .rng. and never again" _bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` -- **no match** (confirmed).
  - `grep -n "the lit lane differs across balls under the seeded PRNG" _bmad-output/planning-artifacts/epics.md` -- **still matches**, at line 1478, verbatim (confirmed -- Story 2.7 AC 5 is deliberately unreworded).
  - Falsification (per this spec's own discipline) was not re-tried against the LANDED artifacts, since build-auto may not edit them (Never section); the falsification claim rests on the four greps' own before/after logic, already demonstrated structurally by the mutation-testing pass above for the code side of this story.
- **Match-number coupling.** Confirmed by inspection: neither `test/rules-match.test.ts` (both its `it`s read `drawn.number`/`drawn.winners` structurally, e.g. "a non-zero multiple of ten", never a specific number under `matchProbability: 0`) nor `test/game-over-integration.test.ts` (`matchProbability: 1`, asserts `matchNumber === 0`, which is guaranteed regardless of rng -- a guaranteed win with a single score of 0 has only one possible winning number) nor `test/game-over-two-player-integration.test.ts` (`matchProbability: 1`, same guaranteed-win shape) nor `test/game-over-restart-integration.test.ts` (`ballsPerGame: 1`, no `match_drawn`/`number` reference at all -- confirmed by grep, no hits) pins a Match `number` whose value depends on the count of preceding lane draws. The full `pnpm test` run (2076 passing, 0 failing -- the final count, after the Matrix Test Audit's own added test) is the empirical confirmation: no such coupling-driven failure appeared anywhere in the suite.

## Auto Run Result

Status: done
Blocking condition: none

### Implement + review pass, 2026-09-12 (build-auto)

**Summary of implemented change.** The lit Top lane no longer draws fresh from `GameState.rng` at every ball start. A starting position (`gameLaneStart`, `number | null`) is drawn exactly once per game, in `createSkillShotMode()`'s own closure (AD-7's closure-state class, never `GameState`), at the game's first ball start (`player === 0 && ballNumber === 1`, or the factory's own first-ever draw). Every ball after that advances `TOP_LANES[(gameLaneStart + ballNumber - 1) mod n]`, keyed on the mode entry's own `player` and that player's own `ballNumber` -- never `currentPlayer`, never a machine-wide counter. A three-ball repeat is now impossible by construction; `GameStart.seed` keeps a real, observable, mutation-proven effect; DW-204 (lane change during flight) is untouched.

**Files changed:**
- `src/sim/rules/modes/skill-shot.ts` -- the production change: the `gameLaneStart` closure field, the one-draw-per-game guard, the wrapping advance formula, and a rewritten header (including a restored paragraph, deleted then reinstated during review, on FIRST-closure resolve timing and why `launched` is mode-local -- unrelated to this story's own change but pre-existing rationale this story must not silently drop).
- `src/sim/rules/modes/index.ts` -- comment-only: the DEFERRED START header note now records why the one-tick defer is what makes `ballNumber` already correct at `skillShot.start()`.
- `test/rules-modes.test.ts` -- replaced the old seed-12345/42 draw pins (Story 2.7's own former "AC 6") with Story 2.14's rotation pins: sequence pins for seeds 0/1/2, wrap, one-draw-per-game, Hot seat (scripted + a direct adversarial test the AC 5 mutation forced), a second-game test, and (added during this pass's own Matrix Test Audit) a `ballsPerGame`-above-3 test. One stale comment reference fixed in the pre-existing DW-202 block.
- `test/rules-modes-integration.test.ts` -- retitled/re-commented the DW-201 block (kept all three literals and the inequality unchanged), added a real-loop test carrying seed 12345's evidence into ball 2, and added a real-loop Integration AC test for a second game's fresh draw.
- `test/lighting-integration.test.ts` -- two comment-only fixes ("first draw" -> "the game's starting position").
- `_bmad-output/implementation-artifacts/spec-2-14-...md` (this file) -- `## Verification` filled in per task 7 (premise check + eight Rule 19 mutations, including one added at this gate's own Matrix Test Audit), `## Review Triage Log` appended, frontmatter `deferred:` populated with one entry.

**Matrix Test Audit finding (closed in this pass, before review):** the "`ballsPerGame` above 3" I/O-matrix row had no dedicated test in the implementation subagent's own pass. Closed by adding a direct-call test (`createSkillShotMode().start()` driven for `ballNumber` 1..5), pinning the authored five-ball literal sequence, with its own Rule 19 mutation observed red and reverted from a saved copy.

**Review findings breakdown** (full detail and evidence in `## Review Triage Log` above; four layers -- blind-hunter, edge-case-hunter, verification-gap, intent-alignment -- run in parallel against the diff since baseline):
- 16 findings total: 0 high, 1 medium, 9 low, 6 false, 0 maybe-false.
- **Patched (3, all low):** a test-count arithmetic inconsistency in this spec's own `## Verification` (two grouped findings, from blind-hunter and verification-gap); a deleted architectural-rationale paragraph in `skill-shot.ts`'s header (edge-case-hunter), restored.
- **Deferred (1, medium):** test-tuning overrides authored as `value: 1` ms would throw `resolveTuning()`'s DW-35 guard if `TICK_HZ` (explicitly provisional) ever moves from 1000 to its alternate provisional value 480 -- pre-existing pattern (this story's diff reuses it, does not originate it), out of this story's footprint to fix broadly. Recorded in frontmatter `deferred:` for the lead's harvest.
- **Rejected (12):** a stale `## Auto Run Result` status line (resolved by this very Finalize step); a duplicated ball-save-tuning test fixture (real, but full de-duplication is out of this story's footprint); a silent `ballNumber`/`player` fallback with no validation (two grouped findings, from blind-hunter and edge-case-hunter -- verified unreachable in this codebase's actual call paths); "dead" wraparound arithmetic in the lane-index formula (this is the exact idiom the spec's own task 2 mandates, copied from `base.ts` for consistency); Hot-seat coverage stopping at 2 of the supported 4 players (the advance formula never branches on player count); an unchecked tick in a new integration test's drain-search loop (physically unreachable within one tick, and a pre-existing precedent shape elsewhere in the suite); the AD-11/AD-19 `rotateLit`-direction cross-reference living only in a comment (no functional coupling exists to drift); the AD-3 "Match draws last" ordering being evidenced only indirectly (already genuinely pinned by the second-game tests' own literals); the game-boundary predicate lacking an adversarial direct-call test (no reachable path today); the DW-201 ball-2 test exceeding the literal matrix row's wording (an intentional strengthening, not a defect); AC 8's wording-preservation not being auditable from within this diff alone (by design -- verified against the separate, already-landed lead commit).

**Follow-up review recommendation: false.** Of the 3 patched entries, all were `low` severity (0 `high`, 0 `medium` patched) -- this run's own criterion for `true` (a patched `high`, or two-or-more patched `medium`) is not met. `followup_review_recommended` set to `false` in frontmatter.

**Verification performed** (full detail with observed values in `## Verification` above): `pnpm typecheck` (0 errors, all three tsconfigs, re-run after every patch); `pnpm test` (129 files / 2076 tests, 0 failing, 0 skipped -- re-run independently by build-auto itself, not only by the implementation subagent, and again after the review-pass patches, both times identical); `pnpm lint:boundaries`, `check:headers`, `check:attributions` (all green, re-verified); `pnpm check:ad7` (exactly 3 passing), `check:corridor`, `check:reachability` (all green); `git diff --stat` against `test/replays` and every out-of-scope directory (both empty, re-verified after patches); all five goldens re-parsed per field (byte-unchanged); the four AC 8 greps (all behave exactly as specified, independently re-run by build-auto); the Rule 19 premise check and all eight mutations (independently spot-checked one -- the newly added `ballsPerGame` test's own mutation -- end to end by build-auto itself: applied to a saved copy, observed red, reverted, diffed byte-identical).

**Residual risks.** The one deferred item (TICK_HZ=480 tuning fragility) is pre-existing and epic-wide, not unique to this story; it will surface (if ever) as a `resolveTuning()` throw naming the offending tunable, not a silent failure. DW-204 (lane change during flight) remains explicitly undecided, as required. Story 3.10 (extra ball) is the open edge this story's own Design Notes already name: if an extra ball does not increment `ballNumber`, the lane will not advance for it -- Epic 3's to settle.

### Plan-stage record, 2026-09-12 (build-auto, halted after planning)

- **Working directory verified.** `git rev-parse --show-toplevel` returned `C:/git/dragonwar/.worktrees/epic-2` (branch `DW-1-epic2`), clean tree before and after `git add --refresh -- .`. Planned at `7672785d485a9c3509baba84e47875c53bb8360f`.
- **Epic context reused, not recompiled.** `_bmad-output/implementation-artifacts/epic-2-context.md` -- 254 lines, starts `# Epic 2 Context:`, dated 2026-09-12 01:07, newer than the newest planning artifact (2026-09-11 18:26). Valid; no compile subagent was spawned. Story 2.13's spec was loaded for continuity (Code Map, Design Notes, Spec Change Log, task list).
- **No subagents were spawned.** The investigation was narrow and localized -- one production file, two test files, five goldens, one ledger slice -- so it was read directly rather than delegated.
- **Ledger inbox (Rule 17):** DW-205 and DW-214, both addressed; neither declined. DW-204 was read and is explicitly fenced, not decided.
- **Measurements taken at this tree** (scratch Node/Python harnesses in the session scratchpad, nothing committed, no project test run): the shipped-versus-rotation sequence table and the 11.120% coincidence (including seed **12345**, the seed the existing primary pin uses); the 11.20% / 55.51% reproduction of DW-205's figures; the uniform 33.26/33.36/33.37% starting-position histogram; the Match raw-draw shift `0.817934 -> 0.306752` at seed 12345; and a per-field JSON parse of all five goldens confirming no `transitions[i].frame.start === true`, no top-level `start` key at all, `tableHash e22fbdcf`, `assetHash ab163ff`, and (via `replay.ts:381` passing no `gameStart`) `rng: 0` throughout every golden run.
- **No `intent gap` was found.** Story 2.14 AC 4's Given mis-cites Story 2.7 AC 5, which stays true verbatim under the rotation and which the author's DW-214 trailer requires be left unreworded; the text that actually describes the superseded draw is Story 2.7 **AC 1**. The AC's *Then* is fully satisfiable, so this is a wrong reference for the lead to correct (Rule 5 apply-and-report), not a blocking ambiguity. It is named in full under *Owed amendments*.
- **Nothing was committed.** The plan stage leaves the spec uncommitted for the lead's validation gate.
