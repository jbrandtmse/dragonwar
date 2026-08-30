// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-61: direct coverage of the shared `segmentIntersectsBox` (AD-2, AD-11)
// -- the slab-method swept-segment/box intersection test both
// `sim/physics/switches.ts` (zone tracking) and `sim/physics/devices.ts`
// (non-parking slot-zone entry) now call, instead of each carrying its own
// copy. `test/switch-zones.test.ts` already exercises it indirectly through
// `createSwitchTracker()`; this file is the FIRST direct test of the
// function itself, including the degenerate zero-length segment (start
// point already inside the box) `test/machine-serve-drain.test.ts`'s own
// comment says was previously "verified by reading devices.ts's
// segmentIntersectsBoxLocal directly" -- by hand, never by a test.

import { describe, expect, it } from 'vitest';
import { segmentIntersectsBox } from '../src/sim/physics/geometry';
import type { Vec3 } from '../src/sim/table/frames';

const BOX_MIN: Vec3 = { x: 0, y: 0, z: 0 };
const BOX_MAX: Vec3 = { x: 10, y: 10, z: 10 };

describe('sim/physics/geometry.ts -- segmentIntersectsBox() (the slab method, AD-2)', () => {
	it('both endpoints OUTSIDE, but the segment crosses straight through -- the whole point of a SWEPT test, not an end-position test', () => {
		const before: Vec3 = { x: -5, y: 5, z: 5 };
		const after: Vec3 = { x: 15, y: 5, z: 5 };
		expect(segmentIntersectsBox(before, after, BOX_MIN, BOX_MAX)).toBe(true);
	});

	it('both endpoints OUTSIDE, and the segment never enters the box', () => {
		const before: Vec3 = { x: -5, y: 50, z: 5 };
		const after: Vec3 = { x: 15, y: 50, z: 5 };
		expect(segmentIntersectsBox(before, after, BOX_MIN, BOX_MAX)).toBe(false);
	});

	it('DEGENERATE zero-length segment: the start point already inside the box (before === after) registers as intersecting -- a ball spawned already resting inside a zone', () => {
		const point: Vec3 = { x: 5, y: 5, z: 5 };
		expect(segmentIntersectsBox(point, point, BOX_MIN, BOX_MAX)).toBe(true);
	});

	it('DEGENERATE zero-length segment: the start point outside the box does NOT register', () => {
		const point: Vec3 = { x: 50, y: 5, z: 5 };
		expect(segmentIntersectsBox(point, point, BOX_MIN, BOX_MAX)).toBe(false);
	});

	it('start INSIDE, end OUTSIDE -- a partial exit still registers', () => {
		const before: Vec3 = { x: 5, y: 5, z: 5 };
		const after: Vec3 = { x: 50, y: 5, z: 5 };
		expect(segmentIntersectsBox(before, after, BOX_MIN, BOX_MAX)).toBe(true);
	});

	it('the Z axis is genuinely clipped, not ignored: a segment that would cross the box\'s X/Y footprint is rejected once its Z range sits entirely above the box', () => {
		// Same X/Y sweep as the very first "crosses straight through" case
		// above, but at z = 50 the whole way -- outside [0, 10] on every axis
		// sample. If the Z-axis slab clip were dropped, this would wrongly
		// report an intersection using only X and Y.
		const before: Vec3 = { x: -5, y: 5, z: 50 };
		const after: Vec3 = { x: 15, y: 5, z: 50 };
		expect(segmentIntersectsBox(before, after, BOX_MIN, BOX_MAX)).toBe(false);
	});

	it('the Z axis genuinely PARTICIPATES in a real crossing too: a segment sweeping through Z, with X and Y already inside the box the whole time, still registers', () => {
		const before: Vec3 = { x: 5, y: 5, z: -5 };
		const after: Vec3 = { x: 5, y: 5, z: 15 };
		expect(segmentIntersectsBox(before, after, BOX_MIN, BOX_MAX)).toBe(true);
	});

	it('a segment that passes near but outside the box on one axis, while overlapping the OTHER two axes\' ranges, still does not intersect -- all three slabs must agree', () => {
		const before: Vec3 = { x: 5, y: 5, z: -50 };
		const after: Vec3 = { x: 5, y: 5, z: -20 };
		expect(segmentIntersectsBox(before, after, BOX_MIN, BOX_MAX)).toBe(false);
	});
});
