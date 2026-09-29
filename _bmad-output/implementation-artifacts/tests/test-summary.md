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
