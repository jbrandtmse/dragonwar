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
 * Story 2.1a (DW-55): the set of `playfieldRoot` nodes this file has already
 * asserted the precondition below against -- `applyPitch()` is called every
 * frame (`src/host/boot.ts`) with the SAME `nodes` object, and every call
 * after the first legitimately leaves `playfieldRoot` non-identity (that IS
 * the pitch this function applies), so the precondition can only ever hold
 * on the FIRST call for a given node. A `WeakSet` keyed on the node itself
 * (not a module-level boolean) so two independent scenes -- as in this
 * file's own test suite -- are asserted independently.
 */
const assertedPlayfieldRoots = new WeakSet<TransformNode>();

/**
 * Throws naming `playfieldRoot` if it does not carry an identity world
 * transform, or naming `pivotPitch` if it does not share `playfieldRoot`'s
 * own parent -- the two preconditions the `P - R*P` correction below is only
 * valid under (DW-55): geometry is authored unpitched (AD-10), so
 * `playfieldRoot` must still be at the identity the FIRST time pitch is ever
 * applied to it, and `pivotPitch`'s position must be read in the SAME space
 * `playfieldRoot`'s own correction is computed in.
 */
function assertPitchPreconditions(nodes: PlayfieldNodes): void {
	if (assertedPlayfieldRoots.has(nodes.playfieldRoot)) {
		return;
	}
	const world = nodes.playfieldRoot.computeWorldMatrix(true);
	if (!world.isIdentity()) {
		throw new Error(
			`playfield.ts: applyPitch(): "${nodes.playfieldRoot.name}" (TABLE.nodes.playfieldRoot) does not carry an ` +
			`identity transform on its first pitch application -- geometry is authored unpitched (AD-10), and the ` +
			`"rotate about an external point" correction this function applies is only valid starting from identity.`,
		);
	}
	if (nodes.pivotPitch.parent !== nodes.playfieldRoot.parent) {
		throw new Error(
			`playfield.ts: applyPitch(): "${nodes.pivotPitch.name}" (TABLE.nodes.pivotPitch) does not share ` +
			`"${nodes.playfieldRoot.name}"'s (TABLE.nodes.playfieldRoot) own parent -- pivotPitch.position must be ` +
			`readable in the same space playfieldRoot's own correction is computed in.`,
		);
	}
	assertedPlayfieldRoots.add(nodes.playfieldRoot);
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
 *
 * Story 2.1a (DW-55): asserts its own precondition on the FIRST call for a
 * given `nodes.playfieldRoot` (see `assertPitchPreconditions()` above) --
 * every later call, called every frame from `src/host/boot.ts` with the same
 * node, is exempt, since by then `playfieldRoot` is deliberately non-identity.
 */
export function applyPitch(nodes: PlayfieldNodes, pitchDeg: number): void {
	assertPitchPreconditions(nodes);
	const pivotPosition = nodes.pivotPitch.position.clone();
	const angleRad = (pitchDeg * Math.PI) / 180;
	const rotation = Quaternion.RotationAxis(Vector3.Right(), angleRad);
	const rotationMatrix = Matrix.Zero();
	rotation.toRotationMatrix(rotationMatrix);
	const rotatedPivot = Vector3.TransformNormal(pivotPosition, rotationMatrix);

	nodes.playfieldRoot.rotationQuaternion = rotation;
	nodes.playfieldRoot.position = pivotPosition.subtract(rotatedPivot);
}
