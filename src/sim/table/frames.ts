// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-10: the one file in the repository that converts units or axes between
// the table, glb, physics and scene frames. If another file needs a
// conversion, it imports one from here -- nothing else may perform one.
//
// The table frame (AD-10): playfield-local millimetres, right-handed, origin
// bottom-left nearest the player, X right, Y up the playfield, Z toward the
// glass. Geometry is authored UNPITCHED in this frame; pitch is applied
// separately, as a rotation of `playfield_root` about `pivot_pitch`
// (presentation) or as physics's gravity vector -- never baked into a mesh
// or a conversion here.
//
// Axis mapping (measured, this story's Code Map "Verified environment
// facts"): an object at Blender `(0.1, 0.2, 0.03)` m exported to glTF
// translation `(0.1, 0.03, -0.2)` -- so glb `(x, y, z)` = blender
// `(bx, bz, -by)`. Authoring `assets/src/dragonwar.blend` directly in the
// table frame, in metres, makes this exactly AD-10's own statement: "glb +X =
// table +X; glb +Y = table +Z; glb -Z = table +Y". Inverting:
//   glbToTable(v) = { x: v.x * 1000, y: -v.z * 1000, z: v.y * 1000 }
//
// `toScene()` is `glbToTable()`'s exact inverse permutation, in metres rather
// than millimetres: Babylon's scene is loaded with `useRightHandedSystem =
// true` (src/presentation/scene/create-engine.ts) and glTF's own coordinate
// system is right-handed Y-up, so Babylon's glTF loader places an imported
// node at its glTF-authored coordinates unchanged -- the scene frame and the
// glb frame are numerically identical. That is why `glbToTable(v)` followed
// by `toScene(...)` returns `v` exactly (this story's own round-trip
// acceptance criterion, and `test/frames.test.ts`).
//
// `toPhysics()`/`fromPhysics()`: physics keeps its ported internal VP units
// (`MM_PER_VU = 0.53975`, matching `tools/spike-1/scene.ts`'s harness-local
// constant and AD-10) and its own y axis runs DOWN-SLOPE toward the player --
// `PlayerPhysics.setGravity()` sets `gravity.y = sin(slopeDeg) * strength`,
// a positive value that accelerates a resting ball toward +y (Code Map,
// "Verified upstream facts"). The table frame's own +Y runs UP the playfield,
// away from the player, so physics y is the table's y flipped about the
// playfield's far edge (`TABLE.reference.playfieldMm.h`):
//   physicsY = (h - tableY) / MM_PER_VU
// `fromPhysics()` is required, not merely nice to have: `Snapshot.balls[].pos`
// is documented table-frame millimetres (`sim/contracts/snapshot.ts`) while
// physics keeps VP units internally, so Story 1.5 must convert physics state
// back to the table frame every frame, and AD-10 forbids doing that anywhere
// but here. Table z (toward the glass) and physics z (height above the
// playfield plane) point the same physical direction, so z scales with no
// flip in either physics conversion.

import { TABLE } from './dragonwar';

/** One VP length unit in millimetres (AD-10; matches `tools/spike-1/scene.ts`'s harness-local constant of the same value). Lives here and nowhere else in `src/`. */
export const MM_PER_VU = 0.53975;

/** A plain, structured-cloneable 3-vector -- no frame of its own; the function name says which frame it is read as. */
export interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/**
 * glb metres (Y-up) -> table millimetres. Load-only: nothing in this project
 * writes a position back into a glb, so no inverse is exported.
 */
export function glbToTable(v: Vec3): Vec3 {
	return { x: v.x * 1000, y: -v.z * 1000, z: v.y * 1000 };
}

/**
 * Table millimetres -> scene metres (Babylon, right-handed, `useRightHandedSystem
 * = true`) -- `glbToTable()`'s exact inverse permutation, scaled the other
 * way. One-way: nothing in this project reads a position back out of the
 * renderer, so no inverse is exported.
 */
export function toScene(v: Vec3): Vec3 {
	return { x: v.x / 1000, y: v.z / 1000, z: -v.y / 1000 };
}

/**
 * Table millimetres -> physics VP units, y flipped about the playfield's far
 * edge so physics +y runs down-slope toward the player, matching
 * `PlayerPhysics.setGravity()`'s convention.
 */
export function toPhysics(v: Vec3): Vec3 {
	const heightMm = TABLE.reference.playfieldMm.h;
	return {
		x: v.x / MM_PER_VU,
		y: (heightMm - v.y) / MM_PER_VU,
		z: v.z / MM_PER_VU,
	};
}

/**
 * Physics VP units -> table millimetres -- `toPhysics()`'s exact inverse.
 * Required (not merely convenient): `Snapshot.balls[].pos` is documented
 * table-frame millimetres while physics keeps VP units internally, so this is
 * the one function a per-frame snapshot publisher (Story 1.5) may call to
 * cross that boundary.
 */
export function fromPhysics(v: Vec3): Vec3 {
	const heightMm = TABLE.reference.playfieldMm.h;
	return {
		x: v.x * MM_PER_VU,
		y: heightMm - v.y * MM_PER_VU,
		z: v.z * MM_PER_VU,
	};
}

/**
 * A table-frame plane (`normal`, unit vector, and `dMm` such that
 * `normal . p = dMm` for any point `p` on the plane, in table millimetres)
 * converted to its physics-frame equivalent. `toPhysics()`'s linear part is
 * `diag(1/MM_PER_VU, -1/MM_PER_VU, 1/MM_PER_VU)` (a reflection about y); its
 * exact inverse-transpose is `diag(MM_PER_VU, -MM_PER_VU, MM_PER_VU)`, so a
 * unit table-frame normal maps to `(nx, -ny, nz)` (still unit, since the
 * diagonal's magnitude is uniformly `MM_PER_VU` on every axis), and the
 * plane constant follows from substituting the inverse transform into
 * `normal . p = d`. Relocated here from `src/sim/physics/loader` (review
 * finding, this story's review pass): this file is the one converter (AD-10),
 * and a plane is exactly as much a unit/axis conversion as a point is.
 */
export function toPhysicsPlane(normal: Vec3, dMm: number): { normal: Vec3; d: number } {
	const heightMm = TABLE.reference.playfieldMm.h;
	const physicsNormal: Vec3 = { x: normal.x, y: -normal.y, z: normal.z };
	const d = (dMm - normal.y * heightMm) / MM_PER_VU;
	return { normal: physicsNormal, d };
}
