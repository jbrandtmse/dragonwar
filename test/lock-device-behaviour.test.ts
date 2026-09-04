// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1d's own I/O matrix, device rows this story adds and no prior
// story's suite covers: boot occupancy read from a DECLARED property
// (`startsFullAtBoot`) rather than assumed; one-ball-per-pulse across a
// pulse and the following 200 ticks, asserted on the switch EDGES as well
// as the final slot count (a re-park inside the settle window would surface
// as a slot switch closing again, not just as a wrong count); `eject_failed`
// on a pulse against an empty Lock; and the gap the Code Map names --
// `test/device-eject-pose.test.ts` only covers devices declaring
// `servesInto`, which `bd_lock` deliberately does not, so no existing test
// compares a parking device's own eject pose against its own slot zones.
//
// createMachine(readCollisionDoc(), resolveTuning()) throughout -- the real
// pipeline, at the tier the I/O matrix's own rows name.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createMachine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { createDeviceMechanics } from '../src/sim/physics/devices';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { toPhysics, fromPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { segmentIntersectsBox } from '../src/sim/physics/geometry';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import { readCollisionDoc, switchZoneMm, nodeBboxMm } from './util/collision-doc';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';
import type { BallDeviceName, SwitchName } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Same stand-in `vpx-js` `TableData` read `devices.ts`'s own unit-level tests use (`test/machine-serve-drain.test.ts`) -- this project's established convention for hand-crafted `Ball`s, not an invention. */
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

/** Builds `createDeviceMechanics()` directly against the real committed collision document, for the two Phase 5 tests below that need to drive `applyCommands()`/`detectEntries()` at hand-crafted ticks rather than through `createMachine().step()`'s own real-physics timeline. */
function buildFreshMechanics() {
	const { physics, devices, switchZones } = loadCollision(loadDoc());
	const tuning = resolveTuning();
	let nextId = 0;
	const mechanics = createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextId++ });
	return { physics, mechanics };
}

/** The world-mm centre of a named `sw_` switch zone, from the real committed document -- never a hardcoded literal, so a future geometry re-export that moves the Lock's slot band moves this too. */
function zoneCentreMm(switchZoneName: string) {
	const zone = switchZoneMm(switchZoneName);
	return {
		x: (zone.minMm.x + zone.maxMm.x) / 2,
		y: (zone.minMm.y + zone.maxMm.y) / 2,
		z: (zone.minMm.z + zone.maxMm.z) / 2,
	};
}

/** bd_lock's own three slot-zone names, at module scope so both the exemption-timeout test and the enclosure tests derive their bounds from the SAME committed zones rather than from literals. */
const LOCK_ZONE_NAMES_FOR_CLEAR_BEYOND = ['sw_lock_1', 'sw_lock_2', 'sw_lock_3'] as const;

/** AD-15 (rework iteration 2): the backstop is now `tuning.lockEjectExemptionTimeoutMs`, not a bare exported tick constant -- derived from the SAME `resolveTuning()` the real pipeline uses, never a re-typed literal. */
const EJECT_EXEMPTION_TIMEOUT_TICKS = resolveTuning().lockEjectExemptionTimeoutTicks.value;

/** Serves a fresh ball via c_trough_eject (the same 320-tick settle every driveShot()-style harness in this suite uses) and returns the machine plus the tick counter, positioned to keep driving from. */
function servedMachine() {
	const tuning = resolveTuning();
	const machine = createMachine(loadDoc(), tuning);
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject' as const, action: 'pulse' as const, tick }] : []);
	}
	return { machine, tick };
}

describe('bd_lock boot occupancy (AD-6, "the machine carries 4 balls, asserted at boot")', () => {
	it('createMachine(readCollisionDoc(), resolveTuning()).deviceSlots.bd_lock is [false, false, false], and bd_trough is [true, true, true, true]', () => {
		const tuning = resolveTuning();
		const machine = createMachine(loadDoc(), tuning);
		expect(machine.deviceSlots.bd_lock).toEqual([false, false, false]);
		expect(machine.deviceSlots.bd_trough).toEqual([true, true, true, true]);
	});

	it('boot occupancy is read from TABLE.ballDevices[*].startsFullAtBoot, a declared property -- not a hardcoded fill(true)', () => {
		// Structural, not a name literal: every parking device's own declared
		// flag predicts its own boot slot array exactly.
		const tuning = resolveTuning();
		const machine = createMachine(loadDoc(), tuning);
		for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
			if (device.kind !== 'parking') {
				continue;
			}
			const expected = new Array(device.capacity).fill(device.startsFullAtBoot);
			expect(machine.deviceSlots[name], `${name}: startsFullAtBoot=${String(device.startsFullAtBoot)}`).toEqual(expected);
		}
	});
});

// Story 2.1d Phase 5 (review finding), task 23: `createDeviceMechanics()`'s
// two AD-6 boot-invariant construction-time throws (the per-device
// `startsFullAtBoot`-vs-`capacity` consistency throw around
// src/sim/physics/devices.ts:233-239, and the `totalBootFull !== 4` throw
// around :248-256) had zero test coverage that ever fired them -- AC 1's own
// mutation (bd_lock.startsFullAtBoot flipped to true) was applied by hand,
// observed red, and reverted per this spec's own "Mutation coverage, stated
// honestly", but never committed as a standing test. Same isolated-module-
// graph mocking pattern as test/machine-serve-drain.test.ts:92-124
// (vi.resetModules() + vi.doMock('../src/sim/table/dragonwar', ...)),
// never touching the statically-imported TABLE the rest of this
// file/suite uses.
describe("createDeviceMechanics() AD-6 boot-invariant construction-time throws (Phase 5 review finding: previously demonstrated by hand only, now a standing regression test)", () => {
	it('throws AD-6\'s "requires exactly 4 balls" naming the per-device breakdown when bd_lock.startsFullAtBoot is mocked to true (mirrors AC 1\'s own recorded mutation: bd_trough=4, bd_lock=3, total 7)', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/table/dragonwar', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/table/dragonwar')>();
			return {
				...actual,
				TABLE: {
					...actual.TABLE,
					ballDevices: {
						...actual.TABLE.ballDevices,
						bd_lock: { ...actual.TABLE.ballDevices.bd_lock, startsFullAtBoot: true },
					},
				},
			};
		});

		try {
			const { createDeviceMechanics: isolatedCreateDeviceMechanics } = await import('../src/sim/physics/devices');
			const { loadCollision: isolatedLoadCollision } = await import('../src/sim/physics/loader');
			const { resolveTuning: isolatedResolveTuning } = await import('../src/sim/table/tuning');

			const { physics, devices, switchZones } = isolatedLoadCollision(loadDoc());
			const tuning = isolatedResolveTuning();
			let nextId = 0;

			// bd_lock's OWN per-device consistency check (:233-239) still
			// passes here -- filling all 3 of its own slots is internally
			// consistent with its own declared capacity of 3 -- so this
			// mutation exercises only the SUM check (:248-256), matching AC
			// 1's own recorded observation exactly. See this describe
			// block's own header comment for why the sibling per-device
			// throw is not independently exercised: mocking any single
			// TABLE.ballDevices field cannot desync `bootFullCount` from
			// `expectedBootFullCount` without also tripping the earlier
			// slots-vs-capacity throw, since both are derived from the same
			// slots.length === capacity precondition that throw already
			// guarantees -- only a contorted mock of the internal
			// derivation itself (not a registry field) could reach it, and
			// the comment at :223-230 already records that this is a
			// forward-looking guard against a future refactor, not a
			// reachable-today branch.
			expect(() =>
				isolatedCreateDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextId++ }),
			).toThrowError(/AD-6 requires exactly 4 balls.*sums to 7.*bd_trough=4.*bd_lock=3/s);
		} finally {
			vi.doUnmock('../src/sim/table/dragonwar');
			vi.resetModules();
		}
	});
});

// Story 2.1d Phase 5 (review finding), task 22: the justEjected/
// buildClearBeyond() exemption that stops bd_lock from re-parking the ball
// it just ejected had no upper bound -- if a real ejected ball never
// crosses clearBeyond()'s own one-directional threshold (a stall, a
// deflection, a reversal), it stayed exempt from bd_lock forever, an AD-6
// "physics parks an entering ball unconditionally" violation for that one
// ball. This drives createDeviceMechanics() directly (not through
// createMachine().step()'s own real-physics timeline) so the ticks the
// exemption is held across are exact and deterministic rather than
// depending on how fast gravity happens to carry a held ball.
describe('bd_lock: the just-ejected exemption times out (Phase 5 review finding -- AD-6 "unconditional" parking must eventually resume for a ball that never clears)', () => {
	it('a ball ejected via the real pulse path, held inside bd_lock\'s own zone-union band without ever crossing clearBeyond(), stays exempt through the timeout window and becomes ordinarily parkable again once the timeout is exceeded', () => {
		const { physics, mechanics } = buildFreshMechanics();

		// Seed one ball into bd_lock via a hand-crafted movement into
		// sw_lock_1's own zone -- the same detectEntries()-direct pattern
		// test/machine-serve-drain.test.ts's own "two ejected balls, driven
		// back into the trough's entry zones" case uses -- so there is
		// something for the real c_mouth pulse below to eject.
		const radiusVu = TABLE.reference.ballMm / 2 / MM_PER_VU;
		const seedCentreMm = zoneCentreMm('sw_lock_1');
		const seedPosPhysics = toPhysics(seedCentreMm);
		const seedBall = new Ball(
			9001,
			new BallData(radiusVu, 1, 1),
			new BallState('SeedLockBall', new Vertex3D(seedPosPhysics.x, seedPosPhysics.y, seedPosPhysics.z)),
			new Vertex3D(0, 0, 0),
			TABLE_DATA,
		);
		physics.addBall(seedBall);
		mechanics.detectEntries(1, [{ ball: seedBall, beforeMm: seedCentreMm, afterMm: seedCentreMm }]);
		expect(mechanics.parkingSlots.bd_lock, 'sanity: the seed ball must park before this test can eject anything').toEqual([true, false, false]);

		// Eject via the REAL pulse path (mechanics.applyCommands with the
		// real c_mouth coil) -- this is what actually populates
		// justEjected, not a manual internal-state poke.
		const ejectTick = 2;
		const ejectResult = mechanics.applyCommands(ejectTick, [{ coil: 'c_mouth' }]);
		expect(mechanics.parkingSlots.bd_lock, 'sanity: the pulse must empty the just-parked slot').toEqual([false, false, false]);
		expect(ejectResult.contactEvents, 'sanity: the pulse must produce exactly one eject ContactEvent').toHaveLength(1);
		const ejectedBallId = ejectResult.contactEvents[0]!.ballId;
		const ejectedBall = physics.balls.find((b) => b.id === ejectedBallId);
		expect(ejectedBall, 'sanity: the ejected ball must still be in the simulated set').toBeDefined();

		// Hold the ball inside sw_lock_2 -- a DIFFERENT zone from the seed
		// (proving this is bd_lock's own zone-UNION, not just the one zone
		// it was seeded into) -- at a y (588) that is NOT < 564
		// (buildClearBeyond()'s own boundary for bd_lock, the union's
		// nearest edge along its -y eject axis), so clearBeyond() reads
		// false on every check below: this ball never clears by the normal
		// mechanism, exactly the stall/deflection/reversal case task 22
		// describes.
		const heldMm = zoneCentreMm('sw_lock_2');
		// Code review 2026-09-03: this bound used to be the literal 564 --
		// buildClearBeyond()'s own boundary for bd_lock written out by hand,
		// one describe-block below the QA fix that removed exactly that kind
		// of decoupled literal. Derived from the committed zones instead, so
		// a future re-siting of the slot band moves it with them rather than
		// leaving the "sanity" guard passing for the wrong reason.
		const clearBeyondBoundaryY = Math.min(...LOCK_ZONE_NAMES_FOR_CLEAR_BEYOND.map((n) => switchZoneMm(n).minMm.y));
		expect(heldMm.y, `sanity: the held position must NOT satisfy clearBeyond() -- it must stay at or above the zone union's own low edge (${clearBeyondBoundaryY})`).toBeGreaterThanOrEqual(clearBeyondBoundaryY);

		// Mid-window: comfortably inside the exemption, nowhere near the
		// backstop -- must still be fully exempt.
		const midTick = ejectTick + Math.floor(EJECT_EXEMPTION_TIMEOUT_TICKS / 2);
		const midResult = mechanics.detectEntries(midTick, [{ ball: ejectedBall!, beforeMm: heldMm, afterMm: heldMm }]);
		expect(midResult.switchEvents, 'mid-window: the exemption must still hold -- no park yet').toEqual([]);
		expect(mechanics.parkingSlots.bd_lock, 'mid-window: bd_lock must still read all-empty').toEqual([false, false, false]);
		expect(physics.balls, 'mid-window: the ejected ball must remain simulated').toContain(ejectedBall);

		// Exactly at the backstop: the guard fires once elapsed ticks
		// EXCEED the timeout, not merely reach it -- so this tick must
		// STILL be exempt, the same fixed-point discipline settleTicks = 0
		// gets elsewhere in this codebase.
		const atThresholdTick = ejectTick + EJECT_EXEMPTION_TIMEOUT_TICKS;
		const atThresholdResult = mechanics.detectEntries(atThresholdTick, [{ ball: ejectedBall!, beforeMm: heldMm, afterMm: heldMm }]);
		expect(atThresholdResult.switchEvents, 'at exactly the timeout tick count, the exemption must still hold').toEqual([]);
		expect(mechanics.parkingSlots.bd_lock, 'at exactly the timeout tick count, bd_lock must still read all-empty').toEqual([false, false, false]);
		expect(physics.balls, 'at exactly the timeout tick count, the ejected ball must remain simulated').toContain(ejectedBall);

		// One tick past the backstop: the exemption lifts unconditionally
		// and AD-6's ordinary "physics parks an entering ball
		// unconditionally into the lowest empty slot" resumes for this
		// ball, in the SAME tick the exemption lifts (mirroring the
		// existing beforeMm-vs-afterMm same-tick re-entry design this
		// mechanism already uses for a genuine clearBeyond() crossing).
		const pastThresholdTick = atThresholdTick + 1;
		const pastResult = mechanics.detectEntries(pastThresholdTick, [{ ball: ejectedBall!, beforeMm: heldMm, afterMm: heldMm }]);
		expect(pastResult.switchEvents, 'past the timeout, the held ball must now be parked into the lowest empty slot').toEqual([
			{ type: 'switch', switch: 's_lock_1', closed: true, tick: pastThresholdTick },
		]);
		expect(mechanics.parkingSlots.bd_lock, "past the timeout, AD-6's unconditional parking must have resumed for the previously-exempt ball").toEqual([true, false, false]);
		expect(physics.balls, 'past the timeout, the re-parked ball must have left the simulated set').not.toContain(ejectedBall);
	});
});

describe('bd_lock: one ball per pulse (AD-6)', () => {
	/** Drives a ball up the Lock lane's own centreline until it parks, returning the machine and tick counter with exactly one ball locked. */
	function machineWithOneBallLocked() {
		const { machine, tick: servedTick } = servedMachine();
		let tick = servedTick;
		const ball = machine.balls[0]!;
		const startPhysics = toPhysics({ x: 170, y: 520, z: 13.495 });
		ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		const speedVuPerT = 2000 / (0.53975 * 100);
		ball.hit.vel.set(0, -speedVuPerT, 0);
		ball.hit.angularVelocity.set(0, 0, 0);
		ball.hit.angularMomentum.set(0, 0, 0);
		for (let i = 0; i < 2000; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, []);
			if (machine.deviceSlots.bd_lock.some(Boolean)) {
				return { machine, tick };
			}
		}
		throw new Error('machineWithOneBallLocked(): the driven ball never locked -- fixture broken');
	}

	it('exactly one ball leaves and stays out: the simulated set gains one ball, a slot count drops by exactly one, no s_lock_* switch re-closes, and it is still in play and outside every sw_lock_* zone 200 ticks later', () => {
		const { machine, tick: lockedTick } = machineWithOneBallLocked();
		let tick = lockedTick;
		const slotsBeforePulse = machine.deviceSlots.bd_lock.filter(Boolean).length;
		const ballCountBeforePulse = machine.balls.length;
		expect(slotsBeforePulse, 'sanity: exactly one ball must be locked before the pulse').toBe(1);

		const lockZones = readCollisionDoc().switchZones.filter((z) => z.switch === 's_lock_1' || z.switch === 's_lock_2' || z.switch === 's_lock_3');
		const lockRemakeEvents: Array<{ readonly switch: string; readonly tick: number }> = [];
		for (let i = 0; i < 200; i++) {
			tick += 1;
			const commands = i === 0 ? [{ type: 'coil' as const, coil: 'c_mouth' as const, action: 'pulse' as const, tick }] : [];
			const result = machine.step(tick, NO_FRAME, commands);
			for (const ev of result.switchEvents) {
				if (ev.closed && (ev.switch === 's_lock_1' || ev.switch === 's_lock_2' || ev.switch === 's_lock_3')) {
					lockRemakeEvents.push({ switch: ev.switch, tick: ev.tick });
				}
			}
		}

		expect(lockRemakeEvents, `no s_lock_* switch may re-close while the ejected ball departs -- observed: ${JSON.stringify(lockRemakeEvents)}`).toEqual([]);
		expect(machine.balls.length, 'the simulated set must have gained exactly one ball (0 locked -> 1 in play)').toBe(ballCountBeforePulse + 1);
		expect(machine.deviceSlots.bd_lock.filter(Boolean).length, "bd_lock's own slot count must drop by exactly one").toBe(0);

		const ball = machine.balls[0];
		expect(ball, 'the ejected ball must still be in the simulated set 200 ticks later').toBeDefined();
		const posMm = fromPhysics({ x: ball!.state.pos.x, y: ball!.state.pos.y, z: ball!.state.pos.z });
		const insideAnyLockZone = lockZones.some(
			(zone) => posMm.x >= zone.minMm.x && posMm.x <= zone.maxMm.x && posMm.y >= zone.minMm.y && posMm.y <= zone.maxMm.y && posMm.z >= zone.minMm.z && posMm.z <= zone.maxMm.z,
		);
		expect(insideAnyLockZone, `the ejected ball must be outside every sw_lock_* zone 200 ticks later -- position ${JSON.stringify(posMm)}`).toBe(false);
	});

	it("eject_failed{device: 'bd_lock'} on a pulse against an empty Lock -- no ball spawned, slots unchanged", () => {
		const { machine, tick: servedTick } = servedMachine();
		let tick = servedTick;
		expect(machine.deviceSlots.bd_lock, 'sanity: bd_lock starts empty').toEqual([false, false, false]);
		const ballCountBefore = machine.balls.length;

		tick += 1;
		const result = machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_mouth', action: 'pulse', tick }]);

		expect(result.semanticEvents).toEqual([{ type: 'eject_failed', device: 'bd_lock', tick }]);
		expect(machine.balls.length, 'no ball may be spawned').toBe(ballCountBefore);
		expect(machine.deviceSlots.bd_lock, 'slots must be unchanged').toEqual([false, false, false]);
	});
});

/**
 * A convex (or star-shaped-from-a-horizontal-scan) polygon's own x-extent at
 * a given y -- the set of x where the horizontal line y = Y crosses the
 * polygon's boundary. Code review 2026-09-03 (HIGH finding): the sibling
 * describe block below used to compare each `sw_lock_*` zone against the
 * Dragon legs' own BOUNDING BOX (`nodeBboxMm`), which cannot see a sloped
 * cap's own recession -- `col_dragon_leg_l`'s own bounding box reaches
 * x = 150 all the way to y = 620, but its TRUE solid material recedes
 * diagonally above y = 600 (`DRAGON_LEG_L_INNER_SOLID_TOP_MM`,
 * tools/make-placeholder-blend.py). That gap was exactly what rework
 * iteration 2's own regression lived in: the bounding-box check passed
 * throughout. This helper reads the body's own `footprintMm` polygon
 * directly instead, so a future recession the geometry script does not
 * account for is caught here rather than discovered by a stranded/swallowed
 * ball. Returns `undefined` if the polygon has no material at that y at all
 * (every edge crossing the horizontal line is collected; for a simple
 * closed polygon that is either zero, in which case Y is outside its
 * y-range, or exactly two -- the polygon's own left and right boundary at
 * that height).
 */
function xExtentAtY(footprintMm: ReadonlyArray<{ readonly x: number; readonly y: number }>, y: number): { min: number; max: number } | undefined {
	let lo = Infinity;
	let hi = -Infinity;
	for (let i = 0; i < footprintMm.length; i++) {
		const a = footprintMm[i]!;
		const b = footprintMm[(i + 1) % footprintMm.length]!;
		if (a.y === b.y) {
			if (a.y === y) {
				lo = Math.min(lo, a.x, b.x);
				hi = Math.max(hi, a.x, b.x);
			}
			continue;
		}
		const withinEdge = (a.y <= y && y <= b.y) || (b.y <= y && y <= a.y);
		if (!withinEdge) {
			continue;
		}
		const t = (y - a.y) / (b.y - a.y);
		const x = a.x + t * (b.x - a.x);
		lo = Math.min(lo, x);
		hi = Math.max(hi, x);
	}
	return lo === Infinity ? undefined : { min: lo, max: hi };
}

describe('bd_lock: a ball crossing the Lock lane band from open field is NOT parked (AD-6, DW-121-class swallow)', () => {
	/** The three `sw_lock_*` zone names, in one place -- both tests below iterate the same set. */
	const LOCK_ZONE_NAMES = ['sw_lock_1', 'sw_lock_2', 'sw_lock_3'] as const;

	/**
	 * Rework iteration 2 (code review 2026-09-03, HIGH finding): the static
	 * enclosure check below used to compare each zone against
	 * `nodeBboxMm('col_dragon_leg_l'/'_r')` -- a bounding box cannot see a
	 * sloped cap's own recession, and this is precisely the gap the
	 * regression lived in (`DRAGON_LEG_L_INNER_SOLID_TOP_MM`, 600 mm --
	 * above that, the left leg's own TRUE material recedes diagonally, but
	 * its bounding box still reads solid to 620). Rewritten to read each
	 * leg's own `footprintMm` polygon and evaluate its TRUE x-extent (via
	 * `xExtentAtY`, above) at the zone's own y-extremes -- the two heights
	 * where a recession is most likely to have already bitten. The
	 * corridor's own NORTH seal (`col_lock_ceiling`, this rework's own new
	 * body) is checked too: its own bottom face must sit at or above every
	 * zone's own top face, or the corridor is open above the slots exactly
	 * as it was before this rework.
	 */
	it("every sw_lock_* zone is structurally enclosed: at BOTH of its own y-extremes, col_dragon_leg_l's and col_dragon_leg_r's own TRUE footprint (not bounding box) bounds it on the west/east, and col_lock_ceiling's own bottom face bounds it from the north (AC 2's own second clause: the ZONES themselves, not one simulated crossing, must sit inside the corridor)", () => {
		const doc = readCollisionDoc();
		const legL = doc.nodes.find((n) => n.name === 'col_dragon_leg_l');
		const legR = doc.nodes.find((n) => n.name === 'col_dragon_leg_r');
		expect(legL?.footprintMm, 'col_dragon_leg_l must carry a footprintMm polygon').toBeDefined();
		expect(legR?.footprintMm, 'col_dragon_leg_r must carry a footprintMm polygon').toBeDefined();
		const ceilingBottomY = nodeBboxMm('col_lock_ceiling').min.y;
		// Build-auto review pass (2026-09-04), found by direct mutation
		// testing while correcting this spec's own ## Verification section:
		// EVERY assertion below derives its reference height from
		// col_lock_ceiling itself, so a mutation that relocates the WHOLE
		// body (rather than shrinking one edge of it) moves this test's own
		// goalposts along with it and stays green -- verified directly:
		// shifting col_lock_ceiling +1000 mm in y (well outside the 1066.8 mm
		// playfield) left both this test and the descending-drop test below
		// green, because `ceilingBottomY` simply became 1598 instead of 598
		// and `zone.maxMm.y <= ceilingBottomY` is still trivially true. This
		// bound closes that: the ceiling's own bottom face must sit CLOSE to
		// the zone it seals (LOCK_LEG_TOP_CLEARANCE_MM is authored at 6 mm;
		// 50 mm is a generous margin for future tuning, comfortably tighter
		// than the 1006 mm gap the relocation mutation produced).
		// mutation: shift col_lock_ceiling's bboxMm/footprintMm +1000 mm in y
		// in public/assets/dragonwar.collision.json -> this assertion goes
		// red naming the 1006 mm gap, where the assertion above it alone
		// stays green throughout.
		for (const name of LOCK_ZONE_NAMES) {
			const zone = switchZoneMm(name);
			expect(
				zone.maxMm.y,
				`${name}: its high y face (${zone.maxMm.y}) must be at or below col_lock_ceiling's own bottom face (${ceilingBottomY}) -- a zone reaching above the ceiling sits in open field, exactly the pre-fix swallow`,
			).toBeLessThanOrEqual(ceilingBottomY);
			expect(
				ceilingBottomY - zone.maxMm.y,
				`${name}: col_lock_ceiling's own bottom face (${ceilingBottomY}) sits ${ceilingBottomY - zone.maxMm.y} mm above this zone's own high y face (${zone.maxMm.y}) -- too far to be the authored seal (LOCK_LEG_TOP_CLEARANCE_MM is 6 mm); either the ceiling moved away from the corridor it is meant to seal, or the zone did`,
			).toBeLessThanOrEqual(50);

			for (const y of [zone.minMm.y, zone.maxMm.y]) {
				const leftExtent = xExtentAtY(legL!.footprintMm!, y);
				const rightExtent = xExtentAtY(legR!.footprintMm!, y);
				expect(leftExtent, `${name}: col_dragon_leg_l has NO material at all at y = ${y} -- its west side is entirely unbounded there`).toBeDefined();
				expect(rightExtent, `${name}: col_dragon_leg_r has NO material at all at y = ${y} -- its east side is entirely unbounded there`).toBeDefined();
				expect(
					leftExtent!.max,
					`${name}: col_dragon_leg_l's own TRUE material at y = ${y} only reaches x = ${leftExtent!.max} -- short of this zone's own west face (${zone.minMm.x}), a gap a bounding-box check cannot see`,
				).toBeGreaterThanOrEqual(zone.minMm.x);
				expect(
					rightExtent!.min,
					`${name}: col_dragon_leg_r's own TRUE material at y = ${y} only reaches x = ${rightExtent!.min} -- short of this zone's own east face (${zone.maxMm.x})`,
				).toBeLessThanOrEqual(zone.maxMm.x);
			}
		}
	});

	/**
	 * Rework iteration 2 (code review 2026-09-03, HIGH finding): the
	 * dynamic sweep below drives only EAST-TO-WEST, at the zones' own union
	 * y-midpoint -- a height that (before this rework) landed in the fully-
	 * walled band well below any recession, so neither the exposed strip
	 * the actual defect lived in NOR the descending approach (gravity's own
	 * direction, and the one the review's own reproduction used) was ever
	 * driven. This is that missing case: a ball released from open field
	 * ABOVE col_lock_ceiling's own top face, descending straight down,
	 * swept across the corridor's own x-width -- reproducing the review's
	 * own falsifier (probes at x in [150, 190], y in [640, 660, 700]
	 * descending, 15 of 15 parked before this rework's geometry fix).
	 */
	it('a ball released from open field ABOVE col_lock_ceiling, descending straight down across the corridor\'s own x-width, is NOT parked -- the corridor\'s north seal blocks entry from above, not only a sideways crossing at one fixed height', () => {
		const ceilingTopY = nodeBboxMm('col_lock_ceiling').max.y;
		const lockLaneX0 = Math.min(...LOCK_ZONE_NAMES.map((n) => switchZoneMm(n).minMm.x));
		const lockLaneX1 = Math.max(...LOCK_ZONE_NAMES.map((n) => switchZoneMm(n).maxMm.x));
		// Build-auto review pass (2026-09-04): the release height below is
		// derived from col_lock_ceiling itself, the same self-referential
		// shape the static enclosure test above was found vacuous against --
		// a wholesale relocation of the body moves the release point with
		// it, off the 1066.8 mm playfield entirely, rather than testing the
		// real corridor. Anchored here to the zones it must actually seal:
		// LOCK_LEG_TOP_CLEARANCE_MM is authored at 6 mm, so the ceiling's own
		// top face should sit within roughly the ridge's own authored rise
		// (LOCK_CEILING_SHOULDER_MM + LOCK_CEILING_RIDGE_MM = 26 mm today) of
		// its bottom face -- comfortably inside 80 mm of the zones' own high
		// y face even allowing for future tuning.
		const zoneTopY = Math.max(...LOCK_ZONE_NAMES.map((n) => switchZoneMm(n).maxMm.y));
		expect(
			ceilingTopY - zoneTopY,
			`col_lock_ceiling's own top face (${ceilingTopY}) sits ${ceilingTopY - zoneTopY} mm above the zones' own high y face (${zoneTopY}) -- too far to be releasing a ball just above the real corridor seal; the release point below would no longer test the actual defect`,
		).toBeLessThanOrEqual(80);
		const probeXs = [lockLaneX0 + 5, (lockLaneX0 + lockLaneX1) / 2, lockLaneX1 - 5];
		const releaseYs = [ceilingTopY + 10, ceilingTopY + 40];

		for (const releaseY of releaseYs) {
			for (const probeX of probeXs) {
				const { machine, tick: servedTick } = servedMachine();
				let tick = servedTick;
				const ball = machine.balls[0]!;
				const startPhysics = toPhysics({ x: probeX, y: releaseY, z: 13.495 });
				ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
				// A near-zero release speed -- gravity alone drives the descent,
				// the same "drop straight down" recipe this file's own
				// descending-release tests elsewhere in this story's suite use
				// (test/shot-routing.test.ts's own "Rework iteration 2 item (e)"
				// cases), and the review's own reproduction (speed near zero,
				// released above the corridor).
				ball.hit.vel.set(0, 0, 0);
				ball.hit.angularVelocity.set(0, 0, 0);
				ball.hit.angularMomentum.set(0, 0, 0);

				const slotsBefore = [...machine.deviceSlots.bd_lock];
				for (let i = 0; i < 2000; i++) {
					tick += 1;
					machine.step(tick, NO_FRAME, []);
					if (!machine.balls[0]) {
						break; // drained or otherwise left play -- not this test's concern, the slot assertion below is
					}
				}
				expect(
					machine.deviceSlots.bd_lock,
					`a ball released at (${probeX}, ${releaseY}) and left to descend must not park in bd_lock -- bd_lock's own slots must stay unchanged`,
				).toEqual(slotsBefore);
			}
		}
	});

	it("driving a ball sideways across x [150, 190] at a height DERIVED from the committed sw_lock_* zones' own y-span does not park it -- the lane's own walls (the legs, unmoved) block the crossing structurally", () => {
		// Unlike the static structural check above, this drives the REAL
		// physics pipeline. The probe height is read from the committed
		// sw_lock_* zones themselves (their union's own y-midpoint), not
		// hardcoded, so a future re-siting of the zones moves this probe
		// with them rather than leaving it decoupled. With today's geometry
		// (zones at y 564..612) this lands well inside the legs' solidly-
		// walled region (y 480..600/620) and the crossing is blocked, same
		// as before the fix; if the zones were ever moved back into the
		// open field above y 620, this probe would move there too and the
		// crossing ball would enter the very zone this test is named for --
		// see the mutation recorded in this spec's own ## Verification.
		const lockZonesMm = LOCK_ZONE_NAMES.map((name) => switchZoneMm(name));
		const bandMinY = Math.min(...lockZonesMm.map((z) => z.minMm.y));
		const bandMaxY = Math.max(...lockZonesMm.map((z) => z.maxMm.y));
		const probeY = (bandMinY + bandMaxY) / 2;

		const { machine, tick: servedTick } = servedMachine();
		let tick = servedTick;
		const ball = machine.balls[0]!;
		const startPhysics = toPhysics({ x: 260, y: probeY, z: 13.495 });
		ball.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
		const speedVuPerT = 2000 / (0.53975 * 100);
		ball.hit.vel.set(-speedVuPerT, 0, 0);
		ball.hit.angularVelocity.set(0, 0, 0);
		ball.hit.angularMomentum.set(0, 0, 0);

		const slotsBefore = [...machine.deviceSlots.bd_lock];
		let leftPlayAtTick: number | null = null;
		for (let i = 0; i < 400; i++) {
			tick += 1;
			machine.step(tick, NO_FRAME, []);
			const b = machine.balls[0];
			if (!b) {
				// Code review 2026-09-03: the comment that stood here said
				// "drained or parked elsewhere -- either way, not this test's
				// concern", directly above an assertion that the ball is still
				// in play. Both cannot be true. The concern IS bd_lock: a
				// drain inside the window is a legitimate outcome of a
				// sideways sweep, a bd_lock park is not -- so record which
				// happened and let the slot assertion below be the one that
				// discriminates, instead of failing a drain with a message
				// about slot parking.
				leftPlayAtTick = tick;
				break;
			}
		}
		expect(machine.deviceSlots.bd_lock, "a ball swept sideways at the slot band's own derived height must not park -- bd_lock's own slots must stay unchanged").toEqual(slotsBefore);
		if (leftPlayAtTick !== null) {
			expect(
				machine.deviceSlots.bd_lock.filter(Boolean).length,
				`the ball left the simulated set at tick ${leftPlayAtTick}; that is only acceptable if it DRAINED -- a bd_lock slot closing means it was swallowed`,
			).toBe(slotsBefore.filter(Boolean).length);
		} else {
			expect(machine.balls.length, 'the ball must still be in play, not removed into a slot').toBeGreaterThan(0);
		}
	});
});

describe('a parking device\'s own eject pose vs its own slot zones (the gap test/device-eject-pose.test.ts leaves: bd_lock declares no servesInto)', () => {
	it("no parking device's committed eject pose lies inside any of its own slot zones", () => {
		// Structural: every TABLE.ballDevices entry of kind 'parking', not a
		// name literal -- a future parking device is covered automatically.
		// This is a regression guard for the exact defect this story's own
		// Intent names (bd_lock's original pose sat inside sw_lock_2's own
		// zone): re-siting the zones (task 8) moved them clear of the pose,
		// and this pins that they stay clear.
		const doc = readCollisionDoc();
		for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
			if (device.kind !== 'parking') {
				continue;
			}
			const deviceDoc = (doc as unknown as { devices: Array<{ name: string; ejectPose: { posMm: { x: number; y: number; z: number } } }> }).devices.find((d) => d.name === name);
			expect(deviceDoc, `${name}: no entry in the collision document's own "devices" array`).toBeDefined();
			const pose = deviceDoc!.ejectPose.posMm;
			const ownZones = doc.switchZones.filter((z) => (device.slots as readonly string[]).includes(z.switch));
			for (const zone of ownZones) {
				const inside = pose.x >= zone.minMm.x && pose.x <= zone.maxMm.x && pose.y >= zone.minMm.y && pose.y <= zone.maxMm.y && pose.z >= zone.minMm.z && pose.z <= zone.maxMm.z;
				expect(inside, `${name}'s own eject pose ${JSON.stringify(pose)} lies inside its own zone "${zone.name}" (switch "${zone.switch}") -- an ejected ball would be captured on the tick it spawns`).toBe(false);
			}
		}
	});

	it('sanity: the swept-segment helper this describe block\'s sibling suite uses agrees with the point-in-box test above for a synthetic case', () => {
		// A cheap discriminator so the point-in-box check above is not
		// silently vacuous: segmentIntersectsBox() (the real detectEntries()
		// mechanism) must agree that a point strictly inside a box, held
		// there for a zero-length segment, counts as "entered".
		const inside = segmentIntersectsBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 });
		expect(inside).toBe(true);
		const outside = segmentIntersectsBox({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }, { x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 });
		expect(outside).toBe(false);
	});
});
