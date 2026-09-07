// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 (AD-9): `lampsOf(state)` is a PURE projection -- every
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
// currentPlayer === 0"). With no base mode on the stack (Attract, and every
// tick between balls) every lamp is `off/0` -- which is also every one of
// this story's five golden replays, none of which ever presses `s_start`
// (Design Notes, "The golden budget").

import { TABLE } from '../table/dragonwar';
import type { GameState, LampName, LampState } from '../table/names';
import type { LampProjectionEntry } from '../contracts';

const ALL_OFF: LampProjectionEntry = { role: 'off', step: 0 };
const LIT_STEP_1: LampProjectionEntry = { role: 'lit', step: 1 };
const LIT_STEP_2: LampProjectionEntry = { role: 'lit', step: 2 };
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
 * One lamp's `{ role, step }`. `l_lock` (`subject.kind === 'lock'`) is
 * resolved directly from `machine.deviceSlots.bd_lock` -- machine-scoped
 * (AD-7), so it lights with no base mode active at all. Every other
 * subject kind resolves against `player` (the base mode's own, `undefined`
 * with no base mode on the stack) and is `off` in that case.
 */
function projectLamp(
	subject: LampSubject,
	state: GameState,
	player: GameState['players'][number] | undefined,
	skillShotActive: boolean,
): LampProjectionEntry {
	if (subject.kind === 'lock') {
		return lockOccupied(state) ? DRAGON_STEP_1 : ALL_OFF;
	}
	if (!player) {
		return ALL_OFF;
	}
	if (subject.kind === 'letter') {
		return letterIsSpelled(player.letters, subject.letter) ? DRAGON_STEP_1 : ALL_OFF;
	}
	// subject.kind === 'lane'
	if (player.lanes.lit[subject.lane] !== true) {
		return ALL_OFF;
	}
	const isTopLane = TABLE.laneWiring[subject.lane].set === 'top';
	return skillShotActive && isTopLane ? LIT_STEP_2 : LIT_STEP_1;
}

/**
 * Every `TABLE.lamps` key's current `{ role, step }` (AD-9, AC 1, AC 6).
 * `l_lock` is resolved from `machine.deviceSlots.bd_lock` directly (never
 * player-scoped, since the Lock itself is machine-scoped, AD-7) so it lights
 * even with no base mode active; every lane/letter lamp instead resolves
 * against the base mode's own `player` and is `off` whenever no base mode is
 * on the stack.
 */
export function lampsOf(state: GameState): LampState {
	const base = state.modes.find((mode) => mode.mode === 'base');
	const player = base ? state.players[base.player] : undefined;
	const skillShotActive = state.modes.some((mode) => mode.mode === 'skill_shot');

	const result = {} as Record<LampName, LampProjectionEntry>;
	for (const [name, def] of Object.entries(TABLE.lamps) as Array<[LampName, LampDef]>) {
		result[name] = projectLamp(def.subject, state, player, skillShotActive);
	}
	return result;
}
