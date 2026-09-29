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
// unchanged -- it changes which lane is lit at the start, nothing about how
// or when the shot resolves.
//
// Story 3.1 (AD-8): `createSkillShotMode(tuning)` builds this mode's
// `ModeDefinition` (`./registry.ts`). Resolving -- a hit, a miss, or a
// parking entry -- returns `stop: true`; the stack then stops the entry
// through `./lifecycle.ts`, which fires the `_will_stop / _stopping /
// _stopped` events and removes it. This file never adds or removes a
// `modes[]` entry itself. The skill shot's `lamps` hook lights each lit Top
// lane of its own player at `lit/2`, above the base mode's `lit/1`.
//
// Story 3.0 (DW-232, AD-6 amended 2026-09-29): a launched skill shot ALSO
// closes, with no award, on the first `device_ball_entered` into a
// `parking` device -- the trough drain, or the Lock. PRD FR-18: "the Skill shot is only
// available until the first other switch closes", and the trough switch is
// such a switch. It matters for a no-switch drain inside the ball-save
// window: the ball never closed a playfield switch, so the shot stayed armed
// through the save, and the save's AUTOMATIC re-launch then got a second
// attempt at the lit lane with no player aim behind it. Now the drain
// closes it, so the re-launch finds nothing to arm. The device kind is read
// from `TABLE.ballDevices`, never a device-name literal; the shooter lane is
// `non-parking`, so a weak plunge that rolls back onto the plunger does not
// close it. A ball-search recover of a launched ball closes it the same way.
// The lit Top lane stays lit, exactly as it does after a miss.
//
// Story 3.0a (DW-246, AD-8 amended): the award goes through
// `sim/rules/scoring.ts`'s `awardScore()` and the letter through its
// `addDragonLetters()`, both only while `scoringOpen()` -- so a Tilted ball
// (or any state outside a game) gets neither. The mode still resolves and
// stops exactly as before; only the payout is withheld.
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
// this runs (the ball controller's `startBall()` increments `ballNumber`
// before it emits `ball_starting`, and the stack starts this mode later in
// that same `rules.step`, Story 3.1) -- so no new per-ball state is needed to
// advance by.
//
// The game boundary -- "did this ball start a NEW game, or continue one
// already in progress" -- is `player === 0 && ballNumber === 1`:
// `ball-controller/start.ts`'s own single new-game construction site always
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
import { addDragonLetters, awardScore, scoringOpen } from '../scoring';
import { soloModeDriver, type SoloModeDriver } from './lifecycle';
import { MODE_PRIORITIES } from './priorities';
import type { DeviceEvent } from '../devices';
import type { ResolvedTuning } from '../../table/tuning';
import type { ActiveModeState } from '../../contracts/state';
import type { LampProjectionEntry } from '../../contracts';
import type { GameState, LampName } from '../../table/names';
import type { ModeDefinition, ModeHookResult, ModeLampRoles } from './registry';

type LaneName = keyof typeof TABLE.laneWiring;

/** AD-8: the skill shot's own fixed priority -- `MODE_PRIORITIES.skill_shot` (`./priorities.ts`), above the base mode's, so it is the DMD's top mode (Story 2.6 AC 5) for as long as it is active. */
export const SKILL_SHOT_MODE_PRIORITY = MODE_PRIORITIES.skill_shot;

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

const LIT_STEP_2: LampProjectionEntry = { role: 'lit', step: 2 };

/** Every `TABLE.lamps` lane lamp whose lane is a Top lane, paired with that lane -- derived once (DW-149). */
const TOP_LANE_LAMPS: ReadonlyArray<readonly [LampName, LaneName]> = (Object.entries(TABLE.lamps) as Array<[LampName, (typeof TABLE.lamps)[LampName]]>).flatMap(
	([name, def]) => {
		const subject = def.subject;
		return subject.kind === 'lane' && TOP_LANES.includes(subject.lane) ? [[name, subject.lane] as const] : [];
	},
);

/**
 * Story 3.1 (AD-9, the skill shot's `lamps` hook): each lit Top lane of this
 * entry's OWN player is `lit/2` -- emphasised over the base mode's `lit/1`
 * while the shot is live, because `lampsOf()` applies the higher priority
 * last. Pure and tuning-free.
 */
export function skillShotLamps(state: GameState, entry: ActiveModeState): ModeLampRoles {
	const player = state.players[entry.player];
	if (!player) {
		return {};
	}
	const roles: Partial<Record<LampName, LampProjectionEntry>> = {};
	for (const [lamp, lane] of TOP_LANE_LAMPS) {
		if (player.lanes.lit[lane] === true) {
			roles[lamp] = LIT_STEP_2;
		}
	}
	return roles;
}

/** The skill shot's `ModeDefinition`, plus the `start` / `step` pair for driving it alone in a test (`soloModeDriver()`, `./lifecycle.ts`). */
export interface SkillShotMode extends ModeDefinition, SoloModeDriver {
	readonly name: 'skill_shot';
}

export function createSkillShotMode(tuning: ResolvedTuning): SkillShotMode {
	// Story 2.14 (AD-7's closure-state class, this file's own header): the
	// game's own starting position, drawn once per game -- `null` until the
	// first game's own first ball start, then overwritten (never merely
	// left) at every subsequent game's own first ball start.
	let gameLaneStart: number | null = null;

	/** `_will_start` -> `_starting`: the new entry starts un-launched. */
	function onStart(): Readonly<Record<string, unknown>> {
		return { launched: false };
	}

	/** `_starting`, after the base mode's own (ascending priority): lights the game's rotating Top lane for the entry's player -- drawn from `state.rng` once at the game's first ball, advanced one position per the player's own `ballNumber` on every other ball (Story 2.14). */
	function onStarting(state: GameState, entry: ActiveModeState): GameState {
		const player = entry.player;
		const ballNumber = state.players[player]?.ballNumber ?? 1;
		// Story 2.14: draw once per game -- either this factory has never
		// drawn at all (a fresh Rules instance's first game), or this ball is
		// the game boundary itself (the ball controller's single new-game
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
		return { ...state, players, rng };
	}

	/**
	 * Tracks `ball_launched` and resolves on the first `playfield_switch_closed`
	 * after it -- award and a letter if that closure is the lit Top lane's own
	 * switch, no award otherwise, `stop: true` either way. Story 3.0 (DW-232):
	 * a `device_ball_entered` into a `parking` device after `ball_launched`
	 * (the trough drain, or the Lock) also resolves it, with no award.
	 */
	function onEvent(state: GameState, entry: ActiveModeState, event: DeviceEvent): ModeHookResult {
		if (event.type === 'ball_launched') {
			const modes = state.modes.map((mode) => (mode === entry ? { ...mode, launched: true } : mode));
			return { state: { ...state, modes } };
		}

		// Story 3.0 (DW-232): a parking entry (the drain, or the Lock) closes a
		// launched skill shot with no award, exactly as a missed playfield
		// closure does (this file's own header). Kind read from
		// `TABLE.ballDevices`, never a name literal.
		if (event.type === 'device_ball_entered' && TABLE.ballDevices[event.device].kind === 'parking') {
			return entry.launched === true ? { state, stop: true } : { state };
		}

		if (event.type !== 'playfield_switch_closed') {
			return { state };
		}
		if (entry.launched !== true) {
			// AD-6's Rule text: a closure before the ball has left the shooter
			// lane must not resolve the mode -- it stays armed and shown.
			return { state };
		}

		const player = entry.player;
		const target = state.players[player];
		const litTopLane = target ? TOP_LANES.find((lane) => target.lanes.lit[lane] === true) : undefined;
		const matched = litTopLane !== undefined && TABLE.laneWiring[litTopLane].switch === event.switch;

		let players = state.players;
		if (matched && target && scoringOpen(state)) {
			const letter = nextUnspelledLetter(target.letters);
			players = awardScore(state, player, tuning.skillShotAward.value).players.map((existing, index) =>
				index === player && letter !== undefined ? { ...existing, letters: addDragonLetters(existing.letters, letter) } : existing,
			);
		}

		return { state: { ...state, players }, stop: true };
	}

	const definition: ModeDefinition & { readonly name: 'skill_shot' } = {
		name: 'skill_shot',
		priority: SKILL_SHOT_MODE_PRIORITY,
		onStart,
		onStarting,
		onEvent,
		lamps: skillShotLamps,
	};

	return { ...definition, ...soloModeDriver(definition) };
}
