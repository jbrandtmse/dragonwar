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

	it('both flipper nodes measure the reference bat length within tolerance', () => {
		const doc = readCollisionDoc();
		const expectedMm = TABLE.reference.flipperBatIn * 25.4;
		for (const nodeName of [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR]) {
			const node = doc.nodes.find((n) => n.name === nodeName)!;
			expect(node, `${nodeName} missing from collision doc`).toBeDefined();
			const b = node.bboxMm;
			const measured = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
			expect(measured).toBeCloseTo(expectedMm, 1);
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
