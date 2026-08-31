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

describe('asset contract -- Story 1.5: col_lane_deflector is present with a real, angled footprint (DW-58)', () => {
	it('col_lane_deflector exists, is wall-shaped, and its footprint is a non-axis-aligned three-point polygon', () => {
		const doc = readCollisionDoc();
		const node = doc.nodes.find((n) => n.name === 'col_lane_deflector');
		expect(node, 'col_lane_deflector missing from the collision document').toBeDefined();
		expect(node!.shape).toBe('wall');
		expect(node!.footprintMm, 'col_lane_deflector must carry a footprintMm polygon').toBeDefined();
		const footprint = node!.footprintMm!;
		expect(footprint.length, 'the deflector is a triangular prism -- its plan-view footprint must have exactly 3 points').toBe(3);

		// "Not axis-aligned": at least one edge is neither horizontal nor
		// vertical -- the property an axis-aligned bounding-box reduction
		// could never produce, and the reason task 2's hull reduction exists.
		let hasDiagonalEdge = false;
		for (let i = 0; i < footprint.length; i++) {
			const a = footprint[i];
			const b = footprint[(i + 1) % footprint.length];
			const dx = Math.abs(a.x - b.x);
			const dy = Math.abs(a.y - b.y);
			if (dx > 1e-6 && dy > 1e-6) {
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

		// Every authored guide in this story is a straight, axis-aligned
		// prism running along y (constant x-range) -- its two FREE ends are
		// therefore its own bboxMm y-extremes, at its own x centreline.
		for (const guide of guides) {
			const { min, max } = guide.bboxMm;
			const centreX = (min.x + max.x) / 2;
			for (const endY of [min.y, max.y]) {
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
