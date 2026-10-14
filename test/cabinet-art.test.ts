// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 -- the cabinet, the backbox and the glass, proved from the
// EXPORTED glb alone (JSON + BIN), never from
// `tools/make-placeholder-blend.py`'s text and never through Babylon:
//
//   AC 1  the reference dimensions (the research digest's figures) and the
//         fit table (the story's own constants), measured in the level
//         frame -- the table frame of AD-10 as `cabinet_root` sees it;
//   AC 2  the fit: every playfield vertex, pitched about `pivot_pitch` by
//         each allowed pitch, stays under the glass and inside the tub, and
//         the Backglass quad stays clear of the glass and inside the
//         speaker panel;
//   AC 3  `vis_` only, contract kept: exactly eleven meshes and three lamp
//         Empties, with their parents, materials, `lg_cabinet`, both UV
//         sets and no node transform; `vis_backbox` untouched; one image,
//         no extension;
//   AC 10 attribution and the triangle budget.
//
// Every expected figure below is TYPED here from the spec's two tables (the
// reference figures and the fit table), not read from the generator and not
// derived from the mesh under test. Where a rule is about how two parts of
// the glb relate (the fit), the surfaces are MEASURED from the glb -- so a
// moved glass or a moved wall is caught by geometry -- and separately pinned
// to their typed figures.
//
// What this file cannot prove: anything rendered. `NullEngine` rasterises
// nothing and this file does not even load a scene; whether the cabinet is
// drawn, and what the lamps do to a pixel, is the lead's browser check.
//
// Falsifiability (Rule 19; each observed red, recorded in the spec's
// Verification section):
//   mutation: add 5 mm to one vis_top_glass vertex x in the glb BIN -> the
//     glass-dimension case red.
//   mutation: give the vis_top_glass node a translation of 30 mm downward in
//     the glb JSON chunk -> the fit case red (clearance below 5 mm).
//   mutation: rename vis_top_glass to vis_glass in the glb JSON chunk -> the
//     node case red.
//   mutation: remove the Story 5.3 sentence from the glb row of
//     ATTRIBUTIONS.md -> the attribution case red.
//   mutation: set the count of vis_legs' index accessor to 6003 in the glb
//     JSON chunk -> the budget case red.
// The fit, node and budget checks are functions of a parsed glb, so each
// also carries an in-memory negative control beside its positive.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { TUNING } from '../src/sim/table/tuning';
import { glbToTable } from '../src/sim/table/frames';
import { VIS_CABINET_NODE_NAMES, VIS_PLUNGER_NODE_NAME } from '../src/presentation/scene/vis-names';

const REPO_ROOT = path.resolve(__dirname, '..');
const GLB_PATH = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.collision.json');
const ATTRIBUTIONS_PATH = path.join(REPO_ROOT, 'ATTRIBUTIONS.md');

// ---------------------------------------------------------------------------
// The spec's reference figures (mm). Source: the research digest
// geometry-r1-1.md:15-25,186-192 (a standard-body cabinet, backbox and glass).
// ---------------------------------------------------------------------------
const REF_BODY_W = 560;
const REF_BODY_D = 1400;
const REF_BODY_FRONT_H = 400;
const REF_BODY_BACK_H = 605;
const REF_HEAD_W = 730;
const REF_HEAD_H = 730;
const REF_GLASS_W = 533;
const REF_GLASS_L = 1093;
const REF_GLASS_T = 4.76;
const REF_LOCKBAR_TOP_MIN = 900;
const REF_LOCKBAR_TOP_MAX = 920;
/** The planned assembled height (author decision 2026-10-13), not the reference machine's 1930. */
const ASSEMBLED_H = 1790;
const ASSEMBLED_H_TOL = 2;
/** The spec's tolerance on a built mesh. */
const REF_TOL = 0.5;
const REF_GLASS_T_TOL = 0.05;

// ---------------------------------------------------------------------------
// The spec's fit table (level-frame mm), typed. FIT_TOL is this file's own,
// tighter than the spec's 0.5 mm so the fit's own margins (0.6 mm between the
// playfield's wall art and the side walls) cannot hide inside a tolerance.
// ---------------------------------------------------------------------------
const FIT_TOL = 0.05;
const CENTRE_X = 257.2;
const BODY = { x0: -22.8, x1: 537.2, y0: -28, y1: 1372, underside: -330, frontTop: 70, backTop: 275 };
const SIDE_WALL_T = 9;
const END_WALL_T = 18;
/** The body's top line: Z = 70 at Y = -28, rising 205 in 1400. */
const TOP_LINE_SLOPE = 205 / 1400;
const topLineZ = (y: number): number => BODY.frontTop + TOP_LINE_SLOPE * (y - BODY.y0);
const RAIL = { w: 18, h: 6, y0: -8, y1: 1068 };
const LOCKBAR = { x0: -22.8, x1: 537.2, y0: -44, y1: -8, z0: 62, z1: 80 };
const FLOOR_Z = -830;
const LEG = { side: 36, proud: 4, top: -150 };
/** The glass's lower face lies on Z = 66.10 + (205/1400) Y, 8 mm below the top line. */
const GLASS = { lowerZ0: 66.1, rearY: 1066.0, x0: -9.3, x1: 523.7, frontLowerY: -15.5 };
const ARCH = { x0: -13.8, x1: 528.2, y0: 1075, y1: 1081, z0: 100, z1: 230 };
const HEAD = { x0: -107.8, x1: 622.2, y0: 1072, y1: 1372, z0: 230, z1: 960, wall: 12 };
const PANEL = { x0: -107.8, x1: 622.2, y0: 1068, y1: 1072, z0: 230, z1: 370 };
const TRANSLITE = { x0: -107.8, x1: 622.2, y0: 1068, y1: 1072, z0: 370, z1: 960 };
const LIGHTBOX = { x0: -95.8, x1: 610.2, y0: 1340, y1: 1344, z0: 242, z1: 948 };
/** The lamp Empties, keyed by `TABLE.giChannels` key. */
const LAMP_POS: Readonly<Record<string, readonly [number, number, number]>> = {
	gi_backbox: [257.2, 1120, 600],
	gi_cabinet: [257.2, -300, 400],
	gi_arch: [257.2, 900, 210],
};
/** The fit rules' own margins. */
const GLASS_CLEARANCE = 5;
const BACKGLASS_CLEARANCE = 10;
/** The three pitches the fit is checked at: TUNING.pitchMinDeg, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg. */
const PITCHES_DEG = [6.0, 6.5, 8.5] as const;

// ---------------------------------------------------------------------------
// The spec's node and material tables, typed.
// ---------------------------------------------------------------------------
const CABINET_ROOT = 'cabinet_root';
const PLAYFIELD_ROOT = 'playfield_root';
const PIVOT_PITCH = 'pivot_pitch';
const BACKBOX = 'vis_backbox';
const BACKBOX_MATERIAL = 'mat_backbox';
const CABINET_LIGHTGROUP = 'lg_cabinet';

/** The eleven meshes: the five objects, each followed by its children. */
const CABINET_NODES: ReadonlyArray<{ readonly name: string; readonly parent: string; readonly material: string }> = [
	{ name: 'vis_cabinet', parent: CABINET_ROOT, material: 'mat_art_cabinet' },
	{ name: 'vis_cabinet_rail_l', parent: 'vis_cabinet', material: 'mat_art_cabinet_trim' },
	{ name: 'vis_cabinet_rail_r', parent: 'vis_cabinet', material: 'mat_art_cabinet_trim' },
	{ name: 'vis_cabinet_arch', parent: 'vis_cabinet', material: 'mat_art_cabinet_arch' },
	{ name: 'vis_lockbar', parent: CABINET_ROOT, material: 'mat_art_cabinet_trim' },
	{ name: 'vis_legs', parent: CABINET_ROOT, material: 'mat_art_cabinet_trim' },
	{ name: 'vis_top_glass', parent: CABINET_ROOT, material: 'mat_art_glass' },
	{ name: 'vis_head', parent: CABINET_ROOT, material: 'mat_art_cabinet' },
	{ name: 'vis_head_panel', parent: 'vis_head', material: 'mat_art_head_panel' },
	{ name: 'vis_head_translite', parent: 'vis_head', material: 'mat_art_translite' },
	{ name: 'vis_head_lightbox', parent: 'vis_head', material: 'mat_art_lightbox' },
];
const OBJECTS = ['vis_cabinet', 'vis_lockbar', 'vis_legs', 'vis_top_glass', 'vis_head'] as const;
const TRIANGLE_BUDGET = 2000;

/** The seven cabinet materials: linear base colour and roughness; metallic 0, no texture. */
const CABINET_MATERIALS: Readonly<Record<string, { readonly rgb: readonly [number, number, number]; readonly roughness: number }>> = {
	mat_art_cabinet: { rgb: [0.14, 0.05, 0.04], roughness: 0.6 },
	mat_art_cabinet_trim: { rgb: [0.2, 0.2, 0.22], roughness: 0.35 },
	mat_art_cabinet_arch: { rgb: [0.1, 0.12, 0.06], roughness: 0.6 },
	mat_art_glass: { rgb: [0.55, 0.7, 0.75], roughness: 0.1 },
	mat_art_head_panel: { rgb: [0.03, 0.03, 0.035], roughness: 0.5 },
	mat_art_translite: { rgb: [0.45, 0.1, 0.04], roughness: 0.3 },
	mat_art_lightbox: { rgb: [0.2, 0.14, 0.06], roughness: 0.8 },
};
const MATERIAL_TOL = 1e-6;

// ---------------------------------------------------------------------------
// glb reading (JSON + BIN).
// ---------------------------------------------------------------------------

interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}
interface GltfNode {
	name?: string;
	mesh?: number;
	children?: number[];
	translation?: number[];
	rotation?: number[];
	scale?: number[];
	matrix?: number[];
	extras?: Record<string, unknown>;
}
interface GltfPrimitive {
	attributes: Record<string, number>;
	indices?: number;
	material?: number;
}
interface GltfMaterial {
	name?: string;
	alphaMode?: string;
	pbrMetallicRoughness?: {
		baseColorFactor?: number[];
		metallicFactor?: number;
		roughnessFactor?: number;
		baseColorTexture?: unknown;
		metallicRoughnessTexture?: unknown;
	};
	normalTexture?: unknown;
	emissiveTexture?: unknown;
	occlusionTexture?: unknown;
	extensions?: unknown;
}
interface GltfDocument {
	nodes: GltfNode[];
	meshes: Array<{ primitives: GltfPrimitive[] }>;
	accessors: Array<{ bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }>;
	bufferViews: Array<{ byteOffset?: number; byteStride?: number }>;
	materials: GltfMaterial[];
	images?: Array<{ name?: string }>;
	textures?: unknown[];
	extensionsUsed?: string[];
	extensionsRequired?: string[];
}
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

/** The same BIN with a deep copy of the JSON, changed by `edit` -- for the in-memory negative controls. */
function withDoc(glb: Glb, edit: (doc: GltfDocument) => void): Glb {
	const doc = structuredClone(glb.doc);
	edit(doc);
	return { doc, bin: glb.bin };
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
	const tx = 2 * (qy * vz - qz * vy);
	const ty = 2 * (qz * vx - qx * vz);
	const tz = 2 * (qx * vy - qy * vx);
	return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

/** Applies a node's own TRS to a point in its local frame. */
function applyTrs(node: GltfNode, p: readonly number[]): number[] {
	const s = node.scale ?? [1, 1, 1];
	const r = node.rotation ?? [0, 0, 0, 1];
	const t = node.translation ?? [0, 0, 0];
	const rotated = rotate(r, [p[0]! * s[0]!, p[1]! * s[1]!, p[2]! * s[2]!]);
	return [rotated[0]! + t[0]!, rotated[1]! + t[1]!, rotated[2]! + t[2]!];
}

function parentIndexMap(doc: GltfDocument): Map<number, number> {
	const parents = new Map<number, number>();
	doc.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parents.set(c, i)));
	return parents;
}

function indicesNamed(doc: GltfDocument, name: string): number[] {
	return doc.nodes.map((n, i) => (n.name === name ? i : -1)).filter((i) => i >= 0);
}

function indexOfNode(doc: GltfDocument, name: string): number {
	const matches = indicesNamed(doc, name);
	if (matches.length !== 1) {
		throw new Error(`the glb must carry exactly one node named "${name}" (found ${matches.length})`);
	}
	return matches[0]!;
}

function descendants(doc: GltfDocument, index: number): number[] {
	const out: number[] = [];
	for (const child of doc.nodes[index]!.children ?? []) {
		out.push(child, ...descendants(doc, child));
	}
	return out;
}

function materialNames(doc: GltfDocument, node: GltfNode): string[] {
	return doc.meshes[node.mesh!]!.primitives.map((p) => (p.material === undefined ? '(none)' : (doc.materials[p.material]?.name ?? '(unnamed)')));
}

/**
 * Node `index`'s OWN mesh vertices (no descendants), carried up its parent
 * chain to `rootIndex` and into table millimetres. Under `cabinet_root` that
 * is the level frame; under `playfield_root`, the unpitched table frame.
 */
function ownVertices(glb: Glb, index: number, rootIndex: number): Vec3[] {
	const parents = parentIndexMap(glb.doc);
	const node = glb.doc.nodes[index]!;
	if (node.mesh === undefined) {
		throw new Error(`"${node.name}" carries no mesh`);
	}
	const chain: GltfNode[] = [];
	for (let at = index; at !== rootIndex; ) {
		chain.push(glb.doc.nodes[at]!);
		const parent = parents.get(at);
		if (parent === undefined) {
			throw new Error(`"${node.name}" does not descend from "${glb.doc.nodes[rootIndex]!.name}"`);
		}
		at = parent;
	}
	const out: Vec3[] = [];
	for (const primitive of glb.doc.meshes[node.mesh]!.primitives) {
		for (const p of readAccessor(glb, primitive.attributes.POSITION!)) {
			let q = p;
			for (const link of chain) {
				q = applyTrs(link, q);
			}
			out.push(glbToTable({ x: q[0]!, y: q[1]!, z: q[2]! }));
		}
	}
	return out;
}

function cabinetVertices(glb: Glb, name: string): Vec3[] {
	return ownVertices(glb, indexOfNode(glb.doc, name), indexOfNode(glb.doc, CABINET_ROOT));
}

interface Box {
	readonly min: Vec3;
	readonly max: Vec3;
}

function boxOf(vertices: readonly Vec3[]): Box {
	expect(vertices.length, 'non-vacuity: vertices to measure').toBeGreaterThan(0);
	const axis = (k: 'x' | 'y' | 'z', pick: (...v: number[]) => number): number => pick(...vertices.map((v) => v[k]));
	return {
		min: { x: axis('x', Math.min), y: axis('y', Math.min), z: axis('z', Math.min) },
		max: { x: axis('x', Math.max), y: axis('y', Math.max), z: axis('z', Math.max) },
	};
}

/** The distinct values of one coordinate, ascending, values within 0.01 mm merged. */
function distinct(vertices: readonly Vec3[], k: 'x' | 'y' | 'z'): number[] {
	const out: number[] = [];
	for (const value of vertices.map((v) => v[k]).sort((a, b) => a - b)) {
		if (out.length === 0 || value - out[out.length - 1]! > 0.01) {
			out.push(value);
		}
	}
	return out;
}

function expectClose(actual: number, expected: number, tolerance: number, label: string): void {
	expect(Math.abs(actual - expected), `${label}: ${actual.toFixed(4)} vs ${expected} (+/- ${tolerance})`).toBeLessThanOrEqual(tolerance);
}

function expectValues(actual: readonly number[], expected: readonly number[], tolerance: number, label: string): void {
	expect(actual.length, `${label}: ${actual.map((v) => v.toFixed(3)).join(', ')} vs ${expected.join(', ')}`).toBe(expected.length);
	expected.forEach((value, i) => expectClose(actual[i]!, value, tolerance, `${label}[${i}]`));
}

function expectBox(box: Box, x: readonly [number, number], y: readonly [number, number], z: readonly [number, number], label: string): void {
	expectClose(box.min.x, x[0], FIT_TOL, `${label} min x`);
	expectClose(box.max.x, x[1], FIT_TOL, `${label} max x`);
	expectClose(box.min.y, y[0], FIT_TOL, `${label} min y`);
	expectClose(box.max.y, y[1], FIT_TOL, `${label} max y`);
	expectClose(box.min.z, z[0], FIT_TOL, `${label} min z`);
	expectClose(box.max.z, z[1], FIT_TOL, `${label} max z`);
}

// ---------------------------------------------------------------------------
// The glass, in its own plane.
// ---------------------------------------------------------------------------

interface GlassFrame {
	/** Unit normal of the glass's two large faces, pointing up (z > 0). */
	readonly normal: Vec3;
	/** `normal . p` on the lower and on the upper face. */
	readonly lowerD: number;
	readonly upperD: number;
	readonly widthMm: number;
	readonly lengthMm: number;
	readonly thicknessMm: number;
	readonly vertices: readonly Vec3[];
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * The glass measured along its own axes: the normal of its largest triangle
 * (one of its two big faces), the level-frame X axis across it, and the
 * in-plane axis perpendicular to both. Nothing here assumes the slope.
 */
function glassFrame(glb: Glb, name = 'vis_top_glass'): GlassFrame {
	const index = indexOfNode(glb.doc, name);
	const vertices = ownVertices(glb, index, indexOfNode(glb.doc, CABINET_ROOT));
	const primitives = glb.doc.meshes[glb.doc.nodes[index]!.mesh!]!.primitives;
	expect(primitives.length, `${name}: one primitive`).toBe(1);
	const flat = readAccessor(glb, primitives[0]!.indices!).map((i) => i[0]!);
	let best: Vec3 | undefined;
	let bestArea = 0;
	for (let k = 0; k + 2 < flat.length; k += 3) {
		const a = vertices[flat[k]!]!;
		const n = cross(sub(vertices[flat[k + 1]!]!, a), sub(vertices[flat[k + 2]!]!, a));
		const area = Math.hypot(n.x, n.y, n.z);
		if (area > bestArea) {
			bestArea = area;
			best = n;
		}
	}
	if (!best || bestArea === 0) {
		throw new Error(`${name}: no triangle with area`);
	}
	const sign = best.z < 0 ? -1 : 1;
	const normal = { x: (sign * best.x) / bestArea, y: (sign * best.y) / bestArea, z: (sign * best.z) / bestArea };
	const across = { x: 1, y: 0, z: 0 };
	const along = cross(across, normal);
	const extent = (axis: Vec3): [number, number] => {
		const values = vertices.map((v) => dot(axis, v));
		return [Math.min(...values), Math.max(...values)];
	};
	const [lowerD, upperD] = extent(normal);
	const [w0, w1] = extent(across);
	const [l0, l1] = extent(along);
	return { normal, lowerD, upperD, widthMm: w1 - w0, lengthMm: l1 - l0, thicknessMm: upperD - lowerD, vertices };
}

// ---------------------------------------------------------------------------
// AC 2: the fit, as a function of a parsed glb.
// ---------------------------------------------------------------------------

interface FitReport {
	readonly vertices: number;
	readonly meshes: number;
	readonly plungerVertices: number;
	readonly minGlassClearanceMm: number;
	readonly problems: string[];
}

interface Tub {
	readonly innerX0: number;
	readonly innerX1: number;
	readonly frontInnerY: number;
	readonly archFrontY: number;
}

/** The tub's inner surfaces, measured from the glb: the body's second and third distinct x, its second distinct y, and the arch panel's front face. */
function measureTub(glb: Glb): Tub {
	const body = cabinetVertices(glb, 'vis_cabinet');
	const xs = distinct(body, 'x');
	const ys = distinct(body, 'y');
	if (xs.length !== 4 || ys.length !== 4) {
		throw new Error(`vis_cabinet is not a four-walled tub: distinct x ${xs.join(', ')}; distinct y ${ys.join(', ')}`);
	}
	return { innerX0: xs[1]!, innerX1: xs[2]!, frontInnerY: ys[1]!, archFrontY: boxOf(cabinetVertices(glb, 'vis_cabinet_arch')).min.y };
}

/**
 * Pitches every vertex of every mesh under `playfield_root` by `pitchDeg`
 * about `pivot_pitch` and checks the four "Playfield fit" rules against the
 * glass and the tub as the glb carries them.
 */
function playfieldFit(glb: Glb, pitchDeg: number): FitReport {
	const { doc } = glb;
	const rootIndex = indexOfNode(doc, PLAYFIELD_ROOT);
	const pivotNode = doc.nodes[indexOfNode(doc, PIVOT_PITCH)]!;
	const pivot = glbToTable({ x: pivotNode.translation![0]!, y: pivotNode.translation![1]!, z: pivotNode.translation![2]! });
	const glass = glassFrame(glb);
	const tub = measureTub(glb);
	const plunger = new Set([indexOfNode(doc, VIS_PLUNGER_NODE_NAME), ...descendants(doc, indexOfNode(doc, VIS_PLUNGER_NODE_NAME))]);
	const cos = Math.cos((pitchDeg * Math.PI) / 180);
	const sin = Math.sin((pitchDeg * Math.PI) / 180);

	const problems: string[] = [];
	const report = (text: string): void => {
		if (problems.length < 8) {
			problems.push(`${pitchDeg} deg: ${text}`);
		}
	};
	let vertices = 0;
	let meshes = 0;
	let plungerVertices = 0;
	let minGlassClearanceMm = Infinity;
	for (const index of descendants(doc, rootIndex)) {
		const node = doc.nodes[index]!;
		if (node.mesh === undefined) {
			continue;
		}
		meshes += 1;
		const isPlunger = plunger.has(index);
		for (const v of ownVertices(glb, index, rootIndex)) {
			vertices += 1;
			const dy = v.y - pivot.y;
			const dz = v.z - pivot.z;
			const level = { x: v.x, y: pivot.y + dy * cos - dz * sin, z: pivot.z + dz * cos + dy * sin };
			const at = `${node.name} (${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}) -> level (${level.x.toFixed(1)}, ${level.y.toFixed(1)}, ${level.z.toFixed(1)})`;
			const clearance = glass.lowerD - dot(glass.normal, level);
			minGlassClearanceMm = Math.min(minGlassClearanceMm, clearance);
			if (clearance < GLASS_CLEARANCE) {
				report(`${at} is ${clearance.toFixed(3)} mm below the glass's lower face (needs ${GLASS_CLEARANCE})`);
			}
			if (!(level.x > tub.innerX0 && level.x < tub.innerX1)) {
				report(`${at} is not between the side walls' inner faces (${tub.innerX0.toFixed(3)}, ${tub.innerX1.toFixed(3)})`);
			}
			if (!(level.y < tub.archFrontY)) {
				report(`${at} is not in front of the arch panel's front face (${tub.archFrontY.toFixed(3)})`);
			}
			if (isPlunger) {
				plungerVertices += 1;
			} else if (!(level.y > tub.frontInnerY)) {
				report(`${at} is not behind the front wall's inner face (${tub.frontInnerY.toFixed(3)})`);
			}
		}
	}
	return { vertices, meshes, plungerVertices, minGlassClearanceMm, problems };
}

/** The "Backglass stays clear" rule, against the glass and the speaker panel as the glb carries them. */
function backglassProblems(glb: Glb): { corners: number; problems: string[] } {
	const glass = glassFrame(glb);
	const panel = boxOf(cabinetVertices(glb, 'vis_head_panel'));
	const quad = cabinetVertices(glb, BACKBOX);
	const box = boxOf(quad);
	const corners: Vec3[] = [];
	for (const x of [box.min.x, box.max.x]) {
		for (const y of [box.min.y, box.max.y]) {
			for (const z of [box.min.z, box.max.z]) {
				corners.push({ x, y, z });
			}
		}
	}
	const problems: string[] = [];
	for (const c of corners) {
		const at = `vis_backbox corner (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`;
		const above = dot(glass.normal, c) - glass.upperD;
		if (above < BACKGLASS_CLEARANCE) {
			problems.push(`${at} is ${above.toFixed(3)} mm above the glass's upper face (needs ${BACKGLASS_CLEARANCE})`);
		}
		if (!(c.x > panel.min.x && c.x < panel.max.x && c.z > panel.min.z && c.z < panel.max.z)) {
			problems.push(`${at} is outside the speaker panel's outline (x ${panel.min.x}..${panel.max.x}, z ${panel.min.z}..${panel.max.z})`);
		}
		if (!(c.y < panel.min.y)) {
			problems.push(`${at} is not in front of the speaker panel's front face (y ${panel.min.y})`);
		}
	}
	return { corners: corners.length, problems };
}

// ---------------------------------------------------------------------------
// AC 3: the node contract, as a function of a parsed glb.
// ---------------------------------------------------------------------------

function nodeContractProblems(glb: Glb): string[] {
	const { doc } = glb;
	const problems: string[] = [];
	const parents = parentIndexMap(doc);
	const parentName = (index: number): string | undefined => (parents.has(index) ? doc.nodes[parents.get(index)!]!.name : undefined);
	const channelNames = Object.keys(TABLE.giChannels);

	for (const { name, parent, material } of CABINET_NODES) {
		const matches = indicesNamed(doc, name);
		if (matches.length !== 1) {
			problems.push(`${name}: ${matches.length} nodes (exactly one expected)`);
			continue;
		}
		const node = doc.nodes[matches[0]!]!;
		if (parentName(matches[0]!) !== parent) {
			problems.push(`${name}: parent ${String(parentName(matches[0]!))}, expected ${parent}`);
		}
		for (const key of ['translation', 'rotation', 'scale', 'matrix'] as const) {
			if (node[key] !== undefined) {
				problems.push(`${name}: carries a node ${key} (${JSON.stringify(node[key])}); a cabinet mesh has an identity transform`);
			}
		}
		if (node.mesh === undefined) {
			problems.push(`${name}: carries no mesh`);
			continue;
		}
		const primitives = doc.meshes[node.mesh]!.primitives;
		if (primitives.length !== 1) {
			problems.push(`${name}: ${primitives.length} primitives (one material, one primitive)`);
		}
		const materials = materialNames(doc, node);
		if (materials.join(',') !== material) {
			problems.push(`${name}: material ${materials.join(',')}, expected ${material}`);
		}
		for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1']) {
			if (primitives[0]?.attributes[attribute] === undefined) {
				problems.push(`${name}: no ${attribute}`);
			}
		}
		if (node.extras?.lightgroup !== CABINET_LIGHTGROUP) {
			problems.push(`${name}: lightgroup ${String(node.extras?.lightgroup)}, expected ${CABINET_LIGHTGROUP}`);
		}
	}

	for (const channel of channelNames) {
		const matches = indicesNamed(doc, channel);
		if (matches.length !== 1) {
			problems.push(`${channel}: ${matches.length} nodes (exactly one lamp Empty expected)`);
			continue;
		}
		const node = doc.nodes[matches[0]!]!;
		if (parentName(matches[0]!) !== CABINET_ROOT) {
			problems.push(`${channel}: parent ${String(parentName(matches[0]!))}, expected ${CABINET_ROOT}`);
		}
		if (node.mesh !== undefined) {
			problems.push(`${channel}: a lamp Empty carries no mesh`);
		}
		if (node.extras !== undefined) {
			problems.push(`${channel}: a lamp Empty carries no property (extras ${JSON.stringify(node.extras)})`);
		}
		if (node.children !== undefined) {
			problems.push(`${channel}: a lamp Empty has no children`);
		}
		if (node.rotation !== undefined || node.scale !== undefined || node.matrix !== undefined) {
			problems.push(`${channel}: a lamp Empty carries a translation only`);
		}
	}

	// Exactly these, and nothing else, under cabinet_root.
	const rootIndex = indexOfNode(doc, CABINET_ROOT);
	const under = descendants(doc, rootIndex).map((i) => doc.nodes[i]!.name ?? '(unnamed)').sort();
	const expectedUnder = [BACKBOX, ...CABINET_NODES.map((n) => n.name), ...channelNames].sort();
	if (under.join(' ') !== expectedUnder.join(' ')) {
		problems.push(`cabinet_root holds [${under.join(' ')}], expected [${expectedUnder.join(' ')}]`);
	}
	const direct = (doc.nodes[rootIndex]!.children ?? []).map((i) => doc.nodes[i]!.name ?? '(unnamed)').sort();
	const expectedDirect = [BACKBOX, ...CABINET_NODES.filter((n) => n.parent === CABINET_ROOT).map((n) => n.name), ...channelNames].sort();
	if (direct.join(' ') !== expectedDirect.join(' ')) {
		problems.push(`cabinet_root's direct children are [${direct.join(' ')}], expected [${expectedDirect.join(' ')}]`);
	}

	// No twin of col_glass, and no new collision-, switch-, device- or lamp-prefixed node among the additions.
	if (indicesNamed(doc, 'vis_glass').length !== 0) {
		problems.push('a node is named vis_glass: that is the twin name of col_glass, which has no twin');
	}
	return problems;
}

/** Triangles of node `name` and its descendants, from the index accessors' own counts. */
function triangleCount(glb: Glb, name: string): { triangles: number; meshes: number } {
	const { doc } = glb;
	const index = indexOfNode(doc, name);
	let triangles = 0;
	let meshes = 0;
	for (const i of [index, ...descendants(doc, index)]) {
		const node = doc.nodes[i]!;
		if (node.mesh === undefined) {
			continue;
		}
		meshes += 1;
		for (const primitive of doc.meshes[node.mesh]!.primitives) {
			triangles += doc.accessors[primitive.indices!]!.count / 3;
		}
	}
	return { triangles, meshes };
}

const glb = readGlb();

// ---------------------------------------------------------------------------
// AC 1.
// ---------------------------------------------------------------------------

describe('Story 5.3 AC 1 -- the reference dimensions, measured on the committed glb in the level frame', () => {
	it('vis_cabinet is 560 wide and 1400 deep; its front face spans 400 in z and its back face 605', () => {
		const vertices = cabinetVertices(glb, 'vis_cabinet');
		const box = boxOf(vertices);
		expectClose(box.max.x - box.min.x, REF_BODY_W, REF_TOL, 'vis_cabinet width');
		expectClose(box.max.y - box.min.y, REF_BODY_D, REF_TOL, 'vis_cabinet depth');
		const front = vertices.filter((v) => v.y - box.min.y < 0.01);
		const back = vertices.filter((v) => box.max.y - v.y < 0.01);
		expect(front.length, 'non-vacuity: vertices on the front face').toBeGreaterThanOrEqual(4);
		expect(back.length, 'non-vacuity: vertices on the back face').toBeGreaterThanOrEqual(4);
		const span = (set: readonly Vec3[]): number => Math.max(...set.map((v) => v.z)) - Math.min(...set.map((v) => v.z));
		expectClose(span(front), REF_BODY_FRONT_H, REF_TOL, 'vis_cabinet front-face height');
		expectClose(span(back), REF_BODY_BACK_H, REF_TOL, 'vis_cabinet back-face height');
	});

	it('vis_head is 730 wide and 730 high', () => {
		const box = boxOf(cabinetVertices(glb, 'vis_head'));
		expectClose(box.max.x - box.min.x, REF_HEAD_W, REF_TOL, 'vis_head width');
		expectClose(box.max.z - box.min.z, REF_HEAD_H, REF_TOL, 'vis_head height');
	});

	// mutation: add 5 mm to one vis_top_glass vertex x in the glb BIN -> red here.
	it('vis_top_glass, along its own axes, is 533 x 1093 and 4.76 thick, and every vertex is a corner of that slab', () => {
		const glass = glassFrame(glb);
		expectClose(glass.widthMm, REF_GLASS_W, REF_TOL, 'vis_top_glass width');
		expectClose(glass.lengthMm, REF_GLASS_L, REF_TOL, 'vis_top_glass length along its slope');
		expectClose(glass.thicknessMm, REF_GLASS_T, REF_GLASS_T_TOL, 'vis_top_glass thickness normal to its faces');
		expect(Math.abs(glass.normal.x), 'the glass slopes front to back only: its normal has no x component').toBeLessThan(1e-6);
		expect(glass.normal.z, 'the glass is nearer level than upright').toBeGreaterThan(0.9);
		// A slab has eight corners: every vertex is on one of its two edges in x
		// and on one of its two faces. (An extent alone cannot see one corner
		// copy pulled inward.)
		expect(glass.vertices.length, 'non-vacuity: glass vertices').toBeGreaterThanOrEqual(8);
		for (const v of glass.vertices) {
			const at = `vis_top_glass vertex (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
			expect(Math.min(Math.abs(v.x - GLASS.x0), Math.abs(v.x - GLASS.x1)), `${at}: x is ${GLASS.x0} or ${GLASS.x1}`).toBeLessThanOrEqual(FIT_TOL);
			const d = dot(glass.normal, v);
			expect(Math.min(Math.abs(d - glass.lowerD), Math.abs(d - glass.upperD)), `${at}: on the lower or the upper face`).toBeLessThanOrEqual(FIT_TOL);
		}
	});

	it('the lockdown bar\'s top is 900 to 920 above the legs\' feet, and the top of vis_head is 1790 +/- 2 above them', () => {
		const feet = boxOf(cabinetVertices(glb, 'vis_legs')).min.z;
		const lockbarTop = boxOf(cabinetVertices(glb, 'vis_lockbar')).max.z - feet;
		expect(lockbarTop, `lockdown bar top ${lockbarTop.toFixed(3)} mm above the feet`).toBeGreaterThanOrEqual(REF_LOCKBAR_TOP_MIN);
		expect(lockbarTop, `lockdown bar top ${lockbarTop.toFixed(3)} mm above the feet`).toBeLessThanOrEqual(REF_LOCKBAR_TOP_MAX);
		const headTop = boxOf(cabinetVertices(glb, 'vis_head')).max.z - feet;
		expectClose(headTop, ASSEMBLED_H, ASSEMBLED_H_TOL, 'assembled height (top of vis_head above the feet)');
	});
});

describe('Story 5.3 AC 1 -- the fit table: every part is where the spec puts it', () => {
	it('the body is a tub centred on the playfield: sides 9 thick; front, back and bottom 18; its rim on the top line', () => {
		const vertices = cabinetVertices(glb, 'vis_cabinet');
		expectBox(boxOf(vertices), [BODY.x0, BODY.x1], [BODY.y0, BODY.y1], [BODY.underside, BODY.backTop], 'vis_cabinet');
		expectClose((BODY.x0 + BODY.x1) / 2, CENTRE_X, 1e-9, 'the typed body is centred on x 257.2');
		expectClose(TABLE.reference.playfieldMm.w / 2, CENTRE_X, 1e-9, 'x 257.2 is the playfield\'s own centreline');
		expectValues(distinct(vertices, 'x'), [BODY.x0, BODY.x0 + SIDE_WALL_T, BODY.x1 - SIDE_WALL_T, BODY.x1], FIT_TOL, 'vis_cabinet distinct x');
		expectValues(distinct(vertices, 'y'), [BODY.y0, BODY.y0 + END_WALL_T, BODY.y1 - END_WALL_T, BODY.y1], FIT_TOL, 'vis_cabinet distinct y');
		expectValues(distinct(vertices, 'z').slice(0, 2), [BODY.underside, BODY.underside + END_WALL_T], FIT_TOL, 'vis_cabinet underside and tub floor');
		// Every vertex is on the underside, on the tub floor, or on the top line.
		for (const v of vertices) {
			const offTopLine = Math.abs(v.z - topLineZ(v.y));
			const onFloor = Math.min(Math.abs(v.z - BODY.underside), Math.abs(v.z - (BODY.underside + END_WALL_T)));
			expect(Math.min(offTopLine, onFloor), `vis_cabinet vertex (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`).toBeLessThanOrEqual(FIT_TOL);
		}
		expectClose(topLineZ(BODY.y1), BODY.backTop, 1e-9, 'the typed top line reaches 275 at the back face');
	});

	it('the side rails sit on the top line, 18 wide and 6 high, from y -8 to y 1068', () => {
		for (const [name, x0, x1] of [['vis_cabinet_rail_l', BODY.x0, BODY.x0 + RAIL.w], ['vis_cabinet_rail_r', BODY.x1 - RAIL.w, BODY.x1]] as const) {
			const vertices = cabinetVertices(glb, name);
			expectBox(boxOf(vertices), [x0, x1], [RAIL.y0, RAIL.y1], [topLineZ(RAIL.y0), topLineZ(RAIL.y1) + RAIL.h], name);
			for (const v of vertices) {
				const above = v.z - topLineZ(v.y);
				expect(Math.min(Math.abs(above), Math.abs(above - RAIL.h)), `${name} vertex (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}): on the top line or 6 above it`).toBeLessThanOrEqual(FIT_TOL);
			}
		}
	});

	it('the lockdown bar, the legs and the arch panel', () => {
		expectBox(boxOf(cabinetVertices(glb, 'vis_lockbar')), [LOCKBAR.x0, LOCKBAR.x1], [LOCKBAR.y0, LOCKBAR.y1], [LOCKBAR.z0, LOCKBAR.z1], 'vis_lockbar');
		expectClose(LOCKBAR.z1 - FLOOR_Z, 910, 1e-9, 'the typed lockdown bar top is 910 above the typed floor');

		const legs = cabinetVertices(glb, 'vis_legs');
		expectValues(distinct(legs, 'x'), [BODY.x0 - LEG.proud, BODY.x0 - LEG.proud + LEG.side, BODY.x1 + LEG.proud - LEG.side, BODY.x1 + LEG.proud], FIT_TOL, 'vis_legs distinct x (four legs, 36 square, 4 proud)');
		expectValues(distinct(legs, 'y'), [BODY.y0 - LEG.proud, BODY.y0 - LEG.proud + LEG.side, BODY.y1 + LEG.proud - LEG.side, BODY.y1 + LEG.proud], FIT_TOL, 'vis_legs distinct y');
		expectValues(distinct(legs, 'z'), [FLOOR_Z, LEG.top], FIT_TOL, 'vis_legs distinct z (floor to leg top)');

		expectBox(boxOf(cabinetVertices(glb, 'vis_cabinet_arch')), [ARCH.x0, ARCH.x1], [ARCH.y0, ARCH.y1], [ARCH.z0, ARCH.z1], 'vis_cabinet_arch');
	});

	it('the glass\'s lower face lies on z = 66.10 + (205/1400) y, with its rear lower edge at y 1066.0 and x from -9.3 to 523.7', () => {
		const glass = glassFrame(glb);
		const lower = glass.vertices.filter((v) => Math.abs(dot(glass.normal, v) - glass.lowerD) <= FIT_TOL);
		expect(lower.length, 'non-vacuity: vertices on the lower face').toBeGreaterThanOrEqual(4);
		for (const v of lower) {
			expectClose(v.z, GLASS.lowerZ0 + TOP_LINE_SLOPE * v.y, FIT_TOL, `lower-face vertex at y ${v.y.toFixed(3)}`);
		}
		const lowerBox = boxOf(lower);
		expectClose(lowerBox.max.y, GLASS.rearY, FIT_TOL, 'the rear lower edge');
		expectClose(lowerBox.min.y, GLASS.frontLowerY, 0.5, 'the front lower edge (near y -15.5)');
		expectClose(lowerBox.min.x, GLASS.x0, FIT_TOL, 'the glass\'s left edge');
		expectClose(lowerBox.max.x, GLASS.x1, FIT_TOL, 'the glass\'s right edge');
		expectClose(GLASS.lowerZ0, topLineZ(0) - 8, 1e-9, 'the typed lower face is 8 below the typed top line');
	});

	it('the backbox: a 12-walled open-front box, closed by the speaker panel and the translite, with the lightbox panel inside', () => {
		const head = cabinetVertices(glb, 'vis_head');
		expectBox(boxOf(head), [HEAD.x0, HEAD.x1], [HEAD.y0, HEAD.y1], [HEAD.z0, HEAD.z1], 'vis_head');
		expectValues(distinct(head, 'x'), [HEAD.x0, HEAD.x0 + HEAD.wall, HEAD.x1 - HEAD.wall, HEAD.x1], FIT_TOL, 'vis_head distinct x');
		expectValues(distinct(head, 'z'), [HEAD.z0, HEAD.z0 + HEAD.wall, HEAD.z1 - HEAD.wall, HEAD.z1], FIT_TOL, 'vis_head distinct z');
		expectValues(distinct(head, 'y'), [HEAD.y0, HEAD.y1 - HEAD.wall, HEAD.y1], FIT_TOL, 'vis_head distinct y (open front, 12 mm back)');
		for (const [name, part] of [['vis_head_panel', PANEL], ['vis_head_translite', TRANSLITE], ['vis_head_lightbox', LIGHTBOX]] as const) {
			expectBox(boxOf(cabinetVertices(glb, name)), [part.x0, part.x1], [part.y0, part.y1], [part.z0, part.z1], name);
		}
		// The speaker panel's front face is 0.2 mm behind vis_backbox's back face.
		const quad = boxOf(cabinetVertices(glb, BACKBOX));
		expectClose(PANEL.y0 - quad.max.y, 0.2, FIT_TOL, 'the gap between vis_backbox\'s back face and the speaker panel\'s front face');
	});

	it('the three lamp Empties are at their authored positions, named exactly as TABLE.giChannels\' keys', () => {
		expect(Object.keys(LAMP_POS).sort(), 'the typed lamp table covers every channel').toEqual(Object.keys(TABLE.giChannels).sort());
		for (const channel of Object.keys(TABLE.giChannels)) {
			const node = glb.doc.nodes[indexOfNode(glb.doc, channel)]!;
			expect(node.translation, `${channel}: a translation`).toBeDefined();
			const at = glbToTable({ x: node.translation![0]!, y: node.translation![1]!, z: node.translation![2]! });
			const expected = LAMP_POS[channel]!;
			expectClose(at.x, expected[0], FIT_TOL, `${channel} x`);
			expectClose(at.y, expected[1], FIT_TOL, `${channel} y`);
			expectClose(at.z, expected[2], FIT_TOL, `${channel} z`);
		}
	});
});

// ---------------------------------------------------------------------------
// AC 2.
// ---------------------------------------------------------------------------

describe('Story 5.3 AC 2 -- the playfield fits the cabinet at every allowed pitch, and the Backglass stays clear', () => {
	it('the three pitches are the tuning bounds and the reference pitch', () => {
		expect([TUNING.pitchMinDeg.value, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg.value]).toEqual([...PITCHES_DEG]);
	});

	it('the tub and the pivot the fit is measured against are the fit table\'s own', () => {
		const tub = measureTub(glb);
		expectClose(tub.innerX0, -13.8, FIT_TOL, 'the left wall\'s inner face');
		expectClose(tub.innerX1, 528.2, FIT_TOL, 'the right wall\'s inner face');
		expectClose(tub.frontInnerY, -10, FIT_TOL, 'the front wall\'s inner face');
		expectClose(tub.archFrontY, 1075, FIT_TOL, 'the arch panel\'s front face');
		const pivot = glb.doc.nodes[indexOfNode(glb.doc, PIVOT_PITCH)]!.translation!;
		const at = glbToTable({ x: pivot[0]!, y: pivot[1]!, z: pivot[2]! });
		expectClose(at.x, CENTRE_X, FIT_TOL, 'pivot_pitch x');
		expectClose(at.y, 0, FIT_TOL, 'pivot_pitch y');
		expectClose(at.z, 0, FIT_TOL, 'pivot_pitch z');
		for (const root of [CABINET_ROOT, PLAYFIELD_ROOT]) {
			const node = glb.doc.nodes[indexOfNode(glb.doc, root)]!;
			expect([node.translation, node.rotation, node.scale, node.matrix], `${root} is authored at the identity`).toEqual([undefined, undefined, undefined, undefined]);
		}
	});

	// mutation: give the vis_top_glass node a translation of 30 mm downward in
	// the glb JSON chunk -> red here (clearance below 5 mm).
	it.each(PITCHES_DEG)('at %s degrees every playfield vertex is at least 5 mm below the glass, between the side walls, in front of the arch panel and (the plunger apart) behind the front wall', (pitchDeg) => {
		const fit = playfieldFit(glb, pitchDeg);
		expect(fit.meshes, 'non-vacuity: meshes under playfield_root').toBeGreaterThan(100);
		expect(fit.vertices, 'non-vacuity: playfield vertices checked').toBeGreaterThan(20000);
		expect(fit.plungerVertices, 'non-vacuity: the plunger exemption covers real vertices').toBeGreaterThan(0);
		expect(fit.plungerVertices, 'the exemption is the plunger alone, not the table').toBeLessThan(fit.vertices / 20);
		expect(fit.problems, fit.problems.join('; ')).toEqual([]);
		expect(fit.minGlassClearanceMm, 'the tightest clearance under the glass').toBeGreaterThanOrEqual(GLASS_CLEARANCE);
	});

	it('the fit check is falsifiable: a glass lowered 30 mm, a body narrowed by a moved wall and an arch panel pulled forward are each reported', () => {
		const translate = (name: string, tableDelta: Vec3) => (doc: GltfDocument): void => {
			// table (dx, dy, dz) mm -> glb (dx, dz, -dy) m: the inverse of glbToTable().
			doc.nodes[indexOfNode(doc, name)]!.translation = [tableDelta.x / 1000, tableDelta.z / 1000, -tableDelta.y / 1000];
		};
		const lowered = playfieldFit(withDoc(glb, translate('vis_top_glass', { x: 0, y: 0, z: -30 })), 8.5);
		expect(lowered.problems.length, 'a glass 30 mm lower touches the table at 8.5 degrees').toBeGreaterThan(0);
		expect(lowered.problems[0]).toMatch(/below the glass's lower face/);
		expect(lowered.minGlassClearanceMm).toBeLessThan(GLASS_CLEARANCE);

		const shifted = playfieldFit(withDoc(glb, translate('vis_cabinet', { x: 1, y: 0, z: 0 })), 6.5);
		expect(shifted.problems.join('; '), 'a body moved 1 mm across puts the wall art through a side wall').toMatch(/not between the side walls' inner faces/);

		const pulled = playfieldFit(withDoc(glb, translate('vis_cabinet_arch', { x: 0, y: -5, z: 0 })), 6.0);
		expect(pulled.problems.join('; '), 'an arch panel 5 mm nearer meets the playfield\'s far wall at 6.0 degrees').toMatch(/not in front of the arch panel's front face/);

		const forward = playfieldFit(withDoc(glb, translate('vis_cabinet', { x: 0, y: 4, z: 0 })), 8.5);
		expect(forward.problems.join('; '), 'a body moved 4 mm up-table puts its front wall through the lane wall at 8.5 degrees').toMatch(/not behind the front wall's inner face/);
	});

	it('all eight corners of vis_backbox are at least 10 mm above the glass\'s upper face, inside the speaker panel\'s outline, and in front of its front face', () => {
		const { corners, problems } = backglassProblems(glb);
		expect(corners, 'non-vacuity: the quad\'s eight corners').toBe(8);
		expect(problems, problems.join('; ')).toEqual([]);
		// Falsifiable: a glass raised 20 mm comes within 10 mm of the quad.
		const raised = backglassProblems(withDoc(glb, (doc) => {
			doc.nodes[indexOfNode(doc, 'vis_top_glass')]!.translation = [0, 0.02, 0];
		}));
		expect(raised.problems.join('; ')).toMatch(/above the glass's upper face/);
	});
});

// ---------------------------------------------------------------------------
// AC 3.
// ---------------------------------------------------------------------------

describe('Story 5.3 AC 3 -- vis_ only, contract kept', () => {
	it('vis-names.ts names exactly the eleven cabinet meshes', () => {
		expect([...VIS_CABINET_NODE_NAMES]).toEqual(CABINET_NODES.map((n) => n.name));
		expect(Object.isFrozen(VIS_CABINET_NODE_NAMES)).toBe(true);
		expect(OBJECTS, 'the five objects are the direct children among them').toEqual(CABINET_NODES.filter((n) => n.parent === CABINET_ROOT).map((n) => n.name));
	});

	// mutation: rename vis_top_glass to vis_glass in the glb JSON chunk -> red here.
	it('the eleven meshes and three lamp Empties exist exactly once each, with their parents, materials, lg_cabinet, both UV sets and no node transform; nothing else is under cabinet_root; no node is named vis_glass', () => {
		expect(Object.keys(TABLE.giChannels).length, 'non-vacuity: three architectural channels').toBe(3);
		expect(nodeContractProblems(glb)).toEqual([]);
	});

	it('the node check is falsifiable: a renamed glass, a re-parented rail, a moved leg node, a lamp given a mesh and an extra child are each reported', () => {
		const renamed = nodeContractProblems(withDoc(glb, (doc) => {
			doc.nodes[indexOfNode(doc, 'vis_top_glass')]!.name = 'vis_glass';
		})).join('; ');
		expect(renamed).toMatch(/vis_top_glass: 0 nodes/);
		expect(renamed).toMatch(/named vis_glass/);

		const reparented = nodeContractProblems(withDoc(glb, (doc) => {
			const rail = indexOfNode(doc, 'vis_cabinet_rail_l');
			const body = doc.nodes[indexOfNode(doc, 'vis_cabinet')]!;
			body.children = body.children!.filter((c) => c !== rail);
			doc.nodes[indexOfNode(doc, CABINET_ROOT)]!.children!.push(rail);
		})).join('; ');
		expect(reparented).toMatch(/vis_cabinet_rail_l: parent cabinet_root, expected vis_cabinet/);

		const moved = nodeContractProblems(withDoc(glb, (doc) => {
			doc.nodes[indexOfNode(doc, 'vis_legs')]!.translation = [0, 0.001, 0];
		})).join('; ');
		expect(moved).toMatch(/vis_legs: carries a node translation/);

		const meshed = nodeContractProblems(withDoc(glb, (doc) => {
			doc.nodes[indexOfNode(doc, Object.keys(TABLE.giChannels)[0]!)]!.mesh = 0;
		})).join('; ');
		expect(meshed).toMatch(/a lamp Empty carries no mesh/);

		const extra = nodeContractProblems(withDoc(glb, (doc) => {
			doc.nodes.push({ name: 'vis_coin_door' });
			doc.nodes[indexOfNode(doc, CABINET_ROOT)]!.children!.push(doc.nodes.length - 1);
		})).join('; ');
		expect(extra).toMatch(/cabinet_root holds \[.*vis_coin_door/);
	});

	it('vis_backbox is untouched: its POSITION bounds, its parent, its material and its lack of children', () => {
		const index = indexOfNode(glb.doc, BACKBOX);
		const node = glb.doc.nodes[index]!;
		expect(node.children, 'vis_backbox has no child').toBeUndefined();
		expect(glb.doc.nodes[parentIndexMap(glb.doc).get(index)!]!.name).toBe(CABINET_ROOT);
		expect([node.translation, node.rotation, node.scale, node.matrix]).toEqual([undefined, undefined, undefined, undefined]);
		expect(node.extras?.lightgroup).toBe(CABINET_LIGHTGROUP);
		expect(materialNames(glb.doc, node)).toEqual([BACKBOX_MATERIAL]);
		const position = glb.doc.accessors[glb.doc.meshes[node.mesh!]!.primitives[0]!.attributes.POSITION!]!;
		const expectedMin = [0.0572, 0.25, -1.0678];
		const expectedMax = [0.4572, 0.35, -1.0668];
		for (let k = 0; k < 3; k++) {
			expectClose(position.min![k]!, expectedMin[k]!, 1e-6, `vis_backbox POSITION min[${k}] (glb metres)`);
			expectClose(position.max![k]!, expectedMax[k]!, 1e-6, `vis_backbox POSITION max[${k}] (glb metres)`);
		}
		expect(position.count, 'the quad is still a six-face box').toBe(24);
	});

	it('each cabinet material is colour and roughness only, used by exactly its own meshes; mat_backbox is used by vis_backbox alone', () => {
		const usedBy = new Map<string, string[]>();
		for (const node of glb.doc.nodes) {
			if (node.mesh === undefined) {
				continue;
			}
			for (const material of materialNames(glb.doc, node)) {
				usedBy.set(material, [...(usedBy.get(material) ?? []), node.name!]);
			}
		}
		for (const [name, expected] of Object.entries(CABINET_MATERIALS)) {
			const matches = glb.doc.materials.filter((m) => m.name === name);
			expect(matches.length, `${name}: exactly one material`).toBe(1);
			const material = matches[0]!;
			const pbr = material.pbrMetallicRoughness;
			expect(pbr?.baseColorFactor, `${name}: base colour written (not pure white)`).toBeDefined();
			expected.rgb.forEach((channel, k) => expectClose(pbr!.baseColorFactor![k]!, channel, MATERIAL_TOL, `${name} base colour[${k}]`));
			expect(pbr!.baseColorFactor![3], `${name}: exported opaque (alpha 1) -- transparency is set in presentation`).toBe(1);
			expect(pbr!.roughnessFactor, `${name}: roughness written (not 1.0)`).toBeDefined();
			expectClose(pbr!.roughnessFactor!, expected.roughness, MATERIAL_TOL, `${name} roughness`);
			expect(pbr!.metallicFactor, `${name}: metallic 0`).toBe(0);
			expect(material.alphaMode ?? 'OPAQUE', `${name}: exported opaque`).toBe('OPAQUE');
			for (const texture of [pbr!.baseColorTexture, pbr!.metallicRoughnessTexture, material.normalTexture, material.emissiveTexture, material.occlusionTexture, material.extensions]) {
				expect(texture, `${name}: no texture or extension`).toBeUndefined();
			}
			expect((usedBy.get(name) ?? []).sort(), `${name}: used by`).toEqual(CABINET_NODES.filter((n) => n.material === name).map((n) => n.name).sort());
		}
		expect(Object.keys(CABINET_MATERIALS).sort(), 'the typed materials are the ones the typed nodes use').toEqual([...new Set(CABINET_NODES.map((n) => n.material))].sort());
		for (const single of ['mat_art_glass', 'mat_art_head_panel', 'mat_art_translite', 'mat_art_lightbox']) {
			expect(usedBy.get(single)?.length, `${single}: used by exactly one mesh`).toBe(1);
		}
		expect(usedBy.get(BACKBOX_MATERIAL), 'no other mesh uses mat_backbox').toEqual([BACKBOX]);
	});

	it('the glb still holds one image, one texture and no extension', () => {
		expect((glb.doc.images ?? []).map((i) => i.name)).toEqual(['img_playfield_translucency']);
		expect((glb.doc.textures ?? []).length).toBe(1);
		expect(glb.doc.extensionsUsed, 'no extensionsUsed').toBeUndefined();
		expect(glb.doc.extensionsRequired, 'no extensionsRequired').toBeUndefined();
	});

	it('no cabinet name reaches the collision document, and col_glass is still the physics ceiling at z 400', () => {
		const collision = JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as { nodes: Array<{ name: string; bboxMm: { min: Vec3; max: Vec3 } }>; switchZones: Array<{ name: string }>; devices: Array<{ name: string }> };
		const names = [...collision.nodes, ...collision.switchZones, ...collision.devices].map((n) => n.name);
		expect(names.length, 'non-vacuity: the collision document has nodes').toBeGreaterThan(100);
		const cabinetNames = new Set([...CABINET_NODES.map((n) => n.name), ...Object.keys(TABLE.giChannels), 'vis_glass']);
		expect(names.filter((n) => cabinetNames.has(n) || n.startsWith('vis_'))).toEqual([]);
		const ceiling = collision.nodes.filter((n) => n.name === TABLE.nodes.colGlass);
		expect(ceiling.length, 'col_glass is in the collision document').toBe(1);
		expectClose(ceiling[0]!.bboxMm.min.z, 400, 0.01, 'col_glass lower face');
		expect(indicesNamed(glb.doc, TABLE.nodes.colGlass), 'col_glass never reaches the glb').toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC 10.
// ---------------------------------------------------------------------------

describe('Story 5.3 AC 10 -- attribution and budget', () => {
	// mutation: remove the Story 5.3 sentence from the glb row of ATTRIBUTIONS.md -> red here.
	it('the .blend and glb rows of ATTRIBUTIONS.md each carry a Story 5.3 note naming Claude Code, Blender 5.2.1 and its date', () => {
		const lines = readFileSync(ATTRIBUTIONS_PATH, 'utf8').replace(/\r\n/g, '\n').split('\n');
		for (const prefix of ['| `assets/src/dragonwar.blend` ', '| `public/assets/dragonwar.glb` ']) {
			const rows = lines.filter((line) => line.startsWith(prefix));
			expect(rows.length, `one row starting "${prefix}"`).toBe(1);
			const row = rows[0]!;
			const at = row.indexOf('Story 5.3 (');
			expect(at, `${prefix}: a "Story 5.3 (" note`).toBeGreaterThan(-1);
			// The note runs to the next story's note, or to the end of the cell.
			const next = row.slice(at + 1).search(/Story \d+\.\d+[a-z]? \(\d{4}-/);
			const note = next < 0 ? row.slice(at) : row.slice(at, at + 1 + next);
			expect(note, `${prefix}: names the tool`).toContain('Claude Code');
			expect(note, `${prefix}: names Blender's version`).toContain('Blender 5.2.1');
			const date = /^Story 5\.3 \((\d{4}-\d{2}-\d{2})\)/.exec(note)?.[1];
			expect(date, `${prefix}: the note is dated`).toBeDefined();
			expect(note, `${prefix}: says nothing is copied or traced from a commercial machine`).toMatch(/nothing is copied or traced from a commercial machine/);
			expect(note, `${prefix}: says no third-party asset is added`).toMatch(/no third-party asset, texture, image, font or glTF extension is added/);
			expect(note, `${prefix}: says the collision document is unchanged`).toMatch(/the collision document(?: \(`[^`]+`\))? is unchanged/);
			// The row's Date cell (the third) reaches the note's own date.
			const dateCell = row.split('|')[3]!.trim();
			expect(dateCell.endsWith(date!), `${prefix}: the Date cell "${dateCell}" ends at ${date}`).toBe(true);
		}
	});

	it('ATTRIBUTIONS.md\'s third-party Assets table is still empty', () => {
		const text = readFileSync(ATTRIBUTIONS_PATH, 'utf8').replace(/\r\n/g, '\n');
		const start = text.indexOf('\n## Assets\n');
		expect(start, 'an "## Assets" section').toBeGreaterThanOrEqual(0);
		const end = text.indexOf('\n## ', start + 1);
		const section = text.slice(start, end < 0 ? undefined : end).split('\n').map((line) => line.trim());
		const header = section.findIndex((line) => line.startsWith('| Asset |'));
		expect(header, 'non-vacuity: the Assets table header').toBeGreaterThanOrEqual(0);
		expect(section.slice(header + 2).filter((line) => line.startsWith('|')), 'third-party asset rows').toEqual([]);
	});

	// mutation: set the count of vis_legs' index accessor to 6003 in the glb JSON chunk -> red here.
	it('each of the five objects, with its descendants, has at most 2,000 triangles in one primitive per mesh', () => {
		let meshes = 0;
		for (const object of OBJECTS) {
			const count = triangleCount(glb, object);
			meshes += count.meshes;
			expect(count.triangles, `${object}: triangles`).toBeGreaterThan(0);
			expect(Number.isInteger(count.triangles), `${object}: whole triangles`).toBe(true);
			expect(count.triangles, `${object}: ${count.triangles} triangles (budget ${TRIANGLE_BUDGET})`).toBeLessThanOrEqual(TRIANGLE_BUDGET);
		}
		expect(meshes, 'the five objects and their children are the eleven meshes').toBe(CABINET_NODES.length);
		// Falsifiable: 6003 indices on the legs is 2001 triangles.
		const heavy = withDoc(glb, (doc) => {
			const legs = doc.nodes[indexOfNode(doc, 'vis_legs')]!;
			doc.accessors[doc.meshes[legs.mesh!]!.primitives[0]!.indices!]!.count = 6003;
		});
		expect(triangleCount(heavy, 'vis_legs').triangles).toBeGreaterThan(TRIANGLE_BUDGET);
	});
});
