// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 (AD-9): the ONE `(role, step)` -> RGB/intensity/cadence table.
// Rules speak roles and steps (`src/sim/rules/lamps.ts`'s `lampsOf()`);
// only this file -- and everything under `presentation/lighting/` that
// reads it -- ever names a colour. Pure and Babylon-free, the same tier
// `presentation/backglass/raster.ts` occupies (its own header: "no Babylon
// import at all"), so this file is unit-testable with no scene at all
// (`test/lighting-grammar.test.ts`).
//
// Every RGB triple, intensity and blink period below is authored from PRD
// FR-44's own six colour words -- no colour-science snippet, no easing
// curve, no light-falloff formula, no third-party palette (this story's own
// Never section; Design Notes, "No third-party material enters this
// story").

import type { LampRole, LampStep } from '../../sim/contracts/commands';

/** One authored colour, 0..1 per channel -- never anything Babylon-specific (this file has no `@babylonjs/*` import). */
export interface LampColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

/**
 * PRD FR-44's held `(role -> colour)` mapping, authored once. `off` and
 * `hurryup`/`quickmb`/`joust`/`special` (Story 2.8 declares but never emits
 * the latter four -- Stories 3.5/3.6/3.7/3.10 own their producers) are all
 * present so `lookupGrammar()` below never needs a fallback branch for a
 * role this union can name.
 */
export const LAMP_GRAMMAR: Readonly<Record<Exclude<LampRole, 'off'>, LampColor>> = {
	lit: { r: 1, g: 1, b: 1 },
	hurryup: { r: 1, g: 0, b: 0 },
	quickmb: { r: 0, g: 1, b: 0 },
	joust: { r: 0, g: 0, b: 1 },
	dragon: { r: 1, g: 0.5, b: 0 },
	special: { r: 0.6, g: 0, b: 1 },
};

/** One `(role, step)` lookup's full presentation grammar: colour, intensity and blink cadence (`null` = steady). */
export interface LampGrammarEntry extends LampColor {
	readonly intensity: number;
	readonly blinkPeriodMs: number | null;
}

/** `off` at any step, or a lit role at step 0 (never emitted by `lampsOf()`, but total rather than partial): no colour, no light, no blink. */
const OFF_LOOKUP: LampGrammarEntry = { r: 0, g: 0, b: 0, intensity: 0, blinkPeriodMs: null };

/** Step 1/2/3's own intensity and blink cadence -- authored, strictly increasing intensity, strictly decreasing (faster) blink period as step rises (AC 3). Index 0 is never read (step 0 always resolves to `OFF_LOOKUP` below) but keeps this a direct `LampStep`-indexed lookup rather than an off-by-one array. */
const STEP_LOOKUP: readonly { readonly intensity: number; readonly blinkPeriodMs: number | null }[] = [
	{ intensity: 0, blinkPeriodMs: null }, // step 0 -- unused, see above
	{ intensity: 1.0, blinkPeriodMs: null },
	{ intensity: 1.4, blinkPeriodMs: 500 },
	{ intensity: 1.8, blinkPeriodMs: 160 },
];

/**
 * The one `(role, step)` -> RGB/intensity/cadence lookup (AD-9, AC 3). `off`
 * (at any step) and step `0` (for any role) both resolve to all-zero, no
 * blink -- total over every `LampRole` x `LampStep` combination, never
 * throwing.
 */
export function lookupGrammar(role: LampRole, step: LampStep): LampGrammarEntry {
	if (role === 'off' || step === 0) {
		return OFF_LOOKUP;
	}
	const color = LAMP_GRAMMAR[role];
	const { intensity, blinkPeriodMs } = STEP_LOOKUP[step];
	return { r: color.r, g: color.g, b: color.b, intensity, blinkPeriodMs };
}

/**
 * `true` for the "on" half of a blink cycle, `false` for the "off" half --
 * blinking is timed entirely in presentation (AD-9), never in rules. A
 * steady (non-blinking) grammar entry (`blinkPeriodMs: null`) is always on.
 * `nowMs` is wall-clock milliseconds (e.g. `performance.now()`); this
 * function performs no clock read of its own.
 */
export function isLampOnAt(blinkPeriodMs: number | null, nowMs: number): boolean {
	if (blinkPeriodMs === null || blinkPeriodMs === 0) {
		// No `STEP_LOOKUP` entry produces 0 today (code review, defensive):
		// `nowMs % 0` is `NaN`, which would otherwise make `NaN < 0` -- always
		// `false` -- silently read as permanently OFF rather than steady-on.
		return true;
	}
	return (nowMs % blinkPeriodMs) < blinkPeriodMs / 2;
}
