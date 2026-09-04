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
	const [e0, e1] = edges.slice().sort((a, b) => a.len - b.len);
	const indexDiff = Math.abs(e0!.i - e1!.i);
	if (indexDiff === 1 || indexDiff === 3) {
		throw new Error(
			`freeEndsMm(): "${bodyName}"'s two shortest edges (index ${e0!.i}, ${e1!.i}, lengths ${e0!.len.toFixed(2)}/${e1!.len.toFixed(2)} mm) ` +
			`are ADJACENT -- a wedge-shaped footprint, not a body with two opposite end caps. Deriving free ends from them would return two ` +
			`midpoints at the SAME end and never test the true far end.`,
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
 * Story 2.1d task 13: the two-directional exemption allowlist -- a body
 * here is a guide-class body (by surface) this AC's own gate does NOT
 * require a nearby post for, with a reason string per entry. Enforced in
 * BOTH directions below, the same `PARITY_INERT` pattern
 * (`test/replay-goldens.test.ts:212-261`) uses: a guide off this list with
 * a bare end fails the forward check; an entry here whose end IS
 * terminated fails as a stale exemption. Every reason is either "tapered to
 * a point, no flat cap the ball could catch" (FR-31's own hazard is an
 * exposed FLAT end) or a named Block If this story cannot lift.
 */
const GUIDE_TERMINATION_EXEMPTIONS: ReadonlyArray<{ readonly body: string; readonly reason: string }> = [
	{ body: 'col_loop_l_return', reason: 'add_loop_return_rail() tapers this rail\'s own inboard end to a single point rather than a flat cap -- no exposed face for FR-31 to protect (the same shape col_loop_r_return uses).' },
	{ body: 'col_loop_r_return', reason: 'add_loop_return_rail() tapers this rail\'s own inboard end to a single point rather than a flat cap -- no exposed face for FR-31 to protect.' },
	{ body: 'col_loop_top', reason: 'the orbit\'s own top connector, a 5-point turn piece joined into col_loop_l/col_loop_r on both sides (verified 0.000 mm each) -- not a 2-ended guide, so freeEndsMm()\'s own quad assumption does not apply.' },
	{ body: 'col_loop_turn_l', reason: 'a turn/redirector piece at the orbit\'s own top corner, joined into the perimeter wall and the lane on both sides -- not a free-ended guide; its adjacent-shortest-edge shape is the turn\'s own angle, not an unterminated tip.' },
	{ body: 'col_loop_turn_r', reason: 'the mirrored turn/redirector piece -- same reasoning as col_loop_turn_l.' },
	{ body: 'col_ramp_turn', reason: 'the Ramp\'s own top turn, joined into the channel on both sides -- not a free-ended guide; same adjacent-shortest-edge shape as the loop turns, for the same reason.' },
	{
		body: 'col_sling_l',
		reason: 'DW-128, a real committed case: the anti-stranding slope (20 mm drop) shortens the east side to 15 mm, ' +
			'below the 32 mm south cap, making the two shortest edges ADJACENT (a genuine wedge) -- freeEndsMm() correctly ' +
			'throws rather than silently deriving the wrong pair. Re-authoring the slope so the shortest edges become the ' +
			'correct opposite pair would move the body itself, which the Block If reserves for Story 2.1f (col_sling_l/_r). ' +
			'Both plausible ends are posted anyway as a safety measure: col_post_sling_l (114, 420, the old south-cap ' +
			'derivation) and col_post_sling_l_north (114, 445, the true far/sloped-cap end).',
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

		/** Every OTHER col_/sw_ wall body's own footprint, for the "genuinely joined" structural test below -- box (flippers) and plane (playfield/glass) shapes never count as a join partner. */
		function isJoined(point: { readonly x: number; readonly y: number }, ownName: string): { joined: boolean; to?: string } {
			const JOIN_TOLERANCE_MM = 1.0;
			for (const other of doc.nodes) {
				if (other.name === ownName || other.shape !== 'wall' || !other.footprintMm) {
					continue;
				}
				const poly = other.footprintMm;
				for (let i = 0; i < poly.length; i++) {
					const a = poly[i]!;
					const b = poly[(i + 1) % poly.length]!;
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const len2 = dx * dx + dy * dy;
					let t = len2 === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
					t = Math.max(0, Math.min(1, t));
					const distance = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
					if (distance <= JOIN_TOLERANCE_MM) {
						return { joined: true, to: other.name };
					}
				}
			}
			return { joined: false };
		}

		for (const guide of guides) {
			if (exemptedNames.has(guide.name)) {
				continue;
			}
			expect(guide.footprintMm, `${guide.name}: a guide-class col_ wall body must carry a footprintMm polygon`).toBeDefined();
			for (const end of freeEndsMm(guide.footprintMm!, guide.name)) {
				const { joined, to } = isJoined(end, guide.name);
				if (joined) {
					continue; // a genuinely joined end -- structurally not "free" at all.
				}
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
					`${guide.name}'s free end at table (${end.x.toFixed(2)}, ${end.y.toFixed(2)}) has no rubber_post within one post radius ` +
					`(nearest join candidate: ${to ?? '(none)'}) -- nearest post is "${nearestName}" at ${nearestDistance.toFixed(2)} mm ` +
					`(post radius ${nearestRadius.toFixed(2)} mm)`,
				).toBeLessThanOrEqual(nearestRadius + 0.5); // 0.5 mm float-noise margin
			}
		}
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
			let derivationFailed = false;
			try {
				freeEndsMm(body!.footprintMm ?? [], body!.name);
			} catch {
				derivationFailed = true;
			}
			expect(
				derivationFailed,
				`${exemption.body}: freeEndsMm() now derives a clean answer for this body (footprint: ${JSON.stringify(body!.footprintMm)}) -- the exemption ("${exemption.reason}") is stale; remove it and let this body pass through the forward check like any other guide`,
			).toBe(true);
		}
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

	it('the Ramp entrance\'s clear width (between its two up-channel walls) is the authored 34 mm (RAMP_LANE_CLEAR_MM)', () => {
		const doc = readCollisionDoc();
		const wallL = doc.nodes.find((n) => n.name === 'col_ramp_wall_l');
		const wallR = doc.nodes.find((n) => n.name === 'col_ramp_wall_r');
		expect(wallL, 'col_ramp_wall_l missing').toBeDefined();
		expect(wallR, 'col_ramp_wall_r missing').toBeDefined();
		const clearWidth = wallR!.bboxMm.min.x - wallL!.bboxMm.max.x;
		expect(clearWidth, 'the Ramp\'s own clear channel width').toBeCloseTo(34, 1);
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
		// Independent of DRAGON_BANK_X0_MM's own value (240, Story 2.1c
		// rework): pitch=14mm x 5 gaps + target width 11mm = 70 + 11 = 81 mm
		// outer-to-outer.
		expect(width, 'the DRAGON bank\'s own outer-to-outer span (col_dragon_d\'s left edge to col_dragon_n\'s right edge)').toBeCloseTo(81, 1);
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
