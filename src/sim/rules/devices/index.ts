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

import { TABLE, type SettleClass } from '../../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning } from '../../table/tuning';
import type { BallDeviceName, CoilCommand, SwitchEvent, SwitchName } from '../../table/names';
import type { BallWillStartEvent } from '../../contracts/events';
import { createDropBankTracker } from './drop-bank';
import { createShotTracker } from './shots';
import type {
	ButtonPressedEvent,
	DeviceEvent,
	DragonHitEvent,
	FlipperSide,
	LaneChangePressedEvent,
	LaneEnteredEvent,
	LaneName,
	LockLaneEnteredEvent,
	PlayfieldSwitchClosedEvent,
	SlamTiltClosedEvent,
	SpinnerSpinEvent,
	TiltBobClosedEvent,
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
	PlayfieldSwitchClosedEvent,
	ShotBrokenEvent,
	ShotMadeEvent,
	SlamTiltClosedEvent,
	SpinnerSpinEvent,
	TiltBobClosedEvent,
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

/**
 * Every ball device's own slot occupancy at boot -- parking devices seeded
 * from their declared `startsFullAtBoot` (mirrors physics's own boot rule,
 * AD-6, so this layer's Lock-lane "device full" check, DW-166, starts
 * truthful); the non-parking `bd_shooter` seeded `[false]` (mirrors
 * `physics/machine.ts`'s own `deviceSlots` getter, which synthesises a
 * non-parking device's single slot from its entry switch's live state --
 * always open at boot). Widened (Story 2.5, task 2) from
 * `Record<ParkingDeviceName, boolean[]>` so `bd_shooter`'s own occupancy has
 * somewhere to live once its entry switch starts emitting
 * `device_ball_entered`/`_left` too (DW-70's whole-record derivation needs a
 * total record, `state.ts:72`) -- never a second hand-typed device list
 * (DW-149).
 */
function buildInitialOccupancy(): Record<BallDeviceName, boolean[]> {
	const occupancy = {} as Record<BallDeviceName, boolean[]>;
	for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
		occupancy[name] = device.kind === 'parking' ? device.slots.map(() => device.startsFullAtBoot) : [false];
	}
	return occupancy;
}

/**
 * Public seam (Story 2.5, task 2, "Expose the boot occupancy for the
 * rules-side seed"): the SAME table-declared boot occupancy this layer seeds
 * its own tracking from, exposed so `sim/rules/index.ts` can re-export it for
 * `sim/loop/index.ts`'s own initial `GameState.machine.deviceSlots` (task 6)
 * -- a TABLE-derived value, not a physics read, so the boot seed no longer
 * needs `machine.deviceSlots` (DW-70: the boot seed is construction, not the
 * per-tick overwrite that IS the violation, but task 6 removes even that one
 * physics read). A fresh object on every call -- never shared, mutable
 * state with a `createDevicesLayer()` instance's own internal `occupancy`.
 */
export function bootDeviceSlots(): Readonly<Record<BallDeviceName, readonly boolean[]>> {
	return buildInitialOccupancy();
}

/** Reverse `switch -> lane` lookup from `TABLE.laneWiring`, so a lane switch edge resolves its `lane` payload from `TABLE`, never a literal. */
function buildLaneBySwitch(): ReadonlyMap<SwitchName, LaneName> {
	const map = new Map<SwitchName, LaneName>();
	for (const [lane, wiring] of Object.entries(TABLE.laneWiring) as Array<[LaneName, { switch: SwitchName }]>) {
		map.set(wiring.switch, lane);
	}
	return map;
}

/** Reverse `switch -> flipper side` lookup from `TABLE.flipperButtonWiring`, so a third entry in the registry would emit its own `lane_change_pressed` rather than being silently ignored by a hand-unrolled `left`/`right` branch (DW-149: the subject set is derived, never a second hand-typed list -- the same idiom `buildLaneBySwitch()` above already uses). */
function buildFlipperSideBySwitch(): ReadonlyMap<SwitchName, FlipperSide> {
	const map = new Map<SwitchName, FlipperSide>();
	for (const [side, wiring] of Object.entries(TABLE.flipperButtonWiring) as Array<[FlipperSide, { switch: SwitchName }]>) {
		map.set(wiring.switch, side);
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

/**
 * Story 2.7 (AD-6, AD-19, DW-149): every `TABLE.switches` key that is a
 * genuine PLAYFIELD switch, derived by SUBTRACTION from `TABLE` -- never a
 * hand-typed list. Excludes the four button switches (`settleClass:
 * 'button'`), the two cabinet-mechanism switches (`s_tilt_bob`/`s_slam_tilt`,
 * `settleClass` `'tilt_bob'`/`'slam'`), every parking device's own slot
 * switches (`bd_trough`'s four, `bd_lock`'s three -- `TABLE.ballDevices[*].slots`)
 * and every non-parking device's own entry switch (`bd_shooter.entry`,
 * `s_shooter_lane` -- resting in the shooter lane is not yet "on the
 * playfield"; the lane's own opening is `ball_launched`, the event this
 * whole set exists to be judged AGAINST, per AD-6's Rule text). 42 switches
 * minus 14 excluded = 28 remaining, verified at this tree by AC 8.
 */
function buildPlayfieldSwitches(): ReadonlySet<SwitchName> {
	const excluded = new Set<SwitchName>();
	for (const [name, sw] of Object.entries(TABLE.switches) as Array<[SwitchName, { settleClass: string }]>) {
		if (sw.settleClass === 'button' || sw.settleClass === 'tilt_bob' || sw.settleClass === 'slam') {
			excluded.add(name);
		}
	}
	for (const device of Object.values(TABLE.ballDevices) as Array<(typeof TABLE.ballDevices)[BallDeviceName]>) {
		if (device.kind === 'parking') {
			for (const slot of device.slots) {
				excluded.add(slot as SwitchName);
			}
		} else {
			excluded.add(device.entry as SwitchName);
		}
	}
	const playfield = new Set<SwitchName>();
	for (const name of Object.keys(TABLE.switches) as SwitchName[]) {
		if (!excluded.has(name)) {
			playfield.add(name);
		}
	}
	return playfield;
}

/**
 * Test-only export (the `HARDWARE_COILS` precedent, `ball-controller.ts:169`):
 * lets a test assert the exact membership (AC 8) without hand-duplicating
 * this derivation (DW-149). Computed once, module-level -- purely a function
 * of the frozen `TABLE`, so every `createDevicesLayer()` instance shares the
 * identical set, exactly as `HARDWARE_COILS` is shared across every
 * `createBallController()` instance.
 */
export const PLAYFIELD_SWITCHES: ReadonlySet<SwitchName> = buildPlayfieldSwitches();

/**
 * Story 2.11 (AD-1, AD-16, AD-19's 2026-09-08 amendment): derives `s_tilt_bob`
 * / `s_slam_tilt` STRUCTURALLY from their unique `SettleClass`, mirroring
 * `sim/physics/cabinet/index.ts`'s own file-private helper of the same name
 * and purpose -- re-authored here rather than imported, because `sim/rules`
 * never imports `sim/physics` (AD-1) and that one is file-private in any
 * case. `pnpm lint:boundaries`'s `no-device-name-literal` rule bans an
 * `s_`-prefixed literal anywhere under `src/` outside `sim/table/dragonwar.ts`,
 * so the two switch names below are NEVER spelled directly. Exactly one
 * `TABLE.switches` entry carries each of these two classes -- anything else
 * is a `TABLE` authoring defect, not a runtime condition to degrade
 * gracefully from (Boundaries: "throws as a TABLE authoring defect rather
 * than degrading").
 */
function switchNameForSettleClass(settleClass: SettleClass): SwitchName {
	const matches = (Object.entries(TABLE.switches) as Array<[SwitchName, { readonly settleClass: SettleClass }]>).filter(
		([, sw]) => sw.settleClass === settleClass,
	);
	if (matches.length !== 1) {
		throw new Error(`sim/rules/devices switchNameForSettleClass() (module load): expected exactly one TABLE.switches entry with settleClass "${settleClass}", found ${matches.length}`);
	}
	return matches[0]![0];
}

/**
 * Resolved once, module-level -- purely a function of the frozen `TABLE`, so
 * every `createDevicesLayer()` instance shares the identical two names,
 * exactly as `PLAYFIELD_SWITCHES` above is shared. Named exactly as
 * `sim/physics/cabinet/index.ts:204-205` names its own pair (camelCase, no
 * uppercase `TILT`/`WARNING` -- Boundaries, Never).
 */
const tiltBobSwitchName: SwitchName = switchNameForSettleClass('tilt_bob');
const slamTiltSwitchName: SwitchName = switchNameForSettleClass('slam');

interface PendingLockLaneClosure {
	readonly startTick: number;
}

export function createDevicesLayer(tuning: ResolvedTuning): DevicesLayer {
	const { slotBySwitch, nonParkingEntries } = buildBallDeviceIndex();
	const occupancy = buildInitialOccupancy();
	const laneBySwitch = buildLaneBySwitch();
	const flipperSideBySwitch = buildFlipperSideBySwitch();
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
			if (entryDevice) {
				// Story 2.5, task 2 (DW-70): the shooter lane's own occupancy is
				// now tracked too -- CLOSE means a served ball arrived and is
				// resting there (`device_ball_entered`), OPEN means it left, which
				// is ALSO the one event that means "plunged" (AD-6) and so keeps
				// emitting `ball_launched` alongside `device_ball_left`, exactly
				// as before this story. `device_ball_left` first: the bookkeeping
				// edge, then the semantic consequence -- the same order Stage 1's
				// parking branch below already uses (entered/left, then any
				// consequence such as `lock_lane_entered`).
				if (event.closed) {
					events.push({ type: 'device_ball_entered', device: entryDevice, slot: 0, tick: event.tick });
					occupancy[entryDevice][0] = true;
				} else {
					events.push({ type: 'device_ball_left', device: entryDevice, slot: 0, tick: event.tick });
					occupancy[entryDevice][0] = false;
					events.push({ type: 'ball_launched', tick: event.tick });
				}
				continue;
			}
			const slot = slotBySwitch.get(event.switch);
			if (!slot) {
				continue;
			}
			if (event.closed) {
				events.push({ type: 'device_ball_entered', device: slot.device, slot: slot.slot, tick: event.tick });
				occupancy[slot.device][slot.slot] = true;
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
				occupancy[slot.device][slot.slot] = false;
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
			// Story 2.11: the two cabinet-mechanism switches -- closed-edge only
			// (this loop already filters `!event.closed`), never joining
			// `playfield_switch_closed` below (they are excluded from
			// `PLAYFIELD_SWITCHES` by construction, `buildPlayfieldSwitches()`
			// above, untouched by this story).
			if (event.switch === tiltBobSwitchName) {
				events.push({ type: 'tilt_bob_closed', tick: event.tick } satisfies TiltBobClosedEvent);
			}
			if (event.switch === slamTiltSwitchName) {
				events.push({ type: 'slam_tilt_closed', tick: event.tick } satisfies SlamTiltClosedEvent);
			}
			// Story 2.7: emitted BEFORE lane_entered for the same switch --
			// every Top/inlane/outlane switch is also a playfield switch, so a
			// mode resolving on the first playfield_switch_closed (the skill
			// shot) sees this event no later than the matching lane_entered in
			// the SAME tick's batch.
			if (PLAYFIELD_SWITCHES.has(event.switch)) {
				events.push({ type: 'playfield_switch_closed', switch: event.switch, tick: event.tick } satisfies PlayfieldSwitchClosedEvent);
			}
			const lane = laneBySwitch.get(event.switch);
			if (lane) {
				events.push({ type: 'lane_entered', lane, tick: event.tick } satisfies LaneEnteredEvent);
			}
			const flipperSide = flipperSideBySwitch.get(event.switch);
			if (flipperSide) {
				events.push({ type: 'lane_change_pressed', side: flipperSide, tick: event.tick } satisfies LaneChangePressedEvent);
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
