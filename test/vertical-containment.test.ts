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
// Falsifiability (spec ## Verification): mutation: revert col_wall_left to
// WALL_H_MM in the seeding script and re-export -> this test goes red
// reporting the ball's exit x, while the z = 25 mm control stays green.

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
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

/** Drives a ball, placed at table (xMm, yMm, zMm) with a lateral +x velocity at the measured maximum speed, for SWEEP_MAX_TICKS ticks, and returns its final table position plus whether it ever left the declared playfield bounds. */
function sweepLaterally(zMm: number): { finalMm: { x: number; y: number; z: number }; stayedInBounds: boolean; maxXMm: number; minXMm: number } {
	const { physics } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);

	const startMm = { x: TABLE.reference.playfieldMm.w / 2, y: TABLE.reference.playfieldMm.h / 2, z: zMm };
	const startPhysics = toPhysics(startMm);
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('LateralBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
	const speedVuPerT = MEASURED_MAX_SPEED_MM_PER_S / (MM_PER_VU * 100);
	// Table +x is physics +x (frames.ts: x is never flipped).
	const ball = new Ball(0, data, state, new Vertex3D(speedVuPerT, 0, 0), TABLE_DATA);
	physics.addBall(ball);

	let stayedInBounds = true;
	let maxXMm = startMm.x;
	let minXMm = startMm.x;
	const SWEEP_MAX_TICKS = 4000;
	for (let t = 0; t < SWEEP_MAX_TICKS; t++) {
		physics.step();
		const posMm = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
		maxXMm = Math.max(maxXMm, posMm.x);
		minXMm = Math.min(minXMm, posMm.x);
		// y < 0 is NEVER a containment failure here, at either z -- it is the
		// drain aperture's own intentional exit (below-deck, unrelated to
		// AC 9's concern), and gravity pulls every ball toward -y regardless
		// of height, so both the z = 200 case and the z = 25 control
		// eventually reach it given enough ticks. AC 9's own concern is
		// escaping through a SIDE or the far end -- exactly what a perimeter
		// wall stopping short of the glass would let a high ball fly over.
		if (
			posMm.x < 0 - 1 || posMm.x > TABLE.reference.playfieldMm.w + 1 ||
			posMm.y > TABLE.reference.playfieldMm.h + 1
		) {
			stayedInBounds = false;
		}
	}
	const finalPhysics = ball.state.pos;
	const finalMm = fromPhysics({ x: finalPhysics.x, y: finalPhysics.y, z: finalPhysics.z });
	return { finalMm, stayedInBounds, maxXMm, minXMm };
}

describe('vertical containment above the interior guides (AC 9, DW-53)', () => {
	it('a ball at z = 200 mm (above WALL_H_MM = 50, below the glass at 400) driven laterally at the measured maximum speed stays inside the playfield on every side', () => {
		const result = sweepLaterally(200);
		expect(
			result.stayedInBounds,
			`the ball must stay inside x in [0, ${TABLE.reference.playfieldMm.w}], y in [0, ${TABLE.reference.playfieldMm.h}] -- reached x in [${result.minXMm.toFixed(2)}, ${result.maxXMm.toFixed(2)}], final ${JSON.stringify(result.finalMm)}`,
		).toBe(true);
		// The ball must actually have been driven toward the perimeter --
		// otherwise "stayed in bounds" is vacuously true because it never
		// travelled far enough to test the wall at all.
		expect(result.maxXMm, 'sanity: the ball must have travelled a real distance toward the perimeter for this to be evidence').toBeGreaterThan(TABLE.reference.playfieldMm.w / 2 + 100);
	});

	it('control: a ball at z = 25 mm (below WALL_H_MM = 50, where the interior guides already stood before DW-53) stays contained too', () => {
		const result = sweepLaterally(25);
		expect(result.stayedInBounds, `control failed -- reached x in [${result.minXMm.toFixed(2)}, ${result.maxXMm.toFixed(2)}]`).toBe(true);
	});
});
