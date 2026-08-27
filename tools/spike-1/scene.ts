// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Spike 1's shared six-ball harness (Story 1.1). Consumed by both `test/spike-1.test.ts`
// (Node) and `tools/spike-1/browser.ts` (the Vite dev page) so the two measured legs
// step the identical scene. Imports only `src/sim/physics/**` — DOM-free,
// timing-free, allocation-free in the step path (everything below `createSpikeScene`
// runs once; `step()` is the only function called on the hot path).
//
// This file lives outside `src/sim/` on purpose: it is the harness, not the
// simulation (AD-1). It does its own local mm-to-VP-units conversion, which Story
// 1.4's `sim/table/frames.ts` (AD-10) will own once it exists — see the comment at
// the conversion site below.

import { TICK_HZ } from '../../src/sim/contracts/time';
import { HitPlane } from '../../src/sim/physics/hit-plane';
import { HitPoint } from '../../src/sim/physics/hit-point';
import { LineSeg } from '../../src/sim/physics/line-seg';
import { Vertex2D } from '../../src/sim/physics/math/vertex2d';
import { Vertex3D } from '../../src/sim/physics/math/vertex3d';
import { DEFAULT_TABLE_GRAVITY } from '../../src/sim/physics/constants';
import { PlayerPhysics } from '../../src/sim/physics/game/player-physics';
import { Ball } from '../../src/sim/physics/ball/ball';
import { BallData } from '../../src/sim/physics/ball/ball-data';
import { BallState } from '../../src/sim/physics/ball/ball-state';
import type { BallHitTableData } from '../../src/sim/physics/ball/ball-hit';

/** The story's reference dimensions (matches ARCHITECTURE-SPINE.md's `TABLE.reference`). */
export const PLAYFIELD_WIDTH_MM = 514.4;
export const PLAYFIELD_HEIGHT_MM = 1066.8;
export const BALL_DIAMETER_MM = 26.99;
export const PITCH_DEG = 6.5;
const WALL_HEIGHT_MM = 50; // "thick walls" — tall enough that a rolling ball cannot hop over one.

// AD-10: physics keeps VP units internally, 1 U = 0.53975 mm. This conversion is
// local to the harness per this story's Design Notes; Story 1.4's
// `sim/table/frames.ts` is the one file allowed to convert units elsewhere.
const MM_PER_VU = 0.53975;
function mmToVu(mm: number): number {
	return mm / MM_PER_VU;
}

export interface SpikeScene {
	physics: PlayerPhysics;
	balls: Ball[];
}

// "Why 17 steps." One 60 Hz display frame owes `TICK_HZ / 60` simulated ticks;
// 17 is the worst-case whole-step count a frame can be asked for once the
// fractional remainder is carried (AD-4) — see docs/spikes/spike-1.md for the
// full derivation. Computed from `TICK_HZ` rather than hardcoded so a `TICK_HZ`
// change (e.g. the 480 Hz fallback) keeps this correct automatically.
export const STEPS_PER_FRAME_60HZ = Math.ceil(TICK_HZ / 60);

/** A stand-in for the vpx-js `TableData` fields `BallHit` reads — see ball-hit.ts's deviation note. */
const TABLE_DATA: BallHitTableData = {
	tableHeight: 0,
	globalDifficulty: 1,
};

interface BallSpec {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

// Six distinct start poses, spread well clear of both the walls and each other (more
// than one ball diameter apart), with varied initial velocities so the 10,000-tick
// Node leg and the 600-frame browser leg both exercise ball-wall and ball-ball
// collisions, not just six balls sitting still. Values are in millimetres, in an
// arbitrary local xy frame private to this harness (not the table frame — Story 1.4
// owns that mapping).
const BALL_SPECS: BallSpec[] = [
	{ x: 110, y: 160, vx: 16, vy: 0 },
	{ x: 260, y: 160, vx: -11, vy: 6 },
	{ x: 410, y: 160, vx: 6, vy: -8 },
	{ x: 110, y: 480, vx: 0, vy: 14 },
	{ x: 260, y: 480, vx: 8, vy: 8 },
	{ x: 410, y: 480, vx: -6, vy: -6 },
];

/**
 * Builds one shared six-ball scene: a 514.4 x 1066.8 mm playfield plane, four thick
 * walls (as `LineSeg` with `HitPoint` corners, from the ported primitive set),
 * gravity for a 6.5 deg pitch, and six 26.99 mm balls at distinct poses. Scatter is
 * 0 on every material (AD-3).
 */
export function createSpikeScene(): SpikeScene {
	const physics = new PlayerPhysics();

	// Gravity vector for a 6.5 deg pitch — same formula as upstream's
	// `PlayerPhysics.init()` (lib/game/player-physics.ts:123-125), which this story's
	// trimmed port exposes as `setGravity()`.
	physics.setGravity(PITCH_DEG, DEFAULT_TABLE_GRAVITY);

	const widthVu = mmToVu(PLAYFIELD_WIDTH_MM);
	const heightVu = mmToVu(PLAYFIELD_HEIGHT_MM);
	const wallHeightVu = mmToVu(WALL_HEIGHT_MM);
	const ballRadiusVu = mmToVu(BALL_DIAMETER_MM) / 2;

	// Playfield floor: an infinite plane facing up (+Z), at the local z origin.
	const playfield = new HitPlane(new Vertex3D(0, 0, 1), 0);
	playfield.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
	physics.setPlayfieldHit(playfield);

	// A generous "glass" ceiling far above the playfield, facing down (-Z). Every
	// physics tick tests it unconditionally (see player-physics.ts), but nothing in
	// this scene's initial speeds gets anywhere near it.
	const glassHeightVu = mmToVu(500);
	const topGlass = new HitPlane(new Vertex3D(0, 0, -1), -glassHeightVu);
	topGlass.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
	physics.setTopGlassHit(topGlass);

	// Four thick walls, one LineSeg per side, wound counter-clockwise (0,0) ->
	// (W,0) -> (W,H) -> (0,H) -> (0,0) so LineSeg's own normal calculation
	// (calcNormal(), from v1-v2 rotated) faces inward on every side — verified by
	// the Node correctness leg (no ball ever leaves [0,W] x [0,H]).
	const corners: Array<[number, number]> = [
		[0, 0],
		[widthVu, 0],
		[widthVu, heightVu],
		[0, heightVu],
	];
	for (let i = 0; i < corners.length; i++) {
		const [x1, y1] = corners[i];
		const [x2, y2] = corners[(i + 1) % corners.length];
		const wall = new LineSeg(new Vertex2D(x1, y1), new Vertex2D(x2, y2), 0, wallHeightVu);
		wall.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
		physics.addStaticHitObject(wall);
	}

	// One HitPoint per corner: LineSeg's tangential bounds check
	// (`btd < 0 || btd > length`) means two perpendicular wall segments alone leave
	// a diagonal gap exactly at each corner; a rounded corner point closes it, the
	// classic vpx-js treatment for a rectangular boundary built from line segments.
	for (const [x, y] of corners) {
		const point = new HitPoint(new Vertex3D(x, y, 0));
		point.setElasticity(0.3, 0).setFriction(0.3).setScatter(0);
		physics.addStaticHitObject(point);
	}

	physics.finalizeStatics();

	const balls: Ball[] = [];
	for (let i = 0; i < BALL_SPECS.length; i++) {
		const spec = BALL_SPECS[i];
		const data = new BallData(ballRadiusVu, 1, 1);
		const pos = new Vertex3D(mmToVu(spec.x), mmToVu(spec.y), ballRadiusVu);
		const state = new BallState(`Ball${i}`, pos);
		const velocity = new Vertex3D(spec.vx, spec.vy, 0);
		const ball = new Ball(i, data, state, velocity, TABLE_DATA);

		physics.addBall(ball);
		balls.push(ball);
	}

	return { physics, balls };
}

/** Advances the scene by exactly one physics tick (`1 / TICK_HZ` of simulated time). */
export function step(scene: SpikeScene): void {
	scene.physics.step();
}
