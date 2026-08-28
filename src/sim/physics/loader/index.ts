// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-6, AD-10, AD-11 -- the collision loader: a PURE function over an
// already-parsed `dragonwar.collision.json` document. `sim/` never parses a
// file or does I/O (AD-1, AD-11); the caller (host/presentation, Story 1.5)
// owns fetching and `JSON.parse`-ing the document and hands the plain value
// here. This file is authored, not ported -- it sits beside the vpx-js
// primitive set (`HitPlane`, `LineSeg`, `HitPoint`, `HitTriangle`,
// `PlayerPhysics`) and instantiates them from data, carrying the GPL-3.0
// header rather than the port marker (AD-16 -- the clause task 15 of this
// story's spec aligns `test/sim-boundary.test.ts` with).
//
// Two responsibilities, exactly:
//   1. Assert `col_playfield`'s bounds and both flipper nodes' lengths
//      against `TABLE.reference` within 0.1 mm -- AD-10's "the reference
//      dimensions are asserted, not assumed". A load-time path; it throws
//      (AD-16 Conventions), naming the node, the measured value and the
//      expected value.
//   2. Build ONE compound collision body -- `HitPlane` for the playfield and
//      the glass, `LineSeg` (+ a `HitPoint` at every footprint corner) for
//      `wall` nodes, `HitTriangle` (12 per box, 2 per face) for `box` nodes
//      (the two flippers) -- converting every coordinate through
//      `sim/table/frames.ts`'s `toPhysics()` and nothing else (AD-10).
//
// `toPhysics()` is an ORIENTATION-REVERSING transform (its y axis is
// flipped, per `frames.ts`'s own header): a winding/normal direction that is
// correct in the table frame is NOT automatically correct after conversion.
// Every primitive below is therefore oriented by testing its converted
// normal against a reference point, in PHYSICS space, rather than by
// trusting an assumption carried over from the source document -- the same
// self-correcting technique for both the wall segments (each edge's normal
// must face AWAY from its own footprint's centroid -- see `addWall()`'s
// header for why this is the local, per-wall replacement for an earlier
// "face the playfield's interior" rule that broke on an interior divider)
// and the box triangles (their normal must face outward from the box). This
// was verified necessary, not theoretical: a naive pass-through of
// `col_wall_left`'s footprint order produced an OUTWARD-facing wall once the
// y-flip was accounted for (review finding, this story's own implementation
// pass).

import { PlayerPhysics } from '../game/player-physics';
import { HitPlane } from '../hit-plane';
import { HitPoint } from '../hit-point';
import { HitTriangle } from '../hit-triangle';
import { LineSeg } from '../line-seg';
import { Vertex2D } from '../math/vertex2d';
import { Vertex3D } from '../math/vertex3d';
import { TABLE } from '../../table/dragonwar';
import { MM_PER_IN, toPhysics, toPhysicsPlane, type Vec3 } from '../../table/frames';
import { TUNING } from '../../table/tuning';
import type { SwitchName } from '../../table/names';

const TOLERANCE_MM = 0.1;

// ---------------------------------------------------------------------------
// Document shape (runtime-validated; the file on disk is `unknown` to this
// function's caller too, per AD-1's "sim/ never parses a file").
// ---------------------------------------------------------------------------

interface Vec2Mm {
	readonly x: number;
	readonly y: number;
}

interface BBoxMm {
	readonly min: Vec3;
	readonly max: Vec3;
}

interface CollisionNodeDoc {
	readonly name: string;
	readonly shape: 'plane' | 'wall' | 'box';
	readonly surface?: string;
	readonly physMaterial?: string;
	readonly bboxMm: BBoxMm;
	readonly normal?: Vec3;
	readonly dMm?: number;
	readonly zLowMm?: number;
	readonly zHighMm?: number;
	readonly footprintMm?: readonly Vec2Mm[];
}

interface SwitchZoneDoc {
	readonly name: string;
	readonly switch: string;
	readonly minMm: Vec3;
	readonly maxMm: Vec3;
}

/**
 * `tools/export.py` also writes a top-level `devices` array into
 * `dragonwar.collision.json` (`bd_trough`/`bd_shooter` eject poses --
 * position and direction, computed from world matrices the same way every
 * other field here is). This loader intentionally does not parse it: nothing
 * in this story ejects a ball, so there is no consumer yet -- Story 1.5,
 * which actually performs the eject, is the first reader of that data (this
 * story's spec, "What this story does not author").
 */
interface CollisionDoc {
	readonly nodes: readonly CollisionNodeDoc[];
	readonly switchZones: readonly SwitchZoneDoc[];
}

export interface LoadedSwitchZone {
	readonly name: string;
	readonly switch: SwitchName;
	readonly minMm: Vec3;
	readonly maxMm: Vec3;
}

export interface LoadedCollision {
	/** A fully populated `PlayerPhysics` -- playfield/glass planes set, every static hit object added, `finalizeStatics()` already called. The caller only needs to `addBall()`. */
	readonly physics: PlayerPhysics;
	readonly switchZones: readonly LoadedSwitchZone[];
}

// ---------------------------------------------------------------------------
// Minimal runtime parsing -- throws a descriptive Error on any shape defect
// (load-time paths throw, AD-16 Conventions).
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

// `Number.isFinite`, not `typeof === 'number'`: `JSON.parse('1e999')` yields
// `Infinity`, so a corrupted-but-syntactically-valid collision document reaches
// this function -- through its DOCUMENTED "already-parsed document" input, not
// only through a hand-built object -- and would otherwise put `Infinity` into a
// bbox, a plane normal or a footprint. `Infinity - Infinity` is `NaN`, and NaN
// silently satisfies every `<= TOLERANCE_MM` comparison in the reference
// assertions below, so the mis-sized-document guard would pass and a compound
// body of NaN geometry would load. `requireNumber()` already rejects non-finite
// values; these two did not (review finding, this story's code-review pass).
function asVec3Mm(v: unknown, context: string): Vec3 {
	if (!isRecord(v) || !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
		throw new Error(`loadCollision(): ${context} is not a {x,y,z} finite number triple`);
	}
	return { x: v.x as number, y: v.y as number, z: v.z as number };
}

function asBBoxMm(v: unknown, context: string): BBoxMm {
	if (!isRecord(v)) {
		throw new Error(`loadCollision(): ${context} is not an object`);
	}
	return { min: asVec3Mm(v.min, `${context}.min`), max: asVec3Mm(v.max, `${context}.max`) };
}

function parseCollisionDoc(doc: unknown): CollisionDoc {
	if (!isRecord(doc)) {
		throw new Error('loadCollision(): document is not an object');
	}
	if (!Array.isArray(doc.nodes)) {
		throw new Error('loadCollision(): document.nodes is not an array');
	}
	if (!Array.isArray(doc.switchZones)) {
		throw new Error('loadCollision(): document.switchZones is not an array');
	}

	const nodes: CollisionNodeDoc[] = doc.nodes.map((raw, i) => {
		if (!isRecord(raw) || typeof raw.name !== 'string') {
			throw new Error(`loadCollision(): document.nodes[${i}] has no string "name"`);
		}
		const shape = raw.shape;
		if (shape !== 'plane' && shape !== 'wall' && shape !== 'box') {
			throw new Error(`loadCollision(): node "${raw.name}" has unknown shape "${String(shape)}"`);
		}
		const bboxMm = asBBoxMm(raw.bboxMm, `node "${raw.name}".bboxMm`);
		const node: CollisionNodeDoc = {
			name: raw.name,
			shape,
			bboxMm,
			surface: typeof raw.surface === 'string' ? raw.surface : undefined,
			physMaterial: typeof raw.physMaterial === 'string' ? raw.physMaterial : undefined,
		};
		if (shape === 'plane') {
			return { ...node, normal: asVec3Mm(raw.normal, `node "${raw.name}".normal`), dMm: requireNumber(raw.dMm, `node "${raw.name}".dMm`) };
		}
		if (shape === 'wall') {
			// A CLOSED polygon (edges between every consecutive pair, plus one
			// closing the last point back to the first -- addWall() below), so
			// at least 3 points are needed for it to enclose any area at all.
			if (!Array.isArray(raw.footprintMm) || raw.footprintMm.length < 3) {
				throw new Error(`loadCollision(): wall node "${raw.name}" needs a closed footprintMm polygon of at least 3 points`);
			}
			const footprintMm = raw.footprintMm.map((p: unknown, j: number) => {
				// Finite, not merely `number` -- see asVec3Mm()'s comment above.
				if (!isRecord(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
					throw new Error(`loadCollision(): wall node "${raw.name}".footprintMm[${j}] is not a {x,y} finite number pair`);
				}
				return { x: p.x as number, y: p.y as number };
			});
			return {
				...node,
				zLowMm: requireNumber(raw.zLowMm, `node "${raw.name}".zLowMm`),
				zHighMm: requireNumber(raw.zHighMm, `node "${raw.name}".zHighMm`),
				footprintMm,
			};
		}
		return node; // 'box'
	});

	const switchZones: SwitchZoneDoc[] = doc.switchZones.map((raw, i) => {
		if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.switch !== 'string') {
			throw new Error(`loadCollision(): document.switchZones[${i}] needs string "name" and "switch"`);
		}
		return {
			name: raw.name,
			switch: raw.switch,
			minMm: asVec3Mm(raw.minMm, `switchZone "${raw.name}".minMm`),
			maxMm: asVec3Mm(raw.maxMm, `switchZone "${raw.name}".maxMm`),
		};
	});

	return { nodes, switchZones };
}

function requireNumber(v: unknown, context: string): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new Error(`loadCollision(): ${context} is not a finite number`);
	}
	return v;
}

function findNode(doc: CollisionDoc, name: string): CollisionNodeDoc {
	const matches = doc.nodes.filter((n) => n.name === name);
	if (matches.length === 0) {
		throw new Error(`loadCollision(): required node "${name}" is missing from the collision document`);
	}
	if (matches.length > 1) {
		// A corrupted/hand-edited document could carry two nodes sharing one
		// name -- the FIRST match must never be silently preferred (review
		// finding, this story's review pass).
		throw new Error(`loadCollision(): document has ${matches.length} nodes named "${name}" -- node names must be unique`);
	}
	return matches[0];
}

// ---------------------------------------------------------------------------
// AD-10: the reference dimensions are asserted, not assumed.
// ---------------------------------------------------------------------------

function assertClose(nodeName: string, label: string, measuredMm: number, expectedMm: number): void {
	if (Math.abs(measuredMm - expectedMm) > TOLERANCE_MM) {
		throw new Error(
			`loadCollision(): node "${nodeName}" ${label} is ${measuredMm} mm, expected ${expectedMm} mm ` +
			`(tolerance ${TOLERANCE_MM} mm)`,
		);
	}
}

function assertReferenceDimensions(doc: CollisionDoc): void {
	const playfield = findNode(doc, TABLE.nodes.colPlayfield);
	const measuredW = playfield.bboxMm.max.x - playfield.bboxMm.min.x;
	const measuredH = playfield.bboxMm.max.y - playfield.bboxMm.min.y;
	assertClose(TABLE.nodes.colPlayfield, 'width', measuredW, TABLE.reference.playfieldMm.w);
	assertClose(TABLE.nodes.colPlayfield, 'height', measuredH, TABLE.reference.playfieldMm.h);

	const expectedBatMm = TABLE.reference.flipperBatIn * MM_PER_IN;
	for (const nodeName of [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR]) {
		const flipper = findNode(doc, nodeName);
		const b = flipper.bboxMm;
		const measuredLength = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
		assertClose(nodeName, 'length', measuredLength, expectedBatMm);
	}
}

// ---------------------------------------------------------------------------
// Material tuning -- AD-15: elasticity/elasticityFalloff/friction/scatter
// come from `TUNING.materials`, keyed by the node's own `physMaterial`.
// ---------------------------------------------------------------------------

function applyMaterial<T extends { setElasticity(e: number, f?: number): unknown; setFriction(f: number): unknown; setScatter(s: number): unknown }>(
	hitObject: T,
	physMaterial: string | undefined,
	nodeName: string,
): void {
	const materials = TUNING.materials as Record<string, (typeof TUNING.materials)['default']>;
	let m = materials.default;
	if (physMaterial !== undefined) {
		const found = materials[physMaterial];
		if (!found) {
			// AD-16 Conventions: load-time paths throw -- an authored-but-unknown
			// phys_material must not silently fall back to 'default' (review
			// finding, this story's review pass).
			throw new Error(`loadCollision(): node "${nodeName}" has unknown phys_material "${physMaterial}"`);
		}
		m = found;
	}
	hitObject.setElasticity(m.elasticity.value, m.elasticityFalloff.value);
	hitObject.setFriction(m.friction.value);
	hitObject.setScatter(m.scatter.value);
}

// ---------------------------------------------------------------------------
// Wall construction: a LineSeg per footprint edge of a CLOSED polygon,
// oriented outward from the wall's OWN local centroid in PHYSICS space (see
// this file's header), plus a HitPoint at every footprint vertex (matches
// `tools/spike-1/scene.ts`'s own corner construction -- the reason ledger
// DW-7 closes from this loader).
//
// Every side is real collision geometry now, not just the one side facing an
// assumed "interior": `tools/export.py`'s `wall_footprint_mm()` used to
// collapse each wall to a single zero-thickness centreline oriented toward
// the TABLE's own centre point, which is correct only for a perimeter wall
// (whose uncovered side always faces away from the table) and wrong for an
// INTERIOR divider like `col_wall_lane`, whose lane-facing side was left
// completely unguarded (Review Findings, HIGH). Orienting each edge outward
// from the wall's own footprint centroid, rather than from the table's,
// fixes both cases uniformly with no perimeter/interior distinction needed.
// ---------------------------------------------------------------------------

/**
 * `p1`/`p2` and `centroid` must already be in the SAME frame -- this loader
 * always calls it with all three already converted to physics space (never
 * table-frame points against a physics-frame centroid): `toPhysics()` is
 * orientation-reversing (see this file's header), so verifying "which way is
 * outward" in the SOURCE frame and carrying that ordering through the
 * conversion silently produces an outward-facing wall (measured, this
 * story's own implementation pass -- a ball fired at a wall corner sailed
 * straight through every static object in the compound body with the
 * table-frame-then-convert version of this function).
 */
function orientedEdge(p1: Vec2Mm, p2: Vec2Mm, centroid: Vec2Mm): [Vec2Mm, Vec2Mm] {
	// Mirrors LineSeg.calcNormal()'s own convention: normal = ((v1-v2).y, -(v1-v2).x), normalised.
	const vtx = p1.x - p2.x;
	const vty = p1.y - p2.y;
	const len = Math.hypot(vtx, vty) || 1;
	const nx = vty / len;
	const ny = -vtx / len;
	const midX = (p1.x + p2.x) / 2;
	const midY = (p1.y + p2.y) / 2;
	// AWAY from the centroid (outward), the mirror image of the old "toward
	// the table centre" (inward) test -- a footprint's own centroid always
	// sits INSIDE its closed polygon, so "away from it" is unambiguously
	// outward for every edge, perimeter wall or interior divider alike.
	const awayX = midX - centroid.x;
	const awayY = midY - centroid.y;
	const dot = nx * awayX + ny * awayY;
	return dot >= 0 ? [p1, p2] : [p2, p1];
}

function addWall(physics: PlayerPhysics, node: CollisionNodeDoc): void {
	const footprint = node.footprintMm!;
	const zLowVu = toPhysics({ x: 0, y: 0, z: node.zLowMm! }).z;
	const zHighVu = toPhysics({ x: 0, y: 0, z: node.zHighMm! }).z;

	// Convert every footprint point to physics space FIRST -- orientation is
	// verified there, never in the table frame (see orientedEdge()'s doc comment).
	const physicsPoints = footprint.map((p) => toPhysics({ x: p.x, y: p.y, z: 0 }));

	// The footprint's own centroid (in physics space, matching the points
	// above -- toPhysics() is affine, so this equals converting the
	// table-frame centroid, but computing it directly here keeps every
	// orientation decision in one frame with no cross-frame reasoning).
	const centroid: Vec2Mm = {
		x: physicsPoints.reduce((sum, p) => sum + p.x, 0) / physicsPoints.length,
		y: physicsPoints.reduce((sum, p) => sum + p.y, 0) / physicsPoints.length,
	};

	// A CLOSED polygon: an edge between every consecutive pair, plus one
	// closing the last point back to the first -- so a rectangular footprint
	// (four corners) yields all four faces, both long sides and both short
	// ends, each independently oriented outward.
	for (let i = 0; i < physicsPoints.length; i++) {
		const p1 = physicsPoints[i];
		const p2 = physicsPoints[(i + 1) % physicsPoints.length];
		const [a, b] = orientedEdge(p1, p2, centroid);
		const lineSeg = new LineSeg(new Vertex2D(a.x, a.y), new Vertex2D(b.x, b.y), Math.min(zLowVu, zHighVu), Math.max(zLowVu, zHighVu));
		applyMaterial(lineSeg, node.physMaterial, node.name);
		physics.addStaticHitObject(lineSeg);
	}

	for (const point of physicsPoints) {
		const hitPoint = new HitPoint(new Vertex3D(point.x, point.y, zLowVu));
		applyMaterial(hitPoint, node.physMaterial, node.name);
		physics.addStaticHitObject(hitPoint);
	}
}

// ---------------------------------------------------------------------------
// Box construction: 12 HitTriangles (2 per face, self-oriented outward in
// PHYSICS space via a hint-vector dot-product test -- see this file's
// header).
// ---------------------------------------------------------------------------

function outwardTriangle(a: Vertex3D, b: Vertex3D, c: Vertex3D, hint: Vec3): [Vertex3D, Vertex3D, Vertex3D] {
	// HitTriangle's own normal convention: e0 = rgv[2]-rgv[0], e1 = rgv[1]-rgv[0], normal = e0 x e1.
	const e0x = c.x - a.x, e0y = c.y - a.y, e0z = c.z - a.z;
	const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
	const nx = e0y * e1z - e0z * e1y;
	const ny = e0z * e1x - e0x * e1z;
	const nz = e0x * e1y - e0y * e1x;
	const dot = nx * hint.x + ny * hint.y + nz * hint.z;
	return dot >= 0 ? [a, b, c] : [a, c, b];
}

function addBox(physics: PlayerPhysics, node: CollisionNodeDoc): void {
	const { min, max } = node.bboxMm;
	const toP = (x: number, y: number, z: number): Vertex3D => {
		const p = toPhysics({ x, y, z });
		return new Vertex3D(p.x, p.y, p.z);
	};
	const c000 = toP(min.x, min.y, min.z);
	const c100 = toP(max.x, min.y, min.z);
	const c010 = toP(min.x, max.y, min.z);
	const c110 = toP(max.x, max.y, min.z);
	const c001 = toP(min.x, min.y, max.z);
	const c101 = toP(max.x, min.y, max.z);
	const c011 = toP(min.x, max.y, max.z);
	const c111 = toP(max.x, max.y, max.z);

	// hint is the TABLE-frame outward direction for each face; the y flip is
	// applied here so the dot-product test below is evaluated correctly
	// against the already-converted (physics-frame) triangle vertices.
	const faces: Array<{ hint: Vec3; tris: Array<[Vertex3D, Vertex3D, Vertex3D]> }> = [
		{ hint: { x: 1, y: 0, z: 0 }, tris: [[c100, c110, c111], [c100, c111, c101]] }, // +X
		{ hint: { x: -1, y: 0, z: 0 }, tris: [[c000, c001, c011], [c000, c011, c010]] }, // -X
		{ hint: { x: 0, y: -1, z: 0 }, tris: [[c010, c011, c111], [c010, c111, c110]] }, // table +Y -> physics -Y
		{ hint: { x: 0, y: 1, z: 0 }, tris: [[c000, c100, c101], [c000, c101, c001]] }, // table -Y -> physics +Y
		{ hint: { x: 0, y: 0, z: 1 }, tris: [[c001, c101, c111], [c001, c111, c011]] }, // +Z
		{ hint: { x: 0, y: 0, z: -1 }, tris: [[c000, c010, c110], [c000, c110, c100]] }, // -Z
	];

	for (const face of faces) {
		for (const [a, b, c] of face.tris) {
			const [ra, rb, rc] = outwardTriangle(a, b, c, face.hint);
			const triangle = new HitTriangle([ra, rb, rc]);
			applyMaterial(triangle, node.physMaterial, node.name);
			physics.addStaticHitObject(triangle);
		}
	}
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Guards 'toPhysicsPlane(node.normal!, node.dMm!)' below: a malformed
 * document could author col_playfield/col_glass as a wall- or box-shaped
 * node, which would otherwise crash the non-null assertions with an opaque
 * TypeError instead of a descriptive load-time error (review finding, this
 * story's review pass).
 */
function assertPlaneShaped(node: CollisionNodeDoc): void {
	if (node.shape !== 'plane') {
		throw new Error(`loadCollision(): node "${node.name}" must be plane-shaped, got "${node.shape}"`);
	}
}

/**
 * Builds one compound collision body from an already-parsed
 * `dragonwar.collision.json` document. Pure: no I/O, no globals read besides
 * `TABLE`/`TUNING` (AD-1). Throws (never returns a partial result) on any
 * shape or reference-dimension mismatch (AD-16 Conventions: load-time paths
 * throw).
 */
export function loadCollision(doc: unknown): LoadedCollision {
	const parsed = parseCollisionDoc(doc);
	assertReferenceDimensions(parsed);

	const physics = new PlayerPhysics();

	const playfieldNode = findNode(parsed, TABLE.nodes.colPlayfield);
	const glassNode = findNode(parsed, TABLE.nodes.colGlass);
	assertPlaneShaped(playfieldNode);
	assertPlaneShaped(glassNode);

	const { normal: playfieldNormal, d: playfieldD } = toPhysicsPlane(playfieldNode.normal!, playfieldNode.dMm!);
	const playfieldPlane = new HitPlane(new Vertex3D(playfieldNormal.x, playfieldNormal.y, playfieldNormal.z), playfieldD);
	applyMaterial(playfieldPlane, playfieldNode.physMaterial, playfieldNode.name);
	physics.setPlayfieldHit(playfieldPlane);

	const { normal: glassNormal, d: glassD } = toPhysicsPlane(glassNode.normal!, glassNode.dMm!);
	const glassPlane = new HitPlane(new Vertex3D(glassNormal.x, glassNormal.y, glassNormal.z), glassD);
	applyMaterial(glassPlane, glassNode.physMaterial, glassNode.name);
	physics.setTopGlassHit(glassPlane);

	for (const node of parsed.nodes) {
		if (node.name === playfieldNode.name || node.name === glassNode.name) {
			continue; // already installed as the playfield/glass planes above
		}
		if (node.shape === 'plane') {
			throw new Error(`loadCollision(): node "${node.name}" is an unexpected plane-shaped node -- only col_playfield and col_glass may be plane-shaped`);
		}
		if (node.shape === 'wall') {
			addWall(physics, node);
		} else {
			addBox(physics, node);
		}
	}

	physics.finalizeStatics();

	const switchZones: LoadedSwitchZone[] = parsed.switchZones.map((zone) => {
		if (!(zone.switch in TABLE.switches)) {
			// AD-16 Conventions: load-time paths throw -- a switch zone naming an
			// unknown TABLE switch must not be silently cast and handed to the
			// caller (review finding, this story's review pass).
			throw new Error(`loadCollision(): switch zone "${zone.name}" names an unknown switch "${zone.switch}"`);
		}
		return {
			name: zone.name,
			switch: zone.switch as SwitchName,
			minMm: zone.minMm,
			maxMm: zone.maxMm,
		};
	});

	return { physics, switchZones };
}
