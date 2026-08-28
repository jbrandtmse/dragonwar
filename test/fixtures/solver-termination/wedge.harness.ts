// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5, ledger DW-8: the OUT-OF-PROCESS half of the solver-termination
// guard. `test/solver-termination.test.ts` (in the default suite) spawns a
// nested `vitest run --config test/fixtures/solver-termination/
// vitest.harness.config.ts` against exactly this file, with a hard
// wall-clock timeout on the spawned process itself -- a non-terminating
// `physicsSimulateCycle` hangs SYNCHRONOUSLY (a live-lock, not an unhandled
// promise or a slow-but-completing loop), which defeats both an in-process
// per-tick ceiling and Vitest's own `testTimeout`: neither can interrupt a
// synchronous call that never returns control to the event loop. Only a
// SEPARATE OS process, killed from outside by the spawning test's own
// timeout, can prove termination either way.
//
// The adversarial input: a ball driven at 9000 mm/s into a 5 mm slot --
// narrower than its own 26.99 mm diameter -- built by adding two thin
// parallel walls to the REAL committed collision body (loadCollision() over
// the committed dragonwar.collision.json, with two extra wall nodes
// injected before loading, in open main-field space clear of every other
// node) rather than a synthetic scene from nothing.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../../../src/sim/physics/loader';
import { toPhysics } from '../../../src/sim/table/frames';
import { Ball } from '../../../src/sim/physics/ball/ball';
import { BallData } from '../../../src/sim/physics/ball/ball-data';
import { BallState } from '../../../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../../../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../../../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', '..', '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

/** Adds two thin parallel walls in open main-field space (table x ~ 240-249, y 480-520 -- clear of every wall, flipper, lane, drain and switch zone in the committed geometry) forming a 5 mm gap, narrower than the 26.99 mm reference ball. */
function withAdversarialSlot(doc: unknown): unknown {
	const parsed = doc as { nodes: Array<Record<string, unknown>> };
	const wallCommon = {
		shape: 'wall',
		surface: 'wood',
		physMaterial: 'default',
		zLowMm: 0,
		zHighMm: 50,
		bboxMm: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
	};
	const left = {
		...wallCommon,
		name: 'col_wedge_left',
		footprintMm: [
			{ x: 240, y: 480 },
			{ x: 242, y: 480 },
			{ x: 242, y: 520 },
			{ x: 240, y: 520 },
		],
	};
	const right = {
		...wallCommon,
		name: 'col_wedge_right',
		footprintMm: [
			{ x: 247, y: 480 },
			{ x: 249, y: 480 },
			{ x: 249, y: 520 },
			{ x: 247, y: 520 },
		],
	};
	return { ...parsed, nodes: [...parsed.nodes, left, right] };
}

describe('solver termination (DW-8), out-of-process', () => {
	it('every step terminates by forced advance (STATICTIME) against a genuinely non-convergent input', () => {
		const raw = JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
		const doc = withAdversarialSlot(raw);
		const { physics } = loadCollision(doc);

		const radiusVu = 26.99 / 2 / 0.53975;
		const data = new BallData(radiusVu, 1, 1);
		const startPhysics = toPhysics({ x: 200, y: 500, z: 13.495 });
		const state = new BallState('WedgeBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
		// Table +x -> physics +x (no flip): 9000 mm/s toward the slot at x = 245.
		const originPhysics = toPhysics({ x: 0, y: 0, z: 0 });
		const tipPhysics = toPhysics({ x: 9000, y: 0, z: 0 });
		const vx = (tipPhysics.x - originPhysics.x) / 100;
		const ball = new Ball(0, data, state, new Vertex3D(vx, 0, 0), TABLE_DATA);
		physics.addBall(ball);

		// Bounded step count (matches the Code Map's verified figure: 4000 steps
		// completed in 77.2 ms with a worst single step of 2.591 ms). If
		// STATICTIME's forced-advance guarantee ever regressed, this call
		// itself would hang synchronously -- which is exactly why
		// test/solver-termination.test.ts runs this file in a SEPARATE process
		// with a hard wall-clock kill, rather than trusting Vitest's own
		// testTimeout to interrupt it.
		for (let i = 0; i < 4000; i++) {
			physics.step();
		}

		expect(Number.isFinite(ball.state.pos.x)).toBe(true);
		expect(Number.isFinite(ball.state.pos.y)).toBe(true);
	});
});
