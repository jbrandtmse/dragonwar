// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 (AD-9): `lampsOf(state, ballSaveHurryUpTicks)` is a PURE
// projection -- every
// `TABLE.lamps` key's current `{ role, step }`, recomputed WHOLE from
// `GameState` alone every rules step. It never mutates `state`, never
// produces a `LampCommand` itself, and is never called from a mode: AD-9's
// own rule text ("no mode ever issues a lamp command") holds because no mode
// imports this file at all. `sim/loop/index.ts` is the one place that diffs
// two consecutive calls into the `LampCommand` stream (AC 1) -- this
// story's `RulesStepResult.commands` stays `readonly never[]` unchanged
// (Design Notes: "AD-9 and AC 1 both agree that the diff lives in
// sim/loop").
//
// Every derived set is `Object.entries(TABLE.lamps)` (DW-149: never a
// second hand-typed lamp list) -- adding, renaming or removing a lamp in
// `TABLE.lamps` changes what this function iterates with no edit here.
//
// Reads the BASE MODE's own `player` field off `state.modes` (AD-7: the base
// mode owns `players[i].lanes`), never `state.currentPlayer` and never a
// literal `0` -- Story 2.7's own third vacuity was AD-7 player scoping never
// being exercised at a player index other than 0 (Code Map, task 21: "the
// whole matrix repeated with the base mode's player === 1 while
// currentPlayer === 0").
//
// With no base mode on the stack (Attract, and every tick between balls)
// every PLAYER-SCOPED lamp is `off/0`. `l_lock` is the one exception and is
// resolved before that guard: the Lock is MACHINE-scoped (AD-7), so an
// occupied `machine.deviceSlots.bd_lock` lights it with no base mode active
// -- see `projectLamp()` below, and `test/rules-lamps.test.ts`'s own
// "modes: [] with an OCCUPIED bd_lock" case, which pins it. [Code review
// pass 2: this header previously claimed "every lamp is off/0" flatly,
// contradicting `projectLamp()` twelve lines below it and the spec's own
// frozen I/O matrix. The divergence is real and is with the lead.]
//
// The five golden replays are unaffected either way: none of them ever
// presses `s_start`, and `bootDeviceSlots()` leaves `bd_lock` empty, so
// every lamp really is `off/0` throughout all five (Design Notes, "The
// golden budget"). That `bd_lock` precondition was previously unstated.

import { TABLE } from '../table/dragonwar';
import { isRunning, isWithinHurryUp } from './ball-save';
import type { BallSaveState } from '../contracts/state';
import type { GameState, LampName, LampState } from '../table/names';
import type { LampProjectionEntry } from '../contracts';

const ALL_OFF: LampProjectionEntry = { role: 'off', step: 0 };
const LIT_STEP_1: LampProjectionEntry = { role: 'lit', step: 1 };
const LIT_STEP_2: LampProjectionEntry = { role: 'lit', step: 2 };
const LIT_STEP_3: LampProjectionEntry = { role: 'lit', step: 3 };
const DRAGON_STEP_1: LampProjectionEntry = { role: 'dragon', step: 1 };

type LampDef = (typeof TABLE.lamps)[LampName];
type LampSubject = LampDef['subject'];

/** `true` iff `letter` (a lowercase `TABLE.dropBankWiring` key) has already been spelled -- `players[p].letters` is authored uppercase (`PlayerState.letters`'s own doc: `"DRA"`), so the comparison is case-insensitive on both sides rather than assuming either one's casing. */
function letterIsSpelled(letters: string, letter: string): boolean {
	return letters.toUpperCase().includes(letter.toUpperCase());
}

/** `true` iff any of `machine.deviceSlots.bd_lock`'s slots is currently occupied (AD-18: the Lock arbiter and `lockCredits` are Story 3.2's -- this reads `deviceSlots` directly, never `players[i].lockCredits`, which nothing writes yet). */
function lockOccupied(state: GameState): boolean {
	const slots = state.machine.deviceSlots.bd_lock;
	return slots.some((slot) => slot === true);
}

/**
 * `l_ball_save`'s own projection (Story 2.9, AD-9/AD-18): machine-scoped,
 * like `lock` -- resolved above the `!player` guard below, so it lights
 * with no base mode active at all. Tilt makes the device inert (AC 6);
 * otherwise `lit`/1 while the timer is RUNNING, `lit`/3 within the last
 * `hurryUpTicks` of that same displayed window, and `off` from the
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
 * One lamp's `{ role, step }`. `l_lock` (`subject.kind === 'lock'`) and
 * `l_ball_save` (`subject.kind === 'ball_save'`) are both resolved directly
 * off `machine` -- machine-scoped (AD-7), so both light with no base mode
 * active at all. Every other subject kind resolves against `player` (the
 * base mode's own, `undefined` with no base mode on the stack) and is
 * `off` in that case. `hurryUpTicks` is `l_ball_save`'s own resolved
 * `ballSaveHurryUpTicks` -- threaded in from `lampsOf()`'s own caller
 * rather than added to `GameState` (Code Map: "without adding a field to
 * GameState").
 */
function projectLamp(
	subject: LampSubject,
	state: GameState,
	player: GameState['players'][number] | undefined,
	skillShotActive: boolean,
	hurryUpTicks: number,
): LampProjectionEntry {
	if (subject.kind === 'lock') {
		return lockOccupied(state) ? DRAGON_STEP_1 : ALL_OFF;
	}
	if (subject.kind === 'ball_save') {
		return projectBallSave(state.machine.ballSave, state.machine.tilt.tilted, state.tick, hurryUpTicks);
	}
	if (!player) {
		return ALL_OFF;
	}
	if (subject.kind === 'letter') {
		return letterIsSpelled(player.letters, subject.letter) ? DRAGON_STEP_1 : ALL_OFF;
	}
	if (subject.kind === 'lane') {
		if (player.lanes.lit[subject.lane] !== true) {
			return ALL_OFF;
		}
		const isTopLane = TABLE.laneWiring[subject.lane].set === 'top';
		return skillShotActive && isTopLane ? LIT_STEP_2 : LIT_STEP_1;
	}
	// Story 2.9: an explicit exhaustiveness tail -- closes the narrowing hole
	// this story's own Code Map names ("the only exhaustiveness failure:
	// `:86` reads `subject.lane` after excluding `lock`/`letter`, so a
	// fourth arm fails `pnpm typecheck` there; there is no `assertNever`").
	// A fifth `LampSubject` kind now fails to compile HERE, rather than
	// silently falling through to the `lane` branch's own assumption.
	const neverSubject: never = subject;
	return neverSubject;
}

/**
 * Every `TABLE.lamps` key's current `{ role, step }` (AD-9, AC 1, AC 6).
 * `l_lock` and `l_ball_save` are both resolved directly off `machine`
 * (never player-scoped, since both are machine-scoped, AD-7) so they light
 * even with no base mode active; every lane/letter lamp instead resolves
 * against the base mode's own `player` and is `off` whenever no base mode is
 * on the stack. `ballSaveHurryUpTicks` is the caller's own resolved
 * `shotWindowTicks('ballSaveHurryUpMs', tuning)` (Story 2.9) -- `sim/rules`
 * itself never reaches for `TUNING`/`TICK_HZ` (AD-3/AD-15). Defaults to `0`
 * (no hurry-up span at all -- `l_ball_save` still correctly projects
 * `lit`/1 while running and `off` once expired) so every pre-Story-2.9
 * caller that has no opinion on the hurry-up window (`test/rules-lamps.test.ts`'s
 * many single-argument call sites) keeps compiling and passing unchanged.
 */
export function lampsOf(state: GameState, ballSaveHurryUpTicks = 0): LampState {
	const base = state.modes.find((mode) => mode.mode === 'base');
	const player = base ? state.players[base.player] : undefined;
	const skillShotActive = state.modes.some((mode) => mode.mode === 'skill_shot');

	const result = {} as Record<LampName, LampProjectionEntry>;
	for (const [name, def] of Object.entries(TABLE.lamps) as Array<[LampName, LampDef]>) {
		result[name] = projectLamp(def.subject, state, player, skillShotActive, ballSaveHurryUpTicks);
	}
	return result;
}
