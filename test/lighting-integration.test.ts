// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8, Rule 1's Integration AC / AC I1 -- the whole lamp chain, sim ->
// loop diff -> view fold -> Babylon, exercised end to end: a real
// `createLoop({ collisionDoc, gameStart })`, a real `s_start` press
// (`test/rules-modes-integration.test.ts`'s own `pressStartOnce` shape), a
// real plunge (`test/rules-lifecycle-integration.test.ts`'s own
// `pulseCoil('c_autolaunch')` idiom -- the same coil a live player's plunge
// eventually reaches, AD-6), `DISABLED_HAZARD_COILS` disabled exactly as
// `test/rules-modes-integration.test.ts:35` does, every frame's
// `FrameOutput.commands` folded through `advanceLamps`, and the result
// driven into `syncLamps` against a real `NullEngine` scene loaded from the
// COMMITTED glb. The assertion lands on the RENDERED ARTEFACT (a real
// `PBRMaterial.emissiveColor` and a real enabled `PointLight`), never on the
// `LampState`/`LampView` that precedes it -- the Story 2.6 `LEFT_MARGIN_COL`
// and Story 2.7 dot-row-800 shape this story's own Design Notes name.
//
// Seed 12345 is not arbitrary: it is the SAME seed
// `test/replays/full-plunge.golden.json` and Story 2.7's own DW-201 block
// (`test/rules-modes-integration.test.ts`) already use, and its FIRST draw
// is independently pinned there as `top_3` (`sim/rules/rng.ts`'s own
// published mulberry32 arithmetic) -- reusing it here means this test's own
// "the skill shot must genuinely arm" sanity check is corroborated by two
// OTHER files' independent pins, not merely asserted once in isolation.
// 2,500 ticks was measured (this story's own planning run) to comfortably
// carry the ball from launch, up the field, and through a real resolving
// closure of the skill shot -- well inside `full-plunge`'s own 2,000-tick
// budget for a bare plunge with no Start/skill-shot machinery on top.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { getRequiredNode } from '../src/presentation/scene/playfield';
import { syncLamps } from '../src/presentation/lighting/lamp-driver';
import { advanceLamps, INITIAL_LAMP_VIEW } from '../src/presentation/lighting/lamp-view';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, FrameOutput, GameStart, LampCommand, LampName } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
const SEED = 12345; // full-plunge.golden.json / DW-201's own seed -- first draw independently pinned elsewhere as top_3

function loadCollisionDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

function gameStart(): GameStart {
	return {
		seed: SEED,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

function isLampCommand(command: FrameOutput['commands'][number]): command is LampCommand {
	return command.type === 'lamp';
}

describe('Story 2.8, AC I1 -- Integration: real loop, real Start + plunge, real Babylon render chain', () => {
	it("the drawn Top lane's insert is observably lit on the rendered artefact, and the command stream is non-empty", async () => {
		const loop = createLoop({ collisionDoc: loadCollisionDoc(), gameStart: gameStart() });
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}

		const allCommands: FrameOutput['commands'][number][] = [];
		let view = INITIAL_LAMP_VIEW;
		function step(transitions: Parameters<typeof loop.advance>[1] = []): FrameOutput {
			const out = loop.advance(1, transitions);
			allCommands.push(...out.commands);
			view = advanceLamps(view, out);
			return out;
		}

		// Boot, then a real s_start press (InputTransition, never a synthetic DeviceEvent).
		step();
		step([{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		step([{ tick: 3, frame: { ...NO_FRAME, start: false } }]);

		let drawnLane: LampName | undefined;
		const MAX_ARM_TICKS = 200;
		for (let i = 0; i < MAX_ARM_TICKS && !drawnLane; i++) {
			const out = step();
			if (out.snapshot.game.modes.some((m) => m.mode === 'skill_shot')) {
				const lit = out.snapshot.game.players[0]?.lanes.lit ?? {};
				const laneId = (Object.keys(TABLE.laneWiring) as Array<keyof typeof TABLE.laneWiring>).find(
					(lane) => TABLE.laneWiring[lane].set === 'top' && lit[lane] === true,
				);
				if (laneId) {
					drawnLane = `l_${laneId}` as LampName;
				}
			}
		}
		expect(drawnLane, `the skill shot must genuinely arm and draw a Top lane within ${MAX_ARM_TICKS} ticks of a real Start press, or this test is vacuous`).toBeDefined();
		expect(view[drawnLane!], 'the drawn lane\'s own lamp must already be folded into the view as lit, before any plunge').toEqual({ role: 'lit', step: 2 });

		// A real plunge (AD-6: "the manual plunge and the autolaunch are one
		// code path"), then run long enough for the ball to reach the main
		// field and produce a real resolving closure.
		loop.pulseCoil('c_autolaunch');
		const PLUNGE_TICKS = 2500;
		for (let i = 0; i < PLUNGE_TICKS; i++) {
			step();
		}

		expect(allCommands.length, 'the command stream must be non-empty across the whole run').toBeGreaterThan(0);
		const lampCommands = allCommands.filter(isLampCommand);
		expect(lampCommands.length, 'at least one LampCommand must have been emitted').toBeGreaterThan(0);
		expect(
			lampCommands.some((c) => c.lamp === drawnLane && c.role === 'lit'),
			`the accumulated command stream must include a "lit" LampCommand for ${drawnLane}`,
		).toBe(true);

		// The drawn lane's lit flag survives the whole run (nothing un-lights
		// an individual Top lane other than a lane change or a completed set,
		// neither of which this run's own script performs) -- so the FOLDED
		// view still shows it lit, whether the skill shot resolved (step 2 ->
		// step 1) or is still armed.
		expect(view[drawnLane!]?.role, `${drawnLane} must still read "lit" at the end of the run`).toBe('lit');

		// Now the real Babylon half: a fresh NullEngine scene loaded from the
		// COMMITTED glb, driven by the SAME view this real loop produced.
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				syncLamps(scene, playfieldNodes.playfieldRoot, view, 0);

				const mesh = getRequiredNode(scene, drawnLane!) as AbstractMesh;
				const material = mesh.material as PBRMaterial;
				const emissive = material.emissiveColor;
				expect(
					emissive.r > 0 || emissive.g > 0 || emissive.b > 0,
					`${drawnLane}'s own emissiveColor must be non-black on the rendered artefact -- got rgb(${emissive.r}, ${emissive.g}, ${emissive.b})`,
				).toBe(true);

				const enabledLight = mesh.lightSources.find((l) => l.isEnabled() && l instanceof PointLight);
				expect(enabledLight, `${drawnLane}'s own mesh must carry an ENABLED PointLight in its lightSources`).toBeDefined();
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});
