// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 -- the cabinet in the REAL shipped scene path
// (`loadAndRenderOnceForTests()` on a `NullEngine`: the committed glb, the
// authored fixed camera, the reference pitch applied):
//
//   AC 4  what the fixed camera frames, by projecting world corners -- the
//         lockdown bar, both rails, the glass, the body's front face and the
//         lower part of the backbox are in frame; the top of the backbox and
//         the feet of the front legs are not;
//   AC 5  nothing is covered -- at each allowed pitch, the camera ray to
//         every lens, Backglass, plunger-knob, waiting-ball and deck sample,
//         and to EVERY VERTEX of both flippers and their rubbers at TWO
//         poses (resting and held), reaches it before any OPAQUE cabinet
//         mesh;
//   AC 6  the glass and the translite are alpha-blended in code
//         (`resolveCabinet()`), and nothing else is;
//   and the I/O matrix rows of `resolveCabinet()` and `setNodeVisible()`.
//
// What this file cannot prove: a single rendered pixel. `NullEngine`
// rasterises nothing, so "in frame" here means "projects inside the
// viewport" and "not covered" means "no opaque cabinet triangle on the
// camera ray" -- whether a part is drawn, and what the glass does to the
// picture under it, is the lead's browser check (the story's AC 9).
// `NullEngine`'s render size is 512 x 256, and the camera's vertical field
// of view is fixed, so the NDC y results hold at every aspect ratio; the
// NDC x results hold at this one.
//
// The two flipper poses are both produced by a real `createLoop` and posed
// by the real follower, and are sampled in SEPARATE cases:
//   RESTING  the idle snapshot (the bats droop toward the player). This is
//            what a player sees in Attract and between flips.
//   HELD     both flipper buttons held to the end of stroke. This is the
//            pose the glb is AUTHORED in, so a check that samples only the
//            authored pose samples only this one -- which is how the first
//            fit of this cabinet hid both resting tips behind the lockdown
//            bar while its plan read "both flippers are clear".
// Each case first pins the pose it sampled (the snapshot's angles, and the
// smallest playfield y among the sampled bat and rubber vertices) to typed
// figures, so neither can quietly sample the other's pose.
//
// The picker carries its own controls beside every "nothing is hidden"
// result, each chosen at least 8 mm clear of the boundary it proves (the
// ball's point 12.7 mm by lift, the deepest a ball offers): a deck point the
// lockdown bar hides by design IS reported and a deck point 23 mm further up
// is NOT, a point low on the waiting ball IS reported behind the lockdown
// bar, and a synthetic opaque box hung on `cabinet_root` in front of a
// flipper IS reported.
//
// Falsifiability (Rule 19; each observed red, recorded in the spec's
// Verification section):
//   mutation: give the vis_lockbar node a translation of 500 mm toward the
//     player in the glb JSON chunk -> the framing case red.
//   mutation: give the vis_lockbar node a translation of 22 mm toward table
//     +Y and 3.22 mm upward in the glb JSON chunk (the bar back at the first
//     fit) -> the RESTING-pose flipper case red at all three pitches, while
//     the HELD-pose flipper case stays green.
//   mutation: give the vis_lockbar node a translation of 100 mm upward in
//     the glb JSON chunk -> the HELD-pose flipper case red.
//   mutation: give the vis_lockbar node a translation of 20 mm upward in the
//     glb JSON chunk -> the waiting-ball centre case red at all three
//     pitches.
//   mutation: delete the transparencyMode assignment in cabinet.ts -> the
//     transparency case red.
//   mutation: set TOP_GLASS_ALPHA back to 0.08 in cabinet.ts -> the same
//     case red (alpha 0.08 against the typed 0.02).
//   mutation: move the inner face of col_wall_lane_bottom from y 0 to y 5 in
//     the collision document (applied and reverted inside one command) -> the
//     pose-anchor case red.
//   mutation: give the vis_lockbar node a translation of 60 mm toward -X in
//     the glb JSON chunk (the bar no longer over the shooter lane) -> the
//     controls case red on the waiting ball's assertion.
//   mutation: delete the "resolved to a node with no mesh" guard in
//     cabinet.ts -> the mesh-missing case red; delete the "share one
//     material" guard -> the same case red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { applyPitch, getRequiredNode, type PlayfieldNodes } from '../src/presentation/scene/playfield';
import { resolveCabinet, TOP_GLASS_ALPHA, TRANSLITE_ALPHA } from '../src/presentation/scene/cabinet';
import { setNodeVisible } from '../src/presentation/scene/node-visibility';
import { syncMechanisms } from '../src/presentation/mechanisms/sync-mechanisms';
import { VIS_PLUNGER_NODE_NAME, visTwinName } from '../src/presentation/scene/vis-names';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { glbToTable, toScene, type Vec3 } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { TUNING } from '../src/sim/table/tuning';
import type { Snapshot } from '../src/sim/table/names';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

/** The three pitches every check runs at: TUNING.pitchMinDeg, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg. */
const PITCHES_DEG = [6.0, 6.5, 8.5] as const;

// The spec's node tables, typed (never read from the scene under test).
const GLASS = 'vis_top_glass';
const TRANSLITE = 'vis_head_translite';
const BACKBOX = 'vis_backbox';
const DECK = 'vis_playfield';
const LOCKBAR = 'vis_lockbar';
/** The opaque cabinet meshes: the eleven minus the glass and the translite. */
const OPAQUE_CABINET = ['vis_cabinet', 'vis_cabinet_arch', 'vis_cabinet_rail_l', 'vis_cabinet_rail_r', 'vis_head', 'vis_head_lightbox', 'vis_head_panel', 'vis_legs', 'vis_lockbar'] as const;
const ALL_CABINET = [...OPAQUE_CABINET, GLASS, TRANSLITE].sort();
/** The authored opacities (the spec's Boundaries), typed. */
const TYPED_GLASS_ALPHA = 0.02;
const TYPED_TRANSLITE_ALPHA = 0.55;
/** `bd_shooter`'s authored EJECT pose in the playfield frame (the generator's BD_SHOOTER_POS_MM): where a ball is served, NOT where it waits. */
const SHOOTER_EJECT_POS_MM = { x: 498.0, y: 35.0, z: 13.0 };
const BALL_RADIUS_MM = TABLE.reference.ballMm / 2;
/**
 * The ball waiting to be plunged, in the playfield frame: it rests against
 * the shooter lane's end (the inner face of `col_wall_lane_bottom`, at y 0)
 * and on the deck, so its centre is one radius from each, on `bd_shooter`'s
 * x. The lead measured it in the running game at (497.4, 13.49, 13.5); the
 * pose-anchor case below measures it again on a real loop.
 */
const WAITING_BALL_MM = { x: 498.0, y: BALL_RADIUS_MM, z: BALL_RADIUS_MM };
const WAITING_BALL_TOLERANCE_MM = 1.5;
/** The waiting pose is this much nearer the player than the eject pose, at least. */
const WAITING_BALL_FROM_EJECT_MIN_MM = 15;
/**
 * The waiting ball's hidden control: the point of its surface 20 degrees
 * below the playfield's -y direction from its centre, (x, r(1 - cos 20),
 * r(1 - sin 20)) with r = ballMm / 2. 12.7 mm clear of the boundary by lift.
 */
const BALL_CONTROL_MM = { x: 498.0, y: 0.814, z: 8.879 };
/** The two deck controls on the centreline: hidden by the lockdown bar, and visible. Each at least 8 mm clear of the boundary (near y 11.5). */
const DECK_HIDDEN_CONTROL_MM = { x: 257.2, y: 2, z: 0 };
const DECK_VISIBLE_CONTROL_MM = { x: 257.2, y: 25, z: 0 };
/**
 * The two flipper poses AC 5 samples, typed: the snapshot's `angleDeg` per
 * side (the mover's convention: held is +/-90, resting is that plus or
 * minus `TUNING.flipper.sweepDeg`), and the smallest playfield y among the
 * sampled bat vertices and among the sampled rubber vertices.
 */
const FLIPPER_POSES = {
	resting: { angleDeg: { l: 141, r: -141 }, batMinY: 18.53, rubberMinY: 16.55 },
	held: { angleDeg: { l: 90, r: -90 }, batMinY: 59.5, rubberMinY: 57.5 },
} as const;
type FlipperPose = keyof typeof FLIPPER_POSES;
const FLIPPER_POSE_TOLERANCE = 0.5;
/** Every vertex of both bats (108 each) and both rubbers (288 each) on the committed glb. */
const FLIPPER_VERTICES = 792;
/** The deck grid of AC 5: 9 x 9 over x 10..504, y 45..1056, on the deck. */
const DECK_GRID = { x0: 10, x1: 504, y0: 45, y1: 1056, steps: 9 };
/** A hit this close in front of a sample point (scene metres, 0.5 mm) is the point's own neighbourhood, not a cover. */
const DEPTH_EPSILON_M = 0.0005;
/** Inset corners sit this fraction of the way from a face's centre to each corner. */
const CORNER_FRACTION = 0.5;
const SYNTHETIC_OCCLUDER = 'vis_synthetic_cabinet_occluder';

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's own header
}

async function withShippedScene(body: (scene: Scene, nodes: PlayfieldNodes) => void | Promise<void>): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(readFileSync(GLB_PATH)), { pluginExtension: '.glb' });
		try {
			await body(scene, playfieldNodes);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

function meshNamed(scene: Scene, name: string): AbstractMesh {
	const node = getRequiredNode(scene, name);
	if (!(node instanceof AbstractMesh)) {
		throw new Error(`"${name}" carries no mesh`);
	}
	return node;
}

function refreshWorld(scene: Scene): void {
	for (const node of scene.transformNodes) {
		node.computeWorldMatrix(true);
	}
	for (const mesh of scene.meshes) {
		mesh.computeWorldMatrix(true);
	}
}

/** A mesh's own vertices in world space, as table-frame millimetres of the LEVEL frame (the scene's own axes). */
function levelVertices(mesh: AbstractMesh): Vec3[] {
	const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
	if (!positions || positions.length === 0) {
		throw new Error(`${mesh.name}: no vertex positions`);
	}
	const world = mesh.computeWorldMatrix(true);
	const out: Vec3[] = [];
	for (let i = 0; i < positions.length; i += 3) {
		const p = Vector3.TransformCoordinates(new Vector3(positions[i]!, positions[i + 1]!, positions[i + 2]!), world);
		out.push(glbToTable({ x: p.x, y: p.y, z: p.z }));
	}
	return out;
}

/** A level-frame point (mm) as a scene-space vector. */
function levelPoint(mm: Vec3): Vector3 {
	const s = toScene(mm);
	return new Vector3(s.x, s.y, s.z);
}

/** A point of the PLAYFIELD frame (table mm, unpitched) carried into the world by `playfield_root`'s current transform -- the applied pitch included. */
function playfieldPoint(playfieldRoot: TransformNode, mm: Vec3): Vector3 {
	return Vector3.TransformCoordinates(levelPoint(mm), playfieldRoot.computeWorldMatrix(true));
}

function viewProjection(scene: Scene): Matrix {
	const camera = scene.activeCamera;
	if (!camera) {
		throw new Error('no active camera');
	}
	return camera.getViewMatrix().multiply(camera.getProjectionMatrix(true));
}

interface Ndc {
	readonly label: string;
	readonly x: number;
	readonly y: number;
}

function project(scene: Scene, label: string, world: Vector3): Ndc {
	const ndc = Vector3.TransformCoordinates(world, viewProjection(scene));
	return { label, x: ndc.x, y: ndc.y };
}

function worldCorners(scene: Scene, name: string): Ndc[] {
	const mesh = meshNamed(scene, name);
	mesh.computeWorldMatrix(true);
	return mesh.getBoundingInfo().boundingBox.vectorsWorld.map((corner, i) => project(scene, `${name} corner ${i}`, corner));
}

/** The four corners of the face of `name` at its smallest level-frame y (its front face), as level-frame points. */
function frontFaceCorners(scene: Scene, name: string): { bottom: Vec3[]; top: Vec3[] } {
	const vertices = levelVertices(meshNamed(scene, name));
	const frontY = Math.min(...vertices.map((v) => v.y));
	const face = vertices.filter((v) => v.y - frontY < 0.01);
	expect(face.length, `non-vacuity: ${name} has vertices on its front face`).toBeGreaterThanOrEqual(4);
	const xs = [Math.min(...face.map((v) => v.x)), Math.max(...face.map((v) => v.x))];
	const z0 = Math.min(...face.map((v) => v.z));
	const z1 = Math.max(...face.map((v) => v.z));
	expect(xs[1]! - xs[0]!, `${name}: the front face has width`).toBeGreaterThan(50);
	expect(z1 - z0, `${name}: the front face has height`).toBeGreaterThan(50);
	return { bottom: xs.map((x) => ({ x, y: frontY, z: z0 })), top: xs.map((x) => ({ x, y: frontY, z: z1 })) };
}

function expectInFrame(points: readonly Ndc[], what: string): void {
	expect(points.length, `non-vacuity: ${what}`).toBeGreaterThan(0);
	for (const p of points) {
		expect(Math.abs(p.x), `${p.label} projects outside the frame on x (NDC ${p.x.toFixed(4)})`).toBeLessThanOrEqual(1);
		expect(Math.abs(p.y), `${p.label} projects outside the frame on y (NDC ${p.y.toFixed(4)})`).toBeLessThanOrEqual(1);
	}
}

// ---------------------------------------------------------------------------
// AC 5: the cover check.
// ---------------------------------------------------------------------------

interface Sample {
	readonly label: string;
	readonly world: Vector3;
}

interface Cover {
	readonly label: string;
	readonly by: string;
	readonly hitMm: number;
	readonly pointMm: number;
}

/** The meshes a cover check picks: every mesh under `cabinet_root` except the two see-through ones and the Backglass quad itself (a sample target, not a cabinet part). */
function opaqueCabinetMeshes(scene: Scene, cabinetRoot: TransformNode): AbstractMesh[] {
	return scene.meshes.filter((mesh) => mesh.isDescendantOf(cabinetRoot) && mesh.name !== GLASS && mesh.name !== TRANSLITE && mesh.name !== BACKBOX && mesh.getTotalVertices() > 0 && mesh.isEnabled() && mesh.isVisible);
}

/** Every sample whose camera ray meets an opaque cabinet mesh before it reaches the sample, with the nearest such mesh. Triangle-exact (`multiPickWithRay`). */
function covered(scene: Scene, cabinetRoot: TransformNode, samples: readonly Sample[]): Cover[] {
	const camera = scene.activeCamera!;
	camera.computeWorldMatrix();
	const eye = camera.globalPosition.clone();
	const candidates = new Set(opaqueCabinetMeshes(scene, cabinetRoot));
	const out: Cover[] = [];
	for (const { label, world } of samples) {
		const toPoint = world.subtract(eye);
		const pointM = toPoint.length();
		const ray = new Ray(eye, toPoint.scale(1 / pointM), pointM);
		const hits = (scene.multiPickWithRay(ray, (mesh) => candidates.has(mesh)) ?? []).filter((pick) => pick.hit && pick.pickedMesh !== null && pick.distance < pointM - DEPTH_EPSILON_M);
		if (hits.length > 0) {
			const nearest = hits.reduce((a, b) => (b.distance < a.distance ? b : a));
			out.push({ label, by: nearest.pickedMesh!.name, hitMm: nearest.distance * 1000, pointMm: pointM * 1000 });
		}
	}
	return out;
}

function describeCovers(covers: readonly Cover[]): string {
	return covers.map((c) => `${c.label} behind ${c.by} (hit ${c.hitMm.toFixed(1)} mm, point ${c.pointMm.toFixed(1)} mm from the camera)`).join('; ');
}

/** A lens's top face: its centre and four inset corners, in world space (`test/insert-occlusion.test.ts`'s own sampling). */
function lensSamples(lens: AbstractMesh): Sample[] {
	const positions = lens.getVerticesData(VertexBuffer.PositionKind);
	if (!positions || positions.length === 0) {
		throw new Error(`${lens.name}: no vertex positions`);
	}
	let topY = -Infinity;
	for (let i = 1; i < positions.length; i += 3) {
		topY = Math.max(topY, positions[i]!);
	}
	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for (let i = 0; i < positions.length; i += 3) {
		if (Math.abs(positions[i + 1]! - topY) > 1e-6) {
			continue;
		}
		minX = Math.min(minX, positions[i]!);
		maxX = Math.max(maxX, positions[i]!);
		minZ = Math.min(minZ, positions[i + 2]!);
		maxZ = Math.max(maxZ, positions[i + 2]!);
	}
	const cx = (minX + maxX) / 2;
	const cz = (minZ + maxZ) / 2;
	const hx = ((maxX - minX) / 2) * CORNER_FRACTION;
	const hz = ((maxZ - minZ) / 2) * CORNER_FRACTION;
	const world = lens.computeWorldMatrix(true);
	const local: Array<[string, number, number]> = [['centre', cx, cz], ['corner -x -z', cx - hx, cz - hz], ['corner +x -z', cx + hx, cz - hz], ['corner +x +z', cx + hx, cz + hz], ['corner -x +z', cx - hx, cz + hz]];
	return local.map(([label, x, z]) => ({ label: `${lens.name} ${label}`, world: Vector3.TransformCoordinates(new Vector3(x, topY, z), world) }));
}

interface VertexSampling {
	readonly samples: Sample[];
	/** The smallest PLAYFIELD-frame y (mm) among each mesh's own sampled vertices, by mesh name. */
	readonly minPlayfieldY: Record<string, number>;
}

/**
 * EVERY vertex of each mesh, in world space as it is posed right now, with
 * its playfield-frame position in its label. A bounding box's corners are
 * not points of the bat: the first fit's bar hid real vertices of both
 * resting bats, and a sample of nine box points could not say which.
 */
function vertexSamples(meshes: readonly AbstractMesh[], playfieldRoot: TransformNode): VertexSampling {
	const toPlayfield = Matrix.Invert(playfieldRoot.computeWorldMatrix(true));
	const samples: Sample[] = [];
	const minPlayfieldY: Record<string, number> = {};
	for (const mesh of meshes) {
		const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
		if (!positions || positions.length === 0) {
			throw new Error(`${mesh.name}: no vertex positions`);
		}
		const world = mesh.computeWorldMatrix(true);
		let minY = Infinity;
		for (let i = 0; i < positions.length; i += 3) {
			const point = Vector3.TransformCoordinates(new Vector3(positions[i]!, positions[i + 1]!, positions[i + 2]!), world);
			const local = Vector3.TransformCoordinates(point, toPlayfield);
			const mm = glbToTable({ x: local.x, y: local.y, z: local.z });
			minY = Math.min(minY, mm.y);
			samples.push({ label: `${mesh.name} vertex ${i / 3} at playfield (${mm.x.toFixed(1)}, ${mm.y.toFixed(1)}, ${mm.z.toFixed(1)})`, world: point });
		}
		minPlayfieldY[mesh.name] = minY;
	}
	return { samples, minPlayfieldY };
}

/** Advances a real loop in <= 100 ms chunks (the loop's own 200 ms owed-time cap) until `ticks` more have run (`test/mechanisms-follow.test.ts`'s own idiom). */
function advanceTicks(loop: ReturnType<typeof createLoop>, ticks: number, transitions: Parameters<ReturnType<typeof createLoop>['advance']>[1] = []): Snapshot {
	let remaining = ticks;
	let snapshot: Snapshot | undefined;
	let pending = transitions;
	while (remaining > 0) {
		const step = Math.min(remaining, 100);
		snapshot = loop.advance(step, pending).snapshot;
		pending = [];
		remaining -= step;
	}
	return snapshot!;
}

function loadCollisionDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as unknown;
}

/** A mesh's bounding-box centre and its eight world-bbox corners (the synthetic control's own target; the flippers are sampled by vertex). */
function boxSamples(mesh: AbstractMesh): Sample[] {
	mesh.computeWorldMatrix(true);
	const box = mesh.getBoundingInfo().boundingBox;
	const at = (world: Vector3): string => {
		const mm = glbToTable({ x: world.x, y: world.y, z: world.z });
		return `at level (${mm.x.toFixed(1)}, ${mm.y.toFixed(1)}, ${mm.z.toFixed(1)})`;
	};
	return [
		{ label: `${mesh.name} centre ${at(box.centerWorld)}`, world: box.centerWorld.clone() },
		...box.vectorsWorld.map((corner, i) => ({ label: `${mesh.name} corner ${i} ${at(corner)}`, world: corner.clone() })),
	];
}

/** The Backglass quad's front face (its smallest level-frame y): centre and four inset corners. */
function backglassSamples(scene: Scene): Sample[] {
	const { bottom, top } = frontFaceCorners(scene, BACKBOX);
	const centre = { x: (bottom[0]!.x + bottom[1]!.x) / 2, y: bottom[0]!.y, z: (bottom[0]!.z + top[0]!.z) / 2 };
	const inset = (corner: Vec3): Vec3 => ({ x: centre.x + (corner.x - centre.x) * CORNER_FRACTION, y: centre.y, z: centre.z + (corner.z - centre.z) * CORNER_FRACTION });
	return [{ label: `${BACKBOX} centre`, world: levelPoint(centre) }, ...[...bottom, ...top].map((corner, i) => ({ label: `${BACKBOX} inset corner ${i}`, world: levelPoint(inset(corner)) }))];
}

/** The top centre of the plunger knob, from its own local bounding box (scene-local y is table z). */
function knobSamples(scene: Scene): Sample[] {
	const knob = meshNamed(scene, `${VIS_PLUNGER_NODE_NAME}_knob`);
	const box = knob.getBoundingInfo().boundingBox;
	const local = new Vector3((box.minimum.x + box.maximum.x) / 2, box.maximum.y, (box.minimum.z + box.maximum.z) / 2);
	return [{ label: `${knob.name} top centre`, world: Vector3.TransformCoordinates(local, knob.computeWorldMatrix(true)) }];
}

function deckSamples(playfieldRoot: TransformNode): Sample[] {
	const out: Sample[] = [];
	for (let i = 0; i < DECK_GRID.steps; i++) {
		for (let j = 0; j < DECK_GRID.steps; j++) {
			const x = DECK_GRID.x0 + ((DECK_GRID.x1 - DECK_GRID.x0) * i) / (DECK_GRID.steps - 1);
			const y = DECK_GRID.y0 + ((DECK_GRID.y1 - DECK_GRID.y0) * j) / (DECK_GRID.steps - 1);
			out.push({ label: `deck (${x.toFixed(1)}, ${y.toFixed(1)})`, world: playfieldPoint(playfieldRoot, { x, y, z: 0 }) });
		}
	}
	return out;
}

interface FlipperPoseResult {
	readonly samples: number;
	readonly covers: Cover[];
	readonly minPlayfieldY: Readonly<Record<string, number>>;
}

interface PitchResult {
	readonly lenses: { samples: number; names: string[]; covers: Cover[] };
	/** The two flipper poses, sampled apart. */
	readonly flippers: Readonly<Record<FlipperPose, FlipperPoseResult>>;
	readonly backglass: { samples: number; covers: Cover[] };
	readonly knob: { samples: number; covers: Cover[] };
	readonly ballCentre: Cover[];
	readonly ballTop: Cover[];
	readonly ballControl: Cover[];
	readonly deck: { samples: number; covers: Cover[] };
	readonly deckHiddenControl: Cover[];
	readonly deckVisibleControl: Cover[];
	readonly candidates: string[];
}

const byPitch = new Map<number, PitchResult>();
let syntheticControl: { covers: Cover[]; target: string } | undefined;
let shooterLocalMm: Vec3 | undefined;
/** The `angleDeg` of the two real snapshots the flipper cases sampled. */
let sampledAngles: Record<FlipperPose, { l: number; r: number }> | undefined;
let flipperMeshNames: { bats: string[]; rubbers: string[] } | undefined;

function resultAt(pitchDeg: number): PitchResult {
	const result = byPitch.get(pitchDeg);
	if (!result) {
		throw new Error(`no result for pitch ${pitchDeg}: the shared scene pass failed`);
	}
	return result;
}

describe('Story 5.3 AC 4 -- what the fixed camera frames (projection through the authored camera, NullEngine + committed glb)', () => {
	// mutation: give the vis_lockbar node a translation of 500 mm toward the
	// player in the glb JSON chunk -> red here.
	it('every world-bbox corner of the lockdown bar, both rails and the glass is inside the frame', async () => {
		await withShippedScene((scene) => {
			for (const name of [LOCKBAR, 'vis_cabinet_rail_l', 'vis_cabinet_rail_r', GLASS]) {
				const corners = worldCorners(scene, name);
				expect(corners.length, `${name}: eight corners`).toBe(8);
				expectInFrame(corners, name);
			}
		});
	});

	it('the four corners of the body\'s front face are inside the frame', async () => {
		await withShippedScene((scene) => {
			const { bottom, top } = frontFaceCorners(scene, 'vis_cabinet');
			expectInFrame([...bottom, ...top].map((c, i) => project(scene, `vis_cabinet front-face corner ${i} (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`, levelPoint(c))), 'the body\'s front face');
		});
	});

	it('the two bottom corners of the backbox\'s front face are inside the frame and its two top corners are above it', async () => {
		await withShippedScene((scene) => {
			const { bottom, top } = frontFaceCorners(scene, 'vis_head');
			expectInFrame(bottom.map((c, i) => project(scene, `vis_head front-face bottom corner ${i}`, levelPoint(c))), 'the backbox\'s bottom corners');
			for (const [i, c] of top.entries()) {
				const ndc = project(scene, `vis_head front-face top corner ${i}`, levelPoint(c));
				expect(ndc.y, `${ndc.label} is above the frame (NDC y ${ndc.y.toFixed(4)}): the whole backbox is the Walk-up's to frame`).toBeGreaterThan(1);
			}
		});
	});

	it('the feet of the front pair of legs are below the frame', async () => {
		await withShippedScene((scene) => {
			const legs = levelVertices(meshNamed(scene, 'vis_legs'));
			const floor = Math.min(...legs.map((v) => v.z));
			const feet = legs.filter((v) => v.y < 100 && v.z - floor < 0.01);
			expect(feet.length, 'non-vacuity: the front pair\'s feet (two legs, four corners each)').toBeGreaterThanOrEqual(8);
			expect(new Set(feet.map((v) => Math.round(v.x / 100))).size, 'both front legs, left and right').toBe(2);
			for (const v of feet) {
				const ndc = project(scene, `front foot (${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`, levelPoint(v));
				expect(ndc.y, `${ndc.label} is below the frame (NDC y ${ndc.y.toFixed(4)})`).toBeLessThan(-1);
			}
		});
	});

	it('vis_backbox\'s corners are inside the frame, as before', async () => {
		await withShippedScene((scene) => {
			expectInFrame(worldCorners(scene, BACKBOX), BACKBOX);
		});
	});
});

describe('Story 5.3 AC 5 -- no opaque cabinet mesh covers what a player must see, at every allowed pitch', () => {
	// One scene pass for the whole block: the cover results at the three
	// pitches, then the synthetic control. A failure here fails this block
	// only; AC 4 and AC 6 load their own scenes.
	beforeAll(async () => {
		await withShippedScene((scene, nodes) => {
			resolveCabinet(scene, nodes.cabinetRoot);
			// The two flipper poses, both from ONE real loop and never from a
			// rotation written here (AD-4, AD-5).
			// RESTING: the snapshot after 200 idle ticks (flippers drooped,
			// plunger forward).
			const loop = createLoop({ collisionDoc: loadCollisionDoc() });
			const resting = advanceTicks(loop, 200);
			// HELD: both flipper buttons held from the next tick until both
			// angles settle at the end of stroke.
			let held = advanceTicks(loop, 100, [{ tick: resting.tick + 1, frame: { ...NO_FRAME, flipper_l: true, flipper_r: true } }]);
			let previous: [number, number] = [Number.NaN, Number.NaN];
			const angles = (snapshot: Snapshot): [number, number] => [snapshot.mechanisms.flippers.l.angleDeg, snapshot.mechanisms.flippers.r.angleDeg];
			for (let i = 0; i < 20 && (angles(held)[0] !== previous[0] || angles(held)[1] !== previous[1]); i++) {
				previous = angles(held);
				held = advanceTicks(loop, 50);
			}
			expect(angles(held), 'both held bats must have settled at the end of stroke').toEqual(previous);
			const snapshots: Record<FlipperPose, Snapshot> = { resting, held };
			sampledAngles = {
				resting: { l: angles(resting)[0], r: angles(resting)[1] },
				held: { l: angles(held)[0], r: angles(held)[1] },
			};

			const shooter = getRequiredNode(scene, 'bd_shooter');
			expect(shooter.parent, 'bd_shooter is a child of playfield_root, so it pitches with the playfield').toBe(nodes.playfieldRoot);
			shooterLocalMm = glbToTable({ x: shooter.position.x, y: shooter.position.y, z: shooter.position.z });

			const bats = [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR].map((col) => meshNamed(scene, visTwinName(col)));
			const rubbers = bats.map((bat) => meshNamed(scene, `${bat.name}_rubber`));
			const flipperMeshes = [...bats, ...rubbers];
			flipperMeshNames = { bats: bats.map((m) => m.name), rubbers: rubbers.map((m) => m.name) };
			const lenses = scene.meshes.filter((m) => m.name.startsWith('l_') && m.getTotalVertices() > 0);

			const root = nodes.playfieldRoot;
			const check = (samples: readonly Sample[]): Cover[] => covered(scene, nodes.cabinetRoot, samples);
			/** Poses the mechanisms from one real snapshot, through the real follower, and samples every flipper vertex. */
			const sampleFlippers = (pose: FlipperPose): FlipperPoseResult => {
				syncMechanisms(scene, root, snapshots[pose]);
				refreshWorld(scene);
				const { samples, minPlayfieldY } = vertexSamples(flipperMeshes, root);
				return { samples: samples.length, covers: check(samples), minPlayfieldY };
			};

			for (const pitchDeg of PITCHES_DEG) {
				applyPitch(nodes, pitchDeg);
				// HELD first, then RESTING, so every other sample below is taken
				// with the mechanisms at rest (the plunger forward).
				const heldFlippers = sampleFlippers('held');
				const restingFlippers = sampleFlippers('resting');
				const lensPoints = lenses.flatMap(lensSamples);
				const backglassPoints = backglassSamples(scene);
				const knobPoints = knobSamples(scene);
				const deckPoints = deckSamples(root);
				const point = (label: string, mm: Vec3): Sample[] => [{ label: `${label} at playfield (${mm.x.toFixed(1)}, ${mm.y.toFixed(3)}, ${mm.z.toFixed(3)})`, world: playfieldPoint(root, mm) }];
				byPitch.set(pitchDeg, {
					lenses: { samples: lensPoints.length, names: lenses.map((m) => m.name).sort(), covers: check(lensPoints) },
					flippers: { resting: restingFlippers, held: heldFlippers },
					backglass: { samples: backglassPoints.length, covers: check(backglassPoints) },
					knob: { samples: knobPoints.length, covers: check(knobPoints) },
					ballCentre: check(point('waiting ball centre', WAITING_BALL_MM)),
					// One radius from the centre along the playfield normal.
					ballTop: check(point('waiting ball top', { ...WAITING_BALL_MM, z: WAITING_BALL_MM.z + BALL_RADIUS_MM })),
					ballControl: check(point('waiting ball low point', BALL_CONTROL_MM)),
					deck: { samples: deckPoints.length, covers: check(deckPoints) },
					deckHiddenControl: check(point('deck', DECK_HIDDEN_CONTROL_MM)),
					deckVisibleControl: check(point('deck', DECK_VISIBLE_CONTROL_MM)),
					candidates: opaqueCabinetMeshes(scene, nodes.cabinetRoot).map((m) => m.name).sort(),
				});
			}

			// The synthetic control, at the reference pitch and the resting pose:
			// an opaque box hung on cabinet_root a quarter of the way from a
			// flipper back to the camera.
			applyPitch(nodes, TABLE.reference.pitchDeg);
			syncMechanisms(scene, root, snapshots.resting);
			refreshWorld(scene);
			const target = flipperMeshes[0]!;
			const centre = boxSamples(target)[0]!;
			const eye = scene.activeCamera!.globalPosition;
			const box = CreateBox(SYNTHETIC_OCCLUDER, { size: 0.06 }, scene);
			box.material = scene.getMaterialByName('mat_art_cabinet');
			expect(box.material, 'mat_art_cabinet is in the scene').not.toBeNull();
			box.parent = nodes.cabinetRoot;
			box.position.copyFrom(Vector3.Lerp(centre.world, eye, 0.25));
			box.computeWorldMatrix(true);
			syntheticControl = { covers: covered(scene, nodes.cabinetRoot, [centre]), target: centre.label };
		});
	});

	it('the three pitches are the tuning bounds and the reference pitch; the waiting ball is on bd_shooter\'s x, one radius from the lane\'s end and from the deck, and NOT at bd_shooter\'s eject pose', () => {
		expect([TUNING.pitchMinDeg.value, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg.value]).toEqual([...PITCHES_DEG]);
		expect(byPitch.size, 'non-vacuity: a result per pitch').toBe(PITCHES_DEG.length);
		expect(shooterLocalMm, 'bd_shooter was resolved').toBeDefined();
		for (const axis of ['x', 'y', 'z'] as const) {
			expect(Math.abs(shooterLocalMm![axis] - SHOOTER_EJECT_POS_MM[axis]), `bd_shooter ${axis}: ${shooterLocalMm![axis]} vs ${SHOOTER_EJECT_POS_MM[axis]}`).toBeLessThanOrEqual(0.01);
		}
		expect(Math.abs(WAITING_BALL_MM.x - shooterLocalMm!.x), 'the typed waiting pose is on bd_shooter\'s own x').toBeLessThanOrEqual(0.01);
		expect(TABLE.reference.ballMm, 'the reference ball').toBe(26.99);
		expect(SHOOTER_EJECT_POS_MM.y - WAITING_BALL_MM.y, 'the waiting pose is not the eject pose').toBeGreaterThan(WAITING_BALL_FROM_EJECT_MIN_MM);
		// The lane's end is the inner face of col_wall_lane_bottom, at y 0, and
		// that wall spans bd_shooter's x: the ball can rest against it there.
		const collision = loadCollisionDoc() as { nodes: Array<{ name: string; bboxMm: { min: Vec3; max: Vec3 } }> };
		const laneEnd = collision.nodes.filter((n) => n.name === 'col_wall_lane_bottom');
		expect(laneEnd.length, 'col_wall_lane_bottom is in the collision document').toBe(1);
		expect(laneEnd[0]!.bboxMm.max.y, 'the shooter lane\'s end is at y 0').toBe(0);
		expect(laneEnd[0]!.bboxMm.min.x, 'the lane\'s end spans the waiting ball\'s x').toBeLessThan(WAITING_BALL_MM.x - BALL_RADIUS_MM);
		expect(laneEnd[0]!.bboxMm.max.x, 'the lane\'s end spans the waiting ball\'s x').toBeGreaterThan(WAITING_BALL_MM.x + BALL_RADIUS_MM);
		// The typed control point is on the typed ball's surface, 20 degrees
		// below the playfield's -y direction from its centre.
		const rad = (20 * Math.PI) / 180;
		expect(Math.abs(BALL_CONTROL_MM.y - BALL_RADIUS_MM * (1 - Math.cos(rad))), 'the control\'s y is r(1 - cos 20)').toBeLessThanOrEqual(0.001);
		expect(Math.abs(BALL_CONTROL_MM.z - BALL_RADIUS_MM * (1 - Math.sin(rad))), 'the control\'s z is r(1 - sin 20)').toBeLessThanOrEqual(0.001);
		expect(Math.abs(Math.hypot(BALL_CONTROL_MM.y - WAITING_BALL_MM.y, BALL_CONTROL_MM.z - WAITING_BALL_MM.z) - BALL_RADIUS_MM), 'the control is on the ball\'s surface').toBeLessThanOrEqual(0.001);
	});

	// The pose anchor: where a served ball really waits. The typed pose above
	// is the one every waiting-ball sample uses; this is the real loop saying
	// the same thing.
	it('pose anchor: in a real game the served ball, left alone, settles in the shooter lane within 1.5 mm of the typed waiting pose on each axis, and more than 15 mm from bd_shooter\'s eject pose in y', () => {
		const loop = createLoop({ collisionDoc: loadCollisionDoc() });
		// A real Start press (`test/game-over-restart-integration.test.ts`'s idiom); the plunger is never touched.
		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		let out = loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
		expect(out.snapshot.game.phase, 'the Start press started a game').toBe('game');
		let servedAt = -1;
		for (let i = 0; i < 2000 && servedAt === -1; i++) {
			out = loop.advance(1, []);
			if (out.snapshot.mechanisms.devices.bd_shooter.slots[0]) {
				servedAt = out.snapshot.tick;
			}
		}
		expect(servedAt, 'the game\'s first ball must really reach the shooter lane').toBeGreaterThan(0);
		// Settled: five successive 100-tick samples within SETTLE_MM of one
		// resting place. The solver's resting contact keeps a ball trembling
		// by a few hundredths of a millimetre, so "at rest" is not "bit-still".
		const SETTLE_MM = 0.1;
		let snapshot = out.snapshot;
		let anchor = snapshot.balls[0]!.pos;
		let stillFor = 0;
		for (let i = 0; i < 40 && stillFor < 5; i++) {
			snapshot = advanceTicks(loop, 100);
			expect(snapshot.balls, 'exactly one ball on the table').toHaveLength(1);
			const now = snapshot.balls[0]!.pos;
			if (Math.hypot(now.x - anchor.x, now.y - anchor.y, now.z - anchor.z) <= SETTLE_MM) {
				stillFor += 1;
			} else {
				stillFor = 0;
				anchor = now;
			}
		}
		expect(stillFor, 'the served ball must come to rest').toBe(5);
		expect(snapshot.mechanisms.devices.bd_shooter.slots[0], 'still in the shooter lane: nothing launched it').toBe(true);
		expect(snapshot.mechanisms.plunger.posMm, 'the plunger was never pulled').toBe(0);
		const rest = snapshot.balls[0]!.pos;
		const at =`the served ball rests at (${rest.x.toFixed(3)}, ${rest.y.toFixed(3)}, ${rest.z.toFixed(3)})`;
		for (const axis of ['x', 'y', 'z'] as const) {
			expect(Math.abs(rest[axis] - WAITING_BALL_MM[axis]), `${at}; ${axis} vs the typed ${WAITING_BALL_MM[axis]}`).toBeLessThanOrEqual(WAITING_BALL_TOLERANCE_MM);
		}
		expect(Math.abs(rest.y - SHOOTER_EJECT_POS_MM.y), `${at}; bd_shooter's eject pose is at y ${SHOOTER_EJECT_POS_MM.y}`).toBeGreaterThan(WAITING_BALL_FROM_EJECT_MIN_MM);
	});

	it.each(PITCHES_DEG)('at %s degrees the picker looks at exactly the nine opaque cabinet meshes', (pitchDeg) => {
		expect(resultAt(pitchDeg).candidates).toEqual([...OPAQUE_CABINET].sort());
	});

	it.each(PITCHES_DEG)('at %s degrees no l_ lens (centre and four inset corners) is covered', (pitchDeg) => {
		const { lenses } = resultAt(pitchDeg);
		expect(lenses.names, 'the lens set is TABLE.lamps\' own').toEqual(Object.keys(TABLE.lamps).sort());
		expect(lenses.samples, 'non-vacuity: five samples per lens').toBe(Object.keys(TABLE.lamps).length * 5);
		expect(lenses.covers, describeCovers(lenses.covers)).toEqual([]);
	});

	/** Pins the pose a flipper case sampled to its typed figures, then expects no cover. */
	function expectFlipperPoseUncovered(pose: FlipperPose, pitchDeg: number): void {
		const typed = FLIPPER_POSES[pose];
		const result = resultAt(pitchDeg).flippers[pose];
		// The pose first: the real snapshot's angles ...
		expect(sampledAngles, 'the shared scene pass ran').toBeDefined();
		const angles = sampledAngles![pose];
		expect(Math.abs(angles.l - typed.angleDeg.l), `${pose}: left angleDeg ${angles.l.toFixed(3)} vs ${typed.angleDeg.l}`).toBeLessThanOrEqual(FLIPPER_POSE_TOLERANCE);
		expect(Math.abs(angles.r - typed.angleDeg.r), `${pose}: right angleDeg ${angles.r.toFixed(3)} vs ${typed.angleDeg.r}`).toBeLessThanOrEqual(FLIPPER_POSE_TOLERANCE);
		// ... and where the follower actually put the sampled vertices.
		expect(flipperMeshNames, 'the flipper meshes were resolved').toBeDefined();
		expect(flipperMeshNames!.bats.length + flipperMeshNames!.rubbers.length, 'non-vacuity: two bats and two rubbers').toBe(4);
		for (const [names, typedMinY, part] of [[flipperMeshNames!.bats, typed.batMinY, 'bat'], [flipperMeshNames!.rubbers, typed.rubberMinY, 'rubber']] as const) {
			for (const name of names) {
				const minY = result.minPlayfieldY[name];
				expect(minY, `${pose}: ${name} was sampled`).toBeDefined();
				expect(Math.abs(minY! - typedMinY), `${pose}: ${name}'s smallest playfield y ${minY!.toFixed(3)} vs the typed ${part} figure ${typedMinY}`).toBeLessThanOrEqual(FLIPPER_POSE_TOLERANCE);
			}
		}
		expect(result.samples, 'non-vacuity: every vertex of both bats and both rubbers').toBe(FLIPPER_VERTICES);
		expect(result.covers.length, `${result.covers.length} of ${result.samples} ${pose} flipper vertices are covered -- the first: ${describeCovers(result.covers.slice(0, 4))}`).toBe(0);
	}

	it('the two flipper poses are different poses: resting is the held pose swung by TUNING.flipper.sweepDeg toward the player', () => {
		expect(90 + TUNING.flipper.sweepDeg.value, 'the typed resting angle is 90 plus the sim\'s own sweep').toBe(FLIPPER_POSES.resting.angleDeg.l);
		expect(FLIPPER_POSES.resting.angleDeg.r).toBe(-FLIPPER_POSES.resting.angleDeg.l);
		expect(FLIPPER_POSES.held.batMinY - FLIPPER_POSES.resting.batMinY, 'a resting tip is some 41 mm nearer the player than a held bat').toBeGreaterThan(40);
	});

	// The author's own instruction: the RESTING pose is sampled as well as the
	// HELD one, in separate cases. A check that samples only the held pose is
	// the vacuity that let the first fit through.
	//
	// mutation: give the vis_lockbar node a translation of 22 mm toward table
	// +Y and 3.22 mm upward in the glb JSON chunk (the bar back at the first
	// fit) -> red here at all three pitches, while the HELD case below stays
	// green.
	it.each(PITCHES_DEG)('at %s degrees, RESTING (the real idle snapshot, angleDeg +/-141): no vertex of either flipper or its rubber is covered', (pitchDeg) => {
		expectFlipperPoseUncovered('resting', pitchDeg);
	});

	// mutation: give the vis_lockbar node a translation of 100 mm upward in the
	// glb JSON chunk -> red here.
	it.each(PITCHES_DEG)('at %s degrees, HELD (both buttons held to the end of stroke, angleDeg +/-90): no vertex of either flipper or its rubber is covered', (pitchDeg) => {
		expectFlipperPoseUncovered('held', pitchDeg);
	});

	// mutation: give the vis_lockbar node a translation of 1000 mm toward table
	// +Y and 300 mm upward in the glb JSON chunk -> red here at all three
	// pitches, while the knob case below stays green.
	it.each(PITCHES_DEG)('at %s degrees the Backglass quad\'s front face (centre and four inset corners) is not covered', (pitchDeg) => {
		const { backglass } = resultAt(pitchDeg);
		expect(backglass.samples, 'non-vacuity: five Backglass samples').toBe(5);
		expect(backglass.covers, describeCovers(backglass.covers)).toEqual([]);
	});

	// mutation: give the vis_lockbar node a translation of 30 mm downward in
	// the glb JSON chunk -> red here at 6.0 and 6.5 degrees (8.5 is still
	// inside the knob's margin), while the Backglass case above stays green.
	it.each(PITCHES_DEG)('at %s degrees the plunger knob\'s top is not covered', (pitchDeg) => {
		const { knob } = resultAt(pitchDeg);
		expect(knob.samples, 'non-vacuity: the knob sample').toBe(1);
		expect(knob.covers, describeCovers(knob.covers)).toEqual([]);
	});

	// mutation: give the vis_lockbar node a translation of 20 mm upward in the
	// glb JSON chunk -> red here at all three pitches (the centre's sight line
	// clears the bar by 13.2 to 13.9 mm of lift; the top's by 22 to 24).
	// mutation: give the vis_lockbar node a translation of 100 mm upward in the
	// glb JSON chunk -> red here at all three pitches on the TOP, the centre
	// still clear (the raised bar's face meets the top's sight line only).
	it.each(PITCHES_DEG)('at %s degrees the centre and the top of the ball waiting against the shooter lane\'s end are not covered', (pitchDeg) => {
		const { ballCentre, ballTop } = resultAt(pitchDeg);
		expect(ballCentre, describeCovers(ballCentre)).toEqual([]);
		expect(ballTop, describeCovers(ballTop)).toEqual([]);
	});

	it.each(PITCHES_DEG)('at %s degrees no point of the 9 x 9 deck grid is covered', (pitchDeg) => {
		const { deck } = resultAt(pitchDeg);
		expect(deck.samples, 'non-vacuity: 81 deck samples').toBe(DECK_GRID.steps * DECK_GRID.steps);
		expect(deck.covers, describeCovers(deck.covers)).toEqual([]);
	});

	it.each(PITCHES_DEG)('controls at %s degrees: the deck at y 2 on the centreline IS behind the lockdown bar and the deck at y 25 is NOT; the waiting ball\'s low point IS behind the lockdown bar', (pitchDeg) => {
		const { deckHiddenControl, deckVisibleControl, ballControl } = resultAt(pitchDeg);
		expect(deckHiddenControl.map((c) => c.by), 'the lockdown bar hides the first 11.5 mm or so of deck by design').toEqual([LOCKBAR]);
		expect(deckVisibleControl, `the deck 23 mm further up is in view: ${describeCovers(deckVisibleControl)}`).toEqual([]);
		expect(ballControl.map((c) => c.by), 'the lockdown bar hides the lowest part of the waiting ball, and only that').toEqual([LOCKBAR]);
	});

	it('control: a synthetic opaque box hung on cabinet_root in front of a flipper is reported, naming the box', () => {
		expect(syntheticControl, 'the shared scene pass ran').toBeDefined();
		expect(syntheticControl!.covers.map((c) => c.by)).toEqual([SYNTHETIC_OCCLUDER]);
		expect(syntheticControl!.covers[0]!.label).toBe(syntheticControl!.target);
	});
});

describe('Story 5.3 AC 6 -- the glass and the translite are made see-through in code, and nothing else is', () => {
	// mutation: delete the transparencyMode assignment in cabinet.ts -> red here.
	it('before resolveCabinet() both are opaque (the glb carries no transparency); after it both are alpha-blended at the authored alpha, and no other cabinet mesh is', async () => {
		expect([TOP_GLASS_ALPHA, TRANSLITE_ALPHA], 'the authored opacities').toEqual([TYPED_GLASS_ALPHA, TYPED_TRANSLITE_ALPHA]);
		await withShippedScene((scene, nodes) => {
			const glass = meshNamed(scene, GLASS);
			const translite = meshNamed(scene, TRANSLITE);
			const blends = (mesh: AbstractMesh): boolean => mesh.material!.needAlphaBlendingForMesh(mesh);
			// The positive control for "set in code": as loaded, neither blends.
			expect([blends(glass), blends(translite)], 'as loaded from the glb').toEqual([false, false]);
			expect((glass.material as PBRMaterial).transparencyMode).not.toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);

			const cabinet = resolveCabinet(scene, nodes.cabinetRoot);
			expect([...cabinet.meshes.keys()].sort(), 'resolveCabinet() resolves the eleven').toEqual(ALL_CABINET);
			expect(cabinet.glass).toBe(glass);
			expect(cabinet.translite).toBe(translite);
			for (const [mesh, alpha] of [[glass, TYPED_GLASS_ALPHA], [translite, TYPED_TRANSLITE_ALPHA]] as const) {
				const material = mesh.material as PBRMaterial;
				expect(material.alpha, `${mesh.name}: alpha`).toBeCloseTo(alpha, 10);
				expect(material.transparencyMode, `${mesh.name}: transparencyMode`).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
				expect(blends(mesh), `${mesh.name}: Babylon's own needAlphaBlendingForMesh()`).toBe(true);
			}
			const others = [...OPAQUE_CABINET, BACKBOX].map((name) => meshNamed(scene, name));
			expect(others.length, 'non-vacuity: the nine opaque cabinet meshes and the Backglass quad').toBe(10);
			for (const mesh of others) {
				expect(blends(mesh), `${mesh.name} stays opaque`).toBe(false);
			}
			// Exactly two materials changed: no other mesh shares either.
			for (const material of [glass.material, translite.material]) {
				expect(scene.meshes.filter((m) => m.material === material).length, `${material!.name}: one mesh`).toBe(1);
			}
		});
	});

	it('at every allowed pitch the camera is nearer the glass\'s bounding-sphere centre than the deck\'s (the back-to-front order the two blended surfaces rely on)', async () => {
		await withShippedScene((scene, nodes) => {
			resolveCabinet(scene, nodes.cabinetRoot);
			const glass = meshNamed(scene, GLASS);
			const deck = meshNamed(scene, DECK);
			expect(deck.material!.needAlphaBlendingForMesh(deck), 'non-vacuity: the deck is itself an alpha-blended surface').toBe(true);
			const eye = scene.activeCamera!.globalPosition;
			for (const pitchDeg of PITCHES_DEG) {
				applyPitch(nodes, pitchDeg);
				refreshWorld(scene);
				const toGlass = Vector3.Distance(eye, glass.getBoundingInfo().boundingSphere.centerWorld);
				const toDeck = Vector3.Distance(eye, deck.getBoundingInfo().boundingSphere.centerWorld);
				expect(toGlass, `${pitchDeg} deg: glass ${(toGlass * 1000).toFixed(1)} mm, deck ${(toDeck * 1000).toFixed(1)} mm from the camera`).toBeLessThan(toDeck);
			}
		});
	});
});

describe('Story 5.3 -- resolveCabinet() (I/O matrix rows)', () => {
	it('Resolve called every frame: later calls return the same object and create no material and no light', async () => {
		await withShippedScene((scene, nodes) => {
			const first = resolveCabinet(scene, nodes.cabinetRoot);
			const materials = scene.materials.length;
			const lights = scene.lights.length;
			for (let frame = 0; frame < 3; frame++) {
				expect(resolveCabinet(scene, nodes.cabinetRoot)).toBe(first);
			}
			expect(scene.materials.length, 'no new material').toBe(materials);
			expect(scene.lights.length, 'no new light').toBe(lights);
		});
	});

	it('Scene rebuilt: a second scene resolves its own meshes and its own two blended materials', async () => {
		await withShippedScene(async (sceneA, nodesA) => {
			const a = resolveCabinet(sceneA, nodesA.cabinetRoot);
			await withShippedScene((sceneB, nodesB) => {
				const b = resolveCabinet(sceneB, nodesB.cabinetRoot);
				expect(b).not.toBe(a);
				expect(b.glass).not.toBe(a.glass);
				expect(b.glass.getScene()).toBe(sceneB);
				expect((b.glass.material as PBRMaterial).transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
				expect((b.translite.material as PBRMaterial).alpha).toBeCloseTo(TYPED_TRANSLITE_ALPHA, 10);
			});
		});
	});

	it('Cabinet mesh outside cabinet_root: with vis_lockbar re-parented to playfield_root it throws naming the node and cabinet_root, and changes nothing', async () => {
		await withShippedScene((scene, nodes) => {
			meshNamed(scene, LOCKBAR).parent = nodes.playfieldRoot;
			expect(() => resolveCabinet(scene, nodes.cabinetRoot)).toThrow(/vis_lockbar.*cabinet_root/);
			const glass = meshNamed(scene, GLASS);
			expect(glass.material!.needAlphaBlendingForMesh(glass), 'a failed resolve leaves the glass as loaded').toBe(false);
			// It throws again on the next call (nothing was cached), and resolves once the node is back.
			expect(() => resolveCabinet(scene, nodes.cabinetRoot)).toThrow(/vis_lockbar/);
			meshNamed(scene, LOCKBAR).parent = nodes.cabinetRoot;
			expect(() => resolveCabinet(scene, nodes.cabinetRoot)).not.toThrow();
		});
	});

	it('Cabinet mesh missing, and a glass or translite with no material, each throw naming the node', async () => {
		await withShippedScene((scene, nodes) => {
			const legs = meshNamed(scene, 'vis_legs');
			legs.name = 'vis_legs_gone';
			expect(() => resolveCabinet(scene, nodes.cabinetRoot)).toThrow(/"vis_legs"/);
			legs.name = 'vis_legs';
			for (const name of [GLASS, TRANSLITE]) {
				const mesh = meshNamed(scene, name);
				const material = mesh.material;
				mesh.material = null;
				expect(() => resolveCabinet(scene, nodes.cabinetRoot)).toThrow(new RegExp(`"${name}" has no PBR material`));
				mesh.material = material;
			}
			// A cabinet name that resolves to a node with no mesh (an Empty where
			// a part should be) is refused, naming the node.
			// mutation: delete the "resolved to a node with no mesh" guard in
			// cabinet.ts -> red here.
			legs.name = 'vis_legs_gone';
			const standIn = new TransformNode('vis_legs', scene);
			standIn.parent = nodes.cabinetRoot;
			expect(() => resolveCabinet(scene, nodes.cabinetRoot)).toThrow(/"vis_legs" resolved to a node with no mesh/);
			standIn.dispose();
			legs.name = 'vis_legs';
			// The glass and the translite on ONE material would share one opacity:
			// refused, naming both.
			// mutation: delete the "share one material" guard in cabinet.ts -> red here.
			const translite = meshNamed(scene, TRANSLITE);
			const transliteMaterial = translite.material;
			translite.material = meshNamed(scene, GLASS).material;
			expect(() => resolveCabinet(scene, nodes.cabinetRoot)).toThrow(new RegExp(`"${GLASS}" and "${TRANSLITE}" share one material`));
			translite.material = transliteMaterial;
			const glass = meshNamed(scene, GLASS);
			expect(glass.material!.needAlphaBlendingForMesh(glass), 'every failed resolve above left the glass as loaded').toBe(false);
			expect(() => resolveCabinet(scene, nodes.cabinetRoot), 'the positive control: the restored scene resolves').not.toThrow();
		});
	});
});

describe('Story 5.3 -- setNodeVisible() (I/O matrix rows)', () => {
	it('Hide a mesh: its own isVisible goes false and its children stay visible; showing it again restores it', async () => {
		await withShippedScene((scene) => {
			const body = meshNamed(scene, 'vis_cabinet');
			const children = body.getChildMeshes(true);
			expect(children.map((m) => m.name).sort(), 'non-vacuity: the body has its three children').toEqual(['vis_cabinet_arch', 'vis_cabinet_rail_l', 'vis_cabinet_rail_r']);
			expect(body.isVisible, 'visible as loaded').toBe(true);
			setNodeVisible(scene, 'vis_cabinet', false);
			expect(body.isVisible).toBe(false);
			expect(children.map((m) => m.isVisible), 'the children keep their own visibility').toEqual([true, true, true]);
			expect(children.map((m) => m.isEnabled()), 'and stay enabled').toEqual([true, true, true]);
			setNodeVisible(scene, 'vis_cabinet', true);
			expect(body.isVisible).toBe(true);
		});
	});

	// mutation: delete `|| node.getTotalVertices() === 0` in node-visibility.ts
	// -> red here (the loader's __root__ is a mesh with no vertices).
	it('Hide an unknown or mesh-less node: a missing name, a lamp Empty, a root and a mesh with no vertices each throw naming the node, and nothing changes', async () => {
		await withShippedScene((scene) => {
			const before = scene.meshes.map((m) => m.isVisible);
			expect(() => setNodeVisible(scene, 'vis_coin_door', false)).toThrow(/"vis_coin_door"/);
			for (const empty of [...Object.keys(TABLE.giChannels), TABLE.nodes.cabinetRoot]) {
				expect(() => setNodeVisible(scene, empty, false)).toThrow(new RegExp(`"${empty}" carries no mesh`));
			}
			// The glTF loader's __root__ IS an AbstractMesh, so it reaches the
			// vertex-count half of the guard, which the nodes above never do.
			const loaderRoot = getRequiredNode(scene, '__root__');
			expect(loaderRoot, 'non-vacuity: __root__ is a mesh').toBeInstanceOf(AbstractMesh);
			expect((loaderRoot as AbstractMesh).getTotalVertices(), 'non-vacuity: __root__ carries no vertices').toBe(0);
			expect(() => setNodeVisible(scene, '__root__', false)).toThrow(/"__root__" carries no mesh/);
			expect(() => setNodeVisible(scene, GLASS, 0 as unknown as boolean)).toThrow(/visible must be true or false/);
			expect(scene.meshes.map((m) => m.isVisible), 'no mesh changed').toEqual(before);
			expect(before.length, 'non-vacuity: meshes').toBeGreaterThan(100);
		});
	});
});
