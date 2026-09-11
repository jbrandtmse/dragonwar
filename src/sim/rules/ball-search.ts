// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.12 (AD-6, AD-18, AD-19): the ball-search sub-module. Starts a pass
// after `ballSearchMs` of silence with a game ball in play, walks a
// structurally derived stage list at `ballSearchStepMs` intervals (the
// slings, the pops, a bank-reset request, then each ball device's own
// `ballSearchOrder` pulse steps -- Lock, shooter, trough), and ends every
// pass in exactly one `RecoverCommand`. `sim/rules/ball-controller.ts` is
// the sole caller: it constructs one instance, calls `observe()` as the
// FIRST statement of its own `step()` (so a save re-serve's early return can
// never drop a tick's edges), then `step()` after its own Start/drain
// handling, and merges the result.
//
// Device, coil and switch names are never written as literals here (AD-16):
// every stage is derived from `TABLE.slingWiring`/`TABLE.popWiring`/
// `TABLE.ballDevices[*].ballSearchOrder`/`TABLE.lockLaneWiring.device`/
// `TABLE.flipperButtonWiring`, never a hand-typed name.
//
// The clock (task 13's own "The clock" section): search time is the QUIET
// COUNT `q(t)` -- the number of in-play ticks after the origin at which no
// flipper button is held, after that tick's own edges have been folded. The
// origin is the latest of two ticks: the one where "a ball is in play"
// (`phase === 'game' && machine.ballsInPlay > 0`) became true, and the
// latest `playfield_switch_closed`. A held flipper PAUSES the count (it
// simply does not increment that tick); it never resets it. Slot `k` of the
// stage list fires on the first tick where `q >= ballSearchTicks +
// k * ballSearchStepTicks`, the recover being the last slot -- so a hold
// pauses the pass wherever it stands, and resumes it, never restarts it.
//
// Every mark this module holds (the pass's own `origin`, and each held
// button's own press tick) is reset-safe against a restarted timeline: a
// mark strictly greater than the current tick is discarded (`tilt.ts:88-97`'s
// own precedent). `reset()` (called from `startBall()`) clears only the
// pass -- never the held set, which mirrors a physical input level rather
// than a per-ball latch (Design Notes, "a hold that spans a ball boundary").

import { TABLE } from '../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning } from '../table/tuning';
import type { BankResetRequest, DeviceEvent } from './devices';
import type { RecoverCommand } from '../contracts/commands';
import type { CoilCommand, CoilName, GameState, SemanticEvent, SwitchName } from '../table/names';

type BallDeviceEntry = (typeof TABLE.ballDevices)[keyof typeof TABLE.ballDevices];
type BallDeviceKey = keyof typeof TABLE.ballDevices;

/** A guarded pulse stage's reason for silently issuing nothing -- see `applyStage()` below. */
type StageGuard =
	| { readonly kind: 'lock' }
	| { readonly kind: 'tilt' }
	| { readonly kind: 'laneOccupied'; readonly nonParkingDevice: BallDeviceKey };

type BallSearchStage =
	| { readonly kind: 'pulse'; readonly coil: CoilName; readonly guard?: StageGuard }
	| { readonly kind: 'bankReset' }
	| { readonly kind: 'recover' };

/**
 * Task 13's own stage order, derived structurally, never by name:
 * 1. `TABLE.slingWiring` keys;
 * 2. `TABLE.popWiring` keys;
 * 3. one bank-reset REQUEST (never a direct pulse -- AD-19: the drop-bank
 *    component alone pulses `c_dragon_bank_reset`);
 * 4. each ball device's `ballSearchOrder` `pulse` steps, ordered: parking
 *    devices with no `servesInto` (the Lock) first, then non-parking
 *    devices (the shooter), then parking devices WITH a `servesInto` (the
 *    trough) last -- so the trough's own eject can never stack a second
 *    ball on a plunger tip the shooter's own autolaunch slot already tried;
 * 5. one recover.
 *
 * Throws naming the defect for an empty `slingWiring`/`popWiring` or a ball
 * device with no `pulse` step in its own `ballSearchOrder` -- a `TABLE`
 * authoring defect, not a runtime condition to degrade from.
 */
function buildStages(): readonly BallSearchStage[] {
	const stages: BallSearchStage[] = [];

	const slingCoils = Object.keys(TABLE.slingWiring) as CoilName[];
	if (slingCoils.length === 0) {
		throw new Error('createBallSearch(): TABLE.slingWiring has no entries -- ball search has no slings to pulse (a TABLE authoring defect)');
	}
	for (const coil of slingCoils) {
		stages.push({ kind: 'pulse', coil });
	}

	const popCoils = Object.keys(TABLE.popWiring) as CoilName[];
	if (popCoils.length === 0) {
		throw new Error('createBallSearch(): TABLE.popWiring has no entries -- ball search has no pops to pulse (a TABLE authoring defect)');
	}
	for (const coil of popCoils) {
		stages.push({ kind: 'pulse', coil });
	}

	stages.push({ kind: 'bankReset' });

	const lockDevice = TABLE.lockLaneWiring.device as BallDeviceKey;
	const entries = Object.entries(TABLE.ballDevices) as Array<[BallDeviceKey, BallDeviceEntry]>;

	// The reverse `servesInto switch -> non-parking device` lookup the
	// `laneOccupied` guard reads: which non-parking device's own `entry`
	// equals a parking device's declared `servesInto`.
	const nonParkingByEntrySwitch = new Map<string, BallDeviceKey>();
	for (const [name, device] of entries) {
		if (device.kind === 'non-parking') {
			nonParkingByEntrySwitch.set(device.entry, name);
		}
	}

	function servesIntoOf(device: BallDeviceEntry): string | undefined {
		return (device as { readonly servesInto?: string }).servesInto ?? undefined;
	}

	function guardFor(name: BallDeviceKey, device: BallDeviceEntry): StageGuard | undefined {
		if (name === lockDevice) {
			// AD-18, phased on AD-8's precedent: the Lock's own slots issue
			// nothing until Story 3.2 builds the Lock arbiter.
			return { kind: 'lock' };
		}
		if (device.kind === 'non-parking') {
			// 2.11's shipped promise ("no autolaunch into a tilted playfield")
			// extended to the search's own equivalent slot.
			return { kind: 'tilt' };
		}
		const servesInto = servesIntoOf(device);
		if (servesInto) {
			const nonParkingDevice = nonParkingByEntrySwitch.get(servesInto);
			if (!nonParkingDevice) {
				throw new Error(
					`createBallSearch(): ball device "${name}" declares servesInto "${servesInto}", but no non-parking device's own entry matches it (a TABLE authoring defect)`,
				);
			}
			return { kind: 'laneOccupied', nonParkingDevice };
		}
		return undefined;
	}

	function pushDevicePulses(name: BallDeviceKey, device: BallDeviceEntry): void {
		const guard = guardFor(name, device);
		let pushedAny = false;
		for (const step of device.ballSearchOrder) {
			if (step.action !== 'pulse') {
				continue;
			}
			stages.push({ kind: 'pulse', coil: step.coil as CoilName, guard });
			pushedAny = true;
		}
		if (!pushedAny) {
			throw new Error(`createBallSearch(): ball device "${name}" has no "pulse" step in its own ballSearchOrder (a TABLE authoring defect)`);
		}
	}

	// (a) parking devices with no servesInto -- the Lock.
	for (const [name, device] of entries) {
		if (device.kind === 'parking' && !servesIntoOf(device)) {
			pushDevicePulses(name, device);
		}
	}
	// (b) non-parking devices -- the shooter.
	for (const [name, device] of entries) {
		if (device.kind === 'non-parking') {
			pushDevicePulses(name, device);
		}
	}
	// (c) parking devices WITH a servesInto -- the trough, last.
	for (const [name, device] of entries) {
		if (device.kind === 'parking' && servesIntoOf(device)) {
			pushDevicePulses(name, device);
		}
	}

	stages.push({ kind: 'recover' });

	return stages;
}

function buildFlipperButtons(): ReadonlySet<SwitchName> {
	const buttons = new Set<SwitchName>();
	for (const wiring of Object.values(TABLE.flipperButtonWiring)) {
		buttons.add(wiring.switch as SwitchName);
	}
	if (buttons.size === 0) {
		throw new Error('createBallSearch(): TABLE.flipperButtonWiring has no entries -- ball search has no held set to derive (a TABLE authoring defect)');
	}
	return buttons;
}

export interface BallSearchStepResult {
	readonly events: readonly SemanticEvent[];
	readonly coilCommands: readonly CoilCommand[];
	readonly recoverCommands: readonly RecoverCommand[];
	readonly bankResetRequests: readonly BankResetRequest[];
}

export interface BallSearch {
	/**
	 * Folds this tick's `playfield_switch_closed` (a new origin, cancelling
	 * a running pass) and the flipper buttons' own `button_pressed`/
	 * `button_released` (the held set). Runs on every tick, in every phase,
	 * whatever `ballsInPlay` reads.
	 */
	observe(deviceEvents: readonly DeviceEvent[], tick: number): void;
	/** Advances the pass, if any, against this tick's `GameState`. */
	step(state: GameState, tick: number): BallSearchStepResult;
	/** Clears the timer and schedule for `startBall()` -- never the held set. */
	reset(): void;
}

interface Pass {
	origin: number;
	quietTicks: number;
	nextStageIndex: number;
}

export function createBallSearch(tuning: ResolvedTuning): BallSearch {
	const ballSearchTicks = shotWindowTicks('ballSearchMs', tuning);
	const ballSearchStepTicks = shotWindowTicks('ballSearchStepMs', tuning);
	const stages = buildStages();
	const flipperButtons = buildFlipperButtons();

	// Cross-tick, instance-local closure state (AD-7's own bar: reproducible
	// from tick 0, bounded, restart-safe) -- never `GameState` (Boundaries:
	// "the search timer and schedule are closure state ... never GameState").
	let pass: Pass | null = null;
	const heldSince = new Map<SwitchName, number>();
	let wasInPlay = false;

	function applyStage(
		stage: BallSearchStage,
		state: GameState,
		tick: number,
		coilCommands: CoilCommand[],
		recoverCommands: RecoverCommand[],
		bankResetRequests: BankResetRequest[],
	): void {
		if (stage.kind === 'recover') {
			recoverCommands.push({ type: 'recover', tick });
			return;
		}
		if (stage.kind === 'bankReset') {
			bankResetRequests.push({ type: 'bank_reset_requested', tick });
			return;
		}
		if (stage.guard) {
			if (stage.guard.kind === 'lock') {
				return;
			}
			if (stage.guard.kind === 'tilt' && state.machine.tilt.tilted) {
				return;
			}
			if (stage.guard.kind === 'laneOccupied' && state.machine.deviceSlots[stage.guard.nonParkingDevice]?.[0]) {
				return;
			}
		}
		coilCommands.push({ type: 'coil', coil: stage.coil, action: 'pulse', tick });
	}

	function observe(deviceEvents: readonly DeviceEvent[], tick: number): void {
		// Reset-safety (AD-7, tilt.ts:88-97's own precedent): a mark strictly
		// greater than the current tick is from a different (restarted)
		// timeline and is discarded, never compared against.
		if (pass !== null && pass.origin > tick) {
			pass = null;
		}
		for (const [button, pressTick] of heldSince) {
			if (pressTick > tick) {
				heldSince.delete(button);
			}
		}

		let closed = false;
		for (const event of deviceEvents) {
			if (event.type === 'playfield_switch_closed') {
				closed = true;
			} else if (event.type === 'button_pressed' && flipperButtons.has(event.button)) {
				heldSince.set(event.button, tick);
			} else if (event.type === 'button_released' && flipperButtons.has(event.button)) {
				heldSince.delete(event.button);
			}
		}
		if (closed) {
			pass = { origin: tick, quietTicks: 0, nextStageIndex: 0 };
		}
	}

	function step(state: GameState, tick: number): BallSearchStepResult {
		const events: SemanticEvent[] = [];
		const coilCommands: CoilCommand[] = [];
		const recoverCommands: RecoverCommand[] = [];
		const bankResetRequests: BankResetRequest[] = [];

		const inPlayNow = state.phase === 'game' && state.machine.ballsInPlay > 0;
		if (inPlayNow && !wasInPlay) {
			pass = { origin: tick, quietTicks: 0, nextStageIndex: 0 };
		}
		wasInPlay = inPlayNow;

		if (pass !== null) {
			const held = heldSince.size > 0;
			// The origin tick itself never counts as quiet (q(O) = 0, task 13's
			// own clock: "the number of ticks u with origin < u <= t"). Guards
			// against double-crediting the very tick a fresh origin was just
			// set on THIS SAME call, whether by the in-play transition above or
			// by observe()'s own closure fold immediately before it.
			if (!held && tick > pass.origin) {
				pass.quietTicks += 1;
			}

			if (inPlayNow && pass.nextStageIndex < stages.length) {
				const k = pass.nextStageIndex;
				const threshold = ballSearchTicks + k * ballSearchStepTicks;
				if (pass.quietTicks >= threshold) {
					if (k === 0) {
						events.push({ type: 'ball_search_started', tick });
					}
					applyStage(stages[k]!, state, tick, coilCommands, recoverCommands, bankResetRequests);
					pass.nextStageIndex += 1;
				}
			}
		}

		return { events, coilCommands, recoverCommands, bankResetRequests };
	}

	function reset(): void {
		pass = null;
	}

	return { observe, step, reset };
}
