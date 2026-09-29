// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 (AD-9): `lampsOf(state, ballSaveHurryUpTicks)` is a PURE
// projection -- every `TABLE.lamps` key's current `{ role, step }`,
// recomputed WHOLE from `GameState` (and the one threaded-in tick count)
// every rules step. It never mutates `state` and never produces a
// `LampCommand` itself; `sim/loop/index.ts` is the one place that diffs two
// consecutive calls into the `LampCommand` stream -- `RulesStepResult.commands`
// stays `readonly never[]` (AD-9: the diff lives in sim/loop).
//
// Story 3.1 (AD-8, AD-9: "modes contribute roles by priority"): this file
// reads each mode's `lamps` contribution. The composition, per lamp:
// - the MACHINE lamps (`subject.kind` `lock` and `ball_save`) keep their own
//   projection off `machine` (AD-7: machine-scoped, so they light with no
//   mode active at all -- an occupied `bd_lock` lights `l_lock`), and no mode
//   may override them;
// - every other lamp starts `off/0`, then each active mode's `lamps(state,
//   entry)` roles (`MODE_LAMP_ROLES`, `./modes`) are applied in ASCENDING
//   priority, so a higher mode overwrites a lower one per lamp. The base
//   mode contributes its own player's letter (`dragon/1`) and lane (`lit/1`)
//   roles; the skill shot contributes `lit/2` for each lit Top lane of its
//   player, which is why a lit Top lane reads `lit/2` while the shot is live.
// A mode reads its own entry's `player`, never `state.currentPlayer`. With
// no mode on the stack (Attract, and every tick between balls) every
// non-machine lamp is `off/0`. A mode never issues a lamp command: it only
// returns roles, and this projection decides.
//
// Every derived set is `Object.entries(TABLE.lamps)` (DW-149: never a
// second hand-typed lamp list) -- adding, renaming or removing a lamp in
// `TABLE.lamps` changes what this function iterates with no edit here.
//
// The five golden replays are unaffected: none of them ever presses
// `s_start` (so no mode is ever active), and `bootDeviceSlots()` leaves
// `bd_lock` empty, so every lamp really is `off/0` throughout all five.

import { TABLE } from '../table/dragonwar';
import { isRunning, isWithinHurryUp } from './ball-save';
import { MODE_LAMP_ROLES, type ModeLampHook } from './modes';
import type { BallSaveState } from '../contracts/state';
import type { GameState, LampName, LampState } from '../table/names';
import type { LampProjectionEntry } from '../contracts';

const ALL_OFF: LampProjectionEntry = { role: 'off', step: 0 };
const LIT_STEP_1: LampProjectionEntry = { role: 'lit', step: 1 };
const LIT_STEP_3: LampProjectionEntry = { role: 'lit', step: 3 };
const DRAGON_STEP_1: LampProjectionEntry = { role: 'dragon', step: 1 };

type LampDef = (typeof TABLE.lamps)[LampName];
type LampSubject = LampDef['subject'];

/** `true` iff any of `machine.deviceSlots.bd_lock`'s slots is currently occupied (AD-18: the Lock arbiter and `lockCredits` are Story 3.2's -- this reads `deviceSlots` directly, never `players[i].lockCredits`, which nothing writes yet). */
function lockOccupied(state: GameState): boolean {
	const slots = state.machine.deviceSlots.bd_lock;
	return slots.some((slot) => slot === true);
}

/**
 * `l_ball_save`'s own projection (Story 2.9, AD-9/AD-18): machine-scoped,
 * like `lock` -- it lights with no mode active at all. Tilt makes the device
 * inert (AC 6); otherwise `lit`/1 while the timer is RUNNING, `lit`/3 within
 * the last `hurryUpTicks` of that same displayed window, and `off` from the
 * displayed expiry onward. The grace period that follows a displayed
 * expiry is deliberately invisible here -- PRD FR-19 defines grace as
 * *past* the displayed expiry (I/O matrix, "Displayed expiry"), and
 * `isRunning()` already excludes it.
 */
function projectBallSave(ballSave: BallSaveState, tilted: boolean, tick: number, hurryUpTicks: number): LampProjectionEntry {
	if (tilted || !isRunning(ballSave, tick)) {
		return ALL_OFF;
	}
	return isWithinHurryUp(ballSave, tick, hurryUpTicks) ? LIT_STEP_3 : LIT_STEP_1;
}

/**
 * One lamp's base layer. `l_lock` (`subject.kind === 'lock'`) and
 * `l_ball_save` (`subject.kind === 'ball_save'`) are the MACHINE lamps,
 * resolved directly off `machine` (AD-7) and final -- `lampsOf()` never lets
 * a mode's roles override them. Every other subject kind starts `off/0`
 * here, and the active modes' roles are layered on top in `lampsOf()`.
 * `hurryUpTicks` is `l_ball_save`'s own resolved `ballSaveHurryUpTicks` --
 * threaded in from `lampsOf()`'s own caller rather than added to
 * `GameState` (Code Map: "without adding a field to GameState").
 */
function projectLamp(subject: LampSubject, state: GameState, hurryUpTicks: number): LampProjectionEntry {
	if (subject.kind === 'lock') {
		return lockOccupied(state) ? DRAGON_STEP_1 : ALL_OFF;
	}
	if (subject.kind === 'ball_save') {
		return projectBallSave(state.machine.ballSave, state.machine.tilt.tilted, state.tick, hurryUpTicks);
	}
	if (subject.kind === 'letter' || subject.kind === 'lane') {
		// Mode-composed (Story 3.1): off until an active mode's roles light it.
		return ALL_OFF;
	}
	// Story 2.9: an explicit exhaustiveness tail. A fifth `LampSubject` kind
	// fails to compile HERE, rather than silently falling through to an
	// earlier branch's own assumption.
	const neverSubject: never = subject;
	return neverSubject;
}

/** Each production mode's `lamps` hook by name (an own-key map, so an unregistered fixture name such as `stub` finds nothing). */
const LAMP_ROLES_BY_NAME: ReadonlyMap<string, ModeLampHook> = new Map(
	Object.entries(MODE_LAMP_ROLES).filter((pair): pair is [string, ModeLampHook] => pair[1] !== undefined),
);

/** `true` for the machine lamps -- the two subject kinds no mode may override. */
function isMachineLamp(subject: LampSubject): boolean {
	return subject.kind === 'lock' || subject.kind === 'ball_save';
}

/**
 * Every `TABLE.lamps` key's current `{ role, step }` (AD-9, AC 1, AC 6).
 * The machine lamps come off `machine`; every other lamp is `off/0` and then
 * takes each active mode's `lamps` roles, applied in ASCENDING priority so
 * the higher mode wins per lamp (this file's header). `ballSaveHurryUpTicks`
 * is the caller's own resolved `shotWindowTicks('ballSaveHurryUpMs', tuning)`
 * (Story 2.9) -- `sim/rules` itself never reaches for `TUNING`/`TICK_HZ`
 * (AD-3/AD-15). Defaults to `0` (no hurry-up span at all -- `l_ball_save`
 * still correctly projects `lit`/1 while running and `off` once expired) so
 * every caller with no opinion on the hurry-up window
 * (`test/rules-lamps.test.ts`'s many single-argument call sites) keeps
 * compiling and passing unchanged.
 */
export function lampsOf(state: GameState, ballSaveHurryUpTicks = 0): LampState {
	const result = {} as Record<LampName, LampProjectionEntry>;
	const entries = Object.entries(TABLE.lamps) as Array<[LampName, LampDef]>;
	for (const [name, def] of entries) {
		result[name] = projectLamp(def.subject, state, ballSaveHurryUpTicks);
	}

	const ascending = [...state.modes].sort((a, b) => a.priority - b.priority);
	for (const entry of ascending) {
		const hook = LAMP_ROLES_BY_NAME.get(entry.mode);
		if (!hook) {
			continue;
		}
		const roles = hook(state, entry);
		for (const [name, def] of entries) {
			const role = roles[name];
			if (role !== undefined && !isMachineLamp(def.subject)) {
				result[name] = role;
			}
		}
	}
	return result;
}
