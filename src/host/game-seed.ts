// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-201: `src/host/boot.ts` used to hardcode the real gameplay
// `GameStart.seed` to the literal `0`, so every real game on every machine
// drew the IDENTICAL skill-shot lane sequence -- `src/sim/rules/rng.ts`'s
// own algorithm, seeded at `0`, draws the same bound-3 lane index (`0`) on
// its first three calls, so the same Top lane lit on all three balls of
// every real game. Story 2.7's own AC 6 ("a fixed seed produces a
// byte-identical sequence twice; a different seed produces a different
// one") proved determinism under a seed the test CHOOSES; it said nothing
// about the seed the shipped product actually uses. This file is the fix:
// pick a genuinely different seed per real game, host-side.
//
// AD-3 is satisfied, not bypassed: `sim/` still draws every value it needs
// from `GameState.rng` alone, a pure function of whatever seed it is given.
// This file supplies that seed from OUTSIDE `sim/`, exactly where AD-14
// puts the host -- `GameStart` is the one bundle that crosses into `sim/`,
// and its `seed` field is precisely the seam this story's spec names
// ("Derive a real seed host-side ... and pass it through the existing
// GameStart.seed contract"). `Math.random`/`Date`/`crypto` are lint-banned
// only INSIDE `src/sim/**` (`tools/boundary-lint.mjs`'s `sim-no-banned-
// global` rule scans `src/sim/` alone) -- `src/host/**` is exactly where a
// real source of entropy belongs.
//
// Uses the Web Crypto API (`crypto.getRandomValues`) rather than
// `Math.random()`: it is available in every browser DragonWar targets and
// in the Node test runner alike (Node 19+, this repo's `vitest` runs on
// Node 24), needs no polyfill, and draws from the platform's own CSPRNG
// rather than a JS-visible PRNG state -- there is no reproducibility
// requirement AT THIS SEAM to trade away (the requirement is downstream, in
// `GameState.rng` itself, which this value only ever seeds once).
//
// Replay reproducibility is unaffected: whatever this function returns is
// recorded verbatim in `GameStart.seed`, which every replay header already
// carries (AD-15) -- a recorded replay reproduces the exact game it was
// recorded from regardless of how that game's own seed was first chosen.

/**
 * A real per-game seed for `GameStart.seed` -- a uniformly-distributed
 * unsigned 32-bit integer, never a constant. Host-side only (this module
 * lives under `src/host/`, never `src/sim/`); `sim/` still draws every
 * value it needs from `GameState.rng` alone (AD-3).
 */
export function deriveGameSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
