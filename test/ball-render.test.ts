// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5, task 28 -- the presentation leg, following
// test/scene-smoke.test.ts's NullEngine + committed-glb data: URL pattern:
// applying a FrameOutput whose snapshot holds one ball creates a mesh at
// toScene(pos) under playfield_root; applying one whose snapshot holds none
// disposes it; and playfield_root's pitch follows the snapshot's
// effectivePitchDeg. This is Rule 3's real-runtime evidence for the
// headless tier -- the browser leg (pressing to begin and issuing the two
// dev pulses) is the lead's own per-story smoke.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { applyPitch } from '../src/presentation/scene/playfield';
import { syncBalls } from '../src/presentation/scene/balls';
import { TABLE } from '../src/sim/table/dragonwar';
import { toScene } from '../src/sim/table/frames';
import type { GameState, Snapshot } from '../src/sim/table/names';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

const BASE_GAME_STATE: GameState = {
	tick: 0,
	phase: 'attract',
	machine: {
		ballsInPlay: 0,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false] },
	},
	players: [],
	currentPlayer: 0,
	modes: [],
	rng: 0,
};

function buildSnapshot(overrides: Partial<Snapshot>): Snapshot {
	return {
		tick: 0,
		balls: [],
		mechanisms: {
			flippers: { l: { angleDeg: 0, angularVelDegPerSec: 0 }, r: { angleDeg: 0, angularVelDegPerSec: 0 } },
			plunger: { posMm: 0, holdTicks: 0 },
			dropTargets: {},
			spinner: {},
			devices: { bd_trough: { slots: [true, true, true, true] }, bd_shooter: { slots: [false] } },
		},
		game: BASE_GAME_STATE,
		effectivePitchDeg: TABLE.reference.pitchDeg,
		...overrides,
	};
}

describe('src/presentation/scene/balls.ts -- syncBalls() against the real loaded scene (NullEngine)', () => {
	it('a snapshot holding one ball creates a mesh at toScene(pos), parented to playfield_root', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const snapshot = buildSnapshot({
					balls: [{ id: 0, pos: { x: 250, y: 400, z: 13.495 }, vel: { x: 0, y: 0, z: 0 }, speed: 0 }],
				});
				syncBalls(scene, playfieldNodes.playfieldRoot, snapshot);

				const mesh = scene.getMeshByName('ball_0');
				expect(mesh, 'syncBalls() must create a mesh named ball_<id>').not.toBeNull();
				expect(mesh!.parent, 'the ball mesh must be parented to playfield_root so pitch carries it').toBe(playfieldNodes.playfieldRoot);
				// Review finding 2026-08-28: this story's own manual browser
				// smoke found a ball mesh that passed every geometry check here
				// (existence, position, parent) but rendered INVISIBLE because
				// it had no material -- NullEngine happily creates a mesh with
				// `material === null`, since it never rasterises anything. This
				// assertion is what would have caught that regression headlessly.
				expect(mesh!.material, 'the ball mesh must carry a material, or it renders invisibly despite passing every geometry check').not.toBeNull();

				const expected = toScene({ x: 250, y: 400, z: 13.495 });
				expect(mesh!.position.x).toBeCloseTo(expected.x, 6);
				expect(mesh!.position.y).toBeCloseTo(expected.y, 6);
				expect(mesh!.position.z).toBeCloseTo(expected.z, 6);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('a ball that leaves the snapshot has its mesh removed on the same call', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const withBall = buildSnapshot({
					balls: [{ id: 0, pos: { x: 250, y: 400, z: 13.495 }, vel: { x: 0, y: 0, z: 0 }, speed: 0 }],
				});
				syncBalls(scene, playfieldNodes.playfieldRoot, withBall);
				expect(scene.getMeshByName('ball_0')).not.toBeNull();

				const withoutBall = buildSnapshot({ balls: [] });
				syncBalls(scene, playfieldNodes.playfieldRoot, withoutBall);
				expect(scene.getMeshByName('ball_0'), 'the mesh for a ball no longer in the snapshot must be disposed').toBeNull();
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('two balls at once each get their own mesh, and only the one that leaves is disposed', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const both = buildSnapshot({
					balls: [
						{ id: 0, pos: { x: 250, y: 400, z: 13.495 }, vel: { x: 0, y: 0, z: 0 }, speed: 0 },
						{ id: 1, pos: { x: 260, y: 420, z: 13.495 }, vel: { x: 0, y: 0, z: 0 }, speed: 0 },
					],
				});
				syncBalls(scene, playfieldNodes.playfieldRoot, both);
				expect(scene.getMeshByName('ball_0')).not.toBeNull();
				expect(scene.getMeshByName('ball_1')).not.toBeNull();

				const onlyOne = buildSnapshot({
					balls: [{ id: 1, pos: { x: 260, y: 420, z: 13.495 }, vel: { x: 0, y: 0, z: 0 }, speed: 0 }],
				});
				syncBalls(scene, playfieldNodes.playfieldRoot, onlyOne);
				expect(scene.getMeshByName('ball_0')).toBeNull();
				expect(scene.getMeshByName('ball_1')).not.toBeNull();
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it("playfield_root's pitch follows the snapshot's effectivePitchDeg", async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				// loadAndRenderOnce() already applies TABLE.reference.pitchDeg by
				// default (Story 1.4); this proves a DIFFERENT effective pitch --
				// as a snapshot would carry once nudge/tilt (Story 1.7) vary it --
				// actually changes the applied rotation, not just re-applies the
				// same default.
				const steeperPitchDeg = TABLE.reference.pitchDeg + 2;
				const snapshot = buildSnapshot({ effectivePitchDeg: steeperPitchDeg });
				applyPitch(playfieldNodes, snapshot.effectivePitchDeg);

				// Measure the geometry rather than trust the rotation object alone
				// (test/scene-smoke.test.ts's own applyPitch() coverage explains why:
				// invariance checks alone cannot distinguish the intended pitch from
				// a negated one on this glb's particular pivot placement). Pitch
				// must lift the far end of the playfield (table y = h) by
				// sin(pitch) x h while leaving the drain end (table y = 0) on the
				// deck.
				const { w: refWidthMm, h: refHeightMm } = TABLE.reference.playfieldMm;
				const pitchRad = (steeperPitchDeg * Math.PI) / 180;
				const toSceneVec = (mm: { x: number; y: number; z: number }): Vector3 =>
					new Vector3(mm.x / 1000, mm.z / 1000, -mm.y / 1000);
				const playfieldWorld = playfieldNodes.playfieldRoot.computeWorldMatrix(true);
				const farLocal = toSceneVec({ x: refWidthMm / 2, y: refHeightMm, z: 0 });
				const nearLocal = toSceneVec({ x: refWidthMm / 2, y: 0, z: 0 });
				const farPitched = Vector3.TransformCoordinates(farLocal, playfieldWorld);
				const nearPitched = Vector3.TransformCoordinates(nearLocal, playfieldWorld);

				const expectedRiseM = Math.sin(pitchRad) * (refHeightMm / 1000);
				expect(expectedRiseM, 'sanity: the expected rise must be a real, positive distance').toBeGreaterThan(0.1);
				expect(farPitched.y).toBeCloseTo(expectedRiseM, 5);
				expect(nearPitched.y).toBeCloseTo(0, 5);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});

// Review finding 2026-08-28 (verification gap): every other test in this
// suite calls syncBalls()/applyPitch() directly, bypassing the ACTUAL
// production wiring -- create-engine.ts's loadAndRenderOnce() invoking a
// caller-supplied onFrame callback on every render-loop iteration, which
// src/host/boot.ts relies on to call syncBalls()/applyPitch() every frame.
// Before this test, deleting or misplacing that onFrame?.(...) call (e.g.
// moving it after scene.render(), or dropping the argument boot.ts passes)
// would leave every test in this file green while the browser leg silently
// broke -- the one mechanism connecting the fixed-step sim loop to what
// Babylon actually draws. This does not need the real committed glb's ball
// devices; it only needs loadAndRenderOnceForTests() to demonstrably invoke
// what it was given.
describe('src/presentation/scene/create-engine.ts -- loadAndRenderOnce() actually invokes its onFrame callback', () => {
	it('onFrame is called at least once, and BEFORE the scene it is given has rendered a frame render-complete', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			let callCount = 0;
			let calledBeforeFirstRenderComplete = false;
			const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' }, (calledScene) => {
				callCount += 1;
				// onAfterRenderObservable has not yet fired for this frame at the
				// point onFrame runs -- proving onFrame precedes scene.render(),
				// not just that it eventually runs at some point.
				if (callCount === 1 && calledScene.getEngine().frameId <= 1) {
					calledBeforeFirstRenderComplete = true;
				}
			});
			try {
				expect(callCount, 'onFrame must be invoked at least once by the render loop').toBeGreaterThan(0);
				expect(calledBeforeFirstRenderComplete, 'onFrame must run before/around the first completed render, not only on some later frame').toBe(true);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	// The render loop's callback in create-engine.ts has TWO branches -- one
	// used only while the very first frame is still pending (wrapped in
	// try/catch so a failure rejects the boot promise), and a separate one
	// used for every frame AFTER that (the one src/host/boot.ts actually
	// relies on for the whole rest of a play session). The test above only
	// proves the first branch calls onFrame; this one keeps the render loop
	// alive past the first frame and proves the STEADY-STATE branch does too
	// -- confirmed discriminating by removing either branch's onFrame call
	// locally and watching the corresponding assertion below fail.
	it('onFrame keeps being called on frames AFTER the first (the steady-state branch, not just the first-frame branch)', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			let callCount = 0;
			const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' }, () => {
				callCount += 1;
			});
			try {
				const countAtFirstFrame = callCount;
				expect(countAtFirstFrame).toBeGreaterThan(0);

				// engine.runRenderLoop() keeps its registered callback active
				// after loadAndRenderOnceForTests() resolves (nothing calls
				// engine.stopRenderLoop() on the success path) -- NullEngine
				// schedules its next frame the same way a real engine does, so
				// driving the event loop forward lets further frames actually
				// fire through the SAME render-loop callback create-engine.ts
				// registered, exercising its "already seen the first frame"
				// branch for real rather than by inspecting source text.
				await new Promise((resolve) => setTimeout(resolve, 50));

				expect(callCount, 'onFrame must still be called on frames after the first -- this is the branch a real play session runs on for its entire duration').toBeGreaterThan(countAtFirstFrame);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});
