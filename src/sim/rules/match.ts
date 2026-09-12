// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13 (AD-3, AD-9): the Match number and its odds. Pure functions,
// no closure and no module-level mutable state (mirrors `sim/rules/rng.ts`'s
// own "every call is a function of its arguments alone" discipline) -- the
// ball controller is the only caller, and it is the only place `rng` is
// threaded through `GameState` (AD-3: "the Match number comes from exactly
// one `nextRng()` step of `GameState.rng`, taken at the draw tick").
//
// The weighted draw (I/O Matrix, "Weighted draw" row): `v` is the draw's
// `[0,1)` value; `p` is `matchProbability` clamped to [0,1]. W is the set of
// MATCH_NUMBERS values that equal some player's `score mod 100`; C is the
// rest of MATCH_NUMBERS. `v < p` picks uniformly within W (so P(match) = p
// exactly); otherwise it picks uniformly within C. If W is empty (no
// player's last two digits are a multiple of ten), a match is structurally
// impossible, so the draw is uniform over all of MATCH_NUMBERS with
// `winners: []` -- `probability` is not consulted on that path at all.
//
// `winners` is never special-cased per branch: it is always "every player
// index, ascending, whose `score mod 100 === number`" (the I/O Matrix's own
// definition), computed generically from whatever `number` was drawn. That
// is correct by construction on every path -- a number drawn from W belongs
// to at least one player by W's own definition; a number drawn from C or
// from the W-empty MATCH_NUMBERS fallback cannot equal any player's value,
// because C excludes exactly the values that do (and the W-empty path has no
// such values at all) -- so the generic computation alone reproduces the
// row's stated `winners: []` on both of those paths without a separate rule.

import type { RngState } from '../contracts/state';
import { nextRng } from './rng';

/** The ten values the Match can land on (I/O Matrix, "Match draw": `number` in {0,10,...,90}). */
export const MATCH_NUMBERS: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

/** The reveal's own step count -- one step per `MATCH_NUMBERS` member (I/O Matrix, "Reveal": ten `match_reveal_step` events). */
export const MATCH_REVEAL_STEPS = MATCH_NUMBERS.length;

/** Ascending player indices whose `score mod 100 === number` (I/O Matrix, "Match draw"). */
function winnersFor(number: number, scores: readonly number[]): readonly number[] {
	const winners: number[] = [];
	for (let index = 0; index < scores.length; index += 1) {
		if (scores[index]! % 100 === number) {
			winners.push(index);
		}
	}
	return winners;
}

/**
 * The weighted draw itself, as a pure function of one `[0,1)` value -- the
 * I/O Matrix's own "Weighted draw" row, verbatim. `probability` is clamped to
 * [0,1] here (never thrown on): a `p` outside that range "behaves as 0" or
 * "as 1" respectively.
 *
 * Review pass (blind-hunter, rework iteration 1): `c` (the `value >= p`
 * branch's own candidate set) is indexed unconditionally, and is safe only
 * because `w.length` -- the number of DISTINCT `score % 100` values across
 * `scores` -- can never reach `MATCH_NUMBERS.length` (10) while
 * `ball-controller.ts`'s own hot-seat gate caps a game at 4 players
 * (`nextState.players.length < 4`), so `c.length = 10 - w.length >= 6 > 0`
 * always. This function does not enforce that cap itself (`scores` is a
 * plain array here, not `GameState`), so it relies on it silently -- unlike
 * `devices.ts`'s own four-ball invariant, which throws rather than build a
 * path for its violation. Latent, not live: real only if a future story
 * raises the per-game player cap to 10 or more, letting every one of
 * `MATCH_NUMBERS`' ten slots collect a distinct player's own value at once.
 */
export function matchNumberFor(
	value: number,
	scores: readonly number[],
	probability: number,
): { readonly number: number; readonly winners: readonly number[] } {
	const p = Math.min(1, Math.max(0, probability));
	const playerValues = new Set(scores.map((score) => score % 100));
	const w = MATCH_NUMBERS.filter((candidate) => playerValues.has(candidate));
	const c = MATCH_NUMBERS.filter((candidate) => !playerValues.has(candidate));

	let number: number;
	if (w.length === 0) {
		// A match is structurally impossible: no player's last two digits are
		// a multiple of ten. Uniform over all ten, `probability` unconsulted.
		number = MATCH_NUMBERS[Math.floor(10 * value)]!;
	} else if (value < p) {
		number = w[Math.floor((value / p) * w.length)]!;
	} else {
		number = c[Math.floor(((value - p) / (1 - p)) * c.length)]!;
	}

	return { number, winners: winnersFor(number, scores) };
}

/**
 * `sim/rules/rng.ts`'s `nextRng()`, taken exactly once (AD-3), then folded
 * through `matchNumberFor()`. The caller (the ball controller) writes the
 * returned `rng` back into `GameState` -- this function never mutates its
 * argument, matching `nextRng()`'s own contract.
 */
export function drawMatch(
	rng: RngState,
	scores: readonly number[],
	probability: number,
): { readonly number: number; readonly winners: readonly number[]; readonly rng: RngState } {
	const drawn = nextRng(rng);
	const { number, winners } = matchNumberFor(drawn.value, scores, probability);
	return { number, winners, rng: drawn.rng };
}

/**
 * One reveal step's own displayed value (I/O Matrix, "Reveal": `shown:
 * (number + 10*step) mod 100`). Step 10 shows `number` itself (`10*10 = 100`,
 * `mod 100` cancels it) -- the resolution step, per the rules timeline.
 */
export function revealShown(number: number, step: number): number {
	return (number + 10 * step) % 100;
}
