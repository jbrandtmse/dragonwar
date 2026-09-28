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
// Factory + closure (this story's own "Always" rule) -- though this mode
// needs no cross-tick state of its OWN: every write lands on `GameState`
// (`players[i].lanes`, `modes[]`), never a module-level or closure-local
// variable. `createBaseMode()` still returns `{ start, step }` from a
// factory, mirroring `createDevicesLayer()`/`createBallController()`,
// because a bare exported function pair would make this module structurally
// different from every other stateful-looking rules component for no
// reason -- and Story 3.1's generalisation will need each mode instantiated
// once per stack, not called as bare module functions.

import { TABLE } from '../../table/dragonwar';
import type { DeviceEvent, FlipperSide, LaneName } from '../devices';
import type { ActiveModeState, PlayerLaneState } from '../../contracts/state';
import type { GameState } from '../../table/names';
import type { LaneSetName, ModeEvent } from './events';

/** AD-8: the base mode's own fixed priority. */
export const BASE_MODE_PRIORITY = 100;

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

export interface BaseModeStepResult {
	readonly state: GameState;
	readonly events: readonly ModeEvent[];
}

export interface BaseMode {
	readonly mode: 'base';
	readonly priority: number;
	/** `ball_starting` (AD-7): pushes this mode's `ActiveModeState` entry for `player` and resets every lane's `lit` flag to false. `completedSets` is untouched -- it accumulates for the whole game, never reset per ball. */
	start(state: GameState, player: number): GameState;
	/** Applies every one of this tick's `DeviceEvent`s, IN ARRAY ORDER, to the currently active base-mode instance (a no-op if none is active -- e.g. Attract, AC 7). */
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): BaseModeStepResult;
}

export function createBaseMode(): BaseMode {
	function start(state: GameState, player: number): GameState {
		const lit: Record<string, boolean> = {};
		for (const lane of ALL_LANES) {
			lit[lane] = false;
		}
		const players = state.players.map((existing, index) =>
			index === player ? { ...existing, lanes: { ...existing.lanes, lit } } : existing,
		);
		const activeMode: ActiveModeState = { mode: 'base', priority: BASE_MODE_PRIORITY, player };
		return { ...state, players, modes: [...state.modes, activeMode] };
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

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): BaseModeStepResult {
		let nextState = state;
		const events: ModeEvent[] = [];
		for (const event of deviceEvents) {
			const active = nextState.modes.find((mode) => mode.mode === 'base');
			if (!active) {
				continue;
			}
			if (event.type === 'lane_entered') {
				const result = applyLaneEntered(nextState, active.player, event.lane, tick);
				nextState = result.state;
				events.push(...result.events);
			} else if (event.type === 'lane_change_pressed') {
				nextState = applyLaneChangePressed(nextState, active.player, event.side);
			}
		}
		return { state: nextState, events };
	}

	return { mode: 'base', priority: BASE_MODE_PRIORITY, start, step };
}
