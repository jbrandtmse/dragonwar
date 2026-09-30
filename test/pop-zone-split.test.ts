// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.2 (DW-161, AC 4), QA -- two gaps in the pop-zone pins of
// test/pop-bumper.test.ts's "Story 5.2 (DW-161)" block.
//
//   1. Its disjoint case tested `overlapX > 0 && overlapY > 0` (corrected
//      to the closed form at the Story 5.2 review), so two zones that TOUCH
//      (sw_pop_3.minMm.y === sw_pop_1.maxMm.y) read as disjoint.
//      Switch zones are CLOSED boxes -- `segmentIntersectsBox()` in
//      `src/sim/physics/geometry.ts` accepts `lo <= p <= hi` -- so a ball on
//      the shared edge is inside both and makes two pop switches on one tick,
//      the exact DW-161 defect. The spec fixes the split as a real gap
//      (`POP_ZONE_SPLIT_GAP_MM = 1.0` between the facing edges); this file
//      pins closed-box disjointness and that 1 mm gap.
//   2. The spec's "the pop zones stay POP_ZONE_HALF_MM (38) on every edge
//      except the facing edges" (and AC 1's "switchZones differ only in the
//      three facing edges") was checked only by a scratchpad diff. Pinned
//      here against each pop's own centroid, so a non-facing edge that
//      drifts (still containing the contact disc, so the contact-disc case
//      stays green) is caught.
//
// Everything is read from the committed collision document through the real
// loader; which edges face is derived, never typed: the top pop by centroid
// faces, with its south edge, every other pop whose zone shares its x span
// (that pop's north edge).
//
// Falsifiability (Rule 19, recorded in the spec's Verification section):
// sw_pop_1/sw_pop_2 maxMm.y 834.0 -> 834.5 and sw_pop_3 minMm.y 835.0 ->
// 834.5 (touching) reddens the closed-box and gap cases (and, since the
// review, pop-bumper's disjoint case);
// sw_pop_1 minMm.x 92 -> 94 reddens the non-facing-edge case while
// pop-bumper's contact-disc case stays green.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollision } from '../src/sim/physics/loader';
import type { PopCoilName } from '../src/sim/physics/pops';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
/** The generator's POP_ZONE_HALF_MM: every non-facing edge's distance from its pop's centroid (the spec's DW-161 rule). */
const POP_ZONE_HALF_MM = 38;
/** The generator's POP_ZONE_SPLIT_GAP_MM: the gap between the facing edges (the spec's DW-161 rule). */
const POP_ZONE_SPLIT_GAP_MM = 1.0;
const EDGE_TOLERANCE_MM = 1e-9;
/** The spec's amended DW-161 facing edges (split at y 834.5): sw_pop_1/sw_pop_2 maxMm.y and sw_pop_3 minMm.y. */
const SPEC_LOW_NORTH_EDGE_MM = 834.0;
const SPEC_HIGH_SOUTH_EDGE_MM = 835.0;

interface Box {
	readonly minMm: { readonly x: number; readonly y: number };
	readonly maxMm: { readonly x: number; readonly y: number };
}

function popZones(): { zones: Array<{ coil: PopCoilName; zone: Box; centre: { x: number; y: number } }> } {
	const loaded = loadCollision(JSON.parse(readFileSync(COLLISION_PATH, 'utf8')), resolveTuning());
	const coils = Object.keys(TABLE.popWiring) as PopCoilName[];
	return {
		zones: coils.map((coil) => {
			const zone = loaded.switchZones.find((z) => z.switch === TABLE.popWiring[coil].switch);
			if (!zone) {
				throw new Error(`test fixture is broken: no switch zone for ${TABLE.popWiring[coil].switch}`);
			}
			return { coil, zone, centre: loaded.popCentroidsMm[coil] };
		}),
	};
}

/** The largest separation between two CLOSED boxes along x or y: > 0 only when no point (edges included) lies in both. */
function closedBoxSeparation(a: Box, b: Box): number {
	const gapX = Math.max(a.minMm.x - b.maxMm.x, b.minMm.x - a.maxMm.x);
	const gapY = Math.max(a.minMm.y - b.maxMm.y, b.minMm.y - a.maxMm.y);
	return Math.max(gapX, gapY);
}

/** The top pop (c_pop_3) and the pops below it whose zones share an x span with it -- the facing pairs. */
function facingPairs(zones: ReturnType<typeof popZones>['zones']): { high: (typeof zones)[number]; lows: Array<(typeof zones)[number]> } {
	const high = zones.reduce((best, z) => (z.centre.y > best.centre.y ? z : best));
	const lows = zones.filter((z) => z !== high && Math.min(z.zone.maxMm.x, high.zone.maxMm.x) > Math.max(z.zone.minMm.x, high.zone.minMm.x));
	return { high, lows };
}

describe('Story 5.2 (DW-161) QA -- the pop zones are disjoint as CLOSED boxes, split by the 1 mm gap, and keep 38 mm on every other edge', () => {
	it('the closed-box separation check is falsifiable on its own: touching boxes read 0 (not disjoint), overlapping boxes read < 0, 1 mm apart reads 1', () => {
		const a: Box = { minMm: { x: 0, y: 0 }, maxMm: { x: 10, y: 10 } };
		expect(closedBoxSeparation(a, { minMm: { x: 5, y: 10 }, maxMm: { x: 15, y: 20 } }), 'touching on an edge').toBe(0);
		expect(closedBoxSeparation(a, { minMm: { x: 5, y: 4 }, maxMm: { x: 15, y: 20 } }), 'overlapping').toBeLessThan(0);
		expect(closedBoxSeparation(a, { minMm: { x: 5, y: 11 }, maxMm: { x: 15, y: 20 } }), '1 mm apart').toBe(1);
	});

	it('no point -- a shared edge included -- lies in two pop zones (switch zones are closed: segmentIntersectsBox accepts lo <= p <= hi)', () => {
		const { zones } = popZones();
		expect(zones.length, 'non-vacuity: the pops from TABLE.popWiring').toBeGreaterThanOrEqual(3);
		for (let i = 0; i < zones.length; i++) {
			for (let j = i + 1; j < zones.length; j++) {
				const separation = closedBoxSeparation(zones[i]!.zone, zones[j]!.zone);
				expect(separation, `${zones[i]!.coil}'s and ${zones[j]!.coil}'s closed zones are separated by ${separation.toFixed(3)} mm (<= 0: some point lies in both)`).toBeGreaterThan(0);
			}
		}
	});

	it('each facing pair is split by at least POP_ZONE_SPLIT_GAP_MM (1.0 mm): the upper pop\'s south edge minus the lower pop\'s north edge', () => {
		const { high, lows } = facingPairs(popZones().zones);
		expect(high.coil, 'the top pop, found by centroid').toBe('c_pop_3');
		expect(lows.map((z) => z.coil).sort(), 'non-vacuity: the lower pair shares an x span with the top pop').toEqual(['c_pop_1', 'c_pop_2']);
		for (const low of lows) {
			const gap = high.zone.minMm.y - low.zone.maxMm.y;
			expect(gap, `${low.coil} north edge ${low.zone.maxMm.y} vs ${high.coil} south edge ${high.zone.minMm.y}: gap ${gap.toFixed(3)} mm`).toBeGreaterThanOrEqual(POP_ZONE_SPLIT_GAP_MM - EDGE_TOLERANCE_MM);
			// [Story 5.2 review] The spec's amended values exactly: the split is a
			// measured knife edge (shot-routing 'lane 1' strands at 834.5 / 835.5
			// and 835.0 / 836.0), so any other value is a re-measurement, not a tweak.
			// mutation: sw_pop_3 minMm.y 835.0 -> 836.0 -> red here (every other pop case green).
			expect(low.zone.maxMm.y, `${low.coil} north edge: the spec's DW-161 value`).toBe(SPEC_LOW_NORTH_EDGE_MM);
		}
		expect(high.zone.minMm.y, `${high.coil} south edge: the spec's DW-161 value`).toBe(SPEC_HIGH_SOUTH_EDGE_MM);
	});

	it('every NON-facing edge stays POP_ZONE_HALF_MM (38) from its pop\'s centroid; only the facing edges moved', () => {
		const { zones } = popZones();
		const { high, lows } = facingPairs(zones);
		let edges = 0;
		for (const { coil, zone, centre } of zones) {
			const facing = new Set<string>();
			if (coil === high.coil) {
				facing.add('minMm.y');
			}
			if (lows.some((z) => z.coil === coil)) {
				facing.add('maxMm.y');
			}
			const expected: Record<string, number> = {
				'minMm.x': centre.x - POP_ZONE_HALF_MM,
				'maxMm.x': centre.x + POP_ZONE_HALF_MM,
				'minMm.y': centre.y - POP_ZONE_HALF_MM,
				'maxMm.y': centre.y + POP_ZONE_HALF_MM,
			};
			const actual: Record<string, number> = { 'minMm.x': zone.minMm.x, 'maxMm.x': zone.maxMm.x, 'minMm.y': zone.minMm.y, 'maxMm.y': zone.maxMm.y };
			for (const edge of Object.keys(expected)) {
				if (facing.has(edge)) {
					// A facing edge is pulled INSIDE the 38 mm box, never pushed out.
					expect(Math.abs(actual[edge]! - centre[edge.endsWith('x') ? 'x' : 'y']), `${coil} ${edge} (facing): inside the 38 mm box`).toBeLessThan(POP_ZONE_HALF_MM);
					continue;
				}
				expect(Math.abs(actual[edge]! - expected[edge]!), `${coil} ${edge}: ${actual[edge]} vs centroid ${edge.endsWith('x') ? centre.x : centre.y} ${edge.startsWith('min') ? '-' : '+'} ${POP_ZONE_HALF_MM}`).toBeLessThanOrEqual(EDGE_TOLERANCE_MM);
				edges += 1;
			}
		}
		expect(edges, 'non-vacuity: three non-facing edges per pop').toBe(3 * zones.length);
	});
});
