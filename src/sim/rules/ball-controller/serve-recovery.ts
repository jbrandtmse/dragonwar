// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's serve-recovery seams, moved
// out of the Epic 2 monolith (Story 3.2 changes S9's tilted answer, the
// Lock's overflow and S11's Lock stages; see each) -- the stray clear's reset-safety and
// snapshot (S2), and Story 2.12's task-14 tail, in order: (a) the recover's
// own answer (S9), (b) the overflow ejects (S10) and (d) the ball search's
// own step (S11). `applyRecovery()` (`./accounting.ts`) has already corrected
// `ballsInPlay` to 0 by the time S9 runs (`sim/rules/index.ts` applies it
// before `applyDeviceEvents`, AD-4) -- these seams only decide the EVENT and
// the SERVE, never the count.

import { TABLE } from '../../table/dragonwar';
import { endBall } from './ball-end';
import { mouthEjectPending, pendingMouthEjects, requestMouthEject } from './lock-arbiter';
import type { ControllerContext, PendingStrayClear, TickOutput } from './shared';
import type { BallDeviceName, CoilName, GameState, MachineReport } from '../../table/names';

/**
 * S2 (stray-clear half) and the snapshot. Story 2.13 (AD-7): reset-safety
 * FIRST -- a mark strictly greater than `tick` means a restarted timeline
 * (`tilt.ts:88-97`'s own precedent). `pendingStrayClear` is ALSO discarded
 * once its own one-tick window has passed uneventfully (Boundaries: "the
 * pending stray clear expires after one tick").
 *
 * Returns the snapshot `step()` hands to `reportRecovery()` (S9). Rework
 * iteration 1, review pass (DW-269, the ledger's own broader mechanism --
 * distinct from CR-1's drain-branch guard): a snapshot taken HERE, before
 * the Start-handling block and the drain branch (both of which can call
 * `startBall()` again, THIS SAME TICK, and overwrite
 * `ControllerState.pendingStrayClear` to `{ tick }`) -- reachable via a
 * genuine same-tick collision: a `slam_tilt_closed` device event moves
 * `phase` to 'attract' (`tiltController.step()` runs BEFORE
 * `ballController.step()`, `sim/rules/index.ts`) and a
 * `button_pressed(START)` event in the SAME tick's `deviceEvents` is then
 * honoured by the Start-handling block, landing exactly one tick after a
 * prior `startBall()` call armed `pendingStrayClear`. Reading the LIVE
 * field at "(a)" (as before this fix) would then find it already
 * overwritten to the SECOND clear's own `{ tick }`, misrouting the FIRST
 * clear's own report into branch (a) -- a spurious
 * `ball_missing { count: 0 }` (Boundaries: "never emit ... for it") and,
 * whenever the lane reads empty, a SECOND `c_trough_eject` pulse alongside
 * the second game's own genuine serve pulse the SAME tick -- exactly the
 * double-serve DW-244/AD-6 exists to prevent. The snapshot makes "(a)"
 * always resolve the ORIGINAL clear's own report correctly; the
 * reference-equality guard on the null-out just below "(a)" (see there)
 * then leaves the SECOND clear's own freshly-armed record untouched so ITS
 * OWN report still arrives one tick later.
 */
export function discardStaleStrayClear(ctx: ControllerContext, tick: number): PendingStrayClear | null {
	const { cs } = ctx;
	if (cs.pendingStrayClear !== null && (tick < cs.pendingStrayClear.tick || tick > cs.pendingStrayClear.tick + 1)) {
		cs.pendingStrayClear = null;
	}
	return cs.pendingStrayClear;
}

/**
 * S9: (a) the recover's own answer, now split in two (Story 2.13, Design
 * Notes "The stray clear: reporting and ordering"). The stray clear's
 * OWN report -- exactly one tick after a `startBall()` armed
 * `pendingStrayClear` -- is silent at count 0 and never serves
 * (Boundaries: "never serve from the stray-clear report, and never
 * emit ball_missing { count: 0 } for it"). Any OTHER report (ball
 * search's own final-stage answer) takes the EXISTING branch:
 * `ball_missing` always, even at count 0, and a trough serve only
 * into a genuinely empty lane.
 */
export function reportRecovery(
	ctx: ControllerContext,
	state: GameState,
	pendingStrayClearAtStart: PendingStrayClear | null,
	machineReport: MachineReport,
	tick: number,
	out: TickOutput,
): GameState {
	const { cs } = ctx;
	const strayClearReportDue = pendingStrayClearAtStart !== null && tick === pendingStrayClearAtStart.tick + 1;
	if (strayClearReportDue && machineReport.recovered !== null) {
		if (machineReport.recovered > 0) {
			out.events.push({ type: 'ball_missing', count: machineReport.recovered, tick });
		}
		// Reference equality, not `!== null`: a same-tick second
		// `startBall()` (see `discardStaleStrayClear()`'s own doc comment)
		// may have already re-armed `pendingStrayClear` to a NEW `{ tick }`
		// for its OWN future report -- nulling it out here unconditionally
		// would silently swallow that second clear's own report one tick from
		// now. Only clear it if it still IS the same record this report is
		// answering.
		if (cs.pendingStrayClear === pendingStrayClearAtStart) {
			cs.pendingStrayClear = null;
		}
	} else if (machineReport.recovered !== null) {
		out.events.push({ type: 'ball_missing', count: machineReport.recovered, tick });
		// Code review, rework iteration 1 (the closure-state sweep the
		// review pass's own DW-269 find asked for -- a THIRD instance of
		// the same-tick coordination shape, in the OTHER branch): this
		// serve must never double up on one `startBall()` already issued
		// THIS SAME TICK. `pendingStrayClear?.tick === tick` is true on
		// exactly the ticks a `startBall()` call has just run (it arms the
		// record with this tick), and `startBall()` has already pulsed
		// `c_trough_eject` itself into the same empty lane this branch
		// tests for -- so without this conjunct both fire and the trough
		// ejects TWICE, the two-balls-in-the-lane defect AD-6's amended
		// invariant ("exactly one ball is in play after the serve, never
		// two") and the whole of DW-244 exist to prevent. Reachable
		// through a genuine collision: ball search's own final-stage
		// `RecoverCommand` issued at t-1 while a stuck ball was in play,
		// answered at t, on the very tick a `slam_tilt_closed` moves
		// `phase` to 'attract' (`tiltController.step()` runs first) and a
		// same-tick `button_pressed(START)` is honoured -- `startBall()`
		// then serves game 2 while THIS branch, correctly seeing a report
		// that is not the stray clear's own, serves again. The
		// `ball_missing` above is still emitted: a ball genuinely did
		// leave the simulated set, and that is Story 2.12's contract for
		// every non-stray-clear report.
		const servedThisTickByStartBall = cs.pendingStrayClear !== null && cs.pendingStrayClear.tick === tick;
		if (servedThisTickByStartBall || state.phase !== 'game') {
			return state;
		}
		// Story 3.2 (DW-281, FR-15): under Tilt the recover's answer ends the
		// ball instead of serving -- `ball_ended { tilted: true }`, then the
		// rotation or game over, exactly as a tilted drain would. Serving here
		// handed a tilted player a fresh ball and left the game stalled on it.
		// Not while a Mouth eject is pending: that spat ball is still the
		// player's, and its own drain ends the ball through the gate.
		if (state.machine.tilt.tilted) {
			return mouthEjectPending(ctx) ? state : endBall(ctx, state, tick, out);
		}
		// Story 3.2 (DW-282): the pass's ONLY serve. Ball search's trough
		// stages issue nothing (`sim/rules/ball-search.ts`), so a closure after
		// them can no longer leave a second ball in the lane.
		if (!state.machine.deviceSlots.bd_shooter[0]) {
			out.coilCommands.push({ type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick });
		}
	}
	return state;
}

/**
 * S10: (b) device_overflow on any parking device OTHER than the Lock, which
 * answers with one immediate eject. Story 3.2 (DW-174): the Lock's own
 * overflow is answered by the Lock arbiter instead (`./lock-arbiter.ts`,
 * `arbitrateLockLane()`), with one Mouth eject after the show's lead and
 * only when none is pending -- never a bare `c_mouth` pulse from here.
 */
export function answerOverflows(machineReport: MachineReport, tick: number, out: TickOutput): void {
	const lockDevice = TABLE.lockLaneWiring.device as BallDeviceName;
	for (const failure of machineReport.failures) {
		if (failure.type !== 'device_overflow') {
			continue; // (c) eject_failed / broken: no-ops.
		}
		if (failure.device === lockDevice) {
			continue;
		}
		const device = TABLE.ballDevices[failure.device];
		if (device.kind === 'parking') {
			out.coilCommands.push({ type: 'coil', coil: device.ejectCoil as CoilName, action: 'pulse', tick });
		}
	}
}

/**
 * S11: (d) the search itself. Story 3.2 (AD-18): the search is told how
 * many Mouth ejects are pending -- it holds its quiet count while any is,
 * and its Lock stages request an eject only for a ball not already
 * scheduled -- and each Lock-stage request goes through the arbiter's one
 * Mouth, never a bare `c_mouth` pulse.
 */
export function stepBallSearch(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): void {
	const searchResult = ctx.ballSearch.step(state, tick, pendingMouthEjects(ctx));
	out.events.push(...searchResult.events);
	out.coilCommands.push(...searchResult.coilCommands);
	out.recoverCommands.push(...searchResult.recoverCommands);
	out.bankResetRequests.push(...searchResult.bankResetRequests);
	for (let i = 0; i < searchResult.lockEjectRequests.length; i++) {
		requestMouthEject(ctx, tick, out);
	}
}
