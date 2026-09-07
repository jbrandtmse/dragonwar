// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8 -- the insert channel's one Babylon touchpoint (AD-12's own
// `LampDriver`). Free-function-plus-`WeakMap`, the same shape
// `presentation/backglass/backglass.ts` and `presentation/scene/balls.ts`
// already use -- there is no class anywhere under `src/presentation/`
// (Design Notes: "AD-12 names LampDriver as a concept... this shape is
// conforming, not a deviation").
//
// Four measured traps this file exists to close (Design Notes, "The four
// measured traps"), each with its own fix inline below:
//  1. The glb's fourteen inserts all share ONE `mat_insert` datablock --
//     `material.clone()` PER INSERT on first use, so lighting one insert
//     never lights another.
//  2. `ShadowLight.getAbsolutePosition()` lies under `NullEngine` (reads
//     stale `position` instead of the pitched world transform) -- this file
//     never calls it; `test/lighting-scene.test.ts` asserts world position
//     via `computeWorldMatrix(true).getTranslation()` instead, which is
//     this file's problem to make correct, not to read around.
//  3. `mat_insert`'s loader-default `maxSimultaneousLights` (4) would
//     silently truncate a light list -- `includedOnlyMeshes = [own mesh]`
//     keeps each insert's own light list to the hemispheric light plus
//     exactly one PointLight, never five.
//  4. `scene.lights` counts DISABLED lights too -- the live budget below
//     counts only lights this function itself enables this call.
//
// HIGH 2 (rework iteration 2, `## Spec Change Log`, author-overruled the
// deferral to Story 4.2): a real pinball insert is a translucent lens lit
// from beneath -- AC 4/AC 5's own words. The lens top's surface normal is
// +table-z and this light sits strictly beneath it, so N.L < 0
// UNCONDITIONALLY across the whole face (HIGH 2's own diagnosis, re-proved
// by `test/lighting-scene.test.ts`'s HIGH-2b geometric-half test): the
// ordinary (front-lit, clamped-NdotL) diffuse term this light contributes to
// that face is always exactly zero, and only a TRANSLUCENT material's
// transmitted term (computed from the UNCLAMPED, negative NdotL) can ever
// make this light visible at all. See `entryFor()` below for the two
// concrete traps this addition closes (unbounded inverse-square attenuation
// at millimetre range, and how much of the -- already zero -- ordinary term
// to trade away).
//
// HIGH 2c (rework iteration 4, `## Spec Change Log`): with the transmissive
// configuration above genuinely applied and genuinely computing a non-zero
// contribution, a real-browser A/B (`setLightBudget(0)` vs the default
// budget) still measured a BIT-IDENTICAL pixel. Root cause, measured rather
// than assumed: every one of `grammar.ts`'s six authored role colours has
// at least one channel pinned to exactly `0` or `1`, and this scene runs
// with no exposure/tonemap pipeline anywhere (`create-engine.ts` configures
// none). With no headroom above the LDR ceiling of `1.0`, the RAW emissive
// alone already saturates any 1-valued channel before the transmitted
// term is ever added on top -- and a value added above a hard ceiling
// clips losslessly to nothing observable, at any magnitude (measured: an
// 80x/57x intensity sweep, and a 50x emissive sweep, both moved the
// composited pixel by exactly zero).
//
// HIGH 2d (author decision, "option A"): retune the EMISSIVE alone to
// leave real per-channel headroom, so the transmitted term has somewhere
// to land. See `INSERT_EMISSIVE_LEVEL` below.

import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { getRequiredNode } from '../scene/playfield';
import { toScene } from '../../sim/table/frames';
import { TABLE } from '../../sim/table/dragonwar';
import { TUNING } from '../../sim/table/tuning';
import type { LampName } from '../../sim/table/names';
import { isLampOnAt, lookupGrammar } from './grammar';
import type { LampView } from './lamp-view';

/**
 * AD-10, AD-11: "beneath the lens" is table -z, into the playfield --
 * z ~= -4 mm sits inside every insert's cup (cup z spans -7 .. -1 mm, so
 * -4 mm is its own midpoint) regardless of whether that insert is a
 * 20 x 20 mm lane cup or a 10 x 10 mm letter cup. Converted with `toScene()`
 * only (AD-10); no other arithmetic on a table-frame value appears in this
 * file.
 *
 * Exported (code review, HIGH 2b): `test/lighting-scene.test.ts`'s
 * geometric-half pinning test reads this SAME constant rather than
 * re-typing `-4` -- a re-typed literal would drift silently if this value
 * ever moved, and the checklist's own named Rule-19 mutation is "raise
 * `INSERT_LIGHT_TABLE_Z_MM` above the lens top", which only reddens a test
 * that reads the live constant.
 */
export const INSERT_LIGHT_TABLE_Z_MM = -4;

/**
 * HIGH 2's own WARNING, measured rather than assumed: `mat_insert` (the
 * SHARED source material) has `usePhysicalLightFalloff = true`, so by
 * default this light's attenuation is `1 / distance^2`
 * (`computeDistanceLightFalloff_Physical`,
 * `pbrDirectLightingFalloffFunctions.js`) -- UNBOUNDED as distance -> 0.
 * This light sits `INSERT_LIGHT_TABLE_Z_MM` below a lens top only ~3.7 mm
 * away (cup z spans -7 .. -1 mm; the lens top is recessed to -0.3 mm by the
 * HIGH-1 fix), so inverse-square gives an attenuation on the order of
 * `1 / 0.0037^2 ~= 73,000`. Multiplied through every grammar intensity
 * (1.0 / 1.4 / 1.8), every channel clips to 1.0 and an authored orange or
 * blue lamp reads as flat white -- destroying the very `(role, step)`
 * colour grammar this story exists to deliver.
 *
 * `light.falloffType` is a PER-LIGHT override, not a material-wide one:
 * `materialHelper.functions.js`'s `PrepareDefinesForLights` sets a
 * per-light `LIGHT_FALLOFF_STANDARD{n}` shader define straight from this
 * property, and `lightFragment.js` checks that per-light define BEFORE
 * falling back to the material's own `USEPHYSICALLIGHTFALLOFF` default --
 * so setting it on this one `PointLight` changes only THIS insert's own
 * light, never `mat_insert`'s shared setting and never any other light in
 * the scene (including the scene's single `HemisphericLight`, which does
 * not use distance falloff at all).
 *
 * `computeDistanceLightFalloff_Standard(offset, range) =
 * max(0, 1 - |offset| / range)` is mathematically BOUNDED to `[0, 1]` for
 * every distance -- never a millimetre-scale singularity -- so multiplying
 * a grammar intensity by it can only ever SHRINK that intensity, never blow
 * it past the clamp and wash the colour to white.
 *
 * The range itself is authored, not left at the light's own default
 * (`Number.MAX_VALUE`, which would make the falloff a no-op): comfortably
 * beyond the largest cup's own half-diagonal (the 20 x 20 mm lane/Lock cup,
 * ~14.1 mm) plus this light's own depth below the lens (~3.7 mm), i.e.
 * ~14.6 mm worst case -- so `computeDistanceLightFalloff_Standard` stays a
 * smooth ~0.71 .. ~0.93 across the WHOLE lens face for every insert
 * (lane/Lock and letter cups alike), never approaching the ramp's own zero
 * tail within the insert's own footprint.
 *
 * Exported (review, rework iteration 3 follow-up): so
 * `test/lighting-scene.test.ts` can pin `light.range` against the live
 * constant instead of re-typing `0.05` -- the WARNING's own named fix had no
 * test at all before this; a reverted-to-default falloff/range would have
 * left `pnpm test` fully green while silently reintroducing the ~73,000x
 * clip-to-white regression this constant exists to close.
 */
export const INSERT_LIGHT_RANGE_M = 0.05;

/**
 * `1.0` here is a proven value, not a knob maxed out for effect
 * (HIGH 2's own WARNING: "a real trade, not a knob to max out").
 * `lightFragment.js` trades the ordinary (front-lit) diffuse term for the
 * transmitted one exactly along this axis:
 * `info.diffuse = computeDiffuseLighting(...) * (1.0 - translucencyIntensity)`.
 * `computePointAndSpotPreLightingInfo` clamps that ordinary term's own
 * `NdotL` with `saturateEps(NdotLUnclamped)` -- and this light's
 * `NdotLUnclamped` is negative EVERYWHERE on the lens top face (the module
 * header above, and `test/lighting-scene.test.ts`'s geometric-half test,
 * both establish `N.L < 0` unconditionally for a light strictly beneath a
 * +table-z face), so the ordinary term this trade scales away is already
 * exactly zero at every point this light can ever reach. Trading 100% of a
 * genuinely-zero quantity for the transmitted term costs nothing -- it is
 * not "maxing out a knob", it is recognising the knob has nothing else on
 * it for this particular light/surface pair.
 *
 * Exported (review, rework iteration 3 follow-up): so
 * `test/lighting-scene.test.ts`'s material-half test can assert the EXACT
 * authored value rather than merely `toBeGreaterThan(0)`, which caught
 * neither a wrong non-zero value nor -- stated plainly, not overclaimed --
 * this one specific case: Babylon's own `PBRSubSurfaceConfiguration`
 * constructor already defaults `translucencyIntensity` to `1` (measured:
 * its own field initializer). Verified directly (Rule 19): deleting this
 * assignment line entirely leaves `translucencyIntensity` at that SAME `1`
 * by coincidence, so the exact-match assertion below still passes -- not
 * because the assertion is blind, but because that specific mutation is
 * behaviourally a no-op at the CURRENT value of `1.0`. The exact-match
 * assertion genuinely does catch a wrong non-zero value (e.g. a future
 * retune to `0.8` landing here as a typo'd `0.5`) and the spec's own named
 * "force to 0" mutation; it does not, and structurally cannot, distinguish
 * "this line runs" from "this line is absent" for the one value that
 * happens to equal the library default.
 */
export const INSERT_TRANSLUCENCY_INTENSITY = 1.0;

/**
 * HIGH 2d (`## Spec Change Log`, author decision, "option A" -- retune the
 * emissive to leave headroom, so the lamp beneath supplies the rest).
 *
 * The measured cause of HIGH 2c: every one of `grammar.ts`'s six authored
 * role colours -- PRD FR-44's own colour words, left COMPLETELY untouched
 * by this constant -- has at least one channel at exactly `0` or `1`
 * (`lit=(1,1,1)`, `hurryup=(1,0,0)`, `quickmb=(0,1,0)`, `joust=(0,0,1)`,
 * `dragon=(1,0.5,0)`, `special=(0.6,0,1)`), and this scene configures no
 * `ImageProcessingConfiguration`/exposure/tonemap anywhere
 * (`create-engine.ts`, grepped directly). With zero headroom above the LDR
 * ceiling of `1.0`, `entry.material.emissiveColor` ALONE already saturates
 * any 1-valued channel before the transmissive light's own genuinely
 * non-zero contribution (HIGH 2's own doc block above) is ever added on
 * top -- and a value added above a hard render-target ceiling clips
 * losslessly, at any magnitude (measured directly: an 80x/57x light-
 * intensity sweep and a 50x emissive sweep both moved the composited pixel
 * by exactly zero).
 *
 * The fix leaves real per-channel headroom by scaling the material's own
 * `emissiveColor` by this factor -- never `grammar.r/g/b` themselves (PRD
 * FR-44's colour words stay the authored colour of record, pinned exactly
 * by `test/lighting-grammar.test.ts`) and never `light.diffuse` (which
 * keeps the FULL role colour below, so the transmitted term restores what
 * the dimmed emissive gave up, rather than compounding the dimming).
 *
 * `0.6` is inside the author's own authorised band (roughly `0.5..0.7`):
 * a lit surface at `0.6` leaves `0.4` of representable range for the
 * transmitted term to land in instead of being thrown away by the clip,
 * while sitting clear of both ends of that band -- nearer `0.5` would dim
 * the table's default "lit" reading more than the fix requires, and nearer
 * `0.7` would leave under half the headroom this constant is chosen for.
 *
 * Not a `tuning.ts` key -- same reasoning as `INSERT_LIGHT_RANGE_M` and
 * `INSERT_TRANSLUCENCY_INTENSITY` above: `resolveTuning()`'s whole
 * serialized output is hashed into every golden's `gameStart.tuning`
 * header, so a new tunable would re-record all five for a presentation-
 * only constant with no consumer outside this one Babylon touchpoint.
 *
 * Exported so `test/lighting-scene.test.ts` computes its expected emissive
 * colour from this SAME constant rather than re-typing `0.6` -- a
 * re-typed literal would drift silently the next time this value is
 * retuned.
 */
export const INSERT_EMISSIVE_LEVEL = 0.6;

interface LampDriverEntry {
	readonly material: PBRMaterial;
	readonly light: PointLight;
}

const entriesByScene = new WeakMap<Scene, Map<LampName, LampDriverEntry>>();

function entriesFor(scene: Scene): Map<LampName, LampDriverEntry> {
	let entries = entriesByScene.get(scene);
	if (!entries) {
		entries = new Map<LampName, LampDriverEntry>();
		entriesByScene.set(scene, entries);
	}
	return entries;
}

/**
 * Resolves `lampName`'s mesh and, on the FIRST call for it in this `scene`,
 * clones its shared `mat_insert` material (trap 1) and creates its own
 * `PointLight`, positioned at its own lens/cup footprint's (x, z) centre --
 * read off the mesh's own LOCAL bounding box, which is exactly that centre
 * in scene units already (the mesh's authored object transform is identity,
 * AD-11) -- with the Y (table z) component fixed at
 * `INSERT_LIGHT_TABLE_Z_MM` rather than the combined lens+cup bbox's own
 * (wrong) vertical midpoint. Resolved and validated BEFORE anything is
 * cached: a scene missing the node, or whose node carries no material,
 * throws naming it on EVERY call, never only the first, and never leaves an
 * orphan cache entry behind (the I/O matrix's own "Scene missing an insert
 * node" row).
 *
 * [Code review pass 2 corrected this doc: it used to cite
 * `backglass.ts:59-74` as "its own idiom", but `backglass.ts` returns from
 * its `WeakMap` BEFORE resolving. Both orders give the same failure
 * behaviour (a failed call caches nothing, so the next call throws again);
 * they differ only on the success path, where this order re-resolves all
 * fourteen nodes on every render frame and `backglass.ts` resolves once.
 * That cost is deliberate here and is what the I/O matrix row asks for --
 * but it is a divergence from the cited precedent, not a copy of it.]
 */
function entryFor(scene: Scene, playfieldRoot: TransformNode, lampName: LampName): LampDriverEntry {
	const node = getRequiredNode(scene, lampName) as AbstractMesh;
	const cached = entriesFor(scene).get(lampName);
	if (cached) {
		return cached;
	}

	const material = node.material as PBRMaterial | null;
	if (!material) {
		throw new Error(`lamp-driver.ts: insert "${lampName}" has no material to carry its emissive colour or its light`);
	}
	const clone = material.clone(`mat_insert_${lampName}`) as PBRMaterial;
	node.material = clone;

	// HIGH 2 (rework iteration 2): the lens is a translucent surface lit
	// from beneath, not an opaque one lit from the front. `subSurface`
	// (`PBRSubSurfaceConfiguration`) deep-copies on `clone()` -- a distinct
	// plugin object with distinct `Color3` instances, every relevant field
	// `@serialize()`-decorated (measured, not assumed:
	// `pbrMaterial.pure.js:1192-1206` -> `materialPluginBase.pure.js:249-251`)
	// -- so this stays genuinely per-insert, the same fit trap 1 above needs.
	clone.subSurface.isTranslucencyEnabled = true;
	// `transmittanceBRDF_Burley(tintColor, diffusionDistance, thickness)`
	// returns `tintColor` EXACTLY at `thickness = 0`
	// (`pbrBRDFFunctions.js:173`: `tintColor * 0.25 * (temp^3 + 3*temp)` with
	// `temp = exp(0) = 1` collapses to `tintColor * 1.0`). `tintColor`'s own
	// default is white, so the transmitted term carries the light's colour
	// undiluted. `0` also removes a silent world-scale dependence (thickness
	// is world-scaled, `pbrSubSurfaceConfiguration.js:588-590`) that would
	// otherwise bite the moment anyone re-scales `playfield_root`.
	clone.subSurface.maximumThickness = 0;
	clone.subSurface.translucencyIntensity = INSERT_TRANSLUCENCY_INTENSITY;

	const localCenter = node.getBoundingInfo().boundingBox.center;
	const lightSceneY = toScene({ x: 0, y: 0, z: INSERT_LIGHT_TABLE_Z_MM }).y;
	const light = new PointLight(`light_${lampName}`, new Vector3(localCenter.x, lightSceneY, localCenter.z), scene);
	light.parent = playfieldRoot;
	light.includedOnlyMeshes = [node];
	// HIGH 2: see `INSERT_LIGHT_RANGE_M`'s own doc comment above -- a
	// per-light falloff override, never touching `mat_insert`'s own
	// `usePhysicalLightFalloff`, so no other light or material in the scene
	// is affected.
	light.falloffType = PointLight.FALLOFF_STANDARD;
	light.range = INSERT_LIGHT_RANGE_M;
	light.setEnabled(false);

	const entry: LampDriverEntry = { material: clone, light };
	entriesFor(scene).set(lampName, entry);
	return entry;
}

/**
 * Drives every `TABLE.lamps` insert's emissive material and its own
 * dynamic light from `view` (AD-12, AC 4, AC 5). Idempotent -- safe to call
 * every render-loop frame, exactly like `syncBalls()`/`syncBackglass()`.
 *
 * A lamp `view` has no entry for (never yet named by any `LampCommand`) is
 * treated as `{ role: 'off', step: 0 }` -- the same value `lampsOf()` itself
 * would project for it at boot.
 *
 * At most `options.budget ?? TUNING.liveLightBudget.value` lights are left
 * ENABLED (trap 4: `scene.lights` itself counts disabled lights too, so the
 * cap is enforced by this function's own running count, iterating
 * `TABLE.lamps` in its declared order); every lit insert beyond that budget
 * still shows its emissive colour, with no light at all.
 */
export function syncLamps(scene: Scene, playfieldRoot: TransformNode, view: LampView, nowMs: number, options?: { readonly budget?: number }): void {
	const budget = options?.budget ?? TUNING.liveLightBudget.value;
	let enabledCount = 0;

	for (const lampName of Object.keys(TABLE.lamps) as LampName[]) {
		const entry = entryFor(scene, playfieldRoot, lampName);
		const projection = view[lampName] ?? { role: 'off' as const, step: 0 as const };
		const grammar = lookupGrammar(projection.role, projection.step);
		// Code review pass 2: this condition MUST be the same one
		// `lookupGrammar()` itself applies (`role === 'off' || step === 0`
		// -> `OFF_LOOKUP`), or the two modules read one `(role, step)` pair
		// two different ways. AD-9 makes step 0 the OFF step for every role,
		// so `{ role: 'hurryup', step: 0 }` is a legitimate encoding of "that
		// lamp is off" -- `lampsOf()` never emits it today (only `off/0`),
		// but `LampCommand` admits it and Stories 3.5/3.6/3.7/3.10 are the
		// first producers of those roles. Testing `role !== 'off'` alone
		// enabled the light with the grammar's own zero intensity and black
		// diffuse, which costs nothing visually but DOES consume one of the
		// AD-12 live-light budget slots below, starving a genuinely lit
		// insert of its light once the lamp count passes the budget.
		const isOn = projection.role !== 'off' && projection.step !== 0 && isLampOnAt(grammar.blinkPeriodMs, nowMs);

		// HIGH 2d: the EMISSIVE alone is dimmed by INSERT_EMISSIVE_LEVEL to
		// leave headroom for the transmitted term (see that constant's own
		// doc comment above) -- `grammar.r/g/b` themselves are never
		// touched, and `light.diffuse` below keeps the FULL role colour.
		entry.material.emissiveColor = isOn
			? new Color3(grammar.r * INSERT_EMISSIVE_LEVEL, grammar.g * INSERT_EMISSIVE_LEVEL, grammar.b * INSERT_EMISSIVE_LEVEL)
			: Color3.Black();

		if (isOn && enabledCount < budget) {
			// HIGH 2d: full role colour, NOT scaled by INSERT_EMISSIVE_LEVEL --
			// the transmitted light is what restores the headroom the dimmed
			// emissive above gave up.
			entry.light.diffuse = new Color3(grammar.r, grammar.g, grammar.b);
			entry.light.intensity = grammar.intensity;
			entry.light.setEnabled(true);
			enabledCount += 1;
		} else {
			entry.light.setEnabled(false);
		}
	}
}
