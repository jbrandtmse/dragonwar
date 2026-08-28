// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5, ledger DW-8 -- closes it two ways:
//   1. Out-of-process: spawns a nested `vitest run --config
//      test/fixtures/solver-termination/vitest.harness.config.ts` against
//      `wedge.harness.ts`, with a hard wall-clock `timeout` on the spawned
//      process, and asserts a zero exit code. A non-terminating
//      `physicsSimulateCycle` hangs SYNCHRONOUSLY -- an in-process assertion
//      (a per-tick ceiling, Vitest's own `testTimeout`) cannot detect that,
//      because neither can interrupt a call that never returns control to
//      the event loop; only a separate OS process, killed from outside, can.
//   2. In-process companion: builds the identical adversarial input here and
//      proves it is genuinely adversarial -- its worst single step is at
//      least an order of magnitude above an ordinary step's -- so this test
//      cannot silently degrade into exercising a benign input. Safe to run
//      in-process because the ported solver's STATICTIME forced-advance
//      guarantee is exactly what's under test and is already exercised
//      elsewhere (test/spike-1.test.ts's own "terminates every step" case).

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { toPhysics } from '../src/sim/table/frames';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_CONFIG = path.join(REPO_ROOT, 'test', 'fixtures', 'solver-termination', 'vitest.harness.config.ts');
const COLLISION_PATH = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.collision.json');
const HARD_TIMEOUT_MS = 30_000;
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };

describe('DW-8: solver termination, out-of-process guard', () => {
	it('the nested harness run exits zero within a hard wall-clock timeout', () => {
		const result = spawnSync(
			process.execPath,
			[path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', HARNESS_CONFIG],
			{ cwd: REPO_ROOT, encoding: 'utf8', timeout: HARD_TIMEOUT_MS },
		);
		expect(
			result.signal,
			`the harness process was killed by signal ${String(result.signal)} -- a hang, the exact failure this guard exists to catch. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		).toBeNull();
		expect(result.status, `harness stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
	});
});

/** Same construction as test/fixtures/solver-termination/wedge.harness.ts's own `withAdversarialSlot()` -- duplicated deliberately rather than shared, so this in-process companion and the out-of-process guard stay independently reviewable (the two files serve different processes and different vitest projects). */
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
		footprintMm: [{ x: 240, y: 480 }, { x: 242, y: 480 }, { x: 242, y: 520 }, { x: 240, y: 520 }],
	};
	const right = {
		...wallCommon,
		name: 'col_wedge_right',
		footprintMm: [{ x: 247, y: 480 }, { x: 249, y: 480 }, { x: 249, y: 520 }, { x: 247, y: 520 }],
	};
	return { ...parsed, nodes: [...parsed.nodes, left, right] };
}

function buildBall(vxMmPerS: number): { physics: ReturnType<typeof loadCollision>['physics']; ball: Ball } {
	const raw = JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
	const doc = withAdversarialSlot(raw);
	const { physics } = loadCollision(doc);

	const radiusVu = 26.99 / 2 / 0.53975;
	const data = new BallData(radiusVu, 1, 1);
	const startPhysics = toPhysics({ x: 200, y: 500, z: 13.495 });
	const state = new BallState('WedgeBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
	const originPhysics = toPhysics({ x: 0, y: 0, z: 0 });
	const tipPhysics = toPhysics({ x: vxMmPerS, y: 0, z: 0 });
	const vx = (tipPhysics.x - originPhysics.x) / 100;
	const ball = new Ball(0, data, state, new Vertex3D(vx, 0, 0), TABLE_DATA);
	physics.addBall(ball);
	return { physics, ball };
}

function buildOrdinaryBall(): { physics: ReturnType<typeof loadCollision>['physics'] } {
	// An ORDINARY input: a ball rolling freely on the same committed
	// geometry, nothing narrower than its own diameter anywhere near it.
	const raw = JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
	const { physics } = loadCollision(raw);
	const radiusVu = 26.99 / 2 / 0.53975;
	const data = new BallData(radiusVu, 1, 1);
	const startPhysics = toPhysics({ x: 250, y: 500, z: 13.495 });
	const state = new BallState('OrdinaryBall', new Vertex3D(startPhysics.x, startPhysics.y, startPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), TABLE_DATA);
	physics.addBall(ball);
	return { physics };
}

/** Steps `physics` `count` times, returning the worst and mean step cost in ms. */
function measureSteps(physics: { step(): void }, count: number): { worstMs: number; meanMs: number } {
	let worstMs = 0;
	let totalMs = 0;
	for (let i = 0; i < count; i++) {
		const start = performance.now();
		physics.step();
		const elapsed = performance.now() - start;
		worstMs = Math.max(worstMs, elapsed);
		totalMs += elapsed;
	}
	return { worstMs, meanMs: totalMs / count };
}

describe('DW-8: the adversarial input is genuinely adversarial (in-process companion)', () => {
	it("the wedge scenario's worst single step is at least an order of magnitude above an ordinary step's, and every step still terminates", () => {
		// JIT warmup on THROWAWAY instances of both scenarios first: the
		// adversarial cost is concentrated in the FIRST steps right after
		// impact (before friction settles the ball into a cheap resting
		// contact against the wedge), so discarding early steps from the REAL
		// measurement would throw away the actual signal -- warm up the JIT on
		// disposable scenes instead, then measure fresh ones from a cold start
		// with the relevant code paths already compiled.
		measureSteps(buildBall(9000).physics, 200);
		measureSteps(buildOrdinaryBall().physics, 200);

		const wedge = measureSteps(buildBall(9000).physics, 4000);
		const ordinary = measureSteps(buildOrdinaryBall().physics, 4000);

		// Compared against the ORDINARY scenario's MEAN (a "typical" step, the
		// Code Map's own framing -- "roughly 0.04 ms for an ordinary step"),
		// not its own worst case: a single GC pause or JIT deopt could
		// otherwise contaminate a worst-vs-worst comparison with noise
		// unrelated to either scenario's actual solver cost.
		expect(
			wedge.worstMs,
			`wedge worst step ${wedge.worstMs.toFixed(4)} ms vs ordinary mean step ${ordinary.meanMs.toFixed(4)} ms (ordinary worst ${ordinary.worstMs.toFixed(4)} ms) -- the input is not adversarial enough to discriminate a regression`,
		).toBeGreaterThan(ordinary.meanMs * 10);
	});
});
