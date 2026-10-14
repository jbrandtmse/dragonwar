// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 -- shows or hides one named mesh. The lead's negative control
// for the browser check of the cabinet (AC 9): a region that does not change
// between `setNodeVisible(name, true)` and `(name, false)` is not showing
// that mesh. The host exposes it as
// `window.__dragonwarBoot.setNodeVisible(name, visible)`.
//
// It sets the mesh's own `isVisible`, which Babylon does not pass down to
// children (unlike `setEnabled()`): hiding `vis_cabinet` leaves its rails
// and arch panel drawn, so each part can be judged on its own. It is view
// state of the scene, never of the game: nothing in `sim/` can see it.

import type { Scene } from '@babylonjs/core/scene';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { getRequiredNode } from './playfield';

/**
 * Sets mesh `name`'s own visibility. Throws naming the node -- and changes
 * nothing -- when it is missing or duplicated (`getRequiredNode()`), when it
 * carries no geometry (a root, a pivot, a lamp Empty), or when `visible` is
 * not a boolean.
 */
export function setNodeVisible(scene: Scene, name: string, visible: boolean): void {
	const node = getRequiredNode(scene, name);
	if (!(node instanceof AbstractMesh) || node.getTotalVertices() === 0) {
		throw new Error(`node-visibility.ts: "${name}" carries no mesh, so it has nothing to show or hide`);
	}
	if (typeof visible !== 'boolean') {
		throw new TypeError(`node-visibility.ts: setNodeVisible("${name}", ${String(visible)}): visible must be true or false`);
	}
	node.isVisible = visible;
}
