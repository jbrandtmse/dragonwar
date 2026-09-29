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
