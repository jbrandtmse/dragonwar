// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's third acceptance criterion: `sim/table/frames.ts` is the only
// file under `src/` that converts units or axes, exports `glbToTable()`,
// `toPhysics()`, `fromPhysics()` and `toScene()`, and round-trips a point
// through glb -> table -> scene and table -> physics -> table within
// floating-point tolerance.

import { describe, expect, it } from 'vitest';
import { MM_PER_VU, fromPhysics, glbToTable, toPhysics, toScene, type Vec3 } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';

const EPSILON = 1e-9;

function expectClose(actual: Vec3, expected: Vec3, epsilon = EPSILON): void {
	expect(actual.x, `x: ${actual.x} !~ ${expected.x}`).toBeCloseTo(expected.x, 9);
	expect(actual.y, `y: ${actual.y} !~ ${expected.y}`).toBeCloseTo(expected.y, 9);
	expect(actual.z, `z: ${actual.z} !~ ${expected.z}`).toBeCloseTo(expected.z, 9);
	void epsilon;
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
