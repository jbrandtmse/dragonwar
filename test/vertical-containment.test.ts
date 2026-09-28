// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b, AC 9, DW-53: "given a ball above the interior guides, when it
// is driven laterally at the measured maximum speed at z = 200 mm, then it
// stays inside the playfield on every side, because the perimeter walls now
// reach the glass." A control at z = 25 mm (below the interior guides'
// WALL_H_MM = 50) must stay contained too -- the same containment must hold
// well below the glass, not only near it.
//
// Harness: the same direct loadCollision() + hand-placed-ball approach
// test/drain-routing.test.ts and test/hop-control.test.ts use. The measured
// maximum speed is test/switch-max-speed.test.ts's own
// MEASURED_MAX_SPEED_MM_PER_S (the plunge leg's measured 2497.92 mm/s, with
// margin) -- imported, not re-measured, so the two tests never silently
// disagree about what "maximum" means.
//
// QA gap closed (lead's AD gate, 2026-09-02): the original single test drove
// a ball in ONE direction only (+x from the table centre), which -- because
// tools/make-placeholder-blend.py's DW-53 fix raises FOUR distinct nodes
// (col_wall_left, col_wall_top, col_wall_right, col_wall_lane) -- happens to
// contact only ONE of them (col_wall_lane, the interior wall separating the
// main field from the shooter lane, at x = 468.4) before ever reaching the
// other three. Reverting col_wall_left alone to WALL_H_MM left the single
// test GREEN, because a ball launched toward +x from the centre never gets
// anywhere near x = 0. Verified empirically (probe run, reverted before
// commit): with ONLY col_wall_left lowered, the left-bound sweep's minX
// collapsed from 13.53 mm to -7344 mm (the ball flew straight off the left
// edge and never stopped), while the right-wall, top-wall and lane-wall
// sweeps below were measured BIT-IDENTICAL to the unmutated baseline -- full
// independence, each wall's own sweep isolates that wall alone. Below, each
// of the four perimeter walls DW-53 raises gets its own dedicated sweep, so
// a future change that lowers any ONE of them is caught by name rather than
// only by the accident of which wall a single trajectory happens to hit
// first.
//
// Falsifiability (spec ## Verification, extended per wall): mutation:
// revert col_wall_left to WALL_H_MM in the seeding script and re-export ->
// ONLY 'left wall (col_wall_left)' below goes red, reporting the ball's
// exit x, while the other three sweeps AND the z = 25 mm control stay
// green. The same holds, independently, for col_wall_top / col_wall_right /
// col_wall_lane against their own dedicated sweep below.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { toPhysics, fromPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import { MEASURED_MAX_SPEED_MM_PER_S } from './util/max-speed';
import { nodeBboxMm } from './util/collision-doc';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

interface SweepResult {
	readonly finalMm: { x: number; y: number; z: number };
	readonly maxXMm: number;
	readonly minXMm: number;
	readonly maxYMm: number;
	readonly minYMm: number;
}

/**
 * Drives a ball, placed at table (startMm.x, startMm.y, startMm.z), with a
 * table-frame lateral velocity of `dirTable` (a unit-ish {x, y} direction;
 * the actual speed is always MEASURED_MAX_SPEED_MM_PER_S) for `ticks`
 * ticks, and returns the table-frame position extremes it reached.
 *
 * Table +x is physics +x (frames.ts: x is never flipped), but table +y is
 * physics -y (frames.ts's toPhysics(): `y = (heightMm - v.y) / MM_PER_VU`)
 * -- so a "drive toward the far end" (+table-y) velocity must be given as
 * NEGATIVE physics y. Verified empirically against the probe run above: a
 * naive un-flipped +y velocity left the ball's maxY pinned at its own start
 * value for the whole sweep (net motion was toward the drain from tick 1),
 * where the flipped form reaches maxY = 1052.88 mm, just short of the top
 * wall's own inner face at 1066.8 mm.
 */
function sweep(startMm: { x: number; y: number; z: number }, dirTable: { x: number; y: number }, ticks: number): SweepResult {
	const { physics } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);

	const startPhysics = toPhysics(startMm);
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('SweepBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
	const speedVuPerT = MEASURED_MAX_SPEED_MM_PER_S / (MM_PER_VU * 100);
	const vx = dirTable.x * speedVuPerT;
	const vy = -dirTable.y * speedVuPerT;
	const ball = new Ball(0, data, state, new Vertex3D(vx, vy, 0), TABLE_DATA);
	physics.addBall(ball);

	let maxXMm = startMm.x, minXMm = startMm.x, maxYMm = startMm.y, minYMm = startMm.y;
	for (let t = 0; t < ticks; t++) {
		physics.step();
		const posMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
		maxXMm = Math.max(maxXMm, posMm.x);
		minXMm = Math.min(minXMm, posMm.x);
		maxYMm = Math.max(maxYMm, posMm.y);
		minYMm = Math.min(minYMm, posMm.y);
	}
	const finalPhysics = ball.state.pos;
	const finalMm = fromPhysics({ x: finalPhysics.x, y: finalPhysics.y, z: finalPhysics.z });
	return { finalMm, maxXMm, minXMm, maxYMm, minYMm };
}

const SWEEP_MAX_TICKS = 4000;
// y < 0 is NEVER a containment failure at either z -- it is the drain
// aperture's own intentional exit (below-deck, unrelated to AC 9's
// concern), and gravity pulls every ball toward -y regardless of height, so
// every sweep below eventually reaches it given enough ticks. AC 9's own
// concern is escaping through a SIDE or the far end -- exactly what a
// perimeter wall stopping short of the glass would let a high ball fly
// over.

describe('vertical containment above the interior guides (AC 9, DW-53)', () => {
	describe('per-side coverage: each of the four raised perimeter walls is independently falsifiable', () => {
		it('left wall (col_wall_left): a ball driven toward the LEFT edge at z = 200 mm stays inside x >= 0', () => {
			const r = sweep({ x: 100, y: 300, z: 200 }, { x: -1, y: 0 }, SWEEP_MAX_TICKS);
			expect(r.minXMm, `must not cross x = 0 -- reached minX ${r.minXMm.toFixed(2)}, final ${JSON.stringify(r.finalMm)}`).toBeGreaterThanOrEqual(-1);
			expect(r.minXMm, 'sanity: the ball must have travelled a real distance toward col_wall_left for this to be evidence').toBeLessThan(50);
		});

		it('right wall (col_wall_right): a ball driven toward the RIGHT edge at z = 200 mm, from above col_wall_lane\'s own y-ceiling so col_wall_lane cannot intercept it first, stays inside x <= playfieldMm.w', () => {
			// Started at y = 1000, ABOVE col_wall_lane's own y-extent (it stops
			// at LANE_WALL_TOP_Y_MM = 950 so a launched ball can cross into the
			// field there) -- this isolates col_wall_right, because at this y a
			// lowered col_wall_lane could never have caught the ball either way.
			const r = sweep({ x: 500, y: 1000, z: 200 }, { x: 1, y: 0 }, SWEEP_MAX_TICKS);
			expect(
				r.maxXMm,
				`must not cross x = ${TABLE.reference.playfieldMm.w} -- reached maxX ${r.maxXMm.toFixed(2)}, final ${JSON.stringify(r.finalMm)}`,
			).toBeLessThanOrEqual(TABLE.reference.playfieldMm.w + 1);
			// Code review 2026-09-02 (Rule 19): this guard used to read
			// `toBeGreaterThan(490)`, which `sweep()` seeds to TRUE before
			// physics runs (`maxXMm` starts at `startMm.x`, here 500), so it
			// could never fail. col_wall_right's inner face is at x = 514.4 and
			// the ball radius is 13.495, so a live ball driven at +x must reach
			// a centre x of ~500.9 -- strictly PAST its own start. Asserting
			// movement off the start position is the observation the guard was
			// written to make.
			expect(
				r.maxXMm,
				`sanity: the ball must have MOVED toward col_wall_right for this to be evidence -- maxX ${r.maxXMm.toFixed(2)} against a start of 500`,
			).toBeGreaterThan(500);
		});

		it('top wall (col_wall_top): a ball driven toward the FAR end at z = 200 mm stays inside y <= playfieldMm.h', () => {
			const r = sweep({ x: 257.2, y: 1030, z: 200 }, { x: 0, y: 1 }, SWEEP_MAX_TICKS);
			expect(
				r.maxYMm,
				`must not cross y = ${TABLE.reference.playfieldMm.h} -- reached maxY ${r.maxYMm.toFixed(2)}, final ${JSON.stringify(r.finalMm)}`,
			).toBeLessThanOrEqual(TABLE.reference.playfieldMm.h + 1);
			expect(r.maxYMm, 'sanity: the ball must have travelled a real distance toward col_wall_top for this to be evidence').toBeGreaterThan(1040);
		});

		it('lane wall (col_wall_lane): a ball driven toward the interior lane wall at z = 200 mm never punches through into the shooter-lane corridor', () => {
			// col_wall_lane is an INTERIOR partition (main field vs. the shooter
			// lane), backstopped further out by col_wall_right -- so "escaped
			// the playfield's outer bound" is the wrong test here (a lowered
			// col_wall_lane alone still leaves col_wall_right standing, and the
			// ball would simply be caught there instead, leaving a naive outer-
			// bound check green). The right test is whether the ball ever
			// crosses the WHOLE thickness of col_wall_lane's own body (its far,
			// lane-facing face) -- if it does, it has flown over the wall
			// entirely, regardless of what stands beyond it.
			const r = sweep({ x: 257.2, y: 533.4, z: 200 }, { x: 1, y: 0 }, SWEEP_MAX_TICKS);
			const laneWallFarFaceX = nodeBboxMm('col_wall_lane').max.x;
			expect(
				r.maxXMm,
				`must not cross col_wall_lane's own far face at x = ${laneWallFarFaceX} -- reached maxX ${r.maxXMm.toFixed(2)}, final ${JSON.stringify(r.finalMm)}`,
			).toBeLessThan(laneWallFarFaceX);
			expect(r.maxXMm, 'sanity: the ball must have travelled a real distance toward col_wall_lane for this to be evidence').toBeGreaterThan(TABLE.reference.playfieldMm.w / 2 + 100);
		});
	});

	it('control: a ball at z = 25 mm (below WALL_H_MM = 50, where the interior guides already stood before DW-53) stays contained too', () => {
		const r = sweep({ x: TABLE.reference.playfieldMm.w / 2, y: TABLE.reference.playfieldMm.h / 2, z: 25 }, { x: 1, y: 0 }, SWEEP_MAX_TICKS);
		const laneWallFarFaceX = nodeBboxMm('col_wall_lane').max.x;
		expect(r.maxXMm, `control failed -- reached maxX ${r.maxXMm.toFixed(2)}`).toBeLessThan(laneWallFarFaceX);
	});
});
