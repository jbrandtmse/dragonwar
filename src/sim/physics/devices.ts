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
// `test/port-provenance.test.ts`'s `AUTHORED_FILES`).

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
import { segmentIntersectsBox } from './geometry';

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
 * Story 2.1d Phase 5 (review finding): a conservative tick-based backstop on
 * the per-ball ejection exemption (`justEjected`, below). `buildClearBeyond()`'s
 * one-directional threshold is the ONLY thing that normally lifts the
 * exemption, and it only fires once a ball's tick-start position has
 * genuinely crossed past the device's own slot-zone union along the eject
 * axis. Nothing bounds how long a real ejected ball may take to complete
 * that crossing -- a deflection, a stall, or a reversal before it ever
 * crosses leaves the ball exempt from being re-parked by that device for
 * the rest of the game, an AD-6 "physics parks an entering ball
 * unconditionally into the lowest empty slot" violation for that one ball,
 * permanently. This constant is the backstop: `detectEntries()` clears the
 * exemption once a ball has sat in it for longer than this many ticks,
 * regardless of `clearBeyond()`. Sized against this story's own measured
 * normal-case clear time (the Spec Change Log's end-to-end trace: eject at
 * tick 344, clear/re-capture-eligible by tick 479 -- a ~135-tick normal
 * clear) -- 600 ticks is a generous multiple of that, large enough to never
 * fire in the normal case, small enough to guarantee AD-6's "unconditional"
 * parking eventually resumes for a genuinely stuck ball.
 */
export const EJECT_EXEMPTION_TIMEOUT_TICKS = 600;

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

	/**
	 * Story 2.1d (AD-6, "one ball per pulse"): per PARKING device, the balls
	 * THAT DEVICE most recently ejected and has not yet travelled PAST its
	 * own slot-zone union (see `buildClearBeyond()`, below, for what "past"
	 * means and why it is not simply "the swept segment currently misses
	 * every zone"), each mapped to the tick it was ejected on (Phase 5
	 * review finding: `EJECT_EXEMPTION_TIMEOUT_TICKS`, above, is the
	 * backstop that reads this). `detectEntries()` below never parks a ball
	 * while it is a key of its own ejecting device's map here -- scoped
	 * narrowly to "the ball this device just ejected, while it is still
	 * leaving" (the Block If's own wording), never a blanket park
	 * suppression: any OTHER ball, and this same ball once it is confirmed
	 * clear (or once it enters a DIFFERENT device's zone, or once the
	 * timeout backstop above fires), is still parked unconditionally,
	 * exactly as AD-6 requires. Diagnosed cause (this story's Intent):
	 * `bd_lock`'s own authored eject pose sits inside `sw_lock_2`'s zone as
	 * originally authored, so the ejected ball is captured on the very tick
	 * it spawns without this guard.
	 *
	 * Phase 5 review finding, the adjacent lower-severity leak: a `Ball`
	 * removed from `physics` by any path OTHER than `clearBeyond()`/the
	 * timeout backstop clearing its own entry here (**corrected at code
	 * review 2026-09-03: this parenthetical used to claim "there is no such
	 * path today", on the grounds that `detectEntries()` below always clears
	 * the entry it parks. It does not. The maps are PER DEVICE, and a ball
	 * `bd_lock` ejected can be parked by `bd_trough` -- ordinary play, the
	 * ejected ball drains and is served again -- which calls
	 * `physics.removeBall()` with `bd_lock`'s own entry for that ball
	 * untouched. So the stale entry is reachable today; only its
	 * CONSEQUENCES, argued below, are unchanged.**)
	 * would leave a stale entry keyed by a ball no `movements` array can
	 * ever name again, since a removed ball is never advanced or re-passed
	 * to `detectEntries()`. `PlayerPhysics` (`sim/physics/game/
	 * player-physics.ts`) exposes no removal hook/callback reachable from
	 * here to prune against, only the throwing `removeBall()` itself, so
	 * this is deliberately left rather than instrumented: harmless (the
	 * entry can never again suppress a real park, since its ball can never
	 * again appear in `movements`) but technically unbounded per-entry
	 * memory, bounded in practice by how many balls a game ever ejects.
	 */
	const justEjected = new Map<BallDeviceName, Map<Ball, number>>();
	for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, BallDevice]>) {
		if (device.kind === 'parking') {
			justEjected.set(name, new Map<Ball, number>());
		}
	}

	const parkingSlots: Partial<Record<BallDeviceName, boolean[]>> = {};
	const slotZonesByDevice = new Map<BallDeviceName, LoadedSwitchZone[]>();
	// Story 2.1d (AD-6): "the machine carries 4 balls, asserted at boot" --
	// checked BY NAME below, across every parking device's declared boot
	// occupancy, rather than assumed from a comment. Accumulated in the same
	// loop that derives each device's own boot slots, since that is the one
	// place both `startsFullAtBoot` and `capacity` are already in scope
	// together.
	let totalBootFull = 0;
	const bootFullByDevice: Partial<Record<BallDeviceName, number>> = {};
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
		// Story 2.1d (AD-6): boot occupancy is a DECLARED property of the
		// device (dragonwar.ts's `startsFullAtBoot`), not the unconditional
		// `fill(true)` this line used to carry -- that booted every parking
		// device full regardless of what it actually holds at rest, which is
		// how `bd_lock` (staged empty at boot) used to boot SEVEN balls
		// against AD-6's "the machine carries 4 balls, asserted at boot".
		const bootSlots = new Array<boolean>(device.slots.length).fill(device.startsFullAtBoot);
		// Construction-time consistency check, distinct from the
		// slots/capacity throw above: the boot occupancy this device declares
		// must resolve to either fully-empty (0 filled slots) or fully-full
		// (exactly `capacity` filled slots) -- there is no partial boot
		// occupancy in this registry's vocabulary. `fill()` above can never
		// actually violate this by construction, but a later refactor of how
		// boot occupancy is derived (a per-slot array, say) could silently
		// drift from `capacity` without this guard.
		const bootFullCount = bootSlots.filter(Boolean).length;
		const expectedBootFullCount = device.startsFullAtBoot ? device.capacity : 0;
		if (bootFullCount !== expectedBootFullCount) {
			throw new Error(
				`createDeviceMechanics(): device "${name}" declares startsFullAtBoot=${String(device.startsFullAtBoot)} but its derived boot ` +
				`occupancy fills ${bootFullCount} of ${device.capacity} slot(s), expected ${expectedBootFullCount} -- boot occupancy must be ` +
				`either fully empty or fully full, consistent with the device's own capacity.`,
			);
		}
		parkingSlots[name] = bootSlots;
		totalBootFull += bootFullCount;
		bootFullByDevice[name] = bootFullCount;
		slotZonesByDevice.set(
			name,
			switchZones.filter((zone) => (device.slots as readonly string[]).includes(zone.switch)),
		);
	}
	if (totalBootFull !== 4) {
		const perDevice = (Object.entries(bootFullByDevice) as Array<[BallDeviceName, number]>)
			.map(([deviceName, count]) => `${deviceName}=${count}`)
			.join(', ');
		throw new Error(
			`createDeviceMechanics(): AD-6 requires exactly 4 balls in the machine at boot, but the parking devices' declared boot ` +
			`occupancy sums to ${totalBootFull} (${perDevice}).`,
		);
	}

	/**
	 * Story 2.1d (AD-6, "one ball per pulse"): per PARKING device, whether a
	 * position is genuinely CLEAR of that device's own slot-zone union, in
	 * the direction the device ejects. Not "the swept segment does not
	 * currently intersect a zone" -- a device's zones can sit apart from its
	 * own eject pose (`bd_lock`'s three slots now sit well below the Mouth's
	 * pose, Story 2.1d task 8's re-siting), so the ejected ball reads
	 * "outside every zone" for many ticks of open-field travel BEFORE it
	 * ever reaches the zone band it must still cross -- clearing the
	 * exemption on that first false reading would un-exempt the ball well
	 * before it has actually passed the slots, re-arming exactly the capture
	 * this mechanism exists to prevent. Instead: projects onto the eject
	 * direction's DOMINANT axis and compares against the union of every
	 * zone's own boundary on the far side, in the direction of travel -- a
	 * ONE-DIRECTIONAL threshold a ball can only cross once, immune to the
	 * gaps this file's own switch-zone block leaves between adjacent slots.
	 */
	function buildClearBeyond(dir: Vec3, zones: readonly LoadedSwitchZone[]): ((posMm: Vec3) => boolean) | undefined {
		if (zones.length === 0) {
			return undefined;
		}
		const axis: 'x' | 'y' | 'z' = Math.abs(dir.x) >= Math.abs(dir.y) && Math.abs(dir.x) >= Math.abs(dir.z)
			? 'x'
			: Math.abs(dir.z) >= Math.abs(dir.y)
				? 'z'
				: 'y';
		const travelsNegative = dir[axis] < 0;
		let boundary = travelsNegative ? Infinity : -Infinity;
		for (const zone of zones) {
			boundary = travelsNegative ? Math.min(boundary, zone.minMm[axis]) : Math.max(boundary, zone.maxMm[axis]);
		}
		return (posMm) => (travelsNegative ? posMm[axis] < boundary : posMm[axis] > boundary);
	}

	const clearBeyondByDevice = new Map<BallDeviceName, (posMm: Vec3) => boolean>();
	for (const [name, zones] of slotZonesByDevice) {
		const pose = eject.get(name);
		const clearBeyond = pose ? buildClearBeyond(pose.dir, zones) : undefined;
		if (clearBeyond) {
			clearBeyondByDevice.set(name, clearBeyond);
		}
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
					// Story 2.1d (task 6, AD-15): a device's own declared
					// `ejectSpeedMmPerS` overrides the shared trough speed --
					// dragonwar.ts's own doc comment on bd_lock's entry has the
					// measurement. Structural (every parking device carries the
					// key, `null` where there is no override -- never
					// `undefined`, which `tableHash()`'s own `canonicalize()`
					// rejects anywhere in `TABLE`), never a device-name literal.
					const speedMmPerS = device.ejectSpeedMmPerS?.value ?? tuning.troughEjectSpeedMmPerS.value;
					const velocity = tableSpeedToPhysicsVelocity(pose.dir, speedMmPerS);
					const ball = spawnBall(pose, velocity);
					// AD-6, "one ball per pulse": this device must not immediately
					// re-park the ball it just ejected (see justEjected's own doc
					// comment above) -- registered before this tick's detectEntries()
					// runs, so the very first tick (the spawn tick itself, whose
					// swept segment starts AT the eject pose) is covered too. Recorded
					// against THIS tick so the timeout backstop above has a start
					// point to measure from.
					justEjected.get(name)?.set(ball, tick);
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
			const ejectedFromThisDevice = justEjected.get(name);
			const clearBeyond = clearBeyondByDevice.get(name);

			for (const movement of movements) {
				if (parked.has(movement.ball)) {
					continue;
				}
				if (ejectedFromThisDevice?.has(movement.ball)) {
					// Checked against `beforeMm` -- this tick's STARTING position --
					// not `afterMm`: if the ball had ALREADY travelled past every
					// zone by the time this tick began, the exemption is understood
					// to have lifted before this tick's own crossing, so that
					// crossing (a genuine, later re-entry -- e.g. the ball drains
					// back around into this same device through ordinary play) is
					// evaluated as an ORDINARY entry below, in the SAME tick, rather
					// than deferred to a tick that may never come. AD-6, "one ball
					// per pulse": the ball this device ejected stops needing
					// protection once it has genuinely left; a real re-approach from
					// the far side is not that ball "still leaving".
					const ejectedAtTick = ejectedFromThisDevice.get(movement.ball)!;
					// Phase 5 review finding: the timeout backstop. A ball that has
					// never satisfied clearBeyond() (deflected, stalled, reversed --
					// see EJECT_EXEMPTION_TIMEOUT_TICKS's own doc comment) would
					// otherwise stay exempt from this device forever; once it has sat
					// in the exemption longer than the backstop allows, the exemption
					// is lifted unconditionally, exactly as if it had cleared, so
					// AD-6's "unconditional" parking resumes for it.
					if (clearBeyond?.(movement.beforeMm) || tick - ejectedAtTick > EJECT_EXEMPTION_TIMEOUT_TICKS) {
						ejectedFromThisDevice.delete(movement.ball);
					} else {
						// Still short of both the clearBeyond threshold and the timeout
						// backstop as of this tick's own start -- never re-park the
						// ball THIS device just ejected while it is still leaving.
						continue;
					}
				}
				const entered = zones.some((zone) => segmentIntersectsBox(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm));
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

