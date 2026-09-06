// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- the DMD's one Babylon touchpoint. Resolves `vis_backbox` by
// name (`getRequiredNode()`, `scene/playfield.ts` -- throws naming the node
// if it is missing or duplicated, I/O Matrix: "Backbox mesh missing"),
// lazily creates one `RawTexture` sized to the dot grid in physical pixels
// with `Texture.NEAREST_SAMPLINGMODE` (AC 1's "no smoothing", made literal
// -- nearest sampling never blends adjacent texels), assigns it as the
// mesh's material's emissive texture, and `update()`s it on every call
// thereafter. Per-scene state in a `WeakMap<Scene, ...>`, one idempotent
// sync function -- exactly `scene/balls.ts`'s own module shape (:33-35).
// Deep ES imports only, never the `@babylonjs/core` barrel.
//
// Measured (spec Design Notes): under `NullEngine`, `DynamicTexture` throws
// "OffscreenCanvas is not defined" at construction -- a canvas-2D DMD
// cannot be built at all in the test environment. `RawTexture` constructs
// fine, reports `samplingMode 1` and accepts `update()`, but its
// `readPixels()` returns `null` -- `NullEngine` has no texture readback.
// This is therefore the only Babylon path this project can build AND assert
// headlessly; `raster.ts`'s dot buffer is what actually carries AC 1's
// observable.

import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
// Side-effect-only, same precedent as create-engine.ts's own BRDF-texture
// workaround: registers .createRawTexture on the engine prototype(s) --
// without it, CreateRGBATexture throws "engine.rawTexture needs to be
// imported before...". WebGL2's Engine and WebGPU's WebGPUEngine are
// separate class hierarchies with their own separate extension modules.
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { getRequiredNode } from '../scene/playfield';
import { DMD_COLS, DMD_ROWS } from './frame';
import { DOT_PITCH_PX, toRgba, type DmdRaster } from './raster';

/**
 * The one `vis_backbox` string literal in this file (Design Notes, "Why
 * `vis_backbox` is not registered in `TABLE.nodes`") -- `vis_` names are
 * outside `boundary-lint`'s `DEVICE_NAME_PATTERN` (`s|c|l|f|gi|bd|shot|show`
 * prefixes only), so this is lint-legal, and keeping it in exactly one
 * constant leaves a single source of truth even though it is not (and
 * should not become) a `TABLE` registry entry.
 */
const BACKBOX_NODE_NAME = 'vis_backbox';

/** One live emissive `RawTexture` per scene, created on the first `syncBackglass()` call for that scene. */
const backglassTextureByScene = new WeakMap<Scene, RawTexture>();

function textureFor(scene: Scene): RawTexture {
	const existing = backglassTextureByScene.get(scene);
	if (existing) {
		return existing;
	}

	// Resolved and validated BEFORE anything is created or cached: a scene
	// missing (or duplicating) vis_backbox must throw on every call, not just
	// the first -- caching the texture ahead of this check would leave an
	// orphaned, never-wired texture behind after a failed first attempt, and
	// a later retry (once the node legitimately appears) would silently
	// return that same texture without ever assigning it to a material.
	const node = getRequiredNode(scene, BACKBOX_NODE_NAME) as AbstractMesh;
	const material = node.material as PBRMaterial | null;
	if (!material) {
		// AD-11's own export contract (`validate_exported_mesh_contract()`)
		// guarantees every exported static mesh carries exactly one material,
		// so this should be unreachable against a real committed glb -- fail
		// fast and name the node rather than assign into a null material
		// silently (Conventions, "Errors": load-time paths throw).
		throw new Error(`backglass.ts: "${BACKBOX_NODE_NAME}" has no material to carry the DMD emissive texture`);
	}

	const widthPx = DMD_COLS * DOT_PITCH_PX;
	const heightPx = DMD_ROWS * DOT_PITCH_PX;
	const blank = new Uint8Array(widthPx * heightPx * 4);
	const texture = RawTexture.CreateRGBATexture(blank, widthPx, heightPx, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
	backglassTextureByScene.set(scene, texture);
	material.emissiveTexture = texture;
	// PBRMaterial's shader computes finalEmissive = emissiveColor *
	// emissiveTexture -- emissiveColor defaults to black, which would zero
	// out every dot regardless of raster content (Rework, code review: this
	// is exactly balls.ts's own documented "geometrically present but not
	// actually SEEN" failure class -- unlit under NullEngine and every
	// headless test, since none of them evaluate the fragment shader).
	// White passes the raster's own RGB through unattenuated, so the DMD's
	// lit colour is set by toRgba()'s pixel values alone, not by scene
	// lighting -- correct for a self-illuminated dot-matrix panel.
	material.emissiveColor = Color3.White();

	return texture;
}

/**
 * Resolves `vis_backbox`, lazily wires its emissive `RawTexture` on the
 * first call for `scene`, and blits `toRgba(raster)` into it every call
 * thereafter. Idempotent -- safe to call every render-loop frame.
 */
export function syncBackglass(scene: Scene, raster: DmdRaster): void {
	const texture = textureFor(scene);
	texture.update(toRgba(raster));
}
