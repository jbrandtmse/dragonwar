// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-6, AD-10, AD-11 -- the collision loader: a PURE function over an
// already-parsed `dragonwar.collision.json` document. `sim/` never parses a
// file or does I/O (AD-1, AD-11); the caller (host/presentation, Story 1.5)
// owns fetching and `JSON.parse`-ing the document and hands the plain value
// here. This file is authored, not ported -- it sits beside the vpx-js
// primitive set (`HitPlane`, `LineSeg`, `HitLineZ`, `HitTriangle`,
// `PlayerPhysics`) and instantiates them from data, carrying the GPL-3.0
// header rather than the port marker (AD-16 -- the clause task 15 of this
// story's spec aligns `test/port-provenance.test.ts` with).
//
// Three responsibilities:
//   1. Assert `col_playfield`'s bounds and both flipper nodes' lengths
//      against `TABLE.reference` within 0.1 mm -- AD-10's "the reference
//      dimensions are asserted, not assumed". A load-time path; it throws
//      (AD-16 Conventions), naming the node, the measured value and the
//      expected value.
//   2. Build ONE compound collision body -- `HitPlane` for the playfield and
//      the glass, `LineSeg` (+ a `HitLineZ` at every footprint corner,
//      spanning the wall's own zLow..zHigh -- DW-7, see `addWall()` below)
//      for `wall` nodes, `HitTriangle` (12 per box, 2 per face) for `box`
//      nodes (the two flippers) -- converting every coordinate through
//      `sim/table/frames.ts`'s `toPhysics()` and nothing else (AD-10).
//   3. Validate the document's `version`/`units`/`frame` handshake (DW-45)
//      and parse its `devices` array (Story 1.5's `bd_trough`/`bd_shooter`
//      eject poses) into the returned `LoadedCollision`.
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
import { HitLineZ } from '../hit-line-z';
import { HitLine3D } from '../hit-line-3d';
import { HitPlane } from '../hit-plane';
import { HitTriangle } from '../hit-triangle';
import { LineSeg } from '../line-seg';
import { createSlingshotMechanics, type SlingKick, type SlingSurfaceDataByCoil, type SlingshotSegmentBuilder } from '../slings';
import { Vertex2D } from '../math/vertex2d';
import { Vertex3D } from '../math/vertex3d';
import { TABLE } from '../../table/dragonwar';
import { MM_PER_IN, MM_PER_VU, toPhysics, toPhysicsPlane, type Vec3 } from '../../table/frames';
import { TUNING, resolveTuning, type ResolvedTuning } from '../../table/tuning';
import type { BallDeviceName, CoilName, SwitchName } from '../../table/names';
import type { LoadedFlipper } from './loaded-flipper';

// Declared independently of `sim/physics/pops.ts`'s own identical one-liners
// (never imported from there): `pops.ts` already imports `LoadedSwitchZone`
// FROM this file, so an import the other way would close a cycle
// `tools/dependency-cruiser.config.mjs`'s `no-circular` rule forbids between
// two authored (non-ported) physics files. Both derive from the SAME
// canonical source (`TABLE.popWiring`), and TypeScript's structural typing
// means `LoadedCollision.popCentroidsMm` below and `pops.ts`'s own
// `PopCentroidsByCoil` parameter type are interchangeable at every call site
// despite being two nominally separate declarations, so the two can never
// silently drift apart in practice either.
type PopCoilName = keyof typeof TABLE.popWiring;
/** Each pop bumper's own collision-node centroid, table-frame millimetres, DERIVED below from the committed document's own `footprintMm` -- never hand-typed (this story's spec, "Anti-vacuity"). */
export type PopCentroidsByCoil = Readonly<Record<PopCoilName, { readonly x: number; readonly y: number }>>;

// Story 2.1a (DW-105): `LoadedFlipper` itself is declared in the leaf module
// `./loaded-flipper` and re-exported here so every existing `from '../loader'`
// import keeps working -- see that module's own header for why it was
// hoisted out of this file.
export type { LoadedFlipper } from './loaded-flipper';

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

interface DeviceDoc {
	readonly name: string;
	readonly ejectPose: { readonly posMm: Vec3; readonly dir: Vec3 };
}

/**
 * `tools/export.py` writes `version`/`units`/`frame` as a load-time
 * handshake (DW-45: "a `units: \"m\"` document must never load silently at
 * 1000x scale") and a top-level `devices` array (`bd_trough`/`bd_shooter`
 * eject poses -- position and direction, computed from world matrices the
 * same way every other field here is). Story 1.5 is the first reader of
 * `devices`: it performs the eject Story 1.4 deferred.
 */
interface CollisionDoc {
	readonly nodes: readonly CollisionNodeDoc[];
	readonly switchZones: readonly SwitchZoneDoc[];
	readonly devices: readonly DeviceDoc[];
}

export interface LoadedSwitchZone {
	readonly name: string;
	readonly switch: SwitchName;
	readonly minMm: Vec3;
	readonly maxMm: Vec3;
}

export interface LoadedDevice {
	readonly name: BallDeviceName;
	readonly ejectPose: { readonly posMm: Vec3; readonly dir: Vec3 };
}

export interface LoadedCollision {
	/** A fully populated `PlayerPhysics` -- playfield/glass planes set, every static hit object added, `finalizeStatics()` already called. The caller only needs to `addBall()` (and, for the two flipper nodes below, `addFlipper()`). */
	readonly physics: PlayerPhysics;
	readonly switchZones: readonly LoadedSwitchZone[];
	/** Every ball device's authored eject pose, validated against `TABLE.ballDevices` (Story 1.5, DW-45's sibling: the first reader of this array). */
	readonly devices: readonly LoadedDevice[];
	/** `col_flipper_l` and `col_flipper_r`, derived rather than registered as static geometry (Story 1.6). Always exactly the two, in no particular order. */
	readonly flippers: readonly LoadedFlipper[];
	/** Story 2.2, AD-5: per-coil slingshot surface-data handles, held by reference inside the `KickReportingSlingshot` instances `addWall()` built below -- `machine.ts` mutates `.isDisabled` on these SAME objects every tick from its own `coilEnabled` map, so a flip takes effect on the very next contact with no re-load. */
	readonly slingSurfaceData: SlingSurfaceDataByCoil;
	/** Story 2.2, AD-2: drains every sling kick recorded since the last call, in firing order, with no `tick` set yet -- the kick fires DURING `physics.step()`, which receives no tick of its own, so `machine.ts` stamps it once it drains this immediately after `physics.step()` returns. */
	drainSlingKicks(): readonly SlingKick[];
	/** Story 2.2, DW-148: each pop bumper's own collision-node centroid, DERIVED from the committed document's own footprint (never hand-typed) -- `sim/physics/pops.ts`'s kick direction. */
	readonly popCentroidsMm: PopCentroidsByCoil;
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

/**
 * DW-45's load-time handshake: `version`/`units`/`frame` must be present and
 * exactly `1`/`"mm"`/`"table"` -- a document authored at a different scale or
 * frame (e.g. `units: "m"`) must never load silently at 1000x scale. Throws
 * naming the field, the value found and the value expected.
 */
function assertHandshake(doc: Record<string, unknown>): void {
	const checks: ReadonlyArray<readonly [field: string, expected: unknown]> = [
		['version', 1],
		['units', 'mm'],
		['frame', 'table'],
	];
	for (const [field, expected] of checks) {
		const found = doc[field];
		if (found !== expected) {
			throw new Error(
				`loadCollision(): document.${field} is ${JSON.stringify(found)}, expected ${JSON.stringify(expected)} (DW-45)`,
			);
		}
	}
}

function parseCollisionDoc(doc: unknown): CollisionDoc {
	if (!isRecord(doc)) {
		throw new Error('loadCollision(): document is not an object');
	}
	assertHandshake(doc);
	if (!Array.isArray(doc.nodes)) {
		throw new Error('loadCollision(): document.nodes is not an array');
	}
	if (!Array.isArray(doc.switchZones)) {
		throw new Error('loadCollision(): document.switchZones is not an array');
	}
	if (!Array.isArray(doc.devices)) {
		throw new Error('loadCollision(): document.devices is not an array');
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

	const devices: DeviceDoc[] = doc.devices.map((raw, i) => {
		if (!isRecord(raw) || typeof raw.name !== 'string') {
			throw new Error(`loadCollision(): document.devices[${i}] has no string "name"`);
		}
		if (!isRecord(raw.ejectPose)) {
			throw new Error(`loadCollision(): device "${raw.name}".ejectPose is not an object`);
		}
		return {
			name: raw.name,
			ejectPose: {
				posMm: asVec3Mm(raw.ejectPose.posMm, `device "${raw.name}".ejectPose.posMm`),
				dir: asVec3Mm(raw.ejectPose.dir, `device "${raw.name}".ejectPose.dir`),
			},
		};
	});

	return { nodes, switchZones, devices };
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
	// AD-10 fixes the table frame's ORIGIN as well as its extents: "origin at
	// the playfield's bottom-left corner nearest the player". Asserting only
	// the extents leaves a correctly-sized but offset playfield undetected,
	// and the offset is not cosmetic -- `toPhysics()` flips y about
	// `TABLE.reference.playfieldMm.h` measured from that origin, so every
	// converted coordinate in the whole compound body (and every ball
	// position Story 1.5 publishes back through `fromPhysics()`) is silently
	// wrong by the offset, in the axis where a sign error mirrors the table
	// (re-review finding).
	assertClose(TABLE.nodes.colPlayfield, 'origin x (AD-10: the table frame starts at the playfield corner)', playfield.bboxMm.min.x, 0);
	assertClose(TABLE.nodes.colPlayfield, 'origin y (AD-10: the table frame starts at the playfield corner)', playfield.bboxMm.min.y, 0);

	const expectedBatMm = TABLE.reference.flipperBatIn * MM_PER_IN;
	for (const nodeName of [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR]) {
		const flipper = findNode(doc, nodeName);
		const b = flipper.bboxMm;
		// DW-48: axis-agnostic (`Math.max` over all three extents) let a bat
		// measuring the reference length on the WRONG axis (e.g. y instead of
		// x) pass silently, as long as SOME axis happened to be long enough.
		// The committed body is x-major (`loadCollision()`'s own header: "the
		// pivot as ... the left bat's min.x and the right bat's max.x"), so the
		// x extent specifically is what the loader treats as the bat's length
		// everywhere else (`loadFlipper()` below) -- asserting that SAME axis
		// here, naming it in the throw, is what closes the ledger entry.
		const measuredLength = b.max.x - b.min.x;
		assertClose(nodeName, 'length (x axis)', measuredLength, expectedBatMm);
	}
}

// ---------------------------------------------------------------------------
// Material tuning -- AD-15: elasticity/elasticityFalloff/friction/scatter
// come from `TUNING.materials`, keyed by the node's own `physMaterial`.
// ---------------------------------------------------------------------------

/**
 * Resolves `physMaterial` against `TUNING.materials`, throwing if it names
 * something unknown (AD-16 Conventions: load-time paths throw -- an
 * authored-but-unknown phys_material must not silently fall back to
 * 'default', review finding, this story's review pass). Extracted
 * (Story 1.6) so `loadFlipper()` below can validate a flipper node's own
 * `physMaterial` the same way every other node's is validated, even though
 * the VALUE it resolves to is not the one actually applied to the flipper's
 * hit shape (that is `sim/physics/flippers.ts`'s own, deliberate
 * `TUNING.materials.flipper_rubber`, per this story's task list) -- the
 * committed document's own field is still checked for a typo or a renamed
 * material, the same as any other node's.
 */
/**
 * `materialsSource` is the CALLER's resolved tuning's `materials` group
 * (Story 1.9 review fix: this previously read the bare module-level
 * `TUNING` import directly, exactly the bug class this story's own Spec
 * Change Log already found and fixed once for `flippers.ts`'s
 * `flipper_rubber` read -- a hot-applied override of `materials.default.*`,
 * or any non-flipper material, had ZERO effect on the running sim because
 * every wall/ramp/playfield/glass hit object was built from the shipped
 * default forever, regardless of what `tuning` `createMachine()` was given.
 * Callers pass `tuning.materials` (or omit it -- see `loadCollision()`'s own
 * default below, byte-identical to this file's pre-fix behaviour). */
function resolveMaterial(
	materialsSource: (typeof TUNING)['materials'],
	physMaterial: string | undefined,
	nodeName: string,
): (typeof TUNING.materials)['default'] {
	const materials = materialsSource as Record<string, (typeof TUNING.materials)['default']>;
	if (physMaterial === undefined) {
		return materials.default;
	}
	const found = materials[physMaterial];
	if (!found) {
		throw new Error(`loadCollision(): node "${nodeName}" has unknown phys_material "${physMaterial}"`);
	}
	return found;
}

function applyMaterial<T extends { setElasticity(e: number, f?: number): unknown; setFriction(f: number): unknown; setScatter(s: number): unknown }>(
	materialsSource: (typeof TUNING)['materials'],
	hitObject: T,
	physMaterial: string | undefined,
	nodeName: string,
): void {
	const m = resolveMaterial(materialsSource, physMaterial, nodeName);
	hitObject.setElasticity(m.elasticity.value, m.elasticityFalloff.value);
	hitObject.setFriction(m.friction.value);
	hitObject.setScatter(m.scatter.value);
}

// ---------------------------------------------------------------------------
// Wall construction: a LineSeg per footprint edge of a CLOSED polygon,
// oriented outward from the wall's OWN local centroid in PHYSICS space (see
// this file's header), plus a HitLineZ at every footprint vertex, spanning
// the wall's own zLow..zHigh (Story 1.5: superseded a z = 0 HitPoint, which
// this loader's own header explains was tangent to a deck-rolling ball by
// construction -- the reason ledger DW-7 closes from this loader).
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

/**
 * DW-52: `addWall()`'s centroid orientation (`orientedEdge()` below) is only
 * correct for a CONVEX footprint -- a reflex vertex puts the polygon's
 * vertex-mean centroid outside the shape near that vertex, which flips the
 * "away from centroid" outward test for the edges nearest it. `tools/
 * export.py`'s `wall_footprint_mm()` always emits a convex, counter-clockwise
 * hull, so this only ever fires against a hand-edited or corrupted document
 * (AD-16 Conventions: load-time paths throw) -- Story 2.1a authors the
 * FIRST non-rectangular footprints beyond the one pinned deflector, so this
 * guard is no longer merely theoretical. Checked over the TABLE-frame
 * `footprintMm` (never `physicsPoints`): `toPhysics()` reverses winding
 * (this file's header), so a footprint that is convex and CCW in the table
 * frame is convex but CLOCKWISE after conversion -- testing convexity in the
 * frame the document actually authors it in is what makes "the offending
 * vertex index" mean the same thing to a human reading the source document.
 */
function assertConvexCcwFootprint(nodeName: string, footprint: readonly Vec2Mm[]): void {
	const n = footprint.length;
	for (let i = 0; i < n; i++) {
		const a = footprint[i];
		const b = footprint[(i + 1) % n];
		const c = footprint[(i + 2) % n];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (cross <= 0) {
			const offendingIndex = (i + 1) % n;
			throw new Error(
				`loadCollision(): wall node "${nodeName}" has a non-convex footprint at vertex ${offendingIndex} ` +
				`(${JSON.stringify(b)}) -- footprintMm must be a strictly convex, counter-clockwise ring (DW-52)`,
			);
		}
	}
}

/**
 * `slingBuilder`, when given (Story 2.2): called once per footprint edge
 * INSTEAD of `new LineSeg(...)` -- the literal drop-in the spec's Code Map
 * names for `col_sling_l`/`col_sling_r`. Every edge of a sling node becomes a
 * `KickReportingSlingshot`, not only the one rubber-facing face: the ported
 * model's own per-edge `dot <= -threshold` test already gates the kick to
 * real high-speed contact, so no special-casing which edge is the "real"
 * rubber face is needed, and every OTHER wall node is entirely unaffected
 * (`slingBuilder` is `undefined` for all 101+ of them).
 *
 * Two limits of "every edge", recorded rather than left implied (code
 * review, this pass): (a) the per-vertex `HitLineZ` objects built below are
 * NOT wrapped, so a contact resolved against a sling's corner rather than
 * one of its edges rebounds passively and emits no `coil_fire`; (b) the
 * `dot <= -threshold` gate is about SPEED, not about which face was struck,
 * so every face of a sling body kicks -- which is correct for the rubber
 * face and is what makes the sling a real device, but means the DW-119
 * north slope kicks too. Both are consequences of the spec's own task 5
 * ("one `LineSegSlingshot` per footprint edge") and are measured, not
 * incidental: `check:reachability` moved exactly one verdict as a result.
 */
function addWall(physics: PlayerPhysics, node: CollisionNodeDoc, materialsSource: (typeof TUNING)['materials'], slingBuilder?: SlingshotSegmentBuilder): void {
	const footprint = node.footprintMm!;
	assertConvexCcwFootprint(node.name, footprint);
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
		const zMin = Math.min(zLowVu, zHighVu);
		const zMax = Math.max(zLowVu, zHighVu);
		const lineSeg: LineSeg = slingBuilder
			? slingBuilder(new Vertex2D(a.x, a.y), new Vertex2D(b.x, b.y), zMin, zMax)
			: new LineSeg(new Vertex2D(a.x, a.y), new Vertex2D(b.x, b.y), zMin, zMax);
		applyMaterial(materialsSource, lineSeg, node.physMaterial, node.name);
		physics.addStaticHitObject(lineSeg);
	}

	// DW-7 (answered and closed): a corner `HitPoint` sits at physics z = 0,
	// which is TANGENT to a deck-rolling ball's surface by construction -- the
	// ball's centre rides at exactly one radius above the deck, so it only
	// ever comes within radius of a z = 0 point when its horizontal offset is
	// a fraction of a millimetre. A 36-trajectory sweep of balls rolling at
	// deck height into wall corners of the committed body measured this
	// directly: 0 `HitPoint.collide()` calls. `HitLineZ` -- a vertical line
	// segment already ported (src/sim/physics/hit-line-z.ts) but with no
	// caller until now -- spans the wall's own zLow..zHigh instead of sitting
	// at a single z, so a rolling ball's surface actually reaches it.
	for (const point of physicsPoints) {
		const hitLineZ = new HitLineZ(new Vertex2D(point.x, point.y), Math.min(zLowVu, zHighVu), Math.max(zLowVu, zHighVu));
		applyMaterial(materialsSource, hitLineZ, node.physMaterial, node.name);
		physics.addStaticHitObject(hitLineZ);
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

/**
 * Story 2.2: mm/s -> physics VU/T, the SCALAR half of `devices.ts`'s own
 * `tableSpeedToPhysicsVelocity()` (re-derived here rather than imported,
 * exactly as that function's own header keeps its `/100` T-scaling local --
 * "not part of `frames.ts`'s contract"). `MM_PER_VU` is the one frame
 * constant (AD-10, `frames.ts`); the `/100` is physics's own VP TIME-UNIT
 * convention. Used only for `SlingshotSurfaceData.slingshotThreshold`, which
 * is compared directly against a physics-internal `dot` product inside the
 * frozen port (`line-seg-slingshot.ts`), so it must arrive already converted.
 */
function mmPerSToVuPerTick(speedMmPerS: number): number {
	return speedMmPerS / MM_PER_VU / 100;
}

/** Story 2.2, DW-148: the three pop nodes' collision-node names, keyed by coil -- object KEYS, never a quoted string literal (`pnpm lint:boundaries`'s device-name-literal rule), the same reasoning `flippers.ts`'s own `SIDE_BY_COIL` states for itself. The VALUE side is a plain `col_`-prefixed literal, which that rule does not restrict. (The two SLING nodes' own equivalent lives in `sim/physics/slings.ts` and is read back via `slingMechanics.nodeNameByCoil` below -- never duplicated here.) */
const POP_NODE_BY_COIL: Readonly<Record<PopCoilName, string>> = {
	c_pop_1: 'col_pop_1',
	c_pop_2: 'col_pop_2',
	c_pop_3: 'col_pop_3',
};

/** The vertex-average of a wall node's own footprint, in TABLE-frame millimetres (never physics space -- `pops.ts` compares it against `movements`' own table-frame ball positions). Derived from `footprintMm`, never hand-typed (DW-149). Coincides with the true geometric centre only for a REGULAR polygon (code review finding, this pass) -- correct for this story's three regular-octagon pop nodes, but not a general-purpose centroid: an irregular footprint would silently skew this toward its denser vertex cluster. */
function footprintCentroidMm(node: CollisionNodeDoc): { x: number; y: number } {
	const footprint = node.footprintMm;
	if (!footprint || footprint.length === 0) {
		throw new Error(`loadCollision(): node "${node.name}" has no footprintMm to derive a centroid from`);
	}
	return {
		x: footprint.reduce((sum, p) => sum + p.x, 0) / footprint.length,
		y: footprint.reduce((sum, p) => sum + p.y, 0) / footprint.length,
	};
}

function addBox(physics: PlayerPhysics, node: CollisionNodeDoc, materialsSource: (typeof TUNING)['materials']): void {
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
			applyMaterial(materialsSource, triangle, node.physMaterial, node.name);
			physics.addStaticHitObject(triangle);
		}
	}

	// DW-59: the same corner gap DW-7 already closed for walls (this file's
	// header) -- 12 HitTriangles alone cover every FACE but leave every EDGE
	// uncovered, and a ball rolling at deck height reaches an edge exactly
	// the way it reaches a wall corner. Four VERTICAL edges (fixed x/y, z
	// spanning zLow..zHigh) as HitLineZ, the identical primitive addWall()
	// already uses for its own corners; eight HORIZONTAL edges (four per z
	// level) as HitLine3D, the arbitrary-orientation primitive a
	// vertical-only HitLineZ cannot represent.
	const zLowVu = Math.min(c000.z, c001.z);
	const zHighVu = Math.max(c000.z, c001.z);
	for (const corner of [c000, c100, c010, c110]) {
		const hitLineZ = new HitLineZ(new Vertex2D(corner.x, corner.y), zLowVu, zHighVu);
		applyMaterial(materialsSource, hitLineZ, node.physMaterial, node.name);
		physics.addStaticHitObject(hitLineZ);
	}
	const horizontalEdges: ReadonlyArray<readonly [Vertex3D, Vertex3D]> = [
		[c000, c100], [c100, c110], [c110, c010], [c010, c000], // bottom face (z = min)
		[c001, c101], [c101, c111], [c111, c011], [c011, c001], // top face (z = max)
	];
	for (const [a, b] of horizontalEdges) {
		const hitLine3D = new HitLine3D(a, b);
		applyMaterial(materialsSource, hitLine3D, node.physMaterial, node.name);
		physics.addStaticHitObject(hitLine3D);
	}
}

// ---------------------------------------------------------------------------
// Flipper extraction (Story 1.6; reconciled by Story 2.1a, DW-78): derives a
// LoadedFlipper from the committed box's own bboxMm -- see this file's header
// and LoadedFlipper's own doc comment. No figure is invented:
// pivot/tip/length/half-width/z-range are all direct reads of the committed
// geometry (`lengthMm` and `halfWidthMm` are direct box measurements;
// `pivotMm` is the box's own outer end INSET by `halfWidthMm`, itself a
// direct box measurement -- never a second, independently authored figure).
// ---------------------------------------------------------------------------

function loadFlipper(doc: CollisionDoc, nodeName: string, side: 'l' | 'r'): LoadedFlipper {
	const node = findNode(doc, nodeName);
	const b = node.bboxMm;

	// Validated the same way every other node's phys_material is (an
	// authored-but-unknown value throws, naming the node) -- even though the
	// flipper's hit shape is not built here, `sim/physics/flippers.ts`
	// deliberately applies `TUNING.materials.flipper_rubber` regardless (this
	// story's own task list), not this field. The committed document's own
	// value is still checked, matching this story's I/O matrix ("Flipper node
	// is not a static box" row: "the two nodes are still validated for length
	// and material").
	resolveMaterial(TUNING.materials, node.physMaterial, node.name);

	// The box's own OUTER end is the one FARTHER from the playfield
	// x-centre (this file's own header: "x = 170 for the left bat, x = 344.4
	// for the right -- equivalently the left bat's min.x and the right bat's
	// max.x"), computed from the actual measured distances rather than
	// hard-coded per side, so a re-authored (but still axis-aligned) box is
	// still read correctly. The INNER end is the bat's free tip.
	const centreX = TABLE.reference.playfieldMm.w / 2;
	const distMin = Math.abs(b.min.x - centreX);
	const distMax = Math.abs(b.max.x - centreX);
	const outerIsMin = distMin >= distMax;
	const outerX = outerIsMin ? b.min.x : b.max.x;
	const tipX = outerIsMin ? b.max.x : b.min.x;
	const centreY = (b.min.y + b.max.y) / 2;

	// DW-78: the authored box is the WHOLE rubbered bat (FR-4, "3.125 in
	// rubbered"), so the pivot -- the mover's actual, fixed rotation axis --
	// sits one baseRadius (the box's own half-width) IN from the box's
	// outer end, never AT it (which is what let the modelled body's base
	// circle protrude 12.5 mm behind authored geometry before this story).
	// The inset moves TOWARD the tip, so it lands at the pivot's own
	// unchanged table-frame position (left 170.0 mm, right 344.4 mm) exactly
	// because `tools/make-placeholder-blend.py` authored the box to extend
	// that same baseRadius beyond it in the first place.
	const halfWidthMm = (b.max.y - b.min.y) / 2;
	const pivotX = outerIsMin ? outerX + halfWidthMm : outerX - halfWidthMm;

	return {
		name: node.name,
		side,
		pivotMm: { x: pivotX, y: centreY, z: b.min.z },
		tipMm: { x: tipX, y: centreY, z: b.min.z },
		lengthMm: b.max.x - b.min.x,
		halfWidthMm,
		zLowMm: b.min.z,
		zHighMm: b.max.z,
		physMaterial: node.physMaterial,
	};
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
 *
 * `tuning` (Story 1.9 review fix, optional, defaults to the live
 * `resolveTuning()` -- byte-identical to this function's pre-fix behaviour
 * when omitted, matching `CreateLoopOptions.tuning`'s own optional-seam
 * pattern): every non-flipper hit object's material (walls, ramps, the
 * playfield plane, the glass plane) is resolved from `tuning.materials`
 * instead of the bare module-level `TUNING` singleton, so a hot-applied
 * `materials.default.*` (or any non-flipper material) override actually
 * reaches the running sim through `createMachine(collisionDoc, tuning)` --
 * previously only `flippers.ts`'s own `flipper_rubber` read did this.
 */
export function loadCollision(doc: unknown, tuning: ResolvedTuning = resolveTuning()): LoadedCollision {
	const parsed = parseCollisionDoc(doc);
	assertReferenceDimensions(parsed);

	const materialsSource = tuning.materials;
	const physics = new PlayerPhysics();

	// Story 2.2 (AD-5): built before the node loop so its segment builders
	// are ready for addWall()'s dispatch below.
	const slingMechanics = createSlingshotMechanics({
		physics,
		thresholdVuPerTick: mmPerSToVuPerTick(tuning.hardware.slingshotThresholdMmPerS.value),
		force: tuning.hardware.slingshotForce.value,
	});
	// Reverse-lookup built from slingMechanics' OWN nodeNameByCoil (never a
	// second local copy of the coil<->node pairing) -- `CoilName`, not a
	// hand-written literal union, is the map's value type.
	const slingCoilByNodeName = new Map<string, CoilName>();
	for (const [coil, nodeName] of Object.entries(slingMechanics.nodeNameByCoil)) {
		// Code review finding, this pass: symmetric with the pop-bumper
		// node check below (":859-864") -- a renamed or removed sling node
		// must fail loudly at load time, the same "fail loudly rather than
		// silently doing nothing" principle this story's I/O matrix states
		// for a degenerate input, never silently fall through the node loop
		// below as an ordinary, un-kicked wall.
		if (!parsed.nodes.some((n) => n.name === nodeName)) {
			throw new Error(`loadCollision(): expected a slingshot node named "${nodeName}" for coil "${coil}", but the document has none`);
		}
		slingCoilByNodeName.set(nodeName, coil as CoilName);
	}

	const playfieldNode = findNode(parsed, TABLE.nodes.colPlayfield);
	const glassNode = findNode(parsed, TABLE.nodes.colGlass);
	assertPlaneShaped(playfieldNode);
	assertPlaneShaped(glassNode);

	const { normal: playfieldNormal, d: playfieldD } = toPhysicsPlane(playfieldNode.normal!, playfieldNode.dMm!);
	const playfieldPlane = new HitPlane(new Vertex3D(playfieldNormal.x, playfieldNormal.y, playfieldNormal.z), playfieldD);
	applyMaterial(materialsSource, playfieldPlane, playfieldNode.physMaterial, playfieldNode.name);
	physics.setPlayfieldHit(playfieldPlane);

	const { normal: glassNormal, d: glassD } = toPhysicsPlane(glassNode.normal!, glassNode.dMm!);
	const glassPlane = new HitPlane(new Vertex3D(glassNormal.x, glassNormal.y, glassNormal.z), glassD);
	applyMaterial(materialsSource, glassPlane, glassNode.physMaterial, glassNode.name);
	physics.setTopGlassHit(glassPlane);

	// Story 1.6: the two flipper nodes are dispatched to loadFlipper() instead
	// of addBox() below -- a moving bat must not ALSO exist as static
	// geometry (DW-60). Their names are resolved once, outside the loop, so
	// the loop's own dispatch is a plain Set membership test.
	const flipperNodeNames = new Set<string>([TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR]);

	for (const node of parsed.nodes) {
		if (node.name === playfieldNode.name || node.name === glassNode.name) {
			continue; // already installed as the playfield/glass planes above
		}
		if (flipperNodeNames.has(node.name)) {
			continue; // handled by loadFlipper() below, never a static hit object
		}
		if (node.shape === 'plane') {
			throw new Error(`loadCollision(): node "${node.name}" is an unexpected plane-shaped node -- only col_playfield and col_glass may be plane-shaped`);
		}
		if (node.shape === 'wall') {
			const slingCoil = slingCoilByNodeName.get(node.name);
			const slingBuilder = slingCoil && slingCoil in slingMechanics.segmentBuilderByCoil
				? slingMechanics.segmentBuilderByCoil[slingCoil as keyof typeof slingMechanics.segmentBuilderByCoil]
				: undefined;
			addWall(physics, node, materialsSource, slingBuilder);
		} else {
			addBox(physics, node, materialsSource);
		}
	}

	physics.finalizeStatics();

	// Story 2.2, DW-148: each pop bumper's centroid, derived from its OWN
	// node's footprint -- a separate pass over `parsed.nodes` (not
	// interleaved with the hit-object construction above, which needs no
	// special-casing for the three pop nodes at all: their collision
	// response is ordinary `addWall()` output, driven entirely by their
	// `bumper` material).
	const popCentroidsMm = {} as { -readonly [K in PopCoilName]: { x: number; y: number } };
	for (const [coil, nodeName] of Object.entries(POP_NODE_BY_COIL) as Array<[PopCoilName, string]>) {
		const popNode = parsed.nodes.find((n) => n.name === nodeName);
		if (!popNode) {
			throw new Error(`loadCollision(): expected a pop-bumper node named "${nodeName}" for coil "${coil}", but the document has none`);
		}
		popCentroidsMm[coil] = footprintCentroidMm(popNode);
	}

	const flippers: LoadedFlipper[] = [
		loadFlipper(parsed, TABLE.nodes.colFlipperL, 'l'),
		loadFlipper(parsed, TABLE.nodes.colFlipperR, 'r'),
	];

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

	const devices: LoadedDevice[] = parsed.devices.map((device) => {
		if (!(device.name in TABLE.ballDevices)) {
			// AD-16 Conventions: load-time paths throw -- an unknown device name
			// must not be silently cast and handed to the caller, the same
			// discipline the switch-zone guard above already applies.
			throw new Error(`loadCollision(): document.devices names an unknown ball device "${device.name}"`);
		}
		return {
			name: device.name as BallDeviceName,
			ejectPose: device.ejectPose,
		};
	});

	// DW-69: the REVERSE of the check just above -- every TABLE.ballDevices
	// entry must have a matching document.devices entry, not merely every
	// document entry a known TABLE name. Before this check, a `TABLE`
	// registry entry with no `.blend` object behind it (a typo'd node name,
	// or a device declared in TypeScript before its Blender counterpart was
	// drawn) loaded successfully with a silently short `devices` array --
	// the wiring only failed later, at the first `pulse` of that device's
	// eject coil, as a permanent runtime `eject_failed` with no load-time
	// signal at all. AD-17 requires load-time faults to reach the boot error
	// panel instead.
	const loadedDeviceNames = new Set(devices.map((device) => device.name));
	for (const deviceName of Object.keys(TABLE.ballDevices) as BallDeviceName[]) {
		if (!loadedDeviceNames.has(deviceName)) {
			throw new Error(
				`loadCollision(): TABLE.ballDevices declares "${deviceName}", but the collision document has no matching devices[] entry (DW-69) -- add a "${deviceName}" empty to assets/src/dragonwar.blend and re-export`,
			);
		}
	}

	return {
		physics,
		switchZones,
		devices,
		flippers,
		slingSurfaceData: slingMechanics.surfaceData,
		drainSlingKicks: () => slingMechanics.drainKicks(),
		popCentroidsMm,
	};
}
