// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.0a (DW-279), AC 2 -- Rule 3's headless real-runtime artifact for
// the moving half of the visible placeholder pass: `syncMechanisms()` run on
// the REAL loaded scene (NullEngine + the committed glb, the
// `test/ball-render.test.ts` template), fed snapshots produced by the REAL
// simulation (`createLoop()` for the flippers, the drop-target strike
// harness from `test/drop-targets.test.ts` for the bank). The Story 5.0a
// plunger row is synthetic (posMm 0, then 40); since Story 5.4 (DW-292)
// physics publishes the real pull, so the Story 5.4 rows below drive the
// plunger through a real `createLoop()` hold as well.
//
// Every I/O matrix row:
//   Flipper at rest  -- the loader's tipMm, carried through each twin's
//                       local transform, lands within 0.5 mm of
//                       fromPhysics(pivotPhys + R (sin theta, -cos theta)) and below
//                       the pivot.
//   Flipper held     -- vis_flipper_l's HIERARCHY bbox (the bat plus its
//                       Story 5.4 rubber child) matches col_flipper_l's box
//                       within 0.5 mm.
//   Target struck    -- vis_dragon_d drops to/below table z 0 and is not
//                       rendered; the other five stay up and visible.
//   Bank reset       -- all six back at the authored pose, visible.
//   Plunger          -- posMm 0 then 40: authored, then 40 mm toward -Y.
//   Missing twin     -- throws naming vis_flipper_l.
// plus `nodeScreenRect('vis_dragon')` returning a finite rect in the canvas.
//
// Story 5.4 (DW-249, DW-292), AC 1 -- its own I/O matrix:
//   Plunger held     -- real createLoop, held 250 then 600 ticks: posMm is
//                       19.05 then 38.1, and vis_plunger (rod + knob) sits
//                       exactly that far toward table -Y.
//   Plunger released -- posMm 0 on the release tick, vis_plunger authored.
//   Spinner spins    -- tick 1000 then 1500 at 360 deg/s: the blade turns
//                       180 +/- 0.5 deg about table +X from rest (and a
//                       +90 deg turn swings it toward table +Y: the sign).
//   Spinner idle     -- the same snapshot synced twice: angle unchanged.
//   Spinner stops    -- speed 0: the rest pose.
//   Real spinner     -- test/spinner.test.ts's createLoop crossing: speed > 0
//                       and the blade has left rest.
//   Flipper held, Target struck / bank reset -- as above, on the art parts.
//   Missing blade    -- vis_spinner_l_blade renamed out of the glb: the
//                       first sync throws naming it.
//
// Every position is measured in playfield_root's LOCAL frame (so the
// applied pitch cancels out) and converted to table mm with `glbToTable()`
// -- the scene frame and the glb frame are numerically identical
// (frames.ts header).
//
// Falsifiability (Rule 19): negating the flipper rotation in
// sync-mechanisms.ts reddens the rest-tip case; skipping the drop-target
// translation reddens the target-down case; basing a pose on the node's
// CURRENT pose instead of its authored one (accumulating frame over frame)
// reddens the repeated-sync assertions; a bottom-left pixel origin in
// node-screen-rect.ts reddens the orientation assertions. Story 5.4: skipping
// the spinner's angle accumulation reddens "Spinner spins"; returning
// `posMm: 0` from plunger.ts reddens "Plunger held".

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { getRequiredNode } from '../src/presentation/scene/playfield';
import { syncMechanisms } from '../src/presentation/mechanisms/sync-mechanisms';
import { nodeScreenRect } from '../src/presentation/scene/node-screen-rect';
import { VIS_DRAGON_NODE_NAME, VIS_PLUNGER_NODE_NAME, VIS_SPINNER_BLADE_NODE_NAME, visTwinName } from '../src/presentation/scene/vis-names';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { loadCollision } from '../src/sim/physics/loader';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { fromPhysics, glbToTable, MM_PER_VU, toPhysics, toScene, type Vec3 } from '../src/sim/table/frames';
import type { Snapshot } from '../src/sim/table/names';
import { buildSnapshot } from './util/snapshot-factory';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const TIP_TOLERANCE_MM = 0.5;
const BOX_TOLERANCE_MM = 0.5;
const POSE_TOLERANCE_MM = 0.01;

interface BoxMm {
	readonly min: Vec3;
	readonly max: Vec3;
}

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function collisionBox(name: string): BoxMm {
	const doc = loadDoc() as { nodes: Array<{ name: string; bboxMm: BoxMm }> };
	const node = doc.nodes.find((n) => n.name === name);
	expect(node, `${name} missing from the collision document`).toBeDefined();
	return node!.bboxMm;
}

async function withLoadedScene(body: (scene: Scene, playfieldRoot: TransformNode) => void | Promise<void>, glbBytes: Buffer = readFileSync(GLB_PATH)): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(glbBytes), { pluginExtension: '.glb' });
		try {
			await body(scene, playfieldNodes.playfieldRoot);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

/** A mesh-local scene point, carried through the mesh's own transform into playfield_root's local frame, in table mm. */
function localToTableMm(mesh: AbstractMesh, playfieldRoot: TransformNode, local: Vector3): Vec3 {
	const world = Vector3.TransformCoordinates(local, mesh.computeWorldMatrix(true));
	const rootInverse = Matrix.Invert(playfieldRoot.computeWorldMatrix(true));
	const rootLocal = Vector3.TransformCoordinates(world, rootInverse);
	return glbToTable({ x: rootLocal.x, y: rootLocal.y, z: rootLocal.z });
}

/** The mesh's eight local bbox corners in playfield_root's local frame, table mm. */
function tableBox(mesh: AbstractMesh, playfieldRoot: TransformNode): BoxMm {
	const points = mesh.getBoundingInfo().boundingBox.vectors.map((corner) => localToTableMm(mesh, playfieldRoot, corner));
	return {
		min: { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)), z: Math.min(...points.map((p) => p.z)) },
		max: { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)), z: Math.max(...points.map((p) => p.z)) },
	};
}

/** The mesh's bbox WITH its descendants (an art part's `<parent>_<part>` children), in playfield_root's local frame, table mm. */
function hierarchyTableBox(root: AbstractMesh, playfieldRoot: TransformNode): BoxMm {
	const boxes = [root, ...root.getChildMeshes(false)].map((m) => tableBox(m, playfieldRoot));
	return {
		min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) },
		max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) },
	};
}

/** The glb with one node renamed in its JSON chunk -- test/boot-mechanisms-wiring.test.ts's own helper. */
function renameGlbNode(bytes: Buffer, oldName: string, newName: string): Buffer {
	const jsonLength = bytes.readUInt32LE(12);
	const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as { nodes: Array<{ name?: string }> };
	const node = json.nodes.find((n) => n.name === oldName);
	if (!node) {
		throw new Error(`renameGlbNode(): node "${oldName}" not found in the committed glb`);
	}
	node.name = newName;
	const raw = Buffer.from(JSON.stringify(json), 'utf8');
	const paddedJson = raw.length % 4 === 0 ? raw : Buffer.concat([raw, Buffer.alloc(4 - (raw.length % 4), 0x20)]);
	const binChunkAndHeader = bytes.subarray(20 + jsonLength);
	const jsonChunkHeader = Buffer.alloc(8);
	jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
	jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);
	const header = Buffer.alloc(12);
	header.writeUInt32LE(0x46546c67, 0);
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(12 + 8 + paddedJson.length + binChunkAndHeader.length, 8);
	return Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkAndHeader]);
}

function mesh(scene: Scene, name: string): AbstractMesh {
	return getRequiredNode(scene, name) as AbstractMesh;
}

function expectBoxClose(actual: BoxMm, expected: BoxMm, tolerance: number, label: string, axes: ReadonlyArray<'x' | 'y' | 'z'> = ['x', 'y', 'z']): void {
	for (const axis of axes) {
		expect(Math.abs(actual.min[axis] - expected.min[axis]), `${label}: min.${axis} ${actual.min[axis].toFixed(3)} vs ${expected.min[axis].toFixed(3)}`).toBeLessThanOrEqual(tolerance);
		expect(Math.abs(actual.max[axis] - expected.max[axis]), `${label}: max.${axis} ${actual.max[axis].toFixed(3)} vs ${expected.max[axis].toFixed(3)}`).toBeLessThanOrEqual(tolerance);
	}
}

/** Advances a real loop in <= 100 ms chunks (the loop's own 200 ms owed-time cap) until `ticks` more have run. */
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

/** `test/drop-targets.test.ts`'s own harness: boot, serve, then drive the ball straight up column D. */
function bootMachine(): { machine: Machine; tick: number } {
	const machine = createMachine(loadDoc(), resolveTuning());
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	return { machine, tick };
}

function strikeD(machine: Machine, startTick: number): number {
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error('strikeD(): no served ball to reposition');
	}
	// The same measured release and speed test/drop-targets.test.ts uses for D.
	const start = toPhysics({ x: 227.4, y: 520, z: 13.5 });
	ball.state.pos.set(start.x, start.y, start.z);
	ball.hit.vel.set(0, -1600 / (MM_PER_VU * 100), 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);
	let tick = startTick;
	for (let i = 0; i < 2000; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, []);
	}
	return tick;
}

function snapshotFromMachine(machine: Machine): Snapshot {
	const base = buildSnapshot();
	return buildSnapshot({ mechanisms: { ...base.mechanisms, ...machine.mechanisms } });
}

const DROP_WIRING = Object.values(TABLE.dropBankWiring);

describe('Story 5.0a AC 2 -- syncMechanisms() poses the moving twins from real snapshots (NullEngine + committed glb)', () => {
	it('Flipper at rest: the loader\'s tip, through each twin\'s local transform, lands within 0.5 mm of fromPhysics(pivot + R (sin theta, -cos theta)), below the pivot', async () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const snapshot = advanceTicks(loop, 200);
		const loaded = loadCollision(loadDoc());
		await withLoadedScene((scene, playfieldRoot) => {
			// Three syncs of the SAME snapshot, as the render hook does on
			// consecutive frames: the pose is rebuilt from the authored pose
			// each call (AD-4), never accumulated onto the previous frame's.
			syncMechanisms(scene, playfieldRoot, snapshot);
			syncMechanisms(scene, playfieldRoot, snapshot);
			syncMechanisms(scene, playfieldRoot, snapshot);
			for (const [side, colName] of [['l', TABLE.nodes.colFlipperL], ['r', TABLE.nodes.colFlipperR]] as const) {
				const flipper = loaded.flippers.find((f) => f.side === side)!;
				const angleDeg = snapshot.mechanisms.flippers[side].angleDeg;
				const pivotPhys = toPhysics(flipper.pivotMm);
				const tipPhys = toPhysics(flipper.tipMm);
				const radius = Math.hypot(tipPhys.x - pivotPhys.x, tipPhys.y - pivotPhys.y);
				const theta = (angleDeg * Math.PI) / 180;
				const expected = fromPhysics({ x: pivotPhys.x + radius * Math.sin(theta), y: pivotPhys.y - radius * Math.cos(theta), z: pivotPhys.z });

				const twin = mesh(scene, visTwinName(colName));
				// The twin's local frame has its origin at the pivot: the tip's
				// local position is the table-frame offset, lifted by toScene().
				const offset = toScene({ x: flipper.tipMm.x - flipper.pivotMm.x, y: flipper.tipMm.y - flipper.pivotMm.y, z: flipper.tipMm.z - flipper.pivotMm.z });
				const actual = localToTableMm(twin, playfieldRoot, new Vector3(offset.x, offset.y, offset.z));
				const label = `${twin.name} at angleDeg ${angleDeg.toFixed(3)}`;
				expect(Math.hypot(actual.x - expected.x, actual.y - expected.y), `${label}: tip (${actual.x.toFixed(3)}, ${actual.y.toFixed(3)}) vs expected (${expected.x.toFixed(3)}, ${expected.y.toFixed(3)})`).toBeLessThanOrEqual(TIP_TOLERANCE_MM);
				expect(actual.y, `${label}: a resting bat droops toward the player -- tip y below pivot y ${flipper.pivotMm.y}`).toBeLessThan(flipper.pivotMm.y);
				// Non-vacuity: the rest pose is genuinely rotated away from the
				// authored (end-of-stroke) box, whose tip is at pivot y.
				expect(flipper.pivotMm.y - actual.y, `${label}: the rest droop must be real, not a hairline`).toBeGreaterThan(5);
			}
		});
	});

	it('Flipper held (DW-279): with flipper_l held until angleDeg settles, vis_flipper_l\'s hierarchy bbox (bat + rubber, Story 5.4) matches the col_flipper_l box within 0.5 mm', async () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const start = advanceTicks(loop, 50);
		let snapshot = advanceTicks(loop, 100, [{ tick: start.tick + 1, frame: { ...NO_FRAME, flipper_l: true } }]);
		let previous = Number.NaN;
		for (let i = 0; i < 20 && snapshot.mechanisms.flippers.l.angleDeg !== previous; i++) {
			previous = snapshot.mechanisms.flippers.l.angleDeg;
			snapshot = advanceTicks(loop, 50);
		}
		expect(snapshot.mechanisms.flippers.l.angleDeg, 'the held bat must have settled').toBe(previous);
		await withLoadedScene((scene, playfieldRoot) => {
			// The real frame-to-frame transition: at rest first, then held
			// (twice, as consecutive render frames would).
			syncMechanisms(scene, playfieldRoot, start);
			syncMechanisms(scene, playfieldRoot, snapshot);
			syncMechanisms(scene, playfieldRoot, snapshot);
			const bat = mesh(scene, visTwinName(TABLE.nodes.colFlipperL));
			expect(bat.getChildMeshes(false).length, 'non-vacuity: the art bat carries its rubber child').toBeGreaterThan(0);
			expectBoxClose(hierarchyTableBox(bat, playfieldRoot), collisionBox(TABLE.nodes.colFlipperL), BOX_TOLERANCE_MM, 'vis_flipper_l held');
		});
	});

	it('Target struck: a real strike drops vis_dragon_d to/below table z 0 and hides it; the other five stay up and visible; Bank reset: all six back at the authored pose, visible', async () => {
		const { machine, tick: bootTick } = bootMachine();
		const struckTick = strikeD(machine, bootTick);
		const struck = snapshotFromMachine(machine);
		const dWiring = TABLE.dropBankWiring.d;
		expect(struck.mechanisms.dropTargets[dWiring.switch], 'the real strike must report s_dragon_d down').toBe(true);

		await withLoadedScene((scene, playfieldRoot) => {
			const authored = new Map(DROP_WIRING.map((w) => [w.node, tableBox(mesh(scene, visTwinName(w.node)), playfieldRoot)]));

			syncMechanisms(scene, playfieldRoot, struck);
			syncMechanisms(scene, playfieldRoot, struck); // a second frame must not sink the target further
			for (const wiring of DROP_WIRING) {
				const twin = mesh(scene, visTwinName(wiring.node));
				const box = tableBox(twin, playfieldRoot);
				if (wiring === dWiring) {
					expect(box.max.z, `${twin.name}: a down target's top must be at or below table z 0 (${box.max.z.toFixed(3)})`).toBeLessThanOrEqual(POSE_TOLERANCE_MM);
					// Translated down exactly its own height, once: its top lands on
					// its authored floor, not a second height lower.
					const authoredBox = authored.get(wiring.node)!;
					expect(Math.abs(box.max.z - authoredBox.min.z), `${twin.name}: dropped by exactly its own height (top ${box.max.z.toFixed(3)} vs authored floor ${authoredBox.min.z.toFixed(3)})`).toBeLessThanOrEqual(POSE_TOLERANCE_MM);
					expect(twin.isVisible, `${twin.name}: a down target is not rendered`).toBe(false);
				} else {
					expectBoxClose(box, authored.get(wiring.node)!, POSE_TOLERANCE_MM, `${twin.name} (still up)`);
					expect(twin.isVisible, `${twin.name}: an up target stays visible`).toBe(true);
				}
			}

			// Bank reset through the real coil.
			let tick = struckTick + 1;
			machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_dragon_bank_reset', action: 'pulse', tick }]);
			for (let i = 0; i < 50; i++) {
				tick += 1;
				machine.step(tick, NO_FRAME, []);
			}
			const reset = snapshotFromMachine(machine);
			for (const wiring of DROP_WIRING) {
				expect(reset.mechanisms.dropTargets[wiring.switch], `${wiring.switch} after the bank reset`).toBe(false);
			}
			syncMechanisms(scene, playfieldRoot, reset);
			for (const wiring of DROP_WIRING) {
				const twin = mesh(scene, visTwinName(wiring.node));
				expectBoxClose(tableBox(twin, playfieldRoot), authored.get(wiring.node)!, POSE_TOLERANCE_MM, `${twin.name} after the reset`);
				expect(twin.isVisible, `${twin.name}: visible after the reset`).toBe(true);
			}
			// The authored pose IS the collision body's footprint.
			expectBoxClose(authored.get(dWiring.node)!, collisionBox(dWiring.node), POSE_TOLERANCE_MM, 'vis_dragon_d authored', ['x', 'y']);
		});
	});

	it('Plunger: posMm 0 leaves vis_plunger at its authored pose; posMm 40 (synthetic) translates it 40 mm toward table -Y', async () => {
		await withLoadedScene((scene, playfieldRoot) => {
			const plunger = mesh(scene, VIS_PLUNGER_NODE_NAME);
			const authored = hierarchyTableBox(plunger, playfieldRoot);
			const base = buildSnapshot();

			syncMechanisms(scene, playfieldRoot, buildSnapshot({ mechanisms: { ...base.mechanisms, plunger: { posMm: 0, holdTicks: 0 } } }));
			expectBoxClose(hierarchyTableBox(plunger, playfieldRoot), authored, POSE_TOLERANCE_MM, 'vis_plunger at posMm 0');

			const pulledSnapshot = buildSnapshot({ mechanisms: { ...base.mechanisms, plunger: { posMm: 40, holdTicks: 0 } } });
			syncMechanisms(scene, playfieldRoot, pulledSnapshot);
			syncMechanisms(scene, playfieldRoot, pulledSnapshot); // a second frame at 40 stays at 40, never 80
			const pulled = hierarchyTableBox(plunger, playfieldRoot);
			const expected: BoxMm = {
				min: { ...authored.min, y: authored.min.y - 40 },
				max: { ...authored.max, y: authored.max.y - 40 },
			};
			expectBoxClose(pulled, expected, POSE_TOLERANCE_MM, 'vis_plunger at posMm 40');
		});
	});

	it('Missing twin: with vis_flipper_l disposed before the first sync, syncMechanisms throws naming the node', async () => {
		await withLoadedScene((scene, playfieldRoot) => {
			mesh(scene, visTwinName(TABLE.nodes.colFlipperL)).dispose();
			expect(() => syncMechanisms(scene, playfieldRoot, buildSnapshot())).toThrow(/vis_flipper_l/);
		});
	});

	it('nodeScreenRect(vis_dragon) is a finite, non-degenerate rect inside the canvas', async () => {
		await withLoadedScene((scene) => {
			const rect = nodeScreenRect(scene, VIS_DRAGON_NODE_NAME);
			const width = scene.getEngine().getRenderWidth();
			const height = scene.getEngine().getRenderHeight();
			for (const value of [rect.x0, rect.y0, rect.x1, rect.y1]) {
				expect(Number.isFinite(value), `rect ${JSON.stringify(rect)} must be finite`).toBe(true);
			}
			expect(rect.x0).toBeGreaterThanOrEqual(0);
			expect(rect.y0).toBeGreaterThanOrEqual(0);
			expect(rect.x1).toBeLessThanOrEqual(width);
			expect(rect.y1).toBeLessThanOrEqual(height);
			expect(rect.x1 - rect.x0, 'non-degenerate width').toBeGreaterThan(1);
			expect(rect.y1 - rect.y0, 'non-degenerate height').toBeGreaterThan(1);
			// Orientation (origin top-left, x rightward): the flippers sit nearer
			// the player than the Dragon, so they land LOWER on the canvas (larger
			// pixel y); the left flipper lands left of the right one.
			const flipperL = nodeScreenRect(scene, visTwinName(TABLE.nodes.colFlipperL));
			const flipperR = nodeScreenRect(scene, visTwinName(TABLE.nodes.colFlipperR));
			expect(flipperL.y0, `vis_flipper_l ${JSON.stringify(flipperL)} must sit below vis_dragon ${JSON.stringify(rect)} on screen`).toBeGreaterThan(rect.y1);
			expect(flipperR.y0, `vis_flipper_r ${JSON.stringify(flipperR)} must sit below vis_dragon ${JSON.stringify(rect)} on screen`).toBeGreaterThan(rect.y1);
			expect((flipperL.x0 + flipperL.x1) / 2, 'vis_flipper_l centre must be left of vis_flipper_r centre').toBeLessThan((flipperR.x0 + flipperR.x1) / 2);
			expect(() => nodeScreenRect(scene, 'vis_no_such_node')).toThrow(/vis_no_such_node/);
		});
	});
});

// ---------------------------------------------------------------------------
// Story 5.4 (DW-249, DW-292) -- the plunger's real pull and the spinner.
// ---------------------------------------------------------------------------

const SPINNER_KEY = Object.keys(TABLE.spinnerWiring)[0]!;

/** A synthetic snapshot at `tick` with the spinner at `speed` deg/s. */
function spinnerSnapshot(tick: number, speed: number): Snapshot {
	const base = buildSnapshot();
	return buildSnapshot({ tick, mechanisms: { ...base.mechanisms, spinner: { [SPINNER_KEY]: { speed } } } });
}

/** The blade's hang direction (its own bbox centre from its origin on the axis), table frame, y/z only. */
function bladeHang(scene: Scene, playfieldRoot: TransformNode): { y: number; z: number } {
	const blade = mesh(scene, VIS_SPINNER_BLADE_NODE_NAME);
	const box = blade.getBoundingInfo().boundingBox;
	const origin = localToTableMm(blade, playfieldRoot, Vector3.Zero());
	const centre = localToTableMm(blade, playfieldRoot, box.minimum.add(box.maximum).scale(0.5));
	return { y: centre.y - origin.y, z: centre.z - origin.z };
}

/** Signed angle, degrees, from `rest` to `now` about table +X (right-handed: +90 swings a downward hang toward +Y). */
function angleAboutXDeg(rest: { y: number; z: number }, now: { y: number; z: number }): number {
	return (Math.atan2(rest.y * now.z - rest.z * now.y, rest.y * now.y + rest.z * now.z) * 180) / Math.PI;
}

describe('Story 5.4 AC 1 -- the plunger\'s real pull and the spinner, through syncMechanisms() on the committed glb', () => {
	it('Plunger held (DW-292): a real createLoop hold of 250 then 600 ticks gives posMm 19.05 then 38.1, and vis_plunger sits exactly that far toward table -Y; Plunger released: posMm 0 and the authored pose', async () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		const start = advanceTicks(loop, 50);
		const held250 = advanceTicks(loop, 250, [{ tick: start.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		expect(held250.mechanisms.plunger.holdTicks).toBe(250);
		expect(held250.mechanisms.plunger.posMm, '38.1 x 250/500').toBeCloseTo(19.05, 6);
		const held600 = advanceTicks(loop, 350);
		expect(held600.mechanisms.plunger.holdTicks).toBe(600);
		expect(held600.mechanisms.plunger.posMm, 'clamped at the full stroke').toBeCloseTo(38.1, 6);
		const released = advanceTicks(loop, 1, [{ tick: held600.tick + 1, frame: NO_FRAME }]);
		expect(released.mechanisms.plunger.posMm, 'posMm on the release tick').toBe(0);

		await withLoadedScene((scene, playfieldRoot) => {
			const plunger = mesh(scene, VIS_PLUNGER_NODE_NAME);
			expect(plunger.getChildMeshes(false).length, 'non-vacuity: the rod carries its knob child').toBeGreaterThan(0);
			const authored = hierarchyTableBox(plunger, playfieldRoot);
			for (const [label, snapshot, pullMm] of [['held 250', held250, 19.05], ['held 600', held600, 38.1]] as const) {
				syncMechanisms(scene, playfieldRoot, snapshot);
				const expected: BoxMm = { min: { ...authored.min, y: authored.min.y - pullMm }, max: { ...authored.max, y: authored.max.y - pullMm } };
				expectBoxClose(hierarchyTableBox(plunger, playfieldRoot), expected, POSE_TOLERANCE_MM, `vis_plunger ${label}`);
			}
			syncMechanisms(scene, playfieldRoot, released);
			expectBoxClose(hierarchyTableBox(plunger, playfieldRoot), authored, POSE_TOLERANCE_MM, 'vis_plunger released');
		});
	});

	it('Spinner spins: tick 1000 then 1500 at 360 deg/s turns the blade 180 +/- 0.5 deg about table +X from rest; Spinner idle frame: re-syncing the same snapshot leaves it there', async () => {
		await withLoadedScene((scene, playfieldRoot) => {
			const rest = bladeHang(scene, playfieldRoot);
			expect(rest.z, 'at rest the blade hangs toward table -Z').toBeLessThan(0);
			expect(Math.abs(rest.y), 'and straight down').toBeLessThanOrEqual(0.01);

			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(1000, 360));
			expect(Math.abs(angleAboutXDeg(rest, bladeHang(scene, playfieldRoot))), 'the first sync has no elapsed ticks to advance').toBeLessThanOrEqual(0.5);

			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(1500, 360));
			const turned = angleAboutXDeg(rest, bladeHang(scene, playfieldRoot));
			expect(Math.abs(Math.abs(turned) - 180), `blade at ${turned.toFixed(3)} deg after 500 ticks at 360 deg/s`).toBeLessThanOrEqual(0.5);

			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(1500, 360));
			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(1500, 360));
			const idle = angleAboutXDeg(rest, bladeHang(scene, playfieldRoot));
			expect(Math.abs(Math.abs(idle) - 180), `an idle frame (same tick) must not move the blade -- ${idle.toFixed(3)} deg`).toBeLessThanOrEqual(0.5);

			// [Story 5.4 review] A rewound tick (a restarted loop in the same
			// scene) advances nothing either -- the documented `tick >
			// lastTick` guard -- and the next forward tick advances from it.
			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(1000, 360));
			const rewound = angleAboutXDeg(rest, bladeHang(scene, playfieldRoot));
			expect(Math.abs(Math.abs(rewound) - 180), `a rewound tick must not move the blade -- ${rewound.toFixed(3)} deg`).toBeLessThanOrEqual(0.5);
			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(1250, 360));
			const onward = angleAboutXDeg(rest, bladeHang(scene, playfieldRoot));
			expect(Math.abs(onward - -90) <= 0.5 || Math.abs(onward - 270) <= 0.5, `250 ticks on from the rewind: 180 + 90 = 270 deg (-90) -- got ${onward.toFixed(3)}`).toBe(true);
		});
	});

	it('the turn is positive about table +X (a quarter turn swings the hanging blade toward table +Y); Spinner stops: speed 0 is the rest pose', async () => {
		await withLoadedScene((scene, playfieldRoot) => {
			const rest = bladeHang(scene, playfieldRoot);
			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(0, 360));
			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(250, 360));
			const quarter = bladeHang(scene, playfieldRoot);
			expect(angleAboutXDeg(rest, quarter), 'a +90 deg turn about +X').toBeCloseTo(90, 1);
			expect(quarter.y, 'the blade now points up-table (+Y)').toBeGreaterThan(0);

			syncMechanisms(scene, playfieldRoot, spinnerSnapshot(300, 0));
			expect(Math.abs(angleAboutXDeg(rest, bladeHang(scene, playfieldRoot))), 'speed 0 shows the rest pose').toBeLessThanOrEqual(0.01);
		});
	});

	it('Real spinner: test/spinner.test.ts\'s createLoop crossing reports speed > 0, and the synced blade leaves rest', async () => {
		const doc = JSON.parse(JSON.stringify(loadDoc())) as { devices: Array<{ name: string; ejectPose: { posMm: Vec3; dir: Vec3 } }> };
		// test/spinner.test.ts's own release under sw_spinner and its measured crossing speed.
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: { x: 30, y: 500, z: 13.5 }, dir: { x: 0, y: 1, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: 1800 } });
		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.pulseCoil('c_trough_eject');
		loop.advance(0, []);
		const frames: Snapshot[] = [];
		for (let i = 0; i < 60; i++) {
			frames.push(loop.advance(50, []).snapshot);
		}
		const spinning = frames.findIndex((f) => (f.mechanisms.spinner[SPINNER_KEY]?.speed ?? 0) > 0);
		expect(spinning, 'the real crossing must spin the spinner').toBeGreaterThanOrEqual(0);
		expect(spinning, 'a following frame exists to sync against').toBeLessThan(frames.length - 1);
		const first = frames[spinning]!;
		const next = frames[spinning + 1]!;
		expect(next.mechanisms.spinner[SPINNER_KEY]!.speed, 'still spinning a frame later').toBeGreaterThan(0);
		await withLoadedScene((scene, playfieldRoot) => {
			const rest = bladeHang(scene, playfieldRoot);
			syncMechanisms(scene, playfieldRoot, first);
			syncMechanisms(scene, playfieldRoot, next);
			const angle = angleAboutXDeg(rest, bladeHang(scene, playfieldRoot));
			expect(Math.abs(angle), `the blade must have left rest (at ${angle.toFixed(3)} deg after ${next.tick - first.tick} ticks)`).toBeGreaterThan(1);
		});
	});

	it('Missing blade: with vis_spinner_l_blade renamed out of the glb, the first sync throws naming it', async () => {
		const broken = renameGlbNode(readFileSync(GLB_PATH), VIS_SPINNER_BLADE_NODE_NAME, 'vis_spinner_l_gone');
		await withLoadedScene((scene, playfieldRoot) => {
			expect(() => syncMechanisms(scene, playfieldRoot, buildSnapshot())).toThrow(/vis_spinner_l_blade/);
		}, broken);
	});
});
