// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1a, tasks 22-23 (DW-119): AC 1 passed on a checklist of node
// names, lane widths, guide ends and post surfaces while the drain triangle
// could not actually route a ball -- both outlanes dead-ended on
// col_wall_bottom_l/_r instead of reaching bd_trough (measured before the
// fix: a ball released in either outlane parked one ball radius above
// y = 0 and never drained). This file pins the BEHAVIOUR the checklist
// cannot see: a ball released in the left outlane, the right outlane, and
// at the centre drain all reach a trough switch zone within a bounded tick
// count (AC 7, plus task 26's full-span sweep, AC 10), and the centre channel
// between the two raised bats' pockets passes a ball without jamming
// regardless of lateral bias (AC 8; task 27 re-arranged the two biased
// releases to spawn clear of col_guide_outer_l/_r's own footprint, the same
// embedded-spawn defect class as DW-77).
//
// Same harness technique as test/flipper-collision.test.ts's own
// runFromCentre() (DW-60): loadCollision() + createFlipperMechanics() +
// createDeviceMechanics() driven by hand, because sim/loop's own createLoop()
// has no "place a ball anywhere" dev hatch (by design -- devices spawn
// balls, AD-6).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { createDeviceMechanics, type BallStepMovement } from '../src/sim/physics/devices';
import { resolveTuning } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { fromPhysics, toPhysics } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { NO_FRAME } from '../src/sim/loop';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

interface CollisionDocForTest {
	nodes: Array<{ name: string; bboxMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }>;
}

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function readCollisionDoc(): CollisionDocForTest {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function nodeBboxMm(name: string) {
	const doc = readCollisionDoc();
	const node = doc.nodes.find((n) => n.name === name);
	if (!node) {
		throw new Error(`nodeBboxMm(): expected a "${name}" node in the committed collision document, found none`);
	}
	return node.bboxMm;
}

function ballPosMm(ball: Ball) {
	return fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
}

/**
 * Releases a ball at (xMm, yMm) with both flipper keys released and drives
 * the real per-tick pipeline (flipper mechanics -> physics.step() ->
 * deviceMechanics.detectEntries()) until it parks in a device or maxTicks
 * elapses. Mirrors test/flipper-collision.test.ts's own runFromCentre()
 * harness, generalised to any release point and reporting the released
 * ball's own maximum lateral (X) drift from its release X, for AC 8.
 */
function releaseBall(xMm: number, yMm: number, maxTicks = 4000) {
	const { physics, flippers, switchZones, devices } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const tuning = resolveTuning();
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
	let nextBallId = 1;
	const deviceMechanics = createDeviceMechanics({ physics, devices, switchZones, tuning, nextBallId: () => nextBallId++ });

	// bd_trough starts with all four slots filled (AD-6: "4 balls, asserted
	// at boot") -- empty one first so a draining ball has somewhere to
	// park, then remove the ball that eject spawns so this test's own
	// released ball is the only one in play.
	deviceMechanics.applyCommands(0, [{ coil: 'c_trough_eject' }]);
	for (const spawned of [...physics.balls]) {
		physics.removeBall(spawned);
	}

	const startPosMm = { x: xMm, y: yMm, z: RADIUS_VU * 0.53975 };
	const posPhysics = toPhysics(startPosMm);
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('RouteBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);

	let drained = false;
	let drainedTick = -1;
	let lastPosMm = startPosMm;
	let maxLateralDriftMm = 0;
	for (let tick = 1; tick <= maxTicks && !drained; tick++) {
		flipperMechanics.applyFrame(tick, NO_FRAME, { l: true, r: true });
		const beforeMm = ballPosMm(ball);
		physics.step();
		if (!physics.balls.includes(ball)) {
			drained = true;
			drainedTick = tick;
			break;
		}
		const afterMm = ballPosMm(ball);
		maxLateralDriftMm = Math.max(maxLateralDriftMm, Math.abs(afterMm.x - xMm));
		const movement: BallStepMovement = { ball, beforeMm, afterMm };
		deviceMechanics.detectEntries(tick, [movement]);
		lastPosMm = afterMm;
		if (!physics.balls.includes(ball)) {
			drained = true;
			drainedTick = tick;
		}
	}
	return { drained, drainedTick, lastPosMm, deviceMechanics, maxLateralDriftMm };
}

describe('drain routing (AC 7, DW-119): every path the drain triangle offers actually drains', () => {
	it('a ball released in the LEFT outlane reaches a trough switch zone within a bounded tick count', () => {
		const bbox = nodeBboxMm('col_guide_divider_l');
		const wallBbox = nodeBboxMm('col_wall_left');
		const midXMm = (wallBbox.max.x + bbox.min.x) / 2; // midpoint of the left outlane's own clear width
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(midXMm, 300);
		expect(drained, `the left-outlane ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, 'the trough must be full again -- the pre-test eject left it at 3/4, so this drained ball must have filled the 4th slot').toBe(4);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the outlane to the trough').toBeGreaterThan(10);
	});

	it('a ball released in the RIGHT outlane reaches a trough switch zone within a bounded tick count', () => {
		const bbox = nodeBboxMm('col_guide_divider_r');
		const wallBbox = nodeBboxMm('col_wall_lane');
		const midXMm = (bbox.max.x + wallBbox.min.x) / 2; // midpoint of the right outlane's own clear width
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(midXMm, 300);
		expect(drained, `the right-outlane ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, 'the trough must be full again -- the pre-test eject left it at 3/4, so this drained ball must have filled the 4th slot').toBe(4);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the outlane to the trough').toBeGreaterThan(10);
	});

	it('a ball released at the CENTRE drain (playfield x-centre, both keys released) reaches a trough switch zone within a bounded tick count', () => {
		const centreX = TABLE.reference.playfieldMm.w / 2;
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(centreX, 200);
		expect(drained, `the centre-drain ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, 'the trough must be full again -- the pre-test eject left it at 3/4, so this drained ball must have filled the 4th slot').toBe(4);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the drain to the trough').toBeGreaterThan(10);
	});
});

/**
 * Every x in [minMm, maxMm], inclusive of neither true endpoint, at
 * roughly `stepMm` spacing, starting `marginMm` inside each end. Used
 * (task 26) to sweep col_wall_bottom_l/_r's own span (about 165 mm on the
 * left, OUTLANE_WIDTH_MM..DRAIN_X0_MM; narrower on the right, bounded by
 * the shooter lane rather than mirroring the left side exactly) rather
 * than sample a handful of points, since AC 7's original three-point
 * routing test passed while the whole span between them was still a dead
 * ledge (DW-119 residual, task 25's own HIGH finding).
 */
function sweepXsMm(minMm: number, maxMm: number, marginMm: number, stepMm: number): number[] {
	const xs: number[] = [];
	for (let x = minMm + marginMm; x <= maxMm - marginMm + 1e-6; x += stepMm) {
		xs.push(Math.round(x * 100) / 100);
	}
	return xs;
}

describe('drain routing (AC 10, DW-119 residual): the FULL bottom span drains, not just three sample points', () => {
	// Task 25 (HIGH) reshaped col_wall_bottom_l/_r's own top edge from a flat
	// face (y = 0 across the whole span) into a ramp sloping toward the drain
	// aperture, because a flat face gives a resting ball zero tangential force
	// under this solver's x-component-free gravity and strands it permanently
	// -- exactly the failure the code review measured at x = 100, 120, 160, 190
	// (left) and x = 330, 380 (right). AC 7's own three release points (outlane
	// midpoint, outlane midpoint, playfield centre) never sampled the ledge
	// between the outlane and the drain aperture at all, so that defect
	// shipped invisibly. This sweeps the ledge itself, not the outlane or the
	// centre channel.
	//
	// The margin below excludes each end of the span, for two different
	// reasons: the outlane-facing end overlaps col_guide_divider_l/_r's own
	// footprint (a real, separate wall a ball released there would spawn
	// embedded in -- the same class of defect this story's own DW-77/AC-8
	// fixes exist to avoid), and that 12 mm sliver is already exercised by
	// the LEFT/RIGHT outlane tests above, which release from the outlane
	// side and traverse it via the below-deck return channel, never by
	// falling straight down onto it. The drain-facing end needs no such
	// justification to be safe to skip -- it sits exactly at the wall's own
	// outer edge, which coincides with DRAIN_X0_MM/DRAIN_X1_MM (the drain
	// aperture's own boundary, see tools/make-placeholder-blend.py), so a
	// release there lands essentially on the aperture itself and drains
	// almost immediately regardless of the ramp; the same margin is applied
	// there purely for symmetry with sweepXsMm's single shared `marginMm`
	// parameter, not because that end is otherwise at risk.
	const dividerWidthMm = nodeBboxMm('col_guide_divider_l').max.x - nodeBboxMm('col_guide_divider_l').min.x; // 12 mm, mirrored on the right
	const SWEEP_MARGIN_MM = dividerWidthMm + 3; // clears the divider guide's own edge with a small buffer
	const SWEEP_STEP_MM = 10;
	const SWEEP_MAX_TICKS = 8000;
	const RELEASE_Y_MM = 300; // matches the LEFT/RIGHT outlane tests above -- comfortably above the wall, comfortably below every nearby guide's own y-span for the x range swept here

	// A release column landing EXACTLY on a flipper's own pivot x (170.0 /
	// 344.4, AC 3) drops the ball dead-centre onto the raised bat's own
	// circular base -- a genuine but unrelated equilibrium (a ball balanced
	// on the very top of a circle, with zero tangential force by construction,
	// same shape as the flat-face defect this sweep exists to catch, but on
	// the FROZEN flipper mover, which this story may not touch, not on
	// col_wall_bottom_l/_r). Verified directly: x = 344.4 (this table's right
	// pivot) never drains in 8000 ticks, while x = 344.0 and x = 344.8 either
	// side of it both drain in well under 3100. Excluded by a narrow band
	// around each pivot rather than skipped by coincidence of the step size.
	const { flippers: pivotFlippers } = loadCollision(loadDoc());
	const pivotXsMm = pivotFlippers.map((f) => f.pivotMm.x);
	const PIVOT_EXCLUDE_MM = 3;
	const excludingPivots = (xs: number[]): number[] => xs.filter((x) => pivotXsMm.every((pivotX) => Math.abs(x - pivotX) > PIVOT_EXCLUDE_MM));

	const leftBbox = nodeBboxMm('col_wall_bottom_l');
	const rightBbox = nodeBboxMm('col_wall_bottom_r');
	const leftXsMm = excludingPivots(sweepXsMm(leftBbox.min.x, leftBbox.max.x, SWEEP_MARGIN_MM, SWEEP_STEP_MM));
	const rightXsMm = excludingPivots(sweepXsMm(rightBbox.min.x, rightBbox.max.x, SWEEP_MARGIN_MM, SWEEP_STEP_MM));

	it('sanity: the sweep actually samples a non-trivial number of points on each side, or the checks below are vacuous', () => {
		expect(leftXsMm.length, `left sweep points: ${JSON.stringify(leftXsMm)}`).toBeGreaterThan(5);
		expect(rightXsMm.length, `right sweep points: ${JSON.stringify(rightXsMm)}`).toBeGreaterThan(5);
	});

	it.each(leftXsMm.map((xMm) => ({ xMm })))('LEFT col_wall_bottom_l: a ball released at x = $xMm mm reaches a trough switch zone within a bounded tick count', ({ xMm }) => {
		const { drained, drainedTick, lastPosMm } = releaseBall(xMm, RELEASE_Y_MM, SWEEP_MAX_TICKS);
		expect(drained, `x = ${xMm} mm never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(drainedTick, `x = ${xMm} mm: sanity, must take a real number of ticks`).toBeGreaterThan(10);
	});

	it.each(rightXsMm.map((xMm) => ({ xMm })))('RIGHT col_wall_bottom_r: a ball released at x = $xMm mm reaches a trough switch zone within a bounded tick count', ({ xMm }) => {
		const { drained, drainedTick, lastPosMm } = releaseBall(xMm, RELEASE_Y_MM, SWEEP_MAX_TICKS);
		expect(drained, `x = ${xMm} mm never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(drainedTick, `x = ${xMm} mm: sanity, must take a real number of ticks`).toBeGreaterThan(10);
	});
});

describe('centre channel (AC 8): the 32.65 mm gap between the two pockets passes a ball without jamming, at the authored width', () => {
	const centreX = TABLE.reference.playfieldMm.w / 2; // 257.2

	it('a CENTRED release traverses the channel with negligible lateral drift and reaches the trough', () => {
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX, 200);
		expect(drained, `the centred ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Measured by the lead before this iteration: 0.00 mm drift, exit at
		// tick 911. Bound kept close to the measurement (review finding,
		// intent-alignment pass: the previous <5 mm bound was 25x looser than
		// the measured 0.00 mm and would not have caught a real narrowing) --
		// still wide enough to absorb genuine solver float noise.
		expect(maxLateralDriftMm, 'a dead-centre release should barely rattle at all').toBeLessThan(2);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the channel to the trough').toBeGreaterThan(10);
	});

	it('a LEFT-biased release still clears the channel (rattles, but does not jam) and reaches the trough', () => {
		// Task 27 (review finding, rework iteration 4): this used to release at
		// y = 200, which is 7.17 mm INSIDE col_guide_outer_l's own footprint
		// (its y-span is 94..420) -- the same embedded-spawn defect class as
		// DW-77, which this story exists to close: the recorded rattle measured
		// the solver ejecting the ball from inside a wall, not a genuine
		// traverse. Re-arranged to release from y = 440, clear of every guide
		// and post footprint here (all end by y = 420).
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX - 10, 440);
		expect(drained, `the left-biased ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Re-measured this pass from the corrected, clear release point: 12.83
		// mm of rattle, exit at tick 1212 -- materially different from the old
		// (embedded-spawn) 12.27 mm figure, confirming that figure included
		// wall-ejection noise. The channel is only 32.65 mm clear, so this also
		// proves the ball never needed more than the authored width -- if a
		// future change narrows the channel enough to increase the rattle
		// materially, this bound (and the drain assertion above it) goes red.
		// The 18 mm ceiling itself is unchanged by this pass's re-measurement:
		// it is a ~1.40x margin over the corrected 12.83 mm figure (previously
		// framed as ~1.5x over the since-superseded, embedded-spawn 12.27 mm
		// figure) -- still comfortably above ordinary run-to-run solver
		// variance while catching a channel narrowed enough to matter.
		expect(maxLateralDriftMm, 'a biased release must still stay within the channel, not vanish sideways').toBeLessThan(18);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the channel to the trough').toBeGreaterThan(10);
	});

	it('a RIGHT-biased release still clears the channel (rattles, but does not jam) and reaches the trough', () => {
		// Task 27: same re-arrangement as the LEFT-biased case above -- y = 200
		// was 7.17 mm inside col_guide_outer_r's own footprint; re-released from
		// y = 440, clear of it.
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX + 10, 440);
		expect(drained, `the right-biased ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Re-measured this pass: 12.83 mm of rattle (symmetric with the
		// LEFT-biased case above, as the geometry is), exit at tick 1212. Same
		// bound as the left-biased case above.
		expect(maxLateralDriftMm, 'a biased release must still stay within the channel, not vanish sideways').toBeLessThan(18);
		expect(drainedTick, 'sanity: must have taken a real, non-trivial number of ticks to travel from the channel to the trough').toBeGreaterThan(10);
	});
});

