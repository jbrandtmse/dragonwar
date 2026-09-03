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

describe('asset contract -- Story 2.1a AC 1: every ball-guide free end terminates at a rubber_post (DW-72, DW-77)', () => {
	it('every col_guide_* node\'s two free ends each have a rubber_post node within one post radius', () => {
		const doc = readCollisionDoc();
		const guides = doc.nodes.filter((n) => n.name.startsWith('col_guide_'));
		expect(guides.length, 'sanity: at least one guide must be authored').toBeGreaterThan(0);
		const posts = doc.nodes.filter((n) => n.surface === 'rubber_post');
		expect(posts.length, 'sanity: at least one rubber_post node must be authored').toBeGreaterThan(0);

		// Story 2.1c generalised this derivation. Story 2.1a's own guides were
		// all straight, axis-aligned prisms running along y, so "the two free
		// ends" could be read off the bounding box: its y-extremes, at the x
		// centreline. This story authors an ANGLED guide -- the inlane feed
		// ramp, whose whole job is to run diagonally from the inlane down to
		// the bat -- and for that shape the bbox corners are not on the guide
		// at all. The ends are now derived from the FOOTPRINT: every guide
		// this file draws is a quad with two long side edges and two short END
		// CAPS, so the free ends are the midpoints of the two SHORTEST edges.
		// That reproduces the old answer EXACTLY for every 2.1a guide (a
		// 12 mm-wide, 300 mm-long y-running prism's two shortest edges are its
		// horizontal caps, whose midpoints are (centreX, minY) and
		// (centreX, maxY)) and is correct for an angled one too.
		const freeEndsMm = (footprint: ReadonlyArray<{ readonly x: number; readonly y: number }>): { x: number; y: number }[] => {
			const edges = footprint.map((a, i) => {
				const b = footprint[(i + 1) % footprint.length]!;
				return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, len: Math.hypot(b.x - a.x, b.y - a.y) };
			});
			return edges
				.slice()
				.sort((a, b) => a.len - b.len)
				.slice(0, 2)
				.map((e) => e.mid);
		};

		for (const guide of guides) {
			expect(guide.footprintMm, `${guide.name}: a col_guide_* node must carry a footprintMm polygon`).toBeDefined();
			for (const end of freeEndsMm(guide.footprintMm!)) {
				const centreX = end.x;
				const endY = end.y;
				let nearestDistance = Infinity;
				let nearestName = '(none)';
				let nearestRadius = 0;
				for (const post of posts) {
					const postCentreX = (post.bboxMm.min.x + post.bboxMm.max.x) / 2;
					const postCentreY = (post.bboxMm.min.y + post.bboxMm.max.y) / 2;
					const postRadiusMm = (post.bboxMm.max.x - post.bboxMm.min.x) / 2;
					const distance = Math.hypot(centreX - postCentreX, endY - postCentreY);
					if (distance < nearestDistance) {
						nearestDistance = distance;
						nearestName = post.name;
						nearestRadius = postRadiusMm;
					}
				}
				expect(
					nearestDistance,
					`${guide.name}'s free end at table (${centreX.toFixed(2)}, ${endY.toFixed(2)}) has no rubber_post within one post radius -- nearest is "${nearestName}" at ${nearestDistance.toFixed(2)} mm (post radius ${nearestRadius.toFixed(2)} mm)`,
				).toBeLessThanOrEqual(nearestRadius + 0.5); // 0.5 mm float-noise margin
			}
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
	it('each Loop\'s return rail leaves the shot a clear column between its own tip and the lane\'s inner rail', () => {
		const doc = readCollisionDoc();
		const ballRadiusMm = TABLE.reference.ballMm / 2;
		const railL = doc.nodes.find((n) => n.name === 'col_loop_l_return');
		const railR = doc.nodes.find((n) => n.name === 'col_loop_r_return');
		const loopL = doc.nodes.find((n) => n.name === 'col_loop_l');
		const loopR = doc.nodes.find((n) => n.name === 'col_loop_r');
		const wallLane = doc.nodes.find((n) => n.name === 'col_wall_lane');
		expect(railL, 'col_loop_l_return missing').toBeDefined();
		expect(railR, 'col_loop_r_return missing').toBeDefined();
		// mutation: push LOOP_RETURN_END_X_MM inboard past the point the shot
		// can pass, or narrow LOOP_LANE_CLEAR_MM back to 50, and re-export ->
		// this column closes and the Loop cases in test/shot-routing.test.ts
		// go red with the shot stalling against the rail.
		const columnLMm = loopL!.bboxMm.min.x - railL!.bboxMm.max.x - 2 * ballRadiusMm;
		const columnRMm = railR!.bboxMm.min.x - loopR!.bboxMm.max.x - 2 * ballRadiusMm;
		expect(columnLMm, 'the LEFT Loop\'s own shot column, between col_loop_l_return\'s tip and col_loop_l').toBeGreaterThan(8);
		expect(columnRMm, 'the RIGHT Loop\'s own shot column, between col_loop_r and col_loop_r_return\'s tip').toBeGreaterThan(8);
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
		const legL = doc.nodes.find((n) => n.name === 'col_dragon_leg_l');
		const legR = doc.nodes.find((n) => n.name === 'col_dragon_leg_r');
		expect(legL, 'col_dragon_leg_l missing').toBeDefined();
		expect(legR, 'col_dragon_leg_r missing').toBeDefined();
		const centreX = (legL!.bboxMm.min.x + legR!.bboxMm.max.x) / 2;
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
		// DRAGON_BANK_X0_MM=255, pitch=14mm x 5 gaps + target width 11mm = 70 + 11 = 81 mm outer-to-outer.
		expect(width, 'the DRAGON bank\'s own outer-to-outer span (col_dragon_d\'s left edge to col_dragon_n\'s right edge)').toBeCloseTo(81, 1);
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
