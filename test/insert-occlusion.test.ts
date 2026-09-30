// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.2 task 12 (the lead's smoke, 2026-09-30) -- no art part hides an
// insert lens from the fixed camera. The lead's AC 2 (d) browser check found
// `l_inlane_l` almost wholly hidden (12 of 462 px changed on/off) behind
// `vis_guide_inlane_feed_l` -- 5.4's 48 mm art wall ~10 mm down-table of the
// lens -- and `l_inlane_r` partly hidden behind its mirror. Nothing headless
// looked from the camera, so every mask, tint and emissive pin stayed green
// while a player could not see the insert.
//
// The check, on the REAL shipped scene path (`loadAndRenderOnceForTests()`
// on a NullEngine: the committed glb, the authored fixed camera, the
// reference pitch applied): for every `l_` lens node the glb carries -- read
// from the loaded scene, never a list or a count, so an insert Epic 3 adds
// later (Story 3.3c) is covered on arrival -- cast a ray from the camera to
// the centre of the lens's top face and to four inset corners (half-way to
// each corner: the central 50 % the lead's browser check samples). The ray
// must reach the lens before any `vis_` mesh. `vis_playfield` is exempt: it
// is the translucent deck the lens sits under, and its mask opening is what
// test/playfield-art.test.ts pins.
//
// The checker is a function of the scene, so it carries its own
// positive/negative pair: the shipped scene reports nothing; the same scene
// with a synthetic tall `vis_` box stood on the camera ray just down-table of
// one lens reports that lens, naming the box.
//
// mutation (Rule 19, the spec's Verification): the pre-task-12 feed guides
// (ART_GUIDE_BODY_TOP_MM / ART_GUIDE_TOP_MM 44 / 48 on
// vis_guide_inlane_feed_l/_r) -> the shipped-scene case red, naming
// l_inlane_l behind vis_guide_inlane_feed_l.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { TABLE } from '../src/sim/table/dragonwar';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');
/** The deck the lenses sit under -- translucent over each lens by its mask (test/playfield-art.test.ts). */
const DECK_NODE_NAME = 'vis_playfield';
/** A hit this close in front of the lens point (scene metres, 0.5 mm) is the lens's own neighbourhood, not an occluder. */
const DEPTH_EPSILON_M = 0.0005;
/** The inset corners sit this fraction of the way from the lens centre to each corner (the central 50 %). */
const CORNER_FRACTION = 0.5;

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's own header
}

interface Occlusion {
	readonly lens: string;
	readonly point: string;
	readonly occluder: string;
	readonly hitM: number;
	readonly lensM: number;
}

function isLens(mesh: AbstractMesh): boolean {
	return mesh.name.startsWith('l_') && mesh.getTotalVertices() > 0;
}

function isOccluderCandidate(mesh: AbstractMesh): boolean {
	return mesh.name.startsWith('vis_') && mesh.name !== DECK_NODE_NAME && !mesh.name.startsWith(`${DECK_NODE_NAME}_`) && mesh.getTotalVertices() > 0 && mesh.isEnabled() && mesh.isVisible;
}

/**
 * The five sample points of `lens`'s top face in world space: the lens's own
 * vertices at its highest local y (glTF Y-up is table +z; the l_ mesh carries
 * the lens and its cup, and only the lens reaches the top), their x/z extent,
 * the centre and four corners CORNER_FRACTION of the way out.
 */
function lensTopPoints(lens: AbstractMesh): Array<{ label: string; world: Vector3 }> {
	const positions = lens.getVerticesData(VertexBuffer.PositionKind);
	if (!positions || positions.length === 0) {
		throw new Error(`${lens.name}: no vertex positions`);
	}
	let topY = -Infinity;
	for (let i = 1; i < positions.length; i += 3) {
		topY = Math.max(topY, positions[i]!);
	}
	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for (let i = 0; i < positions.length; i += 3) {
		if (Math.abs(positions[i + 1]! - topY) > 1e-6) {
			continue;
		}
		minX = Math.min(minX, positions[i]!);
		maxX = Math.max(maxX, positions[i]!);
		minZ = Math.min(minZ, positions[i + 2]!);
		maxZ = Math.max(maxZ, positions[i + 2]!);
	}
	const cx = (minX + maxX) / 2;
	const cz = (minZ + maxZ) / 2;
	const hx = ((maxX - minX) / 2) * CORNER_FRACTION;
	const hz = ((maxZ - minZ) / 2) * CORNER_FRACTION;
	const world = lens.computeWorldMatrix(true);
	const local: Array<[string, number, number]> = [
		['centre', cx, cz],
		['corner -x -z', cx - hx, cz - hz],
		['corner +x -z', cx + hx, cz - hz],
		['corner +x +z', cx + hx, cz + hz],
		['corner -x +z', cx - hx, cz + hz],
	];
	return local.map(([label, x, z]) => ({ label, world: Vector3.TransformCoordinates(new Vector3(x, topY, z), world) }));
}

/**
 * Every (lens, sample point) whose camera ray meets a `vis_` mesh before the
 * lens, with the nearest such mesh. Picking is the scene's own
 * `multiPickWithRay()` (world-space ray, each mesh's world matrix -- the
 * applied pitch included -- handled by Babylon), triangle-exact.
 */
function lensOcclusions(scene: Scene): { lenses: string[]; occlusions: Occlusion[] } {
	const camera = scene.activeCamera;
	if (!camera) {
		throw new Error('no active camera');
	}
	camera.computeWorldMatrix();
	const eye = camera.globalPosition.clone();
	const lenses = scene.meshes.filter(isLens);
	for (const mesh of scene.meshes) {
		mesh.computeWorldMatrix(true);
	}
	const occlusions: Occlusion[] = [];
	for (const lens of lenses) {
		for (const { label, world } of lensTopPoints(lens)) {
			const toPoint = world.subtract(eye);
			const lensM = toPoint.length();
			const ray = new Ray(eye, toPoint.scale(1 / lensM), lensM);
			const hits = (scene.multiPickWithRay(ray, isOccluderCandidate) ?? []).filter((pick) => pick.hit && pick.pickedMesh !== null && pick.distance < lensM - DEPTH_EPSILON_M);
			if (hits.length > 0) {
				const nearest = hits.reduce((a, b) => (b.distance < a.distance ? b : a));
				occlusions.push({ lens: lens.name, point: label, occluder: nearest.pickedMesh!.name, hitM: nearest.distance, lensM });
			}
		}
	}
	return { lenses: lenses.map((m) => m.name).sort(), occlusions };
}

function describeOcclusions(occlusions: readonly Occlusion[]): string {
	return occlusions.map((o) => `${o.lens} ${o.point} behind ${o.occluder} (hit ${(o.hitM * 1000).toFixed(1)} mm, lens ${(o.lensM * 1000).toFixed(1)} mm from the camera)`).join('; ');
}

async function withShippedScene(body: (scene: Scene) => void): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(readFileSync(GLB_PATH)), { pluginExtension: '.glb' });
		try {
			body(scene);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

describe('Story 5.2 task 12 -- every insert lens is visible from the fixed camera', () => {
	it('on the shipped scene, the camera ray to each l_ lens\'s centre and four inset corners reaches the lens before any vis_ mesh', async () => {
		await withShippedScene((scene) => {
			const { lenses, occlusions } = lensOcclusions(scene);
			expect(lenses.length, 'non-vacuity: the loaded scene carries l_ lenses').toBeGreaterThan(0);
			expect(lenses, 'the lens set is TABLE.lamps\' own (read from the scene, cross-checked here)').toEqual(Object.keys(TABLE.lamps).sort());
			expect(scene.meshes.filter(isOccluderCandidate).length, 'non-vacuity: vis_ art parts are candidates').toBeGreaterThan(80);
			expect(occlusions, describeOcclusions(occlusions)).toEqual([]);
		});
	});

	it('the checker is falsifiable: a synthetic tall vis_ box on the camera ray just down-table of one lens is reported, naming that lens and the box', async () => {
		await withShippedScene((scene) => {
			const { lenses } = lensOcclusions(scene);
			const target = [...lenses].sort()[0]!;
			const lens = scene.meshes.find((m) => m.name === target)!;
			const centre = lensTopPoints(lens)[0]!.world;
			const eye = scene.activeCamera!.globalPosition;
			// A 60 mm cube a quarter of the way from the lens back toward the
			// camera along the centre ray -- tall, in front, and clear of the lens.
			const onRay = Vector3.Lerp(centre, eye, 0.25);
			const box = CreateBox('vis_synthetic_occluder', { size: 0.06 }, scene);
			box.material = scene.getMaterialByName('mat_art_guide'); // a real art material, so the pick is triangle-exact like every shipped part
			expect(box.material, 'mat_art_guide is in the scene').not.toBeNull();
			box.position.copyFrom(onRay);
			box.computeWorldMatrix(true);
			const { occlusions } = lensOcclusions(scene);
			const blocked = occlusions.filter((o) => o.occluder === 'vis_synthetic_occluder');
			expect(blocked.length, 'non-vacuity: the synthetic box blocks at least the centre ray').toBeGreaterThan(0);
			expect([...new Set(blocked.map((o) => o.lens))], describeOcclusions(blocked)).toContain(target);
			expect(blocked.find((o) => o.lens === target && o.point === 'centre'), `${target}'s centre ray is blocked by the box`).toBeDefined();
		});
	});
});
