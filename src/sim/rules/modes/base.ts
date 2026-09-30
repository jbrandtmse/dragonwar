// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-7, AD-8, AD-11: the priority-100 minimal mode, always the first mode
// active on a ball (`sim/rules/modes/index.ts` starts it before the skill
// shot -- ascending priority -- so its own `ball_starting` reset lands
// before the skill shot draws its lane). Owns `players[i].lanes` (AD-7's
// own rule text: "lanes (lit flags and completed sets, owned by the base
// mode)") -- the lit pattern and the completed-set list are this mode's
// ENTIRE state; it carries no mode-local field of its own under `modes[i]`
// beyond the three every `ActiveModeState` already carries (`mode`,
// `priority`, `player`).
//
// Consumes `DeviceEvent`, never a raw `SwitchEvent` (AD-19: `sim/rules/devices/`
// is the only consumer of that type; this file names it nowhere, not even in
// a type-only import, per `tools/boundary-lint.mjs`'s `rules-no-switch-event-
// outside-devices` token scan). Every lane and set membership is read
// through `TABLE.laneWiring`, never a hand-typed list (AD-11, DW-149) --
// `LaneName`/`FlipperSide` are reached through the devices layer's own
// barrel (`../devices`), the same table-derived types `lane_entered`/
// `lane_change_pressed` already carry.
//
// Story 3.1 (AD-8): `createBaseMode(tuning)` builds this mode's
// `ModeDefinition` (`./registry.ts`) -- `onStarting` (the lane reset),
// `onEvent` (one device event at a time, fanned out event-major by the stack)
// and `lamps` (its letter and lane roles). It needs no cross-tick state of its
// OWN: every write lands on `GameState` (`players[i].lanes`, the score through
// `scoring.ts`), never a module-level or closure-local variable. It never adds
// or removes its own `modes[]` entry -- `./lifecycle.ts` does. The factory
// also keeps a `start` / `step` pair (`soloModeDriver()`) for direct tests of
// this one mode, routed through the same lifecycle functions.
//
// Story 3.0a (AD-8 amended 2026-09-29, DW-278): base playfield scoring lives
// here, in the priority-100 mode, so "scoring accrues from all active modes"
// holds from the first point. The mode pays its OWN `active.player`, never
// `currentPlayer` (the two agree in play, Hot seat included, but the payee
// is the mode's own player), from device events it already receives
// (AD-19, never a raw switch):
// - `playfield_switch_closed` on a `TABLE.popWiring` switch -> `popScore`;
//   on a `TABLE.slingWiring` switch -> `slingScore`. Both switch sets are
//   derived from `TABLE` once at module load. The Spinner's own switch is a
//   playfield switch too, but joins neither set: it scores only through
//   `spinner_spin`, never twice.
// - `spinner_spin { count }` -> `count x spinnerScore` (physics closes the
//   Spinner switch once per revolution).
// - `bank_completed` -> `dragonBankAward`, once per event. The letters are
//   NOT cleared: DRAGON stays spelled until Story 3.9's War end (FR-28,
//   FR-40).
// Every write goes through `sim/rules/scoring.ts`'s `awardScore()`, so none
// pays while Tilted or outside a game (FR-15 as decided at DW-246).
//
// Story 3.4 (FR-33): each Ramp completion (`${TABLE.modeWiring.lightShot}_made`)
// lights the next campaign Mode into the entry's player's `modesLit`, under
// `./campaign.ts`'s round rule, behind the same `scoringOpen()` gate. The
// tunables come from the `ResolvedTuning` passed at construction, never the
// raw `TUNING` singleton, so a test's `resolveTuning(override)` reaches them.

import { TABLE } from '../../table/dragonwar';
import { awardScore, scoringOpen } from '../scoring';
import { nextModeToLight } from './campaign';
import { soloModeDriver, type SoloModeDriver } from './lifecycle';
import { MODE_PRIORITIES } from './priorities';
import type { DeviceEvent, FlipperSide, LaneName } from '../devices';
import type { ActiveModeState, PlayerLaneState } from '../../contracts/state';
import type { LampProjectionEntry } from '../../contracts';
import type { GameState, LampName, ShotName, SwitchName } from '../../table/names';
import type { ResolvedTuning } from '../../table/tuning';
import type { LaneSetName, ModeEvent } from './events';
import type { ModeDefinition, ModeHookResult, ModeLampRoles } from './registry';

/** AD-8: the base mode's own fixed priority -- `MODE_PRIORITIES.base` (`./priorities.ts`), never a second literal. */
export const BASE_MODE_PRIORITY = MODE_PRIORITIES.base;

/** Every lane in `TABLE.laneWiring`, grouped by `set` and sorted ascending by `order` -- computed once at module load (a pure function of the frozen `TABLE`, DW-149's derive-not-duplicate convention), shared by every `createBaseMode()` instance exactly as `HARDWARE_COILS`/`PLAYFIELD_SWITCHES` are. */
function buildLaneSets(): ReadonlyMap<LaneSetName, readonly LaneName[]> {
	const bySet = new Map<LaneSetName, LaneName[]>();
	for (const name of Object.keys(TABLE.laneWiring) as LaneName[]) {
		const set = TABLE.laneWiring[name].set;
		const members = bySet.get(set) ?? [];
		members.push(name);
		bySet.set(set, members);
	}
	for (const members of bySet.values()) {
		members.sort((a, b) => TABLE.laneWiring[a].order - TABLE.laneWiring[b].order);
	}
	return bySet;
}

const LANE_SETS = buildLaneSets();

/** Every lane name, for the `ball_starting` all-false reset (AD-7: "resets `players[p].lanes.lit` to all-false for both groups"). */
const ALL_LANES: readonly LaneName[] = Object.keys(TABLE.laneWiring) as LaneName[];

/** Story 3.0a: the switch each `wiring` entry names, as a set -- derived from `TABLE` once (DW-149), never a hand-typed list (AD-16). */
function wiredSwitches(wiring: Readonly<Record<string, { readonly switch: SwitchName }>>): ReadonlySet<SwitchName> {
	return new Set(Object.values(wiring).map((entry) => entry.switch));
}

/** Story 3.0a (FR-31): the pop bumpers' own switches, from `TABLE.popWiring`. */
const POP_SWITCHES = wiredSwitches(TABLE.popWiring);

/** Story 3.0a (FR-31): the slingshots' own switches, from `TABLE.slingWiring`. */
const SLING_SWITCHES = wiredSwitches(TABLE.slingWiring);

/** Story 3.4 (FR-33): the device event that lights the next campaign Mode -- `${TABLE.modeWiring.lightShot}_made` (the Ramp), never a spelled-out shot name (AD-16). */
const LIGHT_MODE_EVENT: `${ShotName}_made` = `${TABLE.modeWiring.lightShot}_made`;

/**
 * Rotates every set's lit flags by one `order` position independently --
 * `'right'` toward increasing `order`, `'left'` toward decreasing, both
 * wrapping. A pure permutation of each set's own flags (AC 4: "the lit
 * count per set is unchanged"): every position in a set receives exactly one
 * other position's PRE-rotation flag, so no flag is created or dropped.
 */
function rotateLit(lit: Readonly<Record<string, boolean>>, side: FlipperSide): Readonly<Record<string, boolean>> {
	const shift = side === 'right' ? 1 : -1;
	const next: Record<string, boolean> = { ...lit };
	for (const members of LANE_SETS.values()) {
		const n = members.length;
		if (n === 0) {
			continue;
		}
		const before = members.map((name) => lit[name] === true);
		for (let i = 0; i < n; i++) {
			const targetIndex = ((i + shift) % n + n) % n;
			next[members[targetIndex]] = before[i];
		}
	}
	return next;
}

const LIT_STEP_1: LampProjectionEntry = { role: 'lit', step: 1 };
const DRAGON_STEP_1: LampProjectionEntry = { role: 'dragon', step: 1 };

type LampEntry = [LampName, (typeof TABLE.lamps)[LampName]];

/** Every `TABLE.lamps` entry, once (DW-149: never a second hand-typed lamp list). */
const LAMP_ENTRIES = Object.entries(TABLE.lamps) as LampEntry[];

/**
 * Story 3.1 (AD-9, the base mode's `lamps` hook): today's letter and lane
 * roles, for this entry's OWN player (AD-7: the base mode owns
 * `players[i].lanes`) -- a spelled DRAGON letter is `dragon/1` and a lit lane
 * is `lit/1`. Every other lamp is left to the layers below (`off/0`). Pure and
 * tuning-free, so `lampsOf()` (`sim/rules/lamps.ts`) calls it directly.
 */
export function baseModeLamps(state: GameState, entry: ActiveModeState): ModeLampRoles {
	const player = state.players[entry.player];
	if (!player) {
		return {};
	}
	const roles: Partial<Record<LampName, LampProjectionEntry>> = {};
	for (const [name, def] of LAMP_ENTRIES) {
		const subject = def.subject;
		if (subject.kind === 'letter') {
			if (player.letters.toUpperCase().includes(subject.letter.toUpperCase())) {
				roles[name] = DRAGON_STEP_1;
			}
		} else if (subject.kind === 'lane') {
			if (player.lanes.lit[subject.lane] === true) {
				roles[name] = LIT_STEP_1;
			}
		}
	}
	return roles;
}

export interface BaseModeStepResult {
	readonly state: GameState;
	readonly events: readonly ModeEvent[];
}

/** The base mode's `ModeDefinition`, plus the `start` / `step` pair for driving it alone in a test (`soloModeDriver()`, `./lifecycle.ts`). */
export interface BaseMode extends ModeDefinition, SoloModeDriver {
	readonly name: 'base';
}

export function createBaseMode(tuning: ResolvedTuning): BaseMode {
	/** `_starting` (AD-7): resets every lane's `lit` flag to false for the entry's player. `completedSets` is untouched -- it accumulates for the whole game, never reset per ball. */
	function onStarting(state: GameState, entry: ActiveModeState): GameState {
		const lit: Record<string, boolean> = {};
		for (const lane of ALL_LANES) {
			lit[lane] = false;
		}
		const players = state.players.map((existing, index) =>
			index === entry.player ? { ...existing, lanes: { ...existing.lanes, lit } } : existing,
		);
		return { ...state, players };
	}

	/** `lane_entered { lane }`: lights `lane`, then -- if every member of its `set` is now lit -- records the completion, emits `lanes_completed`, and resets that set's own flags. */
	function applyLaneEntered(state: GameState, player: number, lane: LaneName, tick: number): BaseModeStepResult {
		const target = state.players[player];
		if (!target) {
			return { state, events: [] };
		}
		const set = TABLE.laneWiring[lane].set;
		const members = LANE_SETS.get(set) ?? [];
		const lit: Record<string, boolean> = { ...target.lanes.lit, [lane]: true };
		const events: ModeEvent[] = [];
		let completedSets: readonly string[] = target.lanes.completedSets;
		if (members.length > 0 && members.every((member) => lit[member] === true)) {
			completedSets = [...completedSets, set];
			for (const member of members) {
				lit[member] = false;
			}
			events.push({ type: 'lanes_completed', set, tick });
		}
		const nextLanes: PlayerLaneState = { lit, completedSets };
		const players = state.players.map((existing, index) => (index === player ? { ...existing, lanes: nextLanes } : existing));
		return { state: { ...state, players }, events };
	}

	function applyLaneChangePressed(state: GameState, player: number, side: FlipperSide): GameState {
		const target = state.players[player];
		if (!target) {
			return state;
		}
		const lit = rotateLit(target.lanes.lit, side);
		const players = state.players.map((existing, index) =>
			index === player ? { ...existing, lanes: { ...existing.lanes, lit } } : existing,
		);
		return { ...state, players };
	}

	/** Story 3.4 (FR-33): appends `nextModeToLight()` to `players[player].modesLit`. Returns `state` itself when scoring is closed (`scoringOpen()`), the player is missing, or the round rule lights nothing. */
	function lightNextMode(state: GameState, player: number): GameState {
		const target = state.players[player];
		if (!scoringOpen(state) || !target) {
			return state;
		}
		const mode = nextModeToLight(target);
		if (mode === null) {
			return state;
		}
		const players = state.players.map((existing, index) => (index === player ? { ...existing, modesLit: [...existing.modesLit, mode] } : existing));
		return { ...state, players };
	}

	/** One device event for the active entry (the stack's event-major fan-out calls this once per event). Returns `state` itself when the event is not the base mode's. */
	function onEvent(state: GameState, entry: ActiveModeState, event: DeviceEvent, tick: number): ModeHookResult {
		const player = entry.player;
		if (event.type === 'lane_entered') {
			return applyLaneEntered(state, player, event.lane, tick);
		}
		if (event.type === 'lane_change_pressed') {
			return { state: applyLaneChangePressed(state, player, event.side) };
		}
		if (event.type === 'playfield_switch_closed') {
			// Story 3.0a (FR-31): pops and slings. Any other playfield switch,
			// the Spinner's included, pays nothing here.
			if (POP_SWITCHES.has(event.switch)) {
				return { state: awardScore(state, player, tuning.popScore.value) };
			}
			if (SLING_SWITCHES.has(event.switch)) {
				return { state: awardScore(state, player, tuning.slingScore.value) };
			}
			return { state };
		}
		if (event.type === 'spinner_spin') {
			// Story 3.0a (FR-26): "the Spinner awards per rotation".
			return { state: awardScore(state, player, event.count * tuning.spinnerScore.value) };
		}
		if (event.type === LIGHT_MODE_EVENT) {
			// Story 3.4 (FR-33): every Ramp completion lights the next campaign
			// Mode for this entry's own player, under the round rule
			// (`./campaign.ts`), behind the same gate as the DRAGON letters: no
			// lighting under Tilt or outside a game.
			return { state: lightNextMode(state, player) };
		}
		if (event.type === 'bank_completed') {
			// Story 3.0a (FR-28): the award, once per completion. Story 3.9
			// decides whether a completion during the War also pays (FR-28:
			// there a full bank "counts as Strikes instead of letters").
			return { state: awardScore(state, player, tuning.dragonBankAward.value) };
		}
		return { state };
	}

	const definition: ModeDefinition & { readonly name: 'base' } = {
		name: 'base',
		priority: BASE_MODE_PRIORITY,
		onStarting,
		onEvent,
		lamps: baseModeLamps,
	};

	return { ...definition, ...soloModeDriver(definition) };
}
