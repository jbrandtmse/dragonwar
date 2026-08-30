// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3: TICK_HZ is the single simulation-clock constant. No other file under
// sim/ may contain a literal millisecond or tick-rate number.

// PROVISIONAL - pending the author's macOS legs of Spike 1.
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
//                      the real remaining performance risk. It GATES.
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
// Two of the three gating paths are still unmeasured, so this value is NOT
// ratified. Ledger: "Author-owned: TICK_HZ ratification from Spike 1".
// Changing it re-records every golden replay (AD-3, AD-15).
export const TICK_HZ = 1000; // 1000 on PASS, 480 on FAIL

// Story 1.5 -- the loop's own TICK_HZ arithmetic (AD-3: "TICK_HZ may be named
// only here and in sim/table/tuning.ts"; the accumulator's helpers therefore
// live beside the constant they use, and sim/loop imports them from here
// rather than naming TICK_HZ itself). Every phrase above this comment block
// -- PROVISIONAL, NOT ratified, the ledger entry name, PENDING, macOS -- is
// pinned verbatim by test/time-contract.test.ts and is left untouched.
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
