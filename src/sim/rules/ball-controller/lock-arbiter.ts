// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2 (AD-18): the Lock arbiter -- the ONLY consumer of
// `lock_lane_entered` (enforced by `tools/dependency-cruiser.config.mjs`'s
// `lock-lane-entered-only-arbiter` rule and by
// `test/ad18-lock-lane-consumer.test.ts`'s source scan) and the only module
// that pulses the Mouth (`TABLE.ballDevices[lockLaneWiring.device].ejectCoil`,
// `c_mouth`). Four jobs:
// - it CLASSIFIES each tick's device-event batch: a captured entry
//   (`lock_lane_entered` with the Lock's own `device_ball_entered`), a
//   full-device entry (`lock_lane_entered` alone -- the device was full, so
//   the ball stayed in play) and an uncredited park (the Lock's
//   `device_ball_entered` with no `lock_lane_entered`, DW-171);
// - it DECIDES each entry, emitting exactly one `lock_lane_locked` or
//   `lock_lane_spit` and writing the player-scoped `lockCredits` (AD-7);
// - it SERVES a new ball after a lock, through the save re-serve path
//   (`./save-serve.ts`), so the launch never arms ball save;
// - it owns the one Mouth: every eject is `ShowCommand
//   show_dragon_mouth_open`, then the pulse exactly `mouthOpenLeadTicks`
//   later, with successive ejects `mouthEjectIntervalTicks` apart. Ball
//   search's Lock stages (`./serve-recovery.ts`), the `bd_lock` overflow
//   answer (below) and the DW-171 park all go through `requestMouthEject()`.
//   Story 3.3 ends each sequence: `show_dragon_mouth_close` exactly
//   `mouthCloseHoldTicks` after its last pulse, or at once, ahead of the new
//   open, when a request arrives while that close is pending -- so open and
//   close strictly alternate and every pulse falls between a pair.
//
// The arbiter acts only in `phase === 'game'`; in Attract and `game_over` a
// captured ball stays parked, exactly as before this story. The Mouth's due
// pulse, its due close (Story 3.3) and the overflow answer are the
// exceptions: they run in any phase. A pending Mouth sequence and a pending
// close are never cancelled by a ball end, a Slam or a phase change -- each
// is discarded only when `tick` runs backwards (`tilt.ts`'s precedent).
//
// Device and show names are reached only through `TABLE` (AD-16).

import { TABLE } from '../../table/dragonwar';
import { SHOOTER_LAUNCH_COIL, type ControllerContext, type MouthClose, type MouthSequence, type TickOutput } from './shared';
import type { DeviceEvent } from '../devices';
import type { LockLaneEnteredEvent } from '../devices/lock-lane-event';
import type { BallDeviceName, CoilName, GameState, MachineReport } from '../../table/names';

/** The Lock's own `TABLE.ballDevices` entry, reached through `TABLE.lockLaneWiring` -- never a literal. */
const LOCK_DEVICE_ENTRY = TABLE.ballDevices[TABLE.lockLaneWiring.device];

/** `bd_lock`, resolved once through `TABLE.lockLaneWiring`. */
const LOCK_DEVICE = TABLE.lockLaneWiring.device as BallDeviceName;

/** The Mouth's coil (`c_mouth`): the Lock's own declared eject coil. */
const MOUTH_COIL: CoilName = LOCK_DEVICE_ENTRY.ejectCoil as CoilName;

/**
 * The most Mouth ejects one sequence may hold: the Lock's capacity. A pulse
 * beyond the balls the Lock can hold could only ever answer `eject_failed`,
 * so the sequence stays bounded (AD-7's bar for closure state) by
 * construction rather than by every caller's own guard.
 */
const MAX_PENDING_EJECTS: number = LOCK_DEVICE_ENTRY.capacity;

/** The most balls the Lock keeps after a lock: two held (AD-6: "two held plus one staging"). */
const MAX_HELD_AFTER_LOCK = 2;

/** The most `lockCredits` a player may hold (AD-18: a third entry earns nothing). */
const MAX_LOCK_CREDITS = 2;

function isLockLaneEntered(event: DeviceEvent): event is LockLaneEnteredEvent {
	return event.type === 'lock_lane_entered';
}

function isLockEntry(event: DeviceEvent): boolean {
	return event.type === 'device_ball_entered' && event.device === LOCK_DEVICE;
}

/**
 * Story 3.2 (AD-18, AD-8): this tick's device events WITHOUT
 * `lock_lane_entered` -- what `sim/rules/index.ts` hands the mode stack, so
 * no mode ever receives the event the arbiter alone consumes. Returns
 * `events` itself when there is nothing to drop.
 */
export function withoutLockLaneEntered(events: readonly DeviceEvent[]): readonly DeviceEvent[] {
	return events.some(isLockLaneEntered) ? events.filter((event) => !isLockLaneEntered(event)) : events;
}

/** `true` while a Mouth eject is scheduled and not yet pulsed. */
export function mouthEjectPending(ctx: ControllerContext): boolean {
	return ctx.cs.mouth !== null;
}

/** How many Mouth ejects are scheduled and not yet pulsed. */
export function pendingMouthEjects(ctx: ControllerContext): number {
	return ctx.cs.mouth?.dueTicks.length ?? 0;
}

/**
 * S2 (the Mouth's half). Reset-safety: a sequence opened at a tick later
 * than this one belongs to a restarted timeline and is discarded
 * (`tilt.ts:88-97`'s precedent). Story 3.3: so is a pending close whose
 * last pulse fired at a tick later than this one. Nothing else ever
 * discards either.
 */
export function discardStaleMouth(ctx: ControllerContext, tick: number): void {
	const { cs } = ctx;
	if (cs.mouth !== null && tick < cs.mouth.openTick) {
		cs.mouth = null;
	}
	if (cs.mouthClose !== null && tick < cs.mouthClose.lastPulseTick) {
		cs.mouthClose = null;
	}
}

/** Story 3.3 (AD-18): pushes the pending `show_dragon_mouth_close` on this tick and clears it. */
function emitMouthClose(ctx: ControllerContext, tick: number, out: TickOutput): void {
	out.showCommands.push({ type: 'show', show: TABLE.lockLaneWiring.mouthCloseShow, tick });
	ctx.cs.mouthClose = null;
}

/**
 * The one way to eject a ball from the Lock. With nothing pending, pushes
 * `ShowCommand { show: TABLE.lockLaneWiring.mouthOpenShow }` THIS tick and
 * schedules the pulse `mouthOpenLeadTicks` later. With pulses already
 * pending, emits no show and schedules the new pulse
 * `mouthEjectIntervalTicks` after the last one -- one show, one sequence.
 * A request beyond the Lock's capacity is dropped (see `MAX_PENDING_EJECTS`).
 * Story 3.3: with a close pending (the last pulse fired, its hold not yet
 * over), the close is pushed first, on this tick, and then a new sequence
 * opens exactly as above -- open and close strictly alternate.
 * Stories 3.8 and 3.9 fire the Lock through this same call.
 */
export function requestMouthEject(ctx: ControllerContext, tick: number, out: TickOutput): void {
	const { cs, mouthOpenLeadTicks, mouthEjectIntervalTicks } = ctx;
	if (cs.mouth === null) {
		if (cs.mouthClose !== null) {
			emitMouthClose(ctx, tick, out);
		}
		out.showCommands.push({ type: 'show', show: TABLE.lockLaneWiring.mouthOpenShow, tick });
		cs.mouth = { openTick: tick, dueTicks: [tick + mouthOpenLeadTicks] };
		return;
	}
	if (cs.mouth.dueTicks.length >= MAX_PENDING_EJECTS) {
		return;
	}
	const lastDue = cs.mouth.dueTicks[cs.mouth.dueTicks.length - 1]!;
	cs.mouth.dueTicks.push(lastDue + mouthEjectIntervalTicks);
}

/**
 * The Mouth's scheduler: pushes one `pulse` on the Mouth coil when the next
 * scheduled pulse is due, and clears the sequence after its last pulse --
 * recording, from Story 3.3, the pending close `mouthCloseHoldTicks` after
 * that last pulse. Returns `true` when it pulsed this tick -- the drain gate
 * treats that tick as still pending, because the spat ball's
 * `device_ball_left` (and so its `ballsInPlay` +1) only reaches rules on the
 * next tick (AD-4).
 */
function pulseDueMouth(ctx: ControllerContext, tick: number, out: TickOutput): boolean {
	const { cs, mouthCloseHoldTicks } = ctx;
	const sequence: MouthSequence | null = cs.mouth;
	if (sequence === null || sequence.dueTicks[0]! > tick) {
		return false;
	}
	out.coilCommands.push({ type: 'coil', coil: MOUTH_COIL, action: 'pulse', tick });
	sequence.dueTicks.shift();
	if (sequence.dueTicks.length === 0) {
		cs.mouth = null;
		cs.mouthClose = { lastPulseTick: tick, dueTick: tick + mouthCloseHoldTicks };
	}
	return true;
}

/**
 * Story 3.3 (AD-18): emits the pending close on the first tick at or past
 * its due tick. Runs in the SL seam right after `pulseDueMouth()`, so a
 * hold of 0 closes on the last pulse's own tick, after the pulse.
 */
function closeDueMouth(ctx: ControllerContext, tick: number, out: TickOutput): void {
	const pending: MouthClose | null = ctx.cs.mouthClose;
	if (pending !== null && pending.dueTick <= tick) {
		emitMouthClose(ctx, tick, out);
	}
}

/**
 * The serve after a lock -- the save re-serve path (Boundaries): an empty
 * `bd_shooter` gets a trough eject and `awaitingSaveLaunch`, so S7
 * (`./save-serve.ts`) autolaunches the ball on arrival and marks that launch
 * as a re-serve (`awaitingSaveRelaunch`), which never arms ball save. A ball
 * already resting in `bd_shooter` is launched this tick instead, marked the
 * same way.
 */
function serveAfterLock(ctx: ControllerContext, state: GameState, tick: number, out: TickOutput): void {
	const { cs } = ctx;
	if (!state.machine.deviceSlots.bd_shooter[0]) {
		out.coilCommands.push({ type: 'coil', coil: TABLE.ballDevices.bd_trough.ejectCoil as CoilName, action: 'pulse', tick });
		cs.awaitingSaveLaunch = true;
		return;
	}
	out.coilCommands.push({ type: 'coil', coil: SHOOTER_LAUNCH_COIL, action: 'pulse', tick });
	cs.awaitingSaveRelaunch = { startTick: tick };
}

/** One classified Lock-lane entry, in batch order. */
type LockLaneEntry = { readonly kind: 'captured' } | { readonly kind: 'fullDevice' };

/**
 * Classifies this batch (Boundaries): each `lock_lane_entered` is a captured
 * entry when the batch also holds an unpaired Lock `device_ball_entered`
 * (the devices layer emits the two together), and a full-device entry
 * otherwise; every Lock `device_ball_entered` left unpaired is an uncredited
 * park (DW-171).
 */
function classify(deviceEvents: readonly DeviceEvent[]): { readonly entries: readonly LockLaneEntry[]; readonly parks: number } {
	let lockEntries = deviceEvents.filter(isLockEntry).length;
	const entries: LockLaneEntry[] = [];
	for (const event of deviceEvents) {
		if (!isLockLaneEntered(event)) {
			continue;
		}
		if (lockEntries > 0) {
			lockEntries -= 1;
			entries.push({ kind: 'captured' });
		} else {
			entries.push({ kind: 'fullDevice' });
		}
	}
	return { entries, parks: lockEntries };
}

/**
 * The arbiter's seam, after S7 and before the S8 drain gate. In order:
 * the Mouth's due pulse (any phase); its due close (any phase, Story 3.3);
 * the `bd_lock` overflow answer (any phase, DW-174); then, in
 * `phase === 'game'` only, each entry's decision and each uncredited park's
 * eject. Returns the next state (only `players[currentPlayer].lockCredits`
 * ever changes) and whether the Mouth pulsed this tick.
 */
export function arbitrateLockLane(
	ctx: ControllerContext,
	state: GameState,
	deviceEvents: readonly DeviceEvent[],
	machineReport: MachineReport,
	tick: number,
	out: TickOutput,
): { readonly state: GameState; readonly mouthPulsedThisTick: boolean } {
	const mouthPulsedThisTick = pulseDueMouth(ctx, tick, out);
	closeDueMouth(ctx, tick, out);

	// DW-174: a Lock overflow requests one eject only when none is pending.
	// A pending eject already releases the highest slot (the staging ball);
	// a second would release a legitimately held ball.
	for (const failure of machineReport.failures) {
		if (failure.type === 'device_overflow' && failure.device === LOCK_DEVICE && !mouthEjectPending(ctx) && !mouthPulsedThisTick) {
			requestMouthEject(ctx, tick, out);
		}
	}

	if (state.phase !== 'game') {
		return { state, mouthPulsedThisTick };
	}

	const { entries, parks } = classify(deviceEvents);
	let nextState = state;
	for (const entry of entries) {
		nextState = decideEntry(ctx, nextState, entry, tick, out);
	}
	for (let i = 0; i < parks; i++) {
		// DW-171: a park with no entry is ejected, with no outcome event and
		// no credit change.
		requestMouthEject(ctx, tick, out);
	}
	return { state: nextState, mouthPulsedThisTick };
}

/**
 * One entry's decision (Boundaries, "Deciding an entry"). The credit is the
 * current player's (AD-7: player-scoped). `multiball !== null` is
 * unreachable in this story and takes the uncredited spit until Stories
 * 3.7/3.8 refine it.
 */
function decideEntry(ctx: ControllerContext, state: GameState, entry: LockLaneEntry, tick: number, out: TickOutput): GameState {
	const playerIndex = state.currentPlayer;
	const player = state.players[playerIndex];
	if (!player) {
		return state;
	}
	const canCredit = !state.machine.tilt.tilted && state.machine.multiball === null && player.lockCredits < MAX_LOCK_CREDITS;
	const credits = canCredit ? player.lockCredits + 1 : player.lockCredits;
	const nextState: GameState = canCredit
		? { ...state, players: state.players.map((existing, index) => (index === playerIndex ? { ...existing, lockCredits: credits } : existing)) }
		: state;

	const held = state.machine.deviceSlots[LOCK_DEVICE].filter(Boolean).length;
	if (entry.kind === 'captured' && canCredit && held <= MAX_HELD_AFTER_LOCK) {
		out.events.push({ type: 'lock_lane_locked', player: playerIndex, credits, tick });
		serveAfterLock(ctx, nextState, tick, out);
		return nextState;
	}

	out.events.push({ type: 'lock_lane_spit', player: playerIndex, credits, credited: canCredit, tick });
	if (entry.kind === 'captured') {
		// A full-device spit requests nothing: its ball was never parked.
		requestMouthEject(ctx, tick, out);
	}
	return nextState;
}
