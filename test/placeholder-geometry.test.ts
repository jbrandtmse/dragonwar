// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.0a (DW-279), AC 1 and AC 3's collision-document guard (no `vis_`
// node in it, and its `assetHash` equal to every golden header's -- the
// byte-identity half of AC 3 is the spec's `git diff --exit-code` command,
// which a test reading only the current tree cannot observe), from the EXPORTED
// artifacts only -- the committed glb's JSON chunk and the committed
// collision document. No Blender, no Babylon, and nothing read from
// `tools/make-placeholder-blend.py`'s text: the correspondence between a
// `col_` body and its `vis_` twin is proven from what actually shipped.
//
// The rule under test (the spine's Consistency Conventions row "Visible
// placeholders"):
//   - naming: `col_<x>` -> `vis_<x>`; the four `surface: 'dragon'` bodies
//     merge into one `vis_dragon`;
//   - exclusions: `col_playfield`, `col_glass`, and every body whose
//     `bboxMm.max.y <= 0` -- and nothing else;
//   - pose: x/y bbox equal to the body's within 0.01 mm; z range
//     `[zLow, min(zHigh, WALL_H_MM) + topOffsetMm(family)]`, the offset one
//     authored constant per family in [0, 3] mm, so that two twins of
//     DIFFERENT families whose footprints overlap never share a coplanar top
//     face (the z-fighting the offset exists to prevent);
//   - family material from `surface`, TEXCOORD_1, `lg_playfield`, parent
//     `playfield_root`; the flipper twins' origins at the loader's pivots;
//     [AMENDED 2026-09-29, DW-294] except that a `target`-surface body which
//     is not a drop target (not a `node` of `TABLE.dropBankWiring`) takes the
//     wall family, so a dropped target reveals a different colour behind it;
//   - the nine family colours (and each against `mat_playfield`) at least
//     0.25 apart in some linear-RGB channel.
//
// Falsifiability (Rule 19, the spec's Verification section): renaming
// `vis_post_sling_l` inside the glb JSON chunk reddens the missing-twin case;
// shifting one twin's accessor `max` reddens the pose case; setting
// `mat_vis_post`'s base colour equal to `mat_vis_wall`'s reddens the colour
// case; lowering `vis_post_divider_l_hi`'s accessor top from 0.053 to 0.050
// reddens the coplanar-top case; setting `vis_dragon_bank_backstop` back to
// `mat_vis_target` reddens the DW-294 case.
//
// [AMENDED 2026-09-29, Story 5.4] Story 5.4's art pass replaced every twin
// EXCEPT `vis_dragon` with an art part behind the same name. This file keeps
// the naming, exactly-once, exclusion and flipper-pivot rules for all of them
// (at the new count: two sealing bodies were added, DW-142/DW-258, so 92
// visible bodies -> 89 twins), and restricts the placeholder-only pins --
// bbox, cap, family material, colour and coplanar top -- to the one
// remaining placeholder, `vis_dragon`. The pins the art pass retired from
// here reappear as their art-contract equivalents in
// test/mechanism-art.test.ts: the ball-band containment and bbox coverage
// (for the pose pin), the `mat_art_*` legibility and DW-294 art-form checks
// (for the colour and DW-294 pins), the plunger pins (centre x, tip, and
// the art forms of the z-band and south-end pins), and the cap pin (a
// ceiling of min(zHigh, WALL_H_MM) plus a lip on every art part). The
// coplanar-top mutation above now reddens nothing (vis_post_divider_l_hi is
// an art part); its placeholder-era form is recorded in the 5.0a spec.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { glbToTable } from '../src/sim/table/frames';
import { loadCollision } from '../src/sim/physics/loader';
import { assetHash } from '../src/sim/loop/replay';
import { VIS_DRAGON_NODE_NAME, visTwinName } from '../src/presentation/scene/vis-names';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const REPLAYS_DIR = path.resolve(__dirname, 'replays');

/** `tools/make-placeholder-blend.py`'s `WALL_H_MM`: the height every twin is capped at before its family offset. Mirrored, because the collision document does not carry it. Since Story 5.4 the cap case below covers only the placeholder vis_dragon (whose bodies are 50 mm tall, so the cap does not bind); the art-contract ceiling on the 400 mm perimeter/lane walls lives in test/mechanism-art.test.ts. */
const WALL_H_MM = 50;
const MAX_TOP_OFFSET_MM = 3;
const XY_TOLERANCE_MM = 0.01;
const Z_TOLERANCE_MM = 0.01;
const MIN_CHANNEL_SEPARATION = 0.25;
/** Two top faces closer than this read as coplanar to a depth buffer at the fixed camera's range; the smallest authored gap between two family offsets is 0.4 mm. */
const MIN_CROSS_FAMILY_TOP_GAP_MM = 0.1;

/** The spec's surface -> family table, written out independently of the authoring script. */
const FAMILY_BY_SURFACE: Readonly<Record<string, string>> = {
	wood: 'wall',
	plastic: 'wall',
	rubber_post: 'post',
	target: 'target',
	bumper: 'bumper',
	rubber_band: 'sling',
	flipper: 'flipper',
	dragon: 'dragon',
	ramp: 'ramp',
};
/** The drop targets, from the table's own wiring -- never a hard-coded name (DW-294's exception is "a target-surface body that is not one of these"). */
const DROP_TARGET_NODES: ReadonlySet<string> = new Set(Object.values(TABLE.dropBankWiring).map((wiring) => wiring.node));

interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

interface BoxMm {
	readonly min: Vec3;
	readonly max: Vec3;
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

interface GltfDocument {
	readonly nodes: readonly GltfNode[];
	readonly meshes: ReadonlyArray<{ readonly primitives: ReadonlyArray<{ readonly attributes: Record<string, number>; readonly material?: number }> }>;
	readonly accessors: ReadonlyArray<{ readonly min?: readonly number[]; readonly max?: readonly number[] }>;
	readonly materials: ReadonlyArray<{
		readonly name?: string;
		readonly pbrMetallicRoughness?: { readonly baseColorFactor?: readonly number[]; readonly baseColorTexture?: unknown };
	}>;
}

interface CollisionNode {
	readonly name: string;
	readonly surface: string;
	readonly bboxMm: BoxMm;
}

/** The spec's family rule: the surface's family, except that a target-surface body which is not a drop target takes the wall family (DW-294). */
function familyOf(node: CollisionNode): string | undefined {
	if (node.surface === 'target' && !DROP_TARGET_NODES.has(node.name)) {
		return 'wall';
	}
	return FAMILY_BY_SURFACE[node.surface];
}

function readGlbJson(): GltfDocument {
	const bytes = readFileSync(GLB_PATH);
	expect(bytes.readUInt32LE(0), 'glb magic').toBe(0x46546c67);
	const jsonLength = bytes.readUInt32LE(12);
	expect(bytes.readUInt32LE(16), 'first chunk type must be JSON').toBe(0x4e4f534a);
	return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GltfDocument;
}

function readCollisionJson(): { nodes: CollisionNode[] } {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as { nodes: CollisionNode[] };
}

function isExcluded(node: CollisionNode): boolean {
	return node.name === TABLE.nodes.colPlayfield || node.name === TABLE.nodes.colGlass || node.bboxMm.max.y <= 0;
}

function expectedTwinName(node: CollisionNode): string {
	return node.surface === 'dragon' ? VIS_DRAGON_NODE_NAME : visTwinName(node.name);
}

function nodesNamed(doc: GltfDocument, name: string): GltfNode[] {
	return doc.nodes.filter((n) => n.name === name);
}

function requireNode(doc: GltfDocument, name: string): GltfNode {
	const matches = nodesNamed(doc, name);
	expect(matches.length, `glb must carry exactly one node named "${name}"`).toBe(1);
	return matches[0]!;
}

function parentName(doc: GltfDocument, node: GltfNode): string | undefined {
	const index = doc.nodes.indexOf(node);
	return doc.nodes.find((n) => n.children?.includes(index))?.name;
}

/** The node's table-frame bounding box: its single primitive's POSITION accessor bounds, offset by its own translation (the only TRS a twin may carry), mapped through `glbToTable()` corner by corner. */
function tableBoxMm(doc: GltfDocument, node: GltfNode): BoxMm {
	expect(node.rotation, `${node.name}: a twin's authored pose carries no rotation`).toBeUndefined();
	expect(node.scale, `${node.name}: a twin's authored pose carries no scale`).toBeUndefined();
	expect(node.mesh, `${node.name}: must carry a mesh`).toBeDefined();
	const mesh = doc.meshes[node.mesh!]!;
	expect(mesh.primitives.length, `${node.name}: exactly one primitive (one material)`).toBe(1);
	const accessor = doc.accessors[mesh.primitives[0]!.attributes.POSITION!]!;
	const t = node.translation ?? [0, 0, 0];
	const min = accessor.min!;
	const max = accessor.max!;
	const xs: number[] = [];
	const ys: number[] = [];
	const zs: number[] = [];
	for (const gx of [min[0]!, max[0]!]) {
		for (const gy of [min[1]!, max[1]!]) {
			for (const gz of [min[2]!, max[2]!]) {
				const table = glbToTable({ x: gx + t[0]!, y: gy + t[1]!, z: gz + t[2]! });
				xs.push(table.x);
				ys.push(table.y);
				zs.push(table.z);
			}
		}
	}
	return {
		min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
		max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
	};
}

/**
 * [Story 5.4] A node's table-frame bbox WITH its descendants (an art part's
 * sub-part children, `<parent>_<part>`), each carried by its own translation
 * chain -- no art node carries a rotation or scale in its authored pose.
 */
function hierarchyBoxMm(doc: GltfDocument, node: GltfNode, offset: readonly number[] = [0, 0, 0]): BoxMm {
	const t = node.translation ?? [0, 0, 0];
	const at = [offset[0]! + t[0]!, offset[1]! + t[1]!, offset[2]! + t[2]!];
	const boxes: BoxMm[] = [];
	if (node.mesh !== undefined) {
		boxes.push(tableBoxMm(doc, { ...node, translation: at }));
	}
	for (const child of node.children ?? []) {
		boxes.push(hierarchyBoxMm(doc, doc.nodes[child]!, at));
	}
	return unionBox(boxes);
}

function unionBox(boxes: readonly BoxMm[]): BoxMm {
	return {
		min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) },
		max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) },
	};
}

function materialName(doc: GltfDocument, node: GltfNode): string | undefined {
	const primitive = doc.meshes[node.mesh!]!.primitives[0]!;
	return primitive.material === undefined ? undefined : doc.materials[primitive.material]?.name;
}

/** Every twin, keyed by its expected name, with the collision bodies it stands for. */
function expectedTwins(): Map<string, CollisionNode[]> {
	const twins = new Map<string, CollisionNode[]>();
	for (const node of readCollisionJson().nodes) {
		if (isExcluded(node)) {
			continue;
		}
		const name = expectedTwinName(node);
		twins.set(name, [...(twins.get(name) ?? []), node]);
	}
	return twins;
}

describe('Story 5.0a AC 1 -- every visible col_ body has exactly one vis_ twin under the naming rule', () => {
	it('the rule yields 92 bodies -> 89 twins at this tree (5.0a\'s 90 -> 87, plus Story 5.4\'s two sealing bodies)', () => {
		const twins = expectedTwins();
		const bodies = [...twins.values()].reduce((sum, list) => sum + list.length, 0);
		expect(bodies).toBe(92);
		expect(twins.size).toBe(89);
		expect(twins.has('vis_post_wall_lane_cap') && twins.has('vis_ramp_slot_fill'), 'the two DW-142/DW-258 bodies are drawn too').toBe(true);
		expect(twins.get(VIS_DRAGON_NODE_NAME)?.map((n) => n.name).sort()).toEqual(
			['col_dragon_leg_l', 'col_dragon_leg_r', 'col_lock_ceiling', 'col_lock_ceiling_west_fill'],
		);
	});

	it('each expected twin exists exactly once, and no dragon body has a twin of its own', () => {
		const doc = readGlbJson();
		for (const name of expectedTwins().keys()) {
			expect(nodesNamed(doc, name).length, `missing or duplicated twin "${name}"`).toBe(1);
		}
		for (const node of readCollisionJson().nodes.filter((n) => n.surface === 'dragon')) {
			expect(nodesNamed(doc, visTwinName(node.name)), `${node.name} is merged into ${VIS_DRAGON_NODE_NAME}, never twinned alone`).toEqual([]);
		}
	});

	it('the set of col_ bodies WITHOUT a twin equals the exclusion rule exactly', () => {
		const doc = readGlbJson();
		// A twin is a vis_ node carrying a `mat_vis_*` family material (the
		// placeholder, `vis_dragon`) or a `mat_art_*` art material (Story 5.4's
		// parts behind the same names). That is what tells `col_playfield`'s
		// pre-existing visual `vis_playfield` (mat_playfield, Story 1.4) apart
		// from a generated twin -- it shares the naming rule's output but is
		// not a twin, which is exactly why the rule excludes col_playfield.
		const twinNames = new Set(
			doc.nodes
				.filter((n) => n.name?.startsWith('vis_') && n.mesh !== undefined && /^mat_(vis|art)_/.test(materialName(doc, n) ?? ''))
				.map((n) => n.name!),
		);
		const collision = readCollisionJson().nodes;
		const withoutTwin = collision
			.filter((n) => !twinNames.has(n.surface === 'dragon' ? VIS_DRAGON_NODE_NAME : visTwinName(n.name)))
			.map((n) => n.name)
			.sort();
		const excluded = collision.filter(isExcluded).map((n) => n.name).sort();
		expect(withoutTwin).toEqual(excluded);
		// Non-vacuity: the rule excludes the two planes and eleven under-apron bodies.
		expect(excluded).toContain(TABLE.nodes.colPlayfield);
		expect(excluded).toContain(TABLE.nodes.colGlass);
		expect(excluded.length).toBe(13);
	});

	it('the remaining placeholder\'s (vis_dragon\'s) table-frame x/y bbox matches the union of its bodies within 0.01 mm, and its z range follows the cap rule', () => {
		const doc = readGlbJson();
		const placeholders = [...expectedTwins()].filter(([twinName]) => twinName === VIS_DRAGON_NODE_NAME);
		expect(placeholders.length, 'vis_dragon is the one placeholder left (Story 5.1 replaces it)').toBe(1);
		for (const [twinName, bodies] of placeholders) {
			const node = requireNode(doc, twinName);
			const actual = tableBoxMm(doc, node);
			const expected = unionBox(bodies.map((b) => b.bboxMm));
			const label = `${twinName} (from ${bodies.map((b) => b.name).join(', ')})`;
			expect(Math.abs(actual.min.x - expected.min.x), `${label}: min.x ${actual.min.x} vs ${expected.min.x}`).toBeLessThanOrEqual(XY_TOLERANCE_MM);
			expect(Math.abs(actual.max.x - expected.max.x), `${label}: max.x ${actual.max.x} vs ${expected.max.x}`).toBeLessThanOrEqual(XY_TOLERANCE_MM);
			expect(Math.abs(actual.min.y - expected.min.y), `${label}: min.y ${actual.min.y} vs ${expected.min.y}`).toBeLessThanOrEqual(XY_TOLERANCE_MM);
			expect(Math.abs(actual.max.y - expected.max.y), `${label}: max.y ${actual.max.y} vs ${expected.max.y}`).toBeLessThanOrEqual(XY_TOLERANCE_MM);

			expect(Math.abs(actual.min.z - expected.min.z), `${label}: z floor ${actual.min.z} vs zLow ${expected.min.z}`).toBeLessThanOrEqual(Z_TOLERANCE_MM);
			const capped = Math.min(expected.max.z, WALL_H_MM);
			const offset = actual.max.z - capped;
			expect(offset, `${label}: top ${actual.max.z} sits below min(zHigh, WALL_H_MM) = ${capped}`).toBeGreaterThanOrEqual(-Z_TOLERANCE_MM);
			expect(offset, `${label}: top ${actual.max.z} sits more than ${MAX_TOP_OFFSET_MM} mm above min(zHigh, WALL_H_MM) = ${capped}`).toBeLessThanOrEqual(MAX_TOP_OFFSET_MM + Z_TOLERANCE_MM);

			// [Story 5.4] The family-shared top-offset comparison needed two twins
			// of one family; with vis_dragon the only placeholder left it could no
			// longer run, so it was removed rather than left as a dead branch.
		}
	});

	it('the placeholder vis_dragon never shares a coplanar top face with any other part whose x/y footprint overlaps it (the reason topOffsetMm exists)', () => {
		const doc = readGlbJson();
		const rootIndex = doc.nodes.findIndex((n) => n.name === TABLE.nodes.playfieldRoot);
		const parts = (doc.nodes[rootIndex]!.children ?? [])
			.map((i) => doc.nodes[i]!)
			.filter((n) => n.name?.startsWith('vis_') && n.mesh !== undefined && /^mat_(vis|art)_/.test(materialName(doc, n) ?? ''))
			.map((n) => ({ name: n.name!, material: materialName(doc, n)!, box: hierarchyBoxMm(doc, n) }));
		const twins = parts.filter((p) => p.name === VIS_DRAGON_NODE_NAME);
		expect(twins.length, 'vis_dragon').toBe(1);
		let overlappingPairs = 0;
		for (let i = 0; i < twins.length; i++) {
			for (let j = 0; j < parts.length; j++) {
				const a = twins[i]!;
				const b = parts[j]!;
				if (a.material === b.material) {
					continue; // itself (the only mat_vis_dragon part)
				}
				const overlapX = Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x);
				const overlapY = Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y);
				if (overlapX <= 0 || overlapY <= 0) {
					continue;
				}
				overlappingPairs += 1;
				expect(
					Math.abs(a.box.max.z - b.box.max.z),
					`${a.name} (${a.material}) top ${a.box.max.z.toFixed(3)} and ${b.name} (${b.material}) top ${b.box.max.z.toFixed(3)} overlap in x/y and must not be coplanar`,
				).toBeGreaterThanOrEqual(MIN_CROSS_FAMILY_TOP_GAP_MM);
			}
		}
		expect(overlappingPairs, 'non-vacuity: the tree has cross-family twins whose footprints overlap').toBeGreaterThan(0);
	});

	it('each twin carries TEXCOORD_1, lg_playfield and playfield_root as parent; the placeholder vis_dragon carries its surface\'s family material (the art parts\' materials: test/mechanism-art.test.ts)', () => {
		const doc = readGlbJson();
		for (const [twinName, bodies] of expectedTwins()) {
			const node = requireNode(doc, twinName);
			const surface = bodies[0]!.surface;
			const family = familyOf(bodies[0]!);
			expect(family, `${twinName}: surface "${surface}" maps to no family`).toBeDefined();
			for (const body of bodies) {
				expect(familyOf(body), `${twinName}: every merged body shares one family`).toBe(family);
			}
			if (twinName === VIS_DRAGON_NODE_NAME) {
				expect(materialName(doc, node), `${twinName}: material`).toBe(`mat_vis_${family}`);
			} else {
				expect(materialName(doc, node), `${twinName}: an art part (Story 5.4)`).toMatch(/^mat_art_/);
			}
			expect(doc.meshes[node.mesh!]!.primitives[0]!.attributes.TEXCOORD_1, `${twinName}: TEXCOORD_1 (AD-12)`).toBeDefined();
			expect(node.extras?.lightgroup, `${twinName}: lightgroup`).toBe('lg_playfield');
			expect(parentName(doc, node), `${twinName}: parent`).toBe(TABLE.nodes.playfieldRoot);
		}
	});

	// [Story 5.4] The DW-294 case (a dropped target reveals a different colour
	// behind it) moved to test/mechanism-art.test.ts in its art form: the
	// drop targets are mat_art_target and the bank backstop is not.

	it('vis_flipper_l/_r node translations equal the loader-derived pivots (DW-279)', () => {
		const doc = readGlbJson();
		const loaded = loadCollision(JSON.parse(readFileSync(COLLISION_PATH, 'utf8')));
		for (const [colName, side] of [[TABLE.nodes.colFlipperL, 'l'], [TABLE.nodes.colFlipperR, 'r']] as const) {
			const flipper = loaded.flippers.find((f) => f.side === side)!;
			const node = requireNode(doc, visTwinName(colName));
			expect(node.translation, `${node.name}: the object origin must sit at the pivot`).toBeDefined();
			const [tx, ty, tz] = node.translation!;
			const origin = glbToTable({ x: tx!, y: ty!, z: tz! });
			expect(Math.abs(origin.x - flipper.pivotMm.x), `${node.name} origin x ${origin.x} vs pivot ${flipper.pivotMm.x}`).toBeLessThanOrEqual(XY_TOLERANCE_MM);
			expect(Math.abs(origin.y - flipper.pivotMm.y), `${node.name} origin y ${origin.y} vs pivot ${flipper.pivotMm.y}`).toBeLessThanOrEqual(XY_TOLERANCE_MM);
			expect(Math.abs(origin.z - flipper.pivotMm.z), `${node.name} origin z ${origin.z} vs pivot ${flipper.pivotMm.z}`).toBeLessThanOrEqual(Z_TOLERANCE_MM);
		}
	});

	// [Story 5.4] The vis_plunger pins (centre x on bd_shooter, tip at the
	// resting ball) moved to test/mechanism-art.test.ts with the art rod.
});

describe('Story 5.0a -- the placeholder\'s colour is separable (AC 4\'s headless half; Story 5.4 restricts it to vis_dragon)', () => {
	it('mat_vis_dragon differs from mat_playfield by >= 0.25 in some linear-RGB channel and is not textured; no other mat_vis_* material remains in the glb', () => {
		const doc = readGlbJson();
		const colourOf = (name: string): readonly number[] => {
			const material = doc.materials.find((m) => m.name === name);
			expect(material, `material "${name}" missing from the glb`).toBeDefined();
			const factor = material!.pbrMetallicRoughness?.baseColorFactor;
			expect(factor, `${name}: baseColorFactor`).toBeDefined();
			return factor!;
		};
		const named = ['mat_vis_dragon', 'mat_playfield'];
		expect(doc.materials.filter((m) => m.name?.startsWith('mat_vis_')).map((m) => m.name), 'only the placeholder\'s family material is left').toEqual(['mat_vis_dragon']);
		expect(doc.materials.find((m) => m.name === 'mat_vis_dragon')!.pbrMetallicRoughness?.baseColorTexture, 'mat_vis_dragon must carry no texture').toBeUndefined();
		for (let i = 0; i < named.length; i++) {
			for (let j = i + 1; j < named.length; j++) {
				const a = colourOf(named[i]!);
				const b = colourOf(named[j]!);
				const separation = Math.max(...[0, 1, 2].map((k) => Math.abs(a[k]! - b[k]!)));
				expect(separation, `${named[i]} ${JSON.stringify(a.slice(0, 3))} vs ${named[j]} ${JSON.stringify(b.slice(0, 3))}`).toBeGreaterThanOrEqual(MIN_CHANNEL_SEPARATION);
			}
		}
	});
});

describe('Story 5.0a AC 3 -- the twins never reach the collision document or assetHash', () => {
	it('no vis_ node is in the collision document, and its assetHash still equals every golden header\'s', () => {
		const collision = JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as { nodes: Array<{ name: string }> };
		expect(collision.nodes.filter((n) => n.name.startsWith('vis_')).map((n) => n.name)).toEqual([]);
		const live = assetHash(collision);
		const goldens = readdirSync(REPLAYS_DIR).filter((f) => f.endsWith('.golden.json'));
		expect(goldens.length, 'non-vacuity: the golden replays exist').toBeGreaterThan(0);
		for (const file of goldens) {
			const golden = JSON.parse(readFileSync(path.join(REPLAYS_DIR, file), 'utf8')) as { header: { assetHash: string } };
			expect(golden.header.assetHash, `${file}: header.assetHash`).toBe(live);
		}
	});
});
