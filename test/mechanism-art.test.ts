// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.4 (DW-249, DW-142, DW-258), AC 2 and AC 3 -- the art contract,
// proven from the EXPORTED artifacts only: the committed glb (its JSON
// chunk AND its BIN chunk, every triangle) and the committed collision
// document. No Blender, no Babylon, nothing read from
// `tools/make-placeholder-blend.py`'s text.
//
// The rules under test (the spec's Always list; the spine's Consistency
// Conventions row "Art parts"):
//   - scope: every 5.0a twin except `vis_dragon` is an art part behind the
//     SAME name, a direct child of `playfield_root`, carrying only
//     `mat_art_*` materials; a second material lives in a `<parent>_<part>`
//     child; every mesh keeps AD-11/AD-12's contract;
//   - the ball band, table z [0, ballMm]: every triangle with a vertex in the
//     band keeps all three vertices within 0.5 mm of its source body's
//     footprint (a sourceless part: of ANY col_ footprint), so the visible
//     path matches the collision path; `vis_plunger` alone is exempt;
//   - coverage: the in-band x/y bbox of the whole node equals its body's
//     within 0.5 mm, and the part reaches at least min(zHighMm, ballMm);
//   - rubber: every rubber_post / rubber_band part has a `mat_art_rubber`
//     mesh spanning z = ballMm / 2 whose in-band bbox is the body's, and
//     `mat_art_rubber` is dark, rough and non-metallic;
//   - plastics and the spinner blade's swept circle sit above the band, no
//     rubber vertex is under a plastic, and no plastic covers a flipper, the
//     drop bank, the Ramp lane or a Loop lane;
//   - <= 2,000 triangles per twin with its descendants;
//   - the flipper, drop-target, ramp and guide materials each differ from
//     mat_playfield by >= 0.25 in some channel, and a dropped target still
//     reveals a different colour behind it (DW-294's art equivalent);
//   - the plunger pins, the spinner geometry, the two DW bodies' footprints;
//   - no external asset: exactly one image (the playfield mask), no
//     glTF extension.
//
// Falsifiability (Rule 19, the spec's Verification section): moving one
// vis_post_* rubber-ring vertex 2 mm outward in the glb reddens the band
// case; appending an images[] entry reddens the single-image case.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { glbToTable } from '../src/sim/table/frames';
import { VIS_DRAGON_NODE_NAME, VIS_PLUNGER_NODE_NAME, VIS_SPINNER_BLADE_NODE_NAME, VIS_SPINNER_NODE_NAME, visTwinName } from '../src/presentation/scene/vis-names';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const BALL_MM = TABLE.reference.ballMm;
/** The band test's own tolerance (the spec's 0.5 mm). */
const BAND_TOLERANCE_MM = 0.5;
/** A vertex this far below 0 or above ballMm still counts as in the band (float32 noise). */
const Z_EPSILON_MM = 1e-3;
const PIN_TOLERANCE_MM = 0.01;
const TRIANGLE_BUDGET = 2000;
const MIN_PLAYFIELD_SEPARATION = 0.25;
const PLAYFIELD_MATERIAL = 'mat_playfield';
const RUBBER_MATERIAL = 'mat_art_rubber';
/** `tools/make-placeholder-blend.py`'s `SPINNER_Y_MM`: the spinner's authored table y. Mirrored (the collision document does not carry it) -- cross-checked below against `sw_spinner`'s own zone. */
const SPINNER_Y_MM = 648;
/** `tools/make-placeholder-blend.py`'s `WALL_H_MM`, mirrored (the collision document does not carry it): the rail height 5.0a's cap rule drew every guide at. */
const WALL_H_MM = 50;
/** How far above min(zHigh, WALL_H_MM) a part may reach: a post's nut (+3) and a sling post carrying its plastic (+4). */
const ART_TOP_ALLOWANCE_MM = 4;
/** The Always rule's round-part ceiling: at most this many segments per ring. */
const MAX_ROUND_SEGMENTS = 16;
const ATTRIBUTIONS_PATH = path.resolve(__dirname, '..', 'ATTRIBUTIONS.md');

interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}
interface Pt {
	readonly x: number;
	readonly y: number;
}

interface GltfNode {
	readonly name?: string;
	readonly mesh?: number;
	readonly children?: readonly number[];
	readonly translation?: readonly number[];
	readonly rotation?: readonly number[];
	readonly scale?: readonly number[];
	readonly extras?: Record<string, unknown>;
}
interface GltfPrimitive {
	readonly attributes: Record<string, number>;
	readonly indices?: number;
	readonly material?: number;
}
interface GltfMaterial {
	readonly name?: string;
	readonly pbrMetallicRoughness?: {
		readonly baseColorFactor?: readonly number[];
		readonly metallicFactor?: number;
		readonly roughnessFactor?: number;
		readonly baseColorTexture?: unknown;
		readonly metallicRoughnessTexture?: unknown;
	};
	readonly normalTexture?: unknown;
	readonly emissiveTexture?: unknown;
	readonly occlusionTexture?: unknown;
	readonly extensions?: unknown;
}
interface GltfDocument {
	readonly nodes: readonly GltfNode[];
	readonly meshes: ReadonlyArray<{ readonly primitives: readonly GltfPrimitive[] }>;
	readonly accessors: ReadonlyArray<{ readonly bufferView?: number; readonly byteOffset?: number; readonly componentType: number; readonly count: number; readonly type: string }>;
	readonly bufferViews: ReadonlyArray<{ readonly byteOffset?: number; readonly byteStride?: number }>;
	readonly materials: readonly GltfMaterial[];
	readonly images?: ReadonlyArray<{ readonly name?: string }>;
	readonly textures?: readonly unknown[];
	readonly extensionsUsed?: readonly string[];
	readonly extensionsRequired?: readonly string[];
}

interface CollisionNode {
	readonly name: string;
	readonly shape: string;
	readonly surface: string;
	readonly bboxMm: { readonly min: Vec3; readonly max: Vec3 };
	readonly footprintMm?: readonly Pt[];
	readonly zLowMm?: number;
	readonly zHighMm?: number;
}
interface CollisionDocument {
	readonly nodes: readonly CollisionNode[];
	readonly switchZones: ReadonlyArray<{ readonly name: string; readonly switch: string; readonly minMm: Vec3; readonly maxMm: Vec3 }>;
	readonly devices: ReadonlyArray<{ readonly name: string; readonly ejectPose: { readonly posMm: Vec3 } }>;
}

/** One mesh of a part, its triangles already carried into playfield_root's local frame in table mm. */
interface PartMesh {
	readonly node: string;
	readonly material: string;
	readonly triangles: ReadonlyArray<readonly [Vec3, Vec3, Vec3]>;
	readonly vertices: readonly Vec3[];
}

// ---------------------------------------------------------------------------
// glb reading (JSON + BIN).
// ---------------------------------------------------------------------------

interface Glb {
	readonly doc: GltfDocument;
	readonly bin: Buffer;
}

function readGlb(bytes: Buffer = readFileSync(GLB_PATH)): Glb {
	expect(bytes.readUInt32LE(0), 'glb magic').toBe(0x46546c67);
	const jsonLength = bytes.readUInt32LE(12);
	expect(bytes.readUInt32LE(16), 'first chunk type must be JSON').toBe(0x4e4f534a);
	const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GltfDocument;
	const binHeader = 20 + jsonLength;
	const binLength = bytes.readUInt32LE(binHeader);
	expect(bytes.readUInt32LE(binHeader + 4), 'second chunk type must be BIN').toBe(0x004e4942);
	return { doc, bin: bytes.subarray(binHeader + 8, binHeader + 8 + binLength) };
}

const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

function readAccessor(glb: Glb, index: number): number[][] {
	const accessor = glb.doc.accessors[index]!;
	const view = glb.doc.bufferViews[accessor.bufferView!]!;
	const comps = COMPONENTS[accessor.type]!;
	const size = COMPONENT_BYTES[accessor.componentType]!;
	const stride = view.byteStride ?? comps * size;
	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const out: number[][] = [];
	for (let i = 0; i < accessor.count; i++) {
		const item: number[] = [];
		for (let c = 0; c < comps; c++) {
			const at = base + i * stride + c * size;
			switch (accessor.componentType) {
				case 5126: item.push(glb.bin.readFloatLE(at)); break;
				case 5125: item.push(glb.bin.readUInt32LE(at)); break;
				case 5123: item.push(glb.bin.readUInt16LE(at)); break;
				default: item.push(glb.bin.readUInt8(at));
			}
		}
		out.push(item);
	}
	return out;
}

function rotate(q: readonly number[], v: readonly number[]): number[] {
	const [qx, qy, qz, qw] = q as [number, number, number, number];
	const [vx, vy, vz] = v as [number, number, number];
	// v' = v + 2w (q x v) + 2 q x (q x v)
	const tx = 2 * (qy * vz - qz * vy);
	const ty = 2 * (qz * vx - qx * vz);
	const tz = 2 * (qx * vy - qy * vx);
	return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

/** Applies node `index`'s own TRS to a point in its local frame. */
function applyTrs(node: GltfNode, p: readonly number[]): number[] {
	const s = node.scale ?? [1, 1, 1];
	const r = node.rotation ?? [0, 0, 0, 1];
	const t = node.translation ?? [0, 0, 0];
	const scaled = [p[0]! * s[0]!, p[1]! * s[1]!, p[2]! * s[2]!];
	const rotated = rotate(r, scaled);
	return [rotated[0]! + t[0]!, rotated[1]! + t[1]!, rotated[2]! + t[2]!];
}

function parentIndexMap(doc: GltfDocument): Map<number, number> {
	const parents = new Map<number, number>();
	doc.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parents.set(c, i)));
	return parents;
}

function indexOfNode(doc: GltfDocument, name: string): number {
	const matches = doc.nodes.map((n, i) => (n.name === name ? i : -1)).filter((i) => i >= 0);
	expect(matches.length, `glb must carry exactly one node named "${name}"`).toBe(1);
	return matches[0]!;
}

function descendants(doc: GltfDocument, index: number): number[] {
	const out: number[] = [];
	for (const child of doc.nodes[index]!.children ?? []) {
		out.push(child, ...descendants(doc, child));
	}
	return out;
}

function materialNameOf(doc: GltfDocument, primitive: GltfPrimitive): string {
	return primitive.material === undefined ? '(none)' : (doc.materials[primitive.material]?.name ?? '(unnamed)');
}

/** Every mesh of node `index` and its descendants, triangles in playfield_root's local frame, table mm. */
function partMeshes(glb: Glb, index: number, rootIndex: number): PartMesh[] {
	const parents = parentIndexMap(glb.doc);
	const out: PartMesh[] = [];
	for (const i of [index, ...descendants(glb.doc, index)]) {
		const node = glb.doc.nodes[i]!;
		if (node.mesh === undefined) {
			continue;
		}
		const toTable = (p: readonly number[]): Vec3 => {
			let q = p.slice();
			let at = i;
			while (at !== rootIndex) {
				q = applyTrs(glb.doc.nodes[at]!, q);
				const parent = parents.get(at);
				expect(parent, `${node.name}: must descend from playfield_root`).toBeDefined();
				at = parent!;
			}
			return glbToTable({ x: q[0]!, y: q[1]!, z: q[2]! });
		};
		for (const primitive of glb.doc.meshes[node.mesh]!.primitives) {
			const vertices = readAccessor(glb, primitive.attributes.POSITION!).map(toTable);
			const indices = primitive.indices === undefined ? vertices.map((_, k) => [k]) : readAccessor(glb, primitive.indices);
			const flat = indices.map((ix) => ix[0]!);
			const triangles: Array<[Vec3, Vec3, Vec3]> = [];
			for (let k = 0; k + 2 < flat.length; k += 3) {
				triangles.push([vertices[flat[k]!]!, vertices[flat[k + 1]!]!, vertices[flat[k + 2]!]!]);
			}
			out.push({ node: node.name!, material: materialNameOf(glb.doc, primitive), triangles, vertices });
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Geometry.
// ---------------------------------------------------------------------------

function pointInPolygon(poly: readonly Pt[], p: Pt): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const vi = poly[i]!;
		const vj = poly[j]!;
		if (vi.y > p.y !== vj.y > p.y && p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y) + vi.x) {
			inside = !inside;
		}
	}
	return inside;
}

function distanceToPolygonEdge(poly: readonly Pt[], p: Pt): number {
	let nearest = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!;
		const b = poly[(i + 1) % poly.length]!;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
		nearest = Math.min(nearest, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
	}
	return nearest;
}

/** 0 inside or on the polygon, otherwise the distance to its boundary. */
function distanceOutside(poly: readonly Pt[], p: Pt): number {
	return pointInPolygon(poly, p) ? 0 : distanceToPolygonEdge(poly, p);
}

function hull(points: readonly Pt[]): Pt[] {
	const pts = [...new Map(points.map((p) => [`${p.x.toFixed(4)},${p.y.toFixed(4)}`, p])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Pt[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: Pt[] = [];
	for (const p of [...pts].reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function bbox(points: readonly Vec3[]): { min: Vec3; max: Vec3 } {
	return {
		min: { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)), z: Math.min(...points.map((p) => p.z)) },
		max: { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)), z: Math.max(...points.map((p) => p.z)) },
	};
}

function inBand(v: Vec3): boolean {
	return v.z >= -Z_EPSILON_MM && v.z <= BALL_MM + Z_EPSILON_MM;
}

/** A body's plan footprint: its `footprintMm`, or its bbox rectangle for a box-shaped body (the flippers). */
function footprintOf(node: CollisionNode): Pt[] {
	if (node.footprintMm) {
		return [...node.footprintMm];
	}
	const { min, max } = node.bboxMm;
	return [{ x: min.x, y: min.y }, { x: max.x, y: min.y }, { x: max.x, y: max.y }, { x: min.x, y: max.y }];
}

function rectsOverlap(a: { min: Pt; max: Pt }, b: { min: Pt; max: Pt }): boolean {
	return Math.min(a.max.x, b.max.x) > Math.max(a.min.x, b.min.x) && Math.min(a.max.y, b.max.y) > Math.max(a.min.y, b.min.y);
}

// ---------------------------------------------------------------------------
// The subject sets, derived from the collision document.
// ---------------------------------------------------------------------------

function readCollision(): CollisionDocument {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as CollisionDocument;
}

/** 5.0a's exclusion rule (the spine's "Visible placeholders" row). */
function isExcluded(node: CollisionNode): boolean {
	return node.name === TABLE.nodes.colPlayfield || node.name === TABLE.nodes.colGlass || node.bboxMm.max.y <= 0;
}

/** Every art twin (every visible non-dragon body's twin), with its source body. */
function artTwins(collision: CollisionDocument): Array<{ twin: string; body: CollisionNode }> {
	return collision.nodes.filter((n) => !isExcluded(n) && n.surface !== 'dragon').map((body) => ({ twin: visTwinName(body.name), body }));
}

const DROP_TARGET_NODES: ReadonlySet<string> = new Set(Object.values(TABLE.dropBankWiring).map((w) => w.node));

function materialByName(doc: GltfDocument, name: string): GltfMaterial {
	const material = doc.materials.find((m) => m.name === name);
	expect(material, `material "${name}" missing from the glb`).toBeDefined();
	return material!;
}

function baseColour(doc: GltfDocument, name: string): readonly number[] {
	const factor = materialByName(doc, name).pbrMetallicRoughness?.baseColorFactor;
	expect(factor, `${name}: baseColorFactor`).toBeDefined();
	return factor!;
}

function channelSeparation(a: readonly number[], b: readonly number[]): number {
	return Math.max(...[0, 1, 2].map((k) => Math.abs(a[k]! - b[k]!)));
}

const glb = readGlb();
const collision = readCollision();
const ROOT = indexOfNode(glb.doc, TABLE.nodes.playfieldRoot);
const bodyByName = new Map(collision.nodes.map((n) => [n.name, n]));

function meshesOf(name: string): PartMesh[] {
	return partMeshes(glb, indexOfNode(glb.doc, name), ROOT);
}

describe('Story 5.4 AC 2 -- art scope, naming, parents and the mesh contract', () => {
	it('every 5.0a twin except vis_dragon is an art part behind its own name: a direct child of playfield_root carrying only mat_art_* materials (92 visible bodies -> 89 twins, 88 of them art)', () => {
		const twins = artTwins(collision);
		expect(twins.length, 'the visible non-dragon bodies at this tree').toBe(88);
		const rootChildren = new Set(glb.doc.nodes[ROOT]!.children ?? []);
		for (const { twin } of twins) {
			const index = indexOfNode(glb.doc, twin);
			expect(rootChildren.has(index), `${twin}: must stay a direct child of playfield_root`).toBe(true);
			const materials = [...new Set(meshesOf(twin).map((m) => m.material))];
			expect(materials.length, `${twin}: must carry geometry`).toBeGreaterThan(0);
			expect(materials.filter((m) => !m.startsWith('mat_art_')), `${twin}: every mesh of an art part carries a mat_art_* material`).toEqual([]);
		}
		// vis_dragon is the remaining placeholder (Story 5.1's), untouched.
		expect([...new Set(meshesOf(VIS_DRAGON_NODE_NAME).map((m) => m.material))]).toEqual(['mat_vis_dragon']);
		expect(glb.doc.nodes[indexOfNode(glb.doc, VIS_DRAGON_NODE_NAME)]!.children, 'vis_dragon has no art children').toBeUndefined();
	});

	it('vis_playfield, vis_backbox and the l_ inserts carry no art material (they stay as they were)', () => {
		const seen: string[] = [];
		for (const node of glb.doc.nodes) {
			if (node.name === 'vis_playfield' || node.name === 'vis_backbox' || node.name?.startsWith('l_')) {
				seen.push(node.name);
				const materials = glb.doc.meshes[node.mesh!]!.primitives.map((p) => materialNameOf(glb.doc, p));
				expect(materials.filter((m) => m.startsWith('mat_art_')), `${node.name}`).toEqual([]);
				expect(node.children, `${node.name}: gains no art children`).toBeUndefined();
			}
		}
		// [Story 5.4 QA] Non-vacuity (Rule 19): the loop above passes over an
		// empty set if these nodes were renamed or dropped: vis_playfield,
		// vis_backbox and the 15 l_ inserts the spec's Verification names.
		// mutation: rename vis_backbox inside the glb JSON chunk -> red here.
		expect(seen, 'vis_playfield and vis_backbox are among the untouched nodes').toEqual(expect.arrayContaining(['vis_playfield', 'vis_backbox']));
		expect(seen.filter((n) => n.startsWith('l_')).length, 'the 15 l_ inserts').toBe(15);
	});

	it('every sub-part is a child named <parent>_<part>, and every art mesh keeps AD-11/AD-12\'s contract: one primitive, TEXCOORD_1, lg_playfield', () => {
		const rootChildren = (glb.doc.nodes[ROOT]!.children ?? []).map((i) => glb.doc.nodes[i]!).filter((n) => n.name?.startsWith('vis_'));
		let subParts = 0;
		let artMeshes = 0;
		for (const top of rootChildren) {
			const topIndex = glb.doc.nodes.indexOf(top);
			for (const index of [topIndex, ...descendants(glb.doc, topIndex)]) {
				const node = glb.doc.nodes[index]!;
				if (index !== topIndex) {
					subParts++;
					const parentName = glb.doc.nodes[parentIndexMap(glb.doc).get(index)!]!.name!;
					expect(node.name!.startsWith(`${parentName}_`) && node.name!.length > parentName.length + 1, `${node.name}: a sub-part is named <parent>_<part> (parent "${parentName}")`).toBe(true);
				}
				if (node.mesh === undefined) {
					continue;
				}
				const primitives = glb.doc.meshes[node.mesh]!.primitives;
				if (!primitives.some((p) => materialNameOf(glb.doc, p).startsWith('mat_art_'))) {
					continue;
				}
				artMeshes++;
				expect(primitives.length, `${node.name}: exactly one primitive (one material)`).toBe(1);
				expect(primitives[0]!.attributes.TEXCOORD_1, `${node.name}: TEXCOORD_1 (AD-12)`).toBeDefined();
				expect(node.extras?.lightgroup, `${node.name}: lightgroup`).toBe('lg_playfield');
			}
		}
		expect(subParts, 'non-vacuity: the art pass has sub-parts').toBeGreaterThan(0);
		expect(artMeshes, 'non-vacuity: the art pass has meshes').toBeGreaterThan(88);
	});

	it('each twin (with its descendants) stays within the 2,000-triangle budget', () => {
		const subjects = [...artTwins(collision).map((t) => t.twin), VIS_PLUNGER_NODE_NAME, VIS_SPINNER_NODE_NAME, ...plasticNames()];
		let largest = 0;
		for (const name of subjects) {
			const triangles = meshesOf(name).reduce((sum, m) => sum + m.triangles.length, 0);
			largest = Math.max(largest, triangles);
			expect(triangles, `${name}: ${triangles} triangles`).toBeLessThanOrEqual(TRIANGLE_BUDGET);
		}
		expect(largest, 'non-vacuity: the parts carry real geometry').toBeGreaterThan(12);
	});
});

describe('Story 5.4 AC 2 -- the ball band: the visible path matches the collision path', () => {
	it('every triangle with a vertex in table z [0, ballMm] keeps all three vertices within 0.5 mm of its source body\'s footprint', () => {
		let checked = 0;
		for (const { twin, body } of artTwins(collision)) {
			const footprint = footprintOf(body);
			let checkedHere = 0;
			for (const mesh of meshesOf(twin)) {
				for (const triangle of mesh.triangles) {
					if (!triangle.some(inBand)) {
						continue;
					}
					checkedHere++;
					for (const v of triangle) {
						const outside = distanceOutside(footprint, v);
						expect(
							outside,
							`${mesh.node} (${mesh.material}): in-band triangle vertex (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}) lies ${outside.toFixed(3)} mm outside ${body.name}'s footprint`,
						).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
					}
				}
			}
			expect(checkedHere, `${twin}: non-vacuity -- the part has in-band geometry`).toBeGreaterThan(0);
			checked += checkedHere;
		}
		expect(checked).toBeGreaterThan(1000);
	});

	it('a part with no source body (the spinner, its blade, the plastics): every triangle with a vertex in the band keeps all three within 0.5 mm of some col_ footprint', () => {
		// [Story 5.4 review] Only VISIBLE bodies' footprints count: the
		// excluded ones (col_playfield and col_glass, whose bbox rectangle is
		// the whole table, and the below-table channel) would make every
		// vertex "inside" and this case unable to fail.
		// mutation: move vis_spinner_l's translation 30 mm down in the glb
		// JSON -> the blade enters the band over the open lane -> red here.
		const footprints = collision.nodes.filter((n) => n.name.startsWith('col_') && !isExcluded(n)).map(footprintOf);
		expect(footprints.length, 'non-vacuity: visible col_ footprints').toBeGreaterThan(80);
		const subjects = [VIS_SPINNER_NODE_NAME, ...plasticNames()];
		expect(subjects.flatMap((name) => meshesOf(name)).length, 'non-vacuity: the sourceless parts carry meshes').toBeGreaterThanOrEqual(4);
		for (const name of subjects) {
			for (const mesh of meshesOf(name)) {
				for (const triangle of mesh.triangles.filter((t) => t.some(inBand))) {
					for (const v of triangle) {
						const nearest = Math.min(...footprints.map((f) => distanceOutside(f, v)));
						expect(nearest, `${mesh.node}: in-band triangle vertex (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}) is outside every visible col_ footprint`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
					}
				}
			}
		}
	});

	it('the in-band x/y bbox of each whole node equals its body\'s within 0.5 mm, and the part reaches at least min(zHighMm, ballMm)', () => {
		for (const { twin, body } of artTwins(collision)) {
			const vertices = meshesOf(twin).flatMap((m) => m.vertices);
			const band = bbox(vertices.filter(inBand));
			const label = `${twin} (from ${body.name})`;
			for (const axis of ['x', 'y'] as const) {
				expect(Math.abs(band.min[axis] - body.bboxMm.min[axis]), `${label}: in-band min.${axis} ${band.min[axis].toFixed(3)} vs ${body.bboxMm.min[axis]}`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
				expect(Math.abs(band.max[axis] - body.bboxMm.max[axis]), `${label}: in-band max.${axis} ${band.max[axis].toFixed(3)} vs ${body.bboxMm.max[axis]}`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
			}
			const top = bbox(vertices).max.z;
			const required = Math.min(body.bboxMm.max.z, BALL_MM);
			expect(top, `${label}: top z ${top.toFixed(3)} must reach min(zHigh, ballMm) = ${required}`).toBeGreaterThanOrEqual(required - PIN_TOLERANCE_MM);
			expect(bbox(vertices).min.z, `${label}: nothing below the deck`).toBeGreaterThanOrEqual(-Z_EPSILON_MM);
		}
	});

	// [Story 5.4 review] The band and bbox rules above can both hold while
	// the surface the ball actually meets sits inside the collision surface
	// (a pop bumper whose body is inset, with only a deck-level skirt on the
	// footprint). So: the meshes that span the ball's centre height,
	// ballMm / 2, must between them reach the body's own x/y bbox.
	// mutation: the pre-review pop bumper (a 0.72-scale body, the skirt on
	// the footprint only up to z 2.5) -> red here for every vis_pop_*.
	it('at the ball\'s contact height (z = ballMm / 2) each part presents its body\'s x/y extent: the meshes spanning that height reach the body\'s bbox within 0.5 mm', () => {
		const contactZ = BALL_MM / 2;
		for (const { twin, body } of artTwins(collision)) {
			const spanning = meshesOf(twin).filter((m) => {
				const zs = m.vertices.map((v) => v.z);
				return Math.min(...zs) <= contactZ && Math.max(...zs) >= contactZ;
			});
			expect(spanning.length, `${twin}: some mesh must span the ball's centre height ${contactZ}`).toBeGreaterThan(0);
			const band = bbox(spanning.flatMap((m) => m.vertices).filter(inBand));
			for (const axis of ['x', 'y'] as const) {
				expect(Math.abs(band.min[axis] - body.bboxMm.min[axis]), `${twin}: contact-height min.${axis} ${band.min[axis].toFixed(3)} vs ${body.bboxMm.min[axis]}`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
				expect(Math.abs(band.max[axis] - body.bboxMm.max[axis]), `${twin}: contact-height max.${axis} ${band.max[axis].toFixed(3)} vs ${body.bboxMm.max[axis]}`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
			}
		}
	});

	// [Story 5.4 review] The art-contract form of 5.0a's cap pin: no part
	// towers toward the glass. Every part tops out within ART_TOP_ALLOWANCE_MM
	// of min(zHigh, WALL_H_MM) -- the 400 mm perimeter and lane walls
	// included. mutation: extrude a wall to its body's zHighMm -> red here on
	// the four 400 mm walls.
	it('no part rises more than a lip above min(zHighMm, WALL_H_MM): the 400 mm perimeter and lane walls are drawn at rail height', () => {
		let tall = 0;
		for (const { twin, body } of artTwins(collision)) {
			const ceiling = Math.min(body.bboxMm.max.z, WALL_H_MM) + ART_TOP_ALLOWANCE_MM;
			if (body.bboxMm.max.z > WALL_H_MM) {
				tall++;
			}
			const top = bbox(meshesOf(twin).flatMap((m) => m.vertices)).max.z;
			expect(top, `${twin}: top z ${top.toFixed(3)} above min(zHigh ${body.bboxMm.max.z}, ${WALL_H_MM}) + ${ART_TOP_ALLOWANCE_MM}`).toBeLessThanOrEqual(ceiling + PIN_TOLERANCE_MM);
		}
		expect(tall, 'non-vacuity: the 400 mm perimeter/lane walls').toBeGreaterThanOrEqual(4);
	});
});

describe('Story 5.4 AC 2 -- rubber looks like rubber', () => {
	it('every rubber_post and rubber_band part carries a mat_art_rubber mesh spanning z = ballMm / 2, whose in-band x/y bbox is the body\'s within 0.5 mm', () => {
		const subjects = artTwins(collision).filter((t) => t.body.surface === 'rubber_post' || t.body.surface === 'rubber_band');
		expect(subjects.length, 'non-vacuity: posts and slings exist').toBeGreaterThan(40);
		for (const { twin, body } of subjects) {
			const rubber = meshesOf(twin).filter((m) => m.material === RUBBER_MATERIAL);
			expect(rubber.length, `${twin}: must carry a ${RUBBER_MATERIAL} mesh`).toBeGreaterThan(0);
			const vertices = rubber.flatMap((m) => m.vertices);
			const all = bbox(vertices);
			expect(all.min.z <= BALL_MM / 2 && all.max.z >= BALL_MM / 2, `${twin}: rubber z ${all.min.z.toFixed(2)}..${all.max.z.toFixed(2)} must span the ball centre height ${BALL_MM / 2}`).toBe(true);
			const band = bbox(vertices.filter(inBand));
			for (const axis of ['x', 'y'] as const) {
				expect(Math.abs(band.min[axis] - body.bboxMm.min[axis]), `${twin}: rubber min.${axis}`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
				expect(Math.abs(band.max[axis] - body.bboxMm.max[axis]), `${twin}: rubber max.${axis}`).toBeLessThanOrEqual(BAND_TOLERANCE_MM);
			}
		}
	});

	it('mat_art_rubber is rough (>= 0.8), non-metallic (explicitly 0) and dark (every linear channel <= 0.10)', () => {
		const rubber = materialByName(glb.doc, RUBBER_MATERIAL).pbrMetallicRoughness!;
		expect(rubber.roughnessFactor ?? 1).toBeGreaterThanOrEqual(0.8);
		expect(rubber.metallicFactor, 'glTF defaults metallicFactor to 1, so it must be written as 0').toBe(0);
		for (const channel of rubber.baseColorFactor!.slice(0, 3)) {
			expect(channel).toBeLessThanOrEqual(0.1);
		}
	});
});

function plasticNames(): string[] {
	return collision.nodes.filter((n) => n.surface === 'rubber_band').map((n) => `vis_plastic_${n.name.slice('col_'.length)}`);
}

describe('Story 5.4 AC 2 -- plastics sit above the ball and never cover rubber, a flipper, the drop bank, the Ramp lane or a Loop lane', () => {
	const bodyBox = (name: string): { min: Pt; max: Pt } => {
		const b = bodyByName.get(name);
		expect(b, `${name} missing from the collision document`).toBeDefined();
		return { min: b!.bboxMm.min, max: b!.bboxMm.max };
	};

	it('one plastic per slingshot, a direct child of playfield_root in mat_art_plastic, every vertex at z >= ballMm + 1', () => {
		const names = plasticNames();
		expect(names).toEqual(['vis_plastic_sling_l', 'vis_plastic_sling_r']);
		const rootChildren = new Set(glb.doc.nodes[ROOT]!.children ?? []);
		for (const name of names) {
			expect(rootChildren.has(indexOfNode(glb.doc, name)), `${name}: parent`).toBe(true);
			const meshes = meshesOf(name);
			expect(meshes.map((m) => m.material)).toEqual(['mat_art_plastic']);
			expect(bbox(meshes.flatMap((m) => m.vertices)).min.z, `${name}: its underside`).toBeGreaterThanOrEqual(BALL_MM + 1 - PIN_TOLERANCE_MM);
		}
	});

	it('no rubber-part vertex lies inside a plastic\'s x/y footprint', () => {
		const rubberVertices = glb.doc.nodes
			.map((n, i) => ({ n, i }))
			.filter(({ n }) => n.name?.startsWith('vis_') && (glb.doc.nodes[ROOT]!.children ?? []).includes(glb.doc.nodes.indexOf(n)))
			.flatMap(({ i }) => partMeshes(glb, i, ROOT))
			.filter((m) => m.material === RUBBER_MATERIAL)
			.flatMap((m) => m.vertices);
		expect(rubberVertices.length, 'non-vacuity').toBeGreaterThan(100);
		for (const name of plasticNames()) {
			const footprint = hull(meshesOf(name).flatMap((m) => m.vertices));
			const under = rubberVertices.filter((v) => pointInPolygon(footprint, v));
			expect(under.map((v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`), `${name}: rubber under the plastic`).toEqual([]);
		}
	});

	it('no plastic overlaps a flipper, the drop bank, the Ramp lane or a Loop lane', () => {
		const flippers = [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR].map(bodyBox);
		const bank = [...DROP_TARGET_NODES].map(bodyBox);
		const rampL = bodyBox('col_ramp_wall_l');
		const rampR = bodyBox('col_ramp_wall_r');
		const rampTurn = bodyBox('col_ramp_turn');
		const rampLane = { min: { x: rampL.max.x, y: rampL.min.y }, max: { x: rampR.min.x, y: rampTurn.max.y } };
		const wallLeft = bodyBox('col_wall_left');
		const loopL = bodyBox('col_loop_l');
		const loopTop = bodyBox('col_loop_top');
		const leftLoopLane = { min: { x: wallLeft.max.x, y: bodyBox('col_loop_l_funnel').min.y }, max: { x: loopL.min.x, y: loopTop.max.y } };
		const loopR = bodyBox('col_loop_r');
		const wallLane = bodyBox('col_wall_lane');
		const rightLoopLane = { min: { x: loopR.max.x, y: bodyBox('col_loop_r_funnel').min.y }, max: { x: wallLane.min.x, y: loopTop.max.y } };
		const forbidden = [
			...flippers.map((box, k) => ({ label: `flipper ${k}`, box })),
			...bank.map((box, k) => ({ label: `drop target ${k}`, box })),
			{ label: 'the Ramp lane', box: rampLane },
			{ label: 'the Left Loop lane', box: leftLoopLane },
			{ label: 'the Right Loop lane', box: rightLoopLane },
		];
		for (const name of plasticNames()) {
			const box = bbox(meshesOf(name).flatMap((m) => m.vertices));
			for (const { label, box: zone } of forbidden) {
				expect(rectsOverlap(box, zone), `${name} [${box.min.x.toFixed(1)}..${box.max.x.toFixed(1)}] x [${box.min.y.toFixed(1)}..${box.max.y.toFixed(1)}] must not cover ${label}`).toBe(false);
			}
		}
	});
});

describe('Story 5.4 AC 2 -- the moving parts keep the follower\'s contract', () => {
	it('flippers: origin at the pivot (placeholder-geometry pins the value), and the bat mesh is symmetric about its own centreline', () => {
		for (const colName of [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR]) {
			const node = glb.doc.nodes[indexOfNode(glb.doc, visTwinName(colName))]!;
			expect(node.rotation, `${node.name}: authored pose carries no rotation`).toBeUndefined();
			const positions = readAccessor(glb, glb.doc.meshes[node.mesh!]!.primitives[0]!.attributes.POSITION!);
			// Local glb frame: the bat runs along x; table y is glb -z.
			const zs = positions.map((p) => p[2]!);
			expect(Math.abs(Math.min(...zs) + Math.max(...zs)), `${node.name}: the bat's own bbox is centred on its centreline`).toBeLessThanOrEqual(1e-4);
			const MIRROR_TOLERANCE_M = 1e-6;
			const unmatched = positions.filter(
				(p) => !positions.some((q) => Math.abs(q[0]! - p[0]!) <= MIRROR_TOLERANCE_M && Math.abs(q[1]! - p[1]!) <= MIRROR_TOLERANCE_M && Math.abs(q[2]! + p[2]!) <= MIRROR_TOLERANCE_M),
			);
			expect(unmatched.length, `${node.name}: every bat vertex has a mirror across the centreline`).toBe(0);
		}
	});

	it('drop targets: each is ONE mesh with no children and an identity transform', () => {
		for (const nodeName of DROP_TARGET_NODES) {
			const node = glb.doc.nodes[indexOfNode(glb.doc, visTwinName(nodeName))]!;
			expect(node.children, `${node.name}: no children -- the follower hides the node itself`).toBeUndefined();
			expect(node.translation ?? [0, 0, 0]).toEqual([0, 0, 0]);
			expect(node.rotation).toBeUndefined();
			expect(node.scale).toBeUndefined();
			expect(glb.doc.meshes[node.mesh!]!.primitives.map((p) => materialNameOf(glb.doc, p))).toEqual(['mat_art_target']);
		}
	});

	it('vis_plunger: centre x on bd_shooter\'s x and tip at bd_shooter.y - ballMm/2, a rod plus a knob child (exempt from the band rule)', () => {
		const shooter = collision.devices.find((d) => d.name === 'bd_shooter')!.ejectPose.posMm;
		const meshes = meshesOf(VIS_PLUNGER_NODE_NAME);
		expect(meshes.map((m) => m.node).sort()).toEqual([VIS_PLUNGER_NODE_NAME, `${VIS_PLUNGER_NODE_NAME}_knob`]);
		expect(meshes.find((m) => m.node === VIS_PLUNGER_NODE_NAME)!.material).toBe('mat_art_plunger');
		const box = bbox(meshes.flatMap((m) => m.vertices));
		expect(Math.abs((box.min.x + box.max.x) / 2 - shooter.x), `vis_plunger centre x ${((box.min.x + box.max.x) / 2).toFixed(3)} vs bd_shooter ${shooter.x}`).toBeLessThanOrEqual(PIN_TOLERANCE_MM);
		expect(Math.abs(box.max.y - (shooter.y - BALL_MM / 2)), `vis_plunger tip y ${box.max.y.toFixed(3)} vs ${shooter.y - BALL_MM / 2}`).toBeLessThanOrEqual(PIN_TOLERANCE_MM);
		expect(glb.doc.nodes[indexOfNode(glb.doc, VIS_PLUNGER_NODE_NAME)]!.translation, 'the rod is authored in place (the follower translates it)').toBeUndefined();
		// [Story 5.4 review] The art forms of 5.0a's z-band and south-end
		// pins: the rod and knob are round about bd_shooter's own axis (so
		// centred on its z), and the knob sits south of the playfield (y < 0).
		expect(Math.abs((box.min.z + box.max.z) / 2 - shooter.z), `vis_plunger centre z ${((box.min.z + box.max.z) / 2).toFixed(3)} vs bd_shooter ${shooter.z}`).toBeLessThanOrEqual(PIN_TOLERANCE_MM);
		expect(box.min.z, 'the rod and knob stay above the deck').toBeGreaterThanOrEqual(0);
		expect(box.min.y, 'the knob reaches south of the playfield').toBeLessThan(0);
		// [Story 5.4 code review] The knob is an art mesh too ("Art
		// materials"), and the rod and knob are round parts: at most 16
		// segments per ring, counted as distinct angles about bd_shooter's own
		// table-y axis per y level (an on-axis cap centre carries no angle).
		expect(meshes.find((m) => m.node === `${VIS_PLUNGER_NODE_NAME}_knob`)!.material).toBe('mat_art_plunger_knob');
		let rings = 0;
		for (const mesh of meshes) {
			const byY = new Map<string, Set<string>>();
			for (const v of mesh.vertices) {
				if (Math.hypot(v.x - shooter.x, v.z - shooter.z) < 1e-3) {
					continue;
				}
				const angles = byY.get(v.y.toFixed(2)) ?? new Set<string>();
				angles.add(((Math.round((Math.atan2(v.z - shooter.z, v.x - shooter.x) * 180) / Math.PI * 2) / 2 + 360) % 360).toFixed(1));
				byY.set(v.y.toFixed(2), angles);
			}
			for (const [y, angles] of byY) {
				rings++;
				expect(angles.size, `${mesh.node}: ring at y ${y} carries ${angles.size} segments`).toBeLessThanOrEqual(MAX_ROUND_SEGMENTS);
			}
		}
		expect(rings, 'non-vacuity: plunger rings counted').toBeGreaterThan(4);
	});

	it('the spinner: a static bracket whose origin is on the spin axis at SPINNER_Y_MM, over sw_spinner, and a blade child hanging toward table -Z whose every vertex sweeps a circle wholly above ballMm + 1', () => {
		const bracketIndex = indexOfNode(glb.doc, VIS_SPINNER_NODE_NAME);
		const bracket = glb.doc.nodes[bracketIndex]!;
		expect((glb.doc.nodes[ROOT]!.children ?? []).includes(bracketIndex), 'the bracket is a direct child of playfield_root').toBe(true);
		expect(bracket.rotation).toBeUndefined();
		expect(bracket.scale).toBeUndefined();
		const origin = glbToTable({ x: bracket.translation![0]!, y: bracket.translation![1]!, z: bracket.translation![2]! });
		expect(Math.abs(origin.y - SPINNER_Y_MM), `origin y ${origin.y}`).toBeLessThanOrEqual(PIN_TOLERANCE_MM);
		const zone = collision.switchZones.find((z) => z.switch === Object.keys(TABLE.spinnerWiring)[0]);
		expect(zone, 'the spinner switch zone').toBeDefined();
		expect(origin.x >= zone!.minMm.x && origin.x <= zone!.maxMm.x && origin.y >= zone!.minMm.y && origin.y <= zone!.maxMm.y, `the axis origin (${origin.x}, ${origin.y}) must sit over ${zone!.name}`).toBe(true);

		const bladeIndex = indexOfNode(glb.doc, VIS_SPINNER_BLADE_NODE_NAME);
		expect(bracket.children, 'the blade is the bracket\'s child').toContain(bladeIndex);
		const blade = glb.doc.nodes[bladeIndex]!;
		expect(blade.translation ?? [0, 0, 0], 'the blade turns about the bracket\'s own origin').toEqual([0, 0, 0]);
		expect(blade.rotation).toBeUndefined();
		// [Story 5.4 code review] Both are art meshes ("Art materials"); the
		// scope case covers only the col_ twins, so pin them here.
		expect(materialNameOf(glb.doc, glb.doc.meshes[bracket.mesh!]!.primitives[0]!), 'the bracket\'s material').toBe('mat_art_spinner');
		expect(materialNameOf(glb.doc, glb.doc.meshes[blade.mesh!]!.primitives[0]!), 'the blade\'s material').toBe('mat_art_spinner_blade');

		const meshes = meshesOf(VIS_SPINNER_NODE_NAME);
		const bladeVertices = meshes.filter((m) => m.node === VIS_SPINNER_BLADE_NODE_NAME).flatMap((m) => m.vertices);
		expect(bladeVertices.length).toBeGreaterThan(0);
		for (const v of bladeVertices) {
			const radius = Math.hypot(v.y - origin.y, v.z - origin.z);
			expect(origin.z - radius, `blade vertex (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) sweeps down to z ${(origin.z - radius).toFixed(3)}`).toBeGreaterThanOrEqual(BALL_MM + 1);
		}
		expect(bbox(bladeVertices).max.z, 'at rest the blade hangs below its axis (toward table -Z)').toBeLessThanOrEqual(origin.z + PIN_TOLERANCE_MM);
		for (const v of meshes.filter((m) => m.node === VIS_SPINNER_NODE_NAME).flatMap((m) => m.vertices)) {
			expect(v.z, 'the bracket sits above the ball band').toBeGreaterThanOrEqual(BALL_MM + 1);
		}

		// [Story 5.4 review] The blade turns a full circle, so nothing of the
		// static bracket may stand inside its swept cylinder except the axle
		// it turns on. mutation: the pre-review bracket's cross bar (3.2-7.2 mm
		// above the axle, across the whole lane) -> red here.
		// Triangle-based: a bar spanning the lane has its vertices at the
		// uprights, outside the blade's x span, while its faces cross it.
		const bladeBox = bbox(bladeVertices);
		const sweep = Math.max(...bladeVertices.map((v) => Math.hypot(v.y - origin.y, v.z - origin.z)));
		const AXLE_ALLOWANCE_MM = 2;
		const bracketTriangles = meshes.filter((m) => m.node === VIS_SPINNER_NODE_NAME).flatMap((m) => m.triangles);
		expect(bracketTriangles.length, 'non-vacuity: the bracket carries triangles').toBeGreaterThan(0);
		const intruding = bracketTriangles.filter((triangle) => {
			const xs = triangle.map((v) => v.x);
			if (Math.max(...xs) < bladeBox.min.x || Math.min(...xs) > bladeBox.max.x) {
				return false; // wholly beside the blade (an upright on its wall)
			}
			return triangle.some((v) => {
				const r = Math.hypot(v.y - origin.y, v.z - origin.z);
				return r > AXLE_ALLOWANCE_MM && r <= sweep;
			});
		});
		expect(
			intruding.map((t) => t.map((v) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`).join(' ')),
			`bracket faces across the blade's x span inside its swept radius ${sweep.toFixed(2)} mm (the axle, within ${AXLE_ALLOWANCE_MM} mm, excepted)`,
		).toEqual([]);
	});

	// [Story 5.4 review] The Always rule "round parts use at most 16
	// segments with smooth normals". Round parts: the posts (core, nut,
	// rubber ring) and the pop bumpers (body, skirt, cap), each a solid of
	// revolution about a vertical axis. Every horizontal ring of such a mesh
	// carries at most MAX_ROUND_SEGMENTS distinct positions, and the rubber
	// ring -- a closed, cap-less lathe -- is smooth-shaded, which glTF shows
	// as one vertex per position (a flat-shaded ring splits every position
	// per face). mutation: ART_ROUND_SEGMENTS = 32, or flat-shading the
	// ring -> red here.
	it('round parts: at most 16 segments per ring, and the post rubber rings are smooth-shaded', () => {
		const round = artTwins(collision).filter((t) => t.body.surface === 'rubber_post' || t.body.surface === 'bumper');
		expect(round.length, 'non-vacuity: posts and pops').toBeGreaterThan(40);
		let rings = 0;
		for (const { twin, body } of round) {
			for (const mesh of meshesOf(twin)) {
				// Segments are counted as distinct ANGLES about the part's own
				// vertical axis per z level, so two concentric rings at one z
				// (a lathe profile's inner and outer edge) count once.
				const positions = [...new Map(mesh.vertices.map((v) => [`${v.x.toFixed(3)},${v.y.toFixed(3)}`, v])).values()];
				const cx = positions.reduce((s, v) => s + v.x, 0) / positions.length;
				const cy = positions.reduce((s, v) => s + v.y, 0) / positions.length;
				const byZ = new Map<string, Set<string>>();
				for (const v of mesh.vertices) {
					const key = v.z.toFixed(2);
					const set = byZ.get(key) ?? new Set<string>();
					set.add(((Math.round((Math.atan2(v.y - cy, v.x - cx) * 180) / Math.PI * 2) / 2 + 360) % 360).toFixed(1));
					byZ.set(key, set);
				}
				for (const [z, angles] of byZ) {
					rings++;
					expect(angles.size, `${mesh.node}: ring at z ${z} carries ${angles.size} segments`).toBeLessThanOrEqual(MAX_ROUND_SEGMENTS);
				}
				if (body.surface === 'rubber_post' && mesh.material === RUBBER_MATERIAL) {
					// glTF splits a position per face corner whenever ANY
					// attribute differs (Blender's default per-face UVs do), so
					// smoothness is read from NORMAL: every copy of a position
					// carries the same normal. Flat shading gives each face
					// corner its own face normal.
					const node = glb.doc.nodes[indexOfNode(glb.doc, mesh.node)]!;
					const primitive = glb.doc.meshes[node.mesh!]!.primitives[0]!;
					expect(primitive.attributes.NORMAL, `${mesh.node}: NORMAL`).toBeDefined();
					const localPositions = readAccessor(glb, primitive.attributes.POSITION!);
					const normals = readAccessor(glb, primitive.attributes.NORMAL!);
					const normalByPosition = new Map<string, number[]>();
					let shared = 0;
					localPositions.forEach((p, i) => {
						const key = p.map((c) => c.toFixed(6)).join(',');
						const seen = normalByPosition.get(key);
						if (seen === undefined) {
							normalByPosition.set(key, normals[i]!);
							return;
						}
						shared++;
						const gap = Math.hypot(seen[0]! - normals[i]![0]!, seen[1]! - normals[i]![1]!, seen[2]! - normals[i]![2]!);
						expect(gap, `${mesh.node}: vertex ${i} repeats a position with a different normal (flat-shaded)`).toBeLessThanOrEqual(1e-3);
					});
					expect(shared, `${mesh.node}: non-vacuity -- positions shared between faces`).toBeGreaterThan(0);
				}
			}
		}
		expect(rings, 'non-vacuity: rings counted').toBeGreaterThan(100);
	});
});

describe('Story 5.4 AC 2 -- the art materials', () => {
	it('every mat_art_* material carries colour, roughness and metallic 0 only -- no texture, no extension', () => {
		const art = glb.doc.materials.filter((m) => m.name?.startsWith('mat_art_'));
		expect(art.length, 'non-vacuity').toBeGreaterThan(10);
		for (const m of art) {
			expect(m.pbrMetallicRoughness?.baseColorFactor, `${m.name}: base colour`).toBeDefined();
			expect(m.pbrMetallicRoughness?.metallicFactor, `${m.name}: metallic (glTF defaults to 1)`).toBe(0);
			expect(m.pbrMetallicRoughness?.roughnessFactor, `${m.name}: roughness`).toBeDefined();
			for (const texture of [m.pbrMetallicRoughness?.baseColorTexture, m.pbrMetallicRoughness?.metallicRoughnessTexture, m.normalTexture, m.emissiveTexture, m.occlusionTexture, m.extensions]) {
				expect(texture, `${m.name}: no texture or extension`).toBeUndefined();
			}
		}
	});

	it('the flipper, drop-target, ramp and guide materials each differ from mat_playfield by >= 0.25 in some linear channel', () => {
		const playfield = baseColour(glb.doc, PLAYFIELD_MATERIAL);
		const pick = (predicate: (body: CollisionNode) => boolean): string[] => [
			...new Set(artTwins(collision).filter((t) => predicate(t.body)).flatMap((t) => meshesOf(t.twin).map((m) => m.material))),
		];
		const groups = {
			flipper: pick((b) => b.surface === 'flipper'),
			'drop target': pick((b) => DROP_TARGET_NODES.has(b.name)),
			ramp: pick((b) => b.surface === 'ramp'),
			guide: pick((b) => b.surface === 'plastic'),
		};
		for (const [group, names] of Object.entries(groups)) {
			expect(names.length, `non-vacuity: ${group} parts carry materials`).toBeGreaterThan(0);
			for (const name of names) {
				const colour = baseColour(glb.doc, name);
				expect(channelSeparation(colour, playfield), `${group}: ${name} ${JSON.stringify(colour.slice(0, 3))} vs mat_playfield ${JSON.stringify(playfield.slice(0, 3))}`).toBeGreaterThanOrEqual(MIN_PLAYFIELD_SEPARATION);
			}
		}
	});

	it('DW-294, art form: a dropped target reveals a DIFFERENT colour -- the bank backstop is not drawn in the drop targets\' material', () => {
		const targets = [...new Set([...DROP_TARGET_NODES].flatMap((n) => meshesOf(visTwinName(n)).map((m) => m.material)))];
		expect(targets).toEqual(['mat_art_target']);
		const others = collision.nodes.filter((n) => n.surface === 'target' && !DROP_TARGET_NODES.has(n.name));
		expect(others.length, 'non-vacuity: the backstop').toBeGreaterThan(0);
		for (const body of others) {
			for (const mesh of meshesOf(visTwinName(body.name))) {
				expect(channelSeparation(baseColour(glb.doc, mesh.material), baseColour(glb.doc, 'mat_art_target')), `${mesh.node} (${mesh.material}) vs mat_art_target`).toBeGreaterThanOrEqual(MIN_PLAYFIELD_SEPARATION);
			}
		}
	});
});

describe('Story 5.4 AC 5 / AC 6 -- the two sealing bodies (DW-142, DW-258)', () => {
	it('col_post_wall_lane_cap: a rubber_post octagon, r 4, z 0-50, at (LANE_X0 + WALL_T/2, the lane wall\'s bevelled low corner) = (474.4, 944.0)', () => {
		const post = bodyByName.get('col_post_wall_lane_cap');
		expect(post, 'col_post_wall_lane_cap').toBeDefined();
		expect(post!.surface).toBe('rubber_post');
		const lane = bodyByName.get('col_wall_lane')!;
		const laneFootprint = lane.footprintMm!;
		// Derived from the lane wall: its x centre, and its top end's LOW corner (the bevel).
		const topYs = [...laneFootprint].sort((a, b) => b.y - a.y).slice(0, 2).map((p) => p.y);
		const expected = { x: (lane.bboxMm.min.x + lane.bboxMm.max.x) / 2, y: Math.min(...topYs) };
		expect(expected.x).toBeCloseTo(474.4, 4);
		expect(expected.y).toBeCloseTo(944.0, 4);
		const centre = { x: (post!.bboxMm.min.x + post!.bboxMm.max.x) / 2, y: (post!.bboxMm.min.y + post!.bboxMm.max.y) / 2 };
		expect(Math.hypot(centre.x - expected.x, centre.y - expected.y), `post centre (${centre.x}, ${centre.y})`).toBeLessThanOrEqual(1e-4);
		expect(post!.footprintMm!.length).toBe(8);
		for (const v of post!.footprintMm!) {
			expect(Math.hypot(v.x - expected.x, v.y - expected.y)).toBeCloseTo(4, 3);
		}
		expect(post!.bboxMm.min.z).toBe(0);
		expect(post!.bboxMm.max.z).toBe(50);
	});

	it('col_ramp_slot_fill: surface plastic, z 0-50, footprint (366.4,485) (385.5613,485) (390.4,500) (390.4,750) (366.4,740), flush with col_ramp_wall_r, col_loop_r_lower and col_loop_r_funnel', () => {
		const fill = bodyByName.get('col_ramp_slot_fill');
		expect(fill, 'col_ramp_slot_fill').toBeDefined();
		expect(fill!.surface).toBe('plastic');
		expect(fill!.bboxMm.min.z).toBe(0);
		expect(fill!.bboxMm.max.z).toBe(50);
		const expected = [{ x: 366.4, y: 485 }, { x: 385.5613, y: 485 }, { x: 390.4, y: 500 }, { x: 390.4, y: 750 }, { x: 366.4, y: 740 }];
		expect(fill!.footprintMm!.length).toBe(expected.length);
		fill!.footprintMm!.forEach((v, k) => {
			expect(Math.hypot(v.x - expected[k]!.x, v.y - expected[k]!.y), `vertex ${k} (${v.x}, ${v.y})`).toBeLessThanOrEqual(1e-4);
		});
		// Flush: each fill edge lies ON a neighbour's boundary (both ends
		// within float noise of that neighbour's edges).
		const onBoundary = (p: Pt, name: string): boolean => distanceToPolygonEdge(bodyByName.get(name)!.footprintMm!, p) <= 1e-3;
		const f = fill!.footprintMm!;
		expect(onBoundary(f[4]!, 'col_ramp_wall_r') && onBoundary(f[0]!, 'col_ramp_wall_r'), 'west edge on col_ramp_wall_r').toBe(true);
		expect(onBoundary(f[1]!, 'col_loop_r_funnel') && onBoundary(f[2]!, 'col_loop_r_funnel'), 'south-east edge along col_loop_r_funnel').toBe(true);
		expect(onBoundary(f[2]!, 'col_loop_r_lower') && onBoundary(f[3]!, 'col_loop_r_lower'), 'east edge on col_loop_r_lower').toBe(true);
	});
});

describe('Story 5.4 AC 3 -- no external asset', () => {
	it('the glb holds exactly one image (the playfield translucency mask) and no glTF extension', () => {
		expect((glb.doc.images ?? []).map((i) => i.name)).toEqual(['img_playfield_translucency']);
		expect((glb.doc.textures ?? []).length).toBe(1);
		expect(glb.doc.extensionsUsed, 'no extensionsUsed').toBeUndefined();
		expect(glb.doc.extensionsRequired, 'no extensionsRequired').toBeUndefined();
	});

	// [Story 5.4 review] AC 3's second clause. mutation: add a row under
	// ATTRIBUTIONS.md's "## Assets" table -> red here.
	it('ATTRIBUTIONS.md\'s third-party Assets table stays empty (every asset is project-generated)', () => {
		const text = readFileSync(ATTRIBUTIONS_PATH, 'utf8');
		const start = text.indexOf('\n## Assets\n');
		expect(start, 'ATTRIBUTIONS.md carries an "## Assets" section').toBeGreaterThanOrEqual(0);
		const end = text.indexOf('\n## ', start + 1);
		const section = text.slice(start, end < 0 ? undefined : end).split('\n').map((line) => line.trim());
		const header = section.findIndex((line) => line.startsWith('| Asset |'));
		expect(header, 'non-vacuity: the Assets table header').toBeGreaterThanOrEqual(0);
		expect(section[header + 1], 'the Assets table separator row').toMatch(/^\|(-+\|)+$/);
		const rows = section.slice(header + 2).filter((line) => line.startsWith('|'));
		expect(rows, 'third-party asset rows').toEqual([]);
	});
});
