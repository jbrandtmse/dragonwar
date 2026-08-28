// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4 -- the one authored, fixed camera (UJ-4 / the Structural Seed:
// "one fixed authored camera, no camera controls; this epic renders from it
// directly"). Position and target are authored in the TABLE frame
// (millimetres) and converted to scene metres through `sim/table/frames.ts`'s
// `toScene()` -- the only sanctioned conversion (AD-10) -- rather than
// hand-picked in scene units.
//
// How much of the framing actually tracks `TABLE.reference` (stated precisely,
// because the original wording here over-claimed it -- re-review finding):
// the ACROSS-table placement does, on both the position and the target, and
// the target's up-table component does. The camera's own standoff (`y = -700`
// behind the near edge) and height (`z = 1300`) are hand-picked absolutes, so
// a change to `playfieldMm.h` re-aims the camera but does NOT pull it back to
// keep the longer table in frame. test/scene-smoke.test.ts's corner-projection
// assertion is what would catch that, not this file.
//
// Story 4.6 (the walk-up and the Attract show) adds its moving view beside
// this one in `src/presentation/camera/` -- the note that used to live in this
// directory's `.gitkeep`, which this file replaced.
//
// `create-engine.ts`'s previous inline `ArcRotateCamera` comment already
// assigned this file the job ("presentation/camera/ owns the real fixed
// view"); this replaces it. No `attachControl()` call anywhere -- the
// camera never receives pointer/keyboard input, matching "no camera
// controls" literally, regardless of which Babylon camera class is used.

import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { TABLE } from '../../sim/table/dragonwar';
import { toScene } from '../../sim/table/frames';

const { w: playfieldWidthMm, h: playfieldHeightMm } = TABLE.reference.playfieldMm;

// Authored so the drain (table y = 0, "bottom-left nearest the player" per
// AD-10) sits nearest the viewer: the camera sits behind and above the near
// edge, looking up the playfield toward its far end. test/scene-smoke.test.ts
// asserts that the eight corners of `vis_playfield`'s (the one `vis_`
// placeholder mesh -- `col_playfield` is collision-only and never reaches
// the glb, per Design Notes "What goes into the glb") bounding box project
// inside the viewport, under Vitest's default `NullEngine` render size
// (512x256) -- that is this story's fourth acceptance criterion, and the
// only automated check this framing has. The offsets were additionally
// hand-checked (this story's own implementation pass, not an automated test)
// against a realistic portrait canvas (e.g. 405x720) with generous margin
// over the 512x256 minimum, so a real, taller-than-wide browser canvas is
// expected to still frame correctly -- worth re-verifying visually once a
// real canvas is available to look at.
const CAMERA_POSITION_MM = { x: playfieldWidthMm / 2, y: -700, z: 1300 };
const CAMERA_TARGET_MM = { x: playfieldWidthMm / 2, y: playfieldHeightMm / 2, z: 0 };

/**
 * Builds and activates the one fixed camera for `scene`. Never calls
 * `attachControl()` -- there are no camera controls to attach (UJ-4).
 */
export function createFixedCamera(scene: Scene): FreeCamera {
	const positionScene = toScene(CAMERA_POSITION_MM);
	const targetScene = toScene(CAMERA_TARGET_MM);

	const camera = new FreeCamera(
		'fixed_camera',
		new Vector3(positionScene.x, positionScene.y, positionScene.z),
		scene,
	);
	camera.setTarget(new Vector3(targetScene.x, targetScene.y, targetScene.z));
	camera.minZ = 0.05;
	camera.maxZ = 100;
	scene.activeCamera = camera;
	return camera;
}
