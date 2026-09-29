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
// Story 3.0 (DW-284): the marks are PER PLAYER. `lastBobClosureTick` and
// `lastWarningTick` (AD-7's names, kept) are `Map<playerIndex, tick>`: a
// closure in `phase: 'game'` with a current player updates only THAT
// player's marks, so in Hot seat player 2's first nudge is never judged
// against player 1's spacing or settle window. A closure in any other state
// (Attract, `game_over`, or a game with no current player) updates one
// shared idle mark, `idleBobClosureTick`, which gates the SPACING check of
// every player -- AD-7: "the bob ... its own history is physical and updates
// whatever the phase", so a bob still swinging from an Attract nudge must
// still debounce the first closure of the game that follows. Both maps are
// cleared on any step whose `phase` is not 'game', so no player's marks
// outlive their game. The DW-240 origins are unchanged: spacing runs from
// the last closure of any kind (the player's own, or the idle mark), and
// settle from the player's last counted warning.
//
// Every mark (both maps and the idle mark) is closure state,
// deliberately never `GameState` -- `machine` is present in all five
// goldens' `attract` snapshots, so a new machine-scoped field would move
// `expectedGameStateHash` on every one (Block If). They are monotone tick
// marks that can only DELAY an effect, never enable one, so a stale mark
// cannot hang a game; and each is reset-safe against a restarted timeline
// -- a mark strictly greater than the current tick is from a different
// timeline and is discarded, never compared against. Code review (Story
// 2.11): in production that guard is DEFENCE IN DEPTH, not load-bearing.
// `src/host/loop.ts`'s `reset()` calls `createLoop()`, which calls
// `createRules()`, which builds a FRESH tilt controller, so no mark outlives
// its own timeline today (unlike `frame.ts`'s `backglassView`, which really
// does survive a reset in `boot.ts`). It binds only for a caller that
// reuses ONE controller across a restarted tick count, which is what
// `test/rules-tilt.test.ts`'s restarted-timeline case does directly.

import { disarmBallSave } from './ball-save';
import { enterAttract, HARDWARE_COILS } from './ball-controller';
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

	// Story 3.0 (DW-284): per player, keyed by player index (this file's
	// own header). The idle mark is the one shared mark, for closures outside
	// a live player's game.
	const lastBobClosureTick = new Map<number, number>();
	const lastWarningTick = new Map<number, number>();
	let idleBobClosureTick: number | null = null;

	/** Reset-safety (this file's own header): drops every mark strictly greater than `tick` -- a mark from a different timeline. */
	function discardFutureMarks(marks: Map<number, number>, tick: number): void {
		for (const [playerIndex, markTick] of marks) {
			if (tick < markTick) {
				marks.delete(playerIndex);
			}
		}
	}

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): TiltControllerStepResult {
		// Reset-safety against a restarted timeline (this file's own header):
		// a mark strictly greater than the current tick is from a different
		// timeline and must be discarded, not compared against.
		discardFutureMarks(lastBobClosureTick, tick);
		discardFutureMarks(lastWarningTick, tick);
		if (idleBobClosureTick !== null && tick < idleBobClosureTick) {
			idleBobClosureTick = null;
		}
		// DW-284: outside a game no player's marks survive -- a new game's
		// player 1 starts with none, whoever played before.
		if (state.phase !== 'game') {
			lastBobClosureTick.clear();
			lastWarningTick.clear();
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
			// Story 2.13 (AD-18): the Slam now uses the SAME shared Attract helper
			// the ball controller's own game-over-to-Attract transition uses,
			// rather than re-implementing "phase, modes, hardwareEnabled, the
			// disable batch" a second time (Design Notes, "Slam tilt reaches
			// Attract through the shared helper; it does not build a second path
			// there"). `enterAttract()` keeps `players[]` (Attract cycles the last
			// game's scores), `ballsInPlay` (self-corrects via
			// `applyDeviceEvents` on the parking entry), `rng` and `tilt`
			// untouched -- this block then layers `tilt.tilted: false` (there is
			// no ball, so no ball CONDITION, only `slamTilted` moves) and the
			// ball-save disarm on top. Code review (Story 2.11): `ballSave` IS
			// disarmed -- AD-18's "Tilt disarms all" -- because `lampsOf()` has no
			// phase gate: left armed, `l_ball_save` stayed lit in Attract for the
			// rest of the window (the implement-stage review's "Attract never
			// reads it" was true of the drain branch only).
			const attract = enterAttract(nextState, tick);
			coilCommands.push(...attract.coilCommands);
			nextState = {
				...attract.state,
				machine: {
					...attract.state.machine,
					tilt: { tilted: false, slamTilted: true },
					ballSave: disarmAllBallSave(attract.state.machine.ballSave),
				},
			};
		}

		for (const event of deviceEvents) {
			if (event.type !== 'tilt_bob_closed') {
				continue;
			}

			// AD-7: "the bob is never reset by command" -- its own history is
			// physical and updates whatever the phase, spec I/O matrix "Bob
			// closure in Attract". Outside a live player's game that history is
			// the shared idle mark (DW-284, this file's own header); inside one
			// it is the current player's own mark. Captured BEFORE the update so
			// eligibility below is judged against the marks' values before THIS
			// closure.
			const playerIndex = nextState.currentPlayer;
			const player = nextState.phase === 'game' ? nextState.players[playerIndex] : undefined;
			if (!player) {
				idleBobClosureTick = tick;
				continue;
			}
			const previousBobClosureTick = lastBobClosureTick.get(playerIndex) ?? null;
			lastBobClosureTick.set(playerIndex, tick);

			if (nextState.machine.tilt.tilted) {
				continue;
			}

			// DW-240: spacing runs from the last closure of ANY kind -- this
			// player's own, or an idle-time closure (the bob is one pendulum).
			const spacedFromOwn = previousBobClosureTick === null || tick - previousBobClosureTick >= tiltWarningSpacingTicks;
			const spacedFromIdle = idleBobClosureTick === null || tick - idleBobClosureTick >= tiltWarningSpacingTicks;
			if (!spacedFromOwn || !spacedFromIdle) {
				continue;
			}

			if (player.tiltWarnings >= adjustments.tiltWarnings) {
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

			// DW-240: settle runs from THIS player's last counted warning only.
			const previousWarningTick = lastWarningTick.get(playerIndex) ?? null;
			const settled = previousWarningTick === null || tick - previousWarningTick >= tiltSettleTicks;
			if (!settled) {
				continue;
			}

			const newCount = player.tiltWarnings + 1;
			lastWarningTick.set(playerIndex, tick);
			const players = nextState.players.map((existing, index) => (index === playerIndex ? { ...existing, tiltWarnings: newCount } : existing));
			events.push({ type: 'tilt_warning', player: playerIndex, remaining: Math.max(0, adjustments.tiltWarnings - newCount), tick });
			nextState = { ...nextState, players };
		}

		return { state: nextState, events, coilCommands };
	}

	return { step };
}
