// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.2 -- shared reading of the generated playfield texture, from the
// EXPORTED glb only: `mat_playfield`'s base-colour image (its PNG decoded
// with `node:zlib` alone, no new dependency), and the table-mm position of
// every texel centre, derived from `vis_playfield`'s own top-face UVs. Used
// by test/playfield-art.test.ts (the mask, the UV mapping, the art rules),
// test/mechanism-art.test.ts (the art parts' ring legibility) and
// test/placeholder-geometry.test.ts (`vis_dragon`'s ring legibility), so the
// three read one derivation rather than three copies.
//
// Nothing here reads `tools/make-placeholder-blend.py`: the mapping is
// recovered from the glb's vertices and texture coordinates, so a change to
// the generator's UV or image layout is caught, not assumed.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { glbToTable } from '../../src/sim/table/frames';
import { TABLE } from '../../src/sim/table/dragonwar';

export const GLB_PATH = path.resolve(__dirname, '..', '..', 'public', 'assets', 'dragonwar.glb');

export interface Pt {
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
}
interface GltfPrimitive {
	readonly attributes: Record<string, number>;
	readonly indices?: number;
	readonly material?: number;
}
export interface GltfDoc {
	readonly nodes: readonly GltfNode[];
	readonly meshes: ReadonlyArray<{ readonly primitives: readonly GltfPrimitive[] }>;
	readonly accessors: ReadonlyArray<{ readonly bufferView?: number; readonly byteOffset?: number; readonly componentType: number; readonly count: number; readonly type: string }>;
	readonly bufferViews: ReadonlyArray<{ readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number }>;
	readonly materials: ReadonlyArray<{
		readonly name?: string;
		readonly alphaMode?: string;
		readonly pbrMetallicRoughness?: { readonly baseColorFactor?: readonly number[]; readonly baseColorTexture?: { readonly index: number; readonly texCoord?: number } };
	}>;
	readonly textures?: ReadonlyArray<{ readonly source?: number; readonly sampler?: number }>;
	readonly images?: ReadonlyArray<{ readonly name?: string; readonly bufferView?: number; readonly mimeType?: string; readonly uri?: string }>;
	readonly extensionsUsed?: readonly string[];
	readonly extensionsRequired?: readonly string[];
}

export interface GlbChunks {
	readonly doc: GltfDoc;
	readonly bin: Buffer;
}

export function readGlbChunks(bytes: Buffer = readFileSync(GLB_PATH)): GlbChunks {
	if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(16) !== 0x4e4f534a) {
		throw new Error('playfield-texture: not a glb with a leading JSON chunk');
	}
	const jsonLength = bytes.readUInt32LE(12);
	const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GltfDoc;
	const binHeader = 20 + jsonLength;
	if (bytes.readUInt32LE(binHeader + 4) !== 0x004e4942) {
		throw new Error('playfield-texture: the glb has no BIN chunk');
	}
	return { doc, bin: bytes.subarray(binHeader + 8, binHeader + 8 + bytes.readUInt32LE(binHeader)) };
}

const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

export function readAccessor(glb: GlbChunks, index: number): number[][] {
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

export function nodeIndex(doc: GltfDoc, name: string): number {
	const matches = doc.nodes.map((n, i) => (n.name === name ? i : -1)).filter((i) => i >= 0);
	if (matches.length !== 1) {
		throw new Error(`playfield-texture: the glb carries ${matches.length} nodes named "${name}", not exactly one`);
	}
	return matches[0]!;
}

function rotate(q: readonly number[], v: readonly number[]): number[] {
	const [qx, qy, qz, qw] = q as [number, number, number, number];
	const [vx, vy, vz] = v as [number, number, number];
	const tx = 2 * (qy * vz - qz * vy);
	const ty = 2 * (qz * vx - qx * vz);
	const tz = 2 * (qx * vy - qy * vx);
	return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

/** Carries a point in node `index`'s local frame up to `playfield_root`'s local frame (which IS the table frame, in glb metres), through every TRS on the way. */
export function toRootFrame(doc: GltfDoc, index: number, p: readonly number[]): number[] {
	const rootIndex = nodeIndex(doc, TABLE.nodes.playfieldRoot);
	const parents = new Map<number, number>();
	doc.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parents.set(c, i)));
	let q = p.slice();
	let at = index;
	while (at !== rootIndex) {
		const node = doc.nodes[at]!;
		const s = node.scale ?? [1, 1, 1];
		const r = node.rotation ?? [0, 0, 0, 1];
		const t = node.translation ?? [0, 0, 0];
		const rotated = rotate(r, [q[0]! * s[0]!, q[1]! * s[1]!, q[2]! * s[2]!]);
		q = [rotated[0]! + t[0]!, rotated[1]! + t[1]!, rotated[2]! + t[2]!];
		const parent = parents.get(at);
		if (parent === undefined) {
			throw new Error(`playfield-texture: node ${doc.nodes[index]!.name} does not descend from ${TABLE.nodes.playfieldRoot}`);
		}
		at = parent;
	}
	return q;
}

// ---------------------------------------------------------------------------
// PNG decoding (node:zlib only): 8-bit RGBA, non-interlaced -- the only form
// the generator writes; anything else throws rather than mis-reading.
// ---------------------------------------------------------------------------

export interface DecodedPng {
	readonly width: number;
	readonly height: number;
	/** Row-major, top row first, 4 bytes per texel. */
	readonly rgba: Uint8Array;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
	const buf = Buffer.from(bytes);
	if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		throw new Error('decodePng: bad PNG signature');
	}
	let at = 8;
	let width = 0;
	let height = 0;
	const idat: Buffer[] = [];
	while (at < buf.length) {
		const length = buf.readUInt32BE(at);
		const kind = buf.subarray(at + 4, at + 8).toString('latin1');
		const body = buf.subarray(at + 8, at + 8 + length);
		if (kind === 'IHDR') {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const [depth, colourType, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
			if (depth !== 8 || colourType !== 6 || interlace !== 0) {
				throw new Error(`decodePng: only 8-bit non-interlaced RGBA is supported (depth ${depth}, colour type ${colourType}, interlace ${interlace})`);
			}
		} else if (kind === 'IDAT') {
			idat.push(body);
		} else if (kind === 'IEND') {
			break;
		}
		at += 12 + length;
	}
	const bpp = 4;
	const stride = width * bpp;
	const raw = inflateSync(Buffer.concat(idat));
	if (raw.length !== height * (stride + 1)) {
		throw new Error(`decodePng: ${raw.length} inflated bytes for ${width}x${height}`);
	}
	const out = new Uint8Array(height * stride);
	for (let row = 0; row < height; row++) {
		const filter = raw[row * (stride + 1)]!;
		const src = row * (stride + 1) + 1;
		const dst = row * stride;
		for (let i = 0; i < stride; i++) {
			const x = raw[src + i]!;
			const a = i >= bpp ? out[dst + i - bpp]! : 0;
			const b = row > 0 ? out[dst - stride + i]! : 0;
			const c = row > 0 && i >= bpp ? out[dst - stride + i - bpp]! : 0;
			let predicted: number;
			switch (filter) {
				case 0: predicted = 0; break;
				case 1: predicted = a; break;
				case 2: predicted = b; break;
				case 3: predicted = (a + b) >> 1; break;
				case 4: {
					const p = a + b - c;
					const pa = Math.abs(p - a);
					const pb = Math.abs(p - b);
					const pc = Math.abs(p - c);
					predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
					break;
				}
				default: throw new Error(`decodePng: unknown filter ${filter} on row ${row}`);
			}
			out[dst + i] = (x + predicted) & 0xff;
		}
	}
	return { width, height, rgba: out };
}

export function srgbToLinear(byte: number): number {
	const c = byte / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// ---------------------------------------------------------------------------
// The playfield texture and its table mapping.
// ---------------------------------------------------------------------------

/** `u = a + b*x + c*y` (table mm -> glTF texture coordinate). */
export interface AffineUv {
	readonly a: number;
	readonly b: number;
	readonly c: number;
}

export interface PlayfieldTexture {
	readonly glb: GlbChunks;
	readonly imageIndex: number;
	readonly pngBytes: Buffer;
	readonly png: DecodedPng;
	/** The vis_playfield top-face vertices (table mm) and their TEXCOORD_n, read from the glb. */
	readonly topFace: ReadonlyArray<{ readonly pos: { x: number; y: number; z: number }; readonly uv: readonly [number, number] }>;
	readonly u: AffineUv;
	readonly v: AffineUv;
	/** One texel's size in table mm, per axis. */
	readonly texelMm: Pt;
	/** Table mm of texel (col, row)'s centre -- row 0 is the PNG's first row (glTF v = 0). */
	texelCentreMm(col: number, row: number): Pt;
	alpha(col: number, row: number): number;
	/** Linear RGB of texel (col, row). */
	linear(col: number, row: number): [number, number, number];
	/** The (inclusive) col/row ranges whose centres can fall inside a table-mm rectangle. */
	texelRange(minMm: Pt, maxMm: Pt): { col0: number; col1: number; row0: number; row1: number };
}

function solveAffine(points: ReadonlyArray<{ x: number; y: number; w: number }>): AffineUv {
	// Three non-collinear points fix u = a + b x + c y.
	const [p, q, r] = points as [{ x: number; y: number; w: number }, { x: number; y: number; w: number }, { x: number; y: number; w: number }];
	const det = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
	const b = ((q.w - p.w) * (r.y - p.y) - (r.w - p.w) * (q.y - p.y)) / det;
	const c = ((q.x - p.x) * (r.w - p.w) - (r.x - p.x) * (q.w - p.w)) / det;
	return { a: p.w - b * p.x - c * p.y, b, c };
}

export function loadPlayfieldTexture(bytes?: Buffer): PlayfieldTexture {
	const glb = readGlbChunks(bytes);
	const { doc } = glb;
	const material = doc.materials.find((m) => m.name === 'mat_playfield');
	const textureRef = material?.pbrMetallicRoughness?.baseColorTexture;
	if (!textureRef) {
		throw new Error('playfield-texture: mat_playfield carries no baseColorTexture');
	}
	const imageIndex = doc.textures![textureRef.index]!.source!;
	const image = doc.images![imageIndex]!;
	const view = doc.bufferViews[image.bufferView!]!;
	const pngBytes = glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
	const png = decodePng(pngBytes);

	const playfield = nodeIndex(doc, 'vis_playfield');
	const primitive = doc.meshes[doc.nodes[playfield]!.mesh!]!.primitives[0]!;
	const texCoord = `TEXCOORD_${textureRef.texCoord ?? 0}`;
	const positions = readAccessor(glb, primitive.attributes.POSITION!);
	const normals = readAccessor(glb, primitive.attributes.NORMAL!);
	const uvs = readAccessor(glb, primitive.attributes[texCoord]!);
	const table = positions.map((p) => {
		const q = toRootFrame(doc, playfield, p);
		return glbToTable({ x: q[0]!, y: q[1]!, z: q[2]! });
	});
	const topZ = Math.max(...table.map((p) => p.z));
	// The top face: the vertices on the top plane whose normal is table +Z (glb +Y).
	const topFace = table
		.map((pos, i) => ({ pos, uv: [uvs[i]![0]!, uvs[i]![1]!] as const, up: normals[i]![1]! }))
		.filter((vtx) => Math.abs(vtx.pos.z - topZ) < 1e-3 && vtx.up > 0.99)
		.map(({ pos, uv }) => ({ pos, uv }));
	if (topFace.length < 3) {
		throw new Error(`playfield-texture: vis_playfield's top face has ${topFace.length} vertices`);
	}
	// Three corners that are not collinear: the min-x/min-y one, the max-x
	// one, and the max-y one.
	const byXY = [...topFace].sort((m, n) => m.pos.x + m.pos.y - (n.pos.x + n.pos.y));
	const origin = byXY[0]!;
	const far = byXY[byXY.length - 1]!;
	const third = topFace.reduce((best, vtx) => {
		const area = (m: typeof vtx): number => Math.abs((far.pos.x - origin.pos.x) * (m.pos.y - origin.pos.y) - (m.pos.x - origin.pos.x) * (far.pos.y - origin.pos.y));
		return area(vtx) > area(best) ? vtx : best;
	});
	const pick = (k: 0 | 1): AffineUv => solveAffine([origin, far, third].map((vtx) => ({ x: vtx.pos.x, y: vtx.pos.y, w: vtx.uv[k] })));
	const u = pick(0);
	const v = pick(1);
	// The inverse below assumes an axis-aligned map (u of x only, v of y
	// only); test/playfield-art.test.ts asserts exactly that from the same
	// derivation, so a skewed uv_base reddens there rather than here.
	const texelMm = { x: Math.abs(1 / (u.b * png.width)), y: Math.abs(1 / (v.c * png.height)) };

	const texelCentreMm = (col: number, row: number): Pt => ({
		x: ((col + 0.5) / png.width - u.a) / u.b,
		y: ((row + 0.5) / png.height - v.a) / v.c,
	});
	const texelRange = (minMm: Pt, maxMm: Pt): { col0: number; col1: number; row0: number; row1: number } => {
		const cols = [minMm.x, maxMm.x].map((x) => (u.a + u.b * x) * png.width - 0.5);
		const rows = [minMm.y, maxMm.y].map((y) => (v.a + v.c * y) * png.height - 0.5);
		return {
			col0: Math.max(0, Math.floor(Math.min(...cols))),
			col1: Math.min(png.width - 1, Math.ceil(Math.max(...cols))),
			row0: Math.max(0, Math.floor(Math.min(...rows))),
			row1: Math.min(png.height - 1, Math.ceil(Math.max(...rows))),
		};
	};
	const at = (col: number, row: number): number => (row * png.width + col) * 4;
	return {
		glb,
		imageIndex,
		pngBytes: Buffer.from(pngBytes),
		png,
		topFace,
		u,
		v,
		texelMm,
		texelCentreMm,
		texelRange,
		alpha: (col, row) => png.rgba[at(col, row) + 3]!,
		linear: (col, row) => {
			const k = at(col, row);
			return [srgbToLinear(png.rgba[k]!), srgbToLinear(png.rgba[k + 1]!), srgbToLinear(png.rgba[k + 2]!)];
		},
	};
}

// ---------------------------------------------------------------------------
// The art ring: the opaque texels 2-12 mm outside a part's footprint(s).
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

/** 0 inside or on the polygon, otherwise the distance to its boundary. */
export function distanceOutsidePolygon(poly: readonly Pt[], p: Pt): number {
	if (pointInPolygon(poly, p)) {
		return 0;
	}
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

export const ART_RING_INNER_MM = 2;
export const ART_RING_OUTER_MM = 12;

/** The mean linear RGB of the OPAQUE texels whose centres lie between `innerMm` and `outerMm` outside the union of `footprints`. */
export function artRingMean(texture: PlayfieldTexture, footprints: ReadonlyArray<readonly Pt[]>, innerMm = ART_RING_INNER_MM, outerMm = ART_RING_OUTER_MM): { mean: [number, number, number]; count: number } {
	const xs = footprints.flatMap((f) => f.map((p) => p.x));
	const ys = footprints.flatMap((f) => f.map((p) => p.y));
	const range = texture.texelRange({ x: Math.min(...xs) - outerMm, y: Math.min(...ys) - outerMm }, { x: Math.max(...xs) + outerMm, y: Math.max(...ys) + outerMm });
	const sum: [number, number, number] = [0, 0, 0];
	let count = 0;
	for (let row = range.row0; row <= range.row1; row++) {
		for (let col = range.col0; col <= range.col1; col++) {
			if (texture.alpha(col, row) !== 255) {
				continue;
			}
			const p = texture.texelCentreMm(col, row);
			const d = Math.min(...footprints.map((f) => distanceOutsidePolygon(f, p)));
			if (d < innerMm || d > outerMm) {
				continue;
			}
			const [r, g, b] = texture.linear(col, row);
			sum[0] += r;
			sum[1] += g;
			sum[2] += b;
			count += 1;
		}
	}
	return { mean: [sum[0] / count, sum[1] / count, sum[2] / count], count };
}
