// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6, AC 1 -- the NullEngine tier: the committed glb loads with
// vis_backbox present as a child of cabinet_root; syncBackglass() creates a
// texture of the expected size with samplingMode === NEAREST_SAMPLINGMODE;
// and the quad's eight world-bbox corners project inside the fixed camera's
// viewport, above the playfield's far edge in NDC y. The projection
// technique is copied from test/scene-smoke.test.ts:311-336 (world bbox
// corners -> view * projection -> NDC in [-1, 1]).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { getRequiredNode } from '../src/presentation/scene/playfield';
import { syncBackglass } from '../src/presentation/backglass/backglass';
import { rasterise } from '../src/presentation/backglass/raster';
import { DMD_COLS, DMD_ROWS, type DmdFrame } from '../src/presentation/backglass/frame';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { TABLE } from '../src/sim/table/dragonwar';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
const DOT_PITCH_PX = 4; // mirrors raster.ts's own constant, kept test-local so this file does not depend on it changing

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

const EMPTY_FRAME: DmdFrame = { screen: 'score', rows: [] };

describe('vis_backbox -- present in the committed glb, parented to cabinet_root', () => {
	it('vis_backbox exists and is a child of cabinet_root, not playfield_root', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const mesh = scene.getMeshByName('vis_backbox');
				expect(mesh, 'vis_backbox mesh not found after loading dragonwar.glb').not.toBeNull();
				expect(mesh!.parent).toBe(playfieldNodes.cabinetRoot);
				expect(mesh!.parent).not.toBe(playfieldNodes.playfieldRoot);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});

describe('syncBackglass() -- the RawTexture wiring (AC 1: NEAREST_SAMPLINGMODE, "no smoothing")', () => {
	it('creates an emissive RawTexture sized to the dot grid in physical pixels, with NEAREST_SAMPLINGMODE, and update() never throws on later calls', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const raster = rasterise(EMPTY_FRAME, FONT_5X7);
				syncBackglass(scene, raster);

				const node = getRequiredNode(scene, 'vis_backbox') as AbstractMesh;
				const material = node.material as PBRMaterial;
				expect(material, 'vis_backbox must carry a material (AD-11\'s own export contract)').not.toBeNull();
				const texture = material.emissiveTexture;
				expect(texture, 'syncBackglass() must assign the mesh material\'s emissiveTexture').not.toBeNull();
				expect(texture!.getSize()).toEqual({ width: DMD_COLS * DOT_PITCH_PX, height: DMD_ROWS * DOT_PITCH_PX });
				expect(texture!.samplingMode, 'AC 1: the DMD texture must sample NEAREST, never smoothed').toBe(Texture.NEAREST_SAMPLINGMODE);

				// Idempotent: a second call reuses the SAME texture instance (no
				// re-creation cost) and does not throw.
				expect(() => syncBackglass(scene, rasterise(EMPTY_FRAME, FONT_5X7))).not.toThrow();
				const materialAfter = (getRequiredNode(scene, 'vis_backbox') as AbstractMesh).material as PBRMaterial;
				expect(materialAfter.emissiveTexture).toBe(texture);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('DW-196: the emissive RawTexture is created with mipmap generation disabled -- AC 1\'s "no smoothing" would otherwise rest on an unasserted property', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const raster = rasterise(EMPTY_FRAME, FONT_5X7);
				syncBackglass(scene, raster);

				const node = getRequiredNode(scene, 'vis_backbox') as AbstractMesh;
				const material = node.material as PBRMaterial;
				const texture = material.emissiveTexture;
				expect(texture, 'syncBackglass() must assign the mesh material\'s emissiveTexture').not.toBeNull();
				expect(texture!.noMipmap, 'AC 1: mipmap generation must be disabled on the DMD texture, or a mip-level LOD swap could blur it despite NEAREST_SAMPLINGMODE').toBe(true);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});

	it('a scene with no vis_backbox throws naming the node (I/O Matrix: "Backbox mesh missing")', () => {
		const engine = new NullEngine();
		const scene = new Scene(engine);
		try {
			const raster = rasterise(EMPTY_FRAME, FONT_5X7);
			expect(() => syncBackglass(scene, raster)).toThrow(/vis_backbox/);
		} finally {
			scene.dispose();
			engine.dispose();
		}
	});
});

describe('AC 1 -- vis_backbox\'s eight world-bbox corners project inside the fixed camera\'s viewport, above the playfield\'s far edge', () => {
	it('every corner is in NDC [-1, 1] on both axes, and the quad sits above the playfield\'s far edge in NDC y', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const camera = scene.activeCamera;
				expect(camera, 'the authored fixed camera must be the scene\'s active camera').not.toBeNull();

				const backbox = scene.getMeshByName('vis_backbox');
				expect(backbox, 'vis_backbox mesh not found').not.toBeNull();
				const corners = backbox!.getBoundingInfo().boundingBox.vectorsWorld;
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

				// Above the playfield's own far edge in NDC y (Design Notes: "the
				// quad sits in empty sky above the playfield -- occludes nothing").
				const { w: camWidthMm, h: camHeightMm } = TABLE.reference.playfieldMm;
				const toSceneVec = (mm: { x: number; y: number; z: number }): Vector3 =>
					new Vector3(mm.x / 1000, mm.z / 1000, -mm.y / 1000);
				const farEdgeNdc = Vector3.TransformCoordinates(toSceneVec({ x: camWidthMm / 2, y: camHeightMm, z: 0 }), viewProj);
				const lowestBackboxNdcY = Math.min(...corners.map((c) => Vector3.TransformCoordinates(c, viewProj).y));
				expect(
					lowestBackboxNdcY,
					`vis_backbox's lowest corner (NDC y ${lowestBackboxNdcY.toFixed(4)}) must sit ABOVE the playfield's far edge (NDC y ${farEdgeNdc.y.toFixed(4)})`,
				).toBeGreaterThan(farEdgeNdc.y);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});
