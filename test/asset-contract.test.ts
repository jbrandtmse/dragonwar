// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4 -- the CI-safe half of the asset pipeline's test coverage: reads
// the COMMITTED public/assets/dragonwar.glb and dragonwar.collision.json off
// disk and validates both against TABLE, with no Blender involved at all, so
// this suite runs on every push including ubuntu-latest CI. Node-only glTF
// JSON-chunk parsing (no Babylon): validating the raw glTF node/extras
// structure is simpler and more direct than round-tripping through Babylon's
// scene loader, which does not expose `extras` in an easily inspectable form
// (verified during this story's implementation).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { TUNING } from '../src/sim/table/tuning';
import { CONTACT_SURFACES } from '../src/sim/contracts/events';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const NAME_GRAMMAR = /^[a-z][a-z0-9_]*$/;

interface GltfNode {
	name?: string;
	mesh?: number;
	children?: number[];
	extras?: Record<string, unknown>;
}

interface GltfMeshPrimitive {
	attributes: Record<string, number>;
}

interface GltfMesh {
	name?: string;
	primitives: GltfMeshPrimitive[];
}

interface GltfDocument {
	nodes: GltfNode[];
	meshes: GltfMesh[];
}

function readGlbJson(): GltfDocument {
	const bytes = readFileSync(GLB_PATH);
	expect(bytes.readUInt32LE(0), 'glb magic').toBe(0x46546c67);
	expect(bytes.readUInt32LE(4), 'glb version').toBe(2);
	const jsonLength = bytes.readUInt32LE(12);
	expect(bytes.readUInt32LE(16), 'first chunk type must be JSON').toBe(0x4e4f534a);
	const json = bytes.subarray(20, 20 + jsonLength).toString('utf8');
	return JSON.parse(json) as GltfDocument;
}

interface CollisionDocForTest {
	nodes: Array<{
		name: string;
		shape: string;
		surface?: string;
		physMaterial?: string;
		bboxMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
		footprintMm?: Array<{ x: number; y: number }>;
	}>;
	switchZones: Array<{ name: string; switch: string; minMm: { x: number; y: number; z: number }; maxMm: { x: number; y: number; z: number } }>;
}

function readCollisionDoc(): CollisionDocForTest {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** The shoelace formula's signed area, over a closed polygon (no repeated closing point). */
function polygonArea(points: Array<{ x: number; y: number }>): number {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		area += a.x * b.y - b.x * a.y;
	}
	return Math.abs(area) / 2;
}

describe('asset contract -- public/assets/dragonwar.glb, node grammar and structure (AD-11)', () => {
	it('every node name matches ^[a-z][a-z0-9_]*$', () => {
		const doc = readGlbJson();
		expect(doc.nodes.length).toBeGreaterThan(0);
		for (const node of doc.nodes) {
			expect(node.name, `node name "${node.name}" violates the grammar`).toMatch(NAME_GRAMMAR);
		}
	});

	it('carries exactly the three top-level TABLE.nodes names', () => {
		const doc = readGlbJson();
		const names = new Set(doc.nodes.map((n) => n.name));
		expect(names.has(TABLE.nodes.playfieldRoot)).toBe(true);
		expect(names.has(TABLE.nodes.cabinetRoot)).toBe(true);
		expect(names.has(TABLE.nodes.pivotPitch)).toBe(true);
		// col_/sw_ nodes are collision-only and never reach the glb (Design
		// Notes, "What goes into the glb").
		expect(names.has(TABLE.nodes.colPlayfield)).toBe(false);
	});

	it('carries every TABLE.ballDevices name (the mechanism nodes named as their device -- Design Notes, "What goes into the glb")', () => {
		const doc = readGlbJson();
		const names = new Set(doc.nodes.map((n) => n.name));
		for (const deviceName of Object.keys(TABLE.ballDevices)) {
			expect(names.has(deviceName), `glb is missing the "${deviceName}" mechanism node`).toBe(true);
		}
	});

	it('every mesh carries TEXCOORD_1 (a second UV layer -- AD-12)', () => {
		const doc = readGlbJson();
		const meshNodes = doc.nodes.filter((n) => n.mesh !== undefined);
		expect(meshNodes.length).toBeGreaterThan(0);
		for (const node of meshNodes) {
			const mesh = doc.meshes[node.mesh!];
			for (const primitive of mesh.primitives) {
				expect(primitive.attributes.TEXCOORD_0, `${node.name}: missing TEXCOORD_0`).toBeDefined();
				expect(primitive.attributes.TEXCOORD_1, `${node.name}: missing TEXCOORD_1 (AD-12's asset contract)`).toBeDefined();
			}
		}
	});

	it('every static mesh carries a lightgroup extra from TABLE.lightGroups', () => {
		const doc = readGlbJson();
		const knownLightGroups = new Set(Object.keys(TABLE.lightGroups));
		const meshNodes = doc.nodes.filter((n) => n.mesh !== undefined);
		expect(meshNodes.length).toBeGreaterThan(0);
		for (const node of meshNodes) {
			const lightgroup = node.extras?.lightgroup;
			expect(lightgroup, `${node.name}: missing "lightgroup" extra`).toBeDefined();
			expect(knownLightGroups.has(lightgroup as string), `${node.name}: unknown lightgroup "${lightgroup}"`).toBe(true);
		}
	});
});

describe('asset contract -- public/assets/dragonwar.collision.json, node grammar and property values (AD-11)', () => {
	it('every node name matches ^[a-z][a-z0-9_]*$', () => {
		const doc = readCollisionDoc();
		expect(doc.nodes.length).toBeGreaterThan(0);
		for (const node of doc.nodes) {
			expect(node.name).toMatch(NAME_GRAMMAR);
		}
		for (const zone of doc.switchZones) {
			expect(zone.name).toMatch(NAME_GRAMMAR);
		}
	});

	it('every surface value is a known TABLE.physMaterials-adjacent CONTACT_SURFACES member', () => {
		const doc = readCollisionDoc();
		const known = new Set(CONTACT_SURFACES);
		for (const node of doc.nodes) {
			// toBeDefined() only rejects undefined, not null (review finding, this
			// story's review pass) -- export.py's obj.get('surface') could in
			// principle serialise as JSON null, which toBeDefined() would pass.
			expect(typeof node.surface, `${node.name}: missing surface`).toBe('string');
			expect(known.has(node.surface as (typeof CONTACT_SURFACES)[number]), `${node.name}: unknown surface "${node.surface}"`).toBe(true);
		}
	});

	it('every phys_material value is a known TABLE.physMaterials key', () => {
		const doc = readCollisionDoc();
		const known = new Set(Object.keys(TABLE.physMaterials));
		for (const node of doc.nodes) {
			// Same reasoning as the surface check above: reject null, not just undefined.
			expect(typeof node.physMaterial, `${node.name}: missing physMaterial`).toBe('string');
			expect(known.has(node.physMaterial as string), `${node.name}: unknown physMaterial "${node.physMaterial}"`).toBe(true);
		}
	});

	it('every switch zone names a known TABLE.switches key', () => {
		const doc = readCollisionDoc();
		const known = new Set(Object.keys(TABLE.switches));
		expect(doc.switchZones.length).toBeGreaterThan(0);
		for (const zone of doc.switchZones) {
			expect(known.has(zone.switch), `${zone.name}: unknown switch "${zone.switch}"`).toBe(true);
		}
	});

	it('the committed reference dimensions match TABLE.reference within tolerance (col_playfield)', () => {
		const doc = readCollisionDoc();
		const playfield = doc.nodes.find((n) => n.name === TABLE.nodes.colPlayfield)!;
		expect(playfield).toBeDefined();
		const w = playfield.bboxMm.max.x - playfield.bboxMm.min.x;
		const h = playfield.bboxMm.max.y - playfield.bboxMm.min.y;
		expect(w).toBeCloseTo(TABLE.reference.playfieldMm.w, 1);
		expect(h).toBeCloseTo(TABLE.reference.playfieldMm.h, 1);
	});

	it('both flipper nodes measure the reference bat length on the x axis within tolerance (DW-48)', () => {
		// DW-48's unmentioned twin (this story's own task list): the
		// axis-agnostic `Math.max` over all three extents let a bat measuring
		// the reference length on the WRONG axis pass silently, the same
		// defect `loader/index.ts`'s own per-axis assertion closes. This
		// document-grammar check must measure the SAME axis (x -- the
		// committed body is x-major) that the loader itself does, not merely
		// "some axis is long enough".
		const doc = readCollisionDoc();
		const expectedMm = TABLE.reference.flipperBatIn * 25.4;
		for (const nodeName of [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR]) {
			const node = doc.nodes.find((n) => n.name === nodeName)!;
			expect(node, `${nodeName} missing from collision doc`).toBeDefined();
			const b = node.bboxMm;
			const measured = b.max.x - b.min.x;
			expect(measured, `${nodeName}: x extent`).toBeCloseTo(expectedMm, 1);
		}
	});
});

describe('asset contract -- Story 1.5: the drain aperture is tiled with no gap (DW-58)', () => {
	it('the four sw_trough_* zones tile x in [200, 314.4] contiguously, with no gap and no overlap', () => {
		const doc = readCollisionDoc();
		const zones = ['sw_trough_1', 'sw_trough_2', 'sw_trough_3', 'sw_trough_4']
			.map((name) => doc.switchZones.find((z) => z.name === name))
			.filter((z): z is NonNullable<typeof z> => z !== undefined);
		expect(zones.length, 'all four sw_trough_* zones must be present').toBe(4);

		const sorted = [...zones].sort((a, b) => a.minMm.x - b.minMm.x);
		expect(sorted[0].minMm.x, 'the aperture must start at x = 200 with no gap before the first slot').toBeCloseTo(200, 6);
		expect(sorted.at(-1)!.maxMm.x, 'the aperture must end at x = 314.4 with no gap after the last slot').toBeCloseTo(314.4, 6);
		for (let i = 0; i < sorted.length - 1; i++) {
			expect(
				sorted[i].maxMm.x,
				`sw_trough zone gap/overlap between "${sorted[i].name}" (ends ${sorted[i].maxMm.x}) and "${sorted[i + 1].name}" (starts ${sorted[i + 1].minMm.x})`,
			).toBeCloseTo(sorted[i + 1].minMm.x, 6);
		}
	});

	// Review finding 2026-08-28: the case above pins the x retiling only, but
	// tools/make-placeholder-blend.py's own comment records that the zones
	// were ALSO widened in y (-80..-40 -> -80..0, the upper bound landing
	// exactly on the drain wall's inner face) and that this is what lets a
	// ball actually crossing the aperture get caught. Narrowing y back to -40
	// regressed the drain narrative with a fully green suite.
	it('every sw_trough_* zone spans y up to the drain wall\'s inner face (y = 0), not the pre-retiling y = -40', () => {
		const doc = readCollisionDoc();
		const zones = doc.switchZones.filter((z) => z.name.startsWith('sw_trough_'));
		expect(zones.length, 'all four sw_trough_* zones must be present').toBe(4);
		for (const zone of zones) {
			expect(zone.minMm.y, `${zone.name}: the trough channel's far edge`).toBeCloseTo(-80, 6);
			expect(
				zone.maxMm.y,
				`${zone.name}: the zone must reach the drain wall's inner face (y = 0) -- a ball crossing the aperture enters through that face, so a lower bound lets it pass without ever entering the zone`,
			).toBeCloseTo(0, 6);
		}
	});
});

describe('asset contract -- Story 2.1b task 9: col_lane_deflector is RETIRED (DW-58)', () => {
	// Mutation: reintroduce col_lane_deflector in the seeding script and
	// re-export -> this assertion goes red naming it present.
	it('col_lane_deflector no longer exists -- the Right Loop\'s own upper arc turns a launched ball into the field instead', () => {
		const doc = readCollisionDoc();
		const node = doc.nodes.find((n) => n.name === 'col_lane_deflector');
		expect(node, 'col_lane_deflector must be retired (DW-58) -- the Right Loop replaces its job').toBeUndefined();
	});

	it('the Right Loop\'s own guide occupies the space above LANE_WALL_TOP_Y_MM (y = 950) that used to hold the deflector', () => {
		const doc = readCollisionDoc();
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		expect(loopR, 'col_loop_r missing from the collision document').toBeDefined();
		expect(loopR!.bboxMm.max.y, 'the Right Loop guide must reach up past where the plunger-lane wall stops (y = 950)').toBeGreaterThan(950);
	});

	// Code review 2026-09-02: retiring col_lane_deflector (task 9, correctly)
	// also deleted this suite's ONLY committed-document proof that
	// tools/export.py's wall_footprint_mm() emits a real plan polygon rather
	// than an axis-aligned bounding box. The equivalent export-side check
	// ("a wall with a genuinely angled mesh footprint exports a three-point
	// footprintMm, not a four-corner bounding box") lives in
	// test/export-py.test.ts, which is Blender-gated and therefore SKIPPED in
	// CI -- so nothing CI-visible covered it any more. Re-pointed at
	// col_loop_r_deflector, the node that took over the retired deflector's
	// job and carries the same three-point angled footprint.
	//
	// mutation: make wall_footprint_mm() return its bbox corners instead of
	// the hull -> this assertion goes red naming col_loop_r_deflector.
	it('col_loop_r_deflector carries a real angled three-point footprint -- a bbox reduction could never produce it', () => {
		const doc = readCollisionDoc();
		const node = doc.nodes.find((n) => n.name === 'col_loop_r_deflector');
		expect(node, 'col_loop_r_deflector missing from the collision document').toBeDefined();
		expect(node!.shape).toBe('wall');
		const footprint = node!.footprintMm;
		expect(footprint, 'col_loop_r_deflector must carry a footprintMm polygon').toBeDefined();
		expect(footprint!.length, 'the deflector is a triangular prism -- its plan-view footprint must have exactly 3 points').toBe(3);

		let hasDiagonalEdge = false;
		for (let i = 0; i < footprint!.length; i++) {
			const a = footprint![i]!;
			const b = footprint![(i + 1) % footprint!.length]!;
			if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
				hasDiagonalEdge = true;
			}
		}
		expect(hasDiagonalEdge, `footprint ${JSON.stringify(footprint)} has no diagonal edge -- it reduces to an axis-aligned shape`).toBe(true);
	});
});

describe('asset contract -- Story 1.5: every wall footprint has at least 3 points and a non-zero enclosed area', () => {
	it('every wall-shaped node\'s footprintMm encloses a real area', () => {
		const doc = readCollisionDoc();
		const walls = doc.nodes.filter((n) => n.shape === 'wall');
		expect(walls.length, 'sanity: there must be at least one wall node').toBeGreaterThan(0);
		for (const wall of walls) {
			expect(wall.footprintMm, `${wall.name}: wall node missing footprintMm`).toBeDefined();
			expect(wall.footprintMm!.length, `${wall.name}: footprintMm has fewer than 3 points`).toBeGreaterThanOrEqual(3);
			expect(polygonArea(wall.footprintMm!), `${wall.name}: footprintMm encloses zero area`).toBeGreaterThan(0);
		}
	});
});

describe('asset contract -- TABLE.physMaterials <-> TUNING.materials drift pin', () => {
	it('the two name lists never drift apart silently', () => {
		expect(Object.keys(TABLE.physMaterials).sort()).toEqual(Object.keys(TUNING.materials).sort());
	});
});

/**
 * Story 2.1d task 12 (DW-128): the free-end derivation every guide
 * termination check in this file uses. `col_guide_*`'s own doc comment
 * (2.1c) explains the shape assumption: a guide is a quad with two long
 * side edges (where a ball rolls) and two short END CAPS (where it does
 * not) -- so "the free ends" are the midpoints of the two globally SHORTEST
 * edges. That assumption is unchecked in the pre-hardening version: a
 * triangle, a 5-point hull, or a quad whose two shortest edges are ADJACENT
 * (a wedge, sharing one vertex) silently returns two midpoints at the SAME
 * end and the true far end is never tested. Hardened here to fail loudly,
 * naming the body and its own point count, rather than deriving a wrong
 * answer -- the fix this ledger entry prescribes is a shape ASSERTION, not
 * a new derivation.
 */
/** Story 2.1f (DW-154 (b)): how close the 2nd- and 3rd-shortest edges may come before `freeEndsMm()` refuses to guess. See its own tie branch for the measurement (the shipped minimum gap is 3.000 mm). */
const FREE_END_TIE_EPSILON_MM = 0.3;

function freeEndsMm(footprint: ReadonlyArray<{ readonly x: number; readonly y: number }>, bodyName: string): { x: number; y: number }[] {
	if (footprint.length !== 4) {
		throw new Error(
			`freeEndsMm(): "${bodyName}" has ${footprint.length} footprint point(s) -- the two-shortest-edges derivation assumes a ` +
			`4-point quad (two long side edges, two short end caps). A triangle or a 5+ point hull needs its own termination check, ` +
			`never this one.`,
		);
	}
	const edges = footprint.map((a, i) => {
		const b = footprint[(i + 1) % footprint.length]!;
		return { i, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, len: Math.hypot(b.x - a.x, b.y - a.y) };
	});
	const sorted = edges.slice().sort((a, b) => a.len - b.len);
	const [e0, e1, e2] = sorted;
	// Story 2.1f (DW-154 (b)): a genuine tie between the 2nd- and
	// 3rd-shortest edges. `Array.prototype.sort` is stable, so a tie is
	// resolved by FOOTPRINT VERTEX ORDER -- an order tools/export.py's own
	// hull pass controls and nothing here asserts. For a 3-way tie
	// `[a, b, a, a]` the sort picks indices 0 and 2, `indexDiff === 2`, the
	// ADJACENT throw below does NOT fire, and a WRONG opposite pair is
	// returned in silence. No body is at a tie in the committed document --
	// measured at Story 2.1f: the smallest 2nd-to-3rd gap is 3.000 mm, on
	// col_sling_l and col_sling_r, both of which this story re-measured --
	// so this throw is a guard on the next change, not on today's geometry.
	// The epsilon is one tenth of that measured 3.000 mm margin: large
	// enough to catch a genuine authored tie (which would be exact), small
	// enough that no shipped body is anywhere near it.
	if (e2 !== undefined && Math.abs(e2.len - e1!.len) <= FREE_END_TIE_EPSILON_MM) {
		throw new Error(
			`freeEndsMm(): "${bodyName}" has a TIE between its 2nd- and 3rd-shortest edges (index ${e1!.i} at ${e1!.len.toFixed(3)} mm, ` +
			`index ${e2.i} at ${e2.len.toFixed(3)} mm -- within ${FREE_END_TIE_EPSILON_MM} mm). Which of the two becomes a "free end" would ` +
			`then be decided by footprint vertex order, not by the body's own shape, so the derivation is not trustworthy for it. Edge ` +
			`lengths, in footprint order: ${edges.map((e) => e.len.toFixed(3)).join(', ')} mm.`,
		);
	}
	const indexDiff = Math.abs(e0!.i - e1!.i);
	if (indexDiff === 1 || indexDiff === 3) {
		throw new Error(
			`freeEndsMm(): "${bodyName}" has ${footprint.length} footprint point(s) and its two shortest edges (index ${e0!.i}, ${e1!.i}, ` +
			`lengths ${e0!.len.toFixed(2)}/${e1!.len.toFixed(2)} mm) are ADJACENT -- a wedge-shaped footprint, not a body with two opposite ` +
			`end caps. Deriving free ends from them would return two midpoints at the SAME end and never test the true far end.`,
		);
	}
	return [e0!.mid, e1!.mid];
}

/**
 * Story 2.1d task 13 (AC 3): replaces the `col_guide_` name-prefix selector
 * -- Story 2.1b drew its whole shot map under other prefixes and that gate
 * never saw one of them (this story's own Code Map, "The measured bare free
 * ends"). Structural instead: every `col_` WALL-shaped body whose `surface`
 * marks it as guide-class (a rail the ball runs ALONGSIDE toward a
 * potentially-exposed tip), never a name. Deliberately excludes:
 * `rubber_post`/`bumper` (round bodies -- they terminate a guide, they do
 * not need one, and freeEndsMm()'s own two-cap assumption does not apply to
 * an octagon); `target` (the DRAGON bank's own faces and backstop -- hit
 * face-on, not run alongside toward a tip, and 2.1f-adjacent); `wood`/`glass`
 * (the table's own perimeter and playfield/glass planes -- structural
 * boundary, not a guide); `metal` (switch-adjacent bodies, none of which is
 * a rail either). `plastic`/`rubber_band`/`dragon`/`ramp` cover every guide
 * this story's own Code Map measured.
 */
const GUIDE_SURFACES = new Set(['plastic', 'rubber_band', 'dragon', 'ramp']);

/**
 * Story 2.1d code review (2026-09-03): the EXPLICIT other half of the
 * partition above. `GUIDE_SURFACES` on its own is an allowlist, and an
 * allowlist has exactly the property this story set out to remove from the
 * `col_guide_` name prefix -- a body carrying a surface nobody listed is
 * silently invisible to the gate rather than loudly unclassified. Naming the
 * excluded half too turns the selector into a PARTITION, pinned by the
 * completeness test below: a wall body carrying any surface not in either
 * set fails by name, so the next `surface` value has to be classified
 * deliberately instead of escaping by omission.
 */
const NON_GUIDE_SURFACES = new Set(['rubber_post', 'bumper', 'target', 'wood']);

/**
 * The nearest `rubber_post` to a table-frame point, and how far away it is
 * -- the SAME derivation the main gate's own per-end loop uses (post centre
 * = its bbox centre, radius = its bbox x half-width), factored out so a
 * `verify()` predicate below can make the identical claim rather than
 * re-deriving it slightly differently.
 */
function nearestPost(doc: CollisionDocForTest, point: { readonly x: number; readonly y: number }): { distance: number; radius: number; name: string } {
	const posts = doc.nodes.filter((n) => n.surface === 'rubber_post');
	let nearestDistance = Infinity;
	let nearestName = '(none)';
	let nearestRadius = 0;
	for (const post of posts) {
		const postCentreX = (post.bboxMm.min.x + post.bboxMm.max.x) / 2;
		const postCentreY = (post.bboxMm.min.y + post.bboxMm.max.y) / 2;
		const postRadiusMm = (post.bboxMm.max.x - post.bboxMm.min.x) / 2;
		const distance = Math.hypot(point.x - postCentreX, point.y - postCentreY);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestName = post.name;
			nearestRadius = postRadiusMm;
		}
	}
	return { distance: nearestDistance, radius: nearestRadius, name: nearestName };
}

/**
 * Story 2.1f (DW-154): the FR-31 post-distance budget, named once. It was
 * computed inline in TWO places as `radius + 0.5`, where `radius` is
 * re-derived per post from its own bbox half-width -- so
 * `POST_RADIUS_MM` in tools/make-placeholder-blend.py silently moved this
 * budget, and the two call sites could drift apart without anything
 * noticing. `postFloatNoiseMarginMm` is the 0.5 mm of export float noise the
 * original expression carried; the radius still comes from the live post so
 * the budget tracks the authored geometry rather than a second literal.
 */
const POST_DISTANCE_FLOAT_NOISE_MM = 0.5;
function postDistanceBudgetMm(postRadiusMm: number): number {
	return postRadiusMm + POST_DISTANCE_FLOAT_NOISE_MM;
}

/** Fails naming `label`, the point and the nearest post's own name/distance/radius unless a `rubber_post` sits within `postDistanceBudgetMm()` of `point` -- the exact budget the main gate's own per-end assertion uses, exposed here so a `verify()` predicate can assert the SAME coordinate-level claim its reason prose makes, rather than a claim nothing ever checks. */
function expectPostNear(doc: CollisionDocForTest, point: { readonly x: number; readonly y: number }, label: string): void {
	const { distance, radius, name } = nearestPost(doc, point);
	expect(
		distance,
		`${label}: no rubber_post within one post radius of (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) -- nearest is "${name}" at ${distance.toFixed(2)} mm (post radius ${radius.toFixed(2)} mm)`,
	).toBeLessThanOrEqual(postDistanceBudgetMm(radius));
}

/** Distance from a point to a polygon's own nearest EDGE (never its interior) -- used by the exemption `verify()` predicates that make a JOIN claim. */
function distanceToPolygonEdgeMm(point: { readonly x: number; readonly y: number }, poly: ReadonlyArray<{ readonly x: number; readonly y: number }>): number {
	let nearest = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!;
		const b = poly[(i + 1) % poly.length]!;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		let t = len2 === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		nearest = Math.min(nearest, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
	}
	return nearest;
}

/**
 * Story 2.1f, DW-154 (a): a guide end that is STRICTLY INSIDE another body's
 * footprint. `isJoined()` used to swallow these silently -- the same
 * `continue` a genuine on-boundary join takes, before the post-distance
 * assertion and before the non-vacuity counter, leaving no name, no reason
 * and no staleness audit. That was a second, unenumerated exemption channel
 * with unbounded depth: an end could be buried arbitrarily deep in anything
 * and the gate would report a pass.
 *
 * An enclosed end is a legitimate outcome -- a ball genuinely cannot reach a
 * point inside solid material, so FR-31's hazard ("a ball catching an
 * exposed flat bare-metal end") does not exist there -- but it has to be
 * DECLARED, with the enclosing body named and the measurement recorded, and
 * it is enforced in both directions like every other allowlist in this file:
 * an undeclared enclosed end fails naming both bodies, and a declaration
 * whose end is no longer enclosed fails as stale.
 */
interface EnclosedEndDeclaration {
	readonly body: string;
	readonly end: { readonly x: number; readonly y: number };
	readonly insideBody: string;
	readonly reason: string;
}

const ENCLOSED_END_DECLARATIONS: readonly EnclosedEndDeclaration[] = [
	{
		body: 'col_dragon_leg_l',
		end: { x: 120.0, y: 610.0 },
		insideBody: 'col_lock_ceiling_west_fill',
		reason:
			'Story 2.1d authored the south edge of col_lock_ceiling_west_fill as "the SAME two-point line the leg cap is, merely shifted ' +
			'LOCK_FILL_WEST_MARGIN_MM (2 mm) south of it for the ENTIRE 60 mm run", so this north cap is buried inside west_fill by ' +
			'construction -- measured 1.897 mm deep. Until Story 2.1f this end took the unnamed strictly-interior branch of isJoined() and ' +
			'was compensated by a hand-written one-off assertion on col_post_dragon_leg_l. That post contributed no collision surface (all ' +
			'eight vertices inside the same body) and is removed; the one-off is retired into this general mechanism.',
	},
	{
		body: 'col_lock_ceiling',
		end: { x: 194.0, y: 612.0 },
		insideBody: 'col_dragon_leg_r',
		reason:
			'DW-153. The EAST riser of col_lock_ceiling, (194, 598)->(194, 626), midpoint (194.00, 612.00) -- 3.483 mm strictly inside ' +
			'col_dragon_leg_r. LOCK_CEILING_X_OVERLAP_E_MM deliberately pushes the east edge of the ceiling PAST the lane wall INTO the leg, ' +
			'so the riser sits in solid material. The exemption prose below said this riser "sits 4 mm short of col_dragon_leg_r" until ' +
			'Story 2.1f: the sign was backwards, it is 4 mm INSIDE. col_post_lock_ceiling_e, which nominally terminated this end, sat at the ' +
			'STALE coordinate (194.00, 606.00) -- 6.000 mm from the true midpoint against a 4.500 mm budget, left behind when ' +
			'LOCK_CEILING_EAST_SHOULDER_MM moved 14 -> 28 -- and was itself entirely inside col_dragon_leg_r. Removed.',
	},
	{
		body: 'col_lock_ceiling',
		end: { x: 146.0, y: 606.0 },
		insideBody: 'col_lock_ceiling_west_fill',
		reason:
			'The WEST riser of col_lock_ceiling, (146, 614)->(146, 598), midpoint (146.00, 606.00) -- 4.000 mm strictly inside ' +
			'col_lock_ceiling_west_fill, exactly as the Story 2.1d rework describes it ("buried inside the solid material of ' +
			'col_lock_ceiling_west_fill without touching an edge"). col_post_lock_ceiling_w was entirely inside that same body and is ' +
			'removed with it.',
	},
];

/**
 * Story 2.1d task 13: the two-directional exemption allowlist -- a body
 * here is a guide-class body (by surface) this AC's own gate does NOT
 * require a nearby post for, with a reason string per entry. Enforced in
 * BOTH directions below, the same `PARITY_INERT` pattern
 * (`test/replay-goldens.test.ts:212-261`) uses: a guide off this list with
 * a bare end fails the forward check; an entry here whose end IS
 * terminated fails as a stale exemption. Every reason is either "tapered to
 * a point, no flat cap the ball could catch" (FR-31's own hazard is an
 * exposed FLAT end), a named Block If this story cannot lift, or a genuine
 * structural join/post verified below.
 *
 * `verify`, added at code review 2026-09-03 (HIGH finding): three of this
 * list's own reasons ("joined into ... on both sides") were FALSE against
 * the committed document -- col_loop_top, col_loop_turn_r and col_ramp_turn
 * all had genuinely bare, ball-reachable ends the reverse-direction check
 * below could never catch, because that check only re-asserts "freeEndsMm()
 * still throws", a property of point count and edge adjacency that says
 * nothing about whether the prose reason is true. `verify`, where present,
 * makes the SAME coordinate-level claim the reason states, checked on every
 * run rather than merely written down once.
 */
interface GuideExemption {
	readonly body: string;
	readonly reason: string;
	readonly verify?: (doc: CollisionDocForTest) => void;
}

const GUIDE_TERMINATION_EXEMPTIONS: readonly GuideExemption[] = [
	{
		body: 'col_loop_l_return',
		reason:
			'add_loop_return_rail() tapers this rail\'s own inboard end to a single point rather than a flat cap -- no exposed face for '
			+ 'FR-31 to protect (the same shape col_loop_r_return uses). [STORY 2.1f] This entry carried NO verify() until now, so its whole '
			+ 'reason was prose nothing checked -- one of the four such entries on this list. verify() below derives the taper from the '
			+ 'live footprint: a 3-point triangle has no end CAP at all, only vertices, which is exactly the "no flat face a ball can '
			+ 'catch" claim the reason makes. If a later change re-authors it into a quad, the taper is gone and this fails.',
		verify: (doc) => {
			const rail = doc.nodes.find((n) => n.name === 'col_loop_l_return');
			expect(rail?.footprintMm, 'col_loop_l_return must carry a footprintMm polygon').toBeDefined();
			expect(
				rail!.footprintMm!.length,
				'col_loop_l_return is exempt because add_loop_return_rail() TAPERS its inboard end to a point -- a 3-vertex footprint with no end cap. '
				+ 'It now has ' + String(rail!.footprintMm!.length) + ' vertices, so the taper this exemption rests on is gone and the '
				+ 'exemption is stale.',
			).toBe(3);
		},
	},
	{
		body: 'col_loop_r_return',
		reason:
			'add_loop_return_rail() tapers this rail\'s own inboard end to a single point rather than a flat cap -- no exposed face for '
			+ 'FR-31 to protect (the same shape col_loop_l_return uses). [STORY 2.1f] This entry carried NO verify() until now, so its whole '
			+ 'reason was prose nothing checked -- one of the four such entries on this list. verify() below derives the taper from the '
			+ 'live footprint: a 3-point triangle has no end CAP at all, only vertices, which is exactly the "no flat face a ball can '
			+ 'catch" claim the reason makes. If a later change re-authors it into a quad, the taper is gone and this fails.',
		verify: (doc) => {
			const rail = doc.nodes.find((n) => n.name === 'col_loop_r_return');
			expect(rail?.footprintMm, 'col_loop_r_return must carry a footprintMm polygon').toBeDefined();
			expect(
				rail!.footprintMm!.length,
				'col_loop_r_return is exempt because add_loop_return_rail() TAPERS its inboard end to a point -- a 3-vertex footprint with no end cap. '
				+ 'It now has ' + String(rail!.footprintMm!.length) + ' vertices, so the taper this exemption rests on is gone and the '
				+ 'exemption is stale.',
			).toBe(3);
		},
	},
	{
		body: 'col_loop_top',
		reason:
			'[DW-146 -- SWEPT AND RECORDED, Story 2.1f, Branch B of its own pre-authorised decision rule. NOT a HALT.] This is the '
			+ 'orbit top connector, a 5-point ridge freeEndsMm() cannot derive (not a quad). Its two true free ends, read directly off '
			+ 'the committed footprint, are its 9.5 mm vertical end caps at (50.00, 1009.55) and (418.40, 1009.55), both genuinely bare '
			+ '(74.64 / 73.10 mm from the nearest post) and both ball-reachable. Story 2.1d swept POST POSITIONS exhaustively and every '
			+ 'one measurably broke the Loop 34 mm entry-offset cases, so it HALTed; the reason is structural rather than a matter of '
			+ 'finding a better position, and it is worth stating because it forecloses that whole axis: the Loop shot column is defined '
			+ 'as loopTop.min.x - railL.max.x - ballMm, so the cap sits at the ball swept-edge limit BY CONSTRUCTION at every value of '
			+ 'LOOP_TOP_END_X_MM. Any post at the cap is in the orbit. Only removing the FACE can work. '
			+ 'Story 2.1f therefore swept the untried axis, RIDGE_DROP_MM, through the real pipeline -- re-seeding the .blend and '
			+ 're-exporting at every value, then driving the suite. The cap length is LOOP_TOP_INNER_Y_MM - RIDGE_DROP_MM - 1004.8, so '
			+ 'the caps vanish at exactly 12.0 and the body becomes a point-ended TRIANGLE, structurally the same class as '
			+ 'col_loop_l_return / col_loop_r_return, which are exempt on this list for exactly that reason. Measured, value by value: '
			+ '2.5 -> caps 9.500 mm, all six Loop entry offsets pass (the shipped value); '
			+ '3.0 -> caps 9.000 mm, ONE routing case red; '
			+ '5.0 -> caps 7.000 mm, all six offsets pass (note: this is the value Story 2.1d recorded as retiming the Left Loop 34 mm '
			+ 'offset into the wrong outlane -- against the PRE-2.1f geometry; it no longer does, which is itself worth recording); '
			+ '8.0 -> caps 4.000 mm, all six pass; 10.0 -> caps 2.000 mm, all six pass; '
			+ '12.0 -> caps ELIMINATED, footprint is the 3-point triangle [(50, 1004.8), (418.4, 1004.8), (234.2, 1016.8)], and all six '
			+ 'Loop entry offsets still pass. '
			+ 'So Branch A NARROWLY exists: 12.0 removes the exposed face and keeps every offset case. It is NOT shipped, and the '
			+ 'measurement that decided that is recorded rather than argued: at 12.0 the body stops filling y 1004.8..1014.3 across the '
			+ 'whole top channel, which changes every trajectory that rides it. Measured against the re-exported document at 12.0 -- '
			+ 'TWELVE cases in test/shot-reachability.test.ts go red (loop-off-column-left-west-18, loop-off-column-right-west-18, '
			+ 'centre-drain-descent, dragon-body, lock-lane-immediate, lock-lane-long, dragon-target-o, top-lane-1, slingshot-left, '
			+ 'slingshot-right, descend-sling-l and the witness-corpus health floor itself, because witnesses stop closing their own '
			+ 'expectedSwitch), and the roll-and-drain golden NO LONGER DRAINS inside its recorded 9282 ticks at all (traced: one ball '
			+ 'still in play at the end, at x = 257.18, where the golden\'s own scenario block asserts zero balls, ballsInPlay 0 and a full '
			+ 'trough). That is not a retime -- it is a different behaviour, and this repository\'s own rule is that a golden needing a '
			+ 'moved threshold is a HALT rather than a re-record. Shipping 12.0 therefore means re-deriving the entire witness corpus and '
			+ 'genuinely re-recording all five goldens on changed traces, which is a decision above this story. Recorded in this story '
			+ 'frontmatter deferred: for the lead. '
			+ 'Branch B ships: the geometry is unchanged at RIDGE_DROP_MM = 2.5, the two bare caps are named here with their measured '
			+ 'coordinates, and verify() below makes that claim machine-checked on every run -- which it was not before Story 2.1f, this '
			+ 'being one of the four entries on this list that carried no verify() at all.',
		verify: (doc) => {
			// [STORY 2.1f] The entry carried NO verify() until this story, so
			// every coordinate in the reason above was prose nothing checked.
			// This derives both end caps from the LIVE footprint -- the exact
			// mistake DW-153 was made of is a coordinate literal that stopped
			// tracking its own body -- and asserts they are still there, still
			// bare, and still the length this reason records. If a later change
			// eliminates them (RIDGE_DROP_MM = 12.0 does), this fails and the
			// exemption has to be revisited, which is the point.
			const loopTop = doc.nodes.find((n) => n.name === 'col_loop_top');
			expect(loopTop?.footprintMm, 'col_loop_top must carry a footprintMm polygon').toBeDefined();
			const poly = loopTop!.footprintMm!;
			expect(poly.length, 'col_loop_top must still be the 5-point ridge freeEndsMm() cannot derive -- at 4 points it would have to pass the forward gate, at 3 its caps are gone and this exemption is stale').toBe(5);
			const capEdges = poly
				.map((a, i) => ({ a, b: poly[(i + 1) % poly.length]! }))
				.filter((e) => Math.abs(e.b.x - e.a.x) < 1e-6 && Math.abs(e.b.y - e.a.y) > 1e-6)
				.map((e) => ({ x: e.a.x, midY: (e.a.y + e.b.y) / 2, lengthMm: Math.abs(e.b.y - e.a.y) }));
			expect(capEdges.length, 'col_loop_top must present exactly two vertical end caps -- the bare ends DW-146 names').toBe(2);
			for (const cap of capEdges) {
				expect(
					cap.lengthMm,
					`col_loop_top's end cap at x = ${cap.x.toFixed(2)} measures ${cap.lengthMm.toFixed(3)} mm, not the 9.500 mm this exemption records. ` +
					'DW-146 has moved: re-sweep RIDGE_DROP_MM and re-decide the branch rather than leaving a stale measurement here.',
				).toBeCloseTo(9.5, 2);
				// And still genuinely BARE -- the other half of the reason, which
				// nothing checked before. A post appearing here would mean the
				// gap is closed and the exemption should go.
				const { distance } = nearestPost(doc, { x: cap.x, y: cap.midY });
				expect(
					distance,
					`col_loop_top's end cap at (${cap.x.toFixed(2)}, ${cap.midY.toFixed(2)}) now has a rubber_post ${distance.toFixed(2)} mm away. ` +
					'If DW-146 has been closed by termination, this exemption is stale and must be removed.',
				).toBeGreaterThan(20);
			}
		},
	},
	{
		body: 'col_loop_turn_l',
		reason:
			'A turn/redirector piece at the orbit top corner, joined into the perimeter wall and the lane on both sides -- not a '
			+ 'free-ended guide; its adjacent-shortest-edge shape is the turn\'s own angle, not an unterminated tip. [STORY 2.1f] This '
			+ 'entry also carried NO verify(). The reason is a JOIN claim, so verify() below checks the join for real, against the live '
			+ 'footprint: every vertex must lie on the boundary of col_wall_top or col_wall_left, which is what "joined on both sides" '
			+ 'means and what nothing checked before.',
		verify: (doc) => {
			const turn = doc.nodes.find((n) => n.name === 'col_loop_turn_l');
			expect(turn?.footprintMm, 'col_loop_turn_l must carry a footprintMm polygon').toBeDefined();
			const partners = ['col_wall_top', 'col_wall_left']
				.map((name) => doc.nodes.find((n) => n.name === name))
				.filter((n): n is NonNullable<typeof n> => n !== undefined && n.footprintMm !== undefined);
			expect(partners.length, 'col_loop_turn_l\'s exemption names col_wall_top and col_wall_left as its join partners -- both must exist').toBe(2);
			const unjoined = turn!.footprintMm!.filter(
				(v) => !partners.some((partner) => distanceToPolygonEdgeMm(v, partner.footprintMm!) <= 0.05),
			);
			expect(
				unjoined,
				'col_loop_turn_l is exempt because it is JOINED into the perimeter on both sides, but these of its own vertices touch neither '
				+ 'col_wall_top nor col_wall_left: ' + JSON.stringify(unjoined) + '. The join this exemption rests on is not there.',
			).toEqual([]);
		},
	},
	{
		body: 'col_loop_turn_r',
		reason:
			'[CORRECTED, code review 2026-09-03] NOT "joined on both sides" as previously claimed -- only the north face joins ' +
			'col_wall_top; its own 12.00 mm cap at (474.40, 1036.00) is genuinely bare. A wedge-shaped turn piece, same DW-128 shape ' +
			'class as col_sling_l (its own two shortest edges, the 12.00 mm cap and the 30.8 mm face joining col_wall_top, are ' +
			'ADJACENT), so freeEndsMm() correctly throws rather than deriving the wrong pair -- it stays on this list structurally. ' +
			'Its own true bare cap is now posted: col_post_loop_turn_r (474.40, 1036.00), verified below.',
		verify: (doc) => expectPostNear(doc, { x: 474.4, y: 1036.0 }, 'col_loop_turn_r\'s own 12.00 mm cap'),
	},
	// [STORY 2.1f] col_ramp_turn is NO LONGER EXEMPT and its entry is gone.
	// The corridor re-solve lengthened the turn (its west edge follows
	// ramp_lane_x0, 338.0 -> 298.4) and re-authored its north face as a named
	// 21 deg grade instead of a fixed 20 mm drop, which turned the footprint
	// into a clean quad whose two shortest edges (the 26.00 mm east cap and
	// the 82.68 mm west riser) are OPPOSITE. freeEndsMm() now derives it, the
	// reverse-direction test below caught the stale entry the moment it did,
	// and both ends go through the forward gate like any other guide: the east
	// cap joins col_loop_r, the west riser is terminated by col_post_ramp_turn
	// (now derived from the live riser midpoint rather than a literal).
	{
		body: 'col_sling_l',
		reason: 'DW-128, a real committed case: the anti-stranding slope (20 mm drop) shortens the east side to 15 mm, ' +
			'below the 32 mm south cap, making the two shortest edges ADJACENT (a genuine wedge) -- freeEndsMm() correctly ' +
			'throws rather than silently deriving the wrong pair. Re-authoring the slope so the shortest edges become the ' +
			'correct opposite pair would move the body itself, which Story 2.1c\'s Block If reserved for Story 2.1f. ' +
			'[STORY 2.1f RULED, geometry UNCHANGED] The condition is arithmetic, and it is recorded here so a later story does not ' +
			'have to re-derive it: add_box_wall_sloped gives a slingshot four edges -- west cap (depth - drop) = 15.0, east cap ' +
			'(depth) = 35.0, south cap (span), north face sqrt(span^2 + drop^2) -- so the two SHORTEST are the opposite vertical caps ' +
			'only while span > depth = 35.0. col_sling_l spans 32.0 and is therefore a genuine wedge; the fix is to widen it past ' +
			'35.0, which moves the left corridor and is Story 2.2\'s slingshot hardware to size, not a corridor decision. Story 2.1f ' +
			'DID apply the rule on the right: col_sling_r had to shrink for the corridor budget, and it was sized to 38.0 rather than ' +
			'to the ~29 the budget alone wanted, precisely so it stays OFF this list with the same 3.000 mm margin col_sling_l would ' +
			'need. Adding a second body here would have meant this story stopping the FR-31 gate checking the very body it moved. ' +
			'Both plausible ends are posted anyway as a safety measure: col_post_sling_l (114, 420, the old south-cap ' +
			'derivation) and col_post_sling_l_north (114, 445, the true far/sloped-cap end). [CORRECTED, rework iteration 3, ' +
			'MED review finding: because this body is EXEMPTED, its own ends never reach the main gate\'s post-distance ' +
			'assertion at all, so -- unlike every OTHER post this story added -- these two were never load-bearing through the ' +
			'gate itself (verified: deleting either left the gate green). verify() below makes them load-bearing through the ' +
			'exemption entry instead, the same coordinate-level claim this reason\'s own prose already makes.]',
		verify: (doc) => {
			expectPostNear(doc, { x: 114.0, y: 420.0 }, 'col_sling_l\'s own south-cap end (col_post_sling_l)');
			expectPostNear(doc, { x: 114.0, y: 445.0 }, 'col_sling_l\'s own true far/sloped-cap end (col_post_sling_l_north)');
		},
	},
	{
		body: 'col_lock_ceiling',
		reason:
			'Story 2.1d rework iteration 2 (the corridor seal of task 8): a 5-point RIDGE (the same shape class as col_loop_top, above), ' +
			'so freeEndsMm() cannot derive it -- not a quad. Its two true free ends are its vertical risers, and BOTH are ENCLOSED, not ' +
			'merely near something: the WEST riser midpoint (146.00, 606.00) sits 4.000 mm strictly inside col_lock_ceiling_west_fill and ' +
			'the EAST riser midpoint (194.00, 612.00) sits 3.483 mm strictly inside col_dragon_leg_r. Both are recorded in ' +
			'ENCLOSED_END_DECLARATIONS above, and neither needs a post: a ball cannot reach a point inside solid material. ' +
			'[CORRECTED, STORY 2.1f -- DW-153] This reason previously claimed the east riser "sits 4 mm short of col_dragon_leg_r vertical ' +
			'face" and pointed verify() at col_post_lock_ceiling_e and col_post_lock_ceiling_w. Three things were wrong at once. The sign ' +
			'was backwards (LOCK_CEILING_X_OVERLAP_E_MM pushes the ceiling INTO the leg). The coordinate was stale: the east riser midpoint ' +
			'moved 606 -> 612 when LOCK_CEILING_EAST_SHOULDER_MM went 14 -> 28 in 2.1d rework iteration 3, so the post stood 6.000 mm away ' +
			'against a 4.500 mm budget. And the check was CIRCULAR: verify() passed the post its own authored literal (194.00, 606.00) to ' +
			'expectPostNear(), which measured the post against itself at 0.000 mm and was true by construction -- it could not have caught ' +
			'either defect. Both posts also lay entirely inside another body and contributed no collision surface, so both are removed. ' +
			'verify() below now DERIVES both risers from the live footprint and asserts the enclosure that makes them safe, which is a ' +
			'claim the geometry can falsify.',
		verify: (doc) => {
			const ceiling = doc.nodes.find((n) => n.name === 'col_lock_ceiling');
			expect(ceiling?.footprintMm, 'col_lock_ceiling must carry a footprintMm polygon').toBeDefined();
			const poly = ceiling!.footprintMm!;
			// The two vertical risers, derived: the ridge's only two edges
			// with zero run. Nothing here is a coordinate literal, which is
			// exactly what went stale before.
			const risers = poly
				.map((a, k) => ({ a, b: poly[(k + 1) % poly.length]! }))
				.filter((e) => Math.abs(e.b.x - e.a.x) < 1e-6 && Math.abs(e.b.y - e.a.y) > 1e-6)
				.map((e) => ({ x: e.a.x, y: (e.a.y + e.b.y) / 2 }));
			expect(risers.length, 'col_lock_ceiling must present exactly two vertical risers -- its only free ends').toBe(2);
			for (const riser of risers) {
				const declared = ENCLOSED_END_DECLARATIONS.find(
					(dec) => dec.body === 'col_lock_ceiling' && Math.hypot(dec.end.x - riser.x, dec.end.y - riser.y) <= 0.05,
				);
				expect(
					declared,
					`col_lock_ceiling riser midpoint (${riser.x.toFixed(2)}, ${riser.y.toFixed(2)}) -- DERIVED from the live footprint, not ` +
					'read from a literal -- has no ENCLOSED_END_DECLARATIONS entry. This is the DW-153 defect exactly: the riser moved and ' +
					'the record did not follow.',
				).toBeDefined();
				const host = doc.nodes.find((n) => n.name === declared!.insideBody);
				expect(host?.footprintMm, `${declared!.insideBody} must carry a footprintMm polygon`).toBeDefined();
				const hostPoly = host!.footprintMm!;
				let inside = false;
				for (let k = 0, m = hostPoly.length - 1; k < hostPoly.length; m = k++) {
					const vi = hostPoly[k]!;
					const vj = hostPoly[m]!;
					const crosses = vi.y > riser.y !== vj.y > riser.y;
					if (crosses && riser.x < ((vj.x - vi.x) * (riser.y - vi.y)) / (vj.y - vi.y) + vi.x) {
						inside = !inside;
					}
				}
				expect(
					inside,
					`col_lock_ceiling riser midpoint (${riser.x.toFixed(2)}, ${riser.y.toFixed(2)}) is declared enclosed inside ` +
					`"${declared!.insideBody}" but is NOT inside it in the committed document -- the end is bare and needs terminating`,
				).toBe(true);
			}
		},
	},
];

describe('asset contract -- Story 2.1d AC 3: every guide free end terminates at a rubber_post, selected STRUCTURALLY (FR-31, AD-11)', () => {
	it('every guide-class col_ wall body\'s free end(s) each have a rubber_post within one post radius, or a named exemption', () => {
		const doc = readCollisionDoc();
		const posts = doc.nodes.filter((n) => n.surface === 'rubber_post');
		expect(posts.length, 'sanity: at least one rubber_post node must be authored').toBeGreaterThan(0);

		const guides = doc.nodes.filter((n) => n.shape === 'wall' && n.surface !== undefined && GUIDE_SURFACES.has(n.surface));
		expect(guides.length, 'sanity: at least one guide-class body must be authored').toBeGreaterThan(0);

		const exemptedNames = new Set(GUIDE_TERMINATION_EXEMPTIONS.map((e) => e.body));
		for (const exemption of GUIDE_TERMINATION_EXEMPTIONS) {
			expect(
				guides.some((g) => g.name === exemption.body),
				`the exemption allowlist names "${exemption.body}", but no guide-class col_ wall body by that name exists in the committed document -- a stale entry`,
			).toBe(true);
		}

		/**
		 * Every OTHER col_/sw_ wall body's own footprint, for the "genuinely
		 * joined" structural test below -- box (flippers) and plane
		 * (playfield/glass) shapes never count as a join partner.
		 *
		 * Story 2.1d code review (2026-09-03): `rubber_post` bodies are
		 * excluded from the candidate set. A post is what an end TERMINATES
		 * AT, never what it is JOINED INTO, and because the join branch runs
		 * BEFORE the post-distance assertion below, treating a post as a join
		 * partner silently short-circuited the one check this whole describe
		 * block exists to make. Measured against the committed document
		 * before the fix: SIX of the 54 derived free ends took that path and
		 * never reached the `nearestRadius + 0.5` assertion at all --
		 * `col_dragon_leg_l` (120.00, 610.00) -> `col_post_dragon_leg_l`,
		 * `col_guide_inlane_l` (92.00, 428.00), `col_guide_inlane_r`
		 * (376.40, 428.00), both `col_ramp_return_1` ends, and `col_sling_r`
		 * (314.00, 427.50). Three of the 26 posts this story added were
		 * therefore not load-bearing: deleting them left this gate GREEN,
		 * which is exactly the mutation AC 3 claims to be falsified by. With
		 * posts excluded, those six ends are checked for real and all pass
		 * (3.500-4.000 mm against the 4.500 mm budget), so this restores
		 * coverage without moving any geometry.
		 */
		/**
		 * Rework iteration 3 (code review 2026-09-04, MED finding): the
		 * previous 1.0 mm EDGE-DISTANCE tolerance treated "within 1 mm of any
		 * edge segment" as a join, which is also true of a genuine, real GAP --
		 * measured against the committed document: `col_sling_r`'s own east
		 * end sits 0.500 mm from `col_loop_r_funnel`'s nearest edge, and
		 * `col_lock_ceiling_west_fill`'s own east end sits 0.783 mm from
		 * `col_lock_ceiling`'s, both inside the old 1.0 mm budget and both
		 * genuine gaps, not touches -- deleting either body's own terminating
		 * post left this gate green (four of 48 posts, in total, were not
		 * load-bearing; the other two were `col_sling_l`'s, which is on the
		 * exemption allowlist below and so never reaches this function at
		 * all). A structural join means the point is genuinely COINCIDENT
		 * with the partner body's own material -- ON its boundary (a shared
		 * edge/vertex, allowing only float-rounding noise) or strictly
		 * INSIDE it (the "buried" risers this file's own exemption reasons
		 * describe) -- never merely nearby. `BOUNDARY_EPSILON_MM` is small
		 * enough to reject either measured 0.5/0.783 mm gap while still
		 * absorbing ordinary float rounding from the export pipeline; every
		 * genuine join in the committed document measures 0.000 mm by
		 * construction (shared authored coordinates), so this margin is not
		 * load-bearing for any of them.
		 */
		/**
		 * Story 2.1f (DW-154 (a)): the two channels are now SEPARATE
		 * classifications, not one boolean. `joined` (on a partner's own
		 * boundary, coincident by construction) stays an ordinary structural
		 * join and needs no declaration. `enclosed` (strictly interior to a
		 * partner, at unbounded depth) is a distinct outcome that must be
		 * DECLARED in ENCLOSED_END_DECLARATIONS above -- it was the silent,
		 * unenumerated second exemption channel this ledger entry names.
		 */
		const BOUNDARY_EPSILON_MM = 0.05;
		type EndClassification =
			| { readonly kind: 'free' }
			| { readonly kind: 'joined'; readonly to: string }
			| { readonly kind: 'enclosed'; readonly to: string; readonly depthMm: number };
		function classifyEnd(point: { readonly x: number; readonly y: number }, ownName: string): EndClassification {
			let enclosedIn: { name: string; depthMm: number } | undefined;
			for (const other of doc.nodes) {
				if (other.name === ownName || other.shape !== 'wall' || !other.footprintMm || other.surface === 'rubber_post') {
					continue;
				}
				const poly = other.footprintMm;
				// On (or within BOUNDARY_EPSILON_MM of) an edge -- coincident by
				// construction, not merely close.
				let nearestEdgeMm = Infinity;
				for (let i = 0; i < poly.length; i++) {
					const a = poly[i]!;
					const b = poly[(i + 1) % poly.length]!;
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const len2 = dx * dx + dy * dy;
					let t = len2 === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
					t = Math.max(0, Math.min(1, t));
					nearestEdgeMm = Math.min(nearestEdgeMm, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
				}
				if (nearestEdgeMm <= BOUNDARY_EPSILON_MM) {
					return { kind: 'joined', to: other.name };
				}
				// Strictly interior to the partner's own polygon -- the "buried"
				// case. Standard even-odd ray-cast; the depth reported is the
				// distance to the partner's own nearest edge, which is what makes
				// the declaration falsifiable rather than merely asserted.
				let inside = false;
				for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
					const vi = poly[i]!;
					const vj = poly[j]!;
					const crosses = vi.y > point.y !== vj.y > point.y;
					if (crosses && point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x) {
						inside = !inside;
					}
				}
				if (inside && (enclosedIn === undefined || nearestEdgeMm > enclosedIn.depthMm)) {
					enclosedIn = { name: other.name, depthMm: nearestEdgeMm };
				}
			}
			if (enclosedIn !== undefined) {
				return { kind: 'enclosed', to: enclosedIn.name, depthMm: enclosedIn.depthMm };
			}
			return { kind: 'free' };
		}

		// Story 2.1d code review (2026-09-03): a non-vacuity floor on the
		// gate's own SUBJECT SET. Every assertion below is inside two nested
		// loops and a `continue`, so the whole test passes trivially if the
		// selector, the exemption list or `isJoined()` ever stop leaving any
		// end to check -- the failure mode this project's defect history is
		// made of. Measured at this review: 54 derived ends, 15 genuinely
		// joined to a non-post body, 39 reaching the post-distance assertion
		// below. The floor is that 39; a change that shrinks it fails here
		// and has to be argued for, rather than passing silently.
		//
		// Story 2.1f (lesson 5, DW-149's pattern): the floor below is no
		// longer the hand-typed literal 40. The census is DERIVED first, then
		// re-walked asserting, so it cannot lag its own subject set the way
		// 39 lagged 40 and 40 lagged this story's own count.
		const derivedEnds: { guide: string; end: { x: number; y: number }; klass: EndClassification }[] = [];
		for (const guide of guides) {
			if (exemptedNames.has(guide.name)) {
				continue;
			}
			expect(guide.footprintMm, `${guide.name}: a guide-class col_ wall body must carry a footprintMm polygon`).toBeDefined();
			for (const end of freeEndsMm(guide.footprintMm!, guide.name)) {
				derivedEnds.push({ guide: guide.name, end, klass: classifyEnd(end, guide.name) });
			}
		}
		const expectedPostDistanceChecks = derivedEnds.filter((e) => e.klass.kind === 'free').length;
		expect(
			derivedEnds.length,
			'sanity: the structural selector must derive at least one end from the committed document -- an empty census makes every assertion below vacuous',
		).toBeGreaterThan(0);
		expect(
			expectedPostDistanceChecks,
			`every one of the ${derivedEnds.length} derived end(s) was absorbed by a join or an enclosure -- the post-distance assertion below would then run on nothing at all`,
		).toBeGreaterThan(0);

		// DW-154 (a): an end strictly INSIDE another body is a distinct,
		// DECLARED outcome -- never a silent skip. Forward direction here
		// (undeclared -> fail, naming both bodies and the measured depth);
		// the reverse direction (a declaration whose end is no longer
		// enclosed) is its own test below.
		for (const { guide, end, klass } of derivedEnds) {
			if (klass.kind !== 'enclosed') {
				continue;
			}
			const declared = ENCLOSED_END_DECLARATIONS.find(
				(dec) => dec.body === guide && Math.hypot(dec.end.x - end.x, dec.end.y - end.y) <= BOUNDARY_EPSILON_MM,
			);
			expect(
				declared,
				`${guide}'s free end at table (${end.x.toFixed(2)}, ${end.y.toFixed(2)}) is ${klass.depthMm.toFixed(3)} mm STRICTLY INSIDE ` +
				`"${klass.to}" -- an enclosed end, which a ball cannot reach and which therefore needs no rubber_post, but which must be ` +
				'DECLARED in ENCLOSED_END_DECLARATIONS with the enclosing body named. An undeclared enclosure is exactly the unenumerated ' +
				'second exemption channel DW-154 (a) names.',
			).toBeDefined();
			expect(
				declared!.insideBody,
				`${guide}'s enclosed end at (${end.x.toFixed(2)}, ${end.y.toFixed(2)}) is declared inside "${declared!.insideBody}" but measures ` +
				`inside "${klass.to}" instead`,
			).toBe(klass.to);
		}

		let postDistanceChecks = 0;
		for (const { guide: guideName, end, klass } of derivedEnds) {
			if (klass.kind !== 'free') {
				continue; // joined into a partner's material, or declared enclosed inside it -- structurally not "free" at all.
			}
			postDistanceChecks++;
			let nearestDistance = Infinity;
			let nearestName = '(none)';
			let nearestRadius = 0;
			for (const post of posts) {
				const postCentreX = (post.bboxMm.min.x + post.bboxMm.max.x) / 2;
				const postCentreY = (post.bboxMm.min.y + post.bboxMm.max.y) / 2;
				const postRadiusMm = (post.bboxMm.max.x - post.bboxMm.min.x) / 2;
				const distance = Math.hypot(end.x - postCentreX, end.y - postCentreY);
				if (distance < nearestDistance) {
					nearestDistance = distance;
					nearestName = post.name;
					nearestRadius = postRadiusMm;
				}
			}
			expect(
				nearestDistance,
				`${guideName}'s free end at table (${end.x.toFixed(2)}, ${end.y.toFixed(2)}) has no rubber_post within one post radius ` +
				`(the end is neither joined to nor enclosed by any other body) -- nearest post is "${nearestName}" at ${nearestDistance.toFixed(2)} mm ` +
				`(post radius ${nearestRadius.toFixed(2)} mm)`,
			).toBeLessThanOrEqual(postDistanceBudgetMm(nearestRadius));
		}
		expect(
			postDistanceChecks,
			`the FR-31 post-distance assertion ran on ${postDistanceChecks} free end(s) but the derived census says ${expectedPostDistanceChecks} -- ` +
			'the loop and the census disagree, which means an end is being skipped by something other than its own classification.',
		).toBe(expectedPostDistanceChecks);
		// Anti-vacuity, DERIVED from the subject set rather than from a
		// literal: `toBe(expectedPostDistanceChecks)` alone would still hold
		// if a future change started absorbing ends wholesale into joins or
		// enclosures, because both sides would move together. At least half
		// of every derived end must still reach the post-distance assertion.
		expect(
			postDistanceChecks,
			`only ${postDistanceChecks} of ${derivedEnds.length} derived free end(s) reached the FR-31 post-distance assertion -- the rest were ` +
			`absorbed as joined or enclosed (${derivedEnds.filter((e) => e.klass.kind === 'joined').length} joined, ` +
			`${derivedEnds.filter((e) => e.klass.kind === 'enclosed').length} enclosed). A gate that stops checking most of its own subject set ` +
			'is not evidence, whatever it reports.',
		).toBeGreaterThanOrEqual(Math.ceil(derivedEnds.length / 2));
	});

	it('the guide selector is a PARTITION, not an allowlist: every surface carried by a col_/sw_ wall body is classified as guide-class or explicitly non-guide', () => {
		// Story 2.1d code review (2026-09-03). AC 3's own claim is that a
		// body can no longer escape FR-31 by being NAMED something else. The
		// implemented selector swapped the name prefix for a surface
		// allowlist, which has the same escape property one attribute over:
		// author a rail with an unlisted surface and it is invisible to the
		// gate, with no exemption entry, no reason string and no
		// reverse-direction staleness check. This closes that by requiring
		// the two sets to COVER the committed document.
		const doc = readCollisionDoc();
		const wallSurfaces = new Set(
			doc.nodes.filter((n) => n.shape === 'wall' && n.surface !== undefined).map((n) => n.surface!),
		);
		const unclassified = [...wallSurfaces].filter((s) => !GUIDE_SURFACES.has(s) && !NON_GUIDE_SURFACES.has(s)).sort();
		expect(
			unclassified,
			`wall surface(s) ${JSON.stringify(unclassified)} are in neither GUIDE_SURFACES nor NON_GUIDE_SURFACES, so bodies carrying them are silently invisible to the ` +
			'guide-termination gate above -- classify them deliberately (and, if guide-class, terminate or exempt their free ends on the record)',
		).toEqual([]);
		// Non-vacuity: the partition must actually be exercised by real
		// bodies on both sides, or the assertion above is true of an empty
		// document.
		expect([...wallSurfaces].filter((s) => GUIDE_SURFACES.has(s)).length, 'sanity: guide-class surfaces must be present in the committed document').toBeGreaterThan(0);
		expect([...wallSurfaces].filter((s) => NON_GUIDE_SURFACES.has(s)).length, 'sanity: non-guide surfaces must be present in the committed document').toBeGreaterThan(0);
	});

	it('every allowlisted exemption is still genuinely exempt -- a body whose shape has quietly become a clean, well-formed quad fails naming it as a stale entry', () => {
		// Enforced in BOTH directions (this describe block's own doc comment):
		// this is the reverse direction. Every entry here is exempt because
		// freeEndsMm() cannot derive a trustworthy answer for it (a non-quad,
		// or a wedge -- col_sling_l's own DW-128 case). A body stays on the
		// allowlist only while that remains true; if a later change
		// re-authors it into a clean quad with two genuinely opposite short
		// edges, the SAME body would then need to pass the forward check
		// like any other guide, and leaving it on this list would silently
		// exempt it from a requirement it no longer has any reason to skip.
		const doc = readCollisionDoc();
		for (const exemption of GUIDE_TERMINATION_EXEMPTIONS) {
			const body = doc.nodes.find((n) => n.name === exemption.body);
			expect(body, `exemption "${exemption.body}" names a body absent from the committed document`).toBeDefined();
			// Story 2.1d code review (2026-09-03), closing the spec's own
			// `deferred:` entry on this line: `?? []` used to feed an EMPTY
			// footprint to freeEndsMm(), which throws on the point-count
			// branch -- so a body that had lost its footprint data entirely
			// reported the same "still genuinely exempt" pass as a body with
			// a real non-standard shape. Two different conditions collapsed
			// into one boolean. Separate them: a missing footprint is its own
			// named failure, never evidence for an exemption.
			expect(
				body!.footprintMm,
				`${exemption.body}: this exempted body carries NO footprintMm in the committed document -- that is a lost-geometry failure, not evidence that its exemption still holds`,
			).toBeDefined();
			// Story 2.1f, DW-154 (c). The ledger's own wording for this
			// sub-case -- "a staleness check that reports PASS for a body
			// with no footprint" -- was already closed at the 2026-09-03
			// review by the `footprintMm` assertion immediately above (this
			// file, the `?? []` that used to feed an empty array to
			// freeEndsMm() is gone). The HONEST RESIDUAL was this catch: it
			// discarded the error object, so ANY throw -- a TypeError on a
			// malformed vertex, an unrelated bug -- was laundered into "the
			// exemption still holds". It tested "something threw", not "it
			// threw for the shape reason". The catch now keeps the error and
			// the assertion below checks it came from freeEndsMm() and names
			// one of its two shape reasons.
			let derivationFailed = false;
			let derivationError: unknown;
			try {
				freeEndsMm(body!.footprintMm!, body!.name);
			} catch (error) {
				derivationFailed = true;
				derivationError = error;
			}
			expect(
				derivationFailed,
				`${exemption.body}: freeEndsMm() now derives a clean answer for this body (footprint: ${JSON.stringify(body!.footprintMm)}) -- the exemption ("${exemption.reason}") is stale; remove it and let this body pass through the forward check like any other guide`,
			).toBe(true);
			const derivationMessage = derivationError instanceof Error ? derivationError.message : String(derivationError);
			expect(
				derivationMessage,
				`${exemption.body}: the exemption is justified by freeEndsMm() refusing to derive this body's free ends, but the throw that ` +
				`actually happened was ${derivationMessage} -- not one of freeEndsMm()'s own shape reasons (point count, adjacent shortest ` +
				'edges, or a 2nd/3rd-shortest tie). A throw for any OTHER reason is a bug being laundered into "the exemption still holds".',
			).toMatch(/^freeEndsMm\(\): "[a-z0-9_]+" (has \d+ footprint point|has \d+ footprint point\(s\)|has a TIE)/);
			// Code review 2026-09-03 (HIGH finding): "freeEndsMm() still
			// throws" is a property of point count and edge adjacency alone
			// -- it says nothing about whether the REASON above is true, and
			// three of this list's own reasons were false against the
			// committed document despite this check passing for all three.
			// `verify`, where present, makes the reason's own coordinate-
			// level claim a machine-checked one, every run.
			exemption.verify?.(doc);
		}
	});

	// Story 2.1f, DW-154 (a), reverse direction. Same two-directional
	// discipline every other allowlist in this file carries: a declaration
	// that is no longer true fails as a stale entry rather than sitting there
	// exempting an end that has since become bare.
	// mutation: move col_dragon_leg_l's own north cap 2 mm further north (so
	// it leaves col_lock_ceiling_west_fill) and re-export -> this goes red
	// naming the body, the enclosing body it claims, and the fact that the end
	// is now outside it.
	it('every ENCLOSED_END_DECLARATIONS entry is still genuinely enclosed -- an end that has come out of the body it claims to be buried in fails as a stale declaration', () => {
		const doc = readCollisionDoc();
		expect(
			ENCLOSED_END_DECLARATIONS.length,
			'sanity: the enclosed-end allowlist must not be empty -- an empty list makes the forward check above unfalsifiable',
		).toBeGreaterThan(0);
		for (const declaration of ENCLOSED_END_DECLARATIONS) {
			const body = doc.nodes.find((n) => n.name === declaration.body);
			expect(body, `enclosed-end declaration names "${declaration.body}", absent from the committed document`).toBeDefined();
			const host = doc.nodes.find((n) => n.name === declaration.insideBody);
			expect(host, `enclosed-end declaration for "${declaration.body}" names enclosing body "${declaration.insideBody}", absent from the committed document`).toBeDefined();
			expect(host!.footprintMm, `${declaration.insideBody}: an enclosing body must carry a footprintMm polygon`).toBeDefined();
			const poly = host!.footprintMm!;
			let inside = false;
			for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
				const vi = poly[i]!;
				const vj = poly[j]!;
				const crosses = vi.y > declaration.end.y !== vj.y > declaration.end.y;
				if (crosses && declaration.end.x < ((vj.x - vi.x) * (declaration.end.y - vi.y)) / (vj.y - vi.y) + vi.x) {
					inside = !inside;
				}
			}
			let depthMm = Infinity;
			for (let i = 0; i < poly.length; i++) {
				const a = poly[i]!;
				const b = poly[(i + 1) % poly.length]!;
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const len2 = dx * dx + dy * dy;
				let t = len2 === 0 ? 0 : ((declaration.end.x - a.x) * dx + (declaration.end.y - a.y) * dy) / len2;
				t = Math.max(0, Math.min(1, t));
				depthMm = Math.min(depthMm, Math.hypot(declaration.end.x - (a.x + t * dx), declaration.end.y - (a.y + t * dy)));
			}
			expect(
				inside,
				`${declaration.body}'s declared enclosed end (${declaration.end.x.toFixed(2)}, ${declaration.end.y.toFixed(2)}) is NOT inside ` +
				`"${declaration.insideBody}" in the committed document (nearest edge ${depthMm.toFixed(3)} mm away) -- the declaration is stale ` +
				'and the end is bare, so it needs a rubber_post or a corrected record',
			).toBe(true);
			expect(
				depthMm,
				`${declaration.body}'s declared enclosed end (${declaration.end.x.toFixed(2)}, ${declaration.end.y.toFixed(2)}) is only ` +
				`${depthMm.toFixed(3)} mm inside "${declaration.insideBody}" -- that is within the boundary epsilon a genuine JOIN uses, so ` +
				'this is not an enclosure at all',
			).toBeGreaterThan(0.05);
		}
	});

	// Story 2.1f, DW-154 (d): NOTHING in this repository asserted that a
	// rubber_post actually protrudes. All that was ever checked was Euclidean
	// distance from a free-end midpoint to the nearest post's own BBOX CENTRE
	// -- so a post entirely inside another body satisfied FR-31 while the end
	// it nominally terminates was, in fact, bare. Measured before this story:
	// FOUR of the 48 posts were entirely covered by the union of the non-post
	// col_ wall footprints (col_post_lock_ceiling_e, col_post_lock_ceiling_w,
	// col_post_lock_ceiling_west_fill_e and col_post_dragon_leg_l), and a
	// fifth (col_post_sling_r_west) stood 7 of its 8 vertices inside
	// col_sling_r with 0.500 mm proud. Three of those are removed by this
	// story as enclosed ends, the fifth is re-sited onto its own cap midpoint.
	//
	// The subject set is DERIVED from the document (`surface === 'rubber_post'`),
	// never hand-listed, so a post added later is judged without anyone
	// remembering to list it.
	// mutation: move any rubber_post entirely inside its neighbouring body's
	// footprint in the committed document -> this gate goes red naming the
	// post and the burying body.
	it('every rubber_post presents collision surface OUTSIDE the union of the non-post col_ wall footprints -- a buried post terminates nothing (DW-153/DW-154 (d))', () => {
		const doc = readCollisionDoc();
		const posts = doc.nodes.filter((n) => n.surface === 'rubber_post');
		const walls = doc.nodes.filter((n) => n.shape === 'wall' && n.surface !== 'rubber_post' && n.footprintMm !== undefined);
		expect(posts.length, 'sanity: at least one rubber_post must be authored, or this gate is vacuous').toBeGreaterThan(0);
		expect(walls.length, 'sanity: at least one non-post wall body must be authored, or every post trivially "protrudes"').toBeGreaterThan(0);

		/** How far outside every wall a sample must sit to count as exposed -- the same float-noise margin the post-distance budget carries. */
		const EXPOSURE_MARGIN_MM = POST_DISTANCE_FLOAT_NOISE_MM;
		function insidePolygon(poly: ReadonlyArray<{ readonly x: number; readonly y: number }>, point: { readonly x: number; readonly y: number }): boolean {
			let inside = false;
			for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
				const vi = poly[i]!;
				const vj = poly[j]!;
				const crosses = vi.y > point.y !== vj.y > point.y;
				if (crosses && point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x) {
					inside = !inside;
				}
			}
			return inside;
		}
		function edgeDistanceMm(poly: ReadonlyArray<{ readonly x: number; readonly y: number }>, point: { readonly x: number; readonly y: number }): number {
			let nearest = Infinity;
			for (let i = 0; i < poly.length; i++) {
				const a = poly[i]!;
				const b = poly[(i + 1) % poly.length]!;
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const len2 = dx * dx + dy * dy;
				let t = len2 === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
				t = Math.max(0, Math.min(1, t));
				nearest = Math.min(nearest, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
			}
			return nearest;
		}

		let exposedPosts = 0;
		for (const post of posts) {
			expect(post.footprintMm, `${post.name}: a rubber_post must carry a footprintMm polygon`).toBeDefined();
			const ring = post.footprintMm!;
			// Sample the post's own boundary: every vertex AND every edge
			// midpoint. Vertices alone miss a post whose only exposure is
			// along a face, which is a real case in the committed document
			// (col_post_lock_ceiling_west_fill_e sits in the seam between
			// col_lock_ceiling_west_fill and col_lock_ceiling).
			const samples: { x: number; y: number }[] = [];
			for (let i = 0; i < ring.length; i++) {
				const a = ring[i]!;
				const b = ring[(i + 1) % ring.length]!;
				samples.push({ x: a.x, y: a.y });
				samples.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
			}
			let bestExposureMm = -1;
			let buryingBody = '(none -- the post is exposed)';
			let deepestCover = -1;
			for (const sample of samples) {
				let coveredBy: string | undefined;
				let clearanceMm = Infinity;
				for (const wall of walls) {
					const poly = wall.footprintMm!;
					const distance = edgeDistanceMm(poly, sample);
					if (insidePolygon(poly, sample) || distance <= EXPOSURE_MARGIN_MM) {
						if (distance > deepestCover) {
							deepestCover = distance;
							buryingBody = wall.name;
						}
						coveredBy = wall.name;
						break;
					}
					clearanceMm = Math.min(clearanceMm, distance);
				}
				if (coveredBy === undefined && clearanceMm > bestExposureMm) {
					bestExposureMm = clearanceMm;
				}
			}
			expect(
				bestExposureMm,
				`${post.name} presents NO collision surface outside the union of the non-post col_ wall footprints -- every sampled point on ` +
				`its own boundary lies inside another body (deepest cover: "${buryingBody}"). A buried post terminates nothing: the guide end ` +
				'it nominally protects is bare in fact while this gate reads green. Either the end is genuinely enclosed (declare it in ' +
				'ENCLOSED_END_DECLARATIONS and delete the post) or the post must be re-sited so it protrudes.',
			).toBeGreaterThan(0);
			exposedPosts++;
		}
		// Anti-vacuity, derived from the subject set: every post was judged.
		expect(exposedPosts, 'the protrusion gate must judge every derived rubber_post').toBe(posts.length);
	});

	// Story 2.1d code review (2026-09-03), AC 7 (DW-128). The hardened
	// freeEndsMm() throws are load-bearing for AC 3 -- a wrongly-derived free
	// end makes the gate above pass or fail SILENTLY over an untested end --
	// but nothing asserted the throws themselves. The only catch in this file
	// is the reverse-exemption test's bare `catch { derivationFailed = true }`,
	// which discards the error, so replacing both messages with a bare
	// `throw new Error()` left the whole suite green while AC 7's "fails
	// loudly, NAMING the body and its point count" was gone. These two cases
	// pin the message text directly, the same way test/machine-serve-drain.
	// test.ts pins createDeviceMechanics()'s own throw.
	describe('freeEndsMm() fails loudly by name (AC 7, DW-128)', () => {
		it('a non-quad footprint throws naming the body AND its point count', () => {
			const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
			expect(() => freeEndsMm(triangle, 'col_fake_triangle')).toThrowError(/col_fake_triangle/);
			expect(() => freeEndsMm(triangle, 'col_fake_triangle')).toThrowError(/3 footprint point/);
		});

		it('a wedge (two shortest edges ADJACENT) throws naming the body, both edge indices and its point count', () => {
			// Two short edges sharing vertex (0,0): index 3 (len 4) and index
			// 0 (len 5), against two long edges -- the exact shape col_sling_l
			// really has in the committed document.
			const wedge = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 60, y: 30 }, { x: 0, y: 4 }];
			expect(() => freeEndsMm(wedge, 'col_fake_wedge')).toThrowError(/col_fake_wedge/);
			expect(() => freeEndsMm(wedge, 'col_fake_wedge')).toThrowError(/ADJACENT/);
			expect(() => freeEndsMm(wedge, 'col_fake_wedge')).toThrowError(/4 footprint point/);
		});

		// Story 2.1f, DW-154 (b). A genuine tie between the 2nd- and
		// 3rd-shortest edges used to be resolved by FOOTPRINT VERTEX ORDER --
		// which tools/export.py's hull pass controls and nothing here asserts
		// -- and for a 3-way tie the ADJACENT guard does not even fire,
		// because the sort picks indices 0 and 2 and indexDiff === 2. The
		// result was a silently WRONG opposite pair.
		it('a 2nd/3rd-shortest-edge TIE throws naming the body and the tied edge lengths, instead of resolving by vertex order', () => {
			// A square: all four edges 10 mm, so every pair ties. Under the
			// old derivation this returned indices 0 and 2 -- an answer that
			// looks correct and is chosen by vertex order alone.
			const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
			expect(() => freeEndsMm(square, 'col_fake_square')).toThrowError(/col_fake_square/);
			expect(() => freeEndsMm(square, 'col_fake_square')).toThrowError(/TIE/);
			expect(() => freeEndsMm(square, 'col_fake_square')).toThrowError(/10\.000/);
		});

		it('a near-tie OUTSIDE the epsilon still derives -- the tie throw is discriminating, not unconditional', () => {
			// 2nd shortest 20.000, 3rd shortest 20.400: a 0.400 mm gap,
			// outside FREE_END_TIE_EPSILON_MM (0.3) and so still derivable.
			const nearTie = [{ x: 0, y: 0 }, { x: 20.4, y: 0 }, { x: 20.4, y: 20 }, { x: 0, y: 20 }];
			expect(() => freeEndsMm(nearTie, 'col_fake_near_tie')).not.toThrow();
		});

		it('a well-formed quad still derives its two opposite end-cap midpoints', () => {
			// Non-vacuity: the two throws above must be caused by the SHAPE,
			// not by freeEndsMm() having become unconditionally throwing.
			const quad = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 300 }, { x: 0, y: 300 }];
			expect(freeEndsMm(quad, 'col_fake_quad')).toEqual([{ x: 6, y: 0 }, { x: 6, y: 300 }]);
		});
	});

	// Story 2.1d code review (2026-09-03), AC 4's rename half. `grep -rn
	// "vis_spinner_l" test/ src/` returned NOTHING before this block: the
	// rename was covered only by a manual check, so reverting it to
	// `add_box_wall('col_spinner_l', ...)` and re-exporting reddened nothing
	// but `StaleReplayHeaderError` on `assetHash` -- the hash-only signal this
	// spec's own AC 1 mutation note rules insufficient ("a hash-only red would
	// mean nothing observes the value"), and indistinguishable from any other
	// geometry edit.
	describe('asset contract -- Story 2.1d AC 4: the spinner is a vis_ node, not a col_ one (AD-11 prefix contract, AD-6 as amended)', () => {
		it('col_spinner_l is absent from the collision document and vis_spinner_l never enters it -- a vis_ node collides with nothing', () => {
			const doc = readCollisionDoc();
			const names = doc.nodes.map((n) => n.name);
			expect(names, 'col_spinner_l was renamed vis_spinner_l: a node nothing collides with is not col_ under AD-11').not.toContain('col_spinner_l');
			expect(
				names.filter((n) => n.startsWith('vis_')),
				'no vis_ node may appear in the collision document -- tools/export.py excludes presentation objects by prefix',
			).toEqual([]);
		});

		it('sw_spinner is byte-identical to its committed box -- this story renamed the node and nothing else (Story 2.3 owns spin and decay)', () => {
			const zone = readCollisionDoc().switchZones.find((z) => z.name === 'sw_spinner');
			expect(zone, 'sw_spinner must still exist -- s_spinner closes on the zone, never on a body').toBeDefined();
			expect(zone!.minMm).toEqual({ x: 5, y: 635, z: 0 });
			expect(zone!.maxMm).toEqual({ x: 45, y: 662, z: 30 });
		});
	});

	it('no guide-end post carries surface metal or wood -- every one is rubber_post by construction', () => {
		const doc = readCollisionDoc();
		const posts = doc.nodes.filter((n) => n.name.startsWith('col_post_'));
		expect(posts.length).toBeGreaterThan(0);
		for (const post of posts) {
			expect(post.surface, `${post.name}: guide-end posts must never carry metal or wood`).toBe('rubber_post');
		}
	});
});

describe('asset contract -- Story 2.1a AC 1: the flipper tip gap and both outlane widths match their tunables (DW-72, DW-78)', () => {
	it('the measured flipper tip gap (right bat\'s tip minus left bat\'s tip, at end-of-stroke) equals TUNING.flipperTipGapMm', () => {
		const doc = readCollisionDoc();
		const left = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperL)!;
		const right = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperR)!;
		expect(left, 'col_flipper_l missing').toBeDefined();
		expect(right, 'col_flipper_r missing').toBeDefined();
		const measuredGapMm = right.bboxMm.min.x - left.bboxMm.max.x;
		expect(measuredGapMm).toBeCloseTo(TUNING.flipperTipGapMm.value, 1);
	});

	it('the measured LEFT outlane clear width (col_wall_left\'s interior face to col_guide_divider_l\'s outlane-facing face) equals TUNING.outlaneWidthLeftMm', () => {
		const doc = readCollisionDoc();
		const wallLeft = doc.nodes.find((n) => n.name === 'col_wall_left')!;
		const dividerL = doc.nodes.find((n) => n.name === 'col_guide_divider_l')!;
		expect(wallLeft, 'col_wall_left missing').toBeDefined();
		expect(dividerL, 'col_guide_divider_l missing').toBeDefined();
		const measuredMm = dividerL.bboxMm.min.x - wallLeft.bboxMm.max.x;
		expect(measuredMm).toBeCloseTo(TUNING.outlaneWidthLeftMm.value, 1);
	});

	it('the measured RIGHT outlane clear width (col_wall_lane\'s main-field face to col_guide_divider_r\'s outlane-facing face) equals TUNING.outlaneWidthRightMm', () => {
		const doc = readCollisionDoc();
		const wallLane = doc.nodes.find((n) => n.name === 'col_wall_lane')!;
		const dividerR = doc.nodes.find((n) => n.name === 'col_guide_divider_r')!;
		expect(wallLane, 'col_wall_lane missing').toBeDefined();
		expect(dividerR, 'col_guide_divider_r missing').toBeDefined();
		const measuredMm = wallLane.bboxMm.min.x - dividerR.bboxMm.max.x;
		expect(measuredMm).toBeCloseTo(TUNING.outlaneWidthRightMm.value, 1);
	});
});

describe('asset contract -- Story 2.1a AC 8: the centre channel clear width is pinned DIMENSIONALLY, not only behaviourally', () => {
	// Code review, 2026-08-31. AC 8 promises the 32.65 mm centre channel is
	// "pinned by a test so a later story cannot narrow the channel
	// silently". test/drain-routing.test.ts alone does not deliver that: a
	// dead-centre release clears each outer guide by 2.83 mm and never
	// touches one, so its lateral-drift bound is structurally 0.00 mm, and
	// the biased-release drift is not monotonic in the channel width.
	// DEMONSTRATED at review time by performing the narrowing: moving BOTH
	// outer guides 2.5 mm toward centre (32.65 -> 27.65 mm, a 15% narrowing,
	// still wider than the ball) left EVERY AC 8 assertion green -- centred
	// drift 0.00 < 2, both biased drifts 13.81 < 18, all three drained. Only
	// `drained` can fail there, and only once the channel falls below one
	// ball diameter. These gates measure the authored width itself, in the
	// same shape as the tip-gap and outlane-width gates above.
	//
	// mutation: move col_guide_outer_l/_r 2.5 mm toward centre in the
	// committed collision document -> the clear-width assertion goes red
	// reporting 27.65 against 32.65.
	const CHANNEL_CLEAR_MM = 32.65;
	const POCKET_GAP_MM = 30.65;

	it('the clear width between col_guide_outer_l and col_guide_outer_r is the authored 32.65 mm', () => {
		const doc = readCollisionDoc();
		const outerL = doc.nodes.find((n) => n.name === 'col_guide_outer_l')!;
		const outerR = doc.nodes.find((n) => n.name === 'col_guide_outer_r')!;
		expect(outerL, 'col_guide_outer_l missing').toBeDefined();
		expect(outerR, 'col_guide_outer_r missing').toBeDefined();
		const measuredMm = outerR.bboxMm.min.x - outerL.bboxMm.max.x;
		expect(
			measuredMm,
			`the centre channel between the two outer guides measures ${measuredMm.toFixed(3)} mm; AC 8 pins it at ${CHANNEL_CLEAR_MM} mm. Narrowing it is a deliberate geometry change -- update this pin and re-measure test/drain-routing.test.ts's AC 8 bounds in the same pass.`,
		).toBeCloseTo(CHANNEL_CLEAR_MM, 2);
	});

	it('the pocket posts, not the outer guides, are the narrowest point a centre-draining ball must thread -- and that point still clears the reference ball', () => {
		const doc = readCollisionDoc();
		const postL = doc.nodes.find((n) => n.name === 'col_post_pocket_l')!;
		const postR = doc.nodes.find((n) => n.name === 'col_post_pocket_r')!;
		expect(postL, 'col_post_pocket_l missing').toBeDefined();
		expect(postR, 'col_post_pocket_r missing').toBeDefined();
		const gapMm = postR.bboxMm.min.x - postL.bboxMm.max.x;
		expect(
			gapMm,
			`the pocket-post gap measures ${gapMm.toFixed(3)} mm; the seeding script derives it as 40.65 - 2*POCKET_OFFSET_ALONG_MM - 2*POST_RADIUS_MM = ${POCKET_GAP_MM} mm`,
		).toBeCloseTo(POCKET_GAP_MM, 2);
		expect(
			gapMm,
			'sanity: the posts must be the true bottleneck, narrower than the outer-guide channel -- otherwise this pin measures the wrong thing',
		).toBeLessThan(CHANNEL_CLEAR_MM);
		expect(
			gapMm,
			`the narrowest point of the centre channel (${gapMm.toFixed(3)} mm) must stay clear of the ${TABLE.reference.ballMm} mm reference ball`,
		).toBeGreaterThan(TABLE.reference.ballMm);
	});
});

describe('asset contract -- Story 2.1a AC 10: each bottom wall has its top edge pinned DIMENSIONALLY as a ramp toward the drain aperture', () => {
	// Code review, 2026-08-31 (iteration 4, final pass). AC 10's only pin is
	// test/drain-routing.test.ts's behavioural sweep, in exactly the shape AC
	// 8's own pin was found wanting four describes above: it observes where a
	// released ball ends up, never the authored geometry that gets it there.
	// The whole DW-119 residual fix is ONE number -- BOTTOM_WALL_DRAIN_DROP_MM
	// in tools/make-placeholder-blend.py -- and this solver's gravity has no
	// x-component, so if that number ever returns to 0 the top face is a dead
	// flat ledge again and a resting ball is stranded for good. This gate
	// measures the ramp itself, in the same shape as the tip-gap, outlane-width
	// and centre-channel gates above, so the failure names the cause rather
	// than reporting an opaque "never drained".
	//
	// mutation: set BOTTOM_WALL_DRAIN_DROP_MM back to 0.0 in the seeding
	// script and re-export (equivalently: raise either wall's drain-facing
	// top vertex from y = -10 to y = 0 in the committed collision document)
	// -> the drop assertion goes red reporting 0.000 against 10.
	const DRAIN_DROP_MM = 10.0; // tools/make-placeholder-blend.py's BOTTOM_WALL_DRAIN_DROP_MM
	const WALLS = [
		{ name: 'col_wall_bottom_l', drainFacing: 'max' as const },
		{ name: 'col_wall_bottom_r', drainFacing: 'min' as const },
	];

	it.each(WALLS)('$name slopes from y = 0 at its outlane-facing end down to y = -10 at the drain aperture', ({ name, drainFacing }) => {
		const doc = readCollisionDoc();
		const node = doc.nodes.find((n) => n.name === name);
		expect(node, `${name} missing from the committed collision document`).toBeDefined();
		const footprint = node!.footprintMm!;
		expect(footprint, `${name} must be a wall with a footprint`).toBeDefined();

		// The top edge is the pair of vertices with the greatest y at each end
		// of the wall's span: the outlane-facing end (the boundary the outlane
		// geometry assumes, authored at y = 0) and the drain-facing end, which
		// is max.x on the left wall and min.x on the right.
		const drainX = drainFacing === 'max' ? Math.max(...footprint.map((v) => v.x)) : Math.min(...footprint.map((v) => v.x));
		const outlaneX = drainFacing === 'max' ? Math.min(...footprint.map((v) => v.x)) : Math.max(...footprint.map((v) => v.x));
		const topYAt = (x: number) => Math.max(...footprint.filter((v) => Math.abs(v.x - x) < 1e-6).map((v) => v.y));
		const outlaneTopY = topYAt(outlaneX);
		const drainTopY = topYAt(drainX);
		const dropMm = outlaneTopY - drainTopY;

		expect(
			outlaneTopY,
			`${name}'s outlane-facing top corner must stay at y = 0 -- the boundary col_guide_divider_* and the outlane gap are authored against`,
		).toBeCloseTo(0, 3);
		expect(
			dropMm,
			`${name}'s top edge drops ${dropMm.toFixed(3)} mm from its outlane-facing end (x = ${outlaneX}) to the drain aperture (x = ${drainX}); AC 10 pins that at BOTTOM_WALL_DRAIN_DROP_MM = ${DRAIN_DROP_MM} mm. A flat (0 mm) edge is the DW-119 residual: gravity here is pure down-slope with no x-component, so a resting ball on a flat face never moves again.`,
		).toBeCloseTo(DRAIN_DROP_MM, 3);
		expect(
			dropMm,
			`${name}: the ramp must run DOWNHILL toward the drain aperture, not away from it`,
		).toBeGreaterThan(0);
	});
});

// Story 2.1b task 25 -- AC 1's DIMENSIONAL half (the second half; task 16a's
// test/shot-routing.test.ts is the behavioural half -- neither alone closes
// AC 1, per this story's own spec text and 2.1a's own precedent, where
// dimensional checks all passed over outlanes that could not route a ball).
// review date: 2026-09-01. mutation (per gate, following :373-390's own
// convention): moving the authored constant the gate reads changes the
// measured figure, so the gate goes red naming the feature -- verified for
// each gate below by tracing the constant it reads back to
// tools/make-placeholder-blend.py's own authored value.
describe('asset contract -- Story 2.1b task 25: the shot map\'s load-bearing dimensions (AC 1 dimensional half)', () => {
	// Story 2.1c: 50 -> 66 mm, and the WHY is the point of the gate. Each
	// Loop lane now carries a ball in both directions (the shot climbing it
	// and the other Loop's orbit descending it), and the return rail that
	// carries the descent inboard is a ceiling to anything climbing. The
	// shot's own clear column is LANE_CLEAR minus the top connector's own end,
	// the rail's own tip and two ball radii; at 50 mm it closes to zero,
	// measured, and every entry offset stalled against the rail.
	// mutation: change LOOP_LANE_CLEAR_MM in the seeding script and re-export
	// -> this measured width moves with it.
	it('each Loop\'s clear lane width (the perimeter wall\'s interior face to that Loop\'s own rail) is the authored 66 mm (LOOP_LANE_CLEAR_MM)', () => {
		const doc = readCollisionDoc();
		const loopL = doc.nodes.find((n) => n.name === 'col_loop_l');
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		const wallLane = doc.nodes.find((n) => n.name === 'col_wall_lane');
		expect(loopL, 'col_loop_l missing').toBeDefined();
		expect(loopR, 'col_loop_r missing').toBeDefined();
		expect(wallLane, 'col_wall_lane missing').toBeDefined();
		expect(loopL!.bboxMm.min.x, 'col_loop_l\'s own inner (lane-facing) face').toBeCloseTo(66, 1);
		expect(wallLane!.bboxMm.min.x - loopR!.bboxMm.max.x, 'the Right Loop\'s own clear lane width').toBeCloseTo(66, 1);
	});

	// Story 2.1c task 15 -- the figures the orbit's own delivery depends on.
	it('each Loop\'s return rail leaves the shot a clear column between its own tip and the top connector\'s own end', () => {
		const doc = readCollisionDoc();
		const ballRadiusMm = TABLE.reference.ballMm / 2;
		const railL = doc.nodes.find((n) => n.name === 'col_loop_l_return');
		const railR = doc.nodes.find((n) => n.name === 'col_loop_r_return');
		const loopTop = doc.nodes.find((n) => n.name === 'col_loop_top');
		expect(railL, 'col_loop_l_return missing').toBeDefined();
		expect(railR, 'col_loop_r_return missing').toBeDefined();
		expect(loopTop, 'col_loop_top missing').toBeDefined();
		// Story 2.1c review fix: this used to measure col_loop_l/col_loop_r
		// (the OUTER rail, x 66..78 / 390.4..402.4) against the return rail's
		// own tip -- a real clearance, but not the one the shot's own column
		// is bounded by. The ball's own east bound (west bound on the right)
		// is col_loop_top's own END (LOOP_TOP_END_X_MM = 50 mm in from each
		// perimeter wall, tools/make-placeholder-blend.py's own "Where the
		// top connector STOPS" note): everything east of it, up to the outer
		// rail 16 mm further out, is covered by the top connector's own
		// footprint and unreachable to a climbing ball. The old formula
		// (25.010 mm, floor 8) could not go red under either mutation its
		// own comment named -- narrowing LOOP_LANE_CLEAR_MM back to 50 does
		// not even change col_loop_top's own end (a different constant), and
		// the real column (9.010 mm) sits far below the old formula's own
		// number regardless. Recomputed against col_loop_top -- the body the
		// column is genuinely bounded by -- with a floor tight enough that
		// EITHER of the two constants that actually determine it can trip it.
		// mutation: push LOOP_RETURN_END_X_MM inboard by 1 mm (14 -> 15) and
		// re-export -> this column drops to 8.01 mm, below the 8.5 mm floor,
		// red. mutation: pull LOOP_TOP_END_X_MM in by 1 mm (50 -> 49) and
		// re-export -> the SAME 8.01 mm result, red for the other reason --
		// either mutation also stalls the Loop cases in
		// test/shot-routing.test.ts against the rail or the top connector.
		const columnLMm = loopTop!.bboxMm.min.x - railL!.bboxMm.max.x - 2 * ballRadiusMm;
		const columnRMm = railR!.bboxMm.min.x - loopTop!.bboxMm.max.x - 2 * ballRadiusMm;
		expect(columnLMm, 'the LEFT Loop\'s own shot column, between col_loop_l_return\'s tip and col_loop_top\'s own west end').toBeGreaterThan(8.5);
		expect(columnRMm, 'the RIGHT Loop\'s own shot column, between col_loop_top\'s own east end and col_loop_r_return\'s tip').toBeGreaterThan(8.5);
	});

	// Story 2.1c review fix (MED finding): col_loop_top and LOOP_TOP_END_X_MM
	// are the single body and constant DW-123 and AC 7 are about -- before
	// this gate, col_loop_top appeared in test/ only inside the previous
	// test's own mutation comment, with no dimensional pin of its own.
	it('col_loop_top (the re-joined orbit connector, DW-123) starts and ends LOOP_TOP_END_X_MM in from each perimeter wall', () => {
		const doc = readCollisionDoc();
		const loopTop = doc.nodes.find((n) => n.name === 'col_loop_top');
		const wallLane = doc.nodes.find((n) => n.name === 'col_wall_lane');
		expect(loopTop, 'col_loop_top missing').toBeDefined();
		expect(wallLane, 'col_wall_lane missing').toBeDefined();
		const laneX0Mm = wallLane!.bboxMm.min.x;
		// mutation: change LOOP_TOP_END_X_MM in the seeding script (e.g.
		// 50 -> 60) and re-export -> both ends move together and this goes
		// red naming the new authored end, before the shot-column gate above
		// even has to close to catch it.
		expect(loopTop!.bboxMm.min.x, 'col_loop_top\'s own west end (LOOP_TOP_END_X_MM in from x = 0)').toBeCloseTo(50, 1);
		expect(loopTop!.bboxMm.max.x, 'col_loop_top\'s own east end (LOOP_TOP_END_X_MM in from col_wall_lane)').toBeCloseTo(laneX0Mm - 50, 1);
	});

	// Story 2.1c review fix (MED finding): the gap in col_loop_r (split into
	// col_loop_r / col_loop_r_lower) that makes the Ramp's own return a
	// genuine CROSSING rather than a walled-off dead end had no dimensional
	// gate at all -- RAMP_RETURN_GAP_Y0_MM / RAMP_RETURN_GAP_Y1_MM /
	// RAMP_WALL_R_TOP_Y_MM (tools/make-placeholder-blend.py, task 5's own
	// "The Ramp's own return has never been deliverable" note) sit outside
	// the three constants the QA block below covers.
	it('the Ramp-return crossing gap in the Right Loop rail (col_loop_r / col_loop_r_lower) is open, and col_ramp_wall_r stays clear beneath it', () => {
		const doc = readCollisionDoc();
		const loopRLower = doc.nodes.find((n) => n.name === 'col_loop_r_lower');
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		const rampWallR = doc.nodes.find((n) => n.name === 'col_ramp_wall_r');
		expect(loopRLower, 'col_loop_r_lower missing').toBeDefined();
		expect(loopR, 'col_loop_r missing').toBeDefined();
		expect(rampWallR, 'col_ramp_wall_r missing').toBeDefined();
		// mutation: change RAMP_RETURN_GAP_Y0_MM or _Y1_MM in the seeding
		// script (e.g. narrow the gap by raising Y0 to 800) and re-export ->
		// both figures below move and the first two assertions go red naming
		// the new authored bounds.
		expect(loopRLower!.bboxMm.max.y, 'col_loop_r_lower\'s own top (RAMP_RETURN_GAP_Y0_MM) -- where the crossing gap starts').toBeCloseTo(750, 1);
		expect(loopR!.bboxMm.min.y, 'col_loop_r\'s own bottom (RAMP_RETURN_GAP_Y1_MM) -- where the crossing gap ends').toBeCloseTo(832, 1);
		// mutation: raise RAMP_WALL_R_TOP_Y_MM in the seeding script (e.g.
		// 740 -> 745) and re-export -> the clearance below shrinks toward
		// zero and this goes red -- "nothing leaks through it" (the
		// generator's own claim) stops being true once the Ramp's own east
		// wall reaches the crossing gap's own low bound.
		expect(
			loopRLower!.bboxMm.max.y - rampWallR!.bboxMm.max.y,
			'col_ramp_wall_r\'s own north end (RAMP_WALL_R_TOP_Y_MM) must stay clear of the crossing gap\'s own low bound, or a ball could pass through both at once',
		).toBeGreaterThan(5);
	});

	it('each inlane\'s clear channel (its divider guide to its inlane guide) passes the reference ball with margin', () => {
		const doc = readCollisionDoc();
		const dividerL = doc.nodes.find((n) => n.name === 'col_guide_divider_l')!;
		const inlaneL = doc.nodes.find((n) => n.name === 'col_guide_inlane_l')!;
		const dividerR = doc.nodes.find((n) => n.name === 'col_guide_divider_r')!;
		const inlaneR = doc.nodes.find((n) => n.name === 'col_guide_inlane_r')!;
		// mutation: move LOOP_FUNNEL_OFFSET_MM in so the inlane guide crowds
		// the divider and re-export -> this goes red, and the orbit's own
		// delivery in test/shot-routing.test.ts goes red with it.
		expect(inlaneL.bboxMm.min.x - dividerL.bboxMm.max.x, 'the LEFT inlane\'s own clear channel').toBeCloseTo(39.1, 1);
		expect(dividerR.bboxMm.min.x - inlaneR.bboxMm.max.x, 'the RIGHT inlane\'s own clear channel').toBeCloseTo(39.1, 1);
	});

	it('each inlane feed ramp ends over its own bat, so a ball that closes s_inlane_* is genuinely delivered to a flipper', () => {
		const doc = readCollisionDoc();
		const feedL = doc.nodes.find((n) => n.name === 'col_guide_inlane_feed_l')!;
		const feedR = doc.nodes.find((n) => n.name === 'col_guide_inlane_feed_r')!;
		const flipperL = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperL)!;
		const flipperR = doc.nodes.find((n) => n.name === TABLE.nodes.colFlipperR)!;
		// mutation: shift either feed's bat-side end outboard past its bat and
		// re-export -> s_inlane_* still closes but the ball never reaches the
		// band, which is exactly the half-delivery this story's Design Notes
		// name as the "two obligations" failure.
		expect(feedL.bboxMm.max.x, 'the LEFT feed\'s own bat-side end must lie over col_flipper_l').toBeGreaterThan(flipperL.bboxMm.min.x);
		expect(feedL.bboxMm.max.x, 'the LEFT feed must not overshoot col_flipper_l').toBeLessThan(flipperL.bboxMm.max.x);
		expect(feedR.bboxMm.min.x, 'the RIGHT feed\'s own bat-side end must lie over col_flipper_r').toBeGreaterThan(flipperR.bboxMm.min.x);
		expect(feedR.bboxMm.min.x, 'the RIGHT feed must not overshoot col_flipper_r').toBeLessThan(flipperR.bboxMm.max.x);
	});

	it('the divider guides\' own tops sit below the slingshots, so each inlane mouth is genuinely reachable from the Loop\'s own return', () => {
		const doc = readCollisionDoc();
		const dividerL = doc.nodes.find((n) => n.name === 'col_guide_divider_l')!;
		const dividerR = doc.nodes.find((n) => n.name === 'col_guide_divider_r')!;
		const slingL = doc.nodes.find((n) => n.name === 'col_sling_l')!;
		const slingR = doc.nodes.find((n) => n.name === 'col_sling_r')!;
		// mutation: restore DIVIDER_Y_TOP_MM to GUIDE_Y_TOP_MM (420) and
		// re-export -> the divider's own top post lands back across the Loop
		// return's own path into the inlane and the return drops into the
		// outlane instead.
		expect(dividerL.bboxMm.max.y, 'col_guide_divider_l\'s own top (DIVIDER_Y_TOP_MM)').toBeCloseTo(380, 1);
		expect(dividerR.bboxMm.max.y, 'col_guide_divider_r\'s own top (DIVIDER_Y_TOP_MM)').toBeCloseTo(380, 1);
		expect(dividerL.bboxMm.max.y, 'the divider guide must end below the slingshot\'s own footprint').toBeLessThan(slingL.bboxMm.min.y);
		// Story 2.1c review fix: the mirrored right-side relationship this gate
		// exists to guarantee had no assertion at all -- dividerR was fetched
		// only to pin its own y-value (above), never compared against slingR.
		// mutation: restore DIVIDER_Y_TOP_MM to GUIDE_Y_TOP_MM (420) on the
		// right side only and re-export -> this assertion goes red where the
		// left-side one alone would not have caught a right-side-only
		// regression.
		expect(dividerR.bboxMm.max.y, 'the RIGHT divider guide must end below the RIGHT slingshot\'s own footprint').toBeLessThan(slingR.bboxMm.min.y);
	});

	// [STORY 2.1f] Re-authored from 34 to 56, deliberately, as one term of the
	// bottom-right corridor budget (DW-137/DW-136). The channel's own WEST
	// edge is what the corridor re-solve had to move -- 338.0 -> 298.4, so a
	// ball rising west of col_sling_r is already inside the Ramp channel --
	// and the EAST wall moved with it, to 354.4, only as far as the ball
	// allows: the slot between col_ramp_wall_r and col_loop_r_lower has to
	// stay SUB-BALL (measured 24.0 mm against a 26.99 mm ball; at
	// RAMP_LANE_CLEAR_MM = 52 it would have been 28.0 mm and a ball would sit
	// in it). 56.0 is still narrower than LOOP_LANE_CLEAR_MM (66.0), the
	// relation the constant's own comment in the seeding script asks for.
	// mutation: change RAMP_LANE_CLEAR_MM in the seeding script and re-export
	// -> this measured width moves with it.
	it('the Ramp entrance\'s clear width (between its two up-channel walls) is the authored 56 mm (RAMP_LANE_CLEAR_MM), and still narrower than a Loop lane', () => {
		const doc = readCollisionDoc();
		const wallL = doc.nodes.find((n) => n.name === 'col_ramp_wall_l');
		const wallR = doc.nodes.find((n) => n.name === 'col_ramp_wall_r');
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		const wallLane = doc.nodes.find((n) => n.name === 'col_wall_lane');
		const loopRLower = doc.nodes.find((n) => n.name === 'col_loop_r_lower');
		expect(wallL, 'col_ramp_wall_l missing').toBeDefined();
		expect(wallR, 'col_ramp_wall_r missing').toBeDefined();
		expect(loopR, 'col_loop_r missing').toBeDefined();
		expect(wallLane, 'col_wall_lane missing').toBeDefined();
		expect(loopRLower, 'col_loop_r_lower missing').toBeDefined();
		const clearWidth = wallR!.bboxMm.min.x - wallL!.bboxMm.max.x;
		expect(clearWidth, 'the Ramp\'s own clear channel width').toBeCloseTo(56, 1);
		expect(
			clearWidth,
			'the Ramp channel must stay narrower than a Loop lane -- the relation RAMP_LANE_CLEAR_MM carries in the seeding script',
		).toBeLessThan(wallLane!.bboxMm.min.x - loopR!.bboxMm.max.x);
		expect(
			loopRLower!.bboxMm.min.x - wallR!.bboxMm.max.x,
			'the dead slot between the Ramp east wall and the Right Loop lower rail must stay SUB-BALL, or it becomes a pocket a ball can sit in',
		).toBeLessThan(TABLE.reference.ballMm);
	});

	// [STORY 2.1f, AC 3] The corridor tunable itself, pinned so a later change
	// cannot silently re-narrow the thing DW-137 and DW-136 were about. This
	// is RAMP_CORRIDOR_CLEAR_MM in tools/make-placeholder-blend.py: the clear
	// width from col_ramp_wall_l's own east face to col_sling_r's own west
	// face, which is exactly the quantity pnpm check:corridor measures.
	// mutation: change RAMP_CORRIDOR_CLEAR_MM in the seeding script and
	// re-export -> this gate goes red naming the measured width, the tunable
	// and the delta.
	it('the bottom-right corridor clear width is the authored 34 mm (RAMP_CORRIDOR_CLEAR_MM) and admits a ball into the Ramp channel (DW-137/DW-136)', () => {
		const doc = readCollisionDoc();
		const wallL = doc.nodes.find((n) => n.name === 'col_ramp_wall_l');
		const slingR = doc.nodes.find((n) => n.name === 'col_sling_r');
		const guideOuterR = doc.nodes.find((n) => n.name === 'col_guide_outer_r');
		expect(wallL, 'col_ramp_wall_l missing').toBeDefined();
		expect(slingR, 'col_sling_r missing').toBeDefined();
		expect(guideOuterR, 'col_guide_outer_r missing').toBeDefined();
		const rampCorridorClearMm = 34.0;
		const measured = slingR!.bboxMm.min.x - wallL!.bboxMm.max.x;
		expect(
			measured,
			`the bottom-right corridor clear width measures ${measured.toFixed(3)} mm against the authored RAMP_CORRIDOR_CLEAR_MM ` +
			`(${rampCorridorClearMm.toFixed(3)} mm) -- a delta of ${(measured - rampCorridorClearMm).toFixed(3)} mm`,
		).toBeCloseTo(rampCorridorClearMm, 1);
		expect(
			measured,
			'DW-137: the corridor must admit a ball into the Ramp channel -- col_sling_r west face at least one ball diameter east of col_ramp_wall_l east face',
		).toBeGreaterThanOrEqual(TABLE.reference.ballMm);
		// The DRAGON-bank half of the same corridor (DW-136): ball-centre
		// freedom between col_guide_outer_r east face and col_sling_r west
		// face. 7.485 mm before this story, which is what made most of the six
		// targets unstrikable from below; 25.885 mm after it.
		const centreFreedomMm = slingR!.bboxMm.min.x - guideOuterR!.bboxMm.max.x - TABLE.reference.ballMm;
		expect(
			centreFreedomMm,
			`the DRAGON bank approach corridor gives ${centreFreedomMm.toFixed(3)} mm of ball-centre freedom -- it was 7.485 mm before Story 2.1f`,
		).toBeGreaterThan(20);
		// [ADDED 2026-09-05, code review] The TRUE constriction, past the
		// post. Both figures above measure to col_sling_r's own west face
		// (332.4), but col_post_sling_r_west -- which this story re-sited
		// ONTO that face precisely so it would protrude (task 5) -- reaches
		// x = 328.4, four millimetres further west. A ball passing the
		// slingshot must clear the POST, not the band. The gate's conclusion
		// is unchanged (30.000 mm still admits a 26.99 mm ball) but the
		// surplus is 3.010 mm, not the 7.010 mm the face-to-face figure
		// implies, and that is the number a later change has to respect.
		// Asserted here so the real margin is pinned rather than inferred.
		// mutation: widen POST_RADIUS_MM, or move col_post_sling_r_west west,
		// so the post reaches below 325.39 -> this assertion goes red naming
		// the post and the measured clear.
		const postSlingRWest = doc.nodes.find((n) => n.name === 'col_post_sling_r_west');
		expect(postSlingRWest, 'col_post_sling_r_west missing').toBeDefined();
		const clearPastPostMm = postSlingRWest!.bboxMm.min.x - wallL!.bboxMm.max.x;
		expect(
			clearPastPostMm,
			`the corridor's TRUE narrowest clear -- col_post_sling_r_west's west edge (${postSlingRWest!.bboxMm.min.x.toFixed(3)}) to col_ramp_wall_l's east face `
			+ `(${wallL!.bboxMm.max.x.toFixed(3)}) -- measures ${clearPastPostMm.toFixed(3)} mm, leaving ${(clearPastPostMm - TABLE.reference.ballMm).toFixed(3)} mm over the `
			+ `${TABLE.reference.ballMm} mm ball. The face-to-face figure above is ${(measured - clearPastPostMm).toFixed(3)} mm more generous because the post protrudes into it.`,
		).toBeGreaterThanOrEqual(TABLE.reference.ballMm);
	});

	it('the Lock lane\'s clear width (between the Dragon\'s two legs) is the authored 40 mm (LOCK_LANE_CLEAR_MM)', () => {
		const doc = readCollisionDoc();
		const legL = doc.nodes.find((n) => n.name === 'col_dragon_leg_l');
		const legR = doc.nodes.find((n) => n.name === 'col_dragon_leg_r');
		expect(legL, 'col_dragon_leg_l missing').toBeDefined();
		expect(legR, 'col_dragon_leg_r missing').toBeDefined();
		const clearWidth = legR!.bboxMm.min.x - legL!.bboxMm.max.x;
		expect(clearWidth, 'the Lock lane\'s own clear width').toBeCloseTo(40, 1);
	});

	it('the Dragon\'s own centreline sits left of the playfield centre (PLAYFIELD_W_MM / 2 = 257.2), the off-centre placement FR-29 requires', () => {
		const doc = readCollisionDoc();
		// Story 2.1c rework (code review pass 2 HIGH finding): this used to
		// read the centreline off the two legs' own OUTER edges,
		// (legL.min.x + legR.max.x) / 2 -- correct only while both legs share
		// one width (DRAGON_LEG_W_MM). The fix for that finding makes the legs
		// asymmetric (DRAGON_LEG_L_W_MM 60, DRAGON_LEG_R_W_MM 45 -- the right
		// leg alone retreats, clear of the Right-Loop-widening cascade that
		// pushed the DRAGON bank into its own shadow; moving the LEFT leg
		// too was tried and reverted -- measured, it wedges a ball into the
		// Left Loop's own funnel edge), so that formula would now read a
		// centreline that has moved with the asymmetry, not the Dragon's own
		// true siting. sw_lock_lane's own zone centre is the robust
		// replacement: (lock_lane_x0 + lock_lane_x1) / 2 = DRAGON_CENTER_X_MM
		// by construction, in EITHER leg's own width, because both legs are
		// built outward from the lock lane's own (symmetric) edges, never
		// from each other.
		// mutation: change DRAGON_CENTER_X_MM in the seeding script and
		// re-export -> this goes red, reporting the new authored centreline.
		const lockLane = doc.switchZones.find((z) => z.name === 'sw_lock_lane');
		expect(lockLane, 'sw_lock_lane missing').toBeDefined();
		const centreX = (lockLane!.minMm.x + lockLane!.maxMm.x) / 2;
		expect(centreX, 'the Dragon\'s own centreline (authored DRAGON_CENTER_X_MM)').toBeCloseTo(170, 1);
		expect(centreX, 'the Dragon must sit left of the playfield centre (257.2 mm) -- the right flipper takes a rejection straight, the left flipper backhands it').toBeLessThan(TABLE.reference.playfieldMm.w / 2);
	});

	it('the DRAGON bank\'s own outer-to-outer width (six targets, col_dragon_d through col_dragon_n) matches the authored pitch and target width', () => {
		const doc = readCollisionDoc();
		const first = doc.nodes.find((n) => n.name === 'col_dragon_d');
		const last = doc.nodes.find((n) => n.name === 'col_dragon_n');
		expect(first, 'col_dragon_d missing').toBeDefined();
		expect(last, 'col_dragon_n missing').toBeDefined();
		const width = last!.bboxMm.max.x - first!.bboxMm.min.x;
		// Independent of DRAGON_BANK_X0_MM's own value (itself derived since
		// Story 2.1f): pitch x 5 gaps + one target width, outer-to-outer.
		// [STORY 2.1f] 81 -> 65: DRAGON_BANK_PITCH_MM 14 -> 11 and
		// DRAGON_BANK_TARGET_W_MM 11 -> 10, deliberately, because the
		// bottom-right corridor budget needed 16 mm out of the bank and this
		// is where it came from. The six targets still stand 1.0 mm apart.
		// mutation: change DRAGON_BANK_PITCH_MM in the seeding script and
		// re-export -> this measured span moves with it.
		expect(width, 'the DRAGON bank\'s own outer-to-outer span (col_dragon_d\'s left edge to col_dragon_n\'s right edge)').toBeCloseTo(65, 1);
		// Non-vacuity on the pitch itself: six distinct targets, evenly
		// spaced, never one wide body -- derived from the six bodies rather
		// than re-asserting the constant.
		const letters = ['d', 'r', 'a', 'g', 'o', 'n'];
		const centres = letters.map((letter) => {
			const node = doc.nodes.find((n) => n.name === `col_dragon_${letter}`);
			expect(node, `col_dragon_${letter} missing`).toBeDefined();
			return (node!.bboxMm.min.x + node!.bboxMm.max.x) / 2;
		});
		for (let i = 1; i < centres.length; i++) {
			expect(centres[i]! - centres[i - 1]!, `the DRAGON bank pitch between target ${letters[i - 1]} and ${letters[i]}`).toBeCloseTo(11, 1);
		}
	});

	// Story 2.1c code review pass 3: the pass-2 HIGH finding this rework
	// closed -- DRAGON_BANK_X0_MM 255 -> 235 putting col_dragon_d wholly
	// inside col_dragon_leg_r's own x-shadow -- had NO regression gate. Every
	// existing gate is blind to it by construction: the Lock-lane width reads
	// legL.max.x -> legR.min.x (the right leg grows eastward, so its width
	// never enters), the Dragon centreline was deliberately re-derived from
	// sw_lock_lane's own zone centre, the outer-to-outer span above is
	// independent of X0, and the bank's own shot-routing case asserts only
	// "at least one target closes". Reverting DRAGON_LEG_R_W_MM 45 -> 60
	// therefore reburies col_dragon_d with the whole suite green. Its sibling
	// finding from the same pass (col_top_divider_4 buried inside col_loop_r)
	// DID get a gate, ten lines below; this is the matching half.
	// mutation: revert DRAGON_LEG_R_W_MM 45 -> 60 and re-export -> the leg
	// returns to x 190..250, col_dragon_d (240..251) is 10 mm inside it and
	// col_dragon_r is clipped -> this goes red naming the overlap.
	it('the DRAGON bank\'s westmost target clears col_dragon_leg_r\'s own shadow, and its eastmost clears col_ramp_wall_l (the pass-2 leg-shadow fix, pinned)', () => {
		const doc = readCollisionDoc();
		const first = doc.nodes.find((n) => n.name === 'col_dragon_d');
		const last = doc.nodes.find((n) => n.name === 'col_dragon_n');
		const legR = doc.nodes.find((n) => n.name === 'col_dragon_leg_r');
		const rampWallL = doc.nodes.find((n) => n.name === 'col_ramp_wall_l');
		expect(first, 'col_dragon_d missing').toBeDefined();
		expect(last, 'col_dragon_n missing').toBeDefined();
		expect(legR, 'col_dragon_leg_r missing').toBeDefined();
		expect(rampWallL, 'col_ramp_wall_l missing').toBeDefined();
		expect(
			first!.bboxMm.min.x - legR!.bboxMm.max.x,
			'col_dragon_d\'s own west edge must sit clear of col_dragon_leg_r\'s own east edge -- a bank target inside the leg\'s x-shadow is unreachable by any straight shot from below',
		).toBeGreaterThan(0);
		expect(
			rampWallL!.bboxMm.min.x - last!.bboxMm.max.x,
			'col_dragon_n\'s own east edge must sit clear of col_ramp_wall_l\'s own west face',
		).toBeGreaterThan(0);
	});

	it('the first two Top-lane divider gaps (centre to centre) are the authored 100 mm pitch; the third is not -- divider 4 was moved to clear the widened Right Loop rail', () => {
		// Story 2.1c review fix: divider 4 used to sit at the uniform 100 mm
		// pitch (x centre 395, footprint 391..399) -- fully swallowed by
		// col_loop_r once this story widened the Right Loop's lane and moved
		// col_loop_r's own west face to x = 390.4 (measured: a 400 mm^2
		// solid-on-solid interpenetration, found by review). Moved to x centre
		// 376 instead of shifting all four dividers, because shifting divider
		// 1 left by the same amount would instead collide it with the
		// symmetrically-widened col_loop_l (whose east face, 78, leaves only
		// 13 mm of margin against divider 1's own 91 mm west edge -- not
		// enough room to also open a 19 mm gap on the right). Pinned two ways:
		// the two untouched gaps stay at the authored pitch, and divider 4 is
		// asserted clear of col_loop_r's own live west face, so a future
		// change to either constant is caught by whichever it actually moves.
		// mutation: revert TOP_LANE_DIVIDER_XS_MM's 4th entry from 376.0 back
		// to 395.0 and re-export -> the clearance assertion below goes red
		// (divider 4's east edge, 399, would be 8.6 mm INSIDE col_loop_r's
		// west face, not clear of it).
		const doc = readCollisionDoc();
		const dividers = [1, 2, 3, 4].map((i) => doc.nodes.find((n) => n.name === `col_top_divider_${i}`));
		for (const [i, divider] of dividers.entries()) {
			expect(divider, `col_top_divider_${i + 1} missing`).toBeDefined();
		}
		const centres = dividers.map((d) => (d!.bboxMm.min.x + d!.bboxMm.max.x) / 2);
		for (let i = 0; i < 2; i++) {
			expect(centres[i + 1] - centres[i], `divider ${i + 1}->${i + 2} spacing`).toBeCloseTo(100, 1);
		}
		// Story 2.1c review fix: the replacement gate above pinned the two
		// UNTOUCHED gaps but left the deliberate third one (81 mm, not 100)
		// unpinned entirely beyond the clearance check below -- divider 4
		// could drift anywhere from roughly 340 to 385 mm undetected, west
		// into divider 3 or into Top lane 3 itself. TOP_LANE_DIVIDER_T_MM = 8
		// (tools/make-placeholder-blend.py) -- a floor of ballMm + T keeps
		// the gap wide enough for the divider's own thickness plus one ball
		// diameter of daylight, whatever the pitch is tuned to next.
		// mutation: move TOP_LANE_DIVIDER_XS_MM's 4th entry toward the third
		// divider (e.g. 376 -> 320) and re-export -> this goes red before the
		// clearance-to-col_loop_r check below would catch it.
		const TOP_LANE_DIVIDER_T_MM = 8;
		expect(
			centres[3]! - centres[2]!,
			'divider 3->4 spacing must stay wide enough for the divider\'s own thickness plus a full ball diameter',
		).toBeGreaterThan(TABLE.reference.ballMm + TOP_LANE_DIVIDER_T_MM);
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		expect(loopR, 'col_loop_r missing').toBeDefined();
		const divider4EastEdge = dividers[3]!.bboxMm.max.x;
		expect(
			loopR!.bboxMm.min.x - divider4EastEdge,
			`col_top_divider_4's own east edge (${divider4EastEdge}) must clear col_loop_r's live west face (${loopR!.bboxMm.min.x}) -- 0 or negative means the divider is (partly or fully) buried inside the Loop rail and physically unreachable`,
		).toBeGreaterThan(5);
	});

	// Code review 2026-09-03 (MED finding): TOP_LANE_Y1_MM moved 1000.0 ->
	// 1004.8 (tools/make-placeholder-blend.py) so the four
	// col_top_divider_* UPPER tips join col_loop_top exactly (task 9's own
	// termination accounting -- a genuine join, not a posted end). sw_top_1/
	// _2/_3 derive from it, so each grew 4.8 mm at its own high edge (995 ->
	// 999.8) as an UNRECORDED, untested side effect: s_top_1/_2/_3 now close
	// on a wider band, and nothing pinned the move. Pinned here so the NEXT
	// such move is deliberate, not discovered at a later review.
	// mutation: revert TOP_LANE_Y1_MM 1004.8 -> 1000.0 and re-export -> both
	// assertions below go red (the divider tips separate from col_loop_top
	// by 4.8 mm, and every sw_top_* zone's own high y face reverts to 995).
	it('TOP_LANE_Y1_MM sits exactly at col_loop_top\'s own south face (a genuine join, not a gap), and every sw_top_* zone\'s own high y face is derived from it (995 -> 999.8, the review-recorded side effect)', () => {
		const doc = readCollisionDoc();
		const loopTop = doc.nodes.find((n) => n.name === 'col_loop_top');
		expect(loopTop, 'col_loop_top missing').toBeDefined();
		const TOP_LANE_Y1_MM = 1004.8;
		expect(
			loopTop!.bboxMm.min.y,
			'col_loop_top\'s own south (low y) face must sit exactly at TOP_LANE_Y1_MM -- this is what makes the top-divider tips a genuine join rather than a bare end',
		).toBeCloseTo(TOP_LANE_Y1_MM, 1);
		for (const switchName of ['s_top_1', 's_top_2', 's_top_3']) {
			const zone = doc.switchZones.find((z) => z.switch === switchName);
			expect(zone, `no sw_ zone names switch ${switchName}`).toBeDefined();
			expect(
				zone!.maxMm.y,
				`${switchName}'s own zone must reach TOP_LANE_Y1_MM - 5 (999.8), not the pre-review 995 -- a stale value here means the zone quietly shrank back and this switch closes on a narrower band than the committed geometry actually supports`,
			).toBeCloseTo(TOP_LANE_Y1_MM - 5, 1);
		}
	});

	// Story 2.1d rework iteration 2, code review 2026-09-04 (build-auto review
	// pass, blind-hunter finding): col_lock_ceiling/col_lock_ceiling_west_fill
	// took six empirical rounds to land (see tools/make-placeholder-blend.py's
	// own [REWORK] notes beside LOCK_CEILING_X_OVERLAP_E_MM and
	// LOCK_FILL_WEST_MARGIN_MM for the full history of near-miss traps a ball
	// settled into along the way), yet nothing pinned the geometry those
	// rounds converged on -- test/lock-device-behaviour.test.ts's own
	// enclosure test only checks col_lock_ceiling's BOUNDING BOX against the
	// legs, never the ridge's own internal vertex heights or the west fill's
	// own clearance margin above it, so a future edit could silently reopen
	// any of rounds 1-5's own failure modes.
	// mutation: change LOCK_CEILING_RIDGE_MM 28.0 -> 44.0 (pushing the ridge
	// peak to 658, above col_lock_ceiling_west_fill's own east-side north
	// point at 668 -- wait, both move together LIVE, see below) and
	// re-export -> the second assertion below goes red, naming the lost
	// clearance margin. [Rework iteration 3, round 7, the shipped fix:
	// col_lock_ceiling is no longer a symmetric-shoulder ridge --
	// LOCK_CEILING_EAST_SHOULDER_MM (626) is now taller than
	// LOCK_CEILING_SHOULDER_MM (614, the WEST shoulder, unchanged from
	// rework iteration 2), and LOCK_CEILING_RIDGE_MM itself moved
	// 10.0 -> 28.0, raising the peak 624 -> 642. LOCK_FILL_THICKNESS_MM is
	// now authored LIVE against LOCK_CEILING_RIDGE_MM (tools/make-
	// placeholder-blend.py's own comment there records the direct A/B
	// confirmation that this coupling is load-bearing, not incidental),
	// so col_lock_ceiling_west_fill's own north edge moves with the peak
	// too (634 -> 652 at its own east corner). See tools/make-placeholder-
	// blend.py's own LOCK_CEILING_RIDGE_MM/LOCK_CEILING_EAST_SHOULDER_MM/
	// LOCK_FILL_THICKNESS_MM comments for the full seven-round account.]
	it('col_lock_ceiling\'s own ridge vertices sit at their derived heights (598 base / 614 west shoulder / 626 east shoulder / 642 peak), and col_lock_ceiling_west_fill\'s own north edge clears that peak by a real margin throughout the whole overlap band', () => {
		const doc = readCollisionDoc();
		const ceiling = doc.nodes.find((n) => n.name === 'col_lock_ceiling');
		expect(ceiling, 'col_lock_ceiling missing').toBeDefined();
		expect(ceiling!.footprintMm, 'col_lock_ceiling must carry a footprintMm polygon').toBeDefined();
		const ceilingYs = [...ceiling!.footprintMm!].map((p) => p.y).sort((a, b) => a - b);
		expect(ceilingYs.length, 'col_lock_ceiling is a 5-point ridge (base x2, west shoulder x1, east shoulder x1, peak x1)').toBe(5);
		expect(ceilingYs[0], 'col_lock_ceiling base, first point (LOCK_CEILING_Y0_MM)').toBeCloseTo(598, 1);
		expect(ceilingYs[1], 'col_lock_ceiling base, second point (LOCK_CEILING_Y0_MM)').toBeCloseTo(598, 1);
		expect(ceilingYs[2], 'col_lock_ceiling WEST shoulder (LOCK_CEILING_Y0_MM + LOCK_CEILING_SHOULDER_MM)').toBeCloseTo(614, 1);
		expect(ceilingYs[3], 'col_lock_ceiling EAST shoulder (LOCK_CEILING_Y0_MM + LOCK_CEILING_EAST_SHOULDER_MM)').toBeCloseTo(626, 1);
		const ridgePeakY = ceilingYs[4]!;
		expect(ridgePeakY, 'col_lock_ceiling peak (WEST shoulder + LOCK_CEILING_RIDGE_MM)').toBeCloseTo(642, 1);

		const westFill = doc.nodes.find((n) => n.name === 'col_lock_ceiling_west_fill');
		expect(westFill, 'col_lock_ceiling_west_fill missing').toBeDefined();
		expect(westFill!.footprintMm, 'col_lock_ceiling_west_fill must carry a footprintMm polygon').toBeDefined();
		const fillYs = [...westFill!.footprintMm!].map((p) => p.y).sort((a, b) => a - b);
		expect(fillYs.length, 'col_lock_ceiling_west_fill is a 4-point parallelogram (south x2, north x2)').toBe(4);
		// The two LOWER points are the south (leg-tracking) edge; the two
		// HIGHER points are the north edge. The lower of the two north-edge
		// points is the worst-case clearance against the ridge's own peak --
		// this is what round 5's own fix (the file's own [REWORK] note beside
		// LOCK_FILL_WEST_MARGIN_MM) actually guarantees, not merely the
		// bounding box's own max.
		const northEdgeWorstCaseY = fillYs[2]!;
		// [CORRECTED, code review 2026-09-04 iteration 2 -- Rule 19: the
		// relational assertion below CANNOT FAIL on its own.]
		// `LOCK_FILL_THICKNESS_MM = LOCK_CEILING_SHOULDER_MM +
		// LOCK_CEILING_RIDGE_MM + 10.0`, and the fill's north edge is
		// (DRAGON_LEG_L_INNER_SOLID_TOP_MM - LOCK_FILL_WEST_MARGIN_MM) +
		// LOCK_FILL_THICKNESS_MM = 598 + S + R + 10, while the ridge peak is
		// LOCK_CEILING_Y0_MM + S + R = 598 + S + R. The shoulder and ridge
		// terms CANCEL: the margin is invariantly 10.000 mm for ANY value of
		// either constant, so `> ridgePeakY + 5` is `10 > 5` and is true even
		// for geometry that has broken. The spec's own recorded falsifier for
		// this test (LOCK_CEILING_RIDGE_MM 28 -> 44) reddens the peak pin two
		// lines above, NOT this assertion, which is how the cancellation went
		// unnoticed. Pinned against an ABSOLUTE height as well, so the two
		// heights can no longer drift together and preserve a false margin.
		// mutation: change the trailing `+ 10.0` in LOCK_FILL_THICKNESS_MM
		// (tools/make-placeholder-blend.py) to `+ 2.0` and re-export -> the
		// absolute pin below goes red at 644 against the expected 652, where
		// the relational assertion alone would still read a 2 mm "margin" as
		// passing only if the floor were also lowered. Changing
		// LOCK_CEILING_SHOULDER_MM or LOCK_CEILING_RIDGE_MM now reddens the
		// peak pin AND this pin, instead of neither. [Rework iteration 3,
		// round 7: LOCK_CEILING_RIDGE_MM's own 10.0 -> 28.0 correction moves
		// this absolute height 634 -> 652; see this test's own title comment
		// above for the full seven-round account.]
		expect(
			northEdgeWorstCaseY,
			`col_lock_ceiling_west_fill's own north edge (worst case ${northEdgeWorstCaseY}) must sit at its derived absolute height -- (DRAGON_LEG_L_INNER_SOLID_TOP_MM 600 - LOCK_FILL_WEST_MARGIN_MM 2) + LOCK_FILL_THICKNESS_MM 54 = 652`,
		).toBeCloseTo(652, 1);
		expect(
			northEdgeWorstCaseY - ridgePeakY,
			`col_lock_ceiling_west_fill's own north edge (worst case ${northEdgeWorstCaseY}) must clear col_lock_ceiling's own ridge peak (${ridgePeakY}) by a real margin throughout the whole overlap band -- round 5's own fix exists specifically because matching heights exactly, twice, parked a ball at the near-miss seam (see the [REWORK] note beside LOCK_FILL_WEST_MARGIN_MM). Read with the absolute pin above: this relation alone is algebraically invariant and cannot fail by itself`,
		).toBeGreaterThan(5);
	});

	// Rework iteration 3 round 2 (code review 2026-09-04, MED finding):
	// this dedicated pin used to exist because col_lock_ceiling_west_
	// fill's own EAST riser tested as genuinely embedded inside col_lock_
	// ceiling's own solid material (isJoined() found it joined, so it
	// never reached AC 3's own forward gate at all) -- col_post_lock_
	// ceiling_west_fill_e was a defensive-only post nothing else in this
	// suite verified.
	//
	// [REMOVED, rework iteration 3 round 7] Round 7's own peak-height fix
	// (tools/make-placeholder-blend.py's own LOCK_CEILING_RIDGE_MM
	// comment) moved col_lock_ceiling_west_fill's own EAST riser out from
	// under col_lock_ceiling's own material -- it is now GENUINELY bare,
	// picked up by the ordinary forward gate like any other free end
	// (isJoined() correctly finds it un-joined; the gate's own non-vacuity
	// floor two tests above still passes at 40). This dedicated pin is
	// gone with it -- keeping a stale coordinate here would either mask a
	// real regression (if col_post_lock_ceiling_west_fill_e ever moved
	// away from its own true, now-derived position in tools/make-
	// placeholder-blend.py) or duplicate a check the forward gate already
	// makes for real. See tools/make-placeholder-blend.py's own comment
	// beside the add_rubber_post('col_post_lock_ceiling_west_fill_e', ...)
	// call for the current, DERIVED (not hand-measured) coordinate.

	// [STORY 2.1f] The hand-written one-off that stood here -- "col_post_dragon_leg_l
	// is present near col_dragon_leg_l's own north-cap free end (120.00,
	// 610.00)" -- is RETIRED, along with the post it pinned. DW-154 (a)'s own
	// point is that this end was taking isJoined()'s unnamed strictly-interior
	// branch, so it never reached the FR-31 post-distance assertion and the
	// post was never load-bearing through the gate; a hand-written assertion
	// beside it compensated for one instance of a general hole. The hole is
	// now closed generally: the end is an ENCLOSED_END_DECLARATIONS entry
	// (measured 1.897 mm inside col_lock_ceiling_west_fill), checked in both
	// directions by the FR-31 describe block above, and the post -- which had
	// all eight vertices inside that same body and contributed no collision
	// surface -- is gone.


	it('the four true perimeter walls (left, top, right, lane) now reach the glass (DW-53: PERIMETER_WALL_H_MM = GLASS_Z_MM = 400), while col_wall_lane_bottom -- not a true perimeter wall -- stays at the interior WALL_H_MM = 50', () => {
		const doc = readCollisionDoc();
		for (const name of ['col_wall_left', 'col_wall_top', 'col_wall_right', 'col_wall_lane']) {
			const node = doc.nodes.find((n) => n.name === name);
			expect(node, `${name} missing`).toBeDefined();
			expect(node!.bboxMm.max.z, `${name}'s own height`).toBeCloseTo(400, 1);
		}
		const laneBottom = doc.nodes.find((n) => n.name === 'col_wall_lane_bottom');
		expect(laneBottom, 'col_wall_lane_bottom missing').toBeDefined();
		expect(laneBottom!.bboxMm.max.z, 'col_wall_lane_bottom is not a true perimeter wall and stays at the interior height').toBeCloseTo(50, 1);
	});

	// The switch-zone completeness assertion (AC 2): sw_ entries live in
	// doc.switchZones as minMm/maxMm and have NO bboxMm -- read from there,
	// never doc.nodes.
	it('every zone-requiring switch (AD-2\'s three-source partition: not button, not tilt_bob/slam, not a parking-device slot) has at least one sw_ zone naming it', () => {
		const doc = readCollisionDoc();
		const parkingDeviceSlots = new Set<string>();
		for (const device of Object.values(TABLE.ballDevices)) {
			if (device.kind === 'parking') {
				for (const slot of device.slots) {
					parkingDeviceSlots.add(slot);
				}
			}
		}
		const excludedClasses = new Set(['button', 'tilt_bob', 'slam']);
		const zoneRequired = Object.entries(TABLE.switches)
			.filter(([name, entry]) => !excludedClasses.has(entry.settleClass) && !parkingDeviceSlots.has(name))
			.map(([name]) => name);
		expect(zoneRequired.length, 'sanity: the shot map must have added zone-requiring switches').toBeGreaterThanOrEqual(29);

		const presentSwitches = new Set(doc.switchZones.map((z) => z.switch));
		for (const switchName of zoneRequired) {
			expect(presentSwitches.has(switchName), `switch "${switchName}" requires a zone but no sw_ object in the committed document names it`).toBe(true);
		}
	});
});

// QA (Story 2.1c), 2026-09-03. Closes a real coverage gap the story's own
// review pass found and deferred rather than fixed: nearly every other new
// load-bearing figure this story adds got a dimensional gate in the shape of
// task 25's own block above, with a `// mutation:` comment -- LOOP_TURN_ANGLE_DEG,
// LOOP_TURN_LOW_Y_MM and RAMP_TURN_Y0_MM (tools/make-placeholder-blend.py's
// own constants block, "Story 2.1c -- the ORBIT" / "The Ramp's own top
// turn") did not. This is coverage-only -- the turn geometry is already
// behaviourally exercised by the orbit's own pass/fail switch-closure checks
// in test/shot-routing.test.ts -- but without a dimensional pin, a future
// perturbation to any of these three constants would surface only as an
// opaque routing failure (a Loop or Ramp case failing somewhere downstream)
// rather than a named dimensional regression at its actual source. Values
// below are read from the committed document, not re-derived independently
// in this test, so a legitimate re-tuning of these constants (with its own
// recorded measurement, per this story's own convention) updates one number
// here rather than fighting an independent re-derivation.
//
// [CORRECTED 2026-09-03, code review pass 2 MED finding] Of the five
// assertions below, three are genuinely sensitive to the three named
// constants (both low-corner checks and both run-length checks, re-verified
// against the live document here: rise 1066.8 - 1036 = 30.8, run
// 30.8 / tan(40 deg) = 36.706, exactly col_loop_turn_l's own bbox width) --
// DW-127 is substantively closed for all three. The other two ("reaches
// col_wall_top's own interior face" and "col_ramp_turn's own east edge
// reaches col_loop_r's west face") are tautologies with respect to THESE
// THREE constants specifically: both turn prisms take PLAYFIELD_H_MM as
// their own high corner regardless of LOOP_TURN_ANGLE_DEG or
// LOOP_TURN_LOW_Y_MM (col_wall_top is independently authored at the SAME
// PLAYFIELD_H_MM, so the two sides cannot be moved apart by either
// constant), and col_ramp_turn's own east points ARE loop_r_x0 in the
// seeding script, with col_loop_r authored FROM the same loop_r_x0 -- equal
// for any value of RAMP_TURN_Y0_MM. Kept, not deleted (each is a real
// connectivity guard against a DIFFERENT regression -- a copy-paste or
// off-by-one in the hard-coded anchor itself, independent of these three
// tunables), but no longer claimed as coverage for them; each is labelled
// below with what it actually protects.
describe('asset contract -- Story 2.1c QA: the orbit\'s own top-turn and Ramp-turn dimensions are pinned (LOOP_TURN_ANGLE_DEG, LOOP_TURN_LOW_Y_MM, RAMP_TURN_Y0_MM)', () => {
	const LOOP_TURN_ANGLE_DEG = 40.0;
	const LOOP_TURN_LOW_Y_MM = 1036.0;
	const RAMP_TURN_Y0_MM = 800.0;

	it('col_loop_turn_l and col_loop_turn_r both start at LOOP_TURN_LOW_Y_MM and both reach col_wall_top\'s own interior face', () => {
		const doc = readCollisionDoc();
		const turnL = doc.nodes.find((n) => n.name === 'col_loop_turn_l');
		const turnR = doc.nodes.find((n) => n.name === 'col_loop_turn_r');
		const wallTop = doc.nodes.find((n) => n.name === 'col_wall_top');
		expect(turnL, 'col_loop_turn_l missing').toBeDefined();
		expect(turnR, 'col_loop_turn_r missing').toBeDefined();
		expect(wallTop, 'col_wall_top missing').toBeDefined();
		// mutation: change LOOP_TURN_LOW_Y_MM in the seeding script and
		// re-export -> both of these go red together, reporting the new
		// authored low corner instead of 1036.
		expect(turnL!.bboxMm.min.y, 'col_loop_turn_l\'s own low corner (LOOP_TURN_LOW_Y_MM)').toBeCloseTo(LOOP_TURN_LOW_Y_MM, 1);
		expect(turnR!.bboxMm.min.y, 'col_loop_turn_r\'s own low corner (LOOP_TURN_LOW_Y_MM)').toBeCloseTo(LOOP_TURN_LOW_Y_MM, 1);
		// A turn that stops short of col_wall_top's own interior face leaves a
		// gap a climbing ball can clip past instead of crossing. NOT sensitive
		// to LOOP_TURN_ANGLE_DEG, LOOP_TURN_LOW_Y_MM or LOOP_LANE_CLEAR_MM (see
		// this block's own [CORRECTED] note above) -- both prisms' own high
		// corner is hard-coded to PLAYFIELD_H_MM regardless of angle or low
		// corner, matching col_wall_top's own independently-authored position
		// at the SAME constant, so this pair can never be moved apart by
		// those three. It guards a different regression: a hard-coded anchor
		// (PLAYFIELD_H_MM itself, or col_wall_top's own authored position)
		// drifting out of sync between the two authoring sites.
		// mutation: none of the three named constants moves this -- change
		// col_wall_top's own authored y position directly, at the wall's own
		// call site, and re-export -> THIS goes red, naming the mismatch.
		// [CORRECTED 2026-09-03, code review pass 3] This note also offered
		// "PLAYFIELD_H_MM's own definition" as a falsifier. It is not one:
		// col_wall_top is authored at PLAYFIELD_H_MM (make-placeholder-blend
		// .py, col_wall_top's own call) and BOTH turn prisms take
		// PLAYFIELD_H_MM as their own high corner, so changing that constant
		// moves both sides of this comparison by the same amount and the
		// assertion stays green for every value of it. Only a source edit
		// that replaces the symbol with a literal at ONE of the two sites can
		// separate them -- which is the guard this pair actually provides.
		// The same block's col_ramp_turn sibling below is unaffected: its
		// claimed mutation IS a single-site source edit.
		expect(turnL!.bboxMm.max.y, 'col_loop_turn_l must reach col_wall_top\'s own interior face').toBeCloseTo(wallTop!.bboxMm.min.y, 1);
		expect(turnR!.bboxMm.max.y, 'col_loop_turn_r must reach col_wall_top\'s own interior face').toBeCloseTo(wallTop!.bboxMm.min.y, 1);
	});

	it('each turn\'s own run length matches LOOP_TURN_ANGLE_DEG -- the angle that trades climb speed for crossing speed', () => {
		const doc = readCollisionDoc();
		const turnL = doc.nodes.find((n) => n.name === 'col_loop_turn_l');
		const turnR = doc.nodes.find((n) => n.name === 'col_loop_turn_r');
		const wallLane = doc.nodes.find((n) => n.name === 'col_wall_lane');
		const wallTop = doc.nodes.find((n) => n.name === 'col_wall_top');
		expect(turnL, 'col_loop_turn_l missing').toBeDefined();
		expect(turnR, 'col_loop_turn_r missing').toBeDefined();
		expect(wallLane, 'col_wall_lane missing').toBeDefined();
		// Story 2.1c review fix: this dereferenced wallTop! below with no
		// toBeDefined() guard, unlike its three siblings in this block -- a
		// missing col_wall_top would throw an unnamed TypeError here instead
		// of failing by name like every other node lookup in this file.
		expect(wallTop, 'col_wall_top missing').toBeDefined();
		const riseMm = wallTop!.bboxMm.min.y - LOOP_TURN_LOW_Y_MM;
		const expectedRunMm = riseMm / Math.tan((LOOP_TURN_ANGLE_DEG * Math.PI) / 180);
		const runL = turnL!.bboxMm.max.x - turnL!.bboxMm.min.x;
		// col_loop_turn_r is anchored east to col_wall_lane's own OUTER face
		// rather than left free-standing at the lane's inner face (its own
		// authoring comment), so its bbox carries an extra WALL_T_MM of pure
		// ceiling beyond the actual hypotenuse run -- measured here from the
		// live document rather than a hard-coded 12, so a change to the wall
		// thickness does not make this assertion fail for the wrong reason.
		const wallTMm = wallLane!.bboxMm.max.x - wallLane!.bboxMm.min.x;
		const runR = turnR!.bboxMm.max.x - turnR!.bboxMm.min.x - wallTMm;
		// mutation: change LOOP_TURN_ANGLE_DEG in the seeding script (e.g. 40 ->
		// 45) and re-export -> the measured run length no longer matches this
		// derivation and both assertions go red; a shallower angle widens the
		// run and leaves the deflected ball more climb speed and less crossing
		// speed, changing which entry offsets the orbit can carry across.
		expect(runL, `col_loop_turn_l's own run, derived from a ${LOOP_TURN_ANGLE_DEG} deg turn`).toBeCloseTo(expectedRunMm, 1);
		expect(runR, `col_loop_turn_r's own run (bbox width less its own WALL_T_MM ceiling extension), mirrored`).toBeCloseTo(expectedRunMm, 1);
	});

	it('col_ramp_turn starts at RAMP_TURN_Y0_MM and its own east edge reaches col_loop_r\'s west face, so the crossing genuinely connects the Ramp\'s channel to the Loop\'s own lane', () => {
		const doc = readCollisionDoc();
		const rampTurn = doc.nodes.find((n) => n.name === 'col_ramp_turn');
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		expect(rampTurn, 'col_ramp_turn missing').toBeDefined();
		expect(loopR, 'col_loop_r missing').toBeDefined();
		// mutation: change RAMP_TURN_Y0_MM in the seeding script (e.g. 800 ->
		// 780) and re-export -> this goes red reporting the new authored low
		// corner instead of 800. A made Ramp shot reaching the turn at the
		// wrong height either clips col_ramp_wall_r's own top (too low) or
		// overshoots into open field above the crossing (too high) -- the
		// exact fluke Phase 1's own diagnostic recorded before this node
		// existed (s_ramp_made closing, then the ball climbing on past the
		// return to y ~1032 and falling into unrelated geometry).
		expect(rampTurn!.bboxMm.min.y, 'col_ramp_turn\'s own low corner (RAMP_TURN_Y0_MM)').toBeCloseTo(RAMP_TURN_Y0_MM, 1);
		// NOT sensitive to RAMP_TURN_Y0_MM, RAMP_LANE_CLEAR_MM or
		// LOOP_LANE_CLEAR_MM (see this block's own [CORRECTED] note above):
		// col_ramp_turn's own east points ARE loop_r_x0 in the seeding
		// script's construction, and col_loop_r is itself authored FROM the
		// same loop_r_x0 -- the two sides are the same number by definition,
		// equal for any value of those three constants. It guards a
		// different regression: the turn's own east anchor drifting off
		// loop_r_x0 in a future edit (a copy-pasted literal in its place).
		// mutation: none of the three named constants moves this -- change
		// col_ramp_turn's own east anchor to a literal instead of loop_r_x0
		// and re-export -> THIS goes red, naming the mismatch.
		expect(
			rampTurn!.bboxMm.max.x,
			'col_ramp_turn\'s own east edge must reach col_loop_r\'s west face, or the crossing stops short of the lane it is meant to hand the ball into',
		).toBeCloseTo(loopR!.bboxMm.min.x, 1);
	});
});
