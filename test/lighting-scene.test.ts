// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.8, AC 4 / AC 5 -- the NullEngine tier for `syncLamps()`
// (`presentation/lighting/lamp-driver.ts`), against the REAL committed glb,
// copying `test/backglass-scene.test.ts:59-87`'s own shape: `new
// NullEngine()`, `loadAndRenderOnceForTests`, drive the driver, then read
// the real `PBRMaterial`/`PointLight` back off the mesh/scene. Each
// assertion below targets one of the four measured traps
// `lamp-driver.ts`'s own header names (Design Notes, "The four measured
// traps"):
//   1. shared material -- the "lamp A lit, lamp B still black" control.
//   2. `getAbsolutePosition()` lies under NullEngine -- world position read
//      via `computeWorldMatrix(true).getTranslation()` only.
//   3. `maxSimultaneousLights` truncation -- `lightSources.length <=
//      material.maxSimultaneousLights`, and `vis_playfield` isolation.
//   4. `scene.lights` counts disabled lights -- the budget cap is exercised
//      with an injected `{ budget: 2 }` over fourteen lit lamps (14 < the
//      real 20-light budget, so the REAL budget alone would be vacuous).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { getRequiredNode } from '../src/presentation/scene/playfield';
import { syncLamps } from '../src/presentation/lighting/lamp-driver';
import { lookupGrammar } from '../src/presentation/lighting/grammar';
import { TABLE } from '../src/sim/table/dragonwar';
import type { LampName } from '../src/sim/table/names';
import type { LampView } from '../src/presentation/lighting/lamp-view';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

/** Loads the real committed glb into a fresh NullEngine scene and yields it (plus playfieldRoot), disposing both on the caller's behalf. */
async function withScene<T>(fn: (scene: import('@babylonjs/core/scene').Scene, playfieldRoot: import('@babylonjs/core/Meshes/transformNode').TransformNode) => Promise<T> | T): Promise<T> {
	const engine = new NullEngine();
	try {
		const bytes = readFileSync(GLB_PATH);
		const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
		try {
			return await fn(scene, playfieldNodes.playfieldRoot);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

function emissiveColorOf(scene: import('@babylonjs/core/scene').Scene, lampName: LampName): { r: number; g: number; b: number } {
	const node = getRequiredNode(scene, lampName) as AbstractMesh;
	const material = node.material as PBRMaterial;
	const c = material.emissiveColor;
	return { r: c.r, g: c.g, b: c.b };
}

describe('syncLamps -- trap 1: shared material (material.clone() per insert)', () => {
	it('lighting one insert leaves a DIFFERENT insert genuinely black -- proving the material is cloned, not shared', async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = { l_top_1: { role: 'lit', step: 1 } };
			syncLamps(scene, playfieldRoot, view, 0);

			const lit = emissiveColorOf(scene, 'l_top_1');
			expect(lit).toEqual({ r: 1, g: 1, b: 1 }); // grammar's own 'lit' colour, white

			const stillBlack = emissiveColorOf(scene, 'l_top_2');
			expect(stillBlack).toEqual({ r: 0, g: 0, b: 0 });
		});
	});
});

describe('syncLamps -- trap 2/3: dynamic light placement and per-mesh light budget', () => {
	it('a lit insert has an ENABLED light in its own lightSources, restricted to it (includedOnlyMeshes), and never in vis_playfield\'s', async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = { l_top_1: { role: 'lit', step: 1 } };
			syncLamps(scene, playfieldRoot, view, 0);

			const insertMesh = getRequiredNode(scene, 'l_top_1') as AbstractMesh;
			const enabledSources = insertMesh.lightSources.filter((l) => l.isEnabled());
			expect(enabledSources.some((l) => l instanceof PointLight), 'the insert mesh must see its own enabled PointLight').toBe(true);

			const playfieldMesh = getRequiredNode(scene, 'vis_playfield') as AbstractMesh;
			const playfieldPointLights = playfieldMesh.lightSources.filter((l) => l instanceof PointLight);
			expect(playfieldPointLights, 'includedOnlyMeshes must keep the insert light off vis_playfield entirely (trap 3)').toEqual([]);
		});
	});

	it('for every insert mesh, enabled lightSources never exceed its material\'s maxSimultaneousLights', async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = {};
			for (const name of Object.keys(TABLE.lamps) as LampName[]) {
				view[name] = { role: 'lit', step: 1 };
			}
			syncLamps(scene, playfieldRoot, view, 0);

			for (const name of Object.keys(TABLE.lamps) as LampName[]) {
				const mesh = getRequiredNode(scene, name) as AbstractMesh;
				const material = mesh.material as PBRMaterial;
				const enabledCount = mesh.lightSources.filter((l) => l.isEnabled()).length;
				expect(enabledCount, `${name}: enabled lightSources (${enabledCount}) must not exceed maxSimultaneousLights (${material.maxSimultaneousLights})`).toBeLessThanOrEqual(material.maxSimultaneousLights);
			}
		});
	});

	it("the light's WORLD position (computeWorldMatrix(true).getTranslation(), never getAbsolutePosition()) sits below the insert mesh's own world bounding-box centre, on the pitched playfield (trap 2)", async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = { l_top_1: { role: 'lit', step: 1 } };
			syncLamps(scene, playfieldRoot, view, 0);

			const mesh = getRequiredNode(scene, 'l_top_1') as AbstractMesh;
			mesh.computeWorldMatrix(true);
			mesh.refreshBoundingInfo({});
			const meshCenterWorld = mesh.getBoundingInfo().boundingBox.centerWorld;

			const light = mesh.lightSources.find((l) => l instanceof PointLight) as PointLight;
			expect(light, 'l_top_1 must have its own PointLight in lightSources').toBeDefined();

			// Code review (verification gap): the world-Y ordering assertion
			// below stayed GREEN even with `light.parent = playfieldRoot`
			// deleted -- reproduced and confirmed by the reviewer -- because the
			// light's own AUTHORED local y offset ("beneath the lens", table
			// z = -4mm) already sits numerically below the combined lens+cup
			// mesh's own local-space vertical centre (table z roughly -3.5mm),
			// so the ordering survives a real 6.5-degree pitch either way and
			// does not, on its own, discriminate whether the light actually
			// tracks the playfield's pitch. A direct structural check closes
			// that gap: the light MUST be parented to playfieldRoot (AD-12:
			// "parented to playfield_root so it tracks pitch") -- this is
			// exactly what the AC 5 Rule-19 mutation ("remove
			// light.parent = playfieldRoot") now reddens.
			expect(light.parent, 'the light must be parented to playfieldRoot so it tracks the table\'s pitch (AD-12)').toBe(playfieldRoot);

			const lightWorld = light.computeWorldMatrix(true).getTranslation();

			expect(lightWorld.y, 'the light must sit strictly BELOW (world Y) the mesh\'s own world bbox centre -- "beneath the lens"').toBeLessThan(meshCenterWorld.y);
		});
	});
});

describe('syncLamps -- blinking (timed by presentation, via isLampOnAt)', () => {
	it('a step-2 (500 ms period) lamp\'s emissive flips to black at the half-period mark, and back at the full period', async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = { l_top_1: { role: 'lit', step: 2 } };
			const grammar = lookupGrammar('lit', 2);
			expect(grammar.blinkPeriodMs).toBe(500);

			syncLamps(scene, playfieldRoot, view, 0);
			expect(emissiveColorOf(scene, 'l_top_1')).toEqual({ r: 1, g: 1, b: 1 });

			syncLamps(scene, playfieldRoot, view, 250); // half the 500 ms period -- the OFF half
			expect(emissiveColorOf(scene, 'l_top_1')).toEqual({ r: 0, g: 0, b: 0 });

			syncLamps(scene, playfieldRoot, view, 500); // one full period later -- back ON
			expect(emissiveColorOf(scene, 'l_top_1')).toEqual({ r: 1, g: 1, b: 1 });

			// The light itself is disabled for the same "off" instant.
			const insertMesh = getRequiredNode(scene, 'l_top_1') as AbstractMesh;
			syncLamps(scene, playfieldRoot, view, 250);
			expect(insertMesh.lightSources.filter((l) => l.isEnabled() && l instanceof PointLight)).toEqual([]);
		});
	});
});

describe('syncLamps -- trap 4: the live budget counts ENABLED lights only, exercised below the real 20-light default', () => {
	it('with { budget: 2 } over fourteen lit lamps, at most two lights are enabled while every lit insert still shows its own emissive colour', async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = {};
			for (const name of Object.keys(TABLE.lamps) as LampName[]) {
				view[name] = { role: 'lit', step: 1 };
			}
			syncLamps(scene, playfieldRoot, view, 0, { budget: 2 });

			let enabledPointLights = 0;
			for (const name of Object.keys(TABLE.lamps) as LampName[]) {
				const mesh = getRequiredNode(scene, name) as AbstractMesh;
				enabledPointLights += mesh.lightSources.filter((l) => l.isEnabled() && l instanceof PointLight).length;

				// Every lit insert keeps showing its emissive colour regardless of budget.
				expect(emissiveColorOf(scene, name)).toEqual({ r: 1, g: 1, b: 1 });
			}
			expect(enabledPointLights, 'at most the injected budget of 2 lights may be enabled, out of fourteen lit inserts').toBeLessThanOrEqual(2);
			expect(enabledPointLights, 'the budget must actually be exercised, not vacuously satisfied by zero').toBe(2);
		});
	});

	// Code review (verification gap): every OTHER test in this describe block
	// injects an explicit `{ budget: N }`, so none of them proves the
	// `options?.budget ?? TUNING.liveLightBudget.value` FALLBACK itself
	// resolves correctly -- which is the exact call shape `src/host/boot.ts`
	// uses in production (`syncLamps(scene, nodes.playfieldRoot, lampView,
	// performance.now())`, no fifth argument at all). A regression that broke
	// the fallback (e.g. `TUNING.liveLightBudget` resolving `undefined`, so
	// `enabledCount < budget` is always `false`) would leave every insert
	// dark and still pass every OTHER assertion in this file, since each of
	// those either injects its own budget or checks only a PER-MESH cap that
	// zero enabled lights trivially satisfies.
	it('with NO options object (the real production call shape), the default budget (TUNING.liveLightBudget.value, 20) is not exceeded by fourteen lit lamps -- every one gets an enabled light', async () => {
		await withScene(async (scene, playfieldRoot) => {
			const view: LampView = {};
			for (const name of Object.keys(TABLE.lamps) as LampName[]) {
				view[name] = { role: 'lit', step: 1 };
			}
			syncLamps(scene, playfieldRoot, view, 0);

			let enabledPointLights = 0;
			for (const name of Object.keys(TABLE.lamps) as LampName[]) {
				const mesh = getRequiredNode(scene, name) as AbstractMesh;
				enabledPointLights += mesh.lightSources.filter((l) => l.isEnabled() && l instanceof PointLight).length;
			}
			expect(enabledPointLights, 'the default budget (20) must comfortably exceed fourteen real lamps -- every lit insert gets its own enabled light with no override at all').toBe(Object.keys(TABLE.lamps).length);
		});
	});
});

describe('syncLamps -- error handling (I/O matrix)', () => {
	it('throws, naming the node, when a lit insert node has no material (glTF node resolved to a TransformNode wrapping a multi-primitive mesh)', async () => {
		const engine = new NullEngine();
		try {
			const { Scene } = await import('@babylonjs/core/scene');
			const { MeshBuilder } = await import('@babylonjs/core/Meshes/meshBuilder');
			const scene = new Scene(engine);
			try {
				const root = new (await import('@babylonjs/core/Meshes/transformNode')).TransformNode('playfield_root', scene);
				const materiallessInsert = MeshBuilder.CreateBox('l_top_1', { size: 0.02 }, scene);
				materiallessInsert.parent = root;
				expect(materiallessInsert.material, 'sanity: this mesh must genuinely carry no material').toBeNull();

				const view: LampView = { l_top_1: { role: 'lit', step: 1 } };
				expect(() => syncLamps(scene, root, view, 0)).toThrow(/l_top_1/);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('throws, naming the missing node, on EVERY call when the scene lacks an insert node -- not only the first', async () => {
		const engine = new NullEngine();
		try {
			// An empty scene (no glb loaded at all): every TABLE.lamps node is missing.
			const { Scene } = await import('@babylonjs/core/scene');
			const scene = new Scene(engine);
			try {
				const { TransformNode } = await import('@babylonjs/core/Meshes/transformNode');
				const root = new TransformNode('playfield_root', scene);
				const view: LampView = { l_top_1: { role: 'lit', step: 1 } };
				expect(() => syncLamps(scene, root, view, 0)).toThrow(/l_top_1/);
				expect(() => syncLamps(scene, root, view, 0), 'must throw again on the SECOND call, not only the first').toThrow(/l_top_1/);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});
