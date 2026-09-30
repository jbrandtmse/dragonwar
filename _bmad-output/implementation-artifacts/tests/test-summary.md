# Test Automation Summary: Story 3.0 (Epic 2 Deferred Cleanup)

Framework: Vitest (`pnpm test`, `test/**/*.test.ts`). The project has no HTTP API. The user-facing surface is the Backglass DMD, so these tests run through the real runtime: `createRules()`, then `advanceBackglass()`, then `renderFrame()`, then `rasterise()`.

## Generated Tests

### E2E / integration (real runtime)
- [x] `test/backglass-integration.test.ts`, "Story 3.0 QA -- a real createRules() run folded like the real loop ..." (4 tests)
  - A three-step count at an earned x2, read from the rendered and rasterised DMD. The score line rises by each step's payment and reaches the final score on BONUS 0 (AC1/AC10).
  - Batched frames of 17 ticks and `MAX_OWED_TICKS` show the same screen states as the per-tick fold (AC1/AC10, real-loop batching).
  - At `bonusCountMs` 0, the arming frame already shows BONUS 0 and the final score (AC4).
  - A frame carrying all three steps shows the last one (AC6).

### Unit / rules
- [x] `test/backglass-frame.test.ts`: the ceiling boundary sweep, fractional ms included (AC5).
- [x] `test/rules-tilt.test.ts`: player 1's own settle mark survives player 2's turn, with a control (AC8).

## Coverage
- AC1, AC4, AC5, AC6, AC8, AC10: gaps closed by new tests, each with a demonstrated mutation.
- AC3, AC9: the existing paired tests were re-verified by their recorded mutations. No gap was found.
- AC2, AC7, AC11: already pinned by the implement stage; no gap was found.

## Next Steps
- The lead's browser smoke (spec `## Verification`).

## Story 3.0a

Framework: Vitest (`pnpm test`, `test/**/*.test.ts`). What the player sees is the Backglass DMD. The tests therefore run through the real runtime: `createRules()`, the real `createMachine()` + `createRules()` composition in `sim/loop`'s own step order, then `advanceBackglass()`, `renderFrame()` and `rasterise()`. Glyphs are read back from the lit dots.

### Generated Tests (E2E / integration, real runtime)
- [x] `test/rules-scoring-qa-integration.test.ts` (10 tests)
  - The glyph reader itself: it reads plain rows, inverse rows, and a changed number.
  - AC 6: Hot seat with player 2 up after a real drain and rotation. Each award lands on player 2's row, player 1's row keeps its own pop, and the rasterised dots read the same totals.
  - AC 4, rules side: Start, launch, a real bob Tilt, then every earner. Nothing pays. The no-bob control pays each one.
  - AC 4, real physics: a genuine nudge-burst Tilt, then the ball closes the Spinner. The sim and the DMD stay at 0. Ball 2, plunged the same way, pays again on the DMD.
  - AC 3: a second bank completion on ball 2, re-armed by the real ball-start reset. It pays again, and the letters stay DRAGON.
  - AC 5: `game_over` and Attract, each reached by three real drains. A pop, the Spinner and a target change nothing. Includes the lifecycle sanity check and the mid-ball control.

### Coverage
- AC 1-7: each has a demonstrated mutation in the spec's `## Verification` (QA stage). 8 mutations went red.
- AC 6: pinned in real play (the scorer is not index 0) for the first time. Paying `currentPlayer` instead of the mode's player cannot be told apart in single-ball play. Only the constructed test pins it.
- AC 8, AC 9: pinned by the implement stage and the gates. No gap was found.

### Next Steps
- The lead's browser smoke (spec `## Verification`).

## Story 3.1

Framework: Vitest (`pnpm test`, `test/**/*.test.ts`). Every row drives a whole `createRules()` through `runRulesScript()`: the devices layer, the tilt controller, the split ball controller and the mode stack. The DW-206 rows fold a real run through `advanceBackglass()` and `renderFrame()`, then compare `rasterise()` dot buffers.

### Generated Tests (integration, real runtime)
- [x] `test/rules-mode-stack-qa-integration.test.ts` (11 tests; gated as headless in `test/rules-devices-headless.test.ts`'s `ENTRY_FILES`)
  - AC8 (DW-209): a Slam during hot-seat player 1's ball. Its stop triples carry player 1, Attract holds `modes []` with no draw, and the next Start runs player 0's one fresh pair on one draw. Also Slam + Start on one tick with the Start edge listed first.
  - AC3: the event-major pair mirrored with the left flipper and the lane its rotation wraps onto, with a control.
  - AC5 / DW-290, the split under the real stack:
    - a saved drain closes only the launched skill shot and re-arms nothing;
    - the S8a early return still skips the overflow answer;
    - a ball-search recover is never a ball end;
    - a full game over, then the Match, Attract and a restart.
  - DW-206 on the rasterised DMD: a fieldless unlabelled mode leaves the panel dot-for-dot identical, and an unlabelled field publisher lights exactly the base panel plus a labelled field's dots.

### Coverage
- 10 new mutations were demonstrated, and each is recorded in the spec's `## Verification` (QA stage). Three of them turn only a QA row red, so no earlier test covered them:
  - the S8a early return removed (no pre-split test pinned it);
  - stop events stamped with the wrong player;
  - modes started during the game-over sequence.
- 11 pins from the implement stage and the patch subagent (P1, P2, P3, P5, P6, P7 x2, P8, P16, the deferred start, mode-major) were re-applied by QA. Each went red on its named test.
- AC1, AC2, AC4, AC6, AC7: already pinned. They were audited and no gap was found.
- AC9: gates green. 136 files / 2249 tests; `test/replays` is unchanged.

### Next Steps
- The lead's browser smoke (spec Design Notes).

## Story 3.2

Framework: Vitest (`pnpm test`, `test/**/*.test.ts`). The headless rows drive a whole `createRules()` through `runRulesScript()`. The physics rows compose a real `createMachine()` and a real `createRules()` by hand (the `driveLockLane()` convention; each tick's rules commands reach physics on the next tick, AD-4), over the committed collision document or Story 2.12's test-only V-cup addendum.

### Generated Tests (integration, real runtime)
- [x] `test/rules-lock-arbiter-qa.test.ts` (6 tests; its one `it.fails` row was flipped to a passing `it` at the code review, which fixed the defect; gated as headless in `test/rules-devices-headless.test.ts`'s `ENTRY_FILES`)
  - AC 6 (UJ-3) through a real Hot-seat. Start creates the game, a second Start joins player 2, and player 1's drain rotates to player 2. Nothing is hand-set. Player 1 locks twice, player 2's capture spits `{ player 1, credits 1, credited }`, and the credits end at `[2, 1]`.
  - The Mouth sequence: three parks (the third on the first pulse tick itself) make one show and pulses at LEAD, LEAD+INTERVAL and LEAD+2*INTERVAL. A park after the last pulse opens a new show with the full lead. A non-production tuning moves every pulse.
  - The pulse-tick "pending" boundary (EC4/IA1): a control, the one-eject expectation (was `it.fails`, fixed at the code review), and DW-297's no-stall evidence for an `eject_failed { bd_lock }`.
- [x] `test/lock-arbiter-qa-physics.test.ts` (4 tests)
  - DW-221 inside a LIVE save (the premise is asserted): an 800 mm/s Lock shot is locked, never saved. The serve is autolaunched without re-arming the save.
  - DW-281 on a real ball-search run: a genuinely stuck, tilted ball. The pass serves nothing. Physics' real recover gives `ball_missing { 1 }`, `ball_ended { tilted: true }`, then the rotation's one serve.
  - DW-282 on a real ball-search run: the stuck ball is freed onto `s_top_2` between the second trough slot and the recover. The pass never serves or recovers, and there is never a second ball on the table.
  - The pulse-tick boundary on real physics (constructed): one Mouth eject and no `eject_failed { bd_lock }` (before the code review's fix, a surplus pulse that physics answered with `eject_failed`).

### Coverage
- 8 mutations were demonstrated, and each is recorded in the spec's `## Verification` (QA stage).
- AC 6: the credited player comes from a real rotation for the first time.
- The interval anchor and the tunable read had no mutation before QA.
- DW-221, DW-281 and DW-282 were pinned only headless (DW-221 on physics without a live-save premise). They now also hold on real physics.
- One finding was pinned as a failing expectation (`it.fails`), since fixed at the code review (the pulse tick now counts as pending for ball search): the pulse-tick boundary makes ball search request a surplus Mouth eject. It is reachable at the rules surface with production tuning. Physics reaches it only through a constructed park that bypasses `s_lock_lane`.
- Gates: `pnpm test` 141 files / 2304 passed + 1 expected fail; `typecheck` and `check:headers` exit 0. No production file changed.

### Next Steps
- The lead decides the pulse-tick boundary (see the spec's QA-stage Verification and the QA report). Making ball search count the pulse tick as pending also moves `rules-lock-arbiter.test.ts`'s AC 7 second-stage pin by one tick.
- Story 3.3 pins the show on `FrameOutput.commands` (deferred VG5).

## Story 3.3

Framework: Vitest (`pnpm test`, `test/**/*.test.ts`). The headless rows drive a whole `createRules()` through `runRulesScript()`. The loop rows drive a real `createLoop({ collisionDoc, gameStart, tuning })` on production tuning, using AC5's measured recipe (an uncredited park on tick 5506).

### Generated Tests (integration, real runtime)
- [x] `test/rules-dragon-shows-qa.test.ts` (18 tests; headless, gated in `test/rules-devices-headless.test.ts`'s `ENTRY_FILES`)
  - AC2/AC3 on every Mouth request path, not only the park:
    - the spit;
    - the `bd_lock` overflow answer, in a game and in Attract;
    - a three-eject sequence, whose one close comes exactly H after the THIRD pulse;
    - ball search's two Lock stages, followed through to the last close.
    - On every path, open and close strictly alternate and every `c_mouth` pulse falls inside a pair.
  - AC3 requests inside the hold from the overflow answer and from the spit. The two boundaries: a request on the last pulse's own tick, and one on the close's due tick. Each gives exactly one close.
  - AC4:
    - `show_dragon_hit` in all four phases, under Tilt and under a Slam, each with an `s_dragon_d` negative;
    - one show per closed edge across ticks, and none while the switch is held;
    - [close, hit] on the close tick.
  - Boundaries: the hit is presentation only. The coils and every per-tick state are identical with and without it, and `dragon_hit` still reaches the base mode.
- [x] `test/dragon-shows-loop-qa-physics.test.ts` (2 tests)
  - AC5/AC6 fidelity. A recording wrapper around the real `createRules()` also adds hand-closed `s_dragon_body` edges, so the real rules emit same-tick pairs ([open, hit], [close, hit]) on real-loop ticks. `FrameOutput.commands` must carry exactly the rules' shows, in the same order and on the same ticks. It is checked two ways: one tick per `advance()`, and 97-tick chunks in which one chunk holds shows from two ticks.

### Coverage
- 10 mutations were demonstrated, and each is recorded in the spec's `## Verification` (QA stage). Four of them turn only a QA row red, so no earlier test covered them:
  - the pending close handled on the park path only (ball search, the overflow answer and the spit then let two opens meet);
  - the hit show gated out of `highscore_entry` and `game_over`;
  - `sim/loop` reversing a tick's shows, which the implement stage's AC5/AC6 miss because none of their shows share a tick;
  - `sim/loop` prepending shows across a multi-tick batch.
- AC1 and AC7: already pinned. They were audited and no gap was found.
- The rule that no mode emits a `CoilCommand` stays pinned at the type level (`rules-mode-stack.test.ts`, typecheck). The rule that the arbiter is the only `c_mouth` pulser is now partly pinned at runtime: every pulse must lie inside an open/close pair, so a bare S10 overflow pulse turns that red. A second pulser that fired only inside an open window would not (code review, 2026-09-29).
- Gates: `pnpm test` gives 145 files / 2341 tests, all passing. `typecheck`, `lint:boundaries` and `check:headers` each exit 0. No production file changed.

### Next Steps
- The lead's browser smoke (spec Design Notes).
- Story 3.3b (the rig) consumes these three shows from `FrameOutput.commands`. The loop-fidelity test is the seam it relies on.
