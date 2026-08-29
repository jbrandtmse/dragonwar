// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-5, AD-11, AD-15 -- the authored seam between the committed
// collision geometry (`sim/physics/loader`'s `LoadedFlipper`, Blender-owned
// placement) and the two PORTED files (`flipper-mover.ts`, `flipper-hit.ts`)
// that consume it. Upstream's `FlipperMover`/`FlipperHit` read their geometry
// and physics parameters from `FlipperData` (a VPX BIFF-loaded item, out of
// scope per AD-1) plus a `FlipperConfig` a `Table`-driven factory
// (`FlipperHit.getInstance()`) builds from it. Neither the BIFF-loading path
// nor a `Table`/`TableData` type is ported (AD-1: no table-loading API); this
// file supplies the same two shapes -- `FlipperConfig` (upstream's own
// `lib/vpt/flipper/flipper.ts` interface, reproduced structurally here, not
// copied from a licensed file) and a minimal, authored `FlipperPhysicsData`
// carrying only the fields the port actually reads -- built instead from a
// `LoadedFlipper` (Blender's own pivot/length/z-range) and `ResolvedTuning`'s
// `TUNING.flipper` group (Story 1.6's transcribed mover parameters).
//
// No geometric figure is invented (AD-11's "no geometric figure for either
// flipper is written into src/**"): `baseRadius` is read directly from the
// committed box's own half-width; `endRadius` and `flipperRadius` are
// SCALED/DERIVED from it using a dimensionless ratio transcribed from vpx-js's
// own defaults (`TUNING.flipper.endRadiusRatio`), never a new absolute figure.
// The one angle the box cannot carry (its bboxMm has no notion of "rotated")
// is handled the way this story's Design Notes describe: `angleEnd` is
// derived from the committed pivot->tip direction itself (so it needs no
// authored number at all), and `angleStart` swings that same direction back
// by the ported sweep magnitude (`TUNING.flipper.sweepDeg`), picking the one
// of the two candidate rotations whose resulting direction leans toward
// physics +Y (`sim/table/frames.ts`'s own "physics +y runs down-slope toward
// the player" convention) -- i.e. the rest pose droops toward the player, the
// way a real flipper's does, decided purely from the geometry rather than a
// hand-picked per-side sign.

import { degToRad } from '../math/float';
import { Vertex2D } from '../math/vertex2d';
import { MM_PER_VU, toPhysics } from '../../table/frames';
import type { ResolvedTuning } from '../../table/tuning';
import type { LoadedFlipper } from '../loader';

/**
 * The plain-data geometry/kinematic-range config `FlipperMover`/`FlipperHit`
 * consume. Reproduces upstream's `lib/vpt/flipper/flipper.ts` `FlipperConfig`
 * interface shape (authored fresh here, not copied from that file -- AD-1
 * forbids porting the table-loading path it belongs to). `center` and the
 * three radii are physics units (VU); `angleStart`/`angleEnd` are radians;
 * `zLow`/`zHigh` are physics units.
 */
export interface FlipperConfig {
	readonly center: Vertex2D;
	readonly baseRadius: number;
	readonly endRadius: number;
	readonly flipperRadius: number;
	readonly angleStart: number;
	readonly angleEnd: number;
	readonly zLow: number;
	readonly zHigh: number;
}

/**
 * The minimal structural stand-in for upstream's `FlipperData` -- only the
 * fields `FlipperMover`/`FlipperHit` actually read. Deviation: drops every
 * `override*` field and `doOverridePhysics()`'s branch entirely (DragonWar
 * has no per-table physics-override system, AD-1); every getter in the
 * ported mover reads these fields directly. `torqueDampingAngleDeg` stays in
 * DEGREES, matching upstream's own convention of converting at the point of
 * use (`degToRad()` inside `FlipperMover`), not at authoring time.
 */
export interface FlipperPhysicsData {
	readonly isEnabled: boolean;
	readonly mass: number;
	readonly strength: number;
	readonly rampUp: number;
	readonly returnRatio: number;
	readonly torqueDamping: number;
	readonly torqueDampingAngleDeg: number;
}

/**
 * The minimal structural stand-in for upstream's `FlipperState` -- only the
 * one field (`angle`, radians) both ported files read and write. Upstream's
 * own `FlipperState` extends a pooled, diffable `ItemState` carrying
 * rendering fields (`center`, `material`, `texture`, `rubberMaterial`,
 * `isVisible`) that belong to the VPX item-rendering/scripting system, out of
 * scope per AD-1 -- `MechanismsSnapshot.flippers` (Story 1.3's own contract)
 * is this project's rendering-facing state instead.
 */
export interface FlipperState {
	angle: number;
}

/**
 * Builds the geometry config for one flipper from its Blender-derived
 * pivot/tip/length/half-width/z-range (`LoadedFlipper`) and the ported
 * dimensionless ratios in `tuning.flipper`. See this file's header for how
 * `angleStart`/`angleEnd` are derived with no invented figure.
 */
export function buildFlipperConfig(flipper: LoadedFlipper, tuning: ResolvedTuning): FlipperConfig {
	const pivotPhys = toPhysics(flipper.pivotMm);
	const tipPhys = toPhysics(flipper.tipMm);
	const dx = tipPhys.x - pivotPhys.x;
	const dy = tipPhys.y - pivotPhys.y;
	// The ported mover's OWN angle convention (verified against the pinned
	// source, hitTestFlipperEnd()'s `vp = (0, -flipperRadius)` at angle 0,
	// rotated by the standard `x' = x cosθ - y sinθ, y' = y cosθ + x sinθ`):
	// at angle 0 the tip sits at local (0, -R) -- due local "-Y" from the
	// pivot, NOT local "+X". Solving `R sinθ = dx, -R cosθ = dy` for θ gives
	// `atan2(dx, -dy)`, not the more natural-looking `atan2(dy, dx)` (which
	// would rotate the whole modelled shape 90° away from the real one -- a
	// ball rolling straight down the real bat's length then meets no
	// collision at all, reproduced and diagnosed during this story's
	// implementation pass). The end-of-stroke (driven, tip-inward) pose IS
	// the committed geometry -- no authored angle needed at all.
	const angleEnd = Math.atan2(dx, -dy);

	const sweepRad = degToRad(tuning.flipper.sweepDeg.value);
	const candidatePlus = angleEnd + sweepRad;
	const candidateMinus = angleEnd - sweepRad;
	// Pick whichever swing leans the tip toward physics +Y ("down-slope
	// toward the player", frames.ts) -- the rest pose droops toward the
	// player, same as a real flipper's, decided from the geometry rather
	// than a per-side literal. Under this convention the tip's own physics-Y
	// offset is `-R cos(angle)`, so "leans toward +Y" means the SMALLER
	// cos(angle) of the two candidates.
	const angleStart = Math.cos(candidatePlus) <= Math.cos(candidateMinus) ? candidatePlus : candidateMinus;

	const baseRadiusMm = flipper.halfWidthMm;
	const endRadiusMm = baseRadiusMm * tuning.flipper.endRadiusRatio.value;
	// The tip's OUTER edge (the committed box's own far end) sits at
	// flipperRadius + endRadius from the pivot (upstream's own "center-to-center
	// radius" convention for flipperRadius) -- so flipperRadius is the
	// committed length minus the derived endRadius, never a second invented
	// figure. Floored well above zero so a pathological (near-zero) box can
	// never produce a degenerate or negative arm.
	const flipperRadiusMm = Math.max(flipper.lengthMm - endRadiusMm, 0.01);

	const zLow = toPhysics({ x: 0, y: 0, z: flipper.zLowMm }).z;
	const zHigh = toPhysics({ x: 0, y: 0, z: flipper.zHighMm }).z;

	return {
		center: new Vertex2D(pivotPhys.x, pivotPhys.y),
		baseRadius: baseRadiusMm / MM_PER_VU,
		endRadius: endRadiusMm / MM_PER_VU,
		flipperRadius: flipperRadiusMm / MM_PER_VU,
		angleStart,
		angleEnd,
		zLow,
		zHigh,
	};
}

/** Builds the mover's physics-data stand-in from `TUNING.flipper` -- see `FlipperPhysicsData`'s own doc comment for what is deliberately not carried. */
export function buildFlipperPhysicsData(tuning: ResolvedTuning): FlipperPhysicsData {
	return {
		isEnabled: true,
		mass: tuning.flipper.mass.value,
		strength: tuning.flipper.strength.value,
		rampUp: tuning.flipper.rampUp.value,
		returnRatio: tuning.flipper.returnRatio.value,
		torqueDamping: tuning.flipper.torqueDamping.value,
		torqueDampingAngleDeg: tuning.flipper.torqueDampingAngleDeg.value,
	};
}
