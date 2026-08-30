// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 2: "given hopControl = 0, when the stress replay of hard
// flipper hits runs, then no ball leaves the playfield surface on any tick.
// Given the default hopControl and the identical stress input, when the same
// replay runs, then the maximum ball height strictly exceeds the zero run's
// max by a named margin, and scatter is still 0 on every material with no
// PRNG drawn in physics." The PAIRED run is what makes this falsifiable
// (spec's own I/O matrix): an absolute "no ball leaves the surface" alone is
// true with no hop mechanism at all -- the same vacuity Story 1.8 fixed with
// a no-flipper control (test/flipper-collision.test.ts's own "at rest"
// case).
//
// Harness: the SAME direct loadCollision() + createFlipperMechanics()
// approach test/flipper-collision.test.ts's "driven bat" case uses (a ball
// placed directly against the bat's face, the flipper released then held),
// with src/sim/physics/hop.ts wired in exactly as src/sim/physics/machine.ts
// wires it -- capture each ball's pre-step velocity, call physics.step(),
// read flipperMechanics.state for the post-step angular velocity, then
// hopMechanics.applyPostStep(). THREE separate hard hits in one continuous
// run (a fresh ball placed and struck three times, each starting from
// released-and-settled so the mover is genuinely mid-stroke -- not merely
// held -- at the moment of contact) stand in for "a stress replay of hard
// flipper hits" -- each one individually measured at ~39.6 VU/T of
// single-tick velocity change against test/flipper-collision.test.ts's own
// "struck" case, well above hop.ts's authored HOP_TRIGGER_DELTA_SPEED (15).
//
// Falsifiability (spec): mutation: clamp the hop impulse to 0
// unconditionally -> the divergence assertion below goes red (while the
// absolute surface bound stays green, which is the point).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { createHopMechanics } from '../src/sim/physics/hop';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { toPhysics, fromPhysics } from '../src/sim/table/frames';
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

/** The glass sits at table z = 400 mm (`public/assets/dragonwar.collision.json`'s `col_glass` node) -- "nothing passes the glass" (I/O matrix) means max z must stay comfortably below it. */
const GLASS_Z_MM = 400;
/** A ball resting on the playfield (no hop) sits at ~ballRadius (13.495 mm), with sub-0.1 mm jitter from ordinary contact settling (measured this pass) -- generous enough to never false-positive on that jitter, tight enough to catch any real hop. */
const CONTACT_EPSILON_MM = 1.0;
/** Measured this pass (see this file's header): a single driven-bat strike produces ~11.9 mm of margin at the shipped default over the zero run. Half that, so the assertion is not brittle against small solver-noise drift while still being a REAL, named margin (never merely `> 0`). */
const NAMED_MARGIN_MM = 5;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function withHopControl(hopControl: number) {
	return resolveTuning({
		...TUNING,
		hopControl: { value: hopControl, source: 'test fixture', confidence: 'unverified' as const },
	});
}

/**
 * Three separate hard flipper strikes in one continuous run -- a ball is
 * placed against the bat's face, the flipper is released long enough for it
 * to return to rest, then held so the driven bat strikes it (identical
 * arrangement to `test/flipper-collision.test.ts`'s "a ball meeting a bat
 * that is being driven up is struck" case), repeated three times. Returns
 * the maximum ball-z (table mm) observed across the WHOLE run.
 */
function runStressReplayOfHardFlipperHits(hopControl: number): number {
	const tuning = withHopControl(hopControl);
	const { physics, flippers } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
	const hopMechanics = createHopMechanics({ tuning });

	let tick = 0;
	let maxZmm = 0;

	function stepOnce(frame: InputFrame): void {
		tick += 1;
		const samples = physics.balls.map((ball) => ({ ball, beforeVel: { x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z } }));
		flipperMechanics.applyFrame(tick, frame, { l: true, r: true });
		physics.step();
		// Real angular velocity, exactly as src/sim/physics/machine.ts reads it
		// AFTER physics.step() -- not the raw frame boolean (hop.ts gates on
		// ACTIVE ROTATION, not merely "coil held"; see its own header).
		const flipperState = flipperMechanics.state;
		hopMechanics.applyPostStep(tick, samples, { l: flipperState.l.angularVelDegPerSec, r: flipperState.r.angularVelDegPerSec });
		for (const ball of physics.balls) {
			const zMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z }).z;
			maxZmm = Math.max(maxZmm, zMm);
		}
	}

	const released: InputFrame = NO_FRAME;
	const held: InputFrame = { ...NO_FRAME, flipper_l: true };

	for (let hit = 0; hit < 3; hit++) {
		// The bat back at rest before the ball is placed.
		for (let t = 0; t < 60; t++) {
			stepOnce(released);
		}
		const posPhysics = toPhysics({ x: 210, y: 85, z: RADIUS_VU * 0.53975 });
		const data = new BallData(RADIUS_VU, 1, 1);
		const state = new BallState(`StruckBall${hit}`, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(hit, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		physics.addBall(ball);
		for (let t = 0; t < 30; t++) {
			stepOnce(released);
		}
		// The strike, plus enough follow-through ticks to observe the hop's peak.
		for (let t = 0; t < 400; t++) {
			stepOnce(held);
		}
		// Clear the struck ball before the next hit so it cannot re-contribute
		// (its own post-strike trajectory carries no further useful signal, and
		// leaving it in play would eventually let it interfere with the next
		// hit's placement).
		for (const b of [...physics.balls]) {
			physics.removeBall(b);
		}
	}

	return maxZmm;
}

describe('src/sim/physics/hop.ts -- AC 2, the paired hopControl=0-vs-default stress replay', () => {
	it('hopControl = 0: no ball\'s z exceeds the playfield surface (+ contact epsilon) on any tick', () => {
		const maxZmm = runStressReplayOfHardFlipperHits(0);
		const restHeightMm = TABLE.reference.ballMm / 2;
		expect(
			maxZmm,
			`max observed ball z (${maxZmm.toFixed(4)} mm) must stay within ${CONTACT_EPSILON_MM} mm of the resting height (${restHeightMm} mm) -- hopControl = 0 must produce EXACTLY zero hops`,
		).toBeLessThanOrEqual(restHeightMm + CONTACT_EPSILON_MM);
	});

	it('the default hopControl produces a max ball height that strictly exceeds the zero run\'s by a named margin, and nothing passes the glass', () => {
		const zeroMaxZmm = runStressReplayOfHardFlipperHits(0);
		const defaultMaxZmm = runStressReplayOfHardFlipperHits(TUNING.hopControl.value);

		expect(TUNING.hopControl.value, 'sanity: the shipped default must actually be nonzero, or this test is not exercising the default at all').toBeGreaterThan(0);
		expect(
			defaultMaxZmm - zeroMaxZmm,
			`the default hopControl's max ball height (${defaultMaxZmm.toFixed(3)} mm) must exceed the zero run's (${zeroMaxZmm.toFixed(3)} mm) by more than the named margin (${NAMED_MARGIN_MM} mm)`,
		).toBeGreaterThan(NAMED_MARGIN_MM);
		expect(defaultMaxZmm, 'nothing may pass the glass (table z = 400 mm)').toBeLessThan(GLASS_Z_MM);
	});

	// Review finding (this pass): a prior version of this file had a test
	// here titled "a mutation that clamps the hop impulse to 0
	// unconditionally reproduces the SAME max height as the true zero run",
	// which ran runStressReplayOfHardFlipperHits(0) TWICE and asserted the
	// two (real, unmutated) results were equal -- guaranteed to pass whether
	// or not the described mutation existed (a real hopControl=0 run and a
	// hypothetically-clamped-to-0 run produce the same output BY
	// CONSTRUCTION), and redundant with the determinism test below. The
	// spec's own `mutation: clamp the hop impulse to 0 unconditionally ->
	// the divergence assertion goes red` already names the REAL pinning
	// test correctly -- it is the divergence assertion immediately above
	// this comment (`defaultMaxZmm - zeroMaxZmm ... toBeGreaterThan
	// (NAMED_MARGIN_MM)`): clamping hop.ts's own `vel.z += hopControl *
	// excess` to `vel.z += 0` collapses `defaultMaxZmm` to `zeroMaxZmm`,
	// which fails that assertion directly. No separate test is needed (or
	// possible without editing hop.ts's own source, which is what "mutation"
	// means here) -- removed rather than left as a vacuous duplicate.

	it('scatter is 0 on every material, and hop.ts draws no PRNG (AD-3) -- the mechanism is deterministic, not emergent', () => {
		expect(TUNING.materials.default.scatter.value).toBe(0);
		expect(TUNING.materials.flipper_rubber.scatter.value).toBe(0);
		const hopSource = readFileSync(path.resolve(__dirname, '..', 'src', 'sim', 'physics', 'hop.ts'), 'utf8');
		expect(hopSource).not.toMatch(/Math\.random/);

		// Determinism, directly: the SAME stress input at the SAME hopControl
		// produces the IDENTICAL max height on repeat runs.
		const first = runStressReplayOfHardFlipperHits(TUNING.hopControl.value);
		const second = runStressReplayOfHardFlipperHits(TUNING.hopControl.value);
		expect(second).toBe(first);
	});

	it('hopControl = 0 is the exact identity regardless of how hard the strike is -- applyPostStep never even reads a sample\'s velocity', () => {
		const hopMechanics = createHopMechanics({ tuning: withHopControl(0) });
		const posPhysics = toPhysics({ x: 210, y: 85, z: RADIUS_VU * 0.53975 });
		const data = new BallData(RADIUS_VU, 1, 1);
		const state = new BallState('ZeroProbe', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		// A deliberately enormous velocity change AND a deliberately fast
		// "rotating" flipper -- if hopControl = 0 were not an exact,
		// unconditional no-op, THIS is the input that would expose it.
		ball.hit.vel.z = 0;
		const beforeVel = { x: 0, y: 0, z: -500 };
		hopMechanics.applyPostStep(1, [{ ball, beforeVel }], { l: 500, r: 0 });
		expect(ball.hit.vel.z).toBe(0);
	});

	it('a NEGATIVE hopControl is the same unconditional no-op -- the `hopControl <= 0` short-circuit, not arithmetic, is what makes it one', () => {
		// Review finding, this pass (Rule 19). The test above asserts
		// `vel.z === 0` after a run at hopControl = 0, which stays GREEN with
		// the `hopControl <= 0 ||` short-circuit deleted: without the guard the
		// loop simply computes `vel.z += 0 * excess`, which is still 0. So it
		// did not test the guard its own title names ("applyPostStep never even
		// reads a sample's velocity"). A NEGATIVE hopControl distinguishes them:
		// with the guard it is an exact no-op, and without it the same input
		// SUBTRACTS `|hopControl| * excess` from vel.z. Negative is reachable --
		// the dev tuning panel enumerates hopControl as an ordinary editable
		// numeric row.
		//
		// mutation: delete the `hopControl <= 0 ||` term from hop.ts's
		// applyPostStep() short-circuit -> this test goes red (vel.z goes
		// strongly negative), while the hopControl = 0 test above stays green.
		const hopMechanics = createHopMechanics({ tuning: withHopControl(-1) });
		const posPhysics = toPhysics({ x: 210, y: 85, z: RADIUS_VU * 0.53975 });
		const data = new BallData(RADIUS_VU, 1, 1);
		const state = new BallState('NegativeProbe', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		ball.hit.vel.z = 0;
		const beforeVel = { x: 0, y: 0, z: -500 };
		hopMechanics.applyPostStep(1, [{ ball, beforeVel }], { l: 500, r: 0 });
		expect(ball.hit.vel.z, 'a negative hopControl must be short-circuited, never applied as a downward impulse').toBe(0);
	});

	it('HOP_COOLDOWN_TICKS (200): a SECOND qualifying strike on the SAME ball within the cooldown window does NOT re-hop, but a strike after the cooldown expires does', () => {
		// Review finding, this pass: runStressReplayOfHardFlipperHits() places a
		// FRESH Ball for each of its three hits (removing the previous one
		// first), so the per-ball WeakMap cooldown this file's header describes
		// ("a hop that lands the ball back onto the bat while it is STILL
		// actively rotating... could itself register as a fresh large delta
		// and re-trigger without limit") was never actually exercised by any
		// test -- exactly the class of unbounded-feedback bug this story's own
		// Spec Change Log already found and fixed once for roll-and-drain (via
		// the active-rotation gate, a DIFFERENT guard). This test drives the
		// SAME ball through two qualifying strikes inside the 200-tick window,
		// then a third after it expires.
		const hopMechanics = createHopMechanics({ tuning: withHopControl(TUNING.hopControl.value) });
		const posPhysics = toPhysics({ x: 210, y: 85, z: RADIUS_VU * 0.53975 });
		const data = new BallData(RADIUS_VU, 1, 1);
		const state = new BallState('CooldownProbe', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		const qualifyingBeforeVel = { x: 0, y: 0, z: -500 };
		const rotating = { l: 500, r: 0 };

		ball.hit.vel.z = -500 + 40; // a genuine deltaSpeed of 40 VU/T, well above HOP_TRIGGER_DELTA_SPEED (15)
		hopMechanics.applyPostStep(1, [{ ball, beforeVel: qualifyingBeforeVel }], rotating);
		const afterFirstHop = ball.hit.vel.z;
		expect(afterFirstHop, 'the first qualifying strike must actually hop').toBeGreaterThan(-500 + 40);

		// A SECOND qualifying strike 50 ticks later (well inside the 200-tick
		// cooldown) -- reset the ball's velocity to another genuinely
		// qualifying delta first, so a failure to suppress would be visible.
		ball.hit.vel.z = -500 + 40;
		hopMechanics.applyPostStep(50, [{ ball, beforeVel: qualifyingBeforeVel }], rotating);
		expect(ball.hit.vel.z, 'a second qualifying strike inside the cooldown window must NOT add a further hop impulse').toBe(-500 + 40);

		// A THIRD qualifying strike after the cooldown has expired (tick 1 +
		// 200 = 201, so tick 202 is safely past it) -- this one must hop again.
		ball.hit.vel.z = -500 + 40;
		hopMechanics.applyPostStep(202, [{ ball, beforeVel: qualifyingBeforeVel }], rotating);
		expect(ball.hit.vel.z, 'a qualifying strike AFTER the cooldown expires must hop again').toBeGreaterThan(-500 + 40);
	});
});
