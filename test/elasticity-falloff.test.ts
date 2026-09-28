// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.9, AC 3: "given three impact speeds, when rebounds are driven,
// then the rebound-to-impact ratio strictly decreases as impact speed rises,
// and a falloff-0 control over the same speeds gives a flat ratio."
// `materials.flipper_rubber.elasticityFalloff` (`sim/table/tuning.ts`'s own
// doc comment: "the primary feel knob") is the mechanism; `elasticityWithFalloff()`
// (`sim/physics/functions.ts`, DW-79-frozen, read-only here) is where it is
// consumed. The falloff-0 control is what makes "decreases with speed"
// falsifiable (spec's own I/O matrix): without it, "rebound-to-impact ratio
// decreases with impact speed" could just as well be an artifact of the
// solver's ordinary velocity-dependent contact response, unrelated to
// falloff at all.
//
// Real-loop harness: the SAME `loadCollision()` + `createFlipperMechanics()`
// approach `test/flipper-collision.test.ts`'s "at rest" control uses -- the
// flipper stays RELEASED throughout (no mover energy injected), and a ball
// launched at a controlled table-mm/s speed toward the bat's face is the
// only source of the impact. `runReplay()`/`createLoop()` give no seam to
// place a ball at a controlled velocity (only device ejects, whose pose and
// speed are themselves TUNING entries, not per-test knobs), so this drives
// `physics.step()` directly, exactly as `flipper-collision.test.ts` already
// does for the same reason.
//
// Review finding (this pass): `src/sim/physics/flippers.ts` used to read
// `materials.flipper_rubber` off the bare MODULE-LEVEL `TUNING` import
// rather than the `tuning: ResolvedTuning` parameter every other
// `create*Mechanics()` in this directory reads its material from -- so
// `elasticityFalloff` (and elasticity/friction/scatter alongside it) was
// NOT actually reachable through the Phase 1 rebuild seam
// (`createLoop({ tuning })`) at all: a hot-applied override had zero effect
// on the running sim. Fixed in this story (`flippers.ts`'s own updated
// comment) -- this test's falsifiability mutation is exactly what would have
// caught the regression.
//
// Falsifiability (spec): mutation: override materials.flipper_rubber.
// elasticityFalloff to 0 through the new tuning seam -> the
// strictly-decreasing assertion below goes red. (This mutation runs through
// the Phase 1 seam, so it also proves the seam.)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import { createFlipperMechanics } from '../src/sim/physics/flippers';
import { NO_FRAME } from '../src/sim/loop';
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
import type { InputFrame } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const TABLE_DATA: BallHitTableData = { tableHeight: 0, globalDifficulty: 1 };
const RADIUS_VU = TABLE.reference.ballMm / 2 / 0.53975;

/**
 * Three well-separated impact speeds (table mm/s), each measured this pass
 * to produce a genuine flipper-face contact (a maxDelta well above ordinary
 * settling noise) rather than a near-miss. Story 2.1a re-measured this
 * triple: DW-78's reconciliation shortened the rest bat's own modelled
 * reach (91.875 -> 79.375 mm), and the superseded 5000 mm/s upper speed now
 * lands a qualitatively different (near-tip) contact that is NOT flat even
 * at `elasticityFalloff = 0` -- a solver behaviour at that speed against
 * this bat, not a falloff effect. 3000 mm/s stays comfortably clean.
 */
const IMPACT_SPEEDS_MM_PER_S = [1000, 2000, 3000] as const;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function tuningWithFalloff(falloff: number): ResolvedTuning {
	return resolveTuning({
		...TUNING,
		materials: {
			...TUNING.materials,
			flipper_rubber: { ...TUNING.materials.flipper_rubber, elasticityFalloff: { value: falloff, source: 'test fixture', confidence: 'unverified' as const } },
		},
	});
}

function ballSpeed(ball: Ball): number {
	return Math.hypot(ball.hit.vel.x, ball.hit.vel.y, ball.hit.vel.z);
}

/**
 * Drives a ball at `impactSpeedMmPerS` toward the (released, unmoving) left
 * flipper's face and returns the rebound-to-impact speed ratio at the tick
 * of largest single-tick speed change -- the contact tick, found the same
 * way `src/sim/physics/hop.ts`'s own trigger is measured (this file's
 * header).
 */
function reboundRatio(tuning: ResolvedTuning, impactSpeedMmPerS: number): number {
	const { physics, flippers } = loadCollision(loadDoc());
	physics.setGravity(TABLE.reference.pitchDeg, DEFAULT_TABLE_GRAVITY * GRAVITYCONST);
	const flipperMechanics = createFlipperMechanics({ physics, flippers, tuning });

	let tick = 0;
	const released: InputFrame = NO_FRAME;
	for (let t = 1; t <= 20; t++) {
		tick = t;
		flipperMechanics.applyFrame(t, released, { l: true, r: true });
		physics.step();
	}

	// A ball approaching from further up-field (table +y), aimed at the
	// resting bat's face -- the EXACT tableSpeedToPhysicsVelocity() recipe
	// `sim/physics/devices.ts` uses (toPhysics()'s linear part only, then the
	// /100 VP time-unit scaling), mirrored here rather than shared (the same
	// "mirrored, not shared" pattern `sim/loop/index.ts`'s own
	// physicsVelocityToTableMmPerS() documents).
	// Story 2.1a: x = 195 (was 210) -- DW-78's reconciliation shortened the
	// rest bat's own reach, and 210 now lands too close to the tapered tip
	// for a consistent face hit across all three speeds; 195 lands solidly
	// on the flatter part of the capsule, re-measured this pass.
	const startMm = { x: 195, y: 110, z: RADIUS_VU * 0.53975 };
	const posPhysics = toPhysics(startMm);
	const dir = { x: 0, y: -1, z: 0 };
	const speedOrigin = toPhysics({ x: 0, y: 0, z: 0 });
	const speedTip = toPhysics({ x: dir.x * impactSpeedMmPerS, y: dir.y * impactSpeedMmPerS, z: dir.z * impactSpeedMmPerS });
	const velVuPerT = {
		x: (speedTip.x - speedOrigin.x) / 100,
		y: (speedTip.y - speedOrigin.y) / 100,
		z: (speedTip.z - speedOrigin.z) / 100,
	};

	const data = new BallData(RADIUS_VU, 1, 1);
	const state = new BallState('ImpactBall', new Vertex3D(posPhysics.x, posPhysics.y, posPhysics.z));
	const ball = new Ball(0, data, state, new Vertex3D(velVuPerT.x, velVuPerT.y, velVuPerT.z), TABLE_DATA);
	physics.addBall(ball);

	let maxDelta = 0;
	let speedBeforeContact = 0;
	let speedAfterContact = 0;
	for (let i = 0; i < 60; i++) {
		tick += 1;
		const before = ballSpeed(ball);
		flipperMechanics.applyFrame(tick, released, { l: true, r: true });
		physics.step();
		const after = ballSpeed(ball);
		const delta = Math.abs(after - before);
		if (delta > maxDelta) {
			maxDelta = delta;
			speedBeforeContact = before;
			speedAfterContact = after;
		}
	}
	// Sanity, per-call: a genuine contact must actually have been found, or a
	// "ratio" computed from mere settling noise would make every assertion
	// below meaningless.
	if (maxDelta < 1) {
		throw new Error(`reboundRatio(): no genuine flipper contact was detected at impact speed ${impactSpeedMmPerS} mm/s (maxDelta=${maxDelta.toFixed(4)}) -- the ball missed the bat`);
	}
	return speedAfterContact / speedBeforeContact;
}

describe('src/sim/physics/flippers.ts -- AC 3, elasticity falloff live-tunable through the real physics step', () => {
	it('at the shipped default falloff (0.15), the rebound-to-impact ratio strictly decreases as impact speed rises', () => {
		const tuning = resolveTuning();
		expect(tuning.materials.flipper_rubber.elasticityFalloff.value, 'sanity: the default must actually be the shipped nonzero falloff').toBe(0.15);

		const ratios = IMPACT_SPEEDS_MM_PER_S.map((speed) => reboundRatio(tuning, speed));
		for (let i = 1; i < ratios.length; i++) {
			expect(
				ratios[i]!,
				`rebound ratio at ${IMPACT_SPEEDS_MM_PER_S[i]} mm/s (${ratios[i]!.toFixed(4)}) must be strictly LESS than at ${IMPACT_SPEEDS_MM_PER_S[i - 1]} mm/s (${ratios[i - 1]!.toFixed(4)})`,
			).toBeLessThan(ratios[i - 1]!);
		}
	});

	it('a falloff-0 control over the SAME three speeds gives a flat ratio -- the discriminator that makes the decrease above falsifiable', () => {
		const zeroFalloff = tuningWithFalloff(0);
		const controlRatios = IMPACT_SPEEDS_MM_PER_S.map((speed) => reboundRatio(zeroFalloff, speed));
		const range = Math.max(...controlRatios) - Math.min(...controlRatios);

		const defaultTuning = resolveTuning();
		const defaultRatios = IMPACT_SPEEDS_MM_PER_S.map((speed) => reboundRatio(defaultTuning, speed));
		const defaultRange = Math.max(...defaultRatios) - Math.min(...defaultRatios);

		expect(defaultRange, 'sanity: the real (nonzero-falloff) effect must actually have a measurable range, or the comparison below is vacuous').toBeGreaterThan(0.02);
		expect(
			range,
			`the falloff=0 control's ratio range across the three speeds (${range.toFixed(4)}) must be FLAT relative to the real falloff's own range (${defaultRange.toFixed(4)}) -- less than half of it`,
		).toBeLessThan(defaultRange / 2);
	});

	it('mutation (spec-named): overriding elasticityFalloff to 0 through the tuning seam collapses the strictly-decreasing pattern -- proves both AC 3 and the Phase 1 seam', () => {
		const zeroFalloff = tuningWithFalloff(0);
		const ratios = IMPACT_SPEEDS_MM_PER_S.map((speed) => reboundRatio(zeroFalloff, speed));
		// With the mutation applied, the fastest and slowest impacts must NOT
		// differ by anywhere near the real effect's magnitude -- if this ever
		// starts failing (the strictly-decreasing shape reappearing at
		// falloff=0), the seam Phase 1 built is no longer actually feeding
		// materials.flipper_rubber.elasticityFalloff through to the flipper's
		// own FlipperHit, and this is the intended red.
		expect(Math.abs(ratios[0]! - ratios[ratios.length - 1]!)).toBeLessThan(0.02);
	});
});
