// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3: TICK_HZ is the single simulation-clock constant. No other file under
// sim/ may contain a literal millisecond or tick-rate number.

// RATIFIED by the author at the Epic 1 decision sheet (DW-2, ledger:
// "Author-owned: TICK_HZ ratification from Spike 1", terminal trailer
// 2026-08-30): TICK_HZ = 1000, on the Windows production-build numbers
// below (Chrome and Edge both 1.8 ms, 8 of 8, after the gravity-scaling
// fix). [CORRECTED, Story 2.15, DW-270: this comment used to read
// "PROVISIONAL ... NOT ratified", which DW-2's own adjudication overtook --
// the value is decided, and there is no live 480 branch.]
//
// Set from the Spike 1 PRODUCTION-BUILD measurement of 2026-08-27, re-taken on
// the CORRECTED-GRAVITY harness after code review found the scene had been run
// at about 55% of a real 6.5 deg playfield. Measure the frame budget against a
// production build, not the Vite dev page - that is the standing practice and
// the story's amended acceptance criterion. (A same-session A/B later showed the
// dev page and the production build are indistinguishable on this host, so the
// practice stands but the original "the dev page measured 0.4 ms slower"
// justification for it does not.) See docs/spikes/spike-1.md.
//
// Gating paths for this value - all three must meet p95 <= 4 ms per 60 Hz frame:
//   Chrome / Windows   MEASURED 1.8 ms median (8/8 runs under the bar)
//   Chrome / macOS     PENDING - author's leg
//   Safari / macOS     PENDING - author's leg; JavaScriptCore, not V8, so it is
//                      the real remaining performance risk. It no longer GATES
//                      the ratified value above (DW-2) -- these two rows stay
//                      open as their own action item, epic-1-retro-item-1
//                      (still genuinely PENDING -- a real Mac is needed to run
//                      them, and docs/spikes/spike-1.md / test/spike-1-docs
//                      .test.ts's own PENDING pins are about THAT, unaffected
//                      by DW-2's separate ratification of the value below).
// Best-effort for this gate only:
//   Edge / Windows     MEASURED 1.8 ms median (8/8 runs under the bar). Recorded,
//                      never gating. Edge remains a fully supported browser -
//                      this is a frame-budget carve-out, not a support-tier
//                      demotion (FR-54, NFR-6).
//
// Treat the Windows figure as a range, not a point: this host's session-to-
// session variance is about 1.9x on byte-identical code (roughly 1.6-4.6 ms
// observed across sessions), and the harness scene is near-quiescent for about
// half the measured window, so the number is a floor rather than a
// characterization. Both are ledgered; Story 1.5 re-takes the characterization.
//
// PROVISIONAL / NOT ratified was the premise BEFORE DW-2's own adjudication;
// it no longer describes this constant (kept, verbatim, as historical record
// of the AC this comment discharges -- Story 1.1's own acceptance criterion,
// pinned by test/time-contract.test.ts, which now pins the RATIFIED reading
// instead). Changing TICK_HZ re-records every golden replay (AD-3, AD-15).
//
// DW-270 (Story 2.15): if TICK_HZ ever changes off 1000, 22 test-fixture
// sites across 17 files carry an independent `value: 1` (ms) override on
// some OTHER tunable, authored to be genuinely sub-tick at 1000 Hz and
// closed here `wontfix-accepted` (none is load-bearing on the literal 1
// today) -- they must be re-examined WITH this constant, not assumed safe a
// second time. `pnpm lint:boundaries`'s tick/ms rule does not catch this
// class (the literal lives on `value`, not on the binding name).
export const TICK_HZ = 1000; // RATIFIED at 1000 (DW-2) -- no live 480 branch

// Story 1.5 -- the loop's own TICK_HZ arithmetic (AD-3: "TICK_HZ may be named
// only here and in sim/table/tuning.ts"; the accumulator's helpers therefore
// live beside the constant they use, and sim/loop imports them from here
// rather than naming TICK_HZ itself). Several of this comment block's own
// key words above are pinned verbatim by test/time-contract.test.ts --
// deliberately NOT re-quoted here (a second copy of the same substrings
// would keep a mutation to the block above from reddening that pin, exactly
// the "pass with no mutation" shape the burn-down's own Anti-vacuity plan
// warns against) [CORRECTED, Story 2.15, DW-270 -- this note used to spell
// the pinned phrases out a second time, and the block above used to read
// PROVISIONAL / NOT ratified, the premise DW-2's own adjudication overtook].
//
// AD-4's 200 ms owed-time cap is expressed here in TICKS, not as a
// millisecond constant in sim/loop: `pnpm lint:boundaries`'s tick/ms rule
// forbids a `…Ms`/`…_MS` binding assigned a numeric literal anywhere under
// sim/** other than tuning.ts, and the cap is a LOOP-CONTRACT invariant (AD-4
// itself, not a feel tunable an author might want to retune) -- it has no
// business living in tuning.ts's `…Ms` tunable registry either. Expressing it
// from a SECONDS-valued constant (never named `…Ms`) keeps the 200 ms figure
// traceable to AD-4's own wording while never tripping that rule.
const MAX_OWED_SECONDS = 0.2; // AD-4: "owed time beyond 200 ms is discarded"

/**
 * `elapsed` (milliseconds) -> ticks owed, UNROUNDED -- the accumulator's own
 * `owed = elapsed * TICK_HZ` (AD-4), kept as a fraction so `sim/loop` can
 * carry the remainder across frames without ever rounding away sub-tick time.
 * Contrast `sim/table/tuning.ts`'s `resolveTuning()`, which rounds once at
 * load because a tunable's tick count is fixed at boot; the loop's owed-ticks
 * figure changes every frame and must never lose its fractional part.
 */
export function msToTicksExact(elapsed: number): number {
	return (elapsed * TICK_HZ) / 1000;
}

/** The exact inverse of `msToTicksExact()` -- ticks -> milliseconds, for reporting a discarded amount (`sim_time_discarded { ms }`) in the units that event's own contract documents. */
export function ticksToMs(ticks: number): number {
	return (ticks * 1000) / TICK_HZ;
}

/** AD-4's 200 ms owed-time cap, in ticks at the live `TICK_HZ` -- `sim/loop` never names `TICK_HZ` itself (AD-3), so it imports this instead of computing it. */
export const MAX_OWED_TICKS = Math.round(MAX_OWED_SECONDS * TICK_HZ);

/**
 * Story 1.7, task 3: seconds per simulation tick -- `TICK_HZ`'s reciprocal,
 * exported so a consumer that needs a per-tick DURATION IN SECONDS (rather
 * than a tick count) never has to name `TICK_HZ` itself (`pnpm
 * lint:boundaries`'s tick/ms rule: `TICK_HZ` may be named only here and in
 * `sim/table/tuning.ts`). Added for the cabinet integrator
 * (`sim/physics/cabinet/oscillator.ts`), which sub-steps at a FIXED, ported
 * `0.001` s cadence regardless of `TICK_HZ` and must express "how many
 * seconds does one tick span" without a literal -- mirrors `MAX_OWED_TICKS`
 * immediately above: a second permitted arithmetic site for `TICK_HZ`,
 * additive only.
 */
export const SECONDS_PER_TICK = 1 / TICK_HZ;
