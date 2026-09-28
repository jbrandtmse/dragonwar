// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-3, AD-6, AD-7, AD-8: the priority-200 skill shot, this story's own
// charter (AD-6's Rule text, quoted in this story's Design Notes): "the
// devices layer emits it as `ball_launched`, on which the ball controller ...
// arms the skill shot (which closes on the next playfield closure that is
// not a Top lane)". Started SECOND (after the base mode, same tick, same
// `ball_starting`) so its own write reads lanes the base mode has ALREADY
// reset to all-false.
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
// first for THIS mode instance). Story 2.14 (below) leaves all of this
// unchanged -- it changes which lane is lit at `start()`, nothing about how
// or when `step()` resolves.
//
// Story 2.14 (DW-205, DW-214): the lit Top lane is no longer drawn fresh from
// `GameState.rng` at every ball start. Measured over 200,000 seeds, that
// per-ball draw put the SAME lane on all three balls 11.20% of the time and
// repeated on a consecutive pair 55.51% of the time -- contradicting
// `epics.md` Story 2.7 AC 5 ("the lit lane differs across balls") and PRD
// FR-18 ("the lit Top lane, rotating each plunge"). The fix, per the
// author's own binding decisions:
//
//   1. DW-205 (2026-09-07): the lit lane ADVANCES one position through
//      `TOP_LANES`, wrapping, each plunge -- it is not redrawn. A three-ball
//      repeat becomes impossible BY CONSTRUCTION, not merely unlikely.
//   2. DW-214 (2026-09-07): the STARTING position is still drawn from
//      `GameState.rng`, exactly ONCE per game (never a fixed start) -- the
//      author recorded that a fixed start would have made `GameStart.seed`
//      wholly unobservable in the shipped product, destroying the DW-201
//      pin (`test/rules-modes-integration.test.ts`) along with it.
//
// `gameLaneStart` (below) is a `number | null` field in this factory's OWN
// closure -- AD-7's sanctioned closure-state class, not a widened
// `GameState` -- because it meets that class's bar: reproducible from tick 0
// (`createRules()` builds a fresh `createSkillShotMode()` inside
// `createLoop()`, and a replay always starts from `GameStart` at tick 0),
// bounded (one small integer, `0..TOP_LANES.length - 1`), and restart-safe
// (overwritten at the next game's own first ball start, never carried into a
// second game). It is NOT a `GameState` field: `gameStateHash()` hashes the
// whole tree (`sim/loop/replay.ts`), so a machine- or player-scoped field
// would re-record all five golden state hashes, which AD-7 says needs the
// author's own grant -- and this story has none.
//
// The advance is keyed on the mode entry's OWN `player` argument and THAT
// player's own `state.players[player].ballNumber` -- never `currentPlayer`
// and never a machine-wide plunge counter. A machine-wide counter is
// arithmetically WRONG: with 3 lanes and P players, each player's own balls
// would advance by P positions, so at P = 3 every player would face the SAME
// lane on every ball -- the exact defect DW-205 exists to remove, made
// certain instead of merely likely. `ballNumber` is already player-scoped
// (correct for Hot seat), already hashed, and already correct by the time
// this runs (`modes/index.ts`'s own DEFERRED START: the ball controller's
// `startBall()` increments `ballNumber` the SAME tick it emits
// `ball_starting`, one tick before the mode stack's own deferred `start()`
// call reads it) -- so no new per-ball state is needed to advance by.
//
// The game boundary -- "did this ball start a NEW game, or continue one
// already in progress" -- is `player === 0 && ballNumber === 1`:
// `ball-controller.ts`'s own single new-game construction site always
// begins at `players: [emptyPlayer()]`, `currentPlayer: 0`, then
// `startBall(created, 0, tick)`, which is the only path that produces
// exactly that pair. `gameLaneStart === null` (this factory's own fresh
// state) is checked alongside it only so the very first game of a fresh
// `Rules` instance also draws, rather than reading a stale `null` as an
// index.
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
	/** `ball_starting`, called AFTER the base mode's own `start()` (the orchestrator's own ordering): lights the game's rotating Top lane -- drawn from `state.rng` once at the game's first ball, advanced one position per the player's own `ballNumber` on every other ball (Story 2.14) -- and pushes this mode's `ActiveModeState` entry (`launched: false`). */
	start(state: GameState, player: number): GameState;
	/** Tracks `ball_launched` and resolves on the first `playfield_switch_closed` after it -- award and a letter if that closure is the lit Top lane's own switch, no award otherwise, removed from `modes[]` either way. A no-op if no `skill_shot` entry is active. */
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): SkillShotModeStepResult;
}

export function createSkillShotMode(tuning: ResolvedTuning): SkillShotMode {
	// Story 2.14 (AD-7's closure-state class, this file's own header): the
	// game's own starting position, drawn once per game -- `null` until the
	// first game's own first ball start, then overwritten (never merely
	// left) at every subsequent game's own first ball start.
	let gameLaneStart: number | null = null;

	function start(state: GameState, player: number): GameState {
		const ballNumber = state.players[player]?.ballNumber ?? 1;
		// Story 2.14: draw once per game -- either this factory has never
		// drawn at all (a fresh Rules instance's first game), or this ball is
		// the game boundary itself (ball-controller.ts's single new-game
		// site: player 0's own ball 1). Every OTHER ball start advances the
		// already-drawn starting position instead, taking no rng step at all.
		let rng = state.rng;
		if (gameLaneStart === null || (player === 0 && ballNumber === 1)) {
			const drawn = nextRngInt(state.rng, TOP_LANES.length);
			gameLaneStart = drawn.value;
			rng = drawn.rng;
		}
		const n = TOP_LANES.length;
		const laneIndex = ((gameLaneStart + ballNumber - 1) % n + n) % n;
		const drawn = TOP_LANES[laneIndex]!;
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
