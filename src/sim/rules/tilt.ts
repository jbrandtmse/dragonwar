// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.11 (AD-5, AD-7, AD-18): the tilt controller -- the single owner of
// `machine.tilt`, the current player's `tiltWarnings` and the Tilt-side of
// `machine.hardwareEnabled`/`machine.ballSave`. Consumes the devices layer's
// `tilt_bob_closed`/`slam_tilt_closed` events (AD-19: never a raw
// `SwitchEvent` -- `sim/rules/devices/` is the only consumer of that), never
// `sim/physics` (AD-1).
//
// Two semantic windows, each with its own origin (Design Notes, "The two
// windows, and the reading that makes both of them do work"):
// `tiltWarningSpacingTicks` is measured from the LAST `tilt_bob_closed` of
// any kind -- counted or ignored -- and gates whether a closure is eligible
// to warn or tilt at all (the bob's own debounce, FR-14). `tiltSettleTicks`
// is measured from the last COUNTED warning and gates only the next
// warning, never the tilting closure itself.
//
// Both marks (`lastBobClosureTick`, `lastWarningTick`) are closure state,
// deliberately never `GameState` -- `machine` is present in all five
// goldens' `attract` snapshots, so a new machine-scoped field would move
// `expectedGameStateHash` on every one (Block If). They are monotone tick
// marks that can only DELAY an effect, never enable one, so a stale mark
// cannot hang a game; but each is still reset-safe against a restarted
// timeline (`src/host/loop.ts`'s `reset()` restarts `tick` at 0 while this
// closure survives) -- a mark strictly greater than the current tick is
// from a different timeline and is discarded, never compared against.

import { disarmBallSave } from './ball-save';
import { HARDWARE_COILS } from './ball-controller';
import { shotWindowTicks, type ResolvedTuning } from '../table/tuning';
import type { DeviceEvent } from './devices';
import type { GameAdjustments } from '../contracts/replay';
import type { BallSaveState } from '../contracts/state';
import type { CoilCommand, GameState, SemanticEvent } from '../table/names';

export interface TiltControllerStepResult {
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	readonly coilCommands: readonly CoilCommand[];
}

export interface TiltController {
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): TiltControllerStepResult;
}

/** A `disable` `CoilCommand` for every coil in `HARDWARE_COILS` -- the same AD-5 hardware set `startBall()`'s own `enable` batch and the game-over `disable` batch both use (`sim/rules/ball-controller.ts`), imported rather than re-derived (one definition, DW-149). */
function disableHardwareCoils(tick: number): CoilCommand[] {
	return HARDWARE_COILS.map((coil): CoilCommand => ({ type: 'coil', coil, action: 'disable', tick }));
}

/**
 * AD-18: "Tilt disarms all" -- a fold of `disarmBallSave()` over a SNAPSHOT
 * of `ballSave.sources` (captured once, before the fold begins), never a
 * single call for one named source and never a whole-device `EMPTY_BALL_SAVE`
 * reset (the frozen `BallSaveState` shape carries no per-source deadline to
 * recompute from -- `ball-save.ts`'s own header). With today's single
 * arming source the two reads are behaviourally identical, which is exactly
 * why a single-source implementation would be untestable (`DW-219` is not
 * reached: emptying `sources` correctly returns `untilTick` to `null`).
 */
function disarmAllBallSave(ballSave: BallSaveState): BallSaveState {
	let next = ballSave;
	for (const source of ballSave.sources) {
		next = disarmBallSave(next, source);
	}
	return next;
}

/**
 * `createTiltController(adjustments, tuning)` mirrors `createBallController`/
 * `createDevicesLayer`: the two ms windows are resolved to ticks ONCE, here,
 * never re-read per tick (AD-3/AD-15).
 */
export function createTiltController(adjustments: GameAdjustments, tuning: ResolvedTuning): TiltController {
	const tiltWarningSpacingTicks = shotWindowTicks('tiltWarningSpacingMs', tuning);
	const tiltSettleTicks = shotWindowTicks('tiltSettleMs', tuning);

	let lastBobClosureTick: number | null = null;
	let lastWarningTick: number | null = null;

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): TiltControllerStepResult {
		// Reset-safety against a restarted timeline (this file's own header):
		// a mark strictly greater than the current tick is from a different
		// timeline and must be discarded, not compared against.
		if (lastBobClosureTick !== null && tick < lastBobClosureTick) {
			lastBobClosureTick = null;
		}
		if (lastWarningTick !== null && tick < lastWarningTick) {
			lastWarningTick = null;
		}

		let nextState = state;
		const events: SemanticEvent[] = [];
		const coilCommands: CoilCommand[] = [];

		// Code review finding (Blind Hunter / Edge Case Hunter, converged
		// independently): a nudge violent enough to cross BOTH cabinet
		// sensors' thresholds in the SAME tick -- physically plausible, and
		// deterministic here, since `sim/physics/cabinet/index.ts` always
		// pushes the bob's own edge before the slam detector's -- must never
		// let a bob-triggered warning or tilt land against a game the slam
		// has already ended. Two SEPARATE passes over `deviceEvents`, slam
		// first, unconditionally: every `slam_tilt_closed` is handled and
		// `nextState.phase` is already flipped to 'attract' before the
		// second pass even looks at a `tilt_bob_closed` -- correct
		// regardless of the two event types' relative order in the array,
		// not merely because physics happens to emit them in this order
		// today.
		for (const event of deviceEvents) {
			if (event.type !== 'slam_tilt_closed') {
				continue;
			}
			// FR-16: "all players' games end" -- a game running (phase 'game')
			// only. Attract/game_over: nothing, same state reference (there is
			// no game to end).
			if (nextState.phase !== 'game') {
				continue;
			}
			events.push({ type: 'slam_tilt', tick });
			coilCommands.push(...disableHardwareCoils(tick));
			// The minimal state change that reaches the Attract the Backglass
			// already renders (Design Notes, "Slam tilt reaches Attract; it does
			// not build a second path there"): players[] is KEPT (Attract cycles
			// the last game's scores), ballsInPlay is untouched (self-corrects
			// via applyDeviceEvents on the parking entry), machine.tilt.tilted
			// stays false (there is no ball, so no ball CONDITION) -- only
			// slamTilted moves.
			nextState = {
				...nextState,
				phase: 'attract',
				modes: [],
				machine: { ...nextState.machine, hardwareEnabled: false, tilt: { tilted: false, slamTilted: true } },
			};
		}

		for (const event of deviceEvents) {
			if (event.type !== 'tilt_bob_closed') {
				continue;
			}

			// AD-7: "the bob is never reset by command" -- its own history is
			// physical and updates whatever the phase, spec I/O matrix "Bob
			// closure in Attract". Captured BEFORE the update so eligibility
			// below is judged against the mark's value before THIS closure.
			const previousBobClosureTick = lastBobClosureTick;
			lastBobClosureTick = tick;

			if (nextState.phase !== 'game') {
				continue;
			}
			const player = nextState.players[nextState.currentPlayer];
			if (!player || nextState.machine.tilt.tilted) {
				continue;
			}

			const eligible = previousBobClosureTick === null || tick - previousBobClosureTick >= tiltWarningSpacingTicks;
			if (!eligible) {
				continue;
			}

			if (player.tiltWarnings >= adjustments.tiltWarnings) {
				const playerIndex = nextState.currentPlayer;
				events.push({ type: 'tilt', player: playerIndex, tick });
				coilCommands.push(...disableHardwareCoils(tick));
				const ballSave = disarmAllBallSave(nextState.machine.ballSave);
				nextState = {
					...nextState,
					machine: {
						...nextState.machine,
						hardwareEnabled: false,
						tilt: { ...nextState.machine.tilt, tilted: true },
						ballSave,
					},
				};
				continue;
			}

			const settled = lastWarningTick === null || tick - lastWarningTick >= tiltSettleTicks;
			if (!settled) {
				continue;
			}

			const playerIndex = nextState.currentPlayer;
			const newCount = player.tiltWarnings + 1;
			lastWarningTick = tick;
			const players = nextState.players.map((existing, index) => (index === playerIndex ? { ...existing, tiltWarnings: newCount } : existing));
			events.push({ type: 'tilt_warning', player: playerIndex, remaining: Math.max(0, adjustments.tiltWarnings - newCount), tick });
			nextState = { ...nextState, players };
		}

		return { state: nextState, events, coilCommands };
	}

	return { step };
}
