// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-111 (Story 2.1a QA pass): the bat's tip circle sweeps from rest
// (~141 deg / ~-141 deg) to end-of-stroke (90 deg / -90 deg) at radius
// `flipperRadius + endRadius` from the pivot, passing close to the new
// `col_post_pocket_l/r` and `col_guide_outer_l/r` nodes by design (this
// story's Design Notes, "Why the pocket closes at the tip, not the pivot").
// Before this test, clearance across that sweep was verified only
// empirically / "by hand" during planning (the seeding script's own
// comments), and the existing flipper-mover.test.ts coverage only pins the
// two SETTLED endpoints (rest and end-of-stroke angles) -- a mid-stroke clip
// would leave those two exact-angle assertions untouched, so a future change
// to `sweepDeg`, `endRadiusRatio`, or a post/guide placement constant could
// reintroduce a clip undetected.
//
// This test drives the REAL mover through the REAL `createLoop()` conductor
// (the same loop-tier harness `test/flipper-mover.test.ts` already
// established) for each flipper, and at every tick of the stroke computes
// the swept tip circle's centre (same geometry `FlipperMover` itself uses:
// `center + flipperRadius * (sin(angle), -cos(angle))`, this file's own
// header, `src/sim/physics/flipper/flipper-config.ts`) and checks it never
// overlaps the two nearby guide/post footprints -- a genuinely continuous
// check across the whole physically-reached angle range (including the
// mover's own end-of-stroke overshoot), not just the two settled endpoints.
//
// Scope: only `col_post_pocket_*` and `col_guide_outer_*` are checked -- the
// two nodes this story's own Design Notes and the ledger's DW-111 entry name
// as sitting close to the sweep by design. Code review 2026-08-31 widened
// the BODY side of that scope: the check now covers the whole modelled
// capsule (base circle, arm flanks and end circle), not the tip circle
// alone -- see the axis-sampling comment inside the test for why the
// tip-only metric could not be trusted in the direction DW-111 names.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import type { InputTransition } from '../src/sim/contracts/input';
import { loadCollision } from '../src/sim/physics/loader';
import { buildFlipperConfig } from '../src/sim/physics/flipper/flipper-config';
import { resolveTuning } from '../src/sim/table/tuning';
import { fromPhysics, MM_PER_VU } from '../src/sim/table/frames';
import { degToRad } from '../src/sim/physics/math/float';
import { TABLE } from '../src/sim/table/dragonwar';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

interface RawFootprintNode {
	readonly name: string;
	readonly footprintMm?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function loadRawNodes(): readonly RawFootprintNode[] {
	const doc = JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as { nodes: readonly RawFootprintNode[] };
	return doc.nodes;
}

function findFootprintMm(nodes: readonly RawFootprintNode[], name: string): ReadonlyArray<{ x: number; y: number }> {
	const node = nodes.find((n) => n.name === name);
	if (!node) {
		throw new Error(`expected node "${name}" in the committed collision document, found none`);
	}
	if (!node.footprintMm || node.footprintMm.length < 3) {
		throw new Error(`expected node "${name}" to carry a footprintMm polygon (>= 3 vertices), found ${JSON.stringify(node.footprintMm)}`);
	}
	return node.footprintMm;
}

/** Shortest distance from `point` (table mm) to `segment` [a, b] (table mm). */
function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const lenSq = abx * abx + aby * aby;
	const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq));
	const closestX = a.x + t * abx;
	const closestY = a.y + t * aby;
	return Math.hypot(point.x - closestX, point.y - closestY);
}

/**
 * Shortest distance from `point` (table mm) to the convex polygon `footprintMm`
 * (table mm, `>= 3` vertices, winding not assumed). Returns 0 if `point` is
 * inside (or on the boundary of) the polygon -- "inside" is detected in a
 * winding-agnostic way: every edge's cross product against the point has the
 * SAME sign (or is zero) for a convex polygon, regardless of whether the ring
 * runs CW or CCW.
 */
function distanceToConvexPolygon(point: { x: number; y: number }, footprintMm: ReadonlyArray<{ x: number; y: number }>): number {
	let sawPositive = false;
	let sawNegative = false;
	for (let i = 0; i < footprintMm.length; i++) {
		const a = footprintMm[i];
		const b = footprintMm[(i + 1) % footprintMm.length];
		const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
		if (cross > 0) sawPositive = true;
		if (cross < 0) sawNegative = true;
	}
	if (!(sawPositive && sawNegative)) {
		return 0; // every edge agreed in sign (or was exactly on an edge) -- point is inside or on the boundary.
	}

	let minDistance = Infinity;
	for (let i = 0; i < footprintMm.length; i++) {
		const a = footprintMm[i];
		const b = footprintMm[(i + 1) % footprintMm.length];
		minDistance = Math.min(minDistance, distanceToSegment(point, a, b));
	}
	return minDistance;
}

// Story 2.1c task 12: the list was FIXED at two entries, so a new body drawn
// near a bat could enter the swept envelope undetected -- and this story
// draws exactly that, an inlane feed ramp that ends a few centimetres above
// each pivot with a rubber post on its end. Both feeds and both end posts
// join the list. The two 2.1a entries keep their own measured thresholds
// (> 12 mm post, > 15 mm guide) untouched; the new pair carries its own,
// pinned a few mm under this story's own measurement the same way.
const CASES = [
	{ side: 'l' as const, key: 'flipper_l' as const, postName: 'col_post_pocket_l', guideName: 'col_guide_outer_l', postMinMm: 12, guideMinMm: 15 },
	{ side: 'r' as const, key: 'flipper_r' as const, postName: 'col_post_pocket_r', guideName: 'col_guide_outer_r', postMinMm: 12, guideMinMm: 15 },
	{ side: 'l' as const, key: 'flipper_l' as const, postName: 'col_post_feed_l_lo', guideName: 'col_guide_inlane_feed_l', postMinMm: 12, guideMinMm: 12 },
	{ side: 'r' as const, key: 'flipper_r' as const, postName: 'col_post_feed_r_lo', guideName: 'col_guide_inlane_feed_r', postMinMm: 12, guideMinMm: 12 },
];

const THROAT_CASES = [
	{ side: 'l' as const, wallName: 'col_wall_bottom_l' },
	{ side: 'r' as const, wallName: 'col_wall_bottom_r' },
];

describe('the flipper bat clears the drain-triangle pocket post and outer guide across the FULL stroke, not just the two settled endpoints (DW-111)', () => {
	it.each(CASES)('$side flipper: the swept modelled body never overlaps $postName or $guideName at any sampled angle of the stroke', ({ side, key, postName, guideName, postMinMm, guideMinMm }) => {
		const rawNodes = loadRawNodes();
		const postFootprint = findFootprintMm(rawNodes, postName);
		const guideFootprint = findFootprintMm(rawNodes, guideName);

		const tuning = resolveTuning();
		const { flippers } = loadCollision(loadDoc());
		const flipper = flippers.find((f) => f.side === side);
		if (!flipper) {
			throw new Error(`expected a "${side}"-side flipper in the loaded collision document, found none`);
		}
		const config = buildFlipperConfig(flipper, tuning);
		// A length (radius), not a position, so `fromPhysics()`'s additive
		// table-height offset does not apply -- physics<->table is a uniform
		// scale by MM_PER_VU on both axes (`src/sim/table/frames.ts`'s own
		// header), so this is the exact tip-circle radius in table mm.
		const endRadiusMm = config.endRadius * MM_PER_VU;

		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(5, []); // settle at rest first, matching test/flipper-mover.test.ts's own pattern.
		const transitions: InputTransition[] = [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, [key]: true } }];
		out = loop.advance(1, transitions);

		// 250 ticks at TICK_HZ = 1000 comfortably covers the whole stroke,
		// including the mover's own end-of-stroke overshoot and settle-back
		// (test/flipper-mover.test.ts's header: crosses end-of-stroke around
		// tick 32, overshoots to ~94.2 deg around tick 38, then damps back --
		// all well inside this window).
		// Code review 2026-08-31: the shipped form measured the TIP CIRCLE
		// only. That metric is not monotonic in the direction DW-111 names:
		// a post or guide moved TOWARD the pivot is clipped by the bat's ARM
		// while the tip centre's closest approach gets LARGER, so the number
		// improves as the collision gets worse. The modelled body is a
		// tapered capsule -- `hitCircleBase` (radius `baseRadius`) at the
		// pivot, `hitCircleEnd` (radius `endRadius`) at the tip, and the two
		// tangent `LineSeg` flanks between them (`FlipperHit`'s own
		// construction). For two circles of radii rb, re a distance L apart,
		// the external tangent's perpendicular distance from the axis point
		// at parameter t is EXACTLY `lerp(rb, re, t)` -- so sampling the
		// pivot-to-tip axis and subtracting that lerp measures clearance
		// against the WHOLE body, with the two end circles as the t = 0 and
		// t = 1 cases. The base circle is included for free, which also
		// retires the shipped scope note's carve-out for it.
		const baseRadiusMm = config.baseRadius * MM_PER_VU;
		const AXIS_SAMPLES = 40;
		const clearanceToBodyMm = (footprint: ReadonlyArray<{ x: number; y: number }>, centerMm: { x: number; y: number }, tipMm: { x: number; y: number }): number => {
			let worst = Infinity;
			for (let s = 0; s <= AXIS_SAMPLES; s++) {
				const t = s / AXIS_SAMPLES;
				const pointMm = { x: centerMm.x + (tipMm.x - centerMm.x) * t, y: centerMm.y + (tipMm.y - centerMm.y) * t };
				const radiusAtTMm = baseRadiusMm + (endRadiusMm - baseRadiusMm) * t;
				worst = Math.min(worst, distanceToConvexPolygon(pointMm, footprint) - radiusAtTMm);
			}
			return worst;
		};

		const centerMm = fromPhysics({ x: config.center.x, y: config.center.y, z: 0 });
		let minPostClearanceMm = Infinity;
		let minGuideClearanceMm = Infinity;
		let minSampledAngleDeg = Infinity;
		let maxSampledAngleDeg = -Infinity;
		for (let i = 0; i < 250; i++) {
			out = loop.advance(1, []);
			const angleDeg = out.snapshot.mechanisms.flippers[side].angleDeg;
			const angleRad = degToRad(angleDeg);
			minSampledAngleDeg = Math.min(minSampledAngleDeg, Math.abs(angleDeg));
			maxSampledAngleDeg = Math.max(maxSampledAngleDeg, Math.abs(angleDeg));
			// Same formula the ported FlipperMover itself uses for the tip's
			// local offset at a given angle (this file's header): local (0,
			// -flipperRadius) rotated by `angle`.
			const tipPhys = {
				x: config.center.x + config.flipperRadius * Math.sin(angleRad),
				y: config.center.y - config.flipperRadius * Math.cos(angleRad),
				z: 0,
			};
			const tipMm = fromPhysics(tipPhys);

			minPostClearanceMm = Math.min(minPostClearanceMm, clearanceToBodyMm(postFootprint, centerMm, tipMm));
			minGuideClearanceMm = Math.min(minGuideClearanceMm, clearanceToBodyMm(guideFootprint, centerMm, tipMm));
		}

		// Code review 2026-08-31 (Rule 19): the shipped sanity assertion was
		// `expect(sampledTicks).toBe(250)` against a counter incremented once
		// per iteration of a `for (i < 250)` loop -- arithmetically forced,
		// so it could not fail. It therefore did NOT establish what it
		// claimed: that a stroke was swept at all. If anything ever stops
		// this harness driving the bat (a renamed InputFrame key, advance()'s
		// frame-persistence contract changing), every sample would be the
		// rest pose -- where the bat clears both nodes comfortably by design
		// -- and the test would stay green while checking nothing. The angles
		// are reported as absolute degrees so the one expression covers both
		// sides (the right bat sweeps -141 deg -> -90 deg).
		const sweptDeg = maxSampledAngleDeg - minSampledAngleDeg;
		expect(
			sweptDeg,
			`the sampled window must actually contain the stroke, not just the rest pose: sampled |angle| ranged ${minSampledAngleDeg.toFixed(4)} deg to ${maxSampledAngleDeg.toFixed(4)} deg (${sweptDeg.toFixed(4)} deg swept)`,
		).toBeGreaterThan(40);
		expect(
			minSampledAngleDeg,
			`the stroke must reach the end-of-stroke stop (|90| deg) within the sampled window; closest sampled |angle| was ${minSampledAngleDeg.toFixed(4)} deg`,
		).toBeLessThan(90.01);
		// Code review 2026-08-31 (rework iteration 4, task 28): both bounds used to
		// be an exact `>= 0`, so a body that grazes a post or guide at precisely
		// 0.000 mm -- or a redesign that halves the real margin -- would pass
		// silently, and no measured worst-case number was pinned anywhere. Measured
		// this pass (both sides symmetric): post clearance 14.1945 mm, guide
		// clearance 17.0770 mm. Pinned a few mm below each measurement --
		// comfortably clear of the AXIS_SAMPLES=40 sampling step (~1.48 mm of the
		// pivot-to-tip axis per sample) and of ordinary solver float noise across
		// hosts, while still catching a margin roughly halved or worse.
		expect(
			minPostClearanceMm,
			`${postName}: the swept modelled body's clearance narrowed below the pinned minimum (worst-case clearance ${minPostClearanceMm.toFixed(3)} mm; negative means overlap)`,
		).toBeGreaterThan(postMinMm);
		expect(
			minGuideClearanceMm,
			`${guideName}: the swept modelled body's clearance narrowed below the pinned minimum (worst-case clearance ${minGuideClearanceMm.toFixed(3)} mm; negative means overlap)`,
		).toBeGreaterThan(guideMinMm);
	});
});

describe('the drain-end throat between the AT-REST bat and each bottom wall stays wider than the reference ball (Story 2.1a AC 10 / AC 7, DW-119)', () => {
	// Code review, 2026-08-31 (iteration 4, final pass). Every ball that
	// drains off a bottom wall's new ramp has to pass between that wall and
	// the AT-REST bat above it -- and that throat is the tightest clearance
	// anywhere on the game's own default ball path. Measured on the committed
	// geometry: 27.1272 mm, against a 26.99 mm reference ball. 0.137 mm.
	//
	// It is also, silently, the real constraint on
	// tools/make-placeholder-blend.py's BOTTOM_WALL_DRAIN_DROP_MM. Solving
	// the throat for the drop shows it must exceed 9.863 mm for a ball to fit
	// through AT ALL; the shipped value is 10.0. The seeding script's own
	// comment justifies 10.0 only against an UPPER bound ("kept well short of
	// the full WALL_T_MM (12 mm) depth"), and says nothing about the lower
	// one -- so a future author reading that comment could reduce the drop to
	// a value that looks safer by its stated reasoning and reintroduce the
	// DW-119 jam at the drain end of both walls. This gate names that
	// constraint where the geometry can be measured, so the failure reports
	// the throat rather than an opaque "never drained".
	//
	// mutation: reduce BOTTOM_WALL_DRAIN_DROP_MM from 10.0 to 9.0 in the
	// seeding script and re-export (equivalently: raise either wall's
	// drain-facing top vertex from y = -10 to y = -9 in the committed
	// collision document) -> this assertion goes red reporting a throat
	// below the 26.99 mm reference ball.
	it.each(THROAT_CASES)('$side: the at-rest bat body clears $wallName by more than one ball diameter', ({ side, wallName }) => {
		const rawNodes = loadRawNodes();
		const wallFootprint = findFootprintMm(rawNodes, wallName);

		const tuning = resolveTuning();
		const { flippers } = loadCollision(loadDoc());
		const flipper = flippers.find((f) => f.side === side);
		if (!flipper) {
			throw new Error(`expected a "${side}"-side flipper in the loaded collision document, found none`);
		}
		const config = buildFlipperConfig(flipper, tuning);
		const baseRadiusMm = config.baseRadius * MM_PER_VU;
		const endRadiusMm = config.endRadius * MM_PER_VU;
		const centerMm = fromPhysics({ x: config.center.x, y: config.center.y, z: 0 });
		// The bat at REST is the worst case: the stroke lifts it away from the
		// bottom wall, so every other angle clears by more (measured: 65.5 mm
		// at end-of-stroke on the left, 64.7 mm on the right).
		const restRad = config.angleStart;
		const tipMm = fromPhysics({
			x: config.center.x + config.flipperRadius * Math.sin(restRad),
			y: config.center.y - config.flipperRadius * Math.cos(restRad),
			z: 0,
		});

		// Same tapered-capsule metric the stroke test above uses: sample the
		// pivot-to-tip axis and subtract lerp(baseRadius, endRadius, t), which
		// is exactly the body's own half-width at that axis point.
		const AXIS_SAMPLES = 400; // finer than the stroke test's 40 -- one angle, so the sampling cost is trivial and the reported figure is sharp
		let throatMm = Infinity;
		for (let sample = 0; sample <= AXIS_SAMPLES; sample++) {
			const t = sample / AXIS_SAMPLES;
			const pointMm = { x: centerMm.x + (tipMm.x - centerMm.x) * t, y: centerMm.y + (tipMm.y - centerMm.y) * t };
			const radiusAtTMm = baseRadiusMm + (endRadiusMm - baseRadiusMm) * t;
			throatMm = Math.min(throatMm, distanceToConvexPolygon(pointMm, wallFootprint) - radiusAtTMm);
		}

		expect(
			throatMm,
			`the gap between the at-rest ${side} bat's modelled body and ${wallName} measures ${throatMm.toFixed(4)} mm; a ball draining off that wall's ramp must fit through it, and the reference ball is ${TABLE.reference.ballMm} mm across. The margin here is deliberately thin (measured 27.1272 mm as authored) and is what really bounds BOTTOM_WALL_DRAIN_DROP_MM from below -- see this describe block's own comment before widening or narrowing either.`,
		).toBeGreaterThan(TABLE.reference.ballMm);
	});
});
