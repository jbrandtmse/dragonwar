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
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// The same leaner base-loader import src/presentation/scene/create-engine.ts
// ships with (not the '@babylonjs/loaders/glTF/2.0' barrel, which also
// registers every extension) -- this smoke test validates what actually ships.
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { createEngine, resetEngineCreationGuardForTests, loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { TABLE } from '../src/sim/table/dragonwar';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see this file's header comment
}

/**
 * Renames a top-level glTF node in a committed `.glb`'s JSON chunk, keeping
 * the BIN chunk byte-identical -- used only to construct the "a glb with a
 * node removed throws before the first frame" negative case (this story's
 * fourth acceptance criterion) without hand-authoring a second binary fixture.
 */
function renameGlbNode(bytes: Buffer, oldName: string, newName: string): Buffer {
	const jsonLength = bytes.readUInt32LE(12);
	const jsonBytes = bytes.subarray(20, 20 + jsonLength);
	const json = JSON.parse(jsonBytes.toString('utf8')) as { nodes: Array<{ name?: string }> };
	const node = json.nodes.find((n) => n.name === oldName);
	if (!node) {
		throw new Error(`renameGlbNode(): node "${oldName}" not found in the committed glb`);
	}
	node.name = newName;

	const newJsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
	const pad = (buf: Buffer, fill: number): Buffer => {
		const remainder = buf.length % 4;
		return remainder === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - remainder, fill)]);
	};
	const paddedJson = pad(newJsonBuffer, 0x20);
	const binChunkAndHeader = bytes.subarray(20 + jsonLength);

	const jsonChunkHeader = Buffer.alloc(8);
	jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
	jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

	const totalLength = 12 + jsonChunkHeader.length + paddedJson.length + binChunkAndHeader.length;
	const header = Buffer.alloc(12);
	header.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
	header.writeUInt32LE(2, 4); // version
	header.writeUInt32LE(totalLength, 8);

	return Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkAndHeader]);
}

describe('public/assets/dragonwar.glb -- NullEngine load smoke', () => {
	it('parses as valid glTF 2.0 and exposes every TABLE.nodes name presentation resolves', async () => {
		const engine = new NullEngine();
		const scene = new Scene(engine);
		try {
			const bytes = readFileSync(GLB_PATH);
			const container = await LoadAssetContainerAsync(glbDataUrl(bytes), scene, { pluginExtension: '.glb' });
			container.addAllToScene();

			for (const name of [TABLE.nodes.playfieldRoot, TABLE.nodes.cabinetRoot, TABLE.nodes.pivotPitch]) {
				const node = scene.getTransformNodeByName(name);
				expect(node, `${name} node not found after loading dragonwar.glb`).not.toBeNull();
			}

			const vis = scene.getMeshByName('vis_playfield');
			expect(vis, 'vis_playfield mesh not found after loading dragonwar.glb').not.toBeNull();
		} finally {
			engine.dispose();
		}
	});

	it('every node name matches AD-11\'s grammar ^[a-z][a-z0-9_]*$', async () => {
		const engine = new NullEngine();
		const scene = new Scene(engine);
		try {
			const bytes = readFileSync(GLB_PATH);
			const container = await LoadAssetContainerAsync(glbDataUrl(bytes), scene, { pluginExtension: '.glb' });
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

describe('src/presentation/scene/create-engine.ts -- the real scene-construction path (loadAndRenderOnce)', () => {
	// Review finding (2026-08-28): the two tests above build a scene through a
	// hand-rolled, parallel NullEngine/Scene/LoadAssetContainerAsync sequence
	// that never calls into create-engine.ts's own loadAndRenderOnce() --
	// meaning this story's headline CSP fix (seedEnvironmentBrdfTexture(),
	// called only from inside loadAndRenderOnce()) had zero automated
	// coverage of the actual shipped code path. This block drives that real
	// function directly via the test-only loadAndRenderOnceForTests() export,
	// with a NullEngine standing in for bootScene()'s real (WebGPU or WebGL2)
	// engine -- loadAndRenderOnce() takes an AbstractEngine and has no DOM
	// dependency of its own, so no window/canvas is needed here.
	it('renders the placeholder scene and seeds a non-null environmentBRDFTexture before any material can request the CSP-blocked default', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);

			const { scene, firstFrameMs, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				expect(scene.useRightHandedSystem, 'AD-10: scene must be right-handed').toBe(true);
				// `.not.toBeNull()` alone could not detect the regression this
				// assertion exists for (review finding 2026-08-28): Scene declares
				// environmentBRDFTexture with no initialiser, so an unseeded scene
				// reads `undefined`, which passes `.not.toBeNull()`; and Babylon's
				// own GetEnvironmentBRDFTexture ASSIGNS the property when the glTF
				// loader's PBRMaterial asks for one -- which under NullEngine in
				// Node succeeds, because there is no CSP to block its `data:` URI.
				// The assertion therefore passed identically with and without the
				// seed. Pin the texture's identity instead: ours is the 1x1
				// RawTexture built from raw bytes in memory, Babylon's is a loaded
				// PNG, so this distinguishes them.
				const brdf = scene.environmentBRDFTexture;
				expect(brdf, 'seedEnvironmentBrdfTexture() must run before any material needs a BRDF LUT').toBeInstanceOf(RawTexture);
				expect(brdf.getSize(), 'the seeded BRDF LUT is the in-memory 1x1 RawTexture, not Babylon\'s CSP-blocked data: URI default').toEqual({ width: 1, height: 1 });
				expect(typeof firstFrameMs).toBe('number');
				expect(Number.isFinite(firstFrameMs)).toBe(true);

				expect(playfieldNodes.playfieldRoot, 'playfield_root node not found after loading dragonwar.glb through the real path').toBeDefined();
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('the effective pitch rotates playfield_root about pivot_pitch while cabinet_root\'s world matrix is unchanged', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				// cabinet_root was authored at the origin, untouched by applyPitch():
				// its world matrix must still be the identity.
				const cabinetWorld = playfieldNodes.cabinetRoot.computeWorldMatrix(true);
				expect(cabinetWorld.isIdentity(), 'cabinet_root\'s world matrix must be unchanged by pitch').toBe(true);

				// playfield_root must actually be rotated (a non-identity pitch is applied).
				const playfieldWorld = playfieldNodes.playfieldRoot.computeWorldMatrix(true);
				expect(playfieldWorld.isIdentity(), 'playfield_root must be rotated by the effective pitch, not left at identity').toBe(false);

				// "about pivot_pitch": the point at pivot_pitch's OWN (untouched)
				// position, read as a point in playfield_root's local space (its
				// own transform was identity at authoring time, so local == world
				// there), must map back to that SAME world position through
				// playfield_root's NEW (pitched) world matrix -- the defining
				// property of a rotation about that point, not merely near it.
				const pivotLocal = playfieldNodes.pivotPitch.position.clone();
				const mapped = Vector3.TransformCoordinates(pivotLocal, playfieldWorld);
				const pivotWorld = playfieldNodes.pivotPitch.computeWorldMatrix(true).getTranslation();
				expect(mapped.x).toBeCloseTo(pivotWorld.x, 5);
				expect(mapped.y).toBeCloseTo(pivotWorld.y, 5);
				expect(mapped.z).toBeCloseTo(pivotWorld.z, 5);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('the eight corners of the playfield\'s bounding box project inside the viewport of the authored fixed camera', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const camera = scene.activeCamera;
				expect(camera, 'the authored fixed camera must be the scene\'s active camera').not.toBeNull();

				const vis = scene.getMeshByName('vis_playfield');
				expect(vis, 'vis_playfield mesh not found').not.toBeNull();
				const bbox = vis!.getBoundingInfo().boundingBox;
				const corners = bbox.vectorsWorld;
				expect(corners.length).toBe(8);

				const viewMatrix = camera!.getViewMatrix();
				const projMatrix = camera!.getProjectionMatrix(true);
				const viewProj = viewMatrix.multiply(projMatrix);

				for (const corner of corners) {
					const ndc = Vector3.TransformCoordinates(corner, viewProj);
					expect(ndc.x, `corner ${corner.toString()} projects outside the viewport on x (${ndc.x})`).toBeGreaterThanOrEqual(-1);
					expect(ndc.x).toBeLessThanOrEqual(1);
					expect(ndc.y, `corner ${corner.toString()} projects outside the viewport on y (${ndc.y})`).toBeGreaterThanOrEqual(-1);
					expect(ndc.y).toBeLessThanOrEqual(1);
				}
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('a glb with a required node removed throws before the first frame renders', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const mutated = renameGlbNode(bytes, TABLE.nodes.playfieldRoot, 'not_playfield_root');

			await expect(loadAndRenderOnceForTests(engine, glbDataUrl(mutated), { pluginExtension: '.glb' }))
				.rejects.toThrow(/playfield_root/);
		} finally {
			engine.dispose();
		}
	});
});
