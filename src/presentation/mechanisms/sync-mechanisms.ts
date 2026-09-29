// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.0a (DW-279) -- the moving half of the visible placeholder pass: a
// per-frame follower that poses the flipper, drop-target and plunger `vis_`
// twins `tools/make-placeholder-blend.py` generates from each frame's
// `Snapshot.mechanisms`.
//
// - Stateless towards the game: snapshot in, pose out, no interpolation
//   (AD-4). The only thing cached (per scene, in a `WeakMap`, the same shape
//   as `balls.ts` and `lighting/lamp-driver.ts`) is each node's AUTHORED
//   pose, read once from the loaded glb.
// - Read-only towards the simulation (AD-1): imports only `sim/contracts`
//   and `sim/table`, and never writes anything back.
// - Node names come from `TABLE.nodes.colFlipperL/R` and
//   `TABLE.dropBankWiring[*].node` through `visTwinName()` -- never a device
//   literal (AD-16) -- and resolve through `getRequiredNode()`, so a missing
//   node throws naming itself.
// - Every frame crossing goes through `sim/table/frames.ts` (AD-10): the
//   flipper's tip direction is built in the PHYSICS frame with the ported
//   mover's own convention (tip at `(sin theta, -cos theta)`,
//   `sim/physics/flipper/flipper-config.ts`) and carried to the table frame
//   by `fromPhysics()`, then to the scene by `toScene()`. The rotation is
//   the angle between that direction and the twin's authored (end-of-stroke)
//   direction, measured about `toScene(table +Z)` -- no hand-written axis
//   flip or unit factor anywhere in this file.
//
// Only the three moving families are animated here. The spinner and the
// Dragon's mouth belong to Stories 5.4 and 5.1.

import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Angle } from '@babylonjs/core/Maths/math.path';
import { TABLE } from '../../sim/table/dragonwar';
import { fromPhysics, toScene, type Vec3 } from '../../sim/table/frames';
import type { Snapshot } from '../../sim/contracts/snapshot';
import { getRequiredNode } from '../scene/playfield';
import { VIS_PLUNGER_NODE_NAME, visTwinName } from '../scene/vis-names';

type FlipperSide = 'l' | 'r';

interface FlipperEntry {
	readonly side: FlipperSide;
	readonly node: AbstractMesh;
	/** The node's own loaded rotation (the authored, end-of-stroke pose). */
	readonly authoredRotation: Quaternion;
	/** Unit scene-frame direction from the pivot (the node's origin) toward the bat's tip, in the authored pose. */
	readonly authoredTipDir: Vector3;
}

interface DropTargetEntry {
	readonly switchName: string;
	readonly node: AbstractMesh;
	readonly authoredPosition: Vector3;
	/** Scene-frame displacement that lowers the target by its own table-z height. */
	readonly downOffset: Vector3;
}

interface PlungerEntry {
	readonly node: AbstractMesh;
	readonly authoredPosition: Vector3;
}

export interface MechanismNodes {
	readonly flippers: readonly FlipperEntry[];
	readonly dropTargets: readonly DropTargetEntry[];
	readonly plunger: PlungerEntry;
}

const mechanismsByScene = new WeakMap<Scene, MechanismNodes>();

function toVector3(v: Vec3): Vector3 {
	return new Vector3(v.x, v.y, v.z);
}

/** The scene-frame unit axis the playfield's own normal (table +Z) maps to -- every mechanism rotation and every drop is measured along it. */
function tableNormalInScene(): Vector3 {
	return toVector3(toScene({ x: 0, y: 0, z: 1 })).normalize();
}

/** Removes `v`'s component along the unit `axis` and normalizes what is left. */
function inPlaneDirection(v: Vector3, axis: Vector3): Vector3 {
	const along = axis.scale(Vector3.Dot(v, axis));
	return v.subtract(along).normalize();
}

function requireMechanismMesh(scene: Scene, name: string, playfieldRoot: TransformNode): AbstractMesh {
	const node = getRequiredNode(scene, name);
	if (!(node instanceof AbstractMesh)) {
		throw new Error(`sync-mechanisms.ts: "${name}" resolved to a node with no mesh -- a mechanism twin must carry geometry`);
	}
	if (node.parent !== playfieldRoot) {
		throw new Error(`sync-mechanisms.ts: "${name}" is not a child of "${playfieldRoot.name}" -- its pose is only valid in playfield_root's local frame`);
	}
	return node;
}

function resolveFlipper(scene: Scene, side: FlipperSide, colName: string, playfieldRoot: TransformNode, axis: Vector3): FlipperEntry {
	const node = requireMechanismMesh(scene, visTwinName(colName), playfieldRoot);
	const authoredRotation = node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
	// The twin's origin IS the pivot (make-placeholder-blend.py), so the
	// centre of its own LOCAL bounding box points along the bat, from the
	// pivot toward the tip -- read from the loaded geometry, never a per-side
	// literal.
	const box = node.getBoundingInfo().boundingBox;
	const centreLocal = box.minimum.add(box.maximum).scale(0.5);
	const centreParent = Vector3.Zero();
	centreLocal.rotateByQuaternionToRef(authoredRotation, centreParent);
	return { side, node, authoredRotation, authoredTipDir: inPlaneDirection(centreParent, axis) };
}

/**
 * Resolves (once per scene) and caches every mechanism twin and its
 * authored pose. Throws naming the first missing node. Exported so the host
 * can resolve eagerly on its first render frame (a missing twin then fails
 * boot into the error panel, AD-17), before any snapshot exists.
 */
export function resolveMechanismNodes(scene: Scene, playfieldRoot: TransformNode): MechanismNodes {
	const cached = mechanismsByScene.get(scene);
	if (cached) {
		return cached;
	}
	const axis = tableNormalInScene();

	const flippers: FlipperEntry[] = [
		resolveFlipper(scene, 'l', TABLE.nodes.colFlipperL, playfieldRoot, axis),
		resolveFlipper(scene, 'r', TABLE.nodes.colFlipperR, playfieldRoot, axis),
	];

	const dropTargets: DropTargetEntry[] = Object.values(TABLE.dropBankWiring).map((wiring) => {
		const node = requireMechanismMesh(scene, visTwinName(wiring.node), playfieldRoot);
		const box = node.getBoundingInfo().boundingBox;
		// The target's own height along the playfield normal, in the scene's
		// own units -- the drop is exactly that far, along -normal.
		const height = Math.abs(Vector3.Dot(box.maximum.subtract(box.minimum), axis));
		return {
			switchName: wiring.switch,
			node,
			authoredPosition: node.position.clone(),
			downOffset: axis.scale(-height),
		};
	});

	const plungerNode = requireMechanismMesh(scene, VIS_PLUNGER_NODE_NAME, playfieldRoot);
	const resolved: MechanismNodes = {
		flippers,
		dropTargets,
		plunger: { node: plungerNode, authoredPosition: plungerNode.position.clone() },
	};
	mechanismsByScene.set(scene, resolved);
	return resolved;
}

/**
 * The scene-frame unit direction from a flipper's pivot to its tip at the
 * mover's physics-frame `angleDeg`: the ported mover's convention puts the
 * tip at `(sin theta, -cos theta)` from the pivot in physics units; `fromPhysics()`
 * (affine) carries that offset into the table frame and `toScene()` (linear)
 * into the scene.
 */
function tipDirectionInScene(angleDeg: number, axis: Vector3): Vector3 {
	const theta = Angle.FromDegrees(angleDeg).radians();
	const origin = fromPhysics({ x: 0, y: 0, z: 0 });
	const tip = fromPhysics({ x: Math.sin(theta), y: -Math.cos(theta), z: 0 });
	const tableDir: Vec3 = { x: tip.x - origin.x, y: tip.y - origin.y, z: tip.z - origin.z };
	return inPlaneDirection(toVector3(toScene(tableDir)), axis);
}

/** Signed angle from unit `from` to unit `to`, both perpendicular to the unit `axis`, positive counter-clockwise about `axis`. */
function signedAngleAbout(from: Vector3, to: Vector3, axis: Vector3): number {
	const cross = Vector3.Cross(from, to);
	return Math.atan2(Vector3.Dot(cross, axis), Vector3.Dot(from, to));
}

/**
 * Poses the flipper, drop-target and plunger twins from `snapshot` (AD-4:
 * the latest snapshot, no interpolation). Throws on the first sync if a twin
 * is missing from the loaded scene, naming it.
 */
export function syncMechanisms(scene: Scene, playfieldRoot: TransformNode, snapshot: Snapshot): void {
	const nodes = resolveMechanismNodes(scene, playfieldRoot);
	const axis = tableNormalInScene();
	const mechanisms = snapshot.mechanisms;

	for (const flipper of nodes.flippers) {
		const current = tipDirectionInScene(mechanisms.flippers[flipper.side].angleDeg, axis);
		const delta = Quaternion.RotationAxis(axis, signedAngleAbout(flipper.authoredTipDir, current, axis));
		flipper.node.rotationQuaternion = delta.multiply(flipper.authoredRotation);
	}

	for (const target of nodes.dropTargets) {
		const down = mechanisms.dropTargets[target.switchName] === true;
		target.node.position = down ? target.authoredPosition.add(target.downOffset) : target.authoredPosition.clone();
		target.node.isVisible = !down;
	}

	const travel = toVector3(toScene({ x: 0, y: -mechanisms.plunger.posMm, z: 0 }));
	nodes.plunger.node.position = nodes.plunger.authoredPosition.add(travel);
}
