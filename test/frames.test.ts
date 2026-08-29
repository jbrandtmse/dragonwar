// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's third acceptance criterion: `sim/table/frames.ts` is the only
// file under `src/` that converts units or axes, exports `glbToTable()`,
// `toPhysics()`, `fromPhysics()` and `toScene()`, and round-trips a point
// through glb -> table -> scene and table -> physics -> table within
// floating-point tolerance.

import { describe, expect, it } from 'vitest';
import { MM_PER_VU, fromPhysics, glbToTable, toPhysics, toPhysicsPlane, toScene, type Vec3 } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { cabinetAccelToPhysicsAccel } from '../src/sim/physics/cabinet';
import { GRAVITYCONST } from '../src/sim/physics/constants';

const EPSILON = 1e-9;

// `epsilon` is an absolute bound, honoured -- not `toBeCloseTo`'s decimal
// digits with the parameter discarded via `void epsilon`, which silently
// ignored any tolerance a caller passed and left both the parameter and
// EPSILON dead (re-review finding).
function expectClose(actual: Vec3, expected: Vec3, epsilon = EPSILON): void {
	for (const axis of ['x', 'y', 'z'] as const) {
		expect(
			Math.abs(actual[axis] - expected[axis]),
			`${axis}: ${actual[axis]} !~ ${expected[axis]} (tolerance ${epsilon})`,
		).toBeLessThanOrEqual(epsilon);
	}
}

describe('sim/table/frames.ts -- the measured axis mapping (Code Map, "Verified environment facts")', () => {
	it('an object at Blender (0.1, 0.2, 0.03) m exports to glTF translation (0.1, 0.03, -0.2), and glbToTable() recovers the authored table-frame millimetres', () => {
		// The .blend is authored directly in the table frame (metres); the
		// measured glTF export of a point at Blender (bx, by, bz) is
		// glb (bx, bz, -by). glbToTable() must map that glb point back to the
		// table-frame millimetres the object was originally authored at
		// (bx*1000, by*1000, bz*1000).
		const glbPoint: Vec3 = { x: 0.1, y: 0.03, z: -0.2 };
		const table = glbToTable(glbPoint);
		expectClose(table, { x: 100, y: 200, z: 30 });
	});
});

describe('sim/table/frames.ts -- glbToTable() -> toScene() round-trips exactly (this story\'s third acceptance criterion)', () => {
	it('returns the original point for an arbitrary glb-frame vector', () => {
		const points: Vec3[] = [
			{ x: 0, y: 0, z: 0 },
			{ x: 1.5, y: -2.25, z: 3.75 },
			{ x: -0.5144, y: 1.0668, z: -0.019 },
		];
		for (const p of points) {
			const table = glbToTable(p);
			const scene = toScene(table);
			expectClose(scene, p);
		}
	});
});

describe('sim/table/frames.ts -- toPhysics() -> fromPhysics() round-trips exactly (this story\'s third acceptance criterion)', () => {
	it('returns the original table-frame point for an arbitrary table-frame millimetre vector', () => {
		const points: Vec3[] = [
			{ x: 0, y: 0, z: 0 },
			{ x: 257.2, y: 533.4, z: 0 },
			{ x: 12.3, y: 1000.5, z: -19 },
			{ x: TABLE.reference.playfieldMm.w, y: TABLE.reference.playfieldMm.h, z: 400 },
		];
		for (const p of points) {
			const physics = toPhysics(p);
			const table = fromPhysics(physics);
			expectClose(table, p);
		}
	});

	it('physics +y runs down-slope toward the player: a point near the far edge (large table y) has a SMALLER physics y than a point near the near edge (table y = 0)', () => {
		const near = toPhysics({ x: 0, y: 0, z: 0 });
		const far = toPhysics({ x: 0, y: TABLE.reference.playfieldMm.h, z: 0 });
		expect(far.y).toBeLessThan(near.y);
	});
});

describe('sim/table/frames.ts -- negative control: the permutation is not the identity', () => {
	it('toScene() is not a bare unit-scale divide -- y and z are swapped (with a sign flip), not passed straight through', () => {
		const table: Vec3 = { x: 100, y: 200, z: 300 };
		const scene = toScene(table);
		const naiveDivideBy1000 = { x: table.x / 1000, y: table.y / 1000, z: table.z / 1000 };
		expect(scene.y).not.toBeCloseTo(naiveDivideBy1000.y, 6);
		expect(scene.z).not.toBeCloseTo(naiveDivideBy1000.z, 6);
		expectClose(scene, { x: 0.1, y: 0.3, z: -0.2 });
	});

	it('toPhysics() is not a bare unit-scale divide -- y is flipped about the playfield\'s far edge, not passed straight through', () => {
		const table: Vec3 = { x: 100, y: 200, z: 0 };
		const physics = toPhysics(table);
		const naiveDivideByM = table.y / MM_PER_VU;
		expect(physics.y).not.toBeCloseTo(naiveDivideByM, 3);
	});
});

describe('sim/table/frames.ts -- MM_PER_VU lives here (AD-10)', () => {
	it('matches the harness-local constant tools/spike-1/scene.ts also carries (this story\'s Code Map)', () => {
		expect(MM_PER_VU).toBeCloseTo(0.53975, 10);
	});
});

// ---------------------------------------------------------------------------
// Property-style round-trips over many generated points, not one or two
// hand-picked ones (an axis-permutation or sign error can hide behind a
// coordinate that happens to be symmetric, e.g. x === y, or a component that
// happens to be zero -- exactly the failure class AD-10 exists to prevent).
// A fixed seed keeps the run deterministic and reproducible on failure.
// ---------------------------------------------------------------------------

/** A tiny, deterministic, dependency-free PRNG (mulberry32) -- reproducible test data, no third-party code. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomRange(rng: () => number, min: number, max: number): number {
	return min + rng() * (max - min);
}

const PROPERTY_SAMPLE_COUNT = 200;

describe('sim/table/frames.ts -- property-style round-trips over many generated points', () => {
	it('glbToTable() -> toScene() returns the original glb-frame point for 200 pseudo-random vectors spanning well beyond the playfield', () => {
		const rng = mulberry32(0xd914a);
		for (let i = 0; i < PROPERTY_SAMPLE_COUNT; i++) {
			const glbPoint: Vec3 = {
				x: randomRange(rng, -5, 5),
				y: randomRange(rng, -5, 5),
				z: randomRange(rng, -5, 5),
			};
			const table = glbToTable(glbPoint);
			const scene = toScene(table);
			expectClose(scene, glbPoint);
		}
	});

	it('toPhysics() -> fromPhysics() returns the original table-frame point for 200 pseudo-random millimetre vectors spanning well beyond the playfield', () => {
		const rng = mulberry32(0xd914b);
		for (let i = 0; i < PROPERTY_SAMPLE_COUNT; i++) {
			const point: Vec3 = {
				x: randomRange(rng, -2000, 2000),
				y: randomRange(rng, -2000, 2000),
				z: randomRange(rng, -2000, 2000),
			};
			const physics = toPhysics(point);
			const table = fromPhysics(physics);
			expectClose(table, point);
		}
	});

	it('every sampled point in both round-trips is genuinely distinct (the sample is not degenerate, e.g. all zeros)', () => {
		// Guards the property tests above against a broken RNG silently
		// generating the same point (or all zeros) every iteration, which
		// would make "200 samples" pass even though only one point was ever
		// actually exercised.
		const rng = mulberry32(0xd914a);
		const seen = new Set<string>();
		for (let i = 0; i < PROPERTY_SAMPLE_COUNT; i++) {
			const p = { x: randomRange(rng, -5, 5), y: randomRange(rng, -5, 5), z: randomRange(rng, -5, 5) };
			seen.add(`${p.x},${p.y},${p.z}`);
		}
		expect(seen.size).toBe(PROPERTY_SAMPLE_COUNT);
	});
});

// ---------------------------------------------------------------------------
// toPhysicsPlane() -- relocated here from src/sim/physics/loader/index.ts
// during this story's review pass (AD-10 "one converter"). It had no direct
// unit test of its own: the collision loader only ever calls it with the two
// planes the committed collision document happens to carry (col_playfield,
// col_glass -- both horizontal, normal {x:0,y:0,z:*}), which never exercises
// the y-flip the function's whole reason for existing is to apply. These
// tests drive the function directly with an oblique/vertical normal.
// ---------------------------------------------------------------------------

describe('sim/table/frames.ts -- toPhysicsPlane()', () => {
	it('flips the normal\'s y component and leaves x/z unchanged', () => {
		const { normal } = toPhysicsPlane({ x: 0.3, y: 0.4, z: 0.5 }, 100);
		expect(normal.x).toBeCloseTo(0.3, 9);
		expect(normal.y).toBeCloseTo(-0.4, 9);
		expect(normal.z).toBeCloseTo(0.5, 9);
	});

	it('a horizontal table-frame plane (col_playfield-shaped: normal {0,0,1}) maps to an unrotated physics plane at the same (scaled) height', () => {
		const { normal, d } = toPhysicsPlane({ x: 0, y: 0, z: 1 }, -19);
		expect(normal.x).toBeCloseTo(0, 9);
		expect(normal.y).toBeCloseTo(0, 9);
		expect(normal.z).toBeCloseTo(1, 9);
		expect(d).toBeCloseTo(-19 / MM_PER_VU, 9);
	});

	it('preserves the plane equation for every point actually on the plane, across oblique and vertical normals -- the invariant toPhysicsPlane() exists to protect', () => {
		// For each (normal, point) pair below, point lies ON the table-frame
		// plane by construction (dMm := normal . point). toPhysicsPlane() must
		// return a physics-frame (normal, d) that the SAME point, independently
		// converted through toPhysics(), still satisfies -- proving the two
		// conversions (point and plane) agree with each other, not just that
		// each looks individually plausible.
		const rng = mulberry32(0xd914c);
		for (let i = 0; i < 50; i++) {
			// A random unit-ish normal (not normalised -- toPhysicsPlane() makes
			// no normalisation claim, only a linear map) and a random point.
			const normal: Vec3 = {
				x: randomRange(rng, -1, 1),
				y: randomRange(rng, -1, 1),
				z: randomRange(rng, -1, 1),
			};
			const point: Vec3 = {
				x: randomRange(rng, 0, TABLE.reference.playfieldMm.w),
				y: randomRange(rng, 0, TABLE.reference.playfieldMm.h),
				z: randomRange(rng, -50, 400),
			};
			const dMm = normal.x * point.x + normal.y * point.y + normal.z * point.z;

			const { normal: physicsNormal, d } = toPhysicsPlane(normal, dMm);
			const physicsPoint = toPhysics(point);
			const lhs = physicsNormal.x * physicsPoint.x + physicsNormal.y * physicsPoint.y + physicsNormal.z * physicsPoint.z;

			expect(lhs, `sample ${i}: physicsNormal . toPhysics(point) should equal d`).toBeCloseTo(d, 6);
		}
	});

	it('negative control: naively reusing the table-frame normal unconverted (no y-flip) does NOT satisfy the plane equation for an oblique normal', () => {
		// Proves the property test above is discriminating, not vacuously true
		// for any returned normal -- the y-flip specifically matters.
		const normal: Vec3 = { x: 0.2, y: 0.9, z: 0.1 };
		const point: Vec3 = { x: 200, y: 400, z: 10 };
		const dMm = normal.x * point.x + normal.y * point.y + normal.z * point.z;

		const physicsPoint = toPhysics(point);
		const naiveLhs = normal.x * physicsPoint.x + normal.y * physicsPoint.y + normal.z * physicsPoint.z;
		const { d } = toPhysicsPlane(normal, dMm);

		expect(naiveLhs).not.toBeCloseTo(d, 3);
	});
});

// ---------------------------------------------------------------------------
// Story 1.7: `sim/physics/cabinet/index.ts`'s `cabinetAccelToPhysicsAccel()`
// -- the cabinet's own SI m/s^2 -> physics U/T^2 crossing (the acceleration
// analogue of `sim/physics/devices.ts`'s velocity crossing, divided by
// 100*100 = 10000 rather than 100 -- see that function's own doc comment).
// This is the ONE assertion that catches a units error in the ball-coupling
// arithmetic, which would otherwise present only as "the nudge feels wrong"
// (this story's spec, Tasks & Acceptance). `frames.ts` itself is NOT edited
// by this story -- the crossing lives in cabinet/index.ts, following the
// already-adjudicated frame/time-unit split `devices.ts:126-141` and
// `loop/index.ts:157-172` both state verbatim (Code Map, "Verified
// environment facts").
// ---------------------------------------------------------------------------

describe('sim/physics/cabinet -- cabinetAccelToPhysicsAccel() reproduces GRAVITYCONST (Story 1.7)', () => {
	it('converting 9.81 m/s^2 along table +Y reproduces GRAVITYCONST (1.81751) in magnitude, with the y axis flipped in sign', () => {
		const physicsAccel = cabinetAccelToPhysicsAccel({ x: 0, y: 9.81 });
		expect(physicsAccel.x).toBeCloseTo(0, 9);
		// Table +Y (away from the player) maps to physics -Y (PlayerPhysics's
		// own down-slope-toward-the-player convention, sim/table/frames.ts's
		// header) -- so a POSITIVE table-frame y-acceleration reproduces
		// GRAVITYCONST's magnitude with a NEGATIVE sign.
		expect(physicsAccel.y).toBeCloseTo(-GRAVITYCONST, 4);
	});

	it('the x axis is NOT flipped -- a table +X acceleration converts to a positive physics x acceleration', () => {
		const physicsAccel = cabinetAccelToPhysicsAccel({ x: 9.81, y: 0 });
		expect(physicsAccel.x).toBeCloseTo(GRAVITYCONST, 4);
		expect(physicsAccel.y).toBeCloseTo(0, 9);
	});

	it('is linear -- scaling the input scales the output by the same factor (a sanity check that this is a pure unit crossing, not an affine one)', () => {
		const base = cabinetAccelToPhysicsAccel({ x: 3.3, y: -1.7 });
		const scaled = cabinetAccelToPhysicsAccel({ x: 6.6, y: -3.4 });
		expect(scaled.x).toBeCloseTo(base.x * 2, 9);
		expect(scaled.y).toBeCloseTo(base.y * 2, 9);
	});

	it('zero acceleration converts to zero (the affine playfield-height translation must cancel exactly, as it does for toPhysics() itself)', () => {
		const physicsAccel = cabinetAccelToPhysicsAccel({ x: 0, y: 0 });
		expect(physicsAccel.x).toBe(0);
		expect(physicsAccel.y).toBe(0);
	});
});
