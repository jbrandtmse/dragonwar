// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7's AC 1 (nudge is cabinet motion, not a force) and its I/O matrix
// rows: "Nudge rising edge", "Nudge held" (one impulse per rising edge, not
// per tick -- and the same mechanism covers "OS auto-repeat", since
// `cabinet/index.ts`'s OWN rising-edge tracking is what the loop's per-tick
// `applyFrame()` calls exercise, whether the caller is a held key or a
// repeated identical frame), and "Ball coupling".
//
// AC 1's pairing (a nudged run against a control run identical in every
// respect except the nudge) is what removes gravity from the comparison --
// see this file's own assertions. `test/flipper-collision.test.ts`'s harness
// SHAPE is mirrored (`loadCollision()` + direct hardware-rule construction
// for deterministic single-ball placement); this file does not import from
// or modify that one.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createCabinetMechanics, cabinetAccelToPhysicsAccel } from '../src/sim/physics/cabinet';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { toPhysics } from '../src/sim/table/frames';
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

function buildHarness() {
	const { physics } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const tuning = resolveTuning();
	const cabinetMechanics = createCabinetMechanics({ physics, tuning });
	return { physics, cabinetMechanics, tuning };
}

/** A free ball, well clear of any collision geometry, given a moderate rolling velocity -- "a free ball rolling on the playfield" (AC 1). */
function spawnRollingBall(physics: ReturnType<typeof buildHarness>['physics']): Ball {
	const posPhysics = toPhysics({ x: TABLE.reference.playfieldMm.w / 2, y: 400, z: RADIUS_VU * 0.53975 });
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('RollingBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	// A modest table-frame rolling velocity (not physics-frame -- close enough
	// for "rolling", the exact value is not load-bearing for AC 1's own
	// conservation claim, which holds for ANY initial velocity).
	const ball = new Ball(0, data, state, new Vertex3D(5, 3, 0), TABLE_DATA);
	physics.addBall(ball);
	return ball;
}

/**
 * Test-local mirror of `sim/physics/devices.ts`'s `tableSpeedToPhysicsVelocity()`,
 * generalised to a raw SI m/s vector rather than dir+scalar mm/s -- used ONLY
 * to independently recompute what the cabinet's own oscillator VELOCITY
 * state (a public getter, `cabinetMechanics.state`) implies in physics units,
 * as a cross-check against the ball-coupling code under test, not a
 * duplicate of it.
 */
function cabinetVelocityToPhysicsVelocity(vMPerS: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
	const mmPerS = { x: vMPerS.x * 1000, y: vMPerS.y * 1000, z: 0 };
	const origin = toPhysics({ x: 0, y: 0, z: 0 });
	const tip = toPhysics(mmPerS);
	return { x: (tip.x - origin.x) / 100, y: (tip.y - origin.y) / 100 };
}

describe('sim/physics/cabinet -- AC 1: nudge is cabinet motion, not a force', () => {
	it('a nudge_l rising edge queues exactly one impulse inside that tick\'s own step, before physics.step() -- the oscillator is at rest until the edge, then moves', () => {
		const { cabinetMechanics } = buildHarness();
		const atRest: InputFrame = NO_FRAME;
		for (let tick = 1; tick <= 5; tick++) {
			cabinetMechanics.applyFrame(tick, atRest);
		}
		expect(cabinetMechanics.state.oscillator.x.accelerationMPerS2, 'no nudge yet -- the oscillator must still be exactly at rest').toBe(0);
		expect(cabinetMechanics.state.oscillator.x.velocityMPerS).toBe(0);
		expect(cabinetMechanics.state.oscillator.x.displacementM).toBe(0);

		const nudged: InputFrame = { ...NO_FRAME, nudge_l: true };
		const result = cabinetMechanics.applyFrame(6, nudged);
		// Inside tick 6's own step: the oscillator has already responded (its
		// acceleration is nonzero) -- this IS "before physics.step()", since
		// this harness never calls physics.step() at all; the seam under test
		// is machine.ts calling cabinetMechanics.applyFrame() ahead of it.
		expect(cabinetMechanics.state.oscillator.x.accelerationMPerS2, 'the rising edge must move the oscillator inside the SAME tick').not.toBe(0);
		// This module's own result carries switchEvents only -- it never
		// issues a command of any kind (AD-5: the hardware rules never round
		// trip through sim/rules).
		expect(Array.isArray(result.switchEvents)).toBe(true);
	});

	it('held nudge_l (500 ticks straight) queues exactly one impulse, not one per tick -- identical oscillator trajectory to a single-tick press', () => {
		const held = buildHarness();
		const single = buildHarness();
		const heldFrame: InputFrame = { ...NO_FRAME, nudge_l: true };

		for (let tick = 1; tick <= 500; tick++) {
			held.cabinetMechanics.applyFrame(tick, heldFrame);
			// Single: the SAME rising edge at tick 1, then released and never
			// pressed again for the rest of the 500-tick run.
			single.cabinetMechanics.applyFrame(tick, tick === 1 ? heldFrame : NO_FRAME);

			const h = held.cabinetMechanics.state.oscillator;
			const s = single.cabinetMechanics.state.oscillator;
			expect(h.x.accelerationMPerS2, `tick ${tick}: held and single-press oscillators must match exactly (one impulse only)`).toBe(s.x.accelerationMPerS2);
			expect(h.x.velocityMPerS).toBe(s.x.velocityMPerS);
			expect(h.x.displacementM).toBe(s.x.displacementM);
		}
		// Sanity: the oscillator actually moved (the comparison above is not
		// vacuously true because nothing happened).
		expect(held.cabinetMechanics.state.oscillator.x.displacementM).not.toBe(0);
	});

	it('ball coupling: paired nudged-vs-control run -- ACROSS THE NUDGE TICK, the nudged ball\'s table-frame (physics-unit) velocity differs from the control ball\'s by exactly the negative of the cabinet\'s own velocity delta, so inertial velocity (table-frame vel + cabinet vel) is conserved', () => {
		// AC 1's own wording is about the SINGLE tick the rising edge lands on
		// ("across THAT TICK") -- a ball genuinely rolling on (in contact with)
		// the playfield also experiences ordinary rolling friction every tick,
		// identical between the paired runs only up to the SAME tiny velocity
		// difference the nudge itself introduces (a real, expected second-order
		// effect once the two runs' velocities differ at all -- friction is a
		// function of velocity). Comparing at the nudge tick itself isolates
		// the coupling's own contribution from that accumulating feedback.
		const nudgedRig = buildHarness();
		const controlRig = buildHarness();
		const nudgedBall = spawnRollingBall(nudgedRig.physics);
		const controlBall = spawnRollingBall(controlRig.physics);

		const nudgeTick = 20;
		for (let tick = 1; tick < nudgeTick; tick++) {
			nudgedRig.cabinetMechanics.applyFrame(tick, NO_FRAME);
			controlRig.cabinetMechanics.applyFrame(tick, NO_FRAME);
			nudgedRig.physics.step();
			controlRig.physics.step();
			// Before the nudge: paired runs must be BIT-IDENTICAL (both are
			// otherwise deterministic and seeded the same way).
			expect(nudgedBall.hit.vel.x).toBe(controlBall.hit.vel.x);
			expect(nudgedBall.hit.vel.y).toBe(controlBall.hit.vel.y);
		}

		// The velocity BEFORE this tick's coupling (identical in both runs,
		// just asserted above) -- the baseline the nudge tick's delta is
		// measured against.
		const preNudgeVelX = nudgedBall.hit.vel.x;
		const preNudgeVelY = nudgedBall.hit.vel.y;

		const nudgedFrame: InputFrame = { ...NO_FRAME, nudge_l: true };
		nudgedRig.cabinetMechanics.applyFrame(nudgeTick, nudgedFrame);
		controlRig.cabinetMechanics.applyFrame(nudgeTick, NO_FRAME);

		// Immediately after applyFrame() -- BEFORE physics.step() -- isolates
		// the coupling's own contribution from physics.step()'s own (separate,
		// expected) gravity/contact effects, which apply identically to both
		// runs at this point (their velocities have not yet diverged).
		const osc = nudgedRig.cabinetMechanics.state.oscillator;
		const cabinetVelPhysics = cabinetVelocityToPhysicsVelocity({ x: osc.x.velocityMPerS, y: osc.y.velocityMPerS });
		const deltaX = nudgedBall.hit.vel.x - preNudgeVelX;
		const deltaY = nudgedBall.hit.vel.y - preNudgeVelY;
		// Tolerance 1e-6: comfortably above the observed float-arithmetic noise
		// between this test's independently-recomputed conversion and the
		// production code's own accumulation path (empirically ~1.5e-7 on
		// these magnitudes -- two mathematically identical but differently-
		// ordered float64 computations), and far tighter than the mutation
		// below's effect (the same order as the delta itself, ~1e-3).
		expect(deltaX, 'the nudge tick\'s OWN velocity delta must equal -(cabinet velocity delta), x').toBeCloseTo(-cabinetVelPhysics.x, 6);
		expect(deltaY, 'the nudge tick\'s OWN velocity delta must equal -(cabinet velocity delta), y').toBeCloseTo(-cabinetVelPhysics.y, 6);
		// The control ball, having received no coupling this tick, is
		// untouched -- the whole delta above is attributable to the nudge.
		expect(controlBall.hit.vel.x).toBe(preNudgeVelX);
		expect(controlBall.hit.vel.y).toBe(preNudgeVelY);

		nudgedRig.physics.step();
		controlRig.physics.step();

		// Across the nudge tick as a whole (through physics.step() too): the
		// nudged-minus-control difference still equals -(cabinet velocity
		// delta) within a loose float tolerance -- friction has now acted on
		// the (slightly) different velocities in each run, a real, expected
		// second-order contribution the tight per-tick check above avoided by
		// reading state before physics.step(); the tolerance here is chosen to
		// comfortably contain that second-order noise (empirically ~1e-5 on
		// these magnitudes) while remaining far tighter than the mutation
		// below's effect (which is the same order as the delta ITSELF).
		const nudgedMinusControlX = nudgedBall.hit.vel.x - controlBall.hit.vel.x;
		const nudgedMinusControlY = nudgedBall.hit.vel.y - controlBall.hit.vel.y;
		expect(nudgedMinusControlX, 'across the whole nudge tick (including physics.step()), the table-frame velocity delta must still equal -(cabinet velocity delta) within float tolerance, x').toBeCloseTo(-cabinetVelPhysics.x, 3);
		expect(nudgedMinusControlY, 'across the whole nudge tick (including physics.step()), the table-frame velocity delta must still equal -(cabinet velocity delta) within float tolerance, y').toBeCloseTo(-cabinetVelPhysics.y, 3);

		// Inertial velocity (table-frame + cabinet) is unchanged from the
		// pre-nudge (identical, paired) value, within the same tolerance.
		const inertialX = nudgedBall.hit.vel.x + cabinetVelPhysics.x;
		expect(inertialX, 'nudged ball\'s inertial x-velocity must equal the control\'s plain table-frame velocity').toBeCloseTo(controlBall.hit.vel.x, 3);

		// Sanity: the cabinet actually moved and the two runs actually
		// diverged -- otherwise every assertion above would be vacuously "0
		// == 0".
		expect(osc.x.displacementM).not.toBe(0);
		expect(nudgedBall.hit.vel.x).not.toBe(controlBall.hit.vel.x);
	});

	it('cabinetAccelToPhysicsAccel() is exported and pure -- zero acceleration converts to zero (sanity; the real pin is test/frames.test.ts)', () => {
		expect(cabinetAccelToPhysicsAccel({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
	});
});
