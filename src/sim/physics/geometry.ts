// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-61: `switches.ts`'s swept-segment/box intersection test and
// `devices.ts`'s own `segmentIntersectsBoxLocal` were two copies of the
// identical slab-method algorithm -- `devices.ts`'s own JSDoc already
// admitted it ("Local mirror of switches.ts's slab-method segment/box test
// ... re-deriving it"), and a fix applied to one silently missed the other.
// Both call sites are authored/editable (test/sim-boundary.test.ts's DW-79
// freeze), so the shared body lives here rather than in either sibling --
// `switches.ts` and `devices.ts` both import it.

import type { Vec3 } from '../table/frames';

/**
 * Segment-vs-axis-aligned-box intersection (the slab method): clips the
 * segment's parametric range `t ∈ [0, 1]` (from `before` to `after`) against
 * each axis's `[min, max]` slab. The segment intersects the box iff a
 * non-empty `t` range survives all three axes -- this is what makes a ball
 * whose START and END positions are both OUTSIDE a zone, but whose path
 * crosses through it within one tick, still register (switches.ts's I/O
 * matrix's "Swept-segment zone crossing" row).
 *
 * The degenerate zero-length segment (`before === after`, e.g. a ball
 * spawned already resting inside a zone) is handled by the `Math.abs(d) <
 * 1e-9` branch on every axis: with no displacement at all, the whole
 * segment's fate collapses to "does the start point already lie in the
 * slab" -- exactly the case a stationary ball inside a zone needs.
 */
export function segmentIntersectsBox(before: Vec3, after: Vec3, minMm: Vec3, maxMm: Vec3): boolean {
	let tMin = 0;
	let tMax = 1;
	for (const axis of ['x', 'y', 'z'] as const) {
		const p0 = before[axis];
		const d = after[axis] - p0;
		const lo = minMm[axis];
		const hi = maxMm[axis];
		if (Math.abs(d) < 1e-9) {
			// Not moving along this axis: the whole segment's fate on this axis
			// is decided by whether the start point already lies in the slab.
			if (p0 < lo || p0 > hi) {
				return false;
			}
			continue;
		}
		let t1 = (lo - p0) / d;
		let t2 = (hi - p0) / d;
		if (t1 > t2) {
			[t1, t2] = [t2, t1];
		}
		tMin = Math.max(tMin, t1);
		tMax = Math.min(tMax, t2);
		if (tMin > tMax) {
			return false;
		}
	}
	return true;
}
