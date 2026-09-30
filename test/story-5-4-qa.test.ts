// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.4 QA (DW-249, DW-292) -- the gaps the implement stage's own pins
// left open, each one a real-runtime claim:
//
//   AC 4, golden clause (DW-292). `test/replay-goldens.test.ts` already
//   replays every golden to its recorded hashes. What it cannot show on its
//   own is that the replays EXERCISE the new pull: a golden that never held
//   the plunger would stay green whatever `plunger.ts` did with posMm. The
//   full-plunge golden holds it from tick 21 to 542 (521 ticks, past the
//   500-tick window). Replayed here with `runReplay()`'s own `onTick` hook,
//   posMm must sweep from 0 through the interior to the full 38.1 mm stroke
//   and back to 0 on release -- AND the run must still land on the golden's
//   recorded `expectedHash` / `expectedGameStateHash`. So a posMm that leaked
//   into any hashed state (the ball's launch, the GameState) goes red here.
//
//   AC 1, "Real spinner", with its witness (AC 7's clause the lead's
//   browser run could not see: the blade moving after a real Left Loop
//   crossing). The same `test/spinner.test.ts` release under sw_spinner,
//   stepped ONE tick at a time so the ball's own position is observed inside
//   the sw_spinner zone before the spinner reports any speed (the speed comes
//   from a real crossing, not from anything the test arranged), then synced
//   through `syncMechanisms()` on the committed glb at a ~60 Hz frame
//   cadence: the blade's pose must animate -- several distinct angles across
//   the spinning frames -- not merely leave rest once.
//
// Falsifiability (Rule 19, recorded in the spec's Verification): returning
// `posMm: 0` from plunger.ts reddens the stroke-sweep case; scaling the
// launch speed by posMm in plunger.ts reddens its hash assertions; writing
// the blade's authored rotation instead of the turned one in
// sync-mechanisms.ts reddens the spinner case.

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
import { VIS_SPINNER_BLADE_NODE_NAME } from '../src/presentation/scene/vis-names';
import { createLoop } from '../src/sim/loop';
import { runReplay, type CoilPrologueEntry } from '../src/sim/loop/replay';
import { SHOOTER_ROD_STROKE_MM } from '../src/sim/physics/plunger';
import { resolveTuning, TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { glbToTable, type Vec3 } from '../src/sim/table/frames';
import type { InputTransition } from '../src/sim/contracts/input';
import type { ReplayHeader, Snapshot } from '../src/sim/table/names';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const FULL_PLUNGE_PATH = path.resolve(__dirname, 'replays', 'full-plunge.golden.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// AC 4 -- the goldens replay unchanged WHILE the pull is really published.
// ---------------------------------------------------------------------------

interface GoldenFile {
	readonly header: ReplayHeader;
	readonly transitions: readonly InputTransition[];
	readonly durationTicks: number;
	readonly coilPrologue?: readonly CoilPrologueEntry[];
	readonly expectedHash: string;
	readonly expectedGameStateHash: string;
}

describe('Story 5.4 QA, AC 4 (DW-292) -- the full-plunge golden publishes the real pull and still replays to its recorded hashes', () => {
	it('posMm sweeps 0 -> interior -> 38.1 mm -> 0 across the golden\'s own hold, and finalHash / finalGameStateHash are the recorded ones', () => {
		const golden = JSON.parse(readFileSync(FULL_PLUNGE_PATH, 'utf8')) as GoldenFile;
		// Non-vacuity: this golden really holds the plunger, past the window.
		const press = golden.transitions.find((t) => t.frame.plunger);
		const release = golden.transitions.find((t) => press !== undefined && t.tick > press.tick && !t.frame.plunger);
		expect(press, 'full-plunge must press the plunger').toBeDefined();
		expect(release, 'full-plunge must release the plunger').toBeDefined();
		const maxHoldTicks = resolveTuning().plungerMaxHoldTicks.value;
		expect(release!.tick - press!.tick, 'the hold runs past the window, so the full stroke is reached').toBeGreaterThan(maxHoldTicks);

		const posByTick = new Map<number, number>();
		const result = runReplay({
			replay: { header: golden.header, transitions: golden.transitions },
			collisionDoc: loadDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
			onTick: (tick, snapshot) => posByTick.set(tick, snapshot.mechanisms.plunger.posMm),
		});

		const values = [...posByTick.values()];
		expect(Math.max(...values), 'the full stroke is published during the hold').toBeCloseTo(SHOOTER_ROD_STROKE_MM, 9);
		expect(values.filter((v) => v > 0 && v < SHOOTER_ROD_STROKE_MM - 1e-9).length, 'the interior of the stroke is published too (the pull grows with the hold)').toBeGreaterThan(100);
		expect(posByTick.get(press!.tick - 1), 'at rest before the press').toBe(0);
		expect(posByTick.get(release!.tick), 'back at rest on the release tick').toBe(0);
		expect(posByTick.get(golden.durationTicks), 'at rest at the end of the run').toBe(0);

		// The golden clause itself: the pull above is display-only -- it moved
		// nothing hashed.
		expect(result.finalHash, 'full-plunge finalHash').toBe(golden.expectedHash);
		expect(result.finalGameStateHash, 'full-plunge finalGameStateHash').toBe(golden.expectedGameStateHash);
	});
});

// ---------------------------------------------------------------------------
// AC 1 "Real spinner" with its crossing witness -- the blade animates.
// ---------------------------------------------------------------------------

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

async function withLoadedScene(body: (scene: Scene, playfieldRoot: TransformNode) => void): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(readFileSync(GLB_PATH)), { pluginExtension: '.glb' });
		try {
			body(scene, playfieldNodes.playfieldRoot);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

function localToTableMm(mesh: AbstractMesh, playfieldRoot: TransformNode, local: Vector3): Vec3 {
	const world = Vector3.TransformCoordinates(local, mesh.computeWorldMatrix(true));
	const rootLocal = Vector3.TransformCoordinates(world, Matrix.Invert(playfieldRoot.computeWorldMatrix(true)));
	return glbToTable({ x: rootLocal.x, y: rootLocal.y, z: rootLocal.z });
}

/** The blade's hang direction (its own bbox centre from its origin on the axis), table y/z. */
function bladeHang(scene: Scene, playfieldRoot: TransformNode): { y: number; z: number } {
	const blade = getRequiredNode(scene, VIS_SPINNER_BLADE_NODE_NAME) as AbstractMesh;
	const box = blade.getBoundingInfo().boundingBox;
	const origin = localToTableMm(blade, playfieldRoot, Vector3.Zero());
	const centre = localToTableMm(blade, playfieldRoot, box.minimum.add(box.maximum).scale(0.5));
	return { y: centre.y - origin.y, z: centre.z - origin.z };
}

/** Signed angle from `rest` to `now` about table +X, degrees, in (-180, 180]. */
function angleAboutXDeg(rest: { y: number; z: number }, now: { y: number; z: number }): number {
	return (Math.atan2(rest.y * now.z - rest.z * now.y, rest.y * now.y + rest.z * now.z) * 180) / Math.PI;
}

describe('Story 5.4 QA, AC 1 "Real spinner" / AC 7\'s unwitnessed clause -- a real ball crosses sw_spinner, and the synced blade animates frame over frame', () => {
	it('the ball is seen inside the sw_spinner zone no later than the first spinning tick, and the blade then takes several distinct poses across ~60 Hz frames', async () => {
		const spinnerKey = Object.keys(TABLE.spinnerWiring)[0]!;
		const raw = loadDoc() as { devices: Array<{ name: string; ejectPose: { posMm: Vec3; dir: Vec3 } }>; switchZones: Array<{ switch: string; minMm: Vec3; maxMm: Vec3 }> };
		const zone = raw.switchZones.find((z) => z.switch === spinnerKey);
		expect(zone, `the ${spinnerKey} switch zone`).toBeDefined();
		// test/spinner.test.ts's own release under sw_spinner (x 30, y 500, heading +Y) and its measured crossing speed.
		const doc = JSON.parse(JSON.stringify(raw)) as typeof raw;
		doc.devices.find((d) => d.name === 'bd_trough')!.ejectPose = { posMm: { x: 30, y: 500, z: 13.5 }, dir: { x: 0, y: 1, z: 0 } };
		const tuning = resolveTuning({ ...TUNING, troughEjectSpeedMmPerS: { ...TUNING.troughEjectSpeedMmPerS, value: 1800 } });
		const loop = createLoop({ collisionDoc: doc, tuning });
		loop.pulseCoil('c_trough_eject');
		loop.advance(0, []);

		const snapshots: Snapshot[] = [];
		for (let i = 0; i < 3000; i++) {
			snapshots.push(loop.advance(1, []).snapshot);
		}
		const inZone = (s: Snapshot): boolean =>
			s.balls.some((b) => b.pos.x >= zone!.minMm.x && b.pos.x <= zone!.maxMm.x && b.pos.y >= zone!.minMm.y && b.pos.y <= zone!.maxMm.y);
		const speedOf = (s: Snapshot): number => s.mechanisms.spinner[spinnerKey]?.speed ?? 0;
		const firstInZone = snapshots.findIndex(inZone);
		const firstSpinning = snapshots.findIndex((s) => speedOf(s) > 0);
		expect(firstInZone, 'witness: a real ball enters the sw_spinner zone').toBeGreaterThanOrEqual(0);
		expect(firstSpinning, 'the real crossing spins the spinner').toBeGreaterThanOrEqual(0);
		expect(snapshots.slice(0, firstInZone).every((s) => speedOf(s) === 0), 'no speed before the ball reaches the zone').toBe(true);
		expect(firstSpinning, 'the speed follows the ball into the zone (never before it)').toBeGreaterThanOrEqual(firstInZone);

		// ~60 Hz display frames (every 16th tick) from the first spinning tick, while the speed lasts.
		const frames: Snapshot[] = [];
		for (let k = firstSpinning; k < snapshots.length && speedOf(snapshots[k]!) > 0 && frames.length < 20; k += 16) {
			frames.push(snapshots[k]!);
		}
		expect(frames.length, 'non-vacuity: the spinner keeps spinning for several frames').toBeGreaterThanOrEqual(4);

		await withLoadedScene((scene, playfieldRoot) => {
			const rest = bladeHang(scene, playfieldRoot);
			const angles = frames.map((frame) => {
				syncMechanisms(scene, playfieldRoot, frame);
				return angleAboutXDeg(rest, bladeHang(scene, playfieldRoot));
			});
			const distinct = new Set(angles.map((a) => a.toFixed(1)));
			expect(distinct.size, `the blade must animate across the spinning frames, not sit in one pose -- angles ${angles.map((a) => a.toFixed(1)).join(', ')}`).toBeGreaterThanOrEqual(3);
			expect(angles.slice(1).some((a) => Math.abs(a) > 1), 'and it leaves rest').toBe(true);
		});
	});
});
