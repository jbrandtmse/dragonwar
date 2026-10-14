// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 (QA) -- the cabinet through the REAL boot-shaped pipeline: the
// committed glb on a `NullEngine` through `loadAndRenderOnceForTests()` (the
// function `bootScene()` delegates to), its render loop left running, and a
// render hook shaped like `src/host/boot.ts`'s -- the three first-frame
// resolves, the `latestSnapshot` guard, then `syncBalls()`,
// `syncMechanisms()`, `applyPitch(nodes, latestSnapshot.effectivePitchDeg)`
// and `syncLamps()` -- fed snapshots of a real `createLoop`.
//
// Two gaps the story's own files leave open, each closed here:
//
//   1. View state survives the frames that follow it. boot.ts calls
//      `resolveCabinet()` and `resolveArchitecturalLamps()` on EVERY render
//      frame, and the two dev hatches (AC 9's negative controls) act
//      through `setArchitecturalLevel()` and `setNodeVisible()` between
//      frames. The existing cases read a level or a visibility straight
//      after setting it, with no frame in between, so a resolve that put
//      the default level back, or showed the cabinet again, on every call
//      left them green while every hatch call was undone one frame later.
//   2. The fit (AC 2, and the I/O matrix's last row, "applyPitch() at the
//      two bounds") through the pipeline that really pitches the table.
//      `test/cabinet-art.test.ts` pitches the glb's vertices with its own
//      formula, in the authored pose. Here the pitch comes from a real loop
//      built at each allowed pitch and reaches `applyPitch()` through the
//      snapshot, and the mechanisms are posed by the real follower: at
//      rest, and with both flippers and the plunger held to the end of
//      their stroke. At full stroke the plunger knob must still be in front
//      of the body's front face and the rod must still pass through the
//      front wall (AC 2's plunger rule in motion; AC 12's follower on the
//      new rod).
//
// The restated hook is tied to boot.ts's own text by a source scan (comments
// stripped) so it cannot drift from the hook it stands for. The resolves
// above the guard are pinned by `test/boot-cabinet-wiring.test.ts` and
// `test/boot-mechanisms-wiring.test.ts`; the hatches' bodies by the former.
//
// What this file cannot prove: a pixel. `NullEngine` rasterises nothing.
//
// Falsifiability (Rule 19; each observed red, recorded in the spec's
// Verification section under "QA"; the product file restored byte for byte
// inside the same command):
//   mutation: make resolveArchitecturalLamps() in architectural.ts put every
//     light back to its default intensity on every call -> the view-state
//     case red, while test/architectural-lighting.test.ts and
//     test/boot-cabinet-wiring.test.ts stay green under it.
//   mutation: make resolveCabinet()'s cached branch in cabinet.ts set every
//     cabinet mesh visible -> the view-state case red, while
//     test/cabinet-scene.test.ts and test/boot-cabinet-wiring.test.ts stay
//     green under it.
//   mutation: double the angle applyPitch() in playfield.ts turns the
//     playfield by -> the fit case red at all three pitches and both poses
//     (cabinet-art cannot see it: it imports nothing from presentation but
//     vis-names).
//   mutation: move vis_plunger's tip-end vertices (table y 18.505 and
//     21.505) 40 mm toward table -Y in the glb BIN -> the front-wall plunger
//     case red at the end of stroke at all three pitches and green at rest,
//     while test/cabinet-art.test.ts (the authored pose) stays green.
//   mutation: feed applyPitch() TABLE.reference.pitchDeg instead of
//     latestSnapshot.effectivePitchDeg in boot.ts -> the source-scan case
//     red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { applyPitch, getRequiredNode, type PlayfieldNodes } from '../src/presentation/scene/playfield';
import { syncBalls } from '../src/presentation/scene/balls';
import { resolveCabinet } from '../src/presentation/scene/cabinet';
import { setNodeVisible } from '../src/presentation/scene/node-visibility';
import { VIS_PLUNGER_NODE_NAME } from '../src/presentation/scene/vis-names';
import { resolveMechanismNodes, syncMechanisms } from '../src/presentation/mechanisms/sync-mechanisms';
import { syncLamps } from '../src/presentation/lighting/lamp-driver';
import { ARCHITECTURAL_DEFAULT_LEVEL, architecturalLevel, resolveArchitecturalLamps, setArchitecturalLevel } from '../src/presentation/lighting/architectural';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { glbToTable, toScene, type Vec3 } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import type { GiChannel, Snapshot } from '../src/sim/table/names';

const REPO_ROOT = path.resolve(__dirname, '..');
const GLB_PATH = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.collision.json');
const BOOT_TS = path.join(REPO_ROOT, 'src', 'host', 'boot.ts');

// ---------------------------------------------------------------------------
// The spec's figures, typed (never read from the scene under test).
// ---------------------------------------------------------------------------

/** TUNING.pitchMinDeg, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg. */
const PITCHES_DEG = [6.0, 6.5, 8.5] as const;
const POSES = ['rest', 'end of stroke'] as const;
type Pose = (typeof POSES)[number];
/** The fit table's tub (level-frame mm): the side walls' inner faces, the body's front face, the front wall's inner face, the arch panel's front face. */
const TUB = { innerX0: -13.8, innerX1: 528.2, frontOuterY: -50, frontInnerY: -32, archFrontY: 1075 };
/** The glass's lower face: Z = 66.10 + (205/1400) Y. */
const GLASS_LOWER = { zAtY0: 66.1, slope: 205 / 1400 };
const GLASS_CLEARANCE_MM = 5;
const FIT_TOL_MM = 0.05;
/** The plunger's full stroke (`test/mechanisms-follow.test.ts`'s DW-292 figure: 1.5 in). */
const FULL_STROKE_MM = 38.1;
/** AC 12, playfield frame, authored pose: the knob spans y -62 to -50; the rod runs from -50 to bd_shooter.y - ballMm/2. */
const KNOB_Y = { y0: -62, y1: -50 };
const BD_SHOOTER_Y_MM = 35;
const ROD_Y = { y0: -50, y1: BD_SHOOTER_Y_MM - TABLE.reference.ballMm / 2 };
/** The two flipper poses of AC 5 (the snapshot's angleDeg, left side; the right is its negative). */
const FLIPPER_ANGLE_DEG: Readonly<Record<Pose, number>> = { rest: 141, 'end of stroke': 90 };
const PULL_MM: Readonly<Record<Pose, number>> = { rest: 0, 'end of stroke': FULL_STROKE_MM };
const POSE_TOL = 0.5;
/** The authored intensity at level 1, per channel (the spec's Boundaries). */
const TYPED_INTENSITY: Readonly<Record<string, number>> = { gi_backbox: 20, gi_cabinet: 10, gi_arch: 10 };
const CHANNELS = Object.keys(TABLE.giChannels) as GiChannel[];
const PLUNGER_KNOB = `${VIS_PLUNGER_NODE_NAME}_knob`;
const FRAME_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// The boot-shaped render hook.
// ---------------------------------------------------------------------------

type RenderHook = NonNullable<Parameters<typeof loadAndRenderOnceForTests>[3]>;

interface HookState {
	/** The latest snapshot, as boot.ts's host loop leaves it; undefined until the test sets one, exactly as on boot's first frames. */
	snapshot: Snapshot | undefined;
	/** How many times the render loop has called the hook. */
	calls: number;
}

/**
 * boot.ts's render hook, restated without what moves no vertex and touches
 * no cabinet or architectural state: the `liveScene` capture (the hatches'
 * target; pinned by `test/boot-mechanisms-wiring.test.ts`) and the
 * Backglass blit. The insert lamps are synced with every lamp off, as in an
 * Attract frame before any `LampCommand`.
 */
function bootShapedHook(state: HookState): RenderHook {
	return (scene, nodes) => {
		state.calls += 1;
		resolveMechanismNodes(scene, nodes.playfieldRoot);
		resolveCabinet(scene, nodes.cabinetRoot);
		resolveArchitecturalLamps(scene);
		const latestSnapshot = state.snapshot;
		if (!latestSnapshot) {
			return;
		}
		syncBalls(scene, nodes.playfieldRoot, latestSnapshot);
		syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot);
		applyPitch(nodes, latestSnapshot.effectivePitchDeg);
		syncLamps(scene, nodes.playfieldRoot, {}, 0);
	};
}

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's own header
}

/** The committed glb booted through the boot-shaped hook; the render loop keeps running until the body returns. */
async function withHookedScene(state: HookState, body: (scene: Scene, nodes: PlayfieldNodes) => Promise<void>): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(readFileSync(GLB_PATH)), { pluginExtension: '.glb' }, bootShapedHook(state));
		try {
			await body(scene, playfieldNodes);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

/** Waits for `count` more frames of the scene's own render loop (each one runs the hook, then `scene.render()`). */
async function renderedFrames(scene: Scene, count: number): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`the render loop did not render frame ${i + 1} of ${count} within ${FRAME_TIMEOUT_MS} ms`)), FRAME_TIMEOUT_MS);
			scene.onAfterRenderObservable.addOnce(() => {
				clearTimeout(timer);
				resolve();
			});
		});
	}
}

// ---------------------------------------------------------------------------
// The real loop.
// ---------------------------------------------------------------------------

function loadCollisionDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8')) as unknown;
}

function tuningWithPitch(pitchDeg: number): ReturnType<typeof resolveTuning> {
	return resolveTuning({ ...TUNING, defaultPitchDeg: { value: pitchDeg, source: 'test fixture', confidence: 'unverified' as const } });
}

/** Advances a real loop in <= 100 ms chunks (the loop's own owed-time cap) until `ticks` more have run (`test/mechanisms-follow.test.ts`'s own idiom). */
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

/** One real loop built at `pitchDeg`: its idle snapshot (Attract, flippers drooped, plunger forward), then both flippers and the plunger held for 600 ticks (past the 500-tick full pull). */
function loopPoses(pitchDeg: number): Record<Pose, Snapshot> {
	const loop = createLoop({ collisionDoc: loadCollisionDoc(), tuning: tuningWithPitch(pitchDeg) });
	const rest = advanceTicks(loop, 200);
	const end = advanceTicks(loop, 600, [{ tick: rest.tick + 1, frame: { ...NO_FRAME, flipper_l: true, flipper_r: true, plunger: true } }]);
	return { rest, 'end of stroke': end };
}

// ---------------------------------------------------------------------------
// Measuring the scene.
// ---------------------------------------------------------------------------

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

/** A mesh's own vertices in world space, as level-frame millimetres (the scene's axes, cabinet_root's frame). */
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

/** A world-space point (scene metres) as playfield-frame millimetres: the unpitched table frame `playfield_root` carries. */
function toPlayfieldMm(world: Vec3, toPlayfield: Matrix): Vec3 {
	const local = Vector3.TransformCoordinates(new Vector3(world.x, world.y, world.z), toPlayfield);
	return glbToTable({ x: local.x, y: local.y, z: local.z });
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The distinct values of one coordinate, ascending, values within 0.01 mm merged. */
function distinct(values: readonly number[]): number[] {
	const out: number[] = [];
	for (const value of [...values].sort((a, b) => a - b)) {
		if (out.length === 0 || value - out[out.length - 1]! > 0.01) {
			out.push(value);
		}
	}
	return out;
}

interface CabinetSurfaces {
	/** The glass's large-face unit normal (pointing up) and `normal . p` on its lower face. */
	readonly glassNormal: Vec3;
	readonly glassLowerD: number;
	readonly innerX0: number;
	readonly innerX1: number;
	readonly frontOuterY: number;
	readonly frontInnerY: number;
	readonly archFrontY: number;
}

/** The glass and the tub as the scene carries them: the glass's largest triangle gives its plane; the body's second and third distinct x and its first and second distinct y give the tub. */
function cabinetSurfaces(scene: Scene): CabinetSurfaces {
	const glass = meshNamed(scene, 'vis_top_glass');
	const glassVertices = levelVertices(glass);
	const indices = glass.getIndices();
	if (!indices || indices.length < 3) {
		throw new Error('vis_top_glass: no triangles');
	}
	let best: Vec3 | undefined;
	let bestArea = 0;
	for (let k = 0; k + 2 < indices.length; k += 3) {
		const a = glassVertices[indices[k]!]!;
		const b = glassVertices[indices[k + 1]!]!;
		const c = glassVertices[indices[k + 2]!]!;
		const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
		const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
		const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
		const area = Math.hypot(n.x, n.y, n.z);
		if (area > bestArea) {
			bestArea = area;
			best = n;
		}
	}
	const sign = best!.z < 0 ? -1 : 1;
	const glassNormal = { x: (sign * best!.x) / bestArea, y: (sign * best!.y) / bestArea, z: (sign * best!.z) / bestArea };
	const glassLowerD = Math.min(...glassVertices.map((p) => dot(glassNormal, p)));

	const body = levelVertices(meshNamed(scene, 'vis_cabinet'));
	const xs = distinct(body.map((v) => v.x));
	const ys = distinct(body.map((v) => v.y));
	if (xs.length !== 4 || ys.length !== 4) {
		throw new Error(`vis_cabinet is not a four-walled tub: distinct x ${xs.join(', ')}; distinct y ${ys.join(', ')}`);
	}
	const archFrontY = Math.min(...levelVertices(meshNamed(scene, 'vis_cabinet_arch')).map((v) => v.y));
	return { glassNormal, glassLowerD, innerX0: xs[1]!, innerX1: xs[2]!, frontOuterY: ys[0]!, frontInnerY: ys[1]!, archFrontY };
}

interface Extent {
	readonly vertices: number;
	/** Smallest and greatest level-frame depth (y). */
	readonly minLevelY: number;
	readonly maxLevelY: number;
	/** Smallest and greatest playfield-frame y: where the follower put it. */
	readonly minPlayfieldY: number;
	readonly maxPlayfieldY: number;
}

interface LiveFit {
	readonly surfaces: CabinetSurfaces;
	readonly meshes: number;
	readonly vertices: number;
	readonly plungerVertices: number;
	readonly minGlassClearanceMm: number;
	/** The "Playfield fit" rules, against the surfaces above (at most eight, then counted). */
	readonly problems: string[];
	readonly problemCount: number;
	readonly knob: Extent;
	readonly rod: Extent;
	/** The pitch `playfield_root` really carries: the angle a playfield point 1000 mm up-table makes with the level, and how far the pivot moved. */
	readonly appliedPitchDeg: number;
	readonly pivotDriftMm: number;
}

function extentOf(mesh: AbstractMesh, toPlayfield: Matrix): Extent {
	const level = levelVertices(mesh);
	const playfield = level.map((v) => toPlayfieldMm(toScene(v), toPlayfield));
	return {
		vertices: level.length,
		minLevelY: Math.min(...level.map((v) => v.y)),
		maxLevelY: Math.max(...level.map((v) => v.y)),
		minPlayfieldY: Math.min(...playfield.map((v) => v.y)),
		maxPlayfieldY: Math.max(...playfield.map((v) => v.y)),
	};
}

/**
 * Every vertex of every mesh under `playfield_root`, as the scene has posed
 * and pitched it right now, against the four "Playfield fit" rules: at least
 * 5 mm below the glass's lower face, between the side walls' inner faces, in
 * front of the arch panel's front face, and (the plunger apart, whose rod
 * passes through the wall by design) behind the front wall's inner face.
 */
function liveFit(scene: Scene, nodes: PlayfieldNodes): LiveFit {
	refreshWorld(scene);
	const surfaces = cabinetSurfaces(scene);
	const plunger = meshNamed(scene, VIS_PLUNGER_NODE_NAME);
	const toPlayfield = Matrix.Invert(nodes.playfieldRoot.computeWorldMatrix(true));
	const meshes = scene.meshes.filter((m) => m.isDescendantOf(nodes.playfieldRoot) && m.getTotalVertices() > 0);
	const problems: string[] = [];
	let problemCount = 0;
	const report = (text: string): void => {
		problemCount += 1;
		if (problems.length < 8) {
			problems.push(text);
		}
	};
	let vertices = 0;
	let plungerVertices = 0;
	let minGlassClearanceMm = Infinity;
	for (const mesh of meshes) {
		const isPlunger = mesh === plunger || mesh.isDescendantOf(plunger);
		for (const v of levelVertices(mesh)) {
			vertices += 1;
			const at = `${mesh.name} vertex at level (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
			const clearance = surfaces.glassLowerD - dot(surfaces.glassNormal, v);
			minGlassClearanceMm = Math.min(minGlassClearanceMm, clearance);
			if (clearance < GLASS_CLEARANCE_MM) {
				report(`${at} is ${clearance.toFixed(3)} mm below the glass's lower face (needs ${GLASS_CLEARANCE_MM})`);
			}
			if (!(v.x > surfaces.innerX0 && v.x < surfaces.innerX1)) {
				report(`${at} is not between the side walls' inner faces (${surfaces.innerX0.toFixed(3)}, ${surfaces.innerX1.toFixed(3)})`);
			}
			if (!(v.y < surfaces.archFrontY)) {
				report(`${at} is not in front of the arch panel's front face (${surfaces.archFrontY.toFixed(3)})`);
			}
			if (isPlunger) {
				plungerVertices += 1;
			} else if (!(v.y > surfaces.frontInnerY)) {
				report(`${at} is not behind the front wall's inner face (${surfaces.frontInnerY.toFixed(3)})`);
			}
		}
	}
	// The pitch as applied: playfield (257.2, 1000, 0) and the pivot (257.2, 0, 0), carried into the level frame.
	const world = nodes.playfieldRoot.computeWorldMatrix(true);
	const carry = (mm: Vec3): Vec3 => {
		const s = toScene(mm);
		const p = Vector3.TransformCoordinates(new Vector3(s.x, s.y, s.z), world);
		return glbToTable({ x: p.x, y: p.y, z: p.z });
	};
	const far = carry({ x: 257.2, y: 1000, z: 0 });
	const pivot = carry({ x: 257.2, y: 0, z: 0 });
	return {
		surfaces,
		meshes: meshes.length,
		vertices,
		plungerVertices,
		minGlassClearanceMm,
		problems,
		problemCount,
		knob: extentOf(meshNamed(scene, PLUNGER_KNOB), toPlayfield),
		rod: extentOf(plunger, toPlayfield),
		appliedPitchDeg: (Math.atan2(far.z - pivot.z, far.y - pivot.y) * 180) / Math.PI,
		pivotDriftMm: Math.hypot(pivot.x - 257.2, pivot.y, pivot.z),
	};
}

/** The plunger rules against the front wall: every knob vertex in front of the body's front face, and the rod's own vertices on both sides of the wall. */
function plungerProblems(fit: LiveFit): string[] {
	const out: string[] = [];
	const { frontOuterY, frontInnerY } = fit.surfaces;
	if (!(fit.knob.maxLevelY < frontOuterY)) {
		out.push(`${PLUNGER_KNOB} reaches level depth ${fit.knob.maxLevelY.toFixed(3)}, not in front of the body's front face (${frontOuterY.toFixed(3)})`);
	}
	if (!(fit.rod.minLevelY < frontOuterY)) {
		out.push(`${VIS_PLUNGER_NODE_NAME}'s rod has no vertex in front of the body's front face (${frontOuterY.toFixed(3)}); its smallest depth is ${fit.rod.minLevelY.toFixed(3)}`);
	}
	if (!(fit.rod.maxLevelY > frontInnerY)) {
		out.push(`${VIS_PLUNGER_NODE_NAME}'s rod has no vertex behind the front wall's inner face (${frontInnerY.toFixed(3)}); its greatest depth is ${fit.rod.maxLevelY.toFixed(3)} -- the rod has left the cabinet`);
	}
	return out;
}

function expectClose(actual: number, expected: number, tolerance: number, label: string): void {
	expect(Math.abs(actual - expected), `${label}: ${actual.toFixed(4)} vs ${expected} (+/- ${tolerance})`).toBeLessThanOrEqual(tolerance);
}

// ---------------------------------------------------------------------------
// The source scan that ties the restated hook to boot.ts.
// ---------------------------------------------------------------------------

const HOOK_OPEN = 'await bootScene(canvas, GLB_URL, (scene, nodes) => {';
const HOOK_CLOSE = '\n\t\t});';
const SNAPSHOT_GUARD = 'if (!latestSnapshot) {';
/** What the restated hook runs after the guard, in boot.ts's own words and order. */
const AFTER_GUARD = [
	'syncBalls(scene, nodes.playfieldRoot, latestSnapshot);',
	'syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot);',
	'applyPitch(nodes, latestSnapshot.effectivePitchDeg);',
	'syncLamps(',
] as const;

/** boot.ts with every whole-line `//` comment and then every block comment removed (`test/boot-mechanisms-wiring.test.ts`'s order and reason). */
function bootSource(): string {
	return readFileSync(BOOT_TS, 'utf8')
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n')
		.replace(/\/\*[\s\S]*?\*\//g, '');
}

function checkAfterGuard(source: string): void {
	const at = source.indexOf(HOOK_OPEN);
	expect(at, 'boot.ts has its bootScene() render hook').toBeGreaterThan(-1);
	const hook = source.slice(at + HOOK_OPEN.length, source.indexOf(HOOK_CLOSE, at));
	const guardAt = hook.indexOf(SNAPSHOT_GUARD);
	expect(guardAt, `the hook keeps its "${SNAPSHOT_GUARD}" guard`).toBeGreaterThan(-1);
	let previous = guardAt;
	for (const call of AFTER_GUARD) {
		const callAt = hook.indexOf(call);
		expect(callAt, `the render hook calls "${call}"`).toBeGreaterThan(-1);
		expect(hook.indexOf(call, callAt + 1), `"${call}" occurs once in the hook`).toBe(-1);
		expect(callAt, `"${call}" runs after the guard and after the call before it, as the restated hook runs it`).toBeGreaterThan(previous);
		previous = callAt;
	}
}

describe('Story 5.3 (QA) -- the restated hook is boot.ts\'s own (source scan, comments stripped)', () => {
	// mutation: feed applyPitch() TABLE.reference.pitchDeg instead of
	// latestSnapshot.effectivePitchDeg in boot.ts -> red here.
	it('after the latestSnapshot guard boot.ts\'s hook calls syncBalls, syncMechanisms, applyPitch(nodes, latestSnapshot.effectivePitchDeg) and syncLamps, once each, in that order', () => {
		checkAfterGuard(bootSource());
	});

	it('negative controls: a hook that pitches by the reference pitch, or pitches before the guard, fails the scan', () => {
		const real = bootSource();
		const pitchCall = AFTER_GUARD[2];
		const byReference = real.replace(pitchCall, 'applyPitch(nodes, TABLE.reference.pitchDeg);');
		expect(byReference, 'precondition: the mutation applies').not.toBe(real);
		expect(() => checkAfterGuard(byReference)).toThrow(/calls "applyPitch\(nodes, latestSnapshot\.effectivePitchDeg\);"/);
		const early = real.replace(`${pitchCall}\n`, '').replace(SNAPSHOT_GUARD, `${pitchCall}\n\t\t\t${SNAPSHOT_GUARD}`);
		expect(early, 'precondition: the mutation applies').not.toBe(real);
		expect(() => checkAfterGuard(early)).toThrow(/runs after the guard/);
	});
});

// ---------------------------------------------------------------------------
// 1. View state survives later frames.
// ---------------------------------------------------------------------------

describe('Story 5.3 (QA) -- a level and a hidden mesh survive the render frames after them (I/O rows "Resolve called every frame", "Level set", "Hide a mesh"; the hatches of AC 8 and AC 9)', () => {
	// mutation: make resolveArchitecturalLamps() put every light back to its
	// default intensity on every call -> red here.
	// mutation: make resolveCabinet()'s cached branch set every cabinet mesh
	// visible -> red here.
	it('through the boot-shaped hook on the running render loop, setArchitecturalLevel() and setNodeVisible() still hold three frames later; the default level and visible restore them', async () => {
		const pose = loopPoses(TABLE.reference.pitchDeg).rest;
		expect(pose.balls, 'Attract: no ball on the table').toEqual([]);
		const state: HookState = { snapshot: undefined, calls: 0 };
		await withHookedScene(state, async (scene) => {
			expect(state.calls, 'the first frame ran the hook (its resolves)').toBeGreaterThan(0);
			state.snapshot = pose;
			await renderedFrames(scene, 2);
			const lamps = resolveArchitecturalLamps(scene);
			const lights: PointLight[] = CHANNELS.map((channel) => lamps.get(channel)!);
			const intensities = (): number[] => lights.map((light) => light.intensity);
			const typedAt = (levels: readonly number[]): number[] => CHANNELS.map((channel, i) => levels[i]! * TYPED_INTENSITY[channel]!);
			expect(CHANNELS.length, 'three channels').toBe(3);
			expect(intensities(), 'every lamp at its authored intensity after the hook\'s frames').toEqual(typedAt([1, 1, 1]));
			const lightCount = scene.lights.length;
			const body = meshNamed(scene, 'vis_cabinet');
			const glass = meshNamed(scene, 'vis_top_glass');
			const bodyChildren = body.getChildMeshes(true);
			expect(bodyChildren.length, 'non-vacuity: the body\'s rails and arch panel').toBe(3);
			expect([body.isVisible, glass.isVisible], 'visible as booted').toEqual([true, true]);

			// What the two hatches do, between frames.
			setArchitecturalLevel(scene, CHANNELS[0]!, 0.25);
			setArchitecturalLevel(scene, CHANNELS[1]!, 0);
			setNodeVisible(scene, 'vis_cabinet', false);
			setNodeVisible(scene, 'vis_top_glass', false);
			expect(intensities(), 'the same frame: what the existing cases read').toEqual(typedAt([0.25, 0, 1]));

			const callsBefore = state.calls;
			await renderedFrames(scene, 3);
			expect(state.calls - callsBefore, 'non-vacuity: the hook (and both resolves in it) ran on each of the three frames').toBeGreaterThanOrEqual(3);
			expect(intensities(), 'three frames later every level still holds').toEqual(typedAt([0.25, 0, 1]));
			expect(CHANNELS.map((channel) => architecturalLevel(scene, channel)), 'and reads back').toEqual([0.25, 0, 1]);
			expect(lights.map((light) => light.isEnabled()), 'every light still enabled').toEqual([true, true, true]);
			expect(CHANNELS.map((channel) => resolveArchitecturalLamps(scene).get(channel)), 'the same light objects').toEqual(lights);
			expect(scene.lights.length, 'no light created or disposed by the frames').toBe(lightCount);
			expect([body.isVisible, glass.isVisible], 'three frames later both meshes are still hidden').toEqual([false, false]);
			expect(bodyChildren.map((m) => m.isVisible), 'and the body\'s children are still drawn').toEqual([true, true, true]);

			// The restores the hatches offer: the default level (`null`) and visible.
			setArchitecturalLevel(scene, CHANNELS[0]!, ARCHITECTURAL_DEFAULT_LEVEL);
			setArchitecturalLevel(scene, CHANNELS[1]!, ARCHITECTURAL_DEFAULT_LEVEL);
			setNodeVisible(scene, 'vis_cabinet', true);
			setNodeVisible(scene, 'vis_top_glass', true);
			await renderedFrames(scene, 2);
			expect(intensities(), 'restored to the authored intensities').toEqual(typedAt([1, 1, 1]));
			expect([body.isVisible, glass.isVisible], 'shown again').toEqual([true, true]);
		});
	});
});

// ---------------------------------------------------------------------------
// 2. The fit through the pipeline that really pitches the table.
// ---------------------------------------------------------------------------

interface PoseResult {
	readonly snapshot: Snapshot;
	readonly fit: LiveFit;
}

const results = new Map<string, PoseResult>();
const key = (pitchDeg: number, pose: Pose): string => `${pitchDeg}/${pose}`;
let controls: { loweredGlass: LiveFit; pulledRod: LiveFit; restoredGlass: LiveFit } | undefined;

function resultAt(pitchDeg: number, pose: Pose): PoseResult {
	const result = results.get(key(pitchDeg, pose));
	if (!result) {
		throw new Error(`no result for ${pitchDeg} deg, ${pose}: the shared scene pass failed`);
	}
	return result;
}

const CASES = PITCHES_DEG.flatMap((pitchDeg) => POSES.map((pose) => [pitchDeg, pose] as const));

describe('Story 5.3 (QA) -- the fit at every allowed pitch, posed and pitched by the real pipeline (AC 2, AC 12; the I/O row "Pitch at 6.0 and at 8.5")', () => {
	beforeAll(async () => {
		const poses = new Map(PITCHES_DEG.map((pitchDeg) => [pitchDeg, loopPoses(pitchDeg)] as const));
		const state: HookState = { snapshot: undefined, calls: 0 };
		await withHookedScene(state, async (scene, nodes) => {
			for (const pitchDeg of PITCHES_DEG) {
				for (const pose of POSES) {
					const snapshot = poses.get(pitchDeg)![pose];
					state.snapshot = snapshot;
					await renderedFrames(scene, 1);
					// Measured synchronously, before the render loop's next frame.
					results.set(key(pitchDeg, pose), { snapshot, fit: liveFit(scene, nodes) });
				}
			}
			// In-memory controls, at 8.5 degrees and the end of stroke (the
			// state the loop above left), each undone before the next frame.
			const glass = meshNamed(scene, 'vis_top_glass');
			glass.position.y -= 0.03; // scene y is table z: 30 mm down
			const loweredGlass = liveFit(scene, nodes);
			glass.position.y += 0.03;
			const restoredGlass = liveFit(scene, nodes);
			const plunger = meshNamed(scene, VIS_PLUNGER_NODE_NAME);
			const before = plunger.position.clone();
			const further = toScene({ x: 0, y: -60, z: 0 }); // 60 mm more toward the player, in the follower's own terms
			plunger.position.addInPlace(new Vector3(further.x, further.y, further.z));
			const pulledRod = liveFit(scene, nodes);
			plunger.position.copyFrom(before);
			controls = { loweredGlass, pulledRod, restoredGlass };
		});
	});

	it('the poses are the real loop\'s: one loop per allowed pitch, the snapshot carrying that pitch; Attract, no ball; at rest the flippers droop and the plunger is forward; at the end of stroke the flippers are up and the plunger is fully drawn', () => {
		expect([TUNING.pitchMinDeg.value, TABLE.reference.pitchDeg, TUNING.pitchMaxDeg.value], 'the three pitches').toEqual([...PITCHES_DEG]);
		expect(results.size, 'non-vacuity: a result per pitch and pose').toBe(PITCHES_DEG.length * POSES.length);
		for (const [pitchDeg, pose] of CASES) {
			const { snapshot } = resultAt(pitchDeg, pose);
			const label = `${pitchDeg} deg, ${pose}`;
			expect(snapshot.effectivePitchDeg, `${label}: the loop's own effective pitch`).toBe(pitchDeg);
			expect(snapshot.balls, `${label}: no ball on the table`).toEqual([]);
			expectClose(snapshot.mechanisms.flippers.l.angleDeg, FLIPPER_ANGLE_DEG[pose], POSE_TOL, `${label}: left flipper angleDeg`);
			expectClose(snapshot.mechanisms.flippers.r.angleDeg, -FLIPPER_ANGLE_DEG[pose], POSE_TOL, `${label}: right flipper angleDeg`);
			expectClose(snapshot.mechanisms.plunger.posMm, PULL_MM[pose], 1e-6, `${label}: plunger posMm`);
		}
		expect(FLIPPER_ANGLE_DEG.rest - FLIPPER_ANGLE_DEG['end of stroke'], 'the two flipper poses are the sim\'s own sweep apart').toBe(TUNING.flipper.sweepDeg.value);
	});

	it.each(CASES)('at %s degrees, %s: playfield_root really carries the snapshot\'s pitch, about pivot_pitch', (pitchDeg, pose) => {
		const { fit } = resultAt(pitchDeg, pose);
		// Babylon's matrices are float32: the applied angle reads within 2e-7 degrees.
		expectClose(fit.appliedPitchDeg, pitchDeg, 1e-5, 'the pitch playfield_root really carries');
		expect(fit.pivotDriftMm, 'pivot_pitch stays where it is').toBeLessThanOrEqual(1e-6);
	});

	// mutation: double the angle applyPitch() in playfield.ts turns the
	// playfield by -> red here at all three pitches (and in the case above).
	it.each(CASES)('at %s degrees, %s: every playfield vertex is at least 5 mm below the glass, between the side walls, in front of the arch panel and (the plunger apart) behind the front wall', (pitchDeg, pose) => {
		const { fit } = resultAt(pitchDeg, pose);
		expect(fit.meshes, 'non-vacuity: meshes under playfield_root').toBeGreaterThan(100);
		expect(fit.vertices, 'non-vacuity: playfield vertices checked').toBeGreaterThan(20000);
		expect(fit.plungerVertices, 'non-vacuity: the plunger exemption covers real vertices').toBeGreaterThan(0);
		expect(fit.plungerVertices, 'the exemption is the plunger alone').toBeLessThan(fit.vertices / 20);
		expect(fit.problems, `${fit.problemCount} problems: ${fit.problems.join('; ')}`).toEqual([]);
		expect(fit.minGlassClearanceMm, 'the tightest clearance under the glass').toBeGreaterThanOrEqual(GLASS_CLEARANCE_MM);
	});

	it.each(CASES)('at %s degrees, %s: the follower put the plunger where the real pull says (AC 12\'s spans, moved posMm toward table -Y)', (pitchDeg, pose) => {
		const { fit } = resultAt(pitchDeg, pose);
		const pull = PULL_MM[pose];
		expect(fit.knob.vertices, 'non-vacuity: knob vertices').toBeGreaterThan(50);
		expect(fit.rod.vertices, 'non-vacuity: rod vertices').toBeGreaterThan(50);
		expectClose(fit.knob.minPlayfieldY, KNOB_Y.y0 - pull, FIT_TOL_MM, 'the knob\'s south end');
		expectClose(fit.knob.maxPlayfieldY, KNOB_Y.y1 - pull, FIT_TOL_MM, 'the knob\'s north end');
		expectClose(fit.rod.minPlayfieldY, ROD_Y.y0 - pull, FIT_TOL_MM, 'the rod\'s south end');
		expectClose(fit.rod.maxPlayfieldY, ROD_Y.y1 - pull, FIT_TOL_MM, 'the rod\'s tip');
	});

	// mutation: move vis_plunger's tip-end vertices 40 mm toward table -Y in
	// the glb BIN -> red here at the end of stroke, green at rest.
	it.each(CASES)('at %s degrees, %s: the plunger knob is in front of the body\'s front face and the rod still passes through the front wall', (pitchDeg, pose) => {
		const { fit } = resultAt(pitchDeg, pose);
		expect(fit.knob.vertices + fit.rod.vertices, 'non-vacuity: plunger vertices').toBeGreaterThan(100);
		const problems = plungerProblems(fit);
		expect(problems, problems.join('; ')).toEqual([]);
	});

	it('the glass and the tub the fit is measured against are the fit table\'s own, and stay put while the playfield pitches and the mechanisms move', () => {
		const first = resultAt(PITCHES_DEG[0], 'rest').fit.surfaces;
		expectClose(first.innerX0, TUB.innerX0, FIT_TOL_MM, 'the left wall\'s inner face');
		expectClose(first.innerX1, TUB.innerX1, FIT_TOL_MM, 'the right wall\'s inner face');
		expectClose(first.frontOuterY, TUB.frontOuterY, FIT_TOL_MM, 'the body\'s front face');
		expectClose(first.frontInnerY, TUB.frontInnerY, FIT_TOL_MM, 'the front wall\'s inner face');
		expectClose(first.archFrontY, TUB.archFrontY, FIT_TOL_MM, 'the arch panel\'s front face');
		// The lower face's plane n.p = d, as z = d/n.z - (n.y/n.z) y.
		expectClose(first.glassLowerD / first.glassNormal.z, GLASS_LOWER.zAtY0, FIT_TOL_MM, 'the glass\'s lower face at y 0');
		expectClose(-first.glassNormal.y / first.glassNormal.z, GLASS_LOWER.slope, 1e-4, 'the glass\'s slope');
		expect(Math.abs(first.glassNormal.x), 'the glass is level across').toBeLessThanOrEqual(1e-6);
		for (const [pitchDeg, pose] of CASES) {
			const s = resultAt(pitchDeg, pose).fit.surfaces;
			for (const k of ['glassLowerD', 'innerX0', 'innerX1', 'frontOuterY', 'frontInnerY', 'archFrontY'] as const) {
				expectClose(s[k], first[k], 1e-6, `${pitchDeg} deg, ${pose}: ${k}`);
			}
		}
	});

	it('controls: the same instrument on the same scene reports a glass lowered 30 mm, and a rod drawn 60 mm past the full pull; and reads clean again once the glass is back', () => {
		expect(controls, 'the shared scene pass ran').toBeDefined();
		const { loweredGlass, pulledRod, restoredGlass } = controls!;
		expect(loweredGlass.problems.join('; '), 'a glass 30 mm lower touches the table at 8.5 degrees').toMatch(/below the glass's lower face/);
		expect(loweredGlass.minGlassClearanceMm).toBeLessThan(GLASS_CLEARANCE_MM);
		expect(restoredGlass.problems, 'the positive control beside it').toEqual([]);
		expect(plungerProblems(restoredGlass)).toEqual([]);
		expect(plungerProblems(pulledRod).join('; '), 'a rod drawn 60 mm further has left the cabinet').toMatch(/rod has no vertex behind the front wall's inner face/);
		expect(pulledRod.knob.minPlayfieldY, 'non-vacuity: the control really moved the plunger').toBeLessThan(KNOB_Y.y0 - FULL_STROKE_MM - 50);
		// The general fit exempts the plunger, so the same move leaves it clean: the plunger case is the discriminating one.
		expect(pulledRod.problemCount, 'the general fit does not judge the plunger against the front wall').toBe(0);
	});
});
