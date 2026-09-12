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
	/**
	 * Story 2.12 (AD-6): ball search's final stage. Physics' one licence to
	 * despawn a ball -- removes every ball whose centre lies outside every
	 * non-parking device's own entry zone (this table has one, `bd_shooter`'s
	 * `s_shooter_lane`), returning the count removed. A ball already parked
	 * inside a PARKING device is never a candidate at all: parking already
	 * removed it from `physics.balls` the moment it entered, so this never
	 * sees it. Runs pre-step (`machine.ts`'s `PRE_STEP_HARDWARE_RULES`),
	 * before `applyCommands()` and before that tick's `before` position map,
	 * so a ball a same-tick serve spawns is never despawned by the very
	 * recover that landed alongside it (AD-6, AC 8).
	 */
	recover(tick: number): number;
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
 *
 * Exported (Story 2.2): `sim/physics/pops.ts` reuses this SAME function for
 * the pop bumper's own radial kick (a direction -- the ball's position minus
 * `col_pop_N`'s centroid, normalised -- and a speed,
 * `tuning.hardware.popKickMmPerS`) rather than re-deriving the identical
 * mm/s -> VU/T arithmetic a second time.
 */
export function tableSpeedToPhysicsVelocity(dir: Vec3, speedMmPerS: number): Vertex3D {
	const origin = toPhysics({ x: 0, y: 0, z: 0 });
	const tip = toPhysics({ x: dir.x * speedMmPerS, y: dir.y * speedMmPerS, z: dir.z * speedMmPerS });
	const vuPerSecond: Vec3 = { x: tip.x - origin.x, y: tip.y - origin.y, z: tip.z - origin.z };
	return new Vertex3D(vuPerSecond.x / 100, vuPerSecond.y / 100, vuPerSecond.z / 100);
}

function ballRadiusVu(): number {
	return TABLE.reference.ballMm / 2 / MM_PER_VU;
}

/**
 * Story 2.3, DW-155 (the epic's own second finding): the per-device boot
 * derivation, extracted so it is directly unit-testable. `createDeviceMechanics()`
 * below accumulates every parking device's derived boot-full count into
 * `totalBootFull` and throws by name if the sum is not 4 (AD-6) BEFORE
 * `deviceSlots` is ever read -- which shadows every single-field mutation of
 * `startsFullAtBoot` on `TABLE.ballDevices` (the two declared parking
 * devices' capacities, 4 and 3, admit no OTHER boolean combination that also
 * sums to 4, so no mutation of `startsFullAtBoot` alone can dodge that
 * throw and still reach the behavioural assertion at
 * `test/lock-device-behaviour.test.ts:99` -- this story's own spec records
 * the finding). Exported so that assertion can be pinned directly against
 * THIS function instead, decoupled from the whole-registry sum check.
 */
export function deriveBootSlots(slotCount: number, startsFullAtBoot: boolean): boolean[] {
	return new Array<boolean>(slotCount).fill(startsFullAtBoot);
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

	/**
	 * Story 2.1d (AD-6, "one ball per pulse"): per PARKING device, the balls
	 * THAT DEVICE most recently ejected and has not yet travelled PAST its
	 * own slot-zone union (see `buildClearBeyond()`, below, for what "past"
	 * means and why it is not simply "the swept segment currently misses
	 * every zone"), each mapped to the tick it was ejected on (Phase 5
	 * review finding: `tuning.lockEjectExemptionTimeoutTicks`
	 * (`src/sim/table/tuning.ts`, AD-15 -- rework iteration 2 moved this out
	 * of a bare tick constant here) is the backstop that reads this).
	 * `detectEntries()` below never parks a ball
	 * while it is a key of its own ejecting device's map here -- scoped
	 * narrowly to "the ball this device just ejected, while it is still
	 * leaving" (the Block If's own wording), never a blanket park
	 * suppression: any OTHER ball, and this same ball once it is confirmed
	 * clear (or once it enters a DIFFERENT device's zone, or once the
	 * timeout backstop above fires), is still parked unconditionally,
	 * exactly as AD-6 requires. Originally diagnosed cause (this story's
	 * Intent, as first authored): `bd_lock`'s own eject pose sat inside
	 * `sw_lock_2`'s zone, so the ejected ball was captured on the very tick
	 * it spawned without this guard. **[CORRECTED, rework iteration 3, MED
	 * review finding: that pose no longer exists.** Rework iteration 2's
	 * corridor-seal redesign moved `DRAGON_MOUTH_Y_MM` south of the whole
	 * Lock-lane corridor (460, versus every `sw_lock_*` zone's own y >= 544),
	 * so `buildClearBeyond()`'s one-directional threshold for `bd_lock` is
	 * satisfied by the ball's own spawn position on the very first tick this
	 * guard is ever consulted -- confirmed against the committed document by
	 * `test/lock-device-behaviour.test.ts`'s own "buildClearBeyond() is
	 * already satisfied at every parking device's committed eject pose"
	 * case. The identical arithmetic already held for `bd_trough` before this
	 * story (its own eject pose at y = 20 clears its own zones' shared
	 * boundary at y = 0 immediately). This guard is therefore currently an
	 * inert defensive backstop on BOTH parking devices' real production eject
	 * paths, not an active guard against a reachable capture -- kept rather
	 * than deleted because it remains the correct, AD-6-scoped mechanism for
	 * any FUTURE device or geometry whose eject pose again lands short of its
	 * own zone union (a stall, a deflection, a reversal, or simply a closer
	 * pose), and ripping it out would also require re-deriving AC 2's own
	 * "one ball per pulse" guarantee from scratch rather than by construction
	 * of the corridor seal alone.]
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
	/**
	 * Story 2.3, AC 6: per PARKING device, the balls currently latched as
	 * "already reported overflow" for that device -- so a ball parked at the
	 * slot band while every slot is full emits exactly ONE `device_overflow`
	 * per rejected ENTRY, not one per tick of zone contact (measured before
	 * this fix: 315 events for one ball sitting in the band for ~315 ticks).
	 * Cleared the moment the ball's own swept segment no longer intersects
	 * ANY of this device's zones (see `detectEntries()` below) -- a genuinely
	 * later re-approach is a fresh rejected entry and gets its own event,
	 * exactly the same "cleared once genuinely outside" shape `justEjected`
	 * above already uses for the eject-exemption latch, applied here to the
	 * overflow latch instead.
	 */
	const overflowReported = new Map<BallDeviceName, Set<Ball>>();
	for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, BallDevice]>) {
		if (device.kind === 'parking') {
			justEjected.set(name, new Map<Ball, number>());
			overflowReported.set(name, new Set<Ball>());
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
		const bootSlots = deriveBootSlots(device.slots.length, device.startsFullAtBoot);
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
	function buildClearBeyond(dir: Vec3, zones: readonly LoadedSwitchZone[], marginMm = 0): ((posMm: Vec3) => boolean) | undefined {
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
		// Story 2.3, AC 6: `marginMm` (0 for `justEjected`'s own use below,
		// unchanged) widens the threshold AWAY from the union, so a ball
		// resting almost exactly ON the boundary -- measured this pass, a
		// rejected ball settling at the slot band's own entrance jitters by
		// well under 1 mm either side of it -- does not toggle "cleared" on
		// sub-mm solver noise.
		const marginedBoundary = travelsNegative ? boundary - marginMm : boundary + marginMm;
		return (posMm) => (travelsNegative ? posMm[axis] < marginedBoundary : posMm[axis] > marginedBoundary);
	}

	const clearBeyondByDevice = new Map<BallDeviceName, (posMm: Vec3) => boolean>();
	// Story 2.3, AC 6: a SEPARATE, wider-margin threshold for clearing the
	// overflow latch (below) -- deliberately not the same map `justEjected`
	// reads, so that mechanism's own already-verified "clears at spawn"
	// behaviour (Phase 5 review finding, this file's own doc comments above)
	// is untouched by a margin it never needed.
	const overflowClearBeyondByDevice = new Map<BallDeviceName, (posMm: Vec3) => boolean>();
	// Millimetres. An AUTHORED constant, the same non-tunable class
	// `sim/physics/hop.ts`'s own detector constants document for themselves:
	// comfortably clear of the measured sub-1 mm settling jitter at the slot
	// band's own entrance, comfortably short of the ball's own diameter
	// (26.99 mm) so a genuine re-approach after actually leaving still
	// re-triggers promptly.
	const OVERFLOW_CLEAR_MARGIN_MM = 10;
	for (const [name, zones] of slotZonesByDevice) {
		const pose = eject.get(name);
		const clearBeyond = pose ? buildClearBeyond(pose.dir, zones) : undefined;
		if (clearBeyond) {
			clearBeyondByDevice.set(name, clearBeyond);
		}
		const overflowClearBeyond = pose ? buildClearBeyond(pose.dir, zones, OVERFLOW_CLEAR_MARGIN_MM) : undefined;
		if (overflowClearBeyond) {
			overflowClearBeyondByDevice.set(name, overflowClearBeyond);
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
			const overflowClearBeyond = overflowClearBeyondByDevice.get(name);

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
					// see tuning.lockEjectExemptionTimeoutMs's own doc comment,
					// src/sim/table/tuning.ts) would otherwise stay exempt from this
					// device forever; once it has sat in the exemption longer than
					// the backstop allows, the exemption is lifted unconditionally,
					// exactly as if it had cleared, so AD-6's "unconditional" parking
					// resumes for it.
					if (clearBeyond?.(movement.beforeMm) || tick - ejectedAtTick > tuning.lockEjectExemptionTimeoutTicks.value) {
						ejectedFromThisDevice.delete(movement.ball);
					} else {
						// Still short of both the clearBeyond threshold and the timeout
						// backstop as of this tick's own start -- never re-park the
						// ball THIS device just ejected while it is still leaving.
						continue;
					}
				}
				const entered = zones.some((zone) => segmentIntersectsBox(movement.beforeMm, movement.afterMm, zone.minMm, zone.maxMm));
				const overflowReportedForDevice = overflowReported.get(name)!;
				// Story 2.3, AC 6: the overflow latch clears once the ball has
				// genuinely retreated back across the WHOLE zone union's own
				// far (entry-side) boundary, with a margin -- the same
				// one-directional-threshold SHAPE `clearBeyond()` above uses
				// for the `justEjected` exemption, but built with its own
				// `OVERFLOW_CLEAR_MARGIN_MM` rather than sharing that map
				// directly. Two measured defects a bare "!entered" (a per-tick
				// boolean against the zone union) or a zero-margin threshold
				// each produced, in order: (1) 5 events instead of 1, from a
				// ball settling near the slot band's own entrance crossing the
				// (up to 3 mm) SEAM between adjacent slot zones --
				// `s_lock_1`/`_2`/`_3` are separate boxes, and "outside zone 1,
				// not yet inside zone 2" reads as `!entered` even though the
				// ball never left the band as a whole; (2) 2 events instead of
				// 1, from the SAME ball settling to rest close enough to the
				// union's own outer boundary that sub-1-mm solver jitter
				// crossed the zero-margin line itself. The margin absorbs
				// both: a single boundary on the union's own far edge is
				// immune to inter-zone seams by construction, and widening it
				// past the measured jitter absorbs the boundary-straddling
				// case too.
				if (overflowClearBeyond ? overflowClearBeyond(movement.afterMm) : !entered) {
					overflowReportedForDevice.delete(movement.ball);
				}
				if (!entered) {
					continue;
				}
				const lowestEmpty = slots.indexOf(false);
				if (lowestEmpty === -1) {
					// Story 2.3, AC 6: one `device_overflow` per REJECTED
					// ENTRY, not one per tick of zone contact -- measured
					// before this fix, 315 events for one ball sitting in
					// the band. Latched per ball, cleared above once the
					// ball's swept segment genuinely leaves the zone union.
					if (!overflowReportedForDevice.has(movement.ball)) {
						overflowReportedForDevice.add(movement.ball);
						failures.push({ type: 'device_overflow', device: name, tick });
					}
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

	// Story 2.12 (AD-6): every non-parking device's own entry zone -- the
	// "inside a device" test recover() below applies. `launch()`'s own
	// `isBallInsideZoneNow()` (above) is the shared point-in-box test; this is
	// just the subject SET it is applied over, derived from TABLE rather than
	// hand-listed (DW-149) -- `bd_shooter`/`s_shooter_lane` at this tree, but a
	// future second non-parking device is covered automatically.
	const nonParkingEntryZones: LoadedSwitchZone[] = [];
	for (const device of Object.values(TABLE.ballDevices) as BallDevice[]) {
		if (device.kind !== 'non-parking') {
			continue;
		}
		const zone = switchZones.find((z) => z.switch === device.entry);
		if (zone) {
			nonParkingEntryZones.push(zone);
		}
	}

	/**
	 * Story 2.13 (DW-257, AD-6 amended, author decision 2026-09-11, AC 14):
	 * `recover()` now RETURNS every ball it removes to `bd_trough`'s lowest
	 * empty slot, closing that slot, instead of only despawning it -- the
	 * same parking operation an entering ball already gets (AD-6), reusing
	 * the EXISTING park state `applyCommands()`'s own (unmodified) eject
	 * branch already reads via `slots.lastIndexOf(true)` a few lines above.
	 * Because the trough is a bottom-filled contiguous stack, the slot this
	 * parks into (`indexOf(false)`, the lowest empty) is the same slot that
	 * branch ejects from (`lastIndexOf(true)`, the highest occupied) whenever
	 * the trough is contiguous -- which it always is while AD-6's four-ball
	 * invariant holds -- so a later `c_trough_eject` pulse ejects this exact
	 * ball at the trough's authored eject pose and speed, opening that same
	 * slot, with NO change to that eject path at all. This is the whole of
	 * the sanctioned physics edit (spec Block-If): `recover()`'s own
	 * signature and its `recovered` return value are UNCHANGED -- still a
	 * plain `number`, still "how many balls were taken out of the simulated
	 * set" (Story 2.12's `ball_missing { count }` and this story's
	 * stray-clear report both read it that way, unaffected by where the ball
	 * ends up).
	 *
	 * KNOWN GAP, code review second pass (Story 2.13) -- do not read the
	 * paragraph below as settled. No `SwitchEvent` is emitted here for the
	 * newly-closed slot, and AD-6 as amended at this story's spec gate
	 * requires one: "`recover()` parks each ball it removes into `bd_trough`'s
	 * lowest empty slot AND CLOSES THAT SLOT'S SWITCH, exactly as a parking
	 * entry does", with "Device counts in `GameState` are the number of closed
	 * slot switches and nothing else". The real parking entry a few lines
	 * above does both halves; this does only the first. `GameState.machine
	 * .deviceSlots` is derived exclusively from `device_ball_entered`/`_left`
	 * (`rules/ball-controller.ts`'s `deriveDeviceSlots()`), and `sim/loop`
	 * deliberately never re-seeds it from physics, so the rules-side trough
	 * count UNDER-REPORTS physics by the number of parked-but-not-yet-ejected
	 * balls. It is not self-healing in the way this comment previously
	 * claimed: the next eject's OPENING edge is swallowed by
	 * `deriveDeviceSlots()`'s own identity guard (the rules slot already reads
	 * open), so the two records only coincide again by arithmetic accident.
	 * It is latent rather than live today -- no `sim/rules/**` module reads
	 * `deviceSlots.bd_trough`, only `bd_shooter` -- and AD-6 names Story 3.7
	 * as the next reader of this clause. A conformant fix is NOT a one-liner:
	 * it needs an event channel out of `recover()` (whose signature this
	 * story's Block-If freezes) and the ball controller's Start-tick drain
	 * guard widened to the stray-clear report tick, because the emitted
	 * `device_ball_entered bd_trough` would otherwise read as a parking entry
	 * at `ballsInPlay === 0` and fire a spurious `ball_ended` for the
	 * brand-new ball 1. That is an author/lead call, filed as this review's
	 * one HIGH against DW-257's own unfulfilled half.
	 */
	function recover(tick: number): number {
		let count = 0;
		const troughSlots = parkingSlots.bd_trough!;
		// A COPY: physics.removeBall() below mutates the live array this
		// closure otherwise shares with detectEntries()'s own `physics.balls`
		// reads elsewhere in the same tick.
		for (const ball of [...physics.balls]) {
			const insideADevice = nonParkingEntryZones.some((zone) => isBallInsideZoneNow(ball, zone));
			if (insideADevice) {
				continue;
			}
			physics.removeBall(ball);
			count += 1;
			// A recovered ball can never again appear in a later tick's
			// `movements` -- prune it from both per-device latches (the same
			// "removed by any path other than clearBeyond()" leak this file's
			// own `justEjected` doc comment already names and accepts for a
			// parked ball; recover() is a second such path, closed here rather
			// than left to accumulate a second stale entry class).
			for (const ejected of justEjected.values()) {
				ejected.delete(ball);
			}
			for (const reported of overflowReported.values()) {
				reported.delete(ball);
			}

			// DW-257: park it, rather than let it vanish. `lowestEmpty === -1`
			// (the trough is somehow already full) is unreachable while the
			// four-ball invariant holds (bd_trough's own capacity, 4, equals
			// the machine's total ball count) -- AD-18's phasing forbids
			// inventing an overflow eject here (nothing may pulse `c_mouth`,
			// and doing so would re-enter the very loop this fix exists to
			// close), so this asserts the invariant rather than building a
			// path for its violation. Correction, code review second pass: a
			// throw here does NOT merely skip the park. It aborts `recover()`
			// entirely -- any remaining loose ball is never processed, `count`
			// is never returned, and the exception propagates out of
			// `machine.step()` and `loop.advance()`, ending the frame with the
			// balls removed so far already gone. That is deliberate fail-fast
			// on a branch AD-6's four-ball invariant makes unreachable (a full
			// trough means all four balls are parked in it, so no ball can be
			// outside a device and this loop body never runs), not a graceful
			// degradation.
			const lowestEmpty = troughSlots.indexOf(false);
			if (lowestEmpty === -1) {
				throw new Error(
					'recover(): bd_trough has no empty slot to park a recovered ball into at tick ' +
						String(tick) +
						' -- the four-ball invariant (AD-6) has been violated',
				);
			}
			troughSlots[lowestEmpty] = true;
		}
		return count;
	}

	return {
		get parkingSlots() {
			return parkingSlots as Readonly<Record<BallDeviceName, readonly boolean[]>>;
		},
		applyCommands,
		detectEntries,
		recover,
		launch,
	};
}

