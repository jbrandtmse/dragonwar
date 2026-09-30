// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.2 (DW-271, DW-4), AC 1, AC 2 (headless half) and AC 3 -- the
// generated playfield texture and the insert lenses, proven from the
// EXPORTED glb only (its JSON and BIN chunks; the PNG decoded with
// `node:zlib`). No Blender, no Babylon, nothing read from
// `tools/make-placeholder-blend.py`'s text.
//
// The rules under test (the spec's Always list):
//   - `vis_playfield`'s `uv_base` top face maps table (x, y) affinely and
//     axis-aligned onto [0, 1]^2 -- derived here from the glb's own top-face
//     corners, and that derived mapping is what locates every texel below;
//     `vis_playfield` keeps TEXCOORD_1, `lg_playfield` and its parent;
//   - the mask: for EVERY `l_` lens node in the exported glb (the set is read
//     from the glb, never a literal list or count -- the author's design
//     constraint: Epic 3 adds inserts after Epic 5 merges, and the
//     generator's lens list opens them automatically), alpha is 0 at every
//     texel whose centre lies inside the lens rectangle inset by 1 texel, and
//     alpha is 255 at every texel whose centre lies at least 1 texel outside
//     every lens rectangle -- so the openings are exactly one per lens;
//   - the lens-coverage checker is a pure function with its own
//     positive/negative pair: a synthetic lens under a solid mask fails,
//     naming it;
//   - one image, PNG <= 524,288 B, no glTF extension; not a flat fill
//     (linear-luminance SD of the opaque texels >= 0.02);
//   - every lens material is LAMP_GRAMMAR[homeRole] x LENS_TINT_LEVEL against
//     the LIVE grammar, metallic 0, no texture.
// The art-ring legibility rule lives with the parts it protects:
// test/mechanism-art.test.ts (flippers, drop targets, Ramp, guides) and
// test/placeholder-geometry.test.ts (`vis_dragon`).
//
// Falsifiability (Rule 19, the spec's Verification section): offsetting the
// `l_top_2` opening by 3 texels reddens the mask case; making the mask pass
// iterate a hard-coded name list minus `l_top_3` reddens it naming
// `l_top_3`; `mat_insert` back at (0.9, 0.9, 0.95) reddens the lens case;
// full-amplitude per-texel noise reddens the byte ceiling; a flat fill
// reddens the not-a-flat-fill case.

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { glbToTable } from '../src/sim/table/frames';
import { LAMP_GRAMMAR } from '../src/presentation/lighting/grammar';
import type { LampName } from '../src/sim/table/names';
import { loadPlayfieldTexture, nodeIndex, readAccessor, toRootFrame, type PlayfieldTexture, type Pt } from './util/playfield-texture';

/** The generator's LENS_TINT_LEVEL (the spec's one constant; the lead's measured envelope). */
const LENS_TINT_LEVEL = 0.08;
/** The spec's per-channel ceiling on an unlit lens: dark. */
const LENS_MAX_CHANNEL = 0.1;
const LENS_COLOUR_TOLERANCE = 1e-3;
/** This story's own byte ceiling for the embedded PNG. */
const PNG_CEILING_BYTES = 524_288;
const IMAGE_W = 512;
const IMAGE_H = 1024;
const MIN_LUMINANCE_SD = 0.02;
const UV_TOLERANCE = 1e-5;
const PLAYFIELD_MM = TABLE.reference.playfieldMm;

/**
 * The role each insert is lit in today (`src/sim/rules/lamps.ts`'s
 * `projectLamp()`: `lane` and `ball_save` subjects project `lit`, `letter`
 * and `lock` subjects project `dragon`) -- the lens's HOME role, keyed by
 * the `TABLE.lamps` subject kind so a new insert of a known kind needs no
 * edit here.
 */
const HOME_ROLE_BY_SUBJECT_KIND = { lane: 'lit', ball_save: 'lit', letter: 'dragon', lock: 'dragon' } as const;
const LENS_MATERIAL_BY_ROLE: Readonly<Record<'lit' | 'dragon', string>> = { lit: 'mat_insert', dragon: 'mat_insert_dragon' };

interface Lens {
	readonly name: string;
	readonly min: Pt;
	readonly max: Pt;
}

/** What the coverage checker needs of a mask: its size, its alpha, and where each texel centre sits on the table. */
interface MaskView {
	readonly png: { readonly width: number; readonly height: number };
	readonly texelMm: Pt;
	alpha(col: number, row: number): number;
	texelCentreMm(col: number, row: number): Pt;
	texelRange(minMm: Pt, maxMm: Pt): { col0: number; col1: number; row0: number; row1: number };
}

const texture = loadPlayfieldTexture();
const { doc } = texture.glb;

/** Every `l_` node in the exported glb and its lens rectangle: the lens is the insert's TOP box (lens over cup), so its rectangle is the bbox of the mesh's highest-z vertices. */
function lensesFromGlb(t: PlayfieldTexture): Lens[] {
	const out: Lens[] = [];
	t.glb.doc.nodes.forEach((node, index) => {
		if (!node.name?.startsWith('l_') || node.mesh === undefined) {
			return;
		}
		const positions = t.glb.doc.meshes[node.mesh]!.primitives.flatMap((p) => readAccessor(t.glb, p.attributes.POSITION!)).map((p) => {
			const q = toRootFrame(t.glb.doc, index, p);
			return glbToTable({ x: q[0]!, y: q[1]!, z: q[2]! });
		});
		const topZ = Math.max(...positions.map((p) => p.z));
		const top = positions.filter((p) => p.z > topZ - 1e-3);
		out.push({
			name: node.name,
			min: { x: Math.min(...top.map((p) => p.x)), y: Math.min(...top.map((p) => p.y)) },
			max: { x: Math.max(...top.map((p) => p.x)), y: Math.max(...top.map((p) => p.y)) },
		});
	});
	return out;
}

/**
 * The lens-coverage checker (pure: lenses and a mask in, failure messages
 * out). A lens fails when some texel whose centre lies inside it (inset by
 * one texel) is not fully open, or when no texel centre lies inside it at
 * all; the mask fails with a stray opening when a texel that lies at least
 * one texel outside EVERY lens is not fully opaque.
 */
function lensMaskFailures(lenses: readonly Lens[], mask: MaskView): string[] {
	const failures: string[] = [];
	const { x: tx, y: ty } = mask.texelMm;
	for (const lens of lenses) {
		const inner = { min: { x: lens.min.x + tx, y: lens.min.y + ty }, max: { x: lens.max.x - tx, y: lens.max.y - ty } };
		const range = mask.texelRange(inner.min, inner.max);
		let inside = 0;
		let closed = 0;
		for (let row = range.row0; row <= range.row1; row++) {
			for (let col = range.col0; col <= range.col1; col++) {
				const p = mask.texelCentreMm(col, row);
				if (p.x < inner.min.x || p.x > inner.max.x || p.y < inner.min.y || p.y > inner.max.y) {
					continue;
				}
				inside += 1;
				if (mask.alpha(col, row) !== 0) {
					closed += 1;
				}
			}
		}
		if (inside === 0) {
			failures.push(`${lens.name}: no texel centre lies inside the lens inset by one texel`);
		} else if (closed > 0) {
			failures.push(`${lens.name}: ${closed} of ${inside} texels inside the lens (inset by one texel) are not open (alpha != 0)`);
		}
	}
	const strays: string[] = [];
	for (let row = 0; row < mask.png.height; row++) {
		for (let col = 0; col < mask.png.width; col++) {
			const a = mask.alpha(col, row);
			if (a === 255) {
				continue;
			}
			const p = mask.texelCentreMm(col, row);
			const nearALens = lenses.some((l) => p.x > l.min.x - tx && p.x < l.max.x + tx && p.y > l.min.y - ty && p.y < l.max.y + ty);
			if (!nearALens) {
				strays.push(`(${col}, ${row}) = table (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) alpha ${a}`);
			}
		}
	}
	if (strays.length > 0) {
		failures.push(`stray opening: ${strays.length} texel(s) at least one texel outside every lens are not opaque, e.g. ${strays.slice(0, 5).join('; ')}`);
	}
	return failures;
}

/** The mask's openings as 4-connected components of non-opaque texels. */
function countOpenings(mask: MaskView): number {
	const { width, height } = mask.png;
	const seen = new Uint8Array(width * height);
	let components = 0;
	for (let start = 0; start < width * height; start++) {
		if (seen[start] || mask.alpha(start % width, Math.floor(start / width)) === 255) {
			continue;
		}
		components += 1;
		const stack = [start];
		seen[start] = 1;
		while (stack.length > 0) {
			const k = stack.pop()!;
			const col = k % width;
			const row = Math.floor(k / width);
			for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
				const c = col + dc;
				const r = row + dr;
				const n = r * width + c;
				if (c >= 0 && c < width && r >= 0 && r < height && !seen[n] && mask.alpha(c, r) !== 255) {
					seen[n] = 1;
					stack.push(n);
				}
			}
		}
	}
	return components;
}

const lenses = lensesFromGlb(texture);

describe('Story 5.2 AC 1 -- vis_playfield: the planar uv_base and the mesh contract', () => {
	it('uv_base maps table (x, y) affinely and axis-aligned onto [0, 1]^2, derived from the glb\'s own top-face corners', () => {
		expect(texture.topFace.length, 'non-vacuity: the top face').toBeGreaterThanOrEqual(4);
		for (const { pos, uv } of texture.topFace) {
			expect(Math.abs(texture.u.a + texture.u.b * pos.x + texture.u.c * pos.y - uv[0]), `u at (${pos.x}, ${pos.y})`).toBeLessThanOrEqual(UV_TOLERANCE);
			expect(Math.abs(texture.v.a + texture.v.b * pos.x + texture.v.c * pos.y - uv[1]), `v at (${pos.x}, ${pos.y})`).toBeLessThanOrEqual(UV_TOLERANCE);
		}
		expect(Math.abs(texture.u.c), 'u depends on x only (axis-aligned)').toBeLessThanOrEqual(1e-9);
		expect(Math.abs(texture.v.b), 'v depends on y only (axis-aligned)').toBeLessThanOrEqual(1e-9);
		// Onto [0, 1]^2: the playfield's own corners map to the unit square's.
		const us = [texture.u.a, texture.u.a + texture.u.b * PLAYFIELD_MM.w].sort((a, b) => a - b);
		const vs = [texture.v.a, texture.v.a + texture.v.c * PLAYFIELD_MM.h].sort((a, b) => a - b);
		expect(us[0]).toBeCloseTo(0, 5);
		expect(us[1]).toBeCloseTo(1, 5);
		expect(vs[0]).toBeCloseTo(0, 5);
		expect(vs[1]).toBeCloseTo(1, 5);
		const corners = texture.topFace.map(({ pos }) => `${pos.x.toFixed(2)},${pos.y.toFixed(2)}`);
		for (const corner of [[0, 0], [PLAYFIELD_MM.w, 0], [0, PLAYFIELD_MM.h], [PLAYFIELD_MM.w, PLAYFIELD_MM.h]]) {
			expect(corners, `the top face reaches the playfield corner (${corner.join(', ')})`).toContain(`${corner[0]!.toFixed(2)},${corner[1]!.toFixed(2)}`);
		}
	});

	it('vis_playfield keeps TEXCOORD_1, lightgroup lg_playfield, its parent playfield_root and one material, mat_playfield (alpha BLEND from the image)', () => {
		const index = nodeIndex(doc, 'vis_playfield');
		const node = doc.nodes[index]!;
		const root = nodeIndex(doc, TABLE.nodes.playfieldRoot);
		expect(doc.nodes[root]!.children, 'a direct child of playfield_root').toContain(index);
		expect((node as { extras?: Record<string, unknown> }).extras?.lightgroup).toBe('lg_playfield');
		const primitives = doc.meshes[node.mesh!]!.primitives;
		expect(primitives.length, 'one material').toBe(1);
		expect(primitives[0]!.attributes.TEXCOORD_1, 'TEXCOORD_1 (uv_lightmap)').toBeDefined();
		const material = doc.materials[primitives[0]!.material!]!;
		expect(material.name).toBe('mat_playfield');
		expect(material.alphaMode).toBe('BLEND');
		expect(material.pbrMetallicRoughness?.baseColorTexture, 'Color drives Base Color from the image').toBeDefined();
		// glTF multiplies the texture by any baseColorFactor: an unlinked Color
		// socket exports the socket default as a factor beside the texture (the
		// pre-5.2 glb carried (0.45, 0.30, 0.15)), tinting the art the texel
		// tests read raw. The factor must be absent or identity.
		const factor = material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
		expect(factor, 'no baseColorFactor tints the art (absent or [1, 1, 1, 1])').toEqual([1, 1, 1, 1]);
	});
});

describe('Story 5.2 AC 1 -- the translucency mask opens exactly at every l_ lens in the exported glb', () => {
	it('every l_ lens node in the glb is a TABLE.lamps insert, and every insert has a lens node (the set is read from the glb)', () => {
		expect(lenses.length, 'non-vacuity: lenses read from the glb').toBeGreaterThan(0);
		expect(lenses.map((l) => l.name).sort()).toEqual(Object.keys(TABLE.lamps).sort());
		for (const lens of lenses) {
			expect(lens.max.x - lens.min.x, `${lens.name}: a real lens rectangle`).toBeGreaterThan(2 * texture.texelMm.x);
			expect(lens.max.y - lens.min.y, `${lens.name}: a real lens rectangle`).toBeGreaterThan(2 * texture.texelMm.y);
		}
	});

	it('the mask rule holds for every lens: alpha 0 inside each lens (inset 1 texel), alpha 255 at least 1 texel outside every lens', () => {
		const failures = lensMaskFailures(lenses, texture);
		expect(failures, failures.join(' | ')).toEqual([]);
	});

	it('the openings are exactly one per lens', () => {
		expect(countOpenings(texture), `one opening per l_ lens (${lenses.length} lenses in the glb)`).toBe(lenses.length);
	});

	// The author's constraint: a lens added later under a mask that was not
	// regenerated must be caught. The checker's own negative -- a synthetic
	// lens where the committed mask is solid -- must fail, naming that lens,
	// while the real lenses beside it still pass.
	it('the coverage checker is falsifiable: a synthetic lens under a solid mask fails naming it; a withheld real lens reads as a stray opening', () => {
		const half = 8;
		// The first spot (scanning out from the playfield centre on a 10 mm
		// grid) where the committed mask is solid under the whole synthetic
		// lens -- never a fixed point, so an insert added later at the centre
		// (Epic 3) moves the synthetic lens instead of breaking the case.
		const solidUnder = (min: { x: number; y: number }, max: { x: number; y: number }): boolean => {
			const r = texture.texelRange(min, max);
			for (let row = r.row0; row <= r.row1; row++) {
				for (let col = r.col0; col <= r.col1; col++) {
					if (texture.alpha(col, row) !== 255) {
						return false;
					}
				}
			}
			return true;
		};
		const candidates: { x: number; y: number }[] = [];
		for (let y = 3 * half; y <= PLAYFIELD_MM.h - 3 * half; y += 10) {
			for (let x = 3 * half; x <= PLAYFIELD_MM.w - 3 * half; x += 10) {
				candidates.push({ x, y });
			}
		}
		candidates.sort((a, b) => Math.hypot(a.x - PLAYFIELD_MM.w / 2, a.y - PLAYFIELD_MM.h / 2) - Math.hypot(b.x - PLAYFIELD_MM.w / 2, b.y - PLAYFIELD_MM.h / 2));
		const centre = candidates.find((c) => solidUnder({ x: c.x - 2 * half, y: c.y - 2 * half }, { x: c.x + 2 * half, y: c.y + 2 * half }));
		expect(centre, 'a solid spot for the synthetic lens exists').toBeDefined();
		const synthetic: Lens = { name: 'l_synthetic_future_insert', min: { x: centre!.x - half, y: centre!.y - half }, max: { x: centre!.x + half, y: centre!.y + half } };
		// Precondition: the committed mask really is solid there.
		const range = texture.texelRange(synthetic.min, synthetic.max);
		let solid = 0;
		for (let row = range.row0; row <= range.row1; row++) {
			for (let col = range.col0; col <= range.col1; col++) {
				expect(texture.alpha(col, row), `precondition: texel (${col}, ${row}) under the synthetic lens`).toBe(255);
				solid += 1;
			}
		}
		expect(solid, 'non-vacuity: texels under the synthetic lens').toBeGreaterThan(100);
		const failures = lensMaskFailures([...lenses, synthetic], texture);
		expect(failures.length, JSON.stringify(failures)).toBe(1);
		expect(failures[0]).toContain('l_synthetic_future_insert');

		const [withheld, ...rest] = lenses;
		const strayFailures = lensMaskFailures(rest, texture);
		expect(strayFailures.length, JSON.stringify(strayFailures)).toBe(1);
		expect(strayFailures[0], `withholding ${withheld!.name} leaves its opening unexplained`).toContain('stray opening');
	});
});

describe('Story 5.2 AC 3 -- one generated image within its byte ceiling, no extension, not a flat fill', () => {
	it('the glb holds exactly one image -- mat_playfield\'s -- a PNG of at most 524,288 B at 512 x 1024, and no glTF extension', () => {
		expect((doc.images ?? []).map((i) => i.name)).toEqual(['img_playfield_translucency']);
		expect(doc.images![0]!.mimeType).toBe('image/png');
		expect(doc.images![0]!.uri, 'embedded, not an external file').toBeUndefined();
		expect((doc.textures ?? []).length).toBe(1);
		expect(texture.imageIndex).toBe(0);
		expect(doc.extensionsUsed, 'no extensionsUsed').toBeUndefined();
		expect(doc.extensionsRequired, 'no extensionsRequired').toBeUndefined();
		expect(texture.pngBytes.length, `the PNG is ${texture.pngBytes.length} B`).toBeLessThanOrEqual(PNG_CEILING_BYTES);
		expect([texture.png.width, texture.png.height]).toEqual([IMAGE_W, IMAGE_H]);
	});

	it('the art is not a flat fill: the linear-luminance SD of the opaque texels is >= 0.02', () => {
		let n = 0;
		let sum = 0;
		let sumSq = 0;
		for (let row = 0; row < texture.png.height; row++) {
			for (let col = 0; col < texture.png.width; col++) {
				if (texture.alpha(col, row) !== 255) {
					continue;
				}
				const [r, g, b] = texture.linear(col, row);
				const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				n += 1;
				sum += l;
				sumSq += l * l;
			}
		}
		expect(n, 'non-vacuity: most texels are opaque').toBeGreaterThan((texture.png.width * texture.png.height) / 2);
		const mean = sum / n;
		const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
		expect(sd, `linear-luminance SD ${sd.toFixed(4)} (mean ${mean.toFixed(4)})`).toBeGreaterThanOrEqual(MIN_LUMINANCE_SD);
	});
});

describe('Story 5.2 AC 2 (DW-271, headless) -- every lens is a dark lens tinted by its home role', () => {
	it('each l_ lens material is LAMP_GRAMMAR[homeRole] x LENS_TINT_LEVEL (the live grammar), metallic 0, no texture', () => {
		const roles = new Set<string>();
		for (const lens of lenses) {
			const node = doc.nodes[nodeIndex(doc, lens.name)]!;
			const primitives = doc.meshes[node.mesh!]!.primitives;
			expect(primitives.length, `${lens.name}: one material`).toBe(1);
			const material = doc.materials[primitives[0]!.material!]! as (typeof doc.materials)[number] & { pbrMetallicRoughness?: { metallicFactor?: number } };
			const subject = TABLE.lamps[lens.name as LampName].subject;
			const role = HOME_ROLE_BY_SUBJECT_KIND[subject.kind];
			roles.add(role);
			expect(material.name, `${lens.name} (${subject.kind}): its home role's lens material`).toBe(LENS_MATERIAL_BY_ROLE[role]);
			const base = material.pbrMetallicRoughness?.baseColorFactor;
			expect(base, `${lens.name}: baseColorFactor`).toBeDefined();
			const grammar = LAMP_GRAMMAR[role];
			[grammar.r, grammar.g, grammar.b].forEach((channel, k) => {
				expect(Math.abs(base![k]! - channel * LENS_TINT_LEVEL), `${lens.name} channel ${k}: ${base![k]} vs LAMP_GRAMMAR.${role} x ${LENS_TINT_LEVEL}`).toBeLessThanOrEqual(LENS_COLOUR_TOLERANCE);
				expect(base![k]!, `${lens.name} channel ${k}: an unlit lens is dark`).toBeLessThanOrEqual(LENS_MAX_CHANNEL);
			});
			expect(material.pbrMetallicRoughness?.metallicFactor, `${lens.name}: metallic 0 (glTF defaults to 1)`).toBe(0);
			expect(material.pbrMetallicRoughness?.baseColorTexture, `${lens.name}: no texture`).toBeUndefined();
		}
		expect([...roles].sort(), 'non-vacuity: both home roles are exercised').toEqual(['dragon', 'lit']);
	});
});
