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
//   Story 3.4: a captured entry with lit Modes emits `lock_lane_mode_start`
//   -- after the credit's own event when a credit applies (the only
//   two-event outcomes), or alone, in place of the spit, when the player
//   already holds two credits -- and starts the one candidate, or
//   holds the ball in `bd_lock` for a mode-select window
//   (`ControllerState.modeSelect`) that flipper presses move and Start, a
//   flipper hold or its expiry confirm;
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
// exceptions: they run in any phase. So does, from Story 3.4, the eject a
// Slam leaves owed to an unlocked capture's mode-select window
// (`stepModeSelect()`). A pending Mouth sequence and a pending close are
// never cancelled by a ball end, a Slam or a phase change -- each is
// discarded only when `tick` runs backwards (`tilt.ts`'s precedent) -- and
// while a sequence is pending no new game starts (`./start.ts`, DW-296): its
// ball is parked beyond the Start-time stray clear's reach.
//
// Device and show names are reached only through `TABLE` (AD-16).

import { TABLE } from '../../table/dragonwar';
import { candidatesFor, startCampaignMode } from '../modes/campaign';
import { SHOOTER_LAUNCH_COIL, START_BUTTON, type ControllerContext, type ModeSelectWindow, type MouthClose, type MouthSequence, type TickOutput } from './shared';
import type { DeviceEvent, FlipperSide } from '../devices';
import type { LockLaneEnteredEvent } from '../devices/lock-lane-event';
import type { ModeSelectEndReason } from '../../contracts/events';
import type { CampaignModeName } from '../../contracts/state';
import type { BallDeviceName, CoilName, GameState, MachineReport, SwitchName } from '../../table/names';

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

/** Story 3.4 (AD-18): each flipper button's side, from `TABLE.flipperButtonWiring` -- never a switch literal. */
const FLIPPER_SIDE_BY_BUTTON: ReadonlyMap<SwitchName, FlipperSide> = new Map(
	(Object.keys(TABLE.flipperButtonWiring) as FlipperSide[]).map((side) => [TABLE.flipperButtonWiring[side].switch as SwitchName, side]),
);

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
	// Story 3.4: a mode-select window opened at a later tick belongs to a
	// restarted timeline -- discarded with no event.
	if (cs.modeSelect !== null && tick < cs.modeSelect.openTick) {
		cs.modeSelect = null;
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

/**
 * Story 3.4 (AD-8, AD-18): starts campaign Mode `mode` for `playerIndex`
 * through `startCampaignMode()` -- the ONLY campaign start path -- putting its
 * lifecycle triple on this tick's `modeEvents`, and pushes `ShowCommand
 * { show: TABLE.modeWiring.startShow }`. Every caller runs this BEFORE the
 * capture's Mouth request, so the show precedes any Mouth open for the same
 * capture.
 */
function startMode(ctx: ControllerContext, state: GameState, mode: CampaignModeName, playerIndex: number, tick: number, out: TickOutput): GameState {
	const started = startCampaignMode(state, ctx.modes, mode, playerIndex, tick);
	out.modeEvents.push(...started.events);
	out.showCommands.push({ type: 'show', show: TABLE.modeWiring.startShow, tick });
	return started.state;
}

/** Story 3.4: the release a capture owes -- the trough serve after a lock, or the Mouth eject for an unlocked capture. */
function runRelease(ctx: ControllerContext, state: GameState, release: ModeSelectWindow['release'], tick: number, out: TickOutput): void {
	if (release === 'serve') {
		serveAfterLock(ctx, state, tick, out);
	} else {
		requestMouthEject(ctx, tick, out);
	}
}

/**
 * Story 3.4 (AD-18): a capture with candidates. With one, that Mode starts on
 * this tick and the release runs at once. With two or more, the mode-select
 * window opens (`ControllerState.modeSelect`), the ball stays parked in
 * `bd_lock`, and the start and the release wait for the confirm.
 */
function startOrOpenWindow(
	ctx: ControllerContext,
	state: GameState,
	playerIndex: number,
	candidates: readonly CampaignModeName[],
	release: ModeSelectWindow['release'],
	tick: number,
	out: TickOutput,
): GameState {
	if (candidates.length === 1) {
		const next = startMode(ctx, state, candidates[0]!, playerIndex, tick, out);
		runRelease(ctx, next, release, tick, out);
		return next;
	}
	ctx.cs.modeSelect = {
		player: playerIndex,
		candidates,
		selected: candidates[0]!,
		openTick: tick,
		dueTick: tick + ctx.modeSelectTicks,
		release,
		pressedAt: null,
	};
	return state;
}

/** Story 3.4: ends the window -- `mode_select_ended`, then the selected Mode's start (none for a Tilt), then the release. */
function endWindow(ctx: ControllerContext, state: GameState, selection: ModeSelectWindow, reason: ModeSelectEndReason, tick: number, out: TickOutput): GameState {
	ctx.cs.modeSelect = null;
	const mode = reason === 'tilt' ? null : selection.selected;
	out.events.push({ type: 'mode_select_ended', player: selection.player, mode, reason, tick });
	const next = mode === null ? state : startMode(ctx, state, mode, selection.player, tick, out);
	runRelease(ctx, next, selection.release, tick, out);
	return next;
}

/**
 * Story 3.4 (AD-18): one tick of the open mode-select window, in the SL seam
 * before this tick's entries are classified. Outside `phase === 'game'` (a
 * Slam) the window is discarded with no event and no start; an unlocked
 * capture's owed Mouth eject is still requested. A Tilt ends it with no start
 * but still runs the release. Otherwise this tick's device events are read in
 * batch order: a Start press confirms (`'start'`); a flipper button's press
 * moves the selection one step (right forward, left back, wrapping), emits
 * `mode_select_moved` and records the press; that side's release clears it.
 * Then a press held `modeSelectHoldTicks` confirms (`'flipper_held'`), and
 * the window's `dueTick` confirms (`'expired'`). A press made before the
 * window opened was never recorded, so it never confirms.
 */
function stepModeSelect(ctx: ControllerContext, state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, out: TickOutput): GameState {
	let selection: ModeSelectWindow | null = ctx.cs.modeSelect;
	if (selection === null) {
		return state;
	}
	if (state.phase !== 'game') {
		// A Slam discards the window with no event and no start. An unlocked
		// capture's ball (`release: 'mouth'`) is still owed its Mouth eject --
		// a Mouth sequence runs in any phase (AD-18) and "a ball waiting to be
		// spat is still on the machine" (`MouthSequence`'s own rule); without
		// it the ball stays in the staging slot and the Lock stays full. A
		// locked ball (`'serve'`) stays locked, and a voided game serves
		// nothing.
		ctx.cs.modeSelect = null;
		if (selection.release === 'mouth') {
			requestMouthEject(ctx, tick, out);
		}
		return state;
	}
	if (state.machine.tilt.tilted) {
		return endWindow(ctx, state, selection, 'tilt', tick, out);
	}
	for (const event of deviceEvents) {
		if (event.type === 'button_pressed') {
			if (event.button === START_BUTTON) {
				return endWindow(ctx, state, selection, 'start', tick, out);
			}
			const side = FLIPPER_SIDE_BY_BUTTON.get(event.button);
			if (side !== undefined) {
				const count: number = selection.candidates.length;
				const index: number = selection.candidates.indexOf(selection.selected);
				const selected: CampaignModeName = selection.candidates[(((index + (side === 'right' ? 1 : -1)) % count) + count) % count]!;
				selection = { ...selection, selected, pressedAt: { side, tick } };
				out.events.push({ type: 'mode_select_moved', player: selection.player, candidates: selection.candidates, selected, tick });
			}
		} else if (event.type === 'button_released' && selection.pressedAt !== null && FLIPPER_SIDE_BY_BUTTON.get(event.button) === selection.pressedAt.side) {
			selection = { ...selection, pressedAt: null };
		}
	}
	ctx.cs.modeSelect = selection;
	if (selection.pressedAt !== null && tick - selection.pressedAt.tick >= ctx.modeSelectHoldTicks) {
		return endWindow(ctx, state, selection, 'flipper_held', tick, out);
	}
	if (tick >= selection.dueTick) {
		return endWindow(ctx, state, selection, 'expired', tick, out);
	}
	return state;
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

	// Story 3.4 (AD-18): the open mode-select window steps first, before this
	// tick's entries are classified (and before the overflow answer, which
	// then sees a Mouth eject the window's release requested as pending).
	const stateAfterWindow = stepModeSelect(ctx, state, deviceEvents, tick, out);

	// DW-174: a Lock overflow requests one eject only when none is pending.
	// A pending eject already releases the highest slot (the staging ball);
	// a second would release a legitimately held ball.
	for (const failure of machineReport.failures) {
		if (failure.type === 'device_overflow' && failure.device === LOCK_DEVICE && !mouthEjectPending(ctx) && !mouthPulsedThisTick) {
			requestMouthEject(ctx, tick, out);
		}
	}

	if (stateAfterWindow.phase !== 'game') {
		return { state: stateAfterWindow, mouthPulsedThisTick };
	}

	const { entries, parks } = classify(deviceEvents);
	let nextState = stateAfterWindow;
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
 *
 * Story 3.4 (AD-18): a CAPTURED entry, untilted and with no multiball, also
 * reads the player's candidates (`candidatesFor()`). With candidates:
 * - the lock applies: `lock_lane_locked`, then `lock_lane_mode_start`; the
 *   release is the serve;
 * - this capture fills the Lock: `lock_lane_spit { credited: true }`, then
 *   `lock_lane_mode_start`; the release is the Mouth;
 * - two credits: `lock_lane_mode_start` alone; the release is the Mouth.
 * One candidate starts on this tick and the release runs at once; two or
 * more open the mode-select window and both wait for its confirm. A
 * full-device entry (never captured) never starts a Mode, and the lit Modes
 * stay lit. While a window is already open (unreachable: no ball is in play
 * meanwhile) a new capture starts nothing, so there is at most one window.
 */
function decideEntry(ctx: ControllerContext, state: GameState, entry: LockLaneEntry, tick: number, out: TickOutput): GameState {
	const playerIndex = state.currentPlayer;
	const player = state.players[playerIndex];
	if (!player) {
		return state;
	}
	const live = !state.machine.tilt.tilted && state.machine.multiball === null;
	const canCredit = live && player.lockCredits < MAX_LOCK_CREDITS;
	const credits = canCredit ? player.lockCredits + 1 : player.lockCredits;
	const nextState: GameState = canCredit
		? { ...state, players: state.players.map((existing, index) => (index === playerIndex ? { ...existing, lockCredits: credits } : existing)) }
		: state;
	// Story 3.4: only a captured, live entry reads candidates -- a full-device
	// entry was never parked, so it can never wait out a window.
	const candidates = entry.kind === 'captured' && live && ctx.cs.modeSelect === null ? candidatesFor(nextState, playerIndex) : [];

	const held = state.machine.deviceSlots[LOCK_DEVICE].filter(Boolean).length;
	if (entry.kind === 'captured' && canCredit && held <= MAX_HELD_AFTER_LOCK) {
		out.events.push({ type: 'lock_lane_locked', player: playerIndex, credits, tick });
		if (candidates.length > 0) {
			out.events.push({ type: 'lock_lane_mode_start', player: playerIndex, candidates, selected: candidates[0]!, tick });
			return startOrOpenWindow(ctx, nextState, playerIndex, candidates, 'serve', tick, out);
		}
		serveAfterLock(ctx, nextState, tick, out);
		return nextState;
	}

	if (candidates.length > 0) {
		// Story 3.4: a captured, live entry that does not lock -- this capture
		// fills the Lock (the credit still counts, AD-18: the credited spit
		// first) or the player already holds two credits (the Mode start is
		// the entry's only outcome). The Mouth releases the ball, now or at the
		// window's confirm.
		if (canCredit) {
			out.events.push({ type: 'lock_lane_spit', player: playerIndex, credits, credited: true, tick });
		}
		out.events.push({ type: 'lock_lane_mode_start', player: playerIndex, candidates, selected: candidates[0]!, tick });
		return startOrOpenWindow(ctx, nextState, playerIndex, candidates, 'mouth', tick, out);
	}

	out.events.push({ type: 'lock_lane_spit', player: playerIndex, credits, credited: canCredit, tick });
	if (entry.kind === 'captured') {
		// A full-device spit requests nothing: its ball was never parked.
		requestMouthEject(ctx, tick, out);
	}
	return nextState;
}
