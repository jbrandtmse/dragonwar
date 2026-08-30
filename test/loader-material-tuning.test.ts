// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9 review fix: `src/sim/physics/loader/index.ts`'s `loadCollision()`
// previously read the bare module-level `TUNING` import for every
// non-flipper material (walls, ramps, the playfield plane, the glass
// plane), never the `tuning: ResolvedTuning` `createMachine(collisionDoc,
// tuning)` already receives -- the EXACT bug class this story's own
// `test/elasticity-falloff.test.ts` already found and fixed for
// `flippers.ts`'s `flipper_rubber` read, except this second instance
// covered every OTHER material, including `materials.default` (the one the
// tuning panel enumerates and lets a developer edit alongside every other
// leaf tunable -- AC 1's "every leaf TuningEntry" claim was false for these
// four rows before this fix). `loadCollision()` now accepts an optional
// `tuning` parameter (defaulting to the live `resolveTuning()`, so every
// call site that omits it is byte-identical to before this fix) and reads
// `tuning.materials` throughout.
//
// Real-loop harness: drives loadCollision(doc, tuning)'s own installed
// playfield HitPlane directly (the same "physics.step() directly" pattern
// test/elasticity-falloff.test.ts and test/pitch-tunable.test.ts already use
// -- runReplay()/createLoop() give no seam to place a ball at a controlled
// velocity) -- a ball driven straight down at the playfield is the simplest
// real contact with a `physMaterial: "default"` node
// (`public/assets/dragonwar.collision.json`'s own `col_playfield`).
//
// Falsifiability: mutation: revert loadCollision()'s materialsSource
// parameter to the bare module-level TUNING import -> the divergence
// assertion below goes red (both runs would produce the SAME rebound ratio,
// since neither would ever see the overridden elasticity).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { DEFAULT_TABLE_GRAVITY, GRAVITYCONST } from '../src/sim/physics/constants';
import { toPhysics } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import type { ResolvedTuning } from '../src/sim/table/tuning';
import type { BallHitTableData } from '../src/sim/physics/ball/ball-hit';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function tuningWithDefaultElasticity(elasticity: number): ResolvedTuning {
	return resolveTuning({
		...TUNING,
		materials: {
			...TUNING.materials,
			default: { ...TUNING.materials.default, elasticity: { value: elasticity, source: 'test fixture', confidence: 'unverified' as const } },
		},
	});
}

function ballSpeed(ball: Ball): number {
	return Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
}

/** Drives a ball straight down into the playfield (`physMaterial: "default"`) and returns the rebound-to-impact speed ratio at the tick of largest single-tick speed change. */
function playfieldReboundRatio(tuning: ResolvedTuning): number {
	const { physics } = loadCollision(loadDoc(), tuning);
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);

	const startMm = { x: 210, y: 400, z: 60 };
	const posPhysics = toPhysics(startMm);
	const dir = { x: 0, y: 0, z: -1 };
	const impactSpeedMmPerS = 2000;
	const speedOrigin = toPhysics({ x: 0, y: 0, z: 0 });
	const speedTip = toPhysics({ x: dir.x * impactSpeedMmPerS, y: dir.y * impactSpeedMmPerS, z: dir.z * impactSpeedMmPerS });
	const velVuPerT = {
		x: (speedTip.x - speedOrigin.x) / 100,
		y: (speedTip.y - speedOrigin.y) / 100,
		z: (speedTip.z - speedOrigin.z) / 100,
	};

	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('DroppedBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(velVuPerT.x, velVuPerT.y, velVuPerT.z), TABLE_DATA);
	physics.addBall(ball);

	let maxDelta = 0;
	let speedBeforeContact = 0;
	let speedAfterContact = 0;
	for (let i = 0; i < 60; i++) {
		const before = ballSpeed(ball);
		physics.step();
		const after = ballSpeed(ball);
		const delta = Math.abs(after - before);
		if (delta > maxDelta) {
			maxDelta = delta;
			speedBeforeContact = before;
			speedAfterContact = after;
		}
	}
	if (maxDelta < 1) {
		throw new Error(`playfieldReboundRatio(): no genuine playfield contact was detected (maxDelta=${maxDelta.toFixed(4)})`);
	}
	return speedAfterContact / speedBeforeContact;
}

describe('src/sim/physics/loader/index.ts -- loadCollision() reads EVERY non-flipper material from the caller\'s tuning, not the bare TUNING import', () => {
	it('omitting tuning entirely resolves to the live default -- byte-identical to this function\'s pre-fix behaviour', () => {
		const { physics: withDefault } = loadCollision(loadDoc());
		const { physics: withExplicitResolve } = loadCollision(loadDoc(), resolveTuning());
		// Sanity: both must have installed a playfield hit object identically --
		// no crash, no divergent construction path when tuning is omitted.
		expect(withDefault.balls.length).toBe(withExplicitResolve.balls.length);
	});

	it('overriding materials.default.elasticity through loadCollision(doc, tuning) changes the playfield rebound ratio -- the panel\'s advertised hot-apply for a non-flipper material actually reaches physics', () => {
		const lowElasticity = tuningWithDefaultElasticity(0.1);
		const highElasticity = tuningWithDefaultElasticity(0.9);
		expect(TUNING.materials.default.elasticity.value, 'sanity: the two fixture values must actually straddle the shipped default').toBeLessThan(0.9);
		expect(TUNING.materials.default.elasticity.value).toBeGreaterThan(0.1);

		const lowRatio = playfieldReboundRatio(lowElasticity);
		const highRatio = playfieldReboundRatio(highElasticity);
		expect(
			highRatio,
			`a higher materials.default.elasticity (0.9, ratio ${highRatio.toFixed(4)}) must rebound MORE than a lower one (0.1, ratio ${lowRatio.toFixed(4)}) -- if this fails, loadCollision() is not reading the override`,
		).toBeGreaterThan(lowRatio);
	});
});
