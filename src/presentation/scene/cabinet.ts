// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 -- the cabinet's one scene touchpoint. `resolveCabinet()`
// resolves the eleven cabinet meshes `tools/make-placeholder-blend.py`'s
// `add_cabinet()` authors under `cabinet_root` (their names live in
// `vis-names.ts`), checks each one really descends from `cabinet_root`, and
// gives the playfield glass and the backbox translite their transparency.
//
// Why the transparency is set here and not in the glb (AD-12, and the
// spine's "Cabinet parts" row): this project registers no glTF extension
// (`create-engine.ts` imports the base loader only), and an alpha the asset
// carried would only be as good as an assertion nobody can make headlessly.
// The glb therefore exports both materials OPAQUE, and this file sets
// `alpha` and `transparencyMode` on exactly those two materials. Each is
// used by exactly one mesh (`test/cabinet-art.test.ts` pins that from the
// glb), so they are changed in place -- no clone, no new material.
//
// Per-scene state in a `WeakMap`, the same shape as
// `mechanisms/sync-mechanisms.ts`'s `resolveMechanismNodes()`: the host calls
// this on its first render frame, before any snapshot exists, so a glb
// missing a cabinet mesh fails inside the first-frame guard and reaches the
// error panel (AD-17). Everything is resolved and validated BEFORE anything
// is changed or cached, so a failed call leaves no half-made state behind and
// throws again on the next call.
//
// Read-only towards the simulation (AD-1): it imports nothing from `sim/`.

import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { getRequiredNode } from './playfield';
import { VIS_CABINET_NODE_NAMES, VIS_HEAD_TRANSLITE_NODE_NAME, VIS_TOP_GLASS_NODE_NAME } from './vis-names';

/**
 * The playfield glass's opacity: nearly clear, so the table reads through
 * it. An authored starting value, to be judged in a real browser (the
 * story's AC 9 (c)); `NullEngine` rasterises nothing.
 */
export const TOP_GLASS_ALPHA = 0.08;

/**
 * The backbox translite's opacity: translucent enough that the lamp-lit
 * lightbox panel behind it shows through. An authored starting value, to be
 * judged in a real browser (AC 9 (d)).
 */
export const TRANSLITE_ALPHA = 0.55;

export interface CabinetNodes {
	/** The eleven cabinet meshes, keyed by node name, in `VIS_CABINET_NODE_NAMES` order. */
	readonly meshes: ReadonlyMap<string, AbstractMesh>;
	readonly glass: AbstractMesh;
	readonly translite: AbstractMesh;
}

const cabinetByScene = new WeakMap<Scene, CabinetNodes>();

function requireCabinetMesh(scene: Scene, name: string, cabinetRoot: TransformNode): AbstractMesh {
	const node = getRequiredNode(scene, name);
	if (!(node instanceof AbstractMesh)) {
		throw new Error(`cabinet.ts: "${name}" resolved to a node with no mesh -- a cabinet part must carry geometry`);
	}
	if (!node.isDescendantOf(cabinetRoot)) {
		throw new Error(`cabinet.ts: "${name}" is not under "${cabinetRoot.name}" -- a cabinet part must stay level while the playfield pitches`);
	}
	return node;
}

function requireBlendableMaterial(mesh: AbstractMesh): PBRMaterial {
	const material = mesh.material;
	if (!(material instanceof PBRMaterial)) {
		throw new Error(`cabinet.ts: "${mesh.name}" has no PBR material to carry its transparency`);
	}
	return material;
}

function makeAlphaBlended(material: PBRMaterial, alpha: number): void {
	material.alpha = alpha;
	material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
}

/**
 * Resolves (once per scene) and caches the eleven cabinet meshes, and makes
 * the glass and translite materials alpha-blended. Throws naming the first
 * mesh that is missing, carries no geometry, or is not under `cabinetRoot`,
 * and naming the glass or the translite if it has no material. Idempotent:
 * every later call for the same scene returns the same object and changes
 * nothing.
 */
export function resolveCabinet(scene: Scene, cabinetRoot: TransformNode): CabinetNodes {
	const cached = cabinetByScene.get(scene);
	if (cached) {
		return cached;
	}
	const meshes = new Map<string, AbstractMesh>();
	for (const name of VIS_CABINET_NODE_NAMES) {
		meshes.set(name, requireCabinetMesh(scene, name, cabinetRoot));
	}
	const glass = meshes.get(VIS_TOP_GLASS_NODE_NAME)!;
	const translite = meshes.get(VIS_HEAD_TRANSLITE_NODE_NAME)!;
	const glassMaterial = requireBlendableMaterial(glass);
	const transliteMaterial = requireBlendableMaterial(translite);
	if (glassMaterial === transliteMaterial) {
		throw new Error(`cabinet.ts: "${glass.name}" and "${translite.name}" share one material -- each needs its own opacity`);
	}

	makeAlphaBlended(glassMaterial, TOP_GLASS_ALPHA);
	makeAlphaBlended(transliteMaterial, TRANSLITE_ALPHA);

	const resolved: CabinetNodes = { meshes, glass, translite };
	cabinetByScene.set(scene, resolved);
	return resolved;
}
