// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's ball-save seams, moved unchanged
// out of the Epic 2 monolith -- S4 (the save expiries), S7 (the plunge arm
// and the deferred autolaunch) and S8a (a live save re-serving a drain
// instead of ending the ball). Story 2.9 (AD-18): the ball controller owns
// `machine.ballSave`.

import { TABLE } from '../../table/dragonwar';
import { armBallSave, EMPTY_BALL_SAVE, hasGraceLapsed, isRunning, isWithinGrace } from '../ball-save';
import { BALL_SAVE_SOURCE, SHOOTER_LAUNCH_COIL, type ControllerContext, type TickOutput } from './shared';
import type { DeviceEvent } from '../devices';
import type { CoilName, GameState } from '../../table/names';

/**
 * S4. Story 2.9 (AD-18): ball-save grace expiry, evaluated BEFORE this
 * tick's own device events are read -- the same ordering
 * `sim/rules/devices/shots.ts` and `sim/rules/devices/index.ts` already
 * use for their own in-flight window expiry (Boundaries: "expiry is
 * evaluated before this tick's own device events are read"). A time-
 * based expiry of the WHOLE device (every source at once), distinct
 * from Story 2.11's later per-source Tilt `disarm()`.
 */
export function expireBallSave(ctx: ControllerContext, state: GameState, tick: number): GameState {
	const { cs, ballSaveGraceTicks } = ctx;
	let nextState = state;
	if (hasGraceLapsed(nextState.machine.ballSave, tick, ballSaveGraceTicks)) {
		nextState = { ...nextState, machine: { ...nextState.machine, ballSave: EMPTY_BALL_SAVE } };
	}

	// Rework iteration 2 (DW-224 + DW-225): `awaitingSaveRelaunch`'s own
	// bounded lifetime, expired here for the identical reason and in the
	// identical position as `hasGraceLapsed()` immediately above and
	// `pendingLockLaneClosure` (`sim/rules/devices/index.ts`) -- BEFORE this
	// tick's own device events are read, so a `ball_launched` arriving on the
	// very tick the record expires is correctly treated as NOT this save's
	// own relaunch.
	if (cs.awaitingSaveRelaunch && tick > cs.awaitingSaveRelaunch.startTick + ballSaveGraceTicks) {
		cs.awaitingSaveRelaunch = null;
	}
	return nextState;
}

/**
 * S7. Ball save (AD-18, AC 2/AC 4): the timer starts on the PLUNGE, never on
 * enable (AD-6/PRD FR-19) -- gated on `phase === 'game'` so nothing arms
 * during any golden's own attract-phase plunge (AC 10). Rework iteration 1
 * (DW-218): narrowed further to a PLAYER plunge ONLY -- a save's own
 * deferred autolaunch (below) also opens `s_shooter_lane` and emits this
 * SAME event, and arming unconditionally on every `ball_launched` re-armed
 * a full fresh window on every re-serve; measured at production tuning
 * over 120,000 ticks, seed 0, no player input: 28 `ball_saved`, zero
 * `ball_ended`, ball 2/bonus/rotation/game over/Match all unreachable
 * (control: a 500 ms/100 ms window gives zero saves and the SAME natural
 * `ball_ended` tick, proving the loop was the re-arm, not the harness).
 * `awaitingSaveRelaunch` is the discriminator: set only when the
 * deferred-autolaunch pulse below actually fires, consumed by the very
 * `ball_launched` that pulse causes. Also gated on the controller's OWN
 * source already being present in `sources` -- i.e. genuinely enabled by
 * `ball_starting` -- so `armBallSave` cannot arm a launch that was never
 * enabled first (code review: "today, deleting the enable step entirely
 * leaves the arming path working"; AC 1's enable-is-not-a-start
 * distinction now has a behavioural consequence, not just an event-stream
 * one). The deferred autolaunch itself fires on the RE-SERVED ball's own
 * arrival at the shooter lane, one or more ticks after the drain branch
 * (`serveBallSave()` below) sets `awaitingSaveLaunch` -- never in the same
 * tick's batch (`sim/physics/devices.ts`'s `launch()` resolves a ball
 * resting in the entry zone; a same-tick pulse fires into an empty lane and
 * launches nothing).
 */
export function armSaveOrAutolaunch(ctx: ControllerContext, state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, out: TickOutput): GameState {
	const { cs, ballSaveTicks } = ctx;
	let nextState = state;
	for (const event of deviceEvents) {
		if (event.type === 'ball_launched') {
			if (cs.awaitingSaveRelaunch) {
				// DW-218: this `ball_launched` is the save's own re-serve reaching
				// the shooter lane, not a player plunge -- consume the record and
				// do NOT re-arm. `ballsInPlay` is still incremented as usual, by
				// `applyDeviceEvents()` (a separate function, this story's own
				// arming decision does not touch ball-in-play accounting).
				cs.awaitingSaveRelaunch = null;
			} else if (nextState.phase === 'game' && nextState.machine.ballSave.sources.includes(BALL_SAVE_SOURCE)) {
				const ballSave = armBallSave(nextState.machine.ballSave, { ticks: ballSaveTicks, source: BALL_SAVE_SOURCE }, tick);
				nextState = { ...nextState, machine: { ...nextState.machine, ballSave } };
				out.events.push({ type: 'ball_save_timer_started', untilTick: ballSave.untilTick!, tick });
			}
		} else if (
			cs.awaitingSaveLaunch &&
			event.type === 'device_ball_entered' &&
			TABLE.ballDevices[event.device].kind === 'non-parking'
		) {
			// Code review pass 1 (edge-case-hunter): mirror the drain branch's
			// own `!tilt.tilted` guard -- AC 6 makes the device inert
			// while tilted, and a Tilt occurring between the save's trough-
			// eject and the re-served ball's own arrival here must not still
			// auto-launch it. The flag is consumed either way (the ball DID
			// arrive; leaving it `true` would only wait for an arrival that
			// has already happened), just without the coil pulse while tilted.
			// Story 2.11 code review: and never outside a game -- a Slam tilt
			// landing inside the re-serve window moves `phase` to 'attract'
			// with `tilt.tilted` left false (a slam is not a ball condition),
			// so the tilt conjunct alone let this pulse fire `c_autolaunch`
			// into Attract. The flag is still consumed.
			cs.awaitingSaveLaunch = false;
			if (!nextState.machine.tilt.tilted && nextState.phase === 'game') {
				out.coilCommands.push({ type: 'coil', coil: SHOOTER_LAUNCH_COIL, action: 'pulse', tick });
				// Rework iteration 1 (DW-218): mark the upcoming `ball_launched`
				// this same pulse will cause (one or more ticks from now) as the
				// save's own re-serve, not a player plunge -- set ONLY when the
				// pulse genuinely fires; while tilted, nothing is pulsed and no
				// `ball_launched` will follow from this cause, so there is
				// nothing to discriminate. Rework iteration 2 (DW-224/DW-225):
				// `startTick` is this pulse's OWN tick -- the record's bounded
				// lifetime (`expireBallSave()` above) is measured from here.
				cs.awaitingSaveRelaunch = { startTick: tick };
			}
		}
	}
	return nextState;
}

/**
 * S8a. Story 2.9 (AD-18, AC 3/AC 6/AC 11): a live ball-save window --
 * running OR within its (invisible) grace -- re-serves the ball INSTEAD OF
 * the teardown/ball_ended/rotation path (`./ball-end.ts`), unless Tilt has
 * made the device inert (Story 2.11 owns the tilt EVENT that would
 * `disarm()` every source; this story ships only the read-side guard).
 * `currentPlayer`, `players[i].ballNumber` and `modes[]` are all left
 * untouched -- this is a re-serve of the SAME ball, not a new one. Returns
 * `true` when it re-served, in which case `step()` returns early.
 */
export function serveBallSave(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): boolean {
	const { cs, ballSaveGraceTicks } = ctx;
	const endingPlayer = state.currentPlayer;
	const ballSaveLive =
		!state.machine.tilt.tilted &&
		(isRunning(state.machine.ballSave, tick) || isWithinGrace(state.machine.ballSave, tick, ballSaveGraceTicks));

	if (ballSaveLive) {
		out.events.push({ type: 'ball_saved', player: endingPlayer, tick });
		out.coilCommands.push({ type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick });
		cs.awaitingSaveLaunch = true;
		// Story 2.12 (task 14): skipping (a)-(d) on this path is harmless --
		// it runs only at ballsInPlay 0, where the search is idle, and a
		// recover report cannot arrive on a save's drain tick (a recover
		// leaves no ball to drain).
		return true;
	}
	return false;
}
