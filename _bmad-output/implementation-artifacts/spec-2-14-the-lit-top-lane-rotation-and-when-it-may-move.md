---
title: 'Story 2.14: The lit Top lane -- rotation, and when it may move'
type: 'feature'
created: '2026-09-12'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
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

- `pnpm typecheck` -- expected: exits 0 across all three tsconfigs.
- `pnpm test` -- expected: **0 failing, 0 skipped**. Stated baseline at dispatch: **129 files / 2067 tests**. Re-measure at your own tree first and account for the delta: no new test file, roughly **+6 to +10** tests across `test/rules-modes.test.ts` and `test/rules-modes-integration.test.ts`, and the file count unchanged at 129.
- `pnpm lint:boundaries` -- expected: 0 violations.
- `pnpm check:headers` -- expected: green (no new file, so no new header).
- `pnpm check:attributions` -- expected: green.
- `pnpm check:ad7` -- expected: **exactly 3** passing.
- `pnpm check:corridor` -- expected: green.
- `pnpm check:reachability` -- expected: green.
- `git diff --stat -- test/replays` -- expected: **empty**. Any output is the golden Block-If.
- `git diff --stat -- src/sim/loop src/sim/physics src/sim/table src/sim/contracts src/host src/presentation public/assets .github` -- expected: **empty**.

**Rule 19 mutations** (apply, observe red, revert **from a saved copy** -- never `git checkout --` or `git stash` -- then confirm `git status --short` and `git diff --stat` are byte-identical to before; record each observed red here):

- **AC 1** -- in `skill-shot.ts`, freeze the advance: use `gameLaneStart` as the index, dropping `+ ballNumber - 1`. Expected red: all three rewritten sequence pins (seeds 0, 1, 2), each now three copies of one lane.
- **AC 2** -- in `skill-shot.ts`, restore the per-ball draw (`nextRngInt(state.rng, TOP_LANES.length)` at every `start()`). Expected red: all three sequence pins, which become the shipped sequences in the Code Map table. Note in the record that this mutation would leave a seed-12345 pin **green** -- that is the reason 12345 is excluded.
- **AC 3** -- in `src/sim/loop/index.ts:308`, replace `rng: options.gameStart?.seed ?? 0` with a bare `rng: 0`. Expected red: the DW-201 block's inequality and both literal assertions, plus the new ball-2 assertion. (This is the mutation the block's own comment already names; it must still work.)
- **AC 4** -- in `skill-shot.ts`, make the draw unconditional. Expected red: the "one draw per game" test's `rng`-unchanged-at-balls-2-and-3 assertion.
- **AC 5** -- in `skill-shot.ts`, key the advance on `state.currentPlayer` instead of the mode entry's own `player`. Expected red: the Hot-seat test's per-player lane assertions.
- **AC 6** -- in `skill-shot.ts`, drop the `player === 0 && ballNumber === 1` condition, leaving only `gameLaneStart === null`. Expected red: the second-game test (game 2 reuses game 1's start and takes no `rng` step).
- **AC 9** -- in `skill-shot.ts`, cache the drawn lane on `ActiveModeState` at `start()` and read it in `step()` instead of re-deriving from `lanes.lit` (DW-202's own recorded mutation). Expected red: **both** DW-202 composition tests, unchanged from Story 2.7's record -- evidence that this story left that behaviour alone.
- **AC 7** -- no code mutation; the golden Block-If and the empty diff scopes above are the check.
- **AC 8** -- no code mutation; re-introducing an amended phrase makes the grep below return a hit.

**Manual checks:**

- **Goldens, per field, never by grep.** Re-parse all five `test/replays/*.golden.json` in the scratchpad and confirm: no transition has `frame.start === true`; `tableHash` is `e22fbdcf` and `assetHash` is `ab163ff` in all five; `expectedHash`, `expectedGameStateHash` and `roll-and-drain`'s `expectedCheckpointHashes` are unchanged. Read the flag at `transitions[i].frame.start` -- **not** `transitions[i].start`, which is absent on every transition and reads `undefined` for all of them, "confirming" the claim vacuously.
- **AC 8, after the lead's amendment lands** (run from the worktree root):
  - `grep -n "draws the lit Top lane once from" _bmad-output/planning-artifacts/epics.md` -- expected: **no match**.
  - `grep -n "byte-identical lane-draw sequences" _bmad-output/implementation-artifacts/spec-2-7-plunge-skill-shot-and-lane-change.md` -- expected: **no match**.
  - `grep -n "writes the lit Top lane once on .ball_starting. from .rng. and never again" _bmad-output/planning-artifacts/architecture/architecture-dragonwar-2026-08-26/ARCHITECTURE-SPINE.md` -- expected: **no match**.
  - `grep -n "the lit lane differs across balls under the seeded PRNG" _bmad-output/planning-artifacts/epics.md` -- expected: **still matches** (Story 2.7 AC 5 is deliberately left verbatim).
  - Falsification: re-introducing any amended phrase makes its grep return a hit again.
- **Match-number coupling.** Confirm by inspection that no test asserts a specific Match `number` in a run whose lane-draw count changes -- the two `matchProbability: 1` integration tests are rng-independent, and `test/rules-match.test.ts` plus `test/game-over-restart-integration.test.ts` run `ballsPerGame: 1`, which consumes one step under both mechanisms. If a new failure appears there, it is this coupling and not a regression: report it, do not re-pin silently.

## Auto Run Result

Status: ready-for-dev
Blocking condition: none

### Plan-stage record, 2026-09-12 (build-auto, halted after planning)

- **Working directory verified.** `git rev-parse --show-toplevel` returned `C:/git/dragonwar/.worktrees/epic-2` (branch `DW-1-epic2`), clean tree before and after `git add --refresh -- .`. Planned at `7672785d485a9c3509baba84e47875c53bb8360f`.
- **Epic context reused, not recompiled.** `_bmad-output/implementation-artifacts/epic-2-context.md` -- 254 lines, starts `# Epic 2 Context:`, dated 2026-09-12 01:07, newer than the newest planning artifact (2026-09-11 18:26). Valid; no compile subagent was spawned. Story 2.13's spec was loaded for continuity (Code Map, Design Notes, Spec Change Log, task list).
- **No subagents were spawned.** The investigation was narrow and localized -- one production file, two test files, five goldens, one ledger slice -- so it was read directly rather than delegated.
- **Ledger inbox (Rule 17):** DW-205 and DW-214, both addressed; neither declined. DW-204 was read and is explicitly fenced, not decided.
- **Measurements taken at this tree** (scratch Node/Python harnesses in the session scratchpad, nothing committed, no project test run): the shipped-versus-rotation sequence table and the 11.120% coincidence (including seed **12345**, the seed the existing primary pin uses); the 11.20% / 55.51% reproduction of DW-205's figures; the uniform 33.26/33.36/33.37% starting-position histogram; the Match raw-draw shift `0.817934 -> 0.306752` at seed 12345; and a per-field JSON parse of all five goldens confirming no `transitions[i].frame.start === true`, no top-level `start` key at all, `tableHash e22fbdcf`, `assetHash ab163ff`, and (via `replay.ts:381` passing no `gameStart`) `rng: 0` throughout every golden run.
- **No `intent gap` was found.** Story 2.14 AC 4's Given mis-cites Story 2.7 AC 5, which stays true verbatim under the rotation and which the author's DW-214 trailer requires be left unreworded; the text that actually describes the superseded draw is Story 2.7 **AC 1**. The AC's *Then* is fully satisfiable, so this is a wrong reference for the lead to correct (Rule 5 apply-and-report), not a blocking ambiguity. It is named in full under *Owed amendments*.
- **Nothing was committed.** The plan stage leaves the spec uncommitted for the lead's validation gate.
