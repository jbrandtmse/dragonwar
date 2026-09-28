// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3: "all rules randomness draws from GameState.rng" -- Match (Story
// 2.13) and the skill-shot lane draw (this story) are its only two consumers
// today, and no other source of randomness is permitted inside `sim/`
// (`Math.random` is lint-banned there -- `tools/boundary-lint.mjs:119`, rule
// `sim-no-banned-global`). `RngState` (`sim/contracts/state.ts`) is a bare
// `number` -- sufficient because a mulberry32/xorshift-class generator's
// entire state IS one 32-bit integer, this project's chosen construction
// needs nothing more to be deterministic, and a bare number is trivially
// JSON-serialisable (AD-7) and hashed into every replay's own
// `expectedGameStateHash` (`sim/loop/replay.ts`'s `gameStateHash()` hashes
// the whole `GameState`, `rng` included) with no bespoke (de)serialisation
// of its own.
//
// Pure, stateless functions -- no closure, no module-level variable (this
// file's own "Always" rule, mirroring the ball controller/devices layer's
// own factory-scoped state, though this module needs none of its own: every
// call is a function of its `rng` argument alone). `Math.imul` is used for
// the 32-bit integer multiplication mulberry32's mixing step needs; it is
// NOT one of `tools/boundary-lint.mjs`'s banned globals (only `Math.random`,
// `Date` and a handful of others are), so this compiles clean under
// `pnpm lint:boundaries`. No wall clock, no `Date`, no `globalThis` anywhere
// in this file.

import type { RngState } from '../contracts/state';

/** One mulberry32-class step: advances `rng` and derives a `[0, 1)` value from the ADVANCED state (never the input state), so `nextRng(0)` and `nextRng(nextRng(0).rng)` produce two DIFFERENT values, exactly the property a seeded sequence needs. */
export function nextRng(rng: RngState): { readonly rng: RngState; readonly value: number } {
	// mulberry32's own additive constant (0x6d2b79f5) and mixing step -- a
	// short, mechanical, widely-published public-domain construction (this
	// project's own test/frames.test.ts already carries the identical
	// arithmetic, test-only, for deterministic property-test data); no
	// third-party source file is copied or linked here.
	const advanced = (rng + 0x6d2b79f5) >>> 0;
	let mixed = advanced;
	mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
	mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
	const value = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	return { rng: advanced, value };
}

/**
 * A uniform integer in `[0, bound)`, drawn from one `nextRng()` step.
 * `bound` must be a positive integer (every current call site passes a
 * `TABLE`-derived set size, e.g. the Top lane set's own member count); this
 * function does not itself validate it, matching this file's "pure function
 * of its own arguments" scope -- a caller passing a non-positive bound is a
 * caller defect, not an `rng.ts` concern.
 */
export function nextRngInt(rng: RngState, bound: number): { readonly rng: RngState; readonly value: number } {
	const next = nextRng(rng);
	return { rng: next.rng, value: Math.floor(next.value * bound) };
}
