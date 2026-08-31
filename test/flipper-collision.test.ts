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
import { describe, expect, it, vi } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { buildFlipperConfig } from '../src/sim/physics/flipper/flipper-config';
import { degToRad } from '../src/sim/physics/math/float';
import { FlipperHit } from '../src/sim/physics/flipper/flipper-hit';
import { createDeviceMechanics, type BallStepMovement } from '../src/sim/physics/devices';
import { NO_FRAME } from '../src/sim/loop';
import { TUNING, resolveTuning } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST, PHYS_TOUCH } from '../src/sim/physics/constants';
import { fromPhysics, toPhysics, MM_PER_VU } from '../src/sim/table/frames';
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
	// DW-112: a named diagnostic instead of a bare `!` non-null assertion, so
	// a missing/renamed "l"-side flipper node reports which node was expected
	// rather than an unhelpful "Cannot read properties of undefined".
	const leftFlipper = flippers.find((f) => f.side === 'l');
	if (!leftFlipper) {
		throw new Error('expected a "l"-side flipper (col_flipper_l) in the loaded collision document, found none');
	}
	const leftPivotXMm = leftFlipper.pivotMm.x;
	return { physics, flipperMechanics, leftPivotXMm };
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

const BALL_RADIUS_MM = TABLE.reference.ballMm / 2;
// A resting contact in this solver is not a zero gap: PHYS_TOUCH is the
// separation the ported contact handler maintains and treats as touching
// (src/sim/physics/constants.ts, ported verbatim under AD-15). Measured on
// the committed geometry the cradled ball sits 0.0195 mm off the bat's
// surface -- 0.036 VU, inside PHYS_TOUCH's 0.05 VU. Contact is therefore
// "centre within one ball radius PLUS that solver-defined skin", never a
// hand-picked slack: the alternative this discriminates against (the ball
// resting on col_post_pocket_l with the bat never touching it) is off by
// millimetres, not hundredths.
const CONTACT_TOLERANCE_MM = BALL_RADIUS_MM + PHYS_TOUCH * MM_PER_VU;

/**
 * Story 2.1a (DW-72, DW-77): settles a ball into the left bat's cradle
 * pocket by PHYSICS ALONE -- never placed inside the modelled body. Closes
 * DW-77: the superseded spawn (195, 85) sat ~9 mm inside the tapered
 * capsule (`assertReferenceDimensions()`'s own box y-range, 57.5..82.5,
 * minus the arm's taper at that radius from the pivot), so it measured
 * embedded-ball ejection, never a resting contact.
 *
 * The spawn x (`pivotMm.x + 30`) is derived from the committed geometry --
 * `LoadedFlipper.pivotMm`, not an invented literal -- and lands well inside
 * the wide, physics-measured basin (this story's own planning pass: every
 * drop from `pivotMm.x + 5` through `pivotMm.x + 55` converges on the SAME
 * settled point) that rolls into the pocket the authored `col_guide_outer_l`
 * / `col_post_pocket_l` close at the bat's TIP, not its pivot (`Design
 * Notes`, "Why the pocket closes at the tip, not the pivot" -- the pivot's
 * own `hitCircleBase` is a full circle, angle-invariant, so a pocket that
 * closes there traps a ball regardless of the flipper's actual stroke,
 * which cannot pass AC 2's own negative control). The drop height (`y =
 * 100`) is comfortably clear of the raised bat's own modelled body (whose
 * y-reach, even at its widest near the pivot, stays under 82.5) and clear of
 * every authored guide/post (whose lowest y is `94`).
 *
 * Runs a fixed ARRANGE window, then asserts genuine settling (near-zero
 * drift between two late samples, near-zero speed) BEFORE returning --
 * "if it never settles, the arrange fails loudly rather than measuring
 * free travel" (this story's own I/O matrix). Returns the ball, the tick
 * count already spent (so a caller's own measurement window continues from
 * here), and the settled position every drift measurement is against.
 */
function arrangeCradleBall(
	physics: ReturnType<typeof buildFlipperHarness>['physics'],
	flipperMechanics: ReturnType<typeof buildFlipperHarness>['flipperMechanics'],
	leftPivotXMm: number,
	name: string,
): { ball: Ball; tick: number; settledPos: ReturnType<typeof ballPosMm> } {
	const held: InputFrame = { ...NO_FRAME, flipper_l: true };
	let tick = 0;
	for (let t = 1; t <= 60; t++) {
		tick = t;
		flipperMechanics.applyFrame(t, held, { l: true, r: true });
		physics.step();
	}
	if (flipperMechanics.state.l.angleDeg !== 90) {
		throw new Error(`arrangeCradleBall(): the bat must be fully raised (90 deg) before the ball is placed; measured ${flipperMechanics.state.l.angleDeg}`);
	}

	const xMm = leftPivotXMm + 30;
	const startPosMm = { x: xMm, y: 100, z: RADIUS_VU * 0.53975 };
	const posPhysics = toPhysics(startPosMm);
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState(name, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);

	const ARRANGE_TICKS = 2500;
	const SETTLE_CHECK_LOOKBACK = 500;
	let posAtLookback = ballPosMm(ball);
	for (let i = 1; i <= ARRANGE_TICKS; i++) {
		tick += 1;
		flipperMechanics.applyFrame(tick, held, { l: true, r: true });
		physics.step();
		if (i === ARRANGE_TICKS - SETTLE_CHECK_LOOKBACK) {
			posAtLookback = ballPosMm(ball);
		}
	}
	const settledPos = ballPosMm(ball);
	const settleDrift = Math.hypot(settledPos.x - posAtLookback.x, settledPos.y - posAtLookback.y);
	const settleSpeed = ballSpeed(ball);
	if (settleDrift >= 1 || settleSpeed >= 2) {
		throw new Error(
			`arrangeCradleBall(): the ball never settled within the ${ARRANGE_TICKS}-tick arrange window -- drift over the ` +
			`last ${SETTLE_CHECK_LOOKBACK} ticks was ${settleDrift.toFixed(3)} mm (must be < 1), speed ${settleSpeed.toFixed(3)} ` +
			`(must be < 2). Failing loudly rather than measuring free travel as if it were a resting contact.`,
		);
	}

	return { ball, tick, settledPos };
}

describe('sim/physics/flippers.ts -- collision against the committed geometry (Story 1.6)', () => {
	// --- DW-72 rework (2026-08-29, superseded 2026-08-30 by Story 2.1a): the
	// original amendment bounded "flipper held" to the bat's own 5 s hold
	// plus a 1 s-bounded ball claim, because no pocket geometry existed yet
	// to prove the full 5 s cradle. Story 2.1a authors that geometry (the
	// drain triangle's tip-side guide and post) and this describe block's
	// "(b)" tests now prove the AMENDED AC 2 in full -- see this story's spec
	// Design Notes, "Why the pocket closes at the tip, not the pivot".

	// The true committed end-of-stroke angle for the left flipper (90 deg,
	// independently pinned by test/flipper-mover.test.ts:83). Both angle
	// tests below compare against this single external value rather than a
	// self-derived one, so a regression that converges to a stable BUT WRONG
	// angle under ball load is not indistinguishable from a correct one.
	const END_OF_STROKE_ANGLE_DEG = 90;

	it('(a) the bat reaches its end-of-stroke angle and holds it, unmoving and without oscillating, for the full 5 s (5000 ticks) hold', () => {
		const { physics, flipperMechanics } = buildFlipperHarness();
		const held: InputFrame = { ...NO_FRAME, flipper_l: true };

		// A ball is spawned in contact with the bat at t = 0. It is thrown
		// clear by the rising bat within ~40 ticks and never returns, so the
		// load is TRANSIENT -- it is not "pressing against the bat
		// throughout", which is what this comment claimed until code review
		// on 2026-08-31 measured it through this same harness: t=50
		// (205.90, 136.28), t=100 (220.97, 232.53), t=500 (196.95, 745.48),
		// t=5000 (213.20, -1674.14) -- and buildFlipperHarness() deliberately
		// has no createDeviceMechanics, so a departed ball free-falls forever
		// rather than parking. Nothing below asserts the ball at all, and its
		// own measured angular contribution (~0.00015 deg) is two orders of
		// magnitude under the 0.01 deg bound, so what this test genuinely
		// pins is the BAT-ANGLE claim, with a brief contact perturbation at
		// the start of the stroke. The sustained, genuinely loaded cradle is
		// "(b)" below, which settles its ball by physics and asserts contact,
		// drift, speed and the trough observable directly (DW-77, DW-110).
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

	// Story 2.1a rework (DW-72, DW-77): the drain triangle's own guide and
	// posts close the cradle pocket at the bat's tip (Design Notes, "Why the
	// pocket closes at the tip, not the pivot"), so the AMENDED AC 2 (the
	// full 5 s hold, `epics.md:847-850`) is provable at last -- the 1 s bound
	// this describe block used to carry (Story 1.6's own amendment, when no
	// pocket existed yet) is superseded, not merely widened. Built with
	// `createDeviceMechanics` (unlike `buildFlipperHarness()` above) so a
	// departing ball has somewhere real to go, and `bd_trough`'s own slot
	// state is a first-class observable, not merely "the ball moved".
	function buildCradleHarness() {
		const { physics, flippers, switchZones, devices } = loadCollision(loadDoc());
		physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
		const tuning = resolveTuning();
		const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
		let nextBallId = 1;
		const deviceMechanics = createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextBallId++ });
		// bd_trough starts full (AD-6: "4 balls, asserted at boot") -- empty
		// one slot so a departing ball has somewhere to park, then remove the
		// spawned ball that eject produces so this test's own single ball is
		// the only one in play (mirrors the DW-60 describe block below).
		deviceMechanics.applyCommands(0, [{ coil: 'c_trough_eject' }]);
		for (const spawned of [...physics.balls]) {
			physics.removeBall(spawned);
		}
		// DW-112: named diagnostic, see buildFlipperHarness() above.
		const leftFlipper = flippers.find((f) => f.side === 'l');
		if (!leftFlipper) {
			throw new Error('expected a "l"-side flipper (col_flipper_l) in the loaded collision document, found none');
		}
		const leftPivotXMm = leftFlipper.pivotMm.x;
		return { physics, flipperMechanics, deviceMechanics, leftPivotXMm, leftConfig: buildFlipperConfig(leftFlipper, tuning) };
	}

	/**
	 * Code review 2026-08-31 (DW-110): AC 2 says "still in contact with the
	 * bat", and the shipped test asserted that through a drift/speed proxy
	 * alone. The ledger's proposed remedy -- surfacing the ported
	 * `FlipperMover.isInContact` through `FlipperMechanics` -- does NOT
	 * answer this question: that flag means the BAT is resting against its
	 * own end-of-stroke STOPPER (`flipper-mover.ts`'s own "resolve contacts
	 * with stoppers" block, set true whenever the angle is pinned at
	 * angleMin/angleMax with torque pushing into it), and is true for a
	 * raised bat with no ball anywhere near it. Surfacing it would have
	 * produced a confidently green assertion about a different fact.
	 *
	 * The observable AC 2 actually names is geometric, and the modelled body
	 * is fully derived from values already in scope: a tapered capsule from
	 * `center` (radius `baseRadius`) to the tip centre at
	 * `center + flipperRadius * (sin a, -cos a)` (radius `endRadius`). For
	 * two circles of radii rb, re a distance L apart, the external tangent
	 * line's distance from the axis point at parameter t is EXACTLY
	 * `lerp(rb, re, t)`, so sampling the axis and comparing against that
	 * lerp measures the true distance from the ball centre to the body's
	 * surface -- caps included. Returns that distance in table mm; "in
	 * contact" is it being within one ball radius.
	 *
	 * This is what discriminates the case the negative control cannot: a
	 * ball resting on `col_post_pocket_l` / `col_guide_outer_l` with the
	 * raised bat merely closing the escape path but never touching it would
	 * drift ~0 while held (the shipped positive assertions) AND drain when
	 * released (the negative control), yet AC 2's contact clause would be
	 * false.
	 */
	function distanceToBatBodyMm(config: ReturnType<typeof buildFlipperConfig>, angleDeg: number, ballMm: { x: number; y: number }): number {
		const angleRad = degToRad(angleDeg);
		const centerMm = fromPhysics({ x: config.center.x, y: config.center.y, z: 0 });
		const tipMm = fromPhysics({
			x: config.center.x + config.flipperRadius * Math.sin(angleRad),
			y: config.center.y - config.flipperRadius * Math.cos(angleRad),
			z: 0,
		});
		const baseRadiusMm = config.baseRadius * MM_PER_VU;
		const endRadiusMm = config.endRadius * MM_PER_VU;
		let minSurfaceDistanceMm = Infinity;
		const SAMPLES = 200;
		for (let i = 0; i <= SAMPLES; i++) {
			const t = i / SAMPLES;
			const axisX = centerMm.x + (tipMm.x - centerMm.x) * t;
			const axisY = centerMm.y + (tipMm.y - centerMm.y) * t;
			const radiusAtTMm = baseRadiusMm + (endRadiusMm - baseRadiusMm) * t;
			minSurfaceDistanceMm = Math.min(minSurfaceDistanceMm, Math.hypot(ballMm.x - axisX, ballMm.y - axisY) - radiusAtTMm);
		}
		return minSurfaceDistanceMm;
	}

	it('(b) AC 2: a ball the physics settles into the cradle pocket by itself stays in contact through a full 5 s (5000 ticks) hold, drift under one ball radius, at rest, and no bd_trough slot closes', () => {
		const { physics, flipperMechanics, deviceMechanics, leftPivotXMm, leftConfig } = buildCradleHarness();
		const held: InputFrame = { ...NO_FRAME, flipper_l: true };

		const { ball, tick: arrangedTick, settledPos } = arrangeCradleBall(physics, flipperMechanics, leftPivotXMm, 'CradleBall');
		const closedSlotsBeforeHold = deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length;

		let tick = arrangedTick;
		let maxDriftMm = 0;
		let driftAtFiveSeconds = 0;
		let speedAtFiveSeconds = 0;
		let batSurfaceGapAtFiveSecondsMm = Infinity;
		let maxBatSurfaceGapMm = -Infinity;
		for (let i = 1; i <= 5000; i++) {
			tick += 1;
			flipperMechanics.applyFrame(tick, held, { l: true, r: true });
			const beforeMm = ballPosMm(ball);
			physics.step();
			const pos = ballPosMm(ball);
			// Code review 2026-08-31: the hold loop must run the SAME device
			// pipeline the negative control below runs, or `bd_trough`'s slot
			// state and `physics.balls` cannot change no matter what the ball
			// does -- and the two trough assertions at the end of this test
			// would be structurally unable to fail (Rule 19). `detectEntries`
			// is what parks a ball that reaches the trough; without it the
			// "no slot may close" claim is asserted against a pipeline that
			// was never given the chance to close one.
			if (physics.balls.includes(ball)) {
				deviceMechanics.detectEntries(tick, [{ ball, beforeMm, afterMm: pos } satisfies BallStepMovement]);
			}
			const driftMm = Math.hypot(pos.x - settledPos.x, pos.y - settledPos.y);
			maxDriftMm = Math.max(maxDriftMm, driftMm);
			const gapMm = distanceToBatBodyMm(leftConfig, flipperMechanics.state.l.angleDeg, pos);
			maxBatSurfaceGapMm = Math.max(maxBatSurfaceGapMm, gapMm);
			if (i === 5000) {
				driftAtFiveSeconds = driftMm;
				speedAtFiveSeconds = ballSpeed(ball);
				batSurfaceGapAtFiveSecondsMm = gapMm;
			}
		}

		// "Still in contact with the bat": the ball stayed near its settled
		// position and near-zero speed for the FULL 5 s under active gravity
		// -- if it had lost contact it would have kept moving (either falling
		// through, or accelerating away), which the drift/speed bounds below
		// would catch. Measured on the committed geometry: max drift over the
		// whole hold stays under 0.2 mm, two orders of magnitude inside the
		// one-ball-radius bound AC 2 states.
		expect(maxDriftMm, `drift from the settled position must stay under one ball radius (${BALL_RADIUS_MM} mm) for the whole 5 s hold`).toBeLessThan(BALL_RADIUS_MM);
		expect(driftAtFiveSeconds, 'drift specifically AT 5 s must stay under one ball radius').toBeLessThan(BALL_RADIUS_MM);
		expect(speedAtFiveSeconds, 'the ball must be at rest at 5 s').toBeLessThan(2);
		// AC 2's "still in contact with the bat", asserted DIRECTLY against
		// the modelled body rather than inferred from drift and speed
		// (DW-110; see distanceToBatBodyMm()'s own comment for why the
		// ported mover's `isInContact` flag does not answer this).
		expect(
			batSurfaceGapAtFiveSecondsMm,
			`at 5 s the ball must still be touching the bat: its centre must lie within one ball radius plus PHYS_TOUCH (${CONTACT_TOLERANCE_MM.toFixed(4)} mm) of the modelled body's surface, measured ${batSurfaceGapAtFiveSecondsMm.toFixed(4)} mm`,
		).toBeLessThanOrEqual(CONTACT_TOLERANCE_MM);
		// ...and the ball never breaks away at any point in between. AC 2
		// itself only names the 5 s checkpoint, so this continuous claim is
		// bounded by the resting contact's own measured jitter rather than
		// by PHYS_TOUCH: a solver resting contact ripples by hundredths of a
		// millimetre (measured worst case across the whole 5000-tick hold:
		// 0.0349 mm of separation), while the failure this discriminates --
		// the ball resting on col_post_pocket_l / col_guide_outer_l with the
		// raised bat merely closing the escape path and never touching it --
		// is off by MILLIMETRES. 0.1 mm sits between the two by two orders
		// of magnitude on the far side and three on the near side.
		const maxSeparationMm = maxBatSurfaceGapMm - BALL_RADIUS_MM;
		expect(
			maxSeparationMm,
			`contact with the bat must never be lost during the hold; worst-case separation between the ball's surface and the bat's was ${maxSeparationMm.toFixed(4)} mm`,
		).toBeLessThan(0.1);
		expect(physics.balls, 'the ball must still be simulated -- not parked or despawned').toContain(ball);
		expect(
			deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length,
			'no bd_trough slot may close during the held hold -- the ball never reached the drain',
		).toBe(closedSlotsBeforeHold);
	});

	it('(b, discriminating negative) the SAME arrangement, released instead of held, reaches bd_trough -- proving the 5 s hold above is produced by the guide AND the flipper together, not by the guide alone', () => {
		const { physics, flipperMechanics, deviceMechanics, leftPivotXMm } = buildCradleHarness();
		const { ball, tick: arrangedTick } = arrangeCradleBall(physics, flipperMechanics, leftPivotXMm, 'CradleBallReleased');

		const released: InputFrame = NO_FRAME;
		let tick = arrangedTick;
		let drained = false;
		for (let i = 1; i <= 8000 && !drained; i++) {
			tick += 1;
			flipperMechanics.applyFrame(tick, released, { l: true, r: true });
			const beforeMm = ballPosMm(ball);
			physics.step();
			if (!physics.balls.includes(ball)) {
				drained = true;
				break;
			}
			const afterMm = ballPosMm(ball);
			deviceMechanics.detectEntries(tick, [{ ball, beforeMm, afterMm } satisfies BallStepMovement]);
			if (!physics.balls.includes(ball)) {
				drained = true;
			}
		}

		expect(drained, 'releasing the flipper key must let the cradled ball reach bd_trough within a generous window -- proving the pocket is held-dependent, not a permanent trap the static guide alone would form').toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough, 'the departed ball must actually PARK, not merely leave its resting spot').toEqual([true, true, true, true]);
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

describe('sim/physics/flippers.ts -- TUNING.materials.flipper_rubber actually reaches both FlipperHit shapes (Fix Pack 27a)', () => {
	// Code review finding: `test/collision-loader.test.ts` removed both
	// flipper-box material assertions AND the discriminating
	// `rubber.elasticity !== plain.elasticity` guard, pointing at THIS file
	// as the replacement pin -- which, until this test, contained no
	// assertion on elasticity, falloff, friction or scatter at all. Deleting
	// `flippers.ts`'s `setElasticity()`/`setFriction()`/`setScatter()` calls
	// left the whole suite green. This test spies on `FlipperHit.prototype`
	// directly -- the exact object `buildSideRig()` calls the three setters
	// on -- so removing any one of them fails it.
	it('applies flipper_rubber elasticity/falloff/friction/scatter to BOTH sides, not the VPX default material', () => {
		const elasticitySpy = vi.spyOn(FlipperHit.prototype, 'setElasticity');
		const frictionSpy = vi.spyOn(FlipperHit.prototype, 'setFriction');
		const scatterSpy = vi.spyOn(FlipperHit.prototype, 'setScatter');

		// Captured BEFORE mockRestore() -- restoring a spy also clears its
		// recorded `.mock.calls` (the same reset mockClear()/mockReset() do),
		// so the calls must be read out first, not after the finally below.
		let elasticityCalls: Array<readonly [number, number | undefined]> = [];
		let frictionCalls: Array<readonly [number]> = [];
		let scatterCalls: Array<readonly [number]> = [];
		try {
			buildFlipperHarness();
			elasticityCalls = elasticitySpy.mock.calls as Array<[number, number | undefined]>;
			frictionCalls = frictionSpy.mock.calls as Array<[number]>;
			scatterCalls = scatterSpy.mock.calls as Array<[number]>;
		} finally {
			elasticitySpy.mockRestore();
			frictionSpy.mockRestore();
			scatterSpy.mockRestore();
		}

		const rubber = TUNING.materials.flipper_rubber;
		const plain = TUNING.materials.default;

		// One call per side (left + right) -- proves BOTH FlipperHits, not
		// just one, were configured.
		expect(elasticityCalls, 'setElasticity() must be called once per flipper side').toHaveLength(2);
		expect(frictionCalls, 'setFriction() must be called once per flipper side').toHaveLength(2);
		expect(scatterCalls, 'setScatter() must be called once per flipper side').toHaveLength(2);

		for (const call of elasticityCalls) {
			expect(call[0]).toBeCloseTo(rubber.elasticity.value, 6);
			expect(call[1]).toBeCloseTo(rubber.elasticityFalloff.value, 6);
		}
		for (const call of frictionCalls) {
			expect(call[0]).toBeCloseTo(rubber.friction.value, 6);
		}
		for (const call of scatterCalls) {
			expect(call[0]).toBeCloseTo(rubber.scatter.value, 6);
		}

		// Discriminating negative: flipper_rubber's elasticity and friction
		// are NOT the plain VPX default's -- a regression that accidentally
		// resolved the flipper's material through the generic
		// `resolveMaterial()`/`materials.default` path instead of the
		// deliberate `TUNING.materials.flipper_rubber` constant would still
		// call the three setters (passing the calls-count checks above) but
		// with the WRONG numbers, which this catches.
		expect(rubber.elasticity.value, 'sanity: flipper_rubber and default must actually differ for this to discriminate anything').not.toBe(plain.elasticity.value);
		expect(rubber.friction.value).not.toBe(plain.friction.value);
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
	const centreX = TABLE.reference.playfieldMm.w / 2; // 257.2

	function runFromCentre(held: boolean, xMm: number = centreX, maxTicks: number = 4000) {
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

		const startPosMm = { x: xMm, y: 200, z: RADIUS_VU * 0.53975 };
		const posPhysics = toPhysics(startPosMm);
		const data = new BallData(RADIUS_VU, 1, 1);
		const state = new BallState('DrainBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
		physics.addBall(ball);

		const frame: InputFrame = held ? { ...NO_FRAME, flipper_l: true, flipper_r: true } : NO_FRAME;

		let drained = false;
		let lastPosMm = startPosMm;
		for (let tick = 1; tick <= maxTicks && !drained; tick++) {
			flipperMechanics.applyFrame(tick, frame, { l: true, r: true });
			const beforeMm = ballPosMm(ball);
			physics.step();
			if (!physics.balls.includes(ball)) {
				// Parked (i.e. drained) by an earlier tick's detectEntries().
				// Code review 2026-08-29 (iteration 2): this used to `break`
				// WITHOUT setting `drained`, so had it ever fired it would have
				// reported a genuine drain as "not drained" -- silently
				// satisfying the held-flipper assertion below and failing the
				// released one. Unreachable today (the loop's own `!drained`
				// condition exits first), but a latent inversion in the pair
				// that closes DW-60.
				drained = true;
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

	// Story 2.1a (DW-78): a ball aimed at the geometric CENTRE (x = 257.2,
	// exactly the midpoint between the two raised bats' now-real tips at
	// 236.875 / 277.525) is no longer a "held blocks it" case at all -- the
	// tip gap the reconciled boxes leave is 40.65 mm, wider than the 26.99 mm
	// ball (this story's own DW-78 fix: the pre-reconciliation modelled body
	// overshot its own box by baseRadius, so a centre-aimed ball used to be
	// caught by that OVERLAP, not by any authored geometry). This is the
	// deliberate consequence the spec's Design Notes name: "widens the tip
	// gap ... to 40.65 mm, which is what makes a centre drain ... mean
	// anything" -- pinned here rather than left as a silent behaviour change.
	it("with a flipper key held, a ball aimed at the EXACT geometric centre still drains -- the reconciled tip gap (40.65 mm) is wider than the ball, unlike the pre-DW-78 body's overlap", () => {
		const { drained, deviceMechanics } = runFromCentre(true, centreX);
		expect(drained, 'the reconciled tip gap must be wide enough for the ball to pass even with both flippers held').toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough).toEqual([true, true, true, true]);
	});

	it('with a flipper key held, a ball aimed at that flipper\'s OWN raised position (inside its box, still within the drain aperture) does not drain -- it is struck instead', () => {
		// x = 220: inside col_flipper_l's raised x-range (157.5 .. 236.875) AND
		// inside the drain aperture sw_trough_1..4 tile (200 .. 314.4), so the
		// RELEASED case (bats drooped to rest, out of this y band entirely)
		// still reaches bd_trough unobstructed -- only the HELD case differs.
		const struck = runFromCentre(true, 220);
		expect(struck.drained, 'a held flipper must block a ball approaching its OWN raised position').toBe(false);

		const released = runFromCentre(false, 220);
		expect(released.drained, 'sanity: the same x, released, must still reach the drain -- discriminating the held case above from a permanently-blocked one').toBe(true);
	});
});
