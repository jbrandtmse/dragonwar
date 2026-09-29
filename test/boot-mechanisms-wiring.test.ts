// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.0a (DW-279), QA -- DW-293: `src/host/boot.ts`'s per-frame wiring of
// the mechanism twins had no automated test. Deleting the `syncMechanisms()`
// call from the render hook, or moving the eager `resolveMechanismNodes()`
// below the `latestSnapshot` guard, left the whole suite green; only the
// lead's AC 4 browser check (hold the left flipper, watch `vis_flipper_l`'s
// region change) would have caught it.
//
// `boot.ts` itself cannot be imported here: it reads `document` at module
// load and needs a WebGL2 context (the `test/module-coverage.test.ts`
// allowlist). So this file pins the wiring in two halves:
//
//   1. Source scan (the `test/entry-html-csp.test.ts` /
//      `test/host-game-seed.test.ts` precedent), with comments stripped so a
//      commented-out call does not pass: inside the `bootScene(...)` render
//      hook, `resolveMechanismNodes(scene, nodes.playfieldRoot)` runs BEFORE
//      the `if (!latestSnapshot)` guard, `syncMechanisms(scene,
//      nodes.playfieldRoot, latestSnapshot)` runs AFTER it, and the hook
//      captures `liveScene` for the `nodeScreenRect` hatch.
//   2. Behaviour of the contract that ordering relies on, through the SAME
//      `loadAndRenderOnce()` `bootScene()` delegates to (reached via
//      `loadAndRenderOnceForTests`, NullEngine + the committed glb): a hook
//      shaped like boot's, on a glb whose `vis_flipper_l` is missing, makes
//      the first-frame promise reject naming the node (the I/O matrix's
//      "Missing twin" row: "the host error panel shows it" -- boot's catch
//      turns that rejection into `showError()`). The negative control proves
//      the ordering is load-bearing: the same hook with the resolve moved
//      below the guard boots "successfully" over the broken glb, because no
//      snapshot exists on the first frame.
//
// What this cannot prove: that the browser render loop actually runs the
// hook (the lead's AC 4 flipper-hold check covers that, and
// `test/ball-render.test.ts` pins that `loadAndRenderOnce()` calls `onFrame`
// before each `scene.render()`).
//
// Falsifiability (Rule 19, recorded in the spec's Verification section):
// commenting out boot.ts's `syncMechanisms(...)` call reddens the sync case;
// moving `resolveMechanismNodes(...)` below the guard reddens the ordering
// case; deleting `liveScene = scene;` reddens the hatch case; making
// `requireMechanismMesh()` in sync-mechanisms.ts return nothing for a missing
// node reddens the first-frame rejection case.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { resolveMechanismNodes, syncMechanisms } from '../src/presentation/mechanisms/sync-mechanisms';
import { visTwinName } from '../src/presentation/scene/vis-names';
import { TABLE } from '../src/sim/table/dragonwar';
import type { Snapshot } from '../src/sim/table/names';

const BOOT_TS = path.resolve(__dirname, '..', 'src', 'host', 'boot.ts');
const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

const HOOK_OPEN = 'await bootScene(canvas, GLB_URL, (scene, nodes) => {';
const HOOK_CLOSE = '\n\t\t});';
const SNAPSHOT_GUARD = 'if (!latestSnapshot) {';
const RESOLVE_CALL = 'resolveMechanismNodes(scene, nodes.playfieldRoot);';
const SYNC_CALL = 'syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot);';
const LIVE_SCENE_CAPTURE = 'liveScene = scene;';

/** boot.ts with every block comment and every whole-line `//` comment removed, so a commented-out call is not mistaken for a live one. */
function bootSourceWithoutComments(): string {
	return readFileSync(BOOT_TS, 'utf8')
		.replace(/\r\n/g, '\n')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n');
}

/** The render hook passed to `bootScene()`: its body text, located from the call's own opening line to the hook's closing `});`. */
function renderHookBody(source: string): string {
	const open = source.indexOf(HOOK_OPEN);
	expect(open, `boot.ts must pass a render hook to bootScene(): "${HOOK_OPEN}"`).toBeGreaterThan(-1);
	expect(source.indexOf(HOOK_OPEN, open + 1), 'boot.ts must call bootScene() with a render hook exactly once').toBe(-1);
	const close = source.indexOf(HOOK_CLOSE, open);
	expect(close, 'the bootScene() render hook must close with "});" at its own indentation').toBeGreaterThan(open);
	return source.slice(open + HOOK_OPEN.length, close);
}

function occurrences(haystack: string, needle: string): number {
	let count = 0;
	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
		count += 1;
	}
	return count;
}

describe('DW-293 -- src/host/boot.ts (source scan): the render hook resolves and syncs the mechanism twins', () => {
	it('imports both calls from presentation/mechanisms/sync-mechanisms', () => {
		expect(bootSourceWithoutComments()).toMatch(
			/import\s*\{\s*resolveMechanismNodes\s*,\s*syncMechanisms\s*\}\s*from\s*'\.\.\/presentation\/mechanisms\/sync-mechanisms'/,
		);
	});

	it('resolveMechanismNodes(scene, nodes.playfieldRoot) runs inside the hook BEFORE the latestSnapshot guard (a missing twin fails the first frame, into the error panel)', () => {
		const hook = renderHookBody(bootSourceWithoutComments());
		const resolveAt = hook.indexOf(RESOLVE_CALL);
		const guardAt = hook.indexOf(SNAPSHOT_GUARD);
		expect(guardAt, `the hook must keep its "${SNAPSHOT_GUARD}" guard`).toBeGreaterThan(-1);
		expect(resolveAt, `the hook must call "${RESOLVE_CALL}"`).toBeGreaterThan(-1);
		expect(occurrences(hook, RESOLVE_CALL), 'exactly one eager resolve per frame').toBe(1);
		expect(
			resolveAt,
			'resolveMechanismNodes() must run BEFORE the latestSnapshot guard: below it, no snapshot exists on the first frame, so a glb missing a twin boots "successfully" and later throws as an uncaught render-loop error instead of reaching the error panel',
		).toBeLessThan(guardAt);
	});

	it('syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot) runs inside the hook AFTER the latestSnapshot guard, every frame', () => {
		const hook = renderHookBody(bootSourceWithoutComments());
		const guardAt = hook.indexOf(SNAPSHOT_GUARD);
		const syncAt = hook.indexOf(SYNC_CALL);
		expect(syncAt, `the render hook must call "${SYNC_CALL}" -- without it the flipper, drop-target and plunger twins never move`).toBeGreaterThan(-1);
		expect(occurrences(hook, SYNC_CALL), 'exactly one syncMechanisms() call per frame').toBe(1);
		expect(syncAt, 'syncMechanisms() needs the snapshot, so it must run after the guard').toBeGreaterThan(guardAt);
		// The guard's own body is only the early return -- the sync is not
		// hidden inside it.
		const guardBody = hook.slice(guardAt + SNAPSHOT_GUARD.length, hook.indexOf('}', guardAt));
		expect(guardBody.trim()).toBe('return;');
	});

	it('the hook captures liveScene, and the nodeScreenRect hatch projects through it', () => {
		const source = bootSourceWithoutComments();
		const hook = renderHookBody(source);
		expect(hook.indexOf(LIVE_SCENE_CAPTURE), `the render hook must capture "${LIVE_SCENE_CAPTURE}" for window.__dragonwarBoot.nodeScreenRect`).toBeGreaterThan(-1);
		const hatchAt = source.indexOf('nodeScreenRect: (name: string): ScreenRect => {');
		expect(hatchAt, 'window.__dragonwarBoot.nodeScreenRect must exist').toBeGreaterThan(-1);
		const hatchEnd = source.indexOf('\n\t\t\t},', hatchAt);
		expect(hatchEnd, 'the nodeScreenRect hatch must close with "}," at its own indentation, or the slice below would scan the rest of the file').toBeGreaterThan(hatchAt);
		expect(source.slice(hatchAt, hatchEnd)).toContain('return nodeScreenRect(liveScene, name);');
	});
});

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

/** Renames one glTF node in the committed glb's JSON chunk, BIN chunk byte-identical (`test/scene-smoke.test.ts`'s own helper, restated). */
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
	jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
	const header = Buffer.alloc(12);
	header.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(12 + 8 + paddedJson.length + binChunkAndHeader.length, 8);
	return Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkAndHeader]);
}

type RenderHook = Parameters<typeof loadAndRenderOnceForTests>[3];

/**
 * boot.ts's render hook, restated with only the mechanism lines: an eager
 * resolve, the snapshot guard, then the sync. `resolveFirst: false` is the
 * DW-293 regression (resolve moved below the guard). No snapshot ever
 * arrives, exactly as on boot's first frame (the host loop has not produced
 * one yet).
 */
function bootShapedHook(resolveFirst: boolean): RenderHook {
	const latestSnapshot: Snapshot | undefined = undefined as Snapshot | undefined;
	return (scene, nodes) => {
		if (resolveFirst) {
			resolveMechanismNodes(scene, nodes.playfieldRoot);
		}
		if (!latestSnapshot) {
			return;
		}
		if (!resolveFirst) {
			resolveMechanismNodes(scene, nodes.playfieldRoot);
		}
		syncMechanisms(scene, nodes.playfieldRoot, latestSnapshot);
	};
}

async function bootWith(glb: Buffer, hook: RenderHook): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(glb), { pluginExtension: '.glb' }, hook);
		scene.dispose();
	} finally {
		engine.dispose();
	}
}

describe('DW-293 -- the first-frame contract boot.ts\'s hook ordering relies on (NullEngine + committed glb, the same loadAndRenderOnce() bootScene() uses)', () => {
	const missingName = visTwinName(TABLE.nodes.colFlipperL);

	it('with the committed glb, the boot-shaped hook (resolve before the guard) boots cleanly -- the positive control', async () => {
		await expect(bootWith(readFileSync(GLB_PATH), bootShapedHook(true))).resolves.toBeUndefined();
	});

	it('Missing twin: with vis_flipper_l renamed out of the glb, the boot-shaped hook rejects the first-frame promise naming vis_flipper_l (what boot.ts shows in its error panel)', async () => {
		const broken = renameGlbNode(readFileSync(GLB_PATH), missingName, 'vis_flipper_gone');
		await expect(bootWith(broken, bootShapedHook(true))).rejects.toThrow(new RegExp(missingName));
	});

	it('negative control: with the resolve moved below the guard, the same broken glb boots WITHOUT error on the first frame -- the ordering the source scan pins is load-bearing', async () => {
		const broken = renameGlbNode(readFileSync(GLB_PATH), missingName, 'vis_flipper_gone');
		await expect(bootWith(broken, bootShapedHook(false))).resolves.toBeUndefined();
	});
});
