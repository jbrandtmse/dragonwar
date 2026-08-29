// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7's AC 2 (a nudge frees a ball resting on a raised bat), plus its
// control-run discriminating negative (Hazard 1 in this story's spec). Built
// on `test/flipper-collision.test.ts`'s harness SHAPE (`loadCollision()` +
// `createFlipperMechanics()`, the same ball placement (195, 85) mm on the
// raised left bat) WITHOUT importing from or modifying that file (ledger
// DW-72: Story 2.1 re-asserts the full 5 s cradle against that exact test).
//
// Measured finding (recorded in the spec): a SINGLE nudge_up rising edge
// changes this ball's departure timing only within measurement noise (an
// ordinary nudge is a small perturbation by design -- AD-5's own "a firm
// nudge should result in around 3 to 5 mm cabinet displacement", not a
// violent one). A rapid BURST of rising edges (the same "firm/violent nudge"
// realisation `test/cabinet-bob.test.ts`'s AC 3 and `test/cabinet-slam.test.ts`'s
// AC 5 already needed) produces a large, unambiguous effect -- measured
// 848 ticks (control) vs 192 ticks (burst) to reach 20 mm of drift. This test
// arranges that burst; its first rising edge is "the nudge tick" AC 2 names.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { createCabinetMechanics } from '../src/sim/physics/cabinet';
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

/** Mirrors flipper-collision.test.ts's buildFlipperHarness() SHAPE, extended with the cabinet mechanics this story adds -- not imported from that file. */
function buildRig() {
	const { physics, flippers } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const tuning = resolveTuning();
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });
	const cabinetMechanics = createCabinetMechanics({ physics, tuning });
	return { physics, flipperMechanics, cabinetMechanics };
}

/** Mirrors flipper-collision.test.ts's spawnBallAt() SHAPE -- not imported from that file. */
function spawnBallAt(physics: ReturnType<typeof buildRig>['physics'], xMm: number, yMm: number, name: string): Ball {
	const posPhysics = toPhysics({ x: xMm, y: yMm, z: RADIUS_VU * 0.53975 });
	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState(name, new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);
	return ball;
}

function ballPosMm(ball: Ball) {
	return fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
}
function ballSpeed(ball: Ball): number {
	return Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
}

/** The burst's ten rising edges: ticks 100, 102, ..., 118 -- the fastest achievable spacing via real true/false toggling, same shape as AC 3's and AC 5's own bursts. */
const BURST_TICKS = new Set(Array.from({ length: 10 }, (_, i) => 100 + i * 2));
const FIRST_NUDGE_TICK = 100;
const OBSERVE_TICK = 300;
const DEPARTED_DRIFT_MM = 20;
const CONTROL_STILL_ON_BAT_DRIFT_MM = 10;

interface RunResult {
	readonly startPos: { x: number; y: number };
	readonly driftAt: (tick: number) => number;
	readonly speedAt: (tick: number) => number;
}

function runCradle(nudge: boolean): RunResult {
	const rig = buildRig();
	const held: InputFrame = { ...NO_FRAME, flipper_l: true };

	// Exactly test/flipper-collision.test.ts's own "(b)" arrange: raise the
	// bat for 60 ticks first (it reaches end-of-stroke well inside that, per
	// that test's own sanity check), then place the ball resting against it.
	let tick = 0;
	for (let t = 1; t <= 60; t++) {
		tick = t;
		rig.flipperMechanics.applyFrame(t, held, { l: true, r: true });
		rig.cabinetMechanics.applyFrame(t, NO_FRAME);
		rig.physics.step();
	}
	const ball = spawnBallAt(rig.physics, 195, 85, 'CradleBall');
	const startPos = ballPosMm(ball);

	const drifts: number[] = [];
	const speeds: number[] = [];
	for (let i = 1; i <= 600; i++) {
		tick += 1;
		const frame: InputFrame = nudge && BURST_TICKS.has(tick) ? { ...held, nudge_up: true } : held;
		rig.flipperMechanics.applyFrame(tick, frame, { l: true, r: true });
		rig.cabinetMechanics.applyFrame(tick, frame);
		rig.physics.step();
		const pos = ballPosMm(ball);
		drifts.push(Math.hypot(pos.x - startPos.x, pos.y - startPos.y));
		speeds.push(ballSpeed(ball));
	}
	// Recording starts at tick 61 (drifts[0]), after the 60-tick warmup that
	// raises the bat -- so absolute tick T is stored at index T - 61.
	return {
		startPos,
		driftAt: (t: number) => drifts[t - 61]!,
		speedAt: (t: number) => speeds[t - 61]!,
	};
}

describe('sim/physics/cabinet -- AC 2: a nudge frees a ball resting on a raised bat', () => {
	it('arrange: the ball is genuinely still on the bat, strictly inside the first 1 s of the hold, the tick before the burst\'s first rising edge (both runs, identically seeded)', () => {
		const nudged = runCradle(true);
		const control = runCradle(false);
		const arrangeTick = FIRST_NUDGE_TICK - 1;
		expect(arrangeTick, "the arrange tick must be strictly inside the first 1000 ticks (1 s) of the ball's own hold").toBeLessThan(1000);
		// "In contact, within tolerance of its placement, and not already
		// departing" -- both runs are bit-identical up to here (the burst has
		// not started), so both are checked.
		expect(nudged.driftAt(arrangeTick), 'nudged run: the ball must still be close to its placement').toBeLessThan(5);
		expect(nudged.speedAt(arrangeTick), 'nudged run: the ball must still be slow (not already departing)').toBeLessThan(2);
		expect(control.driftAt(arrangeTick)).toBeLessThan(5);
		expect(control.speedAt(arrangeTick)).toBeLessThan(2);
	});

	it('within a stated tick budget after the burst, the nudged ball has left the bat by a stated observable (drift), while the control ball -- identical in every respect except the nudge -- has not', () => {
		const nudged = runCradle(true);
		const control = runCradle(false);

		expect(nudged.driftAt(OBSERVE_TICK), `by tick ${OBSERVE_TICK} the nudged ball must have measurably left the bat`).toBeGreaterThan(DEPARTED_DRIFT_MM);
		// The discriminating negative: the control run is the SAME arrange,
		// the SAME tick budget, no nudge -- and is still on the bat. Without
		// this, "the ball left the bat" would be satisfied by a ball that was
		// leaving anyway (Hazard 1, this story's spec).
		expect(control.driftAt(OBSERVE_TICK), `by tick ${OBSERVE_TICK} the control ball (no nudge) must still be on the bat`).toBeLessThan(CONTROL_STILL_ON_BAT_DRIFT_MM);

		// Sanity: the two runs are genuinely different (not a tolerance wide
		// enough to pass regardless of whether the nudge happened at all).
		expect(nudged.driftAt(OBSERVE_TICK)).toBeGreaterThan(control.driftAt(OBSERVE_TICK) * 3);
	});
});
