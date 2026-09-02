// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b task 26a -- AC 8: "given the fixed camera from Story 1.4, when
// the full geometry is in view, then both flippers, the Dragon, both Loops,
// the Ramp and the DRAGON bank are legible" -- operationally: each named
// feature's eight projected bbox corners land inside NDC [-1, 1] in x and
// y, each feature's projected bbox spans at least MIN_LEGIBLE_NDC_SPAN of
// the viewport so no feature is a dot, and the projected vertical ordering
// matches the table layout (the drain end below the far end).
//
// The camera is READ, never written: `scene.activeCamera` after
// loadAndRenderOnceForTests(), exactly test/scene-smoke.test.ts's own
// "eight corners" case -- createFixedCamera() is never imported here, and
// that file's own :311-336 case is untouched (the Backglass clause moved to
// Story 2.6 by the author on 2026-08-31; this test owns only the playfield-
// feature legibility half).
//
// col_ nodes never reach the glb (export.py's is_presentation_object(),
// :95-100), so this is the FIRST test to project COLLISION-DOCUMENT
// geometry through the fixed camera: `readCollisionDoc()` for each named
// feature's bboxMm (test/asset-contract.test.ts's own convention),
// `toScene()` to lift a table-mm point into playfield_root's LOCAL scene
// space, then `playfieldNodes.playfieldRoot.computeWorldMatrix(true)`
// (which carries applyPitch(), create-engine.ts:283) into world space,
// exactly as test/scene-smoke.test.ts's own vis_playfield check does for a
// real glb mesh.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Matrix } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { toScene } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { readCollisionDoc } from './util/collision-doc';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's own header
}

/**
 * MIN_LEGIBLE_NDC_SPAN (AD-15's do-not-invent discipline applied to a test
 * constant, test/asset-contract.test.ts:373-390's own convention): 0.04 --
 * 4% of the viewport's own NDC range in EITHER axis, i.e. at least ~20 px
 * of the authored 512x256 framing contract (fixed-camera.ts:37-50) in x, or
 * ~10 px in y. Chosen as "clearly more than a handful of pixels, clearly
 * less than any single one of these named features actually measures" --
 * every feature below in fact spans several times this once measured (see
 * this file's own console output on a failing run). Confirmed by
 * test/scene-smoke.test.ts:338-353's own precedent finding: "in-viewport
 * alone" left every corner assertion green while the camera framed
 * everything as a dot from behind the far edge -- the reason a SPAN clause,
 * not merely a bounds clause, exists at all.
 */
const MIN_LEGIBLE_NDC_SPAN = 0.04;

interface BBoxMm {
	readonly min: { readonly x: number; readonly y: number; readonly z: number };
	readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

function corners(bbox: BBoxMm): Array<{ x: number; y: number; z: number }> {
	const { min, max } = bbox;
	const pts: Array<{ x: number; y: number; z: number }> = [];
	for (const x of [min.x, max.x]) {
		for (const y of [min.y, max.y]) {
			for (const z of [min.z, max.z]) {
				pts.push({ x, y, z });
			}
		}
	}
	return pts;
}

function projectMm(mm: { x: number; y: number; z: number }, playfieldRoot: TransformNode, viewProj: Matrix): Vector3 {
	const local = toScene(mm);
	const localVec = new Vector3(local.x, local.y, local.z);
	const world = Vector3.TransformCoordinates(localVec, playfieldRoot.computeWorldMatrix(true));
	return Vector3.TransformCoordinates(world, viewProj);
}

interface NamedFeature {
	readonly name: string;
	readonly nodeNames: readonly string[];
}

const FEATURES: readonly NamedFeature[] = [
	{ name: 'Left flipper', nodeNames: ['col_flipper_l'] },
	{ name: 'Right flipper', nodeNames: ['col_flipper_r'] },
	{ name: 'Dragon', nodeNames: ['col_dragon_leg_l', 'col_dragon_leg_r'] },
	{ name: 'Left Loop', nodeNames: ['col_loop_l_funnel', 'col_loop_l'] },
	{ name: 'Right Loop', nodeNames: ['col_loop_r_funnel', 'col_loop_r'] },
	{ name: 'Ramp', nodeNames: ['col_ramp_wall_l', 'col_ramp_wall_r'] },
	{ name: 'DRAGON bank', nodeNames: ['col_dragon_d', 'col_dragon_r', 'col_dragon_a', 'col_dragon_g', 'col_dragon_o', 'col_dragon_n'] },
];

describe('shot map legibility from the fixed camera (AC 8, task 26a)', () => {
	it('every named feature\'s bbox corners land inside NDC [-1, 1], each spans at least MIN_LEGIBLE_NDC_SPAN, and the vertical ordering matches the table layout (drain end below the far end)', async () => {
		const engine = new NullEngine();
		try {
			const bytes = readFileSync(GLB_PATH);
			const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(bytes), { pluginExtension: '.glb' });
			try {
				const camera = scene.activeCamera;
				expect(camera, 'the authored fixed camera must be the scene\'s active camera -- read, never written, never imported from createFixedCamera()').not.toBeNull();
				const viewProj = camera!.getViewMatrix().multiply(camera!.getProjectionMatrix(true));

				const doc = readCollisionDoc();

				for (const feature of FEATURES) {
					const nodes = feature.nodeNames.map((name) => {
						const node = doc.nodes.find((n) => n.name === name);
						expect(node, `${feature.name}: node "${name}" missing from the committed collision document`).toBeDefined();
						return node!;
					});

					let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
					for (const node of nodes) {
						// QA gap closed (lead's AD gate, 2026-09-02): the ORIGINAL span
						// clause measured only the UNION of every node's corners, which
						// is unfalsifiable for a multi-node feature -- verified
						// empirically (probe run, reverted before commit): shrinking all
						// six DRAGON-bank targets to 0.1 mm points, still spread across
						// the bank's own width, moved the union span only 0.0530/0.0519
						// -> 0.0459/0.0444 (each individual shrunk node's OWN span
						// measured ~0.00007/0.00018) and the union stayed comfortably
						// above MIN_LEGIBLE_NDC_SPAN -- a bank rendered as six dots would
						// have passed. So EACH node composing a multi-node feature must
						// independently clear MIN_LEGIBLE_NDC_SPAN too, not just their
						// union -- confirmed this catches the shrink (a shrunk node's own
						// span of ~0.0002 fails it outright) while every REAL node here
						// measures far above it already (DRAGON-bank targets: 0.0519;
						// loop funnels: 0.132; ramp walls: 0.396; dragon legs: 0.191).
						let nodeMinX = Infinity, nodeMaxX = -Infinity, nodeMinY = Infinity, nodeMaxY = -Infinity;
						for (const cornerMm of corners(node.bboxMm)) {
							const ndc = projectMm(cornerMm, playfieldNodes.playfieldRoot, viewProj);
							expect(ndc.x, `${feature.name} (node "${node.name}") corner ${JSON.stringify(cornerMm)} projects outside the viewport on x (${ndc.x.toFixed(4)})`).toBeGreaterThanOrEqual(-1);
							expect(ndc.x, `${feature.name} (node "${node.name}") corner ${JSON.stringify(cornerMm)} projects outside the viewport on x (${ndc.x.toFixed(4)})`).toBeLessThanOrEqual(1);
							expect(ndc.y, `${feature.name} (node "${node.name}") corner ${JSON.stringify(cornerMm)} projects outside the viewport on y (${ndc.y.toFixed(4)})`).toBeGreaterThanOrEqual(-1);
							expect(ndc.y, `${feature.name} (node "${node.name}") corner ${JSON.stringify(cornerMm)} projects outside the viewport on y (${ndc.y.toFixed(4)})`).toBeLessThanOrEqual(1);
							nodeMinX = Math.min(nodeMinX, ndc.x);
							nodeMaxX = Math.max(nodeMaxX, ndc.x);
							nodeMinY = Math.min(nodeMinY, ndc.y);
							nodeMaxY = Math.max(nodeMaxY, ndc.y);
							minX = Math.min(minX, ndc.x);
							maxX = Math.max(maxX, ndc.x);
							minY = Math.min(minY, ndc.y);
							maxY = Math.max(maxY, ndc.y);
						}
						const nodeSpanX = nodeMaxX - nodeMinX;
						const nodeSpanY = nodeMaxY - nodeMinY;
						const nodeMaxSpan = Math.max(nodeSpanX, nodeSpanY);
						expect(
							nodeMaxSpan,
							`${feature.name} (node "${node.name}"): this SINGLE node's own projected span (x=${nodeSpanX.toFixed(4)}, y=${nodeSpanY.toFixed(4)}) must reach at least MIN_LEGIBLE_NDC_SPAN (${MIN_LEGIBLE_NDC_SPAN}) on at least one axis, or this body renders as a dot even if the feature's union span looks larger`,
						).toBeGreaterThanOrEqual(MIN_LEGIBLE_NDC_SPAN);
					}

					const spanX = maxX - minX;
					const spanY = maxY - minY;
					const maxSpan = Math.max(spanX, spanY);
					// eslint-disable-next-line no-console
					console.log(`[shot-map-legibility] ${feature.name}: NDC span x=${spanX.toFixed(4)} y=${spanY.toFixed(4)}`);
					expect(
						maxSpan,
						`${feature.name}: projected span (x=${spanX.toFixed(4)}, y=${spanY.toFixed(4)}) must reach at least MIN_LEGIBLE_NDC_SPAN (${MIN_LEGIBLE_NDC_SPAN}) on at least one axis, or it renders as a dot`,
					).toBeGreaterThanOrEqual(MIN_LEGIBLE_NDC_SPAN);
				}

				// Vertical ordering: the drain end (table y = 0) must project
				// BELOW the far end (table y = playfieldMm.h) -- the same clause
				// test/scene-smoke.test.ts:338-353 already proves for
				// vis_playfield's own bbox; this asserts the SAME thing is true
				// of the coordinate space every feature above was just measured
				// in, so a camera that happened to frame every feature's corners
				// correctly while still facing the wrong way cannot pass silently.
				const { w: playfieldWMm, h: playfieldHMm } = TABLE.reference.playfieldMm;
				const drainNdc = projectMm({ x: playfieldWMm / 2, y: 0, z: 0 }, playfieldNodes.playfieldRoot, viewProj);
				const farNdc = projectMm({ x: playfieldWMm / 2, y: playfieldHMm, z: 0 }, playfieldNodes.playfieldRoot, viewProj);
				expect(
					drainNdc.y,
					`the drain end (table y = 0) must render BELOW the far end (drain ndc.y ${drainNdc.y.toFixed(4)}, far ndc.y ${farNdc.y.toFixed(4)})`,
				).toBeLessThan(farNdc.y);
			} finally {
				scene.dispose();
			}
		} finally {
			engine.dispose();
		}
	});
});
