// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's start seams, moved unchanged out
// of the Epic 2 monolith -- `emptyPlayer()`, `startBall()` (the start-of-ball
// lifecycle every ball start shares) and S6, the Start / Hot seat handling.
//
// AD-6 amended (DW-244, author decision 2026-09-11): EVERY `startBall()`
// call clears stray balls itself before serving -- one `RecoverCommand`
// always, and a trough pulse only into a genuinely empty `bd_shooter` (a
// ball already resting there IS the ball being served, never stacked under a
// second one) -- tracked by `ControllerState.pendingStrayClear`, whose own
// one-tick-later report (`./serve-recovery.ts`) is silent at count 0 and
// never serves.

import { TABLE } from '../../table/dragonwar';
import { EMPTY_BALL_SAVE, enableBallSave } from '../ball-save';
import { BONUS_EMPTY } from '../bonus';
import { gameOverResolved } from './game-over';
import { BALL_SAVE_SOURCE, HARDWARE_COILS, START_BUTTON, type ControllerContext, type StartBallResult, type TickOutput } from './shared';
import type { DeviceEvent } from '../devices';
import type { RecoverCommand } from '../../contracts/commands';
import type { BallWillStartEvent } from '../../contracts/events';
import type { PlayerState } from '../../contracts/state';
import type { CoilCommand, CoilName, GameState, MachineState } from '../../table/names';

export function emptyPlayer(): PlayerState {
	return {
		score: 0,
		letters: '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: BONUS_EMPTY,
		lanes: { lit: {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [],
		modesLit: [],
		ballNumber: 0,
	};
}

/** Start-of-ball lifecycle (AC 2/AC 5): `ball_will_start` -> reset -> `ball_starting` -> enable hardware -> `ball_started` -> queue the one serve pulse -- shared by the very first Start press and every later rotation. */
export function startBall(ctx: ControllerContext, state: GameState, playerIndex: number, tick: number): StartBallResult {
	const { cs, ballSearch } = ctx;
	const willStart: BallWillStartEvent = { type: 'ball_will_start', tick };

	// Code review pass 1: `ball_will_start` is this controller's own
	// ball-boundary reset point (AD-7) -- clearing `awaitingSaveLaunch`
	// here as well guarantees a stale flag from a save whose re-serve
	// never reached bd_shooter cannot leak into a LATER ball's own,
	// unrelated arrival at the shooter lane.
	cs.awaitingSaveLaunch = false;
	// Rework iteration 1 (DW-218): same reasoning, for the OTHER
	// cross-tick discriminator -- a stale record here would misclassify
	// the NEXT ball's own genuine first plunge as a non-arming relaunch,
	// permanently disabling that ball's ball-save window. (Rework
	// iteration 2: this reset is now a second, EARLIER line of defence --
	// the record's own bounded lifetime already guarantees it cannot
	// outlive `ballSaveGraceTicks`, but a ball rotation typically arrives
	// well before that timeout, so this stays the common path.)
	cs.awaitingSaveRelaunch = null;

	// Story 2.12 (Boundaries: "the search timer and schedule ... reset at
	// ball_will_start inside startBall()"). The held set is deliberately
	// NOT cleared here (Design Notes, "a hold that spans a ball boundary").
	ballSearch.reset();

	// AC 6: the per-ball reset. `bonus` resets whole to `BONUS_EMPTY` --
	// `byCategory` all-zero, `multiplier` back to the ladder's first rung
	// -- alongside the `ballNumber` increment this map already made;
	// `letters`, the score, `lockCredits` and `extraBalls` are untouched
	// (`sim/rules/bonus.ts`'s own header: the bonus reset is the ball
	// controller's, not `bonus.ts`'s own two folds, which never run at a
	// ball boundary).
	const players = state.players.map((player, index) =>
		index === playerIndex ? { ...player, ballNumber: player.ballNumber + 1, bonus: BONUS_EMPTY } : player,
	);

	// AD-7: "ball_will_start resets ballSave, tilt and multiball";
	// "ball_starting enables hardware". Both performed here, explicitly,
	// rather than relying on their already-default values -- the mutation
	// that skips a reset must have something concrete to redden (AC 5(b)).
	// Story 2.9, AC 1: `ball_starting` also ENABLES ball save -- the
	// controller's own source is recorded with the timer left STOPPED
	// (`enableBallSave()`, `untilTick` stays `null` until `ball_launched`
	// arms it in `./save-serve.ts`).
	const machine: MachineState = {
		...state.machine,
		ballSave: enableBallSave(EMPTY_BALL_SAVE, BALL_SAVE_SOURCE),
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		hardwareEnabled: true,
	};

	// Story 2.5, task 6: `hardwareEnabled` stops being an inert GameState
	// flag with zero readers -- ball_starting's own hardware-enable is
	// realised as real `enable` CoilCommands for the same AD-5 hardware set
	// `HARDWARE_COILS` names at game over, so the flag's two
	// transitions (start -> enable, game over -> disable) both drive an
	// actual physics-side effect through the one gate AD-5 recognises
	// (`coilEnabled`, never a `GameState` read -- physics has none).
	//
	// Story 2.13 (DW-244, AD-6 amended, task 5(c)): the stray clear. A
	// ball already RESTING in `bd_shooter` (checked against `state`, the
	// PRE-start machine snapshot this function was called with -- never
	// `machine` above, which this function has not yet mutated it away
	// from anyway) IS the ball being served: no trough pulse, and never
	// stack a second ball onto it. Otherwise the existing pulse serves as
	// before. Either way, one `RecoverCommand` is ALWAYS issued (every
	// ball start clears strays itself, Author decision DW-244) and
	// `pendingStrayClear` is armed so the report one tick from now (Story
	// 2.13's own stray-clear branch, `./serve-recovery.ts`) can tell this
	// clear's own answer apart from ball search's.
	const laneOccupied = state.machine.deviceSlots.bd_shooter[0] === true;
	const coilCommands: CoilCommand[] = [
		...(laneOccupied ? [] : [{ type: 'coil' as const, coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse' as const, tick }]),
		...HARDWARE_COILS.map((coil): CoilCommand => ({ type: 'coil', coil, action: 'enable', tick })),
	];
	const recoverCommands: RecoverCommand[] = [{ type: 'recover', tick }];
	cs.pendingStrayClear = { tick };

	return {
		state: { ...state, players, currentPlayer: playerIndex, machine },
		events: [
			willStart,
			{ type: 'ball_starting', tick },
			{ type: 'ball_save_enabled', tick },
			{ type: 'ball_started', tick },
		],
		coilCommands,
		ballWillStartEvents: [willStart],
		recoverCommands,
	};
}

/** Merges one `startBall()` result's four output channels into this tick's accumulator, in the monolith's own order. */
export function pushStarted(out: TickOutput, started: StartBallResult): void {
	out.events.push(...started.events);
	out.coilCommands.push(...started.coilCommands);
	out.ballWillStartEvents.push(...started.ballWillStartEvents);
	out.recoverCommands.push(...started.recoverCommands);
}

export interface StartButtonResult {
	readonly state: GameState;
	readonly newGameStartedThisTick: boolean;
}

/**
 * S6: Start / Hot seat (AD-6/AD-18: the ball controller alone decides).
 *
 * Story 2.13 (task 5(b)): Start is now ALSO honoured from `game_over`,
 * once the game-over sequence has resolved (`gameOverResolved()`,
 * `./game-over.ts`). A new game zeroes `machine.ballsInPlay` (DW-244: Probe
 * A's own measured stale-1 defect) and clears BOTH `pendingBonusCountSteps`
 * (DW-235) and the old sequence, BEFORE `startBall()` arms its own stray
 * clear -- so a new game never inherits either.
 */
export function handleStartButton(ctx: ControllerContext, state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, out: TickOutput): StartButtonResult {
	const { cs } = ctx;
	let nextState = state;
	const startPressed = deviceEvents.some((event) => event.type === 'button_pressed' && event.button === START_BUTTON);
	let newGameStartedThisTick = false;
	if (startPressed) {
		if (nextState.phase === 'attract' || gameOverResolved(ctx, nextState, tick)) {
			const created: GameState = {
				...nextState,
				phase: 'game',
				players: [emptyPlayer()],
				currentPlayer: 0,
				machine: { ...nextState.machine, ballsInPlay: 0 },
			};
			cs.pendingBonusCountSteps = [];
			cs.gameOverSequence = null;
			const started = startBall(ctx, created, 0, tick);
			nextState = started.state;
			pushStarted(out, started);
			newGameStartedThisTick = true;
		} else if (
			nextState.phase === 'game' &&
			nextState.players.length < 4 &&
			nextState.currentPlayer === 0 &&
			nextState.players[0]?.ballNumber === 1
		) {
			// Hot seat window: open exactly while player 1's ball 1 is in
			// progress (currentPlayer 0, ballNumber 1) -- it closes the instant
			// that ball ends, whichever way play then proceeds (rotates to a
			// second player, or wraps player 0 straight into ball 2), because
			// EITHER outcome makes this condition false (currentPlayer moves
			// off 0, or ballNumber moves off 1) in the SAME tick the drain is
			// processed (`./ball-end.ts`).
			nextState = { ...nextState, players: [...nextState.players, emptyPlayer()] };
		}
		// Else: no-op by construction -- a fifth press (players.length is
		// already 4), a press after ball 1 has ended (the window above is
		// closed), or a press in `game_over` before the Match has resolved
		// (I/O Matrix, "Start during the reveal": ignored) changes nothing.
	}
	return { state: nextState, newGameStartedThisTick };
}
