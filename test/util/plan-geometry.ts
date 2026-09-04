// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1e task 1: `pointToSegmentDistanceMm()`, `pointInPolygon()` and
// `distanceToPolygonMm()`, moved VERBATIM out of
// `test/shot-routing.test.ts:320-357` (Story 2.1c task 2's own original
// authoring) and exported here, doc comments intact. Two consumers need
// them today: `assertReleaseClear()` (`test/shot-routing.test.ts`, unchanged
// behaviour) and `test/util/reachability.ts`'s own `closestApproachMm()`
// (new, this story) -- both measure a point's distance to a real body's
// footprint or to a witness's per-tick swept segment, and neither's
// behaviour changes by this move.

/** Shortest distance in mm from point `(px, py)` to the segment `(ax, ay)-(bx, by)`. */
export function pointToSegmentDistanceMm(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		return Math.hypot(px - ax, py - ay);
	}
	let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ray-casting point-in-polygon test (even-odd rule) over `poly`, a closed loop of `(x, y)` vertices in mm. */
export function pointInPolygon(px: number, py: number, poly: readonly { readonly x: number; readonly y: number }[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]!;
		const b = poly[j]!;
		const intersects = a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x;
		if (intersects) {
			inside = !inside;
		}
	}
	return inside;
}

/** 0 if `(px, py)` is inside the (convex, per AD-11) `poly`; otherwise the shortest distance to any of its edges. */
export function distanceToPolygonMm(px: number, py: number, poly: readonly { readonly x: number; readonly y: number }[]): number {
	if (pointInPolygon(px, py, poly)) {
		return 0;
	}
	let min = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!;
		const b = poly[(i + 1) % poly.length]!;
		min = Math.min(min, pointToSegmentDistanceMm(px, py, a.x, a.y, b.x, b.y));
	}
	return min;
}
