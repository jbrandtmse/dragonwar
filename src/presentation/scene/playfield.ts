// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4 -- resolves the three glb nodes presentation cares about
// (`TABLE.nodes.playfieldRoot`/`cabinetRoot`/`pivotPitch`) from a loaded
// scene, throwing on the first missing one so `boot.ts` shows AD-17's host
// error panel rather than a silent half-scene; and `applyPitch()`, which
// rotates `playfield_root` about `pivot_pitch`'s POSITION -- not about
// `playfield_root`'s own origin, and never about `cabinet_root`, which this
// file never touches (AD-10: the cabinet stays level; pitch is presentation's
// rotation of the playfield root about the pitch pivot, never a tilt baked
// into a mesh).
//
// Node names come from `TABLE.nodes`, never a string literal (AD-11).

import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TABLE } from '../../sim/table/dragonwar';

export interface PlayfieldNodes {
	readonly playfieldRoot: TransformNode;
	readonly cabinetRoot: TransformNode;
	readonly pivotPitch: TransformNode;
}

function getRequiredNode(scene: Scene, name: string): TransformNode {
	// Counted rather than fetched by name: Babylon's getXByName() returns the
	// FIRST match, so a glb carrying two nodes under one name would silently
	// pitch one of them and leave the other behind. `src/sim/physics/loader`'s
	// own findNode() already rejects that case for the collision document;
	// this is the same rule on the presentation side of the same asset
	// contract (re-review finding -- the two halves disagreed).
	const matches: TransformNode[] = [
		...scene.transformNodes.filter((n) => n.name === name),
		...scene.meshes.filter((m) => m.name === name),
	];
	if (matches.length === 0) {
		throw new Error(`playfield.ts: required node "${name}" (TABLE.nodes) was not found in the loaded scene`);
	}
	if (matches.length > 1) {
		throw new Error(`playfield.ts: the loaded scene has ${matches.length} nodes named "${name}" (TABLE.nodes) -- node names must be unique`);
	}
	return matches[0];
}

/**
 * Resolves the three presentation-relevant nodes `TABLE.nodes` names,
 * throwing on the first one missing from `scene`. The four collision-only
 * `TABLE.nodes` entries (`colPlayfield`/`colGlass`/`colFlipperL`/
 * `colFlipperR`) are never in the glb (Design Notes, "What goes into the
 * glb") and are resolved instead by `src/sim/physics/loader` from the
 * collision document -- this function's job is scoped to what a Babylon
 * scene actually contains.
 */
export function resolvePlayfieldNodes(scene: Scene): PlayfieldNodes {
	return {
		playfieldRoot: getRequiredNode(scene, TABLE.nodes.playfieldRoot),
		cabinetRoot: getRequiredNode(scene, TABLE.nodes.cabinetRoot),
		pivotPitch: getRequiredNode(scene, TABLE.nodes.pivotPitch),
	};
}

/**
 * Rotates `nodes.playfieldRoot` by `pitchDeg` about the scene X axis
 * (unaffected by `toScene()`'s permutation -- table +X is scene +X
 * unchanged), pivoting about `nodes.pivotPitch`'s CURRENT position rather
 * than `playfieldRoot`'s own origin: for a pivot point `P` and a root
 * authored at the identity transform (AD-10: geometry is authored
 * unpitched), the standard "rotate about an external point" correction is
 * `newPosition = P - R(angle)*P`, `newRotation = R(angle)` -- which leaves
 * `P` itself invariant under the new transform, the property that makes this
 * a rotation ABOUT that point rather than merely a rotation plus an
 * unrelated offset. `nodes.cabinetRoot` is never referenced here, so its
 * world matrix is unaffected by any call to this function.
 */
export function applyPitch(nodes: PlayfieldNodes, pitchDeg: number): void {
	const pivotPosition = nodes.pivotPitch.position.clone();
	const angleRad = (pitchDeg * Math.PI) / 180;
	const rotation = Quaternion.RotationAxis(Vector3.Right(), angleRad);
	const rotationMatrix = Matrix.Zero();
	rotation.toRotationMatrix(rotationMatrix);
	const rotatedPivot = Vector3.TransformNormal(pivotPosition, rotationMatrix);

	nodes.playfieldRoot.rotationQuaternion = rotation;
	nodes.playfieldRoot.position = pivotPosition.subtract(rotatedPivot);
}
