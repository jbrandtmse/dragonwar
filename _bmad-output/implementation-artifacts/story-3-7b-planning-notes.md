# Story 3.7b planning notes: the game clock and replay honesty

These notes are Part B of Story 3.7's plan, written by its planning run on 2026-10-13 at commit `5683305ba533edd6bdb4a350a34d769de33d991c` on `DW-1-epic3`, moved here verbatim when the author split the story. The full two-part spec is in git at commit `6bffa64` (`_bmad-output/implementation-artifacts/spec-3-7-quick-multiball-fight-the-monster.md`).

**Every figure here must be re-measured on the merged tree before it is relied on**: Epic 5's merge changes `src/host/boot.ts` and the golden headers, and Story 3.7 (Part A) will have changed `src/sim/rules/index.ts` and `ball-controller/index.ts`, `shared.ts`, `start.ts` (the four files the two parts share).

The story block and its acceptance criteria are in `_bmad-output/planning-artifacts/epics.md`, "Story 3.7b"; ledger entries DW-280 and DW-185 are routed to it.

How to read the sections after the author decisions: everything in them is copied verbatim from that spec, with only heading levels adjusted, except the lines that begin "Note:", which were added at the split. In the copied text "Part A" is Story 3.7 and "Part B" is this story.

## Author decisions of 2026-10-13 that bind this story

- A fresh table at every game start: every Start that begins a game finds all balls in the trough, the Lock empty and the tilt bob at rest. A ball locked at game over is not carried into the next game; the same holds for a loose ball and a ball in the shooter lane; a nudge before Start does not reach the new game.
- One golden field is granted, to this story only: each of the five goldens' `header.gameStart.seed` may change from 12345 to 0, so the header states what was actually run. Nothing else is granted: every `expectedHash`, `expectedGameStateHash`, checkpoint hash, `transitions` and `checkpointTicks` stays byte-identical. Re-run the seed measurement on the merged tree before writing the field.
- DW-175 is retired: the goldens keep their declared coil prologue (physics-determinism pins that serve their own ball; Start keeps its own tests). The `CoilPrologueEntry` doc comment in `src/sim/loop/replay.ts` must say so; this story edits that file.
- The story is built after Epic 5 has merged and the feature branch has been merged into `DW-1-epic3`, and before Story 3.11.
- `src/sim/loop/**`, `src/host/loop.ts`, `src/host/boot.ts`, `src/host/dev/**` are outside Epic 3's declared footprint; they are reported as footprint extensions.

## Intent (Part B)

Note: from **Problem:**, its last sentence.

Eleven ledger entries were routed here; two of them (the game clock, DW-280, and the replay header, DW-185) are a separate goal.

Note: from **Approach:**, its lead-in and its Part B bullet.

This spec has two parts, cut so they can be built as two stories (see `## Auto Run Result`, "Proposed split").
- **Part B, the game clock.** Each Start that begins a game rebuilds the loop's machine and rules from a fresh `GameStart` at tick 0 (DW-280), and a replay runs on its own header's `GameStart` (DW-185).

## Boundaries (Part B)

Note: the source section opens with two shared lines, the single-letter symbols (S, G, W, D, R, B, C, L, I) and the "Live balls" definition. The Part B text uses neither, so they are not copied.

### Part B -- Always

- **One loop, one game** (`loop/index.ts`; AD-3, AD-4, AD-14). When a Start begins a game, the loop discards its machine, its rules and its `GameState` and builds fresh ones from a fresh `GameStart`, with `tick` 0. This happens for every such Start, the first after boot included.
- **Who decides.** The rules decide whether a Start begins a game, exactly as today (`handleStartButton()`: Attract, or a resolved `game_over`, and no Mouth eject pending). A Start that adds a Hot-seat player begins no game.
  - `createRules()` takes an in-place game budget. The loop's boot instance has 0: it reports such a Start as `RulesStepResult.newGameRequested` and creates nothing. An instance the loop has just rebuilt has 1: it creates its one game in place and reports any later one. With the budget omitted (a bare `createRules()`, every headless test) every game is created in place, as today.
- **The fresh timeline.** The loop re-applies the two most recent input frames at once: the frame in force before the press on tick 1, and the press on tick 2. These two ticks consume no owed time. Every input transition still pending is re-based by the same offset, and a queued dev coil command is dropped. The old tick's own events and commands are kept. The lamp diff is taken against the old game's last projection.
- **What the fresh `GameStart` sets.** `seed` becomes `GameState.rng`; `highscores` becomes `machine.highscores`; `adjustments` go to `createRules()`. Tuning is the loop's own (`options.tuning ?? resolveTuning()`), as today: no loop reads `gameStart.tuning`.
- **Where it comes from.** `CreateLoopOptions.nextGameStart?: () => GameStart`, called once per rebuild. Omitted, the loop reuses `options.gameStart`.
- **What survives a game boundary.** The input frame in force, pending input transitions (re-based), the accumulator's carried remainder, and the lamp projection used for the next diff. Nothing else: not a locked or loose ball, not a ball resting in the shooter lane, not a coil's enable state, not the bob or the slam window, not any rules closure mark, not `GameState`.
- **The host.** `Loop.currentGame()` reports the game index, its `GameStart` and the tick offset of the last rebuild. `createHostLoop()` forwards `nextGameStart`, and `boot.ts` supplies the boot bundle with a fresh `deriveGameSeed()` per game. `HostLoop.reset()` takes its own `gameStart` and `nextGameStart`; neither is carried forward, as `tuning` is not today.
- **Replays (DW-185).** `runReplay()` builds its loop with `replay.header.gameStart`.
  - The dev recorder resets the host loop with the bundle it stamps, so the recorded loop runs on it.
  - At the first game boundary the recording becomes that one game: the header takes the bundle `Loop.currentGame()` reports; everything recorded before the boundary is replaced by the two re-applied frames on ticks 1 and 2; transitions of the boundary frame are re-based by the reported offset; coil pulses recorded before the boundary are dropped. A second boundary invalidates the recording with a named reason.
  - The player resets with the header's `gameStart` and no provider, so playback reuses that bundle.
- **Goldens.** Each header's `gameStart.seed` changes from 12345 to 0, the seed the recorded hashes were produced under. Nothing else moves.

### Never (both parts)

Note: the list is copied whole. Items 1 to 5 bind this story as written; the `ballSave.deadlines` exception in item 4 is Part A's field. Items 6 and 7 are Part-A-only in subject: they were written for Part A's work (the strike, the War, DW-308 and DW-309, the Mode's score, `modes[]` and coil rules) and hold here only as general rules.

- Never touch `TABLE.lamps`, `sim/rules/lamps.ts`, `MODE_LAMP_ROLES` or any insert (Story 3.3c), or the Dragon rig (Story 3.3b).
- Never touch a path contended with Epic 5: `assets/src/**`, `public/assets/**`, `src/presentation/mechanisms/**`, `src/presentation/scene/**`, `tools/make-placeholder-blend.py`, `ATTRIBUTIONS.md`. No third-party file or pasted third-party code.
- Never change geometry, `src/sim/physics/**`, `applyDeviceEvents()` or the shot tracker. DW-322 to DW-326 are Story 3.3d's.
- Never add a `GameState` or `machine` field other than the optional `ballSave.deadlines`.
- Never let `expectedHash`, `expectedGameStateHash`, `transitions`, `checkpointTicks` or `expectedCheckpointHashes` move in any golden, and never remove a coil prologue. If one would move, HALT with an intent gap.
- Never build the War, a War start, or `show_dragon_hit` on a strike (DW-303 is Story 3.9's). Never build on DW-308 or DW-309.
- Never write `score` except through `awardScore()`, never add or remove a `modes[]` entry outside `lifecycle.ts`, never emit a `CoilCommand` from a mode.

## I/O & Edge-Case Matrix (Part B rows)

Note: the B rows depend on no symbol or definition from the prose above the source table (it describes how the Part A rows are scripted), so only the table header and the six B rows are copied.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| B-Fresh | a real game 1 to game over; Start; game 2 | game 2's `stateHash` equals, tick for tick, a fresh `createLoop()` given the same `GameStart` and the re-based inputs | No error expected |
| B-Clock | the Start that begins game 2 | `ball_will_start { tick: 2 }`; `rng` follows the fresh seed; `nextGameStart` called once | Provider omitted: `options.gameStart` is reused |
| B-Boundary | a ball locked, a ball loose after a Slam, a ball resting in the lane, a flipper held, lamps lit, Start released one tick after the press | the Lock empty and the trough full on tick 1; no `ball_missing`; the flipper re-edges on tick 1; the release lands on tick 3; every lamp the old game left lit is turned off or restated; the four start events once | No error expected |
| B-Request | Start in a resolved `game_over` on the tenth reveal step's tick; a Slam and a Start on one tick; Start with a Mouth eject pending | the reveal step is kept and the game starts; the game starts; nothing starts and nothing is rebuilt | No error expected |
| B-No carry | a nudge 480 ticks before the Start; two nudges 200 ticks before it | game 2 warns and slams exactly as the same game does alone | No error expected |
| B-Replay | each golden; a replay that presses Start with `tiltWarnings: 3` in its header | every recorded hash holds; the replayed game allows three warnings | A stale header still throws `StaleReplayHeaderError` |

## Code Map (Part B)

Measured at `5683305ba533edd6bdb4a350a34d769de33d991c` on `DW-1-epic3`.

**Part B**
- `src/sim/loop/index.ts:264-309` (construction), `:369-495` `advance()`: `tick` (:282), `pendingTransitions` (:286), `pendingCommands` (:296), `previousFrame` (:285), `previousLamps` (:320).
- `src/sim/loop/replay.ts:381`: `createLoop({ collisionDoc })`.
- `src/sim/rules/index.ts:271-399` `createRules` (a third, optional argument carries the in-place game budget; `RulesStepResult` gains `newGameRequested`); `src/sim/rules/ball-controller/start.ts:161-215` `handleStartButton` (`:167` is the test that decides a Start begins a game; `:181-193` creates it).
- `src/sim/loop/replay.ts:285-289` `CoilPrologueEntry`: its doc comment records DW-175's retirement (Design Notes).
- `src/host/loop.ts:115-137,275-305`; `src/host/boot.ts:282-319,400-431`; `src/host/dev/replay-recorder.ts:138-169`; `src/host/dev/replay-player.ts:122`.
- Tests that pin a second game on a real `createLoop()` and change by design: `test/rules-modes-integration.test.ts:385`; `test/stray-clear-integration.test.ts:55,224`; `test/stray-clear-game-over-integration.test.ts:68`; `test/game-over-restart-integration.test.ts:58`; `test/fixtures/dw70-ad7/ad7-device-slots.harness.ts` case (ii). `test/host-game-seed.test.ts:37-93` scans `boot.ts` for three text anchors.
- All 21 `createLoop()` tests that press Start press their first Start on tick 2 of a loop nothing has touched, which is the case the fresh timeline reproduces exactly.

## Tasks (Part B)

**Execution -- Part B**
12. `src/sim/rules/index.ts`, `src/sim/rules/ball-controller/start.ts`, `index.ts`, `shared.ts`: `newGameRequested` and the in-place budget.
13. `src/sim/loop/index.ts`: the rebuild, the two re-applied frames, the re-base, `nextGameStart`, `currentGame()`.
14. `src/sim/loop/replay.ts`: `runReplay()` on the header's `GameStart`. `test/replays/*.golden.json`: `gameStart.seed`.
15. `src/host/loop.ts`, `src/host/boot.ts`, `src/host/dev/replay-recorder.ts`, `src/host/dev/replay-player.ts`: the provider, the recorder's bundle and re-base, the player's bundle.
16. Tests: `test/loop-new-game.test.ts` (new); the six second-game tests re-pointed; `test/replay-goldens.test.ts`, `test/replay-round-trip.test.ts`, `test/replay-recorder.test.ts`, `test/host-loop.test.ts`, `test/host-game-seed.test.ts`.

## Acceptance Criteria (Part B)

**Acceptance Criteria -- Part B**
- **B1** (rows B-Fresh, B-Clock; DW-280). Given a session that has played a game, when a Start begins another, then the new game's state hash equals, at every sampled tick and at the end, that of a fresh `createLoop()` given the same `GameStart` and the same inputs re-based; its first ball starts on tick 2 and its `rng` follows the fresh seed.
- **B2** (row B-Boundary). Given a ball in the Lock, loose, or resting in the lane, a held flipper, lit lamps and a pending Start release, when the game boundary passes, then the outcome is exactly the Matrix row's.
- **B3** (rows B-Request, B-No carry). Given a Start the rules would refuse, when it is pressed, then nothing is rebuilt. Given a Slam and a Start on one tick, then the game still starts. Given cabinet nudges before the boundary, then they have no effect after it.
- **B4.** Given a loop nothing has touched, when Start is pressed on tick 2, then the game's events carry the ticks they carry today: `ball_will_start` on tick 2, and Story 3.3's recipe still parks in the Lock on tick 5506 (`test/dragon-shows-physics.test.ts:125`; measured, with the press on tick 1 or 3 it does not park at all). Given the same press on tick 4 instead, then every event of the game carries the same tick as in the tick-2 run. The 21 `createLoop()` test files that press Start stay green with only the six second-game tests of the Code Map changed.
- **B5** (row B-Replay; DW-185). Given a replay, when `runReplay()` runs it, then the loop is built with the header's `GameStart`; all five goldens keep `expectedHash`, `expectedGameStateHash` and every checkpoint hash with `gameStart.seed` 0.
- **B6.** Given the host loop with a provider, when a game begins, then the provider is called once and its bundle is the one `Loop.currentGame()` reports. Given the dev recorder recording, when the first game boundary passes, then the saved replay is that one game from tick 0 (the press on tick 2), carries that game's bundle in its header and reproduces its hash through `runReplay()` and through the player; a second boundary invalidates the recording with a named reason.
- **B7.** Given Part B, when the gates run, then every gate passes and the goldens differ from Part A's only in `gameStart.seed`.

## Design Notes (Part B)

**Governing ADs.**
- Part B: AD-3 (`tick` reset at game start), AD-4 (a replay is header plus transitions), AD-14 (`GameStart` is the one bundle).

**Rule 20 candidates (the lead's call).**
- Part B, AD-3 / AD-6 / AD-18: each game runs on a fresh loop, so the Start-time stray clear and the DW-296 refusal become defence in depth at a game boundary.

Note: the Sweep bullet is copied whole; its Part B part is the two single-ball, one-tick coincidences and its last sentence. The Start-tick parity finding is the last sentence of the Clock bullet.

**Measurements** (2026-10-13, at 5683305; four synchronous planning subagents, repository read-only; data under the session scratchpad `s37-plan/`). Each states its instrument and its bounds.
- **Sweep (DW-273).** All 18 closure fields under `sim/rules/`, read and write sites in seam order, the worst candidates probed headless. Two-ball defects: the classic save has no lane check; a drain to zero ends the ball while a serve or a window is still open; a lock and a drain on one tick pulse the trough twice. Single-ball, one-tick coincidences: the tilt settle mark survives a Slam and a Start on one tick; a Start is honoured on the tick a Lock overflow requests a Mouth eject. Part B dissolves the last two.
- **Clock (Part B).** DW-280 reproduced on a real loop: game 2 starts on tick 13113 with an inherited `rng` and lights a different lane than the same game alone; 0 of 6000 ticks hash-equal. A rebuild prototype outside `src/`: 6000 of 6000 ticks equal on both hashes. The physics solver alternates one bit per iteration, so the Start tick's parity moves trajectories (a plain plunge drains 11 ticks later with Start on tick 1 or 3 than on tick 2); the fresh timeline puts Start on tick 2, where every recipe in the suite was recorded.
- **Goldens (Part B).** `runReplay()`'s body with the loop options varied: with the header's adjustments and seed 0 all five keep every hash; with the header's seed 12345 all five move and `rng` is the only field that differs. Every golden reads `phase: 'attract'`, an empty `ballSave` and `multiball: null` at every tick, so the optional `deadlines` key moves no hash.

Note: the DW-273 line is copied whole; its Part B part is B3. The DW-175 line names the doc comment this story writes.

**Ledger inbox (Rule 17).**
- DW-273: addressed. The sweep is done (above); A10 pins the two-ball instances, B3 the two that Part B dissolves. The one-record limits are in `deferred`.
- DW-280, DW-185: addressed, Part B (B1 to B6).
- Declined DW-175: formally retire. The goldens are physics-determinism pins; a harness that serves its own ball is isolated from rules churn, and Start has its own tests. Removal is a trajectory re-record that is not granted, and the two-ball golden cannot take the unavoidable +1-tick serve shift: its margin at this tree is 0.023 mm (27.0132 mm at tick 1587 against a 26.99 mm ball), thinner than the 0.191 mm the entry records. The retirement belongs on the ledger entry (a terminal trailer line), on `epics.md` Story 1.8's prologue clause (an amendment marker), and in `CoilPrologueEntry`'s doc comment in `src/sim/loop/replay.ts`, which Part B task 14 edits.

**Integration (Rules 1/2).**
- A13 is the real-runtime Integration AC for Part A; B1 for Part B.

Note: the first and the last Footprint lines cover both parts.

**Footprint.**
- In the footprint: `src/sim/rules/**`, `src/sim/table/**`, `test/replays/**` (headers only).
- Extensions to report (uncontended), Part B: `src/sim/loop/**`, `src/host/loop.ts`, `src/host/boot.ts`, `src/host/dev/replay-recorder.ts`, `src/host/dev/replay-player.ts`, `test/**`.
- The one golden header field outside `tableHash`, tuning, adjustments and notes: Part B's `gameStart.seed`.
- No contended path.

**Browser smoke (lead).**
- **Part B.** Play a game to its end and press Start: the Backglass leaves the game-over screen, the Lock reads empty, and a second game plays. The deciding check is B1.

## Verification (Part B)

Note: the three commands cover both parts and are copied whole. The source's one manual check concerns A13 only and is not copied.

**Commands** (first `export BLENDER=C:/Users/Josh/tools/blender-5.2.1-windows-x64/blender.exe` and `export PNPM_CONFIG_STRICT_DEP_BUILDS=false`; one vitest invocation per tool call; the baseline is 159 files / 2632 tests):
- `pnpm test` -- expected: all green; Part A adds 5 files, Part B adds 1.
- `pnpm typecheck && pnpm lint:boundaries && pnpm check:headers && pnpm check:attributions && pnpm build && pnpm check:dist && pnpm check:size` -- expected: each exits 0.
- JSON-parse each `test/replays/*.golden.json` against the baseline -- expected: only the fields A14 and B7 name differ. Any movement in a hash, `transitions` or `checkpointTicks` means HALT with an intent gap.

**Mutations** (Rule 19; planned here, applied and recorded by the implement stage as `mutation: <change> → <red test>`):
- B1: keep the old `rng` across the rebuild; B-Fresh goes red.
- B2: reset `previousLamps` at the rebuild; the lamp assertion of B-Boundary goes red. Re-base pending transitions by one tick less; the Start release assertion goes red.
- B3: detect the new game from a phase edge in the loop; the Slam-and-Start row goes red.
- B4: re-apply the press on tick 1; the equality pin goes red.
- B5: build `runReplay()`'s loop without the header's `GameStart`; the `tiltWarnings: 3` replay goes red.
- B6: skip the recorder's re-base; the recorded game's hash through `runReplay()` goes red.

## Auto Run Result (Part B)

Note: these are the passages of the source's `## Auto Run Result` that concern Part B. They are the planning run's proposals to the lead; the author decisions at the top of this file answer them and take precedence.

**This plan is more than one story (`warnings: [oversized, multiple-goals]`). Proposed split.**

- **Story 3.7, Quick multiball (Part A).** ACs A1 to A14. Ledger: DW-219, DW-226, DW-228, DW-268, DW-273 (the two-ball instances), DW-295, DW-321 (the serve pair). Footprint: `src/sim/rules/**`, `src/sim/table/**`, two contracts files, `frame.ts`, golden headers (`tableHash`, eight tuning keys). It is already large: the ball controller learns a second ball, which is the work Story 3.8 builds on.
- **A new story, the game clock and replay honesty (Part B).** ACs B1 to B7. Ledger: DW-280, DW-185, and the two single-ball instances of DW-273 that a rebuild dissolves (the tilt settle mark across a Slam and a Start on one tick; a Start honoured on a Lock-overflow tick). Footprint: `src/sim/loop/**`, `src/host/**`, the rules' Start path, golden headers (`gameStart.seed`).
- **Order.** Neither part needs the other. They meet in four files (`src/sim/rules/index.ts` and `ball-controller/index.ts`, `shared.ts`, `start.ts`), in different functions. Build Part A first, since 3.8 to 3.10 wait on it. Part B should land before Story 3.11, so that each recorded playtest game replays on its own.
- **Not in either:** DW-175 (declined: retire) and DW-141 (declined: Story 3.3d).

If the author keeps them as one story, this spec builds as written: tasks 1 to 11, then 12 to 16.

**The eleven inbox entries.**
- DW-175: declined, formally retire (the record is named under Design Notes).
- DW-185: addressed, B5 and B6.
- DW-273: addressed, A10 (two-ball instances) and B3 (the two a rebuild dissolves); the sweep itself was done at planning.
- DW-280: addressed, B1 to B4.

**For the lead, before dispatching implement.**
- **The split** is the author's call.
- **Part B changes a golden header field outside the list this stage was given**: each header's `gameStart.seed`, 12345 to 0. Measured: with seed 0 and the header's adjustments all five goldens keep every hash; honouring 12345 moves all five (`rng` only). No hash, transition or checkpoint moves. If that field may not change, DW-185 cannot be closed without a state-hash re-record.
- **Part B's consequences, which the author's DW-280 decision implies but does not state**: a ball locked at game over is back in the trough when the next game starts, and the same holds for a loose ball and a ball in the shooter lane; a nudge before Start no longer reaches the new game. Worth one line of confirmation.

## Findings from the same planning run that touch this story's files

Note: these two items remain in Story 3.7's spec `deferred:` list and are ledgered at Story 3.7's harvest.

```yaml
  - summary: >-
      HostLoop.reset() called from inside onFrame leaves two requestAnimationFrame chains running
    evidence: |-
      Measured 2026-10-13 at 5683305 (planning probe on src/host/loop.ts): reset() from inside onFrame leaves two rAF callbacks firing per frame and stop() leaves one queued; test/host-loop.test.ts:488 covers only a reset from outside a frame. Not reached by Part B of this spec, which rebuilds inside createLoop() precisely so that the host never resets mid-frame.
    location: 'src/host/loop.ts:275-305'
    severity: medium
    footprint: out-of-footprint
  - summary: >-
      The dev tuning panel's hot-apply drops the boot GameStart (the real game seed is gone after any hot-apply), and with panel edits pending a recording is made on default tuning and played back on the overridden one
    evidence: |-
      Read 2026-10-13 at 5683305 (planning): src/host/dev/tuning-panel.ts:179 resets with tuning only; src/host/boot.ts:419-430 stamps the panel's tuning into the header while the recorded loop is reset bare. Part B of this spec makes the recorder and the player honour the stamped GameStart; the panel's own reset is left as it is.
    location: 'src/host/dev/tuning-panel.ts:179; src/host/boot.ts:419-430'
    severity: low
    footprint: out-of-footprint
```
