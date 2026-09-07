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
 */
const INSERT_LIGHT_TABLE_Z_MM = -4;

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

	const localCenter = node.getBoundingInfo().boundingBox.center;
	const lightSceneY = toScene({ x: 0, y: 0, z: INSERT_LIGHT_TABLE_Z_MM }).y;
	const light = new PointLight(`light_${lampName}`, new Vector3(localCenter.x, lightSceneY, localCenter.z), scene);
	light.parent = playfieldRoot;
	light.includedOnlyMeshes = [node];
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

		entry.material.emissiveColor = isOn ? new Color3(grammar.r, grammar.g, grammar.b) : Color3.Black();

		if (isOn && enabledCount < budget) {
			entry.light.diffuse = new Color3(grammar.r, grammar.g, grammar.b);
			entry.light.intensity = grammar.intensity;
			entry.light.setEnabled(true);
			enabledCount += 1;
		} else {
			entry.light.setEnabled(false);
		}
	}
}
