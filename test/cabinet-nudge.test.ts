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
		// trip through sim/rules), which `CabinetMechanicsResult` enforces
		// structurally by having no command field at all.
		// Code review 2026-08-29: this previously asserted
		// `Array.isArray(result.switchEvents)`, which the interface's own type
		// already guarantees -- it could not fail for any implementation. The
		// real, falsifiable claim on this tick is that a single nudge rising
		// edge emits NO switch edge: one ordinary nudge does not reach the
		// bob's threshold, and one edge is short of slamNudgesPerWindow.
		expect(result.switchEvents, 'a lone nudge rising edge crosses neither sensor, so this tick emits no switch edge').toEqual([]);
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

// QA audit (2026-08-29): ledger DW-83, both halves.
// (1) "AC 1's ball-coupling conservation test only exercises the X axis
//     end-to-end -- the Y axis's sign flip is checked only by the
//     standalone unit-conversion test in test/frames.test.ts, never through
//     the real coupling code the way X is." Fixed by the first test below,
//     mirroring the X-axis test above exactly (paired nudged-vs-control,
//     measured before physics.step()), for nudge_up instead of nudge_l.
// (2) "No test exercises two nudge actions with rising edges on the same
//     tick (e.g. a diagonal ArrowLeft+ArrowUp nudge...)." Fixed (partially;
//     the slam side is covered separately in test/cabinet-slam.test.ts) by
//     the second test below.
// Both were cheap to add on top of AC 1's existing harness and assertion
// shape, per this story's own QA priority list; neither replaces DW-83's
// remaining routed scope for Story 1.8 (a broader multi-nudge/replay sweep).
describe('sim/physics/cabinet -- DW-83 partial coverage: Y-axis end-to-end coupling and same-tick multi-nudge', () => {
	it('DW-83(1): ball coupling on the Y AXIS (nudge_up), through the REAL coupling code end-to-end -- paired nudged-vs-control run, the same shape as AC 1\'s X-axis test above', () => {
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
			expect(nudgedBall.hit.vel.y).toBe(controlBall.hit.vel.y);
		}

		const preNudgeVelX = nudgedBall.hit.vel.x;
		const preNudgeVelY = nudgedBall.hit.vel.y;

		const nudgedFrame: InputFrame = { ...NO_FRAME, nudge_up: true };
		nudgedRig.cabinetMechanics.applyFrame(nudgeTick, nudgedFrame);
		controlRig.cabinetMechanics.applyFrame(nudgeTick, NO_FRAME);

		const osc = nudgedRig.cabinetMechanics.state.oscillator;
		const cabinetVelPhysics = cabinetVelocityToPhysicsVelocity({ x: osc.x.velocityMPerS, y: osc.y.velocityMPerS });
		const deltaX = nudgedBall.hit.vel.x - preNudgeVelX;
		const deltaY = nudgedBall.hit.vel.y - preNudgeVelY;

		expect(deltaY, 'nudge_up\'s own Y-axis velocity delta must equal -(cabinet Y velocity delta), through the REAL coupling code (not the standalone frames.test.ts unit conversion)').toBeCloseTo(-cabinetVelPhysics.y, 6);
		// nudge_up is a pure Y-direction nudge (NUDGE_DIRECTIONS.nudge_up = {x:0, y:-1}) -- the X axis oscillator was never disturbed, so this tick's coupling must leave the ball's X velocity untouched, exactly.
		expect(deltaX, 'a pure Y-direction nudge must not perturb the X axis').toBe(0);
		expect(controlBall.hit.vel.y, 'the control ball, having received no coupling this tick, is untouched').toBe(preNudgeVelY);

		// Sanity: the cabinet actually moved along Y, or every assertion above is vacuously "0 == 0".
		expect(osc.y.displacementM, 'the Y oscillator must actually have moved').not.toBe(0);
		expect(cabinetVelPhysics.y).not.toBe(0);
		expect(deltaY).not.toBe(0);
	});

	it('DW-83(2): same-tick multi-nudge -- nudge_l AND nudge_up rising on the SAME tick (a diagonal nudge) each independently queue their own impulse, and BOTH axes couple correctly to the ball within that one tick', () => {
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
		}
		const preNudgeVelX = nudgedBall.hit.vel.x;
		const preNudgeVelY = nudgedBall.hit.vel.y;

		// BOTH nudge_l and nudge_up rise on the SAME tick -- the exact scenario DW-83 names.
		const diagonalFrame: InputFrame = { ...NO_FRAME, nudge_l: true, nudge_up: true };
		nudgedRig.cabinetMechanics.applyFrame(nudgeTick, diagonalFrame);
		controlRig.cabinetMechanics.applyFrame(nudgeTick, NO_FRAME);

		const osc = nudgedRig.cabinetMechanics.state.oscillator;
		const cabinetVelPhysics = cabinetVelocityToPhysicsVelocity({ x: osc.x.velocityMPerS, y: osc.y.velocityMPerS });
		const deltaX = nudgedBall.hit.vel.x - preNudgeVelX;
		const deltaY = nudgedBall.hit.vel.y - preNudgeVelY;

		expect(deltaX, 'the diagonal nudge\'s X-axis delta must equal -(cabinet X velocity delta) -- proves nudge_l\'s impulse was queued even though nudge_up rose in the SAME tick').toBeCloseTo(-cabinetVelPhysics.x, 6);
		expect(deltaY, 'the diagonal nudge\'s Y-axis delta must equal -(cabinet Y velocity delta) -- proves nudge_up\'s impulse was ALSO queued in the same tick, not dropped or overwritten by nudge_l\'s').toBeCloseTo(-cabinetVelPhysics.y, 6);

		// Sanity: BOTH axes actually moved -- if only one action's impulse had
		// been queued (a same-tick edge-cap regression), one of these would be
		// exactly 0 instead of matching a nonzero cabinet delta.
		expect(osc.x.displacementM, 'X axis must have moved (nudge_l\'s impulse)').not.toBe(0);
		expect(osc.y.displacementM, 'Y axis must have moved (nudge_up\'s impulse)').not.toBe(0);
		expect(controlBall.hit.vel.x).toBe(preNudgeVelX);
		expect(controlBall.hit.vel.y).toBe(preNudgeVelY);
	});
});

describe('sim/physics/cabinet -- NUDGE_DIRECTIONS: which action pushes the cabinet which way (absolute, not self-consistent)', () => {
	// Code review 2026-08-29: `NUDGE_DIRECTIONS` is the one part of this
	// module its own header calls out as AUTHORED rather than transcribed --
	// "no authorized vpinball/vpinball file states its own core-script
	// angle-to-action mapping" -- and before this test it had no test at all.
	//
	// Every pre-existing X-axis assertion in this file compares the ball's
	// velocity delta against the cabinet's OWN velocity, both derived from the
	// same oscillator run, so a sign flip moves both sides together and the
	// equality still holds. Measured: flipping `nudge_r` to { x: -1, y: 0 },
	// or swapping `nudge_l` and `nudge_r` outright -- a left nudge that shoves
	// the cabinet right -- left the entire suite green (654 passed). Inverted
	// nudge keys would have reached the browser with only the lead's manual
	// smoke standing between them and the player.
	//
	// The observable here is ABSOLUTE: the cabinet's own SI, table-aligned
	// velocity after one rising edge, read off `state.oscillator`. It is
	// collision-free (no ball is involved), so nothing can mask a sign.
	// Per AC 1 the ball's table-frame velocity moves OPPOSITE to this, which
	// the paired-run tests above already pin -- so pinning the cabinet's
	// absolute direction closes the loop on the ball's absolute direction too.
	function cabinetVelocityAfterOneNudge(action: 'nudge_l' | 'nudge_r' | 'nudge_up') {
		const { cabinetMechanics } = buildHarness();
		cabinetMechanics.applyFrame(1, { ...NO_FRAME, [action]: true } as InputFrame);
		for (let tick = 2; tick <= 12; tick++) {
			cabinetMechanics.applyFrame(tick, NO_FRAME);
		}
		return { x: cabinetMechanics.state.oscillator.x.velocityMPerS, y: cabinetMechanics.state.oscillator.y.velocityMPerS };
	}

	it('nudge_l drives the cabinet along table -X and nudge_r along +X, each with an exactly zero Y component', () => {
		const left = cabinetVelocityAfterOneNudge('nudge_l');
		const right = cabinetVelocityAfterOneNudge('nudge_r');

		expect(left.x, 'nudge_l must push the cabinet along table -X (the ball then drifts +X, to the right)').toBeLessThan(0);
		expect(right.x, 'nudge_r must push the cabinet along table +X (the ball then drifts -X, to the left)').toBeGreaterThan(0);
		// Equal and opposite: the two directions are mirror images, so neither
		// can be silently scaled differently from the other.
		expect(right.x, 'nudge_l and nudge_r must be equal and opposite').toBeCloseTo(-left.x, 12);
		// Axis purity -- an X nudge must not leak into the Y oscillator.
		expect(left.y, 'nudge_l must not move the Y axis at all').toBe(0);
		expect(right.y, 'nudge_r must not move the Y axis at all').toBe(0);
	});

	it('nudge_up drives the cabinet along table -Y, with an exactly zero X component', () => {
		const up = cabinetVelocityAfterOneNudge('nudge_up');
		expect(up.y, "nudge_up must push the cabinet along table -Y (toward the player), so the ball's relative motion shifts +Y, up the playfield").toBeLessThan(0);
		expect(up.x, 'nudge_up must not move the X axis at all').toBe(0);
	});
});
