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
//         every lens, flipper, Backglass, plunger-knob, resting-ball and
//         deck sample reaches it before any OPAQUE cabinet mesh;
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
// The picker carries its own controls beside every "nothing is hidden"
// result: a deck point the lockdown bar hides by design IS reported, the
// resting ball's near point IS reported behind the lockdown bar, and a
// synthetic opaque box hung on `cabinet_root` in front of a flipper IS
// reported.
//
// Falsifiability (Rule 19; each observed red, recorded in the spec's
// Verification section):
//   mutation: give the vis_lockbar node a translation of 500 mm toward the
//     player in the glb JSON chunk -> the framing case red.
//   mutation: give the vis_lockbar node a translation of 100 mm upward in
//     the glb JSON chunk -> the flipper ray case red.
//   mutation: give the vis_lockbar node a translation of 12 mm upward in the
//     glb JSON chunk -> the resting-ball centre case red.
//   mutation: delete the transparencyMode assignment in cabinet.ts -> the
//     transparency case red.

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
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { applyPitch, getRequiredNode, type PlayfieldNodes } from '../src/presentation/scene/playfield';
import { resolveCabinet, TOP_GLASS_ALPHA, TRANSLITE_ALPHA } from '../src/presentation/scene/cabinet';
import { setNodeVisible } from '../src/presentation/scene/node-visibility';
import { syncMechanisms } from '../src/presentation/mechanisms/sync-mechanisms';
import { VIS_PLUNGER_NODE_NAME, visTwinName } from '../src/presentation/scene/vis-names';
import { createLoop } from '../src/sim/loop';
import { glbToTable, toScene, type Vec3 } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { TUNING } from '../src/sim/table/tuning';

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
const TYPED_GLASS_ALPHA = 0.08;
const TYPED_TRANSLITE_ALPHA = 0.55;
/** The ball waiting to be plunged: `bd_shooter`'s authored pose in the playfield frame (the generator's BD_SHOOTER_POS_MM). */
const SHOOTER_POS_MM = { x: 498.0, y: 35.0, z: 13.0 };
const BALL_RADIUS_MM = TABLE.reference.ballMm / 2;
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

/** A mesh's bounding-box centre and its eight world-bbox corners. */
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

interface PitchResult {
	readonly lenses: { samples: number; names: string[]; covers: Cover[] };
	readonly flippers: { samples: number; covers: Cover[] };
	readonly backglass: { samples: number; covers: Cover[] };
	readonly knob: { samples: number; covers: Cover[] };
	readonly ballCentre: Cover[];
	readonly ballTop: Cover[];
	readonly ballNear: Cover[];
	readonly deck: { samples: number; covers: Cover[] };
	readonly deckFrontControl: Cover[];
	readonly candidates: string[];
}

const byPitch = new Map<number, PitchResult>();
let syntheticControl: { covers: Cover[]; target: string } | undefined;
let shooterLocalMm: Vec3 | undefined;

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
			// The rest pose: a real loop's snapshot after 200 idle ticks (flippers
			// drooped, plunger forward), posed by the real follower.
			const loop = createLoop({ collisionDoc: JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as unknown });
			loop.advance(100, []);
			const snapshot = loop.advance(100, []).snapshot;
			syncMechanisms(scene, nodes.playfieldRoot, snapshot);

			const shooter = getRequiredNode(scene, 'bd_shooter');
			expect(shooter.parent, 'bd_shooter is a child of playfield_root, so it pitches with the playfield').toBe(nodes.playfieldRoot);
			shooterLocalMm = glbToTable({ x: shooter.position.x, y: shooter.position.y, z: shooter.position.z });

			const flipperMeshes = [TABLE.nodes.colFlipperL, TABLE.nodes.colFlipperR].flatMap((col) => [meshNamed(scene, visTwinName(col)), meshNamed(scene, `${visTwinName(col)}_rubber`)]);
			const lenses = scene.meshes.filter((m) => m.name.startsWith('l_') && m.getTotalVertices() > 0);

			for (const pitchDeg of PITCHES_DEG) {
				applyPitch(nodes, pitchDeg);
				refreshWorld(scene);
				const root = nodes.playfieldRoot;
				const check = (samples: readonly Sample[]): Cover[] => covered(scene, nodes.cabinetRoot, samples);
				const lensPoints = lenses.flatMap(lensSamples);
				const flipperPoints = flipperMeshes.flatMap(boxSamples);
				const backglassPoints = backglassSamples(scene);
				const knobPoints = knobSamples(scene);
				const deckPoints = deckSamples(root);
				byPitch.set(pitchDeg, {
					lenses: { samples: lensPoints.length, names: lenses.map((m) => m.name).sort(), covers: check(lensPoints) },
					flippers: { samples: flipperPoints.length, covers: check(flipperPoints) },
					backglass: { samples: backglassPoints.length, covers: check(backglassPoints) },
					knob: { samples: knobPoints.length, covers: check(knobPoints) },
					ballCentre: check([{ label: 'resting ball centre', world: playfieldPoint(root, SHOOTER_POS_MM) }]),
					ballTop: check([{ label: 'resting ball top', world: playfieldPoint(root, { ...SHOOTER_POS_MM, z: SHOOTER_POS_MM.z + BALL_RADIUS_MM }) }]),
					ballNear: check([{ label: 'resting ball near point', world: playfieldPoint(root, { ...SHOOTER_POS_MM, y: SHOOTER_POS_MM.y - BALL_RADIUS_MM }) }]),
					deck: { samples: deckPoints.length, covers: check(deckPoints) },
					deckFrontControl: check([{ label: 'deck (257.2, 10.0)', world: playfieldPoint(root, { x: TABLE.reference.playfieldMm.w / 2, y: 10, z: 0 }) }]),
					candidates: opaqueCabinetMeshes(scene, nodes.cabinetRoot).map((m) => m.name).sort(),
				});
			}

			// The synthetic control, at the reference pitch: an opaque box hung on
			// cabinet_root a quarter of the way from a flipper back to the camera.
			applyPitch(nodes, TABLE.reference.pitchDeg);
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

	it('the three pitches are the tuning bounds and the reference pitch, and the waiting ball\'s pose is bd_shooter\'s own', () => {
		expect([TUNING.pitchMinDeg.value, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg.value]).toEqual([...PITCHES_DEG]);
		expect(byPitch.size, 'non-vacuity: a result per pitch').toBe(PITCHES_DEG.length);
		expect(shooterLocalMm, 'bd_shooter was resolved').toBeDefined();
		for (const axis of ['x', 'y', 'z'] as const) {
			expect(Math.abs(shooterLocalMm![axis] - SHOOTER_POS_MM[axis]), `bd_shooter ${axis}: ${shooterLocalMm![axis]} vs ${SHOOTER_POS_MM[axis]}`).toBeLessThanOrEqual(0.01);
		}
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

	// mutation: give the vis_lockbar node a translation of 100 mm upward in the
	// glb JSON chunk -> red here.
	//
	// [2026-10-13, implement -- OPEN, reported to the lead, NOT worked round]
	// This case is RED on the committed glb, as AC 5 words it ("at the rest
	// pose"). At rest (the real loop's idle pose, angleDeg +/-141) each bat
	// droops to level-frame y 15..16, and the lockdown bar of the spec's fit
	// table (y -44..-8, z 62..80) hides the deck up to y 35 and anything 20 mm
	// above it up to y 26.5: the four tip-end corners of each bat and of each
	// rubber are behind `vis_lockbar` at all three pitches (42 of 108 bat
	// vertices, 112 of 288 rubber vertices). The plan's "both flippers start
	// at y 57.5 and are clear" holds for the authored END-OF-STROKE pose only,
	// where all nine samples of each are visible. The case is left exactly as
	// the spec states it; the measurement and the choices are in the spec's
	// Spec Change Log (2026-10-13, implement).
	it.each(PITCHES_DEG)('at %s degrees neither flipper nor its rubber (centre and eight world-bbox corners, at rest) is covered', (pitchDeg) => {
		const { flippers } = resultAt(pitchDeg);
		expect(flippers.samples, 'non-vacuity: two bats and two rubbers, nine samples each').toBe(4 * 9);
		expect(flippers.covers, describeCovers(flippers.covers)).toEqual([]);
	});

	it.each(PITCHES_DEG)('at %s degrees the Backglass quad\'s front face (centre and four inset corners) and the plunger knob\'s top are not covered', (pitchDeg) => {
		const { backglass, knob } = resultAt(pitchDeg);
		expect(backglass.samples, 'non-vacuity: five Backglass samples').toBe(5);
		expect(backglass.covers, describeCovers(backglass.covers)).toEqual([]);
		expect(knob.samples, 'non-vacuity: the knob sample').toBe(1);
		expect(knob.covers, describeCovers(knob.covers)).toEqual([]);
	});

	// mutation: give the vis_lockbar node a translation of 12 mm upward in the
	// glb JSON chunk -> red here (the ray to the ball's centre passes about
	// 9 mm above the bar's back top edge).
	it.each(PITCHES_DEG)('at %s degrees the centre and the top of the ball resting in the shooter lane are not covered', (pitchDeg) => {
		const { ballCentre, ballTop } = resultAt(pitchDeg);
		expect(ballCentre, describeCovers(ballCentre)).toEqual([]);
		expect(ballTop, describeCovers(ballTop)).toEqual([]);
	});

	it.each(PITCHES_DEG)('at %s degrees no point of the 9 x 9 deck grid is covered', (pitchDeg) => {
		const { deck } = resultAt(pitchDeg);
		expect(deck.samples, 'non-vacuity: 81 deck samples').toBe(DECK_GRID.steps * DECK_GRID.steps);
		expect(deck.covers, describeCovers(deck.covers)).toEqual([]);
	});

	it.each(PITCHES_DEG)('controls at %s degrees: the deck at y 10 on the centreline IS behind the lockdown bar, and so is the resting ball\'s near point', (pitchDeg) => {
		const { deckFrontControl, ballNear } = resultAt(pitchDeg);
		expect(deckFrontControl.map((c) => c.by), 'the lockdown bar hides the first 35 mm of deck by design').toEqual([LOCKBAR]);
		expect(ballNear.map((c) => c.by), 'the lockdown bar clips the waiting ball\'s near edge, and only that').toEqual([LOCKBAR]);
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

	it('Hide an unknown or mesh-less node: a missing name, a lamp Empty and a root each throw naming the node, and nothing changes', async () => {
		await withShippedScene((scene) => {
			const before = scene.meshes.map((m) => m.isVisible);
			expect(() => setNodeVisible(scene, 'vis_coin_door', false)).toThrow(/"vis_coin_door"/);
			for (const empty of [...Object.keys(TABLE.giChannels), TABLE.nodes.cabinetRoot]) {
				expect(() => setNodeVisible(scene, empty, false)).toThrow(new RegExp(`"${empty}" carries no mesh`));
			}
			expect(() => setNodeVisible(scene, GLASS, 0 as unknown as boolean)).toThrow(/visible must be true or false/);
			expect(scene.meshes.map((m) => m.isVisible), 'no mesh changed').toEqual(before);
			expect(before.length, 'non-vacuity: meshes').toBeGreaterThan(100);
		});
	});
});
