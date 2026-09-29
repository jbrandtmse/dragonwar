// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.0a -- where a named mesh lands on screen: its WORLD bounding box
// (so `playfield_root`'s pitch and any mechanism pose are included) projected
// through the scene's active camera into canvas drawing-buffer pixels,
// origin top-left. The lead's in-page browser capture (AC 4) samples
// `#render-canvas` over these rects to locate each visible family; the host
// exposes it as `window.__dragonwarBoot.nodeScreenRect(name)`.
//
// Read-only: it never moves the camera or any node.

import type { Scene } from '@babylonjs/core/scene';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { getRequiredNode } from './playfield';

/** A canvas-pixel rectangle, origin top-left: `x0 <= x1`, `y0 <= y1`. */
export interface ScreenRect {
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
}

/**
 * The axis-aligned screen rectangle enclosing mesh `name`'s eight
 * world-bbox corners, as seen by `scene.activeCamera`, in the engine's
 * render (drawing-buffer) pixels. Throws naming the node when it is missing
 * or carries no mesh, and when the scene has no active camera.
 */
export function nodeScreenRect(scene: Scene, name: string): ScreenRect {
	const node = getRequiredNode(scene, name);
	if (!(node instanceof AbstractMesh)) {
		throw new Error(`node-screen-rect.ts: "${name}" carries no mesh, so it has no bounding box to project`);
	}
	const camera = scene.activeCamera;
	if (!camera) {
		throw new Error('node-screen-rect.ts: the scene has no active camera to project through');
	}
	const engine = scene.getEngine();
	const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
	const viewProj = camera.getViewMatrix().multiply(camera.getProjectionMatrix(true));

	node.computeWorldMatrix(true); // also refreshes the bounding box's world corners
	const corners = node.getBoundingInfo().boundingBox.vectorsWorld;

	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	const identity = Matrix.Identity();
	for (const corner of corners) {
		const screen = Vector3.Project(corner, identity, viewProj, viewport);
		x0 = Math.min(x0, screen.x);
		y0 = Math.min(y0, screen.y);
		x1 = Math.max(x1, screen.x);
		y1 = Math.max(y1, screen.y);
	}
	return { x0, y0, x1, y1 };
}
