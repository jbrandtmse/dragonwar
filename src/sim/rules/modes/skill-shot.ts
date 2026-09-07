// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3, AD-6, AD-7, AD-8: the priority-200 skill shot, this story's own
// charter (AD-6's Rule text, quoted in this story's Design Notes): "the
// devices layer emits it as `ball_launched`, on which the ball controller ...
// arms the skill shot (which closes on the next playfield closure that is
// not a Top lane)". Started SECOND (after the base mode, same tick, same
// `ball_starting`) so its own draw reads lanes the base mode has ALREADY
// reset to all-false (AD-7: "the skill-shot mode writes the lit Top lane
// once on `ball_starting` from `rng` and never again").
//
// Resolves on the FIRST `playfield_switch_closed` at or after `ball_launched`
// -- never earlier (a closure while the ball still sits in the shooter lane,
// theoretically scriptable even though no real physics path produces one,
// must not resolve it) and never later than the very next one. Whether that
// closure was launched-after is mode-LOCAL state (`launched: boolean`,
// AD-7's own "mode-local fields stay under `modes[i]`" -- the open index
// signature `ActiveModeState` carries for exactly this), never a rules-wide
// flag and never inferred from `machine.ballsInPlay` (which is shared across
// every ball in play and says nothing about which specific closure comes
// first for THIS mode instance).
//
// Consumes `DeviceEvent` only (AD-19); draws from `GameState.rng` via
// `sim/rules/rng.ts` (AD-3), never `Math.random`. Reads the award from the
// `ResolvedTuning` passed at construction -- never the raw `TUNING` singleton
// directly -- so a test's `resolveTuning(overrideTuning)` (the tuning
// override seam every other rules component honours) is not silently
// bypassed for this one value.

import { TABLE } from '../../table/dragonwar';
import { nextRngInt } from '../rng';
import type { DeviceEvent } from '../devices';
import type { ResolvedTuning } from '../../table/tuning';
import type { ActiveModeState } from '../../contracts/state';
import type { GameState } from '../../table/names';
import type { ModeEvent } from './events';

type LaneName = keyof typeof TABLE.laneWiring;

/** AD-8: the skill shot's own fixed priority -- above the base mode's 100, so it is the DMD's top mode (Story 2.6 AC 5) for as long as it is active. */
export const SKILL_SHOT_MODE_PRIORITY = 200;

/** The 'top' set's own members, ordered ascending by `order` -- computed once (DW-149), shared by every instance. */
function buildTopLanes(): readonly LaneName[] {
	const members = (Object.keys(TABLE.laneWiring) as LaneName[]).filter((name) => TABLE.laneWiring[name].set === 'top');
	members.sort((a, b) => TABLE.laneWiring[a].order - TABLE.laneWiring[b].order);
	return members;
}

const TOP_LANES = buildTopLanes();

/** The first DRAGON letter (`TABLE.dropBankWiring`'s own key order) not already present in `letters` -- `undefined` once all six are spelled (I/O Matrix: "letters unchanged, no seventh letter, no duplicate"). */
function nextUnspelledLetter(letters: string): string | undefined {
	for (const key of Object.keys(TABLE.dropBankWiring)) {
		const upper = key.toUpperCase();
		if (!letters.includes(upper)) {
			return upper;
		}
	}
	return undefined;
}

export interface SkillShotModeStepResult {
	readonly state: GameState;
	/** Always empty -- the skill shot emits no `ModeEvent` of its own (only the base mode's `lanes_completed` exists today). Typed as the shared union for interface symmetry with `BaseModeStepResult`. */
	readonly events: readonly ModeEvent[];
}

export interface SkillShotMode {
	readonly mode: 'skill_shot';
	readonly priority: number;
	/** `ball_starting`, called AFTER the base mode's own `start()` (the orchestrator's own ordering): draws one Top lane from `state.rng`, lights it, and pushes this mode's `ActiveModeState` entry (`launched: false`). */
	start(state: GameState, player: number): GameState;
	/** Tracks `ball_launched` and resolves on the first `playfield_switch_closed` after it -- award and a letter if that closure is the lit Top lane's own switch, no award otherwise, removed from `modes[]` either way. A no-op if no `skill_shot` entry is active. */
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): SkillShotModeStepResult;
}

export function createSkillShotMode(tuning: ResolvedTuning): SkillShotMode {
	function start(state: GameState, player: number): GameState {
		const { rng, value } = nextRngInt(state.rng, TOP_LANES.length);
		const drawn = TOP_LANES[value]!;
		const target = state.players[player];
		const players = target
			? state.players.map((existing, index) =>
					index === player ? { ...existing, lanes: { ...existing.lanes, lit: { ...existing.lanes.lit, [drawn]: true } } } : existing,
				)
			: state.players;
		const activeMode: ActiveModeState = { mode: 'skill_shot', priority: SKILL_SHOT_MODE_PRIORITY, player, launched: false };
		return { ...state, players, rng, modes: [...state.modes, activeMode] };
	}

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): SkillShotModeStepResult {
		let nextState = state;
		for (const event of deviceEvents) {
			const activeIndex = nextState.modes.findIndex((mode) => mode.mode === 'skill_shot');
			if (activeIndex === -1) {
				// Not active this tick -- never started, or already resolved
				// earlier in THIS SAME event batch.
				continue;
			}
			const active = nextState.modes[activeIndex]!;

			if (event.type === 'ball_launched') {
				const modes = nextState.modes.map((mode, index) => (index === activeIndex ? { ...mode, launched: true } : mode));
				nextState = { ...nextState, modes };
				continue;
			}

			if (event.type !== 'playfield_switch_closed') {
				continue;
			}
			if (active.launched !== true) {
				// AD-6's Rule text: a closure before the ball has left the shooter
				// lane must not resolve the mode -- it stays armed and shown.
				continue;
			}

			const player = active.player;
			const target = nextState.players[player];
			const litTopLane = target ? TOP_LANES.find((lane) => target.lanes.lit[lane] === true) : undefined;
			const matched = litTopLane !== undefined && TABLE.laneWiring[litTopLane].switch === event.switch;

			let players = nextState.players;
			if (matched && target) {
				const letter = nextUnspelledLetter(target.letters);
				players = nextState.players.map((existing, index) =>
					index === player
						? {
								...existing,
								score: existing.score + tuning.skillShotAward.value,
								letters: letter !== undefined ? existing.letters + letter : existing.letters,
							}
						: existing,
				);
			}

			const modes = nextState.modes.filter((_mode, index) => index !== activeIndex);
			nextState = { ...nextState, players, modes };
		}
		return { state: nextState, events: [] };
	}

	return { mode: 'skill_shot', priority: SKILL_SHOT_MODE_PRIORITY, start, step };
}
