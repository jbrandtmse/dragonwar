// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.9 (AD-18): pure helpers over `machine.ballSave` (`BallSaveState`,
// `sim/contracts/state.ts`) -- one machine-scoped device, sources stack, the
// longest live window wins, Tilt disarms all. `sim/rules/ball-controller.ts`
// is the sole owner and caller of every function here: it alone pulses
// `c_trough_eject`/`c_autolaunch` and mutates `ballsInPlay`, this file only
// ever touches `BallSaveState` itself. Kept as a SEPARATE file, deliberately
// not folded into `ball-controller.ts`, so that module's own pinned
// `applyDeviceEvents()` contract (test/rules-devices.test.ts calls it
// directly) stays untouched by this story.
//
// `BallSaveState`'s serialized field set is FROZEN at exactly
// `{ untilTick, sources }` (spec Boundaries: "sources carries names only,
// with a single `untilTick` holding the effective (maximum) deadline") --
// `machine.ballSave` sits inside the hashed `GameState`, so widening it
// moves `expectedHash`/`expectedGameStateHash` on all five golden replays, a
// state-hash change outside this story's budget. The consequence: disarming
// the source that set the CURRENT maximum does not shrink `untilTick` to
// the next-longest surviving source's own window -- the frozen shape keeps
// no per-source deadline to recompute from, so the effective deadline only
// ever moves forward (via `armBallSave`) or drops straight to `null` (once
// every source is gone).
//
// Every predicate below takes the ALREADY-RESOLVED tick counts (never
// `TICK_HZ`, never `TUNING` itself -- AD-3/AD-15 confine that lookup to
// `shotWindowTicks()` in `sim/table/tuning.ts`, called by the ball
// controller once per read) and compares with an inclusive `<=`, matching
// the project's only two existing tick-window comparisons
// (`sim/rules/devices/shots.ts:67`, `sim/rules/devices/index.ts:296-300`).

import type { BallSaveState } from '../contracts/state';

/** `machine.ballSave`'s boot/reset value (`ball_will_start`, Story 2.5 -- unchanged by this story). */
export const EMPTY_BALL_SAVE: BallSaveState = { untilTick: null, sources: [] };

/**
 * Records `source` as enabled, with the timer left STOPPED (`untilTick`
 * unchanged) -- AC 1: "enable is not a start". A `source` already present
 * is a no-op, returning the SAME object.
 */
export function enableBallSave(state: BallSaveState, source: string): BallSaveState {
	if (state.sources.includes(source)) {
		return state;
	}
	return { untilTick: state.untilTick, sources: [...state.sources, source] };
}

/**
 * Arms (or re-arms) `source`'s own window: adds it to `sources` if absent,
 * and sets `untilTick` to the LATER of its current value and
 * `tick + ticks` (AD-18: "sources stack and the longest live window wins").
 * Never shrinks `untilTick` -- see this file's header, "what it costs".
 */
export function armBallSave(state: BallSaveState, args: { readonly ticks: number; readonly source: string }, tick: number): BallSaveState {
	const candidate = tick + args.ticks;
	const untilTick = state.untilTick === null ? candidate : Math.max(state.untilTick, candidate);
	const sources = state.sources.includes(args.source) ? state.sources : [...state.sources, args.source];
	if (untilTick === state.untilTick && sources === state.sources) {
		return state;
	}
	return { untilTick, sources };
}

/**
 * Removes `source` from `sources`. An unknown source is a no-op returning
 * the SAME object -- never throws (Conventions: "step paths never throw").
 * `untilTick` returns to `null` only once `sources` is empty (Boundaries:
 * "disarm must not be a no-op on the last source") -- never recomputed to a
 * shorter surviving source's own window (the frozen shape carries no
 * per-source deadline to recompute FROM; see this file's header).
 */
export function disarmBallSave(state: BallSaveState, source: string): BallSaveState {
	if (!state.sources.includes(source)) {
		return state;
	}
	const sources = state.sources.filter((existing) => existing !== source);
	return { untilTick: sources.length === 0 ? null : state.untilTick, sources };
}

/** `true` iff the timer has started and this tick has not yet passed the DISPLAYED expiry (`l_ball_save`'s `lit` span, AC 2) -- grace is excluded on purpose (PRD FR-19 defines grace as *past* the displayed expiry; `l_ball_save` follows the displayed window only, I/O matrix "Displayed expiry"). */
export function isRunning(state: BallSaveState, tick: number): boolean {
	return state.untilTick !== null && tick <= state.untilTick;
}

/** `true` iff `isRunning()` AND within the last `hurryUpTicks` of the displayed window (`l_ball_save`'s `lit`/step-3 span, AC 2). */
export function isWithinHurryUp(state: BallSaveState, tick: number, hurryUpTicks: number): boolean {
	return isRunning(state, tick) && tick > state.untilTick! - hurryUpTicks;
}

/** `true` iff this tick is PAST the displayed expiry but at or before the grace deadline (`untilTick + graceTicks`) -- the invisible half of the save window (I/O matrix "Drain inside grace"). Disjoint from `isRunning()`: exactly one of the two (or neither) is ever true for a given `state`/`tick`. */
export function isWithinGrace(state: BallSaveState, tick: number, graceTicks: number): boolean {
	return state.untilTick !== null && tick > state.untilTick && tick <= state.untilTick + graceTicks;
}

/** `true` once the grace has fully lapsed (I/O matrix "Grace lapsed": "the device is disarmed"). The ball controller resets the WHOLE device to `EMPTY_BALL_SAVE` when this is true -- a time-based expiry of every source at once, distinct from Story 2.11's later per-source Tilt `disarm()`. Evaluated by the controller BEFORE this tick's own device events are read (this file's header, and the same ordering `shots.ts`/`devices/index.ts` already use for their own window expiry). */
export function hasGraceLapsed(state: BallSaveState, tick: number, graceTicks: number): boolean {
	return state.untilTick !== null && tick > state.untilTick + graceTicks;
}
