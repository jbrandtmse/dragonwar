// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.6's I/O matrix, collision rows, against the COMMITTED geometry:
// the AMENDED "flipper held" row (bat held at end-of-stroke, unmoving, for
// the full 5 s; ball held on the bat for the first 1 s only -- see this
// spec's Design Notes / epics.md's Story 1.6 change log, 2026-08-29, and
// ledger `DW-72`); a ball struck by a driven bat leaving with more energy
// than it arrived with; and the DW-60 row -- a ball released at the
// playfield x-centre with both keys released reaches `bd_trough`, while the
// same release with a key held does not drain on that pass.
//
// Two harnesses are used, matching `test/machine-serve-drain.test.ts`'s own
// split: `loadCollision()` + `createFlipperMechanics()` directly for
// precise, deterministic single-ball placement (the collision-shape rows),
// and the real `createLoop()` for the DW-60 drain row (which needs the whole
// switch/devices pipeline to prove the ball actually PARKS in `bd_trough`,
// not merely that it falls through the gap).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { createDeviceMechanics, type BallStepMovement } from '../src/sim/physics/devices';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { fromPhysics, toPhysics } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';
import type { InputFrame } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function buildFlipperHarness() {
	const { physics, flippers } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const tuning = resolveTuning();
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
	return { physics, flipperMechanics };
}

function spawnBallAt(physics: ReturnType<typeof buildFlipperHarness>['physics'], xMm: number, yMm: number, name: string): Ball {
	const posPhysics = toPhysics({ x: xMm, y: yMm, z: RADIUS_VU * 0.53975 });
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState(name, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);
	return ball;
}

function ballSpeed(ball: Ball): number {
	return Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
}

function ballPosMm(ball: Ball) {
	return fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
}

describe('sim/physics/flippers.ts -- collision against the committed geometry (Story 1.6)', () => {
	// --- DW-72 rework (2026-08-29): "Flipper held" now asserts the bat's
	// full 5 s hold plus a 1 s-bounded ball claim, each with a mandatory
	// discriminating negative -- see this spec's Design Notes ("The cradle
	// amendment") and epics.md's Story 1.6 change log for why.

	// The true committed end-of-stroke angle for the left flipper (90 deg,
	// independently pinned by the ball-free sanity check in test (b) below
	// and by test/flipper-mover.test.ts:83). Both tests below compare
	// against this single external value rather than a self-derived one, so
	// a regression that converges to a stable BUT WRONG angle under ball
	// load is not indistinguishable from a correct one.
	const END_OF_STROKE_ANGLE_DEG = 90;

	it('(a) the bat reaches its end-of-stroke angle and holds it, unmoving and without oscillating, for the full 5 s (5000 ticks) hold', () => {
		const { physics, flipperMechanics } = buildFlipperHarness();
		const held: InputFrame = { ...NO_FRAME, flipper_l: true };

		// A ball is present and in contact throughout, exactly like the "(b)"
		// test below -- the bat-angle claim must hold under the SAME load,
		// not in a vacuum.
		spawnBallAt(physics, 195, 85, 'CradleBall');

		const angles: number[] = [];
		for (let t = 1; t <= 5000; t++) {
			flipperMechanics.applyFrame(t, held, { l: true, r: true });
			physics.step();
			angles.push(flipperMechanics.state.l.angleDeg);
		}
		const firstAtEndTick = angles.findIndex((a) => Math.abs(a - END_OF_STROKE_ANGLE_DEG) < 0.01);
		expect(firstAtEndTick, 'the bat must reach the true end-of-stroke angle (90 deg), not merely converge to some stable value').not.toBe(-1);
		expect(firstAtEndTick, 'the bat must reach its end-of-stroke angle quickly, not drift up over seconds').toBeLessThan(200);

		// Unmoving and without oscillating at the stop: every tick from first
		// reaching it through the end of the 5 s hold stays within a
		// floating-point tolerance of the true end angle. Measured: a ball
		// resting against the driven bat nudges it by contact torque at most
		// ~0.00015 deg at isolated ticks, immediately damped back by the
		// end-of-stroke torque (`FlipperHit.contact()`, pinned verbatim to
		// upstream) -- 0.01 deg is two orders of magnitude above that noise
		// floor, so this is the real "unmoving" claim, not a loosened one.
		const maxDeviationAfterReaching = Math.max(...angles.slice(firstAtEndTick).map((a) => Math.abs(a - END_OF_STROKE_ANGLE_DEG)));
		expect(maxDeviationAfterReaching, 'the bat must not oscillate or drift away from its end-of-stroke angle once it gets there').toBeLessThan(0.01);
	});

	it('(a, discriminating negative) the SAME 5 s window does NOT hold the bat at its end-of-stroke angle when the key is released instead', () => {
		// Proves the positive assertion above is a real, measured property of
		// this implementation, not a tolerance wide enough to pass regardless
		// of whether the coil is even driven. Chosen negative: released
		// (rather than disabled) because it is the direct opposite of "held"
		// in the I/O matrix row itself. Compared against the SAME true
		// committed end-of-stroke angle test (a) above pins, not a freshly
		// re-derived one, so both tests share one source of truth.
		const { physics, flipperMechanics } = buildFlipperHarness();
		const released: InputFrame = NO_FRAME;
		for (let t = 1; t <= 5000; t++) {
			flipperMechanics.applyFrame(t, released, { l: true, r: true });
			physics.step();
		}
		const finalAngleReleased = flipperMechanics.state.l.angleDeg;
		expect(Math.abs(finalAngleReleased - END_OF_STROKE_ANGLE_DEG), 'a released flipper must NOT sit at the end-of-stroke angle -- rest and end-of-stroke are different poses').toBeGreaterThan(10);
	});

	it('(b) the ball resting on the raised bat stays close to where it was placed through the first 1 s (1000 ticks), then has measurably departed by 5 s (5000 ticks)', () => {
		const { physics, flipperMechanics } = buildFlipperHarness();
		const held: InputFrame = { ...NO_FRAME, flipper_l: true };
		let tick = 0;
		for (let t = 1; t <= 60; t++) {
			tick = t;
			flipperMechanics.applyFrame(t, held, { l: true, r: true });
			physics.step();
		}
		expect(flipperMechanics.state.l.angleDeg, 'sanity: the bat must be fully raised before the ball is placed').toBe(90);

		// Placed already resting against the raised bat's face (the exact
		// approach test/machine-serve-drain.test.ts-style placement uses:
		// derived from the committed geometry, not an arbitrary point).
		const ball = spawnBallAt(physics, 195, 85, 'CradleBall');
		const startPos = ballPosMm(ball);

		let maxSpeedThroughFirstSecond = 0;
		let maxDriftMmThroughFirstSecond = 0;
		let driftMmAtFiveSeconds = 0;
		let speedAtFiveSeconds = 0;
		for (let i = 1; i <= 5000; i++) {
			tick += 1;
			flipperMechanics.applyFrame(tick, held, { l: true, r: true });
			physics.step();
			const pos = ballPosMm(ball);
			const driftMm = Math.hypot(pos.x - startPos.x, pos.y - startPos.y);
			const speed = ballSpeed(ball);
			if (i <= 1000) {
				maxSpeedThroughFirstSecond = Math.max(maxSpeedThroughFirstSecond, speed);
				maxDriftMmThroughFirstSecond = Math.max(maxDriftMmThroughFirstSecond, driftMm);
			}
			if (i === 5000) {
				driftMmAtFiveSeconds = driftMm;
				speedAtFiveSeconds = speed;
			}
		}

		// Positive half -- the AMENDED AC's own bound ("at rest ... position
		// ... unchanged within tolerance" for at least the first 1 s).
		// Measured on the committed geometry: drift grows smoothly to ~27.5 mm
		// and speed to ~1.0 by tick 1000 -- well short of a struck ball's
		// order of magnitude (the "driven bat" test below asserts
		// > speedBefore * 10, typically 30-40+). The tolerances carry a small
		// margin over that measurement; they are not invented figures.
		expect(maxSpeedThroughFirstSecond, 'the ball must stay slow through the first simulated second').toBeLessThan(2);
		expect(maxDriftMmThroughFirstSecond, 'the ball must stay close to where it was placed through the first simulated second').toBeLessThan(35);

		// Discriminating negative (the whole point of this rework): the SAME
		// run, by the full 5 s the ORIGINAL (superseded) row asked for, has
		// measurably left the bat -- proving the 1 s bound above is a real,
		// load-bearing boundary of this implementation's behaviour, not a
		// tolerance wide enough to pass no matter how long the hold runs.
		// Measured: drift ~4292 mm, speed ~47 by tick 5000. Root cause: this
		// placeholder table has no geometry beside either flipper (no inlane
		// guide or post) to form a cradle pocket -- see this spec's Design
		// Notes and epics.md's Story 1.6 change log (2026-08-29). The full
		// multi-second cradle is Story 2.1's, ledger DW-72, closing on
		// evidence against the real playfield.
		expect(driftMmAtFiveSeconds, "by 5 s the ball must have measurably left the bat -- the real cradle is DW-72/Story 2.1's, against real playfield geometry").toBeGreaterThan(500);
		expect(speedAtFiveSeconds, 'by 5 s the ball must be moving well past "at rest"').toBeGreaterThan(10);
	});

	it('a ball meeting a bat that is being driven up is struck and leaves with more energy than it arrived with', () => {
		const { physics, flipperMechanics } = buildFlipperHarness();
		let tick = 0;
		const released: InputFrame = NO_FRAME;
		for (let t = 1; t <= 20; t++) {
			tick = t;
			flipperMechanics.applyFrame(t, released, { l: true, r: true });
			physics.step();
		}

		const ball = spawnBallAt(physics, 210, 85, 'StruckBall');
		for (let i = 0; i < 30; i++) {
			tick += 1;
			flipperMechanics.applyFrame(tick, released, { l: true, r: true });
			physics.step();
		}
		const speedBefore = ballSpeed(ball);

		const held: InputFrame = { ...NO_FRAME, flipper_l: true };
		let maxSpeed = speedBefore;
		for (let i = 0; i < 100; i++) {
			tick += 1;
			flipperMechanics.applyFrame(tick, held, { l: true, r: true });
			physics.step();
			maxSpeed = Math.max(maxSpeed, ballSpeed(ball));
		}

		expect(maxSpeed, 'the struck ball must leave with substantially more energy than it arrived with').toBeGreaterThan(speedBefore * 10);
	});

	it('a ball meeting a bat AT REST rebounds with the same material, with no impulse from the mover (control)', () => {
		const { physics, flipperMechanics } = buildFlipperHarness();
		let tick = 0;
		const released: InputFrame = NO_FRAME;
		for (let t = 1; t <= 20; t++) {
			tick = t;
			flipperMechanics.applyFrame(t, released, { l: true, r: true });
			physics.step();
		}
		const ball = spawnBallAt(physics, 210, 85, 'RestBall');

		let maxSpeed = 0;
		for (let i = 0; i < 100; i++) {
			tick += 1;
			flipperMechanics.applyFrame(tick, released, { l: true, r: true }); // never driven
			physics.step();
			maxSpeed = Math.max(maxSpeed, ballSpeed(ball));
		}
		// No coil-driven impulse: whatever small speed appears comes only from
		// gravity/contact settling, nowhere near the struck case's order of
		// magnitude (asserted above as > speedBefore*10, typically 30-40 VU/T).
		expect(maxSpeed, 'a bat at rest must never inject the kind of energy a driven strike does').toBeLessThan(5);
	});
});

describe('sim/loop -- DW-60: the drain aperture at rest vs. held (Story 1.6)', () => {
	// A ball released at the playfield x-centre, driven through the REAL
	// devices/switches pipeline (not raw PlayerPhysics alone) so "reaches
	// bd_trough" means the ball actually PARKS -- the same machine.ts-shaped
	// per-tick flow (flipper rule -> physics.step() -> switch/device entry
	// tests), built directly here because Machine's own public surface has
	// no "place a ball anywhere" dev hatch (by design -- devices spawn balls,
	// AD-6).
	function runFromCentre(held: boolean) {
		const { physics, flippers, switchZones, devices } = loadCollision(loadDoc());
		physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
		const tuning = resolveTuning();
		const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
		let nextBallId = 1;
		const deviceMechanics = createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextBallId++ });

		// bd_trough starts with all four slots filled (AD-6: "4 balls,
		// asserted at boot") -- empty ONE first so the drained ball this test
		// drops has somewhere to park; otherwise every real crossing reports
		// device_overflow instead, which is a capacity concern unrelated to
		// what DW-60 (the drain APERTURE) is testing here.
		deviceMechanics.applyCommands(0, [{ coil: 'c_trough_eject' }]);
		// That eject spawns its OWN ball in the shooter lane -- remove it
		// immediately so this test's own single ball is the only one in play.
		for (const spawned of [...physics.balls]) {
			physics.removeBall(spawned);
		}

		const centreX = TABLE.reference.playfieldMm.w / 2;
		const startPosMm = { x: centreX, y: 200, z: RADIUS_VU * 0.53975 };
		const posPhysics = toPhysics(startPosMm);
		const data = new BallData(RADIUS_VU, 1, 1);
		const state = new BallState('DrainBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		physics.addBall(ball);

		const frame: InputFrame = held ? { ...NO_FRAME, flipper_l: true, flipper_r: true } : NO_FRAME;

		let drained = false;
		let lastPosMm = startPosMm;
		for (let tick = 1; tick <= 4000 && !drained; tick++) {
			flipperMechanics.applyFrame(tick, frame, { l: true, r: true });
			const beforeMm = ballPosMm(ball);
			physics.step();
			if (!physics.balls.includes(ball)) {
				// Already parked by an earlier tick's detectEntries() call.
				break;
			}
			const afterMm = ballPosMm(ball);
			const movement: BallStepMovement = { ball, beforeMm, afterMm };
			deviceMechanics.detectEntries(tick, [movement]);
			lastPosMm = afterMm;
			if (!physics.balls.includes(ball)) {
				drained = true;
			}
		}
		return { drained, lastPosMm, deviceMechanics };
	}

	it('with both flipper keys released, the ball passes between the resting bats and is parked by bd_trough', () => {
		const { drained, lastPosMm, deviceMechanics } = runFromCentre(false);
		expect(drained, `the ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough).toEqual([true, true, true, true]);
	});

	it('with a flipper key held, the same pass does not drain -- the ball is struck instead', () => {
		const { drained } = runFromCentre(true);
		expect(drained, 'a held flipper must block the drain aperture, not let the ball pass through on this run').toBe(false);
	});
});
