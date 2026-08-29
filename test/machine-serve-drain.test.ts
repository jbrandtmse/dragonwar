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
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createDeviceMechanics } from '../src/sim/physics/devices';
import { createMachine } from '../src/sim/physics/machine';
import { loadCollision } from '../src/sim/physics/loader';
import { step as rulesStep } from '../src/sim/rules';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { MM_PER_VU, fromPhysics, toPhysics } from '../src/sim/table/frames';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';
import type { CoilCommand, GameState } from '../src/sim/table/names';

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

// Story 1.6, task 10(b): DW-63 -- both eject paths (the parking trough's
// spawn and the non-parking shooter lane's launch) must carry the SAME field
// set, and `pos` must be a plain {x,y,z} with no extra `dir` property.
describe('sim/physics/devices.ts -- DW-63: eject ContactEvent payloads agree between the parking and non-parking paths', () => {
	it('a trough eject and a shooter-lane launch produce ContactEvents with the identical field set, pos as a plain {x,y,z}', () => {
		const { mechanics, physics } = buildFreshMechanics();

		const trough = mechanics.applyCommands(1, [{ coil: 'c_trough_eject' }]);
		expect(trough.contactEvents).toHaveLength(1);
		const troughEvent = trough.contactEvents[0]!;

		// Put the ejected ball into the shooter lane's entry zone so launch()
		// finds it resting there, then launch it.
		const servedBall = physics.balls[0]!;
		servedBall.state.pos.set(497.4 / MM_PER_VU, (1066.8 - 20) / MM_PER_VU, 13.5 / MM_PER_VU);
		const launch = mechanics.launch(2, 'bd_shooter', 2500);
		expect(launch.contactEvents).toHaveLength(1);
		const launchEvent = launch.contactEvents[0]!;

		expect(Object.keys(troughEvent).sort(), 'both eject ContactEvents must carry the same field set').toEqual(Object.keys(launchEvent).sort());
		for (const event of [troughEvent, launchEvent]) {
			expect(event.pos, 'pos must be present').toBeDefined();
			expect(Object.keys(event.pos!).sort(), 'pos must be a plain {x,y,z} -- no extra "dir" property').toEqual(['x', 'y', 'z']);
		}
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

// Review finding 2026-08-28 (this file, the eject_failed case below) closed
// the analogous gap for eject_failed by proving it reaches FrameOutput.events
// through the REAL sim/loop -- but device_overflow's own trigger (a 5th ball
// entering an already-full 4-slot trough) has no legitimate path through real
// gameplay under Epic 1's own single-ball rules, so that half was left at the
// createDeviceMechanics()-direct unit level above, "appropriately". This
// closes the REACHABLE half of that same gap one layer deeper: it exercises
// machine.ts's own step() wiring (`semanticEvents: [...commandResult.
// failures, ...entryResult.failures]`, machine.ts:116) -- the exact spread a
// dropped-entryResult.failures regression would silently break -- without
// needing a legitimate real-loop path to the unreachable trigger itself.
describe("sim/physics/machine.ts -- device_overflow reaches step()'s semanticEvents, not just createDeviceMechanics().detectEntries() directly", () => {
	it("an overflowing ball's swept segment, injected directly onto machine.balls (the SAME live array machine.step() reads back -- machine.ts's own get balls() getter returns physics.balls itself), produces device_overflow through the real machine.step()", () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		expect(machine.deviceSlots.bd_trough).toEqual([true, true, true, true]);

		// A trough slot zone's centre, in physics units -- read from the real
		// committed collision document via loadCollision(), never hardcoded.
		const { switchZones } = loadCollision(loadDoc());
		const slotSwitch = TABLE.ballDevices.bd_trough.slots[0];
		const zone = switchZones.find((z) => z.switch === slotSwitch)!;
		const centreMm = {
			x: (zone.minMm.x + zone.maxMm.x) / 2,
			y: (zone.minMm.y + zone.maxMm.y) / 2,
			z: (zone.minMm.z + zone.maxMm.z) / 2,
		};
		const posPhysics = toPhysics(centreMm);
		const radiusVu = TABLE.reference.ballMm / 2 / MM_PER_VU;
		const data = new BallData(radiusVu, 1, 1);
		const state = new BallState('OverflowProbe', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const extra = new Ball(998, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);

		// Pushed directly onto the array machine.balls exposes, deliberately
		// NOT through PlayerPhysics.addBall() (which also registers a mover):
		// an unregistered ball is still hit-tested by PlayerPhysics.step()'s
		// per-ball loop but is never MOVED (only registered movers get
		// updateDisplacements()), so its before/after table-mm position this
		// tick is IDENTICAL -- a degenerate swept segment already inside the
		// zone, which segmentIntersectsBoxLocal (devices.ts) still classifies
		// as "entered" (each axis's delta is ~0, so the test falls back to
		// "is the start point inside [min, max]" -- verified by reading
		// devices.ts's segmentIntersectsBoxLocal directly).
		(machine.balls as Ball[]).push(extra);

		const result = machine.step(1, NO_FRAME, []);
		expect(result.semanticEvents).toContainEqual({ type: 'device_overflow', device: 'bd_trough', tick: 1 });
		// AD-6: an overflow leaves the device untouched -- still full, nothing
		// parked, nothing opened.
		expect(machine.deviceSlots.bd_trough).toEqual([true, true, true, true]);
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

	// Review finding 2026-08-28: BallSnapshot.vel and .speed are computed by
	// sim/loop's physicsVelocityToTableMmPerS() on EVERY frame and published to
	// presentation, and no test anywhere read either field -- the determinism
	// hash quantises `pos` only. Dropping the `* 100` (a 100x unit error) or
	// differencing the other way (a sign flip) left the whole suite green,
	// while Story 1.8 would bake the result into the shipped golden hashes and
	// Epic 4's contact sound would inherit it. This also cross-checks the two
	// independently hand-derived conversions DW-61 records: the forward one in
	// sim/physics/devices.ts (which produced this velocity) against the inverse
	// in sim/loop (which reports it).
	it('the served ball\'s published vel/speed round-trip the authored eject speed, in table mm/s and the table\'s own sign convention', () => {
		const tuning = resolveTuning();
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.pulseCoil('c_trough_eject');
		const out = loop.advance(1, []); // exactly one tick: one ms of gravity, no more.

		const ball = out.snapshot.balls[0];
		expect(ball, 'the eject must have spawned a ball').toBeDefined();

		const authored = tuning.troughEjectSpeedMmPerS.value;
		// One tick of up-slope gravity and deck contact has already bled a
		// little speed off by the time the snapshot is built (measured 293.25
		// mm/s against an authored 300), so this is a BAND, not an equality.
		// It is still far tighter than any of the errors it exists to catch: a
		// dropped VP time-unit factor reports 3, an extra one reports 30000,
		// and a sign flip reports -293.
		const lo = authored * 0.9;
		const hi = authored * 1.1;

		// bd_trough's authored eject dir is (0, 1, 0) -- up the playfield in the
		// table frame -- so the published velocity is almost all +y.
		expect(ball!.vel.y, 'the eject drives the ball UP the playfield: table +Y is positive here').toBeGreaterThan(lo);
		expect(ball!.vel.y).toBeLessThan(hi);
		expect(Math.abs(ball!.vel.x), 'an axis-aligned eject must not acquire lateral speed').toBeLessThan(authored * 0.05);
		expect(
			ball!.speed,
			`speed must be the magnitude of vel in table mm/s -- got ${ball!.speed} against an authored ${authored}`,
		).toBeGreaterThan(lo);
		expect(ball!.speed).toBeLessThan(hi);
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

	// Story 1.6 update: this scenario used to let the launched ball bounce
	// freely across the WHOLE open playfield (walls near the lane, the top,
	// the left side, ...) before ever nearing the flippers -- a long,
	// chaotic multi-bounce trajectory whose final resting spot this file's
	// own header already flagged as contingent on "the committed placeholder
	// geometry's own flipper-edge gap" (the DW-7-shaped tunnelling the OLD
	// static flipper boxes left uncovered). Story 1.6 replaces those boxes
	// with the real, ported flipper mover + hit shape (DW-60), which closes
	// exactly that tunnelling path -- so the ball can no longer slip through
	// the old edge gap, and the SAME long chaotic bounce (now correctly
	// colliding with real geometry throughout) settles somewhere off to the
	// side instead, verified empirically during this story's implementation
	// pass across many timing variants, none of which drained within a
	// generous budget any more. The chaotic FULL-TABLE bounce was never this
	// test's actual point (autolaunch reaching the main field is already
	// proven by the row above); DW-60's own acceptance criterion -- "a ball
	// released at the playfield x-centre with both keys released reaches
	// bd_trough" -- is the real, robust, geometry-independent observable,
	// and is what this rewritten test drives the SAME real
	// createMachine()+rules pipeline through, after confirming the ball
	// genuinely launched and reached the main field first.
	it('end to end: serve, autolaunch, drain -- the ball returns to the trough and ballsInPlay settles back to 0', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		let state: GameState = {
			tick: 0,
			phase: 'attract',
			machine: {
				ballsInPlay: 0,
				hardwareEnabled: true,
				ballSave: { untilTick: null, sources: [] },
				tilt: { tilted: false, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: machine.deviceSlots,
			},
			players: [],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};

		function step(tick: number, commands: CoilCommand[] = []) {
			const result = machine.step(tick, NO_FRAME, commands);
			const rulesResult = rulesStep(state, result.switchEvents, tick);
			state = { ...rulesResult.state, machine: { ...rulesResult.state.machine, deviceSlots: machine.deviceSlots } };
			return result;
		}

		let tick = 0;
		for (let i = 0; i < 300; i++) {
			tick += 1;
			step(tick, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
		}

		tick += 1;
		step(tick, [{ type: 'coil', coil: 'c_autolaunch', action: 'pulse', tick }]);
		let laneOpened = false;
		for (let i = 0; i < 20 && !laneOpened; i++) {
			tick += 1;
			const result = step(tick);
			laneOpened = result.switchEvents.some((e) => e.switch === 's_shooter_lane' && !e.closed);
		}
		expect(laneOpened, 's_shooter_lane must open').toBe(true);
		expect(state.machine.ballsInPlay, 'ballsInPlay must be 1 once genuinely launched').toBe(1);

		let reachedMainField = false;
		for (let i = 0; i < 7000 && !reachedMainField; i++) {
			tick += 1;
			step(tick);
			const ball = machine.balls[0];
			if (ball) {
				const posMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
				if (posMm.x < 468.4) {
					reachedMainField = true;
				}
			}
		}
		expect(reachedMainField, 'the ball must genuinely have launched and reached the main field first').toBe(true);

		// The chaotic full-table bounce from here is not this test's point
		// (see this test's own header) -- reposition the SAME real,
		// fully-registered ball (mover and hit shape both already live in
		// physics from the genuine launch above) directly above the
		// flippers at the playfield x-centre, DW-60's own acceptance
		// observable, and let the REAL loop carry it the rest of the way.
		const ball = machine.balls[0]!;
		const centreX = TABLE.reference.playfieldMm.w / 2;
		const restartPhysics = toPhysics({ x: centreX, y: 200, z: TABLE.reference.ballMm / 2 });
		ball.state.pos.set(restartPhysics.x, restartPhysics.y, restartPhysics.z);
		ball.hit.vel.set(0, 0, 0);
		// The long bounce across the main field above also leaves the ball
		// SPINNING -- reset that too, or the residual spin "walks" it
		// sideways via friction once it lands again, the same way a spinning
		// ball dropped on any surface creeps (reproduced during this story's
		// implementation pass: without this reset the repositioned ball
		// drifted toward col_wall_left instead of down through the aperture).
		ball.hit.angularVelocity.set(0, 0, 0);
		ball.hit.angularMomentum.set(0, 0, 0);

		let drained = false;
		let lastPos: { x: number; y: number; z: number } | undefined;
		for (let i = 0; i < 4000 && !drained; i++) {
			tick += 1;
			step(tick);
			if (machine.balls.length === 0) {
				drained = true;
			} else {
				lastPos = fromPhysics({ x: machine.balls[0]!.state.pos.x, y: machine.balls[0]!.state.pos.y, z: machine.balls[0]!.state.pos.z });
			}
		}

		expect(drained, `the ball never drained; last known position: ${JSON.stringify(lastPos)}`).toBe(true);
		expect(state.machine.ballsInPlay, 'ballsInPlay must settle back to 0 once the SAME ball parks').toBe(0);
		expect(machine.deviceSlots.bd_trough).toEqual([true, true, true, true]);
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

// Story 1.8's sweep, Part A: the FOURTH pre-physics.step() hardware rule
// (test/hardware-rule-seam.test.ts's `deviceMechanics.applyCommands`
// manifest row) had a structural pin (the manifest test above) but no
// BEHAVIOURAL one -- machine.ts's own header states the ordering reason
// ("this tick's pulses apply to the devices layer ... before
// physics.step()"), but nothing failed if that ordering broke. The
// observable: bd_trough's spawnBall() places a new ball at the device's
// AUTHORED eject pose (devices.ts:238, table mm); if the eject runs BEFORE
// physics.step() (the correct ordering), that same tick's step() integrates
// one tick of gravity + the eject velocity into it, so the ball has already
// moved measurably off the authored pose by the time this tick's result is
// read. If the call moved to AFTER physics.step() (the mutation), the ball
// sits at EXACTLY the authored pose -- physics.step() would not run again
// until the NEXT tick. Measured this pass: ~0.29 mm
// (troughEjectSpeedMmPerS 300 mm/s * SECONDS_PER_TICK 1e-3 s ~= 0.3 mm,
// slightly bled by one tick of gravity/contact) vs exactly 0 mm under the
// mutation -- matching test/machine-serve-drain.test.ts:333-347's own
// independently-measured 293.25 mm/s at this exact tick. The 0.05 mm bound
// sits with wide margin below the true ~0.29 mm and far above float noise.
describe('src/sim/physics/machine.ts -- the fourth hardware rule (deviceMechanics.applyCommands), behavioural pin (AD-5, Story 1.8 sweep)', () => {
	it('one tick after pulsing c_trough_eject, the spawned ball has already moved > 0.05 mm off its authored eject pose -- physics.step() integrated it THIS SAME tick', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		const result = machine.step(1, NO_FRAME, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 1 }]);

		expect(result.contactEvents, 'the pulse must have produced exactly one eject ContactEvent').toHaveLength(1);
		const eject = result.contactEvents[0]!;
		expect(eject.kind).toBe('eject');
		expect(eject.pos, 'the eject ContactEvent must carry the authored pose').toBeDefined();

		const ball = machine.balls[0];
		expect(ball, 'the eject must have spawned a ball').toBeDefined();
		const afterMm = fromPhysics({ x: ball!.state.pos.x, y: ball!.state.pos.y, z: ball!.state.pos.z });
		const authoredMm = eject.pos!;
		const movedMm = Math.hypot(afterMm.x - authoredMm.x, afterMm.y - authoredMm.y, afterMm.z - authoredMm.z);

		expect(
			movedMm,
			`expected the ball to have moved measurably (>0.05 mm) off its authored eject pose by the end of tick 1 -- ` +
			`deviceMechanics.applyCommands() must run BEFORE physics.step() so this SAME tick's step integrates the eject ` +
			`velocity (AD-5). Measured displacement: ${movedMm.toFixed(6)} mm.`,
		).toBeGreaterThan(0.05);
	});
});
