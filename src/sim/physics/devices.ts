// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-6 -- the ball-device mechanics: parking (spawn/park/eject) and the
// non-parking shooter lane's manual/coil launch. Owns each PARKING device's
// slot occupancy; the non-parking device's own entry switch is zone-owned
// (sim/physics/switches.ts), not this file's.
//
// "Physics parks an entering ball unconditionally into the lowest empty
// slot, removes it from the simulated set and closes that slot's switch; on
// `pulse` of the eject coil it spawns the ball from the highest filled slot
// at the device's authored eject pose and speed and opens the switch."
// `bd_shooter` (non-parking): the served ball stays simulated resting on the
// plunger tip; a pulse of its launch coil gives THAT ball velocity rather
// than spawning a new one -- the shooter lane never removes a ball from the
// simulated set (AD-6's own text: "the served ball stays simulated").
//
// This file is authored, not ported (AD-16, declared in
// `test/sim-boundary.test.ts`'s `AUTHORED_FILES`).

import { Ball } from './ball/ball';
import { BallData } from './ball/ball-data';
import { BallState } from './ball/ball-state';
import { Vertex3D } from './math/vertex3d';
import type { PlayerPhysics } from './game/player-physics';
import type { BallHitTableData } from './ball/ball-hit';
import { TABLE } from '../table/dragonwar';
import { MM_PER_VU, fromPhysics, toPhysics, type Vec3 } from '../table/frames';
import type { ResolvedTuning } from '../table/tuning';
import type { BallDeviceName, CoilName, SwitchName } from '../table/names';
import type { ContactKind, ContactSurface } from '../contracts/events';
import type { LoadedDevice } from './loader';
import type { LoadedSwitchZone } from './loader';

/** vpx-js's `TableData` stand-in `BallHit` reads (same shape spike-1's harness and the loader's own tests use -- this project's established convention, not an invention). */
const BALL_HIT_TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

export interface PulseCommandLike {
	readonly coil: CoilName;
}

export interface SwitchEdgeLike {
	readonly type: 'switch';
	readonly switch: SwitchName;
	readonly closed: boolean;
	readonly tick: number;
}

/**
 * Widened (Story 1.6) from `'eject' | 'hit'`/`device?: BallDeviceName` to the
 * full `ContactKind`/`BallDeviceName | CoilName` union: `sim/physics/
 * flippers.ts` reuses this exact shape for its own `flipper_eos` events
 * (`device` naming the coil, not a ball device) rather than inventing a
 * second, near-identical contact-event type for `machine.ts` to merge.
 */
export interface ContactEventLike {
	readonly type: 'contact';
	readonly kind: ContactKind;
	readonly ballId?: number;
	readonly device?: BallDeviceName | CoilName;
	readonly pos?: Vec3;
	/** Story 1.6: `sim/physics/flippers.ts`'s own `flipper_eos` events carry `'flipper'` here, matching this story's I/O matrix ("ContactEvent { kind: 'flipper_eos', surface: 'flipper', device: <coil> }"). */
	readonly surface?: ContactSurface;
	readonly tick: number;
}

export interface EjectFailedLike {
	readonly type: 'eject_failed';
	readonly device: BallDeviceName;
	readonly tick: number;
}

export interface DeviceOverflowLike {
	readonly type: 'device_overflow';
	readonly device: BallDeviceName;
	readonly tick: number;
}

export type DeviceFailure = EjectFailedLike | DeviceOverflowLike;

export interface DeviceMechanicsResult {
	readonly switchEvents: SwitchEdgeLike[];
	readonly contactEvents: ContactEventLike[];
	readonly failures: DeviceFailure[];
}

export interface BallStepMovement {
	readonly ball: Ball;
	readonly beforeMm: Vec3;
	readonly afterMm: Vec3;
}

export interface DeviceMechanics {
	/** Every PARKING device's slot occupancy, in `TABLE.ballDevices[*].slots` fill order. Non-parking devices own no slots here -- machine.ts derives their single-element occupancy from the zone-owned entry switch. */
	readonly parkingSlots: Readonly<Record<BallDeviceName, readonly boolean[]>>;
	/** Runs BEFORE `physics.step()`: applies this tick's coil pulses. */
	applyCommands(tick: number, commands: readonly PulseCommandLike[]): DeviceMechanicsResult;
	/** Runs AFTER `physics.step()`: parks any ball whose swept segment entered a parking device's slot-zone union. */
	detectEntries(tick: number, movements: readonly BallStepMovement[]): DeviceMechanicsResult;
	/**
	 * Story 1.6, task 10(a): the non-parking eject path (`AD-6`: "the served
	 * ball stays simulated"), extracted so `sim/physics/plunger.ts`'s manual
	 * plunge SHARES it rather than duplicating it -- both give the ball
	 * already resting in `device`'s entry zone a velocity through
	 * `tableSpeedToPhysicsVelocity()`; neither spawns a ball. `applyCommands()`
	 * below calls this itself for a coil-fired autolaunch, with
	 * `tuning.autolaunchSpeedMmPerS.value`.
	 */
	launch(tick: number, device: BallDeviceName, speedMmPerS: number): DeviceMechanicsResult;
}

type BallDevice = (typeof TABLE.ballDevices)[BallDeviceName];

/** A non-parking device's own launch coil is not a named `TABLE` field in Epic 1 (only a parking device's `ejectCoil` is) -- derived instead from the first `pulse` action in its `ballSearchOrder`, a real TABLE field this device already carries for the same physical reason (that action IS how a stuck ball on this device is dislodged). */
function primaryPulseCoil(device: BallDevice): CoilName | undefined {
	if (device.kind === 'parking') {
		return device.ejectCoil;
	}
	for (const action of device.ballSearchOrder) {
		if (action.action === 'pulse') {
			return action.coil;
		}
	}
	return undefined;
}

/**
 * `toPhysics()` is an affine map (linear part + a translation by the
 * playfield height on y, per `frames.ts`'s own header); a VELOCITY has no
 * origin, so its transform is `toPhysics()`'s LINEAR part only. Differencing
 * two `toPhysics()` calls one (table mm/s-as-position) unit apart cancels the
 * translation exactly, leaving `(vx, -vy, vz) / MM_PER_VU` -- `frames.ts`'s
 * own documented velocity-crossing formula -- while still routing the
 * crossing through `toPhysics()` itself (AD-10: "every physics<->table
 * crossing goes through toPhysics()/fromPhysics()/toPhysicsPlane()") rather
 * than re-deriving the flip locally. The remaining `/100` is physics's own
 * VP TIME-UNIT convention (1 T = 10 ms, `constants.ts`'s documented unit
 * block) -- a time-domain scaling, not a table/physics FRAME conversion, so
 * it is not part of `frames.ts`'s contract.
 */
function tableSpeedToPhysicsVelocity(dir: Vec3, speedMmPerS: number): Vertex3D {
	const origin = toPhysics({ x: 0, y: 0, z: 0 });
	const tip = toPhysics({ x: dir.x * speedMmPerS, y: dir.y * speedMmPerS, z: dir.z * speedMmPerS });
	const vuPerSecond: Vec3 = { x: tip.x - origin.x, y: tip.y - origin.y, z: tip.z - origin.z };
	return new Vertex3D(vuPerSecond.x / 100, vuPerSecond.y / 100, vuPerSecond.z / 100);
}

function ballRadiusVu(): number {
	return TABLE.reference.ballMm / 2 / MM_PER_VU;
}

/**
 * Builds the AD-6 device mechanics. Asserts each PARKING device's initial
 * closed-slot count (`TABLE.ballDevices[*].slots.length`, since every slot
 * starts closed -- "4 balls, asserted at boot") equals its `capacity`,
 * throwing a descriptive load-time error naming the device, the count and
 * the capacity otherwise.
 */
export function createDeviceMechanics(options: {
	readonly physics: PlayerPhysics;
	readonly devices: readonly LoadedDevice[];
	readonly switchZones: readonly LoadedSwitchZone[];
	readonly tuning: ResolvedTuning;
	readonly nextBallId: () => number;
}): DeviceMechanics {
	const { physics, devices, switchZones, tuning, nextBallId } = options;

	const eject = new Map<BallDeviceName, Vec3 & { dir: Vec3 }>();
	for (const device of devices) {
		eject.set(device.name, { ...device.ejectPose.posMm, dir: device.ejectPose.dir });
	}

	const parkingSlots: Partial<Record<BallDeviceName, boolean[]>> = {};
	const slotZonesByDevice = new Map<BallDeviceName, LoadedSwitchZone[]>();
	for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, BallDevice]>) {
		if (device.kind !== 'parking') {
			continue;
		}
		if (device.slots.length !== device.capacity) {
			throw new Error(
				`createDeviceMechanics(): device "${name}" has ${device.slots.length} slot(s) declared but a capacity of ` +
				`${device.capacity} -- these must match (AD-6: "4 balls, asserted at boot").`,
			);
		}
		parkingSlots[name] = new Array<boolean>(device.slots.length).fill(true);
		slotZonesByDevice.set(
			name,
			switchZones.filter((zone) => (device.slots as readonly string[]).includes(zone.switch)),
		);
	}

	function spawnBall(posMm: Vec3, velocity: Vertex3D): Ball {
		const posPhysics = toPhysics(posMm);
		const data = new BallData(ballRadiusVu(), 1, 1);
		// Review finding 2026-08-28: this was the template literal `` `ejected` ``
		// with nothing interpolated, so EVERY ball carried the identical name --
		// and PlayerPhysics.removeBall()'s three "not registered" diagnostics all
		// report ball.getName(), which named an indistinguishable ball.
		const id = nextBallId();
		const state = new BallState(`ejected-${id}`, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(id, data, state, velocity, BALL_HIT_TABLE_DATA);
		physics.addBall(ball);
		return ball;
	}

	function applyCommands(tick: number, commands: readonly PulseCommandLike[]): DeviceMechanicsResult {
		const switchEvents: SwitchEdgeLike[] = [];
		const contactEvents: ContactEventLike[] = [];
		const failures: DeviceFailure[] = [];

		for (const command of commands) {
			for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, BallDevice]>) {
				if (primaryPulseCoil(device) !== command.coil) {
					continue;
				}

				if (device.kind === 'parking') {
					const pose = eject.get(name);
					const slots = parkingSlots[name]!;
					const highestFilled = slots.lastIndexOf(true);
					if (highestFilled === -1) {
						failures.push({ type: 'eject_failed', device: name, tick });
						continue;
					}
					if (!pose) {
						failures.push({ type: 'eject_failed', device: name, tick });
						continue;
					}
					slots[highestFilled] = false;
					const slotSwitch = device.slots[highestFilled] as SwitchName;
					switchEvents.push({ type: 'switch', switch: slotSwitch, closed: false, tick });
					const velocity = tableSpeedToPhysicsVelocity(pose.dir, tuning.troughEjectSpeedMmPerS.value);
					const ball = spawnBall(pose, velocity);
					// DW-63: pos is a plain {x,y,z}, never `pose` itself -- `pose`'s
					// own type is `Vec3 & { dir: Vec3 }`, so pushing it directly would
					// structurally carry an extra `dir` property `ContactEventLike.pos`
					// never intended, the same normalisation `launch()` below gives
					// the non-parking branch.
					contactEvents.push({ type: 'contact', kind: 'eject', ballId: ball.id, device: name, pos: { x: pose.x, y: pose.y, z: pose.z }, tick });
					continue;
				}

				// Non-parking: shares launch() below with the manual plunge
				// (sim/physics/plunger.ts) -- AD-6/AD-5, "the manual plunge and the
				// autolaunch are one code path".
				const result = launch(tick, name, tuning.autolaunchSpeedMmPerS.value);
				switchEvents.push(...result.switchEvents);
				contactEvents.push(...result.contactEvents);
				failures.push(...result.failures);
			}
		}

		return { switchEvents, contactEvents, failures };
	}

	/** See `DeviceMechanics.launch()`'s own doc comment. */
	function launch(tick: number, device: BallDeviceName, speedMmPerS: number): DeviceMechanicsResult {
		const pose = eject.get(device);
		const nonParkingDevice = TABLE.ballDevices[device] as { readonly kind: 'non-parking'; readonly entry: SwitchName };
		const entryZone = switchZones.find((zone) => zone.switch === nonParkingDevice.entry);
		const resting = entryZone
			? physics.balls.find((ball) => isBallInsideZoneNow(ball, entryZone))
			: undefined;
		if (!resting || !pose) {
			return { switchEvents: [], contactEvents: [], failures: [{ type: 'eject_failed', device, tick }] };
		}
		const velocity = tableSpeedToPhysicsVelocity(pose.dir, speedMmPerS);
		resting.hit.vel.set(velocity);
		// DW-63: the same plain {x,y,z} shape the parking branch's payload
		// carries -- the resting ball's own table-frame position at the moment
		// of the launch (no new ball spawns here, AD-6, so there is no
		// "authored eject pose" of its own to report; the ball's live position
		// is the closest equivalent).
		const posMm = fromPhysics({ x: resting.state.pos.x, y: resting.state.pos.y, z: resting.state.pos.z });
		const contactEvents: ContactEventLike[] = [{ type: 'contact', kind: 'eject', ballId: resting.id, device, pos: posMm, tick }];
		return { switchEvents: [], contactEvents, failures: [] };
	}

	function isBallInsideZoneNow(ball: Ball, zone: LoadedSwitchZone): boolean {
		const posMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
		return (
			posMm.x >= zone.minMm.x && posMm.x <= zone.maxMm.x &&
			posMm.y >= zone.minMm.y && posMm.y <= zone.maxMm.y &&
			posMm.z >= zone.minMm.z && posMm.z <= zone.maxMm.z
		);
	}

	function detectEntries(tick: number, movements: readonly BallStepMovement[]): DeviceMechanicsResult {
		const switchEvents: SwitchEdgeLike[] = [];
		const contactEvents: ContactEventLike[] = [];
		const failures: DeviceFailure[] = [];

		// Review finding 2026-08-28: devices are the OUTER loop and movements
		// the inner, with no record of which balls have already been parked.
		// With a second parking device -- AD-6 already names `bd_lock`
		// (capacity 3, slots `s_lock_1..3`) -- a swept segment intersecting two
		// devices' slot zones in one tick would park the SAME ball twice and
		// call removeBall() on it twice; the second call hits
		// PlayerPhysics.removeBall()'s "not registered" throw, which propagates
		// out of machine.step() and advance() and kills the host rAF chain.
		// One parked ball belongs to exactly one device.
		const parked = new Set<Ball>();

		for (const [name, zones] of slotZonesByDevice) {
			const slots = parkingSlots[name]!;
			const slotSwitchNames = (TABLE.ballDevices[name] as { slots: readonly string[] }).slots as readonly SwitchName[];

			for (const movement of movements) {
				if (parked.has(movement.ball)) {
					continue;
				}
				const entered = zones.some((zone) => segmentIntersectsBoxLocal(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm));
				if (!entered) {
					continue;
				}
				const lowestEmpty = slots.indexOf(false);
				if (lowestEmpty === -1) {
					failures.push({ type: 'device_overflow', device: name, tick });
					continue;
				}
				slots[lowestEmpty] = true;
				switchEvents.push({ type: 'switch', switch: slotSwitchNames[lowestEmpty], closed: true, tick });
				contactEvents.push({ type: 'contact', kind: 'hit', ballId: movement.ball.id, device: name, pos: movement.afterMm, tick });
				parked.add(movement.ball);
				physics.removeBall(movement.ball);
			}
		}

		return { switchEvents, contactEvents, failures };
	}

	return {
		get parkingSlots() {
			return parkingSlots as Readonly<Record<BallDeviceName, readonly boolean[]>>;
		},
		applyCommands,
		detectEntries,
		launch,
	};
}

/** Local mirror of `switches.ts`'s slab-method segment/box test -- devices.ts needs the identical semantics for its own slot-zone entry test, and importing a physics-internal helper from a sibling module for one function would be a heavier coupling than re-deriving it (both are small, both are pure geometry, and both are exercised by their own module's tests). */
function segmentIntersectsBoxLocal(before: Vec3, after: Vec3, minMm: Vec3, maxMm: Vec3): boolean {
	let tMin = 0;
	let tMax = 1;
	for (const axis of ['x', 'y', 'z'] as const) {
		const p0 = before[axis];
		const d = after[axis] - p0;
		const lo = minMm[axis];
		const hi = maxMm[axis];
		if (Math.abs(d) < 1e-9) {
			if (p0 < lo || p0 > hi) {
				return false;
			}
			continue;
		}
		let t1 = (lo - p0) / d;
		let t2 = (hi - p0) / d;
		if (t1 > t2) {
			[t1, t2] = [t2, t1];
		}
		tMin = Math.max(tMin, t1);
		tMax = Math.min(tMax, t2);
		if (tMin > tMax) {
			return false;
		}
	}
	return true;
}
