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

function readCollisionDoc(): {
	nodes: Array<{ name: string; shape: string; surface?: string; physMaterial?: string; bboxMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }>;
	switchZones: Array<{ name: string; switch: string }>;
} {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
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

describe('asset contract -- TABLE.physMaterials <-> TUNING.materials drift pin', () => {
	it('the two name lists never drift apart silently', () => {
		expect(Object.keys(TABLE.physMaterials).sort()).toEqual(Object.keys(TUNING.materials).sort());
	});
});
