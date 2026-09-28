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
import { nodeBboxMm } from './util/collision-doc';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
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
	// CODE REVIEW 2026-08-31 (iteration 4, final pass) -- the shipped form of
	// this sweep got BOTH of its end exclusions wrong, and in the same way
	// task 27 got AC 8's biased releases wrong four lines of spec earlier.
	//
	// (1) `SWEEP_MARGIN_MM` was `dividerWidthMm + 3` = 15 mm, sized to clear
	//     col_guide_divider_l/_r's own FOOTPRINT EDGE -- not to clear it by a
	//     ball radius. At the shipped RELEASE_Y_MM = 300, which is INSIDE
	//     both dividers' y-span (120..420), three of the twenty-two columns
	//     therefore spawned the ball embedded in a solid guide wall:
	//     x = 49.9 was 10.50 mm inside col_guide_divider_l, x = 59.9 0.50 mm
	//     inside it, and x = 409.4 1.40 mm inside col_guide_divider_r
	//     (measured against the committed document; the same arithmetic
	//     reproduces the 7.17 mm figure task 27 condemned for AC 8, so it is
	//     the story's own metric). Those three columns measured the solver
	//     ejecting a ball out of a wall -- an impulse pointing TOWARD the
	//     drain on both sides, so they were biased toward passing -- and not
	//     the ramp at all.
	// (2) The old comment justified skipping that sliver on the ground that
	//     it "is already exercised by the LEFT/RIGHT outlane tests above,
	//     which release from the outlane side and traverse it via the
	//     below-deck return channel." That is false. Those tests release at
	//     x ~ 17.45 and x ~ 450.95 -- outside col_wall_bottom_l/_r's own x
	//     spans entirely -- and fall through the outlane gap onto the
	//     col_channel_* rails. Neither ball ever touches a bottom wall's top
	//     face at any x. The sliver was not exercised anywhere.
	//
	// Both are fixed by releasing each column from a height chosen for that
	// column rather than one height for all of them. The divider guides
	// stand DIRECTLY above the outlane-facing end of each bottom wall, so a
	// column under one of them cannot be dropped from above it at any height
	// -- it would either spawn inside the guide or land on top of it. Those
	// columns are released from BELOW the divider instead (clear of its
	// y-span 120..420 AND of col_post_divider_*_lo's 116..124 by more than a
	// ball radius); every other column keeps the original 300 mm drop, so no
	// column's arrival energy is reduced by this fix. With every column now
	// released clear of every body, the end margin collapses to a small
	// buffer off each wall's own end vertex, and the sweep gains the ~15 mm
	// at each end it used to skip.
	const BALL_RADIUS_MM = TABLE.reference.ballMm / 2;
	const SWEEP_MARGIN_MM = 3; // just off each wall's own end vertex; the divider guides no longer constrain this (see releaseYForXMm below)
	const SWEEP_STEP_MM = 10;
	const SWEEP_MAX_TICKS = 8000;
	const HIGH_RELEASE_Y_MM = 300; // the original drop, kept for every column clear of a divider guide in x
	const LOW_RELEASE_Y_MM = 100; // under col_guide_divider_l/_r (y 120..420) and col_post_divider_*_lo (y 116..124), with the ball's own top at 113.5 mm
	const dividerBboxes = [nodeBboxMm('col_guide_divider_l'), nodeBboxMm('col_guide_divider_r')];
	const releaseYForXMm = (xMm: number): number => {
		const underADivider = dividerBboxes.some(
			(b) => xMm > b.min.x - BALL_RADIUS_MM - 2 && xMm < b.max.x + BALL_RADIUS_MM + 2,
		);
		return underADivider ? LOW_RELEASE_Y_MM : HIGH_RELEASE_Y_MM;
	};

	// A release column landing EXACTLY on a flipper's own pivot x (170.0 /
	// 344.4, AC 3) drops the ball dead-centre onto the bat's own circular
	// base -- a genuine but unrelated equilibrium (a ball balanced on the
	// very top of a circle, with zero tangential force by construction, same
	// shape as the flat-face defect this sweep exists to catch, but on the
	// FROZEN flipper mover, which this story may not touch, not on
	// col_wall_bottom_l/_r). Verified directly: x = 344.4 (this table's right
	// pivot) never drains in 8000 ticks, while x = 344.0 and x = 344.8 either
	// side of it both drain in well under 3100. Excluded by a narrow band
	// around each pivot rather than skipped by coincidence of the step size.
	//
	// CODE REVIEW 2026-08-31 (iteration 4, final pass): the band is read from
	// the LIVE document, so it moves with the pivot -- which means an
	// exclusion nobody bounds could silently absorb the very regression this
	// sweep exists to catch (a dead zone that grew from sub-millimetre to
	// millimetres would simply be skipped). Two things close that. The band
	// is narrowed from 3 mm to 1 mm, which a fresh 0.5 mm-resolution sweep of
	// x = 160..180 and x = 334..354 supports directly: x = 170.0 is the ONLY
	// point in either range that fails to drain in 8000 ticks (it parks at
	// (170.00, 96.00) -- one ball radius above the bat box's own y = 82.5
	// top, i.e. balanced on the base circle, exactly as described above),
	// and 169.5 / 170.5 / 344.0 / 344.5 all drain. And the band's width is
	// now itself asserted, by the paired control cases below.
	const { flippers: pivotFlippers } = loadCollision(loadDoc());
	const pivotXsMm = pivotFlippers.map((f) => f.pivotMm.x);
	const PIVOT_EXCLUDE_MM = 1;
	const excludingPivots = (xs: number[]): number[] => xs.filter((x) => pivotXsMm.every((pivotX) => Math.abs(x - pivotX) > PIVOT_EXCLUDE_MM));
	const pivotControlXsMm = pivotXsMm.flatMap((pivotX) => [pivotX - PIVOT_EXCLUDE_MM, pivotX + PIVOT_EXCLUDE_MM]).map((x) => Math.round(x * 100) / 100);

	const leftBbox = nodeBboxMm('col_wall_bottom_l');
	const rightBbox = nodeBboxMm('col_wall_bottom_r');
	const leftXsMm = excludingPivots(sweepXsMm(leftBbox.min.x, leftBbox.max.x, SWEEP_MARGIN_MM, SWEEP_STEP_MM));
	const rightXsMm = excludingPivots(sweepXsMm(rightBbox.min.x, rightBbox.max.x, SWEEP_MARGIN_MM, SWEEP_STEP_MM));

	it('sanity: the sweep actually samples a non-trivial number of points on each side, or the checks below are vacuous', () => {
		expect(leftXsMm.length, `left sweep points: ${JSON.stringify(leftXsMm)}`).toBeGreaterThan(5);
		expect(rightXsMm.length, `right sweep points: ${JSON.stringify(rightXsMm)}`).toBeGreaterThan(5);
	});

	// CODE REVIEW 2026-08-31 (iteration 4, final pass): these cases used to
	// assert only that the ball left `physics.balls`, while their own titles
	// claim it "reaches a trough switch zone" -- a weaker observable than
	// the three AC 7 cases immediately above, which also assert the trough
	// refilled. Any future ball-removal path that is not a trough entry
	// would have satisfied the sweep and failed AC 7. The trough assertion
	// is now carried here too, so all twenty-odd cases check what they say.
	it.each(leftXsMm.map((xMm) => ({ xMm })))('LEFT col_wall_bottom_l: a ball released at x = $xMm mm reaches a trough switch zone within a bounded tick count', ({ xMm }) => {
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(xMm, releaseYForXMm(xMm), SWEEP_MAX_TICKS);
		expect(drained, `x = ${xMm} mm never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, `x = ${xMm} mm: the ball must have reached a TROUGH switch zone (the pre-test eject left the trough at 3/4, so a genuine drain refills the 4th slot), not merely left physics.balls by some other path`).toBe(4);
		expect(drainedTick, `x = ${xMm} mm: sanity, must take a real number of ticks`).toBeGreaterThan(10);
	});

	it.each(rightXsMm.map((xMm) => ({ xMm })))('RIGHT col_wall_bottom_r: a ball released at x = $xMm mm reaches a trough switch zone within a bounded tick count', ({ xMm }) => {
		const { drained, drainedTick, lastPosMm, deviceMechanics } = releaseBall(xMm, releaseYForXMm(xMm), SWEEP_MAX_TICKS);
		expect(drained, `x = ${xMm} mm never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(deviceMechanics.parkingSlots.bd_trough.filter(Boolean).length, `x = ${xMm} mm: the ball must have reached a TROUGH switch zone (the pre-test eject left the trough at 3/4, so a genuine drain refills the 4th slot), not merely left physics.balls by some other path`).toBe(4);
		expect(drainedTick, `x = ${xMm} mm: sanity, must take a real number of ticks`).toBeGreaterThan(10);
	});

	// The paired control the pivot-exclusion band above needs to stop being
	// an unbounded assumption: at exactly PIVOT_EXCLUDE_MM either side of
	// each pivot -- the first x the sweep is willing to sample again -- the
	// ball must still drain. If a future geometry or config change widened
	// the base-circle equilibrium beyond that band, the sweep alone would
	// simply skip the new dead zone and stay green; these four cases go red
	// instead, naming the pivot.
	it.each(pivotControlXsMm.map((xMm) => ({ xMm })))('PIVOT BAND: a ball released at x = $xMm mm -- exactly PIVOT_EXCLUDE_MM from a flipper pivot -- still drains, bounding the excluded band', ({ xMm }) => {
		const { drained, drainedTick, lastPosMm } = releaseBall(xMm, releaseYForXMm(xMm), SWEEP_MAX_TICKS);
		expect(drained, `x = ${xMm} mm is ${PIVOT_EXCLUDE_MM} mm from a pivot and never drained -- the pivot equilibrium is WIDER than the band the sweep excludes, so the sweep is skipping a real dead zone; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		expect(drainedTick, `x = ${xMm} mm: sanity, must take a real number of ticks`).toBeGreaterThan(10);
	});
});

describe('centre channel (AC 8): the 32.65 mm gap between the two pockets passes a ball without jamming, at the authored width', () => {
	const centreX = TABLE.reference.playfieldMm.w / 2; // 257.2

	it('a CENTRED release traverses the channel with negligible lateral drift and reaches the trough', () => {
		const { drained, drainedTick, maxLateralDriftMm, lastPosMm } = releaseBall(centreX, 200);
		expect(drained, `the centred ball never drained; last known position: ${JSON.stringify(lastPosMm)}`).toBe(true);
		// Measured by the lead before this iteration: 0.00 mm drift, exit at
		// tick 911.
		//
		// Code review 2026-08-31 (iteration 4, final pass) -- an earlier pass
		// tightened this from < 5 to < 2 and recorded that the looser bound
		// "would not have caught a real narrowing". Neither does this one, and
		// the claim is withdrawn: the channel is exactly symmetric about the
		// release x (both outer guides 16.325 mm from centre, both pocket
		// posts 15.325 mm), the ball is released at rest, and this solver's
		// gravity has no x-component -- so the drift is STRUCTURALLY 0.00 for
		// any symmetric geometry, however narrow. That is why the 2.5 mm-per-
		// side narrowing the review performed left this assertion green. What
		// this line genuinely pins is that the channel stays symmetric and the
		// traverse stays clean; the narrowing itself is pinned dimensionally,
		// by test/asset-contract.test.ts's AC 8 gates. Kept for that, not
		// mislabelled as the narrowing guard.
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

