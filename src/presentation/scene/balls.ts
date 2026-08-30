// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-10 -- renders `Snapshot.balls` with no interpolation (AD-4): one sphere
// per `BallSnapshot.id`, diameter `TABLE.reference.ballMm / 1000` metres,
// parented to `playfield_root` so pitch carries it, positioned at
// `toScene(pos)`, and disposes the mesh of any ball no longer in the
// snapshot. Imports only `sim/contracts` and `sim/table` (AD-1:
// `presentation/**` never calls into physics or rules).
//
// A ball mesh built with NO material falls back to `scene.defaultMaterial`
// only once something else forces it to render with one; measured live
// (this story's own browser smoke, chrome-devtools-mcp): an unmaterialled
// sphere here rendered with no visible fill at all against the placeholder
// playfield -- geometrically present (correct position, correct parent,
// `isVisible: true`) but not actually SEEN, which fails this story's own
// "a ball is visible" acceptance criterion despite passing every headless
// mesh-existence assertion. A plain steel-coloured `StandardMaterial`,
// shared across every ball mesh in one scene, is this file's placeholder
// fix -- primitives only, per AD-11 ("the pipeline and feel are the
// deliverable, not the art").

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { TABLE } from '../../sim/table/dragonwar';
import { toScene } from '../../sim/table/frames';
import type { Snapshot } from '../../sim/contracts/snapshot';

/** One live ball mesh per currently-snapshotted ball id, so a later `syncBalls()` call can find and reuse (or dispose) it. */
const ballMeshesByScene = new WeakMap<Scene, Map<number, Mesh>>();
/** One shared placeholder material per scene -- every ball looks the same steel-grey sphere; there is nothing per-ball to distinguish yet. */
const ballMaterialByScene = new WeakMap<Scene, StandardMaterial>();

function meshesFor(scene: Scene): Map<number, Mesh> {
	let meshes = ballMeshesByScene.get(scene);
	if (!meshes) {
		meshes = new Map<number, Mesh>();
		ballMeshesByScene.set(scene, meshes);
	}
	return meshes;
}

function ballMaterialFor(scene: Scene): StandardMaterial {
	let material = ballMaterialByScene.get(scene);
	if (!material) {
		material = new StandardMaterial('mat_ball_placeholder', scene);
		material.diffuseColor = new Color3(0.72, 0.72, 0.75);
		material.specularColor = new Color3(0.9, 0.9, 0.9);
		material.specularPower = 32;
		ballMaterialByScene.set(scene, material);
	}
	return material;
}

/**
 * Creates, moves and disposes ball meshes to match `snapshot.balls` exactly:
 * a mesh for every id present, none for any id that has left. No
 * interpolation (AD-4: presentation renders the latest snapshot as-is) --
 * each call sets position directly from `toScene(pos)`.
 */
export function syncBalls(scene: Scene, playfieldRoot: TransformNode, snapshot: Snapshot): void {
	const meshes = meshesFor(scene);
	const diameterM = TABLE.reference.ballMm / 1000;
	const seen = new Set<number>();

	for (const ball of snapshot.balls) {
		seen.add(ball.id);
		let mesh = meshes.get(ball.id);
		if (!mesh) {
			mesh = MeshBuilder.CreateSphere(`ball_${ball.id}`, { diameter: diameterM }, scene);
			mesh.material = ballMaterialFor(scene);
			mesh.parent = playfieldRoot;
			meshes.set(ball.id, mesh);
		}
		const scenePos = toScene(ball.pos);
		mesh.position.set(scenePos.x, scenePos.y, scenePos.z);
	}

	for (const [id, mesh] of meshes) {
		if (!seen.has(id)) {
			mesh.dispose();
			meshes.delete(id);
		}
	}
}
