// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.2, Spike 3 -- AD-15's one sanctioned presentation test: a headless
// NullEngine load smoke. Imports Babylon by deep ES path
// (@babylonjs/core/Engines/nullEngine, @babylonjs/core/Loading/sceneLoader,
// @babylonjs/loaders/glTF/2.0), not the side-effectful barrel, so this runs
// under vitest's existing `environment: 'node'` -- no DOM, no new
// devDependency. Reads public/assets/dragonwar.glb off disk and feeds the
// bytes to the loader as a data: URL -- acceptable INSIDE THIS TEST ONLY (see
// this story's Design Notes): it is not the shipping load path, which fetches
// the glb same-origin over `connect-src 'self'` (src/presentation/scene/
// create-engine.ts), and is never inlined there.
//
// Also covers the I/O & Edge-Case Matrix's "Engine created once" row: a
// second createEngine() call is a defect, asserted here since a live browser
// gesture is the only other place that path runs.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
// The same leaner base-loader import src/presentation/scene/create-engine.ts
// ships with (not the '@babylonjs/loaders/glTF/2.0' barrel, which also
// registers every extension) -- this smoke test validates what actually ships.
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { createEngine, resetEngineCreationGuardForTests } from '../src/presentation/scene/create-engine';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

describe('public/assets/dragonwar.glb -- NullEngine load smoke', () => {
	it('parses as valid glTF 2.0 and exposes playfield_root as a top-level node', async () => {
		const engine = new NullEngine();
		const scene = new Scene(engine);
		try {
			const bytes = readFileSync(GLB_PATH);
			const dataUrl = `data:;base64,${bytes.toString('base64')}`; // test-only, see header comment

			const container = await LoadAssetContainerAsync(dataUrl, scene, { pluginExtension: '.glb' });
			container.addAllToScene();

			const playfieldRoot = scene.getTransformNodeByName('playfield_root');
			expect(playfieldRoot, 'playfield_root node not found after loading dragonwar.glb').not.toBeNull();

			const box = scene.getMeshByName('vis_placeholder_box');
			expect(box, 'vis_placeholder_box mesh not found after loading dragonwar.glb').not.toBeNull();
		} finally {
			engine.dispose();
		}
	});

	it('every node name matches AD-11\'s grammar ^[a-z][a-z0-9_]*$', async () => {
		const engine = new NullEngine();
		const scene = new Scene(engine);
		try {
			const bytes = readFileSync(GLB_PATH);
			const dataUrl = `data:;base64,${bytes.toString('base64')}`;
			const container = await LoadAssetContainerAsync(dataUrl, scene, { pluginExtension: '.glb' });
			container.addAllToScene();

			const names = [...scene.transformNodes, ...scene.meshes]
				.map((n) => n.name)
				.filter((n) => n !== '__root__'); // Babylon's own synthetic import root, not an authored node
			expect(names.length).toBeGreaterThan(0);
			for (const name of names) {
				expect(name, `node name "${name}" violates ^[a-z][a-z0-9_]*$`).toMatch(/^[a-z][a-z0-9_]*$/);
			}
		} finally {
			engine.dispose();
		}
	});
});

describe('src/presentation/scene/create-engine.ts -- single engine creation (I/O matrix, "Engine created once")', () => {
	afterEach(() => {
		resetEngineCreationGuardForTests();
	});

	it('creates exactly one engine per call; a second call is rejected as a defect', async () => {
		const first = await createEngine(undefined, false);
		expect(first.engine).toBeDefined();

		await expect(createEngine(undefined, false)).rejects.toThrow(/created exactly once/);

		first.engine.dispose();
	});

	it('honours forceWebGL2 by constructing the WebGL2 engine directly, bypassing the WebGPU probe', async () => {
		const result = await createEngine(undefined, true);
		expect(result.renderer).toBe('webgl2-forced');
		result.engine.dispose();
	});

	it('without forceWebGL2, under Node (no navigator.gpu, no real WebGL context), falls back through EngineFactory to a NullEngine', async () => {
		// EngineFactory.CreateAsync's own fallback chain (WebGPU -> WebGL -> Null)
		// lands on NullEngine in this environment -- see
		// node_modules/@babylonjs/core/Engines/engineFactory.js. This is the
		// mechanism that lets this file's own smoke tests run under Vitest's
		// Node environment with no DOM at all.
		const result = await createEngine(undefined, false);
		expect(result.engine.constructor.name).toBe('NullEngine');
		expect(result.renderer).toBe('webgl2');
		result.engine.dispose();
	});
});
