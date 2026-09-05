// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19 -- the devices-and-shots layer, the ONLY consumer of `SwitchEvent`
// under `src/sim/rules/**` (enforced by `tools/boundary-lint.mjs`'s
// `rules-no-switch-event-outside-devices` rule -- everything under this
// directory is exempt, everything else under `sim/rules/` is not). Owns the
// shooter-lane launch, every ball-device's slot bookkeeping, the drop bank
// (delegated to `./drop-bank.ts`), the spinner count, the Lock lane's
// capture resolution (DW-166), lane entries, cabinet-button reports and the
// three declared shots (delegated to `./shots.ts`).
//
// The layer holds cross-tick state -- in-flight shot sequences (`./shots.ts`),
// the bank's own letters-down latch (`./drop-bank.ts`), `bd_lock`'s tracked
// slot occupancy and the pending Lock-lane closure below -- so it is
// INSTANTIATED, not module-global (`createDevicesLayer()` mirrors
// `createMachine()`): a module-level variable would leak between two loops
// in one process, the exact defect Story 2.3's spinner hit with its own
// module-level `occupied` boolean.
//
// `GameState` gains nothing from this layer (Design Notes, "Where the
// layer's state lives"): bank letters, shot progress, the tracked slot
// occupancy and the pending Lock-lane closure are layer-local, never written
// to `machine.deviceSlots` or any other `GameState` field. Only
// `ball_launched` and (via `sim/rules/ball-controller.ts`)
// `device_ball_entered`/`_left`'s effect on `machine.ballsInPlay` reach
// `GameState` at all, exactly as before this story.

import { TABLE } from '../../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning } from '../../table/tuning';
import type { BallDeviceName, CoilCommand, SwitchEvent, SwitchName } from '../../table/names';
import type { BallWillStartEvent } from '../../contracts/events';
import { createDropBankTracker } from './drop-bank';
import { createShotTracker } from './shots';
import type {
	ButtonPressedEvent,
	DeviceEvent,
	DragonHitEvent,
	LaneChangePressedEvent,
	LaneEnteredEvent,
	LaneName,
	LockLaneEnteredEvent,
	SpinnerSpinEvent,
} from './events';

export type {
	ButtonPressedEvent,
	DeviceBallEnteredEvent,
	DeviceBallLeftEvent,
	DeviceEvent,
	BankCompletedEvent,
	BankTargetDownEvent,
	DragonHitEvent,
	DropBankLetter,
	FlipperSide,
	LaneChangePressedEvent,
	LaneEnteredEvent,
	LaneName,
	LockLaneEnteredEvent,
	ShotBrokenEvent,
	ShotMadeEvent,
	SpinnerSpinEvent,
} from './events';

export interface DevicesLayerStepResult {
	readonly events: readonly DeviceEvent[];
	readonly coilCommands: readonly CoilCommand[];
}

export interface DevicesLayer {
	/**
	 * Runs one tick's switch edges (and the rules-internal lifecycle events
	 * this layer reacts to -- today, only `ball_will_start`) through every
	 * device and shot component, returning the events and coil commands this
	 * tick produced. Called every tick, even with no edges at all (AD-4: an
	 * in-flight, `entryExclusive: true` shot can lapse with none, and its own
	 * `_broken` still owes a tick).
	 */
	step(switchEvents: readonly SwitchEvent[], lifecycleEvents: readonly BallWillStartEvent[], tick: number): DevicesLayerStepResult;
}

type ParkingDeviceName = {
	[K in BallDeviceName]: (typeof TABLE.ballDevices)[K]['kind'] extends 'parking' ? K : never;
}[BallDeviceName];

/** Every ball device's slot switches (fill order) mapped to `{ device, slot }`, and every non-parking device's own entry switch -- both derived from `TABLE.ballDevices`, never a literal (mirrors the Epic 1 minimum this story grows). */
function buildBallDeviceIndex(): {
	readonly slotBySwitch: ReadonlyMap<SwitchName, { readonly device: BallDeviceName; readonly slot: number }>;
	readonly nonParkingEntries: ReadonlyMap<SwitchName, BallDeviceName>;
} {
	const slotBySwitch = new Map<SwitchName, { device: BallDeviceName; slot: number }>();
	const nonParkingEntries = new Map<SwitchName, BallDeviceName>();
	for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
		if (device.kind === 'non-parking') {
			nonParkingEntries.set(device.entry as SwitchName, name);
			continue;
		}
		device.slots.forEach((slot, index) => {
			slotBySwitch.set(slot as SwitchName, { device: name, slot: index });
		});
	}
	return { slotBySwitch, nonParkingEntries };
}

/** Every parking device's own slot occupancy, seeded from its declared boot state (`startsFullAtBoot`) -- mirrors physics's own boot rule (AD-6) so this layer's Lock-lane "device full" check (DW-166) starts truthful. */
function buildInitialOccupancy(): Record<ParkingDeviceName, boolean[]> {
	const occupancy = {} as Record<ParkingDeviceName, boolean[]>;
	for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
		if (device.kind !== 'parking') {
			continue;
		}
		occupancy[name as ParkingDeviceName] = device.slots.map(() => device.startsFullAtBoot);
	}
	return occupancy;
}

/** Reverse `switch -> lane` lookup from `TABLE.laneWiring`, so a lane switch edge resolves its `lane` payload from `TABLE`, never a literal. */
function buildLaneBySwitch(): ReadonlyMap<SwitchName, LaneName> {
	const map = new Map<SwitchName, LaneName>();
	for (const [lane, wiring] of Object.entries(TABLE.laneWiring) as Array<[LaneName, { switch: SwitchName }]>) {
		map.set(wiring.switch, lane);
	}
	return map;
}

/** Every button-class switch (`settleClass: 'button'`), derived from `TABLE.switches` -- the same idiom `sim/loop/index.ts`'s own `buttonSwitchByAction()` uses, independently re-derived here (DW-149: two modules, one TABLE key set, never one importing the other's list). */
function buildButtonSwitches(): ReadonlySet<SwitchName> {
	const buttons = new Set<SwitchName>();
	for (const [name, sw] of Object.entries(TABLE.switches) as Array<[SwitchName, { settleClass: string }]>) {
		if (sw.settleClass === 'button') {
			buttons.add(name);
		}
	}
	return buttons;
}

interface PendingLockLaneClosure {
	readonly startTick: number;
}

export function createDevicesLayer(tuning: ResolvedTuning): DevicesLayer {
	const { slotBySwitch, nonParkingEntries } = buildBallDeviceIndex();
	const occupancy = buildInitialOccupancy();
	const laneBySwitch = buildLaneBySwitch();
	const buttonSwitches = buildButtonSwitches();
	const dropBank = createDropBankTracker();
	const shots = createShotTracker(tuning);

	const lockLaneSwitch = TABLE.lockLaneWiring.switch as SwitchName;
	const lockLaneDevice = TABLE.lockLaneWiring.device as ParkingDeviceName;
	// DW-166: not a per-shot `TABLE.shots[*].windowMs` entry (the Lock lane is
	// not one of the three declared shots) but the same top-level `…Ms` ->
	// `…Ticks` resolution `shotWindowTicks()` already provides generically.
	const lockCaptureWindowTicks = shotWindowTicks('lockCaptureWindowMs', tuning);

	const spinnerSwitches = new Set<SwitchName>(Object.values(TABLE.spinnerWiring).map((w) => w.switch as SwitchName));

	let pendingLockLaneClosure: PendingLockLaneClosure | null = null;

	function isDeviceFull(device: ParkingDeviceName): boolean {
		return occupancy[device].every(Boolean);
	}

	function step(switchEvents: readonly SwitchEvent[], lifecycleEvents: readonly BallWillStartEvent[], tick: number): DevicesLayerStepResult {
		const events: DeviceEvent[] = [];
		const coilCommands: CoilCommand[] = [];

		// DW-166: expire a pending, unresolved Lock-lane closure BEFORE this
		// tick's own edges are read -- the same ordering `./shots.ts` uses for
		// its own window expiry, and for the identical reason: a slot switch
		// that only closes after the window has already lapsed is not a
		// capture the arbiter should ever see credited.
		if (pendingLockLaneClosure && tick > pendingLockLaneClosure.startTick + lockCaptureWindowTicks) {
			pendingLockLaneClosure = null;
		}

		// Stage 1: ball-device slot bookkeeping and the shooter lane's launch
		// -- the Epic 1 minimum this story grows, extended to also update
		// `occupancy` (DW-166's own capture-resolution input).
		for (const event of switchEvents) {
			const entryDevice = nonParkingEntries.get(event.switch);
			if (entryDevice && !event.closed) {
				events.push({ type: 'ball_launched', tick: event.tick });
				continue;
			}
			const slot = slotBySwitch.get(event.switch);
			if (!slot) {
				continue;
			}
			if (event.closed) {
				events.push({ type: 'device_ball_entered', device: slot.device, slot: slot.slot, tick: event.tick });
				if (slot.device in occupancy) {
					occupancy[slot.device as ParkingDeviceName][slot.slot] = true;
				}
				// DW-166: a capture landing inside the window resolves the
				// pending Lock-lane closure immediately.
				if (
					slot.device === lockLaneDevice &&
					pendingLockLaneClosure &&
					event.tick <= pendingLockLaneClosure.startTick + lockCaptureWindowTicks
				) {
					events.push({ type: 'lock_lane_entered', tick: event.tick } satisfies LockLaneEnteredEvent);
					pendingLockLaneClosure = null;
				}
			} else {
				events.push({ type: 'device_ball_left', device: slot.device, slot: slot.slot, tick: event.tick });
				if (slot.device in occupancy) {
					occupancy[slot.device as ParkingDeviceName][slot.slot] = false;
				}
			}
		}

		// Stage 2: the Lock lane's own entry switch -- DW-166's discriminating
		// condition. A closure while the device is ALREADY full resolves
		// immediately (physics parks nothing; AD-18's `lock_lane_spit` still
		// needs the credit); otherwise it starts (or restarts) the pending
		// window Stage 1's own `device_ball_entered` resolves against.
		for (const event of switchEvents) {
			if (event.switch !== lockLaneSwitch || !event.closed) {
				continue;
			}
			if (isDeviceFull(lockLaneDevice)) {
				events.push({ type: 'lock_lane_entered', tick: event.tick } satisfies LockLaneEnteredEvent);
				pendingLockLaneClosure = null;
			} else {
				pendingLockLaneClosure = { startTick: event.tick };
			}
		}

		// Stage 3: the Dragon body's own standup face, lane entries, cabinet
		// buttons (and the flipper buttons' own lane-change report).
		for (const event of switchEvents) {
			if (!event.closed) {
				continue;
			}
			if (event.switch === (TABLE.dragonBodyWiring.switch as SwitchName)) {
				events.push({ type: 'dragon_hit', tick: event.tick } satisfies DragonHitEvent);
			}
			const lane = laneBySwitch.get(event.switch);
			if (lane) {
				events.push({ type: 'lane_entered', lane, tick: event.tick } satisfies LaneEnteredEvent);
			}
			if (event.switch === (TABLE.flipperButtonWiring.left.switch as SwitchName)) {
				events.push({ type: 'lane_change_pressed', side: 'left', tick: event.tick } satisfies LaneChangePressedEvent);
			} else if (event.switch === (TABLE.flipperButtonWiring.right.switch as SwitchName)) {
				events.push({ type: 'lane_change_pressed', side: 'right', tick: event.tick } satisfies LaneChangePressedEvent);
			}
			if (buttonSwitches.has(event.switch)) {
				events.push({ type: 'button_pressed', button: event.switch, tick: event.tick } satisfies ButtonPressedEvent);
			}
		}

		// Stage 4: the spinner -- one event per tick, the COUNT of closed:true
		// edges this tick, never one event per closure and never a count of 0
		// (AC 8).
		let spinnerCount = 0;
		for (const event of switchEvents) {
			if (event.closed && spinnerSwitches.has(event.switch)) {
				spinnerCount += 1;
			}
		}
		if (spinnerCount > 0) {
			events.push({ type: 'spinner_spin', count: spinnerCount, tick } satisfies SpinnerSpinEvent);
		}

		// Stage 5/6: the declared shots and the drop bank -- delegated.
		events.push(...shots.step(switchEvents, tick));
		const bankResult = dropBank.step(switchEvents, tick);
		events.push(...bankResult.events);
		coilCommands.push(...bankResult.coilCommands);

		// Lifecycle: ball_will_start pulses the reset whatever the bank state
		// (AC 4) -- the drop bank's own letters clear later, from the real
		// closed:false edges physics emits when that pulse lands.
		for (const lifecycleEvent of lifecycleEvents) {
			coilCommands.push(dropBank.onBallWillStart(lifecycleEvent.tick));
		}

		return { events, coilCommands };
	}

	return { step };
}
