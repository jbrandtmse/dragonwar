// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5's I/O matrix, device rows: boot slot count; eject from the
// highest filled slot; park into the lowest empty slot with the ball
// leaving the simulated set; eject_failed and device_overflow; and the
// end-to-end serve -> rest in sw_shooter_lane -> autolaunch -> main field ->
// drain -> trough sequence. Split two ways: precise, deterministic
// unit-level coverage of the park/eject/failure MECHANIC
// (sim/physics/devices.ts's createDeviceMechanics(), driven with
// hand-crafted ball movements so "lowest empty slot" and "device full" are
// exercised directly rather than by hoping real gravity finds them), and
// integration-level coverage through the real sim/loop (boot, a visible
// eject, autolaunch reaching the main field, and the full drain sequence --
// empirically verified during this story's implementation to reach the
// trough via the committed placeholder geometry's own flipper-edge gap,
// per this spec's deferred findings on addBox()'s uncovered edges).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLoop } from '../src/sim/loop';
import { createDeviceMechanics } from '../src/sim/physics/devices';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// Unit-level: sim/physics/devices.ts directly.
// ---------------------------------------------------------------------------

function buildFreshMechanics() {
	const { physics, devices, switchZones } = loadCollision(loadDoc());
	const tuning = resolveTuning();
	let nextId = 0;
	const mechanics = createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextId++ });
	return { physics, mechanics, switchZones };
}

function throughZoneMovement(ball: Ball, zone: { minMm: { x: number; y: number; z: number }; maxMm: { x: number; y: number; z: number } }) {
	const cx = (zone.minMm.x + zone.maxMm.x) / 2;
	const cy = (zone.minMm.y + zone.maxMm.y) / 2;
	const cz = (zone.minMm.z + zone.maxMm.z) / 2;
	return { ball, beforeMm: { x: cx, y: zone.maxMm.y + 50, z: cz }, afterMm: { x: cx, y: cy, z: cz } };
}

describe('sim/physics/devices.ts -- boot assertion (AD-6: "4 balls, asserted at boot")', () => {
	it('a parking device whose declared slot count matches its capacity constructs without throwing', () => {
		expect(() => buildFreshMechanics()).not.toThrow();
	});

	it('bd_trough starts with every slot closed (filled)', () => {
		const { mechanics } = buildFreshMechanics();
		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, true, true]);
	});

	// I/O matrix "Boot ball count" row, Error Handling column: "A device whose
	// closed-slot count is not TABLE.ballDevices.bd_trough.capacity at boot
	// throws a descriptive load-time error naming the device, the count and
	// the capacity." `createDeviceMechanics()` reads `TABLE.ballDevices`
	// directly (AD-1: one table, no injection seam), and the real, frozen
	// TABLE is pinned elsewhere (test/table.test.ts) to always have
	// bd_trough.slots.length === bd_trough.capacity -- so the only way to
	// drive this branch is to mock the table module for one isolated,
	// dynamically-imported instance of the module graph, never touching the
	// statically-imported TABLE the rest of this file (and the real app) use.
	it("throws naming the device, the declared slot count and the capacity when a parking device's slots and capacity disagree", async () => {
		vi.resetModules();
		vi.doMock('../src/sim/table/dragonwar', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/table/dragonwar')>();
			return {
				...actual,
				TABLE: {
					...actual.TABLE,
					ballDevices: {
						...actual.TABLE.ballDevices,
						bd_trough: { ...actual.TABLE.ballDevices.bd_trough, capacity: 5 },
					},
				},
			};
		});

		try {
			const { createDeviceMechanics } = await import('../src/sim/physics/devices');
			const { loadCollision } = await import('../src/sim/physics/loader');
			const { resolveTuning } = await import('../src/sim/table/tuning');

			const { physics, devices, switchZones } = loadCollision(loadDoc());
			const tuning = resolveTuning();
			let nextId = 0;

			expect(() =>
				createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextId++ }),
			).toThrowError(/bd_trough.*\b4\b.*slot.*capacity of 5/is);
		} finally {
			vi.doUnmock('../src/sim/table/dragonwar');
			vi.resetModules();
		}
	});
});

describe('sim/physics/devices.ts -- eject from the highest filled slot', () => {
	it('pulsing the trough eject coil empties the HIGHEST filled slot first, spawns a ball, and emits ContactEvent{kind:"eject"}', () => {
		const { mechanics, physics } = buildFreshMechanics();
		const result = mechanics.applyCommands(1, [{ coil: 'c_trough_eject' }]);

		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, true, false]);
		expect(result.switchEvents).toEqual([{ type: 'switch', switch: 's_trough_4', closed: false, tick: 1 }]);
		expect(result.contactEvents).toHaveLength(1);
		expect(result.contactEvents[0]).toMatchObject({ type: 'contact', kind: 'eject', device: 'bd_trough', tick: 1 });
		expect(result.failures).toEqual([]);
		expect(physics.balls).toHaveLength(1);
	});

	it('eject_failed{device} when every slot is already empty', () => {
		const { mechanics } = buildFreshMechanics();
		// Empty all four slots first (highest to lowest, per the rule above).
		for (let tick = 1; tick <= 4; tick++) {
			mechanics.applyCommands(tick, [{ coil: 'c_trough_eject' }]);
		}
		expect(mechanics.parkingSlots.bd_trough).toEqual([false, false, false, false]);

		const result = mechanics.applyCommands(5, [{ coil: 'c_trough_eject' }]);
		expect(result.failures).toEqual([{ type: 'eject_failed', device: 'bd_trough', tick: 5 }]);
		expect(result.contactEvents).toEqual([]);
		expect(result.switchEvents).toEqual([]);
	});
});

describe('sim/physics/devices.ts -- non-parking eject (bd_shooter, AD-6 "the served ball stays simulated")', () => {
	// I/O matrix "Autolaunch" row, Error Handling column: "A pulse with no
	// ball in the lane emits eject_failed { device }." A freshly built
	// mechanics has no balls in `physics` at all, so bd_shooter's entry zone
	// is necessarily empty.
	it('eject_failed{device: "bd_shooter"} when pulse c_autolaunch fires with no ball resting in the shooter lane', () => {
		const { mechanics, physics } = buildFreshMechanics();
		expect(physics.balls).toHaveLength(0);

		const result = mechanics.applyCommands(1, [{ coil: 'c_autolaunch' }]);
		expect(result.failures).toEqual([{ type: 'eject_failed', device: 'bd_shooter', tick: 1 }]);
		expect(result.contactEvents).toEqual([]);
		expect(result.switchEvents).toEqual([]);
	});
});

describe('sim/physics/devices.ts -- park into the lowest empty slot; the ball leaves the simulated set', () => {
	it("two ejected balls, driven back into the trough's entry zones, refill the LOWEST empty slot first each time", () => {
		const { mechanics, physics, switchZones } = buildFreshMechanics();

		// Empty the two highest slots (index 3, then 2), leaving [true, true, false, false].
		mechanics.applyCommands(1, [{ coil: 'c_trough_eject' }]);
		mechanics.applyCommands(2, [{ coil: 'c_trough_eject' }]);
		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, false, false]);
		expect(physics.balls).toHaveLength(2);
		const [ballA, ballB] = physics.balls;

		const troughZones = switchZones.filter((z) => (TABLE.ballDevices.bd_trough.slots as readonly string[]).includes(z.switch));
		const zoneFor = (switchName: string) => troughZones.find((z) => z.switch === switchName)!;

		// Drive ballA's swept segment into sw_trough_3 -- but "lowest empty" is
		// what decides the slot it actually fills (index 2, s_trough_3),
		// regardless of which zone the segment crossed.
		const firstResult = mechanics.detectEntries(3, [throughZoneMovement(ballA, zoneFor('s_trough_3'))]);
		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, true, false]);
		expect(firstResult.switchEvents).toEqual([{ type: 'switch', switch: 's_trough_3', closed: true, tick: 3 }]);
		expect(firstResult.contactEvents[0]).toMatchObject({ type: 'contact', kind: 'hit', device: 'bd_trough', ballId: ballA.id, tick: 3 });
		expect(physics.balls, 'the parked ball must leave the simulated set').not.toContain(ballA);
		expect(physics.balls).toHaveLength(1);

		// Drive ballB in next -- now the lowest empty slot is index 3.
		const secondResult = mechanics.detectEntries(4, [throughZoneMovement(ballB, zoneFor('s_trough_1'))]);
		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, true, true]);
		expect(secondResult.switchEvents).toEqual([{ type: 'switch', switch: 's_trough_4', closed: true, tick: 4 }]);
		expect(physics.balls).toHaveLength(0);
	});

	it('device_overflow{device} when a ball enters with every slot already full, and the ball stays simulated', () => {
		const { mechanics, physics, switchZones } = buildFreshMechanics();
		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, true, true]);

		const radiusVu = TABLE.reference.ballMm / 2 / 0.53975;
		const data = new BallData(radiusVu, 1, 1);
		const state = new BallState('OverflowBall', new Vertex3D(0, 0, radiusVu));
		const extra = new Ball(999, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		physics.addBall(extra);

		const troughZones = switchZones.filter((z) => (TABLE.ballDevices.bd_trough.slots as readonly string[]).includes(z.switch));
		const result = mechanics.detectEntries(1, [throughZoneMovement(extra, troughZones[0])]);

		expect(result.failures).toEqual([{ type: 'device_overflow', device: 'bd_trough', tick: 1 }]);
		expect(result.switchEvents).toEqual([]);
		expect(mechanics.parkingSlots.bd_trough).toEqual([true, true, true, true]);
		expect(physics.balls, 'a ball that overflows a full device stays simulated').toContain(extra);
	});
});

// ---------------------------------------------------------------------------
// Integration-level: the real sim/loop over the committed collision document.
// ---------------------------------------------------------------------------

describe('sim/loop -- serve, autolaunch and drain (integration, real physics)', () => {
	it('boot: bd_trough is fully closed, ballsInPlay is 0, snapshot.balls is empty', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const out = loop.advance(0, []);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots).toEqual([true, true, true, true]);
		expect(out.snapshot.game.machine.ballsInPlay).toBe(0);
		expect(out.snapshot.balls).toEqual([]);
	});

	it('pulse c_trough_eject: one ball appears, the highest filled slot opens as one edge, and it settles inside sw_shooter_lane', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		let out = loop.advance(20, []);
		expect(out.snapshot.balls).toHaveLength(1);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots).toEqual([true, true, true, false]);

		for (let i = 0; i < 300; i++) {
			out = loop.advance(16.667, []);
		}
		const ball = out.snapshot.balls[0];
		expect(ball, 'the ball must still be in play after settling').toBeDefined();
		expect(ball!.pos.x).toBeGreaterThanOrEqual(484.4);
		expect(ball!.pos.x).toBeLessThanOrEqual(510.4);
		expect(ball!.pos.y).toBeGreaterThanOrEqual(10);
		expect(ball!.pos.y).toBeLessThanOrEqual(60);
		expect(out.snapshot.mechanisms.devices.bd_shooter.slots).toEqual([true]);
	});

	it('pulse c_autolaunch on a served ball: s_shooter_lane opens (ball_launched fires once), ballsInPlay becomes 1, and the ball reaches the main field', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		for (let i = 0; i < 300; i++) {
			loop.advance(16.667, []);
		}
		loop.pulseCoil('c_autolaunch');
		const launchOut = loop.advance(20, []);
		expect(launchOut.events).toEqual([{ type: 'ball_launched', tick: launchOut.snapshot.tick }]);
		expect(launchOut.snapshot.game.machine.ballsInPlay).toBe(1);

		let out = launchOut;
		let reachedMainField = false;
		for (let i = 0; i < 400 && !reachedMainField; i++) {
			out = loop.advance(16.667, []);
			const ball = out.snapshot.balls[0];
			// The plunger-lane divider's main-field face is at table x = 468.4
			// (LANE_X0_MM) -- reaching below it means the ball left the lane.
			if (ball && ball.pos.x < 468.4) {
				reachedMainField = true;
			}
		}
		expect(reachedMainField, `the ball never crossed the plunger-lane divider's main-field face (x = 468.4); last known position: ${JSON.stringify(out.snapshot.balls[0]?.pos)}`).toBe(true);
	});

	it('end to end: serve, autolaunch, drain -- the ball returns to the trough and ballsInPlay settles back to 0', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		for (let i = 0; i < 300; i++) {
			loop.advance(16.667, []);
		}
		loop.pulseCoil('c_autolaunch');
		loop.advance(20, []);

		let out = loop.advance(16.667, []);
		let drained = false;
		// Bounded but generous: empirically drains within a few thousand ticks
		// on the committed geometry (well under this budget).
		for (let i = 0; i < 3000 && !drained; i++) {
			out = loop.advance(16.667, []);
			if (out.snapshot.balls.length === 0) {
				drained = true;
			}
		}

		expect(drained, `the ball never drained; last known position: ${JSON.stringify(out.snapshot.balls[0]?.pos)}`).toBe(true);
		expect(out.snapshot.game.machine.ballsInPlay).toBe(0);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots).toEqual([true, true, true, true]);
	});

	// Review finding 2026-08-28 (verification gap): every eject_failed/
	// device_overflow test above drives sim/physics/devices.ts's
	// createDeviceMechanics() DIRECTLY -- never through machine.ts's step()
	// (src/sim/physics/machine.ts:116's semanticEvents: [...commandResult.
	// failures, ...entryResult.failures]) or through the full sim/loop's
	// FrameOutput.events. A regression that dropped commandResult.failures
	// from that spread (a plausible copy/paste slip) would leave every
	// existing test in this file green while eject_failed silently never
	// reached a real caller again. This closes that gap for the reachable
	// half of it: a player CAN legitimately empty bd_trough via four real
	// ejects and pulse a fifth time (device_overflow's own trigger --
	// a 5th ball entering an already-full 4-slot trough -- is UNREACHABLE
	// under Epic 1's own single-ball rules, since nothing before Epic 2's
	// multiball can put a 5th ball into simulated play at all; that half
	// stays covered only at the devices.ts unit level above, appropriately,
	// since there is no real gameplay path to it yet).
	it('eject_failed reaches FrameOutput.events through the REAL loop (not just createDeviceMechanics() directly)', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		for (let tick = 0; tick < 4; tick++) {
			loop.pulseCoil('c_trough_eject');
			loop.advance(1, []);
		}
		expect(loop.advance(0, []).snapshot.mechanisms.devices.bd_trough.slots).toEqual([false, false, false, false]);

		loop.pulseCoil('c_trough_eject');
		const out = loop.advance(1, []);
		expect(out.events).toContainEqual({ type: 'eject_failed', device: 'bd_trough', tick: out.snapshot.tick });
	});
});
