// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 AC 8 (Integration AC) -- `src/host/boot.ts` wires the cabinet
// and the architectural lamps into the render hook, and exposes the two dev
// hatches the lead's browser check uses.
//
// `boot.ts` itself cannot be imported here: it reads `document` at module
// load and needs a WebGL2 context (the `test/module-coverage.test.ts`
// allowlist). So, like `test/boot-mechanisms-wiring.test.ts`, this file pins
// the wiring in two halves:
//
//   1. Source scan, with comments stripped so a commented-out call does not
//      pass: inside the `bootScene(...)` render hook,
//      `resolveCabinet(scene, nodes.cabinetRoot);` and
//      `resolveArchitecturalLamps(scene);` each occur once, BEFORE the
//      `if (!latestSnapshot)` guard; both hatches are typed on
//      `window.__dragonwarBoot` and implemented in the hatch object; each
//      refuses to run before a scene exists, validates before it acts, and
//      acts on `liveScene`; and `reset()` restores neither.
//   2. Behaviour of the contract that ordering relies on, through the SAME
//      `loadAndRenderOnce()` `bootScene()` delegates to (NullEngine + the
//      committed glb): a hook shaped like boot's makes the first-frame
//      promise reject naming `vis_top_glass` when that node is renamed out
//      of the glb, and naming the channel when a lamp Empty is -- the
//      rejection boot's catch turns into the error panel (AD-17). The
//      negative control proves the ordering is load-bearing: with the
//      resolves below the guard the same broken glb boots "successfully".
//      And the hatches' bodies, restated word for word (the source scan pins
//      the real text to the same words), are run against a real scene for
//      the hatch rows of the I/O matrix.
//
// What this cannot prove: that the browser render loop runs the hook, or
// that a hatch changes a pixel -- both are the lead's browser check.
//
// Falsifiability (Rule 19; observed red, recorded in the spec's
// Verification section):
//   mutation: move resolveCabinet(...) below the snapshot guard in boot.ts
//     -> the ordering case red.
// Each scanner is a function of the source text, and runs against mutated
// copies of the real boot.ts as its own negative controls.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { getRequiredNode } from '../src/presentation/scene/playfield';
import { resolveCabinet, TOP_GLASS_ALPHA, TRANSLITE_ALPHA } from '../src/presentation/scene/cabinet';
import { setNodeVisible } from '../src/presentation/scene/node-visibility';
import { resolveMechanismNodes } from '../src/presentation/mechanisms/sync-mechanisms';
import { ARCHITECTURAL_DEFAULT_LEVEL, architecturalLevel, architecturalLevelProblem, resolveArchitecturalLamps, setArchitecturalLevel } from '../src/presentation/lighting/architectural';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GiChannel, Snapshot } from '../src/sim/table/names';

const BOOT_TS = path.resolve(__dirname, '..', 'src', 'host', 'boot.ts');
const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

const HOOK_OPEN = 'await bootScene(canvas, GLB_URL, (scene, nodes) => {';
const HOOK_CLOSE = '\n\t\t});';
const SNAPSHOT_GUARD = 'if (!latestSnapshot) {';
const RESOLVE_MECHANISMS = 'resolveMechanismNodes(scene, nodes.playfieldRoot);';
const RESOLVE_CABINET = 'resolveCabinet(scene, nodes.cabinetRoot);';
const RESOLVE_LAMPS = 'resolveArchitecturalLamps(scene);';
const HATCH_CLOSE = '\n\t\t\t},';
const RESET_SEAM_OPEN = 'reset: (resetOptions?: ResetOptions): void => {';

const LEVEL_TYPE = 'setArchitecturalLevel: (channel: GiChannel, level: number | null) => void;';
const VISIBLE_TYPE = 'setNodeVisible: (name: string, visible: boolean) => void;';
const LEVEL_HATCH_OPEN = 'setArchitecturalLevel: (channel: GiChannel, level: number | null) => {';
const VISIBLE_HATCH_OPEN = 'setNodeVisible: (name: string, visible: boolean) => {';
/** The two hatch bodies, whitespace-collapsed -- the words the restated hatches below repeat. */
const LEVEL_HATCH_BODY = [
	'if (!liveScene) { throw new Error(\'[dragonwar] setArchitecturalLevel(): no scene has rendered yet\'); }',
	'const problem = architecturalLevelProblem(channel, level);',
	'if (problem !== null) { console.error(`[dragonwar] setArchitecturalLevel(): ${problem} -- ignored.`); return; }',
	'setArchitecturalLevel(liveScene, channel, level ?? ARCHITECTURAL_DEFAULT_LEVEL);',
].join(' ');
const VISIBLE_HATCH_BODY = [
	'if (!liveScene) { throw new Error(\'[dragonwar] setNodeVisible(): no scene has rendered yet\'); }',
	'setNodeVisible(liveScene, name, visible);',
].join(' ');

/** boot.ts with every whole-line `//` comment and every block comment removed (line comments first: `test/boot-mechanisms-wiring.test.ts`'s own order and reason). */
function stripComments(source: string): string {
	return source
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n')
		.replace(/\/\*[\s\S]*?\*\//g, '');
}

function bootSource(): string {
	return stripComments(readFileSync(BOOT_TS, 'utf8'));
}

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

function occurrences(haystack: string, needle: string): number {
	let count = 0;
	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
		count += 1;
	}
	return count;
}

/** The text between the ONE occurrence of `open` after `from` and the next `close`; fails if either is missing or `open` repeats. */
function block(source: string, open: string, close: string, what: string, from = 0): string {
	const at = source.indexOf(open, from);
	expect(at, `boot.ts must contain ${what}: "${open}"`).toBeGreaterThan(-1);
	expect(source.indexOf(open, at + 1), `boot.ts must contain ${what} exactly once`).toBe(-1);
	const end = source.indexOf(close, at);
	expect(end, `${what} must close at its own indentation`).toBeGreaterThan(at);
	return source.slice(at + open.length, end);
}

// ---------------------------------------------------------------------------
// The checks, as functions of the source text, so the negative controls can
// run them against a mutated copy.
// ---------------------------------------------------------------------------

function checkHookResolvesBeforeGuard(source: string): void {
	const hook = block(source, HOOK_OPEN, HOOK_CLOSE, 'the bootScene() render hook');
	const guardAt = hook.indexOf(SNAPSHOT_GUARD);
	expect(guardAt, `the hook must keep its "${SNAPSHOT_GUARD}" guard`).toBeGreaterThan(-1);
	expect(hook.slice(guardAt + SNAPSHOT_GUARD.length, hook.indexOf('}', guardAt)).trim(), 'the guard\'s body is only the early return').toBe('return;');
	for (const call of [RESOLVE_CABINET, RESOLVE_LAMPS]) {
		expect(occurrences(source, call), `"${call}" occurs exactly once in boot.ts`).toBe(1);
		const at = hook.indexOf(call);
		expect(at, `the render hook must call "${call}"`).toBeGreaterThan(-1);
		expect(
			at,
			`"${call}" must run BEFORE the latestSnapshot guard: below it, no snapshot exists on the first frame, so a glb missing a cabinet mesh or a lamp Empty boots "successfully" instead of reaching the error panel`,
		).toBeLessThan(guardAt);
	}
	// They sit after the mechanism resolve, as plain statements of the hook.
	const mechanismsAt = hook.indexOf(RESOLVE_MECHANISMS);
	expect(mechanismsAt, 'the mechanism resolve is still in the hook').toBeGreaterThan(-1);
	expect(hook.indexOf(RESOLVE_CABINET), 'the cabinet resolve follows the mechanism resolve').toBeGreaterThan(mechanismsAt);
	expect(squash(hook.slice(hook.indexOf(RESOLVE_CABINET), guardAt)), 'nothing but the two resolves stands between the cabinet resolve and the guard').toBe(`${RESOLVE_CABINET} ${RESOLVE_LAMPS}`);
}

function checkHatchesTyped(source: string): void {
	const declared = block(source, 'declare global {', '\n}', 'the declare global block');
	expect(occurrences(declared, LEVEL_TYPE), `the type block declares "${LEVEL_TYPE}" once`).toBe(1);
	expect(occurrences(declared, VISIBLE_TYPE), `the type block declares "${VISIBLE_TYPE}" once`).toBe(1);
}

function checkLevelHatch(source: string): void {
	const body = squash(block(source, LEVEL_HATCH_OPEN, HATCH_CLOSE, 'the setArchitecturalLevel() hatch'));
	expect(body, 'the hatch refuses to run before a scene exists, validates, logs and ignores a bad call, then acts on liveScene').toBe(LEVEL_HATCH_BODY);
	// Order, stated on its own so a reordering fails with a readable message.
	const sceneCheck = body.indexOf('if (!liveScene)');
	const validate = body.indexOf('architecturalLevelProblem(channel, level)');
	const act = body.indexOf('setArchitecturalLevel(liveScene,');
	expect(sceneCheck, 'the scene check comes first').toBe(0);
	expect(validate, 'validation precedes the act').toBeGreaterThan(sceneCheck);
	expect(act, 'the act comes after validation').toBeGreaterThan(validate);
	expect(occurrences(body, 'setArchitecturalLevel(liveScene,'), 'one act').toBe(1);
}

function checkVisibleHatch(source: string): void {
	const body = squash(block(source, VISIBLE_HATCH_OPEN, HATCH_CLOSE, 'the setNodeVisible() hatch'));
	expect(body, 'the hatch refuses to run before a scene exists, then hands the name to setNodeVisible() (which throws naming a bad node before it changes anything) on liveScene').toBe(VISIBLE_HATCH_BODY);
}

function checkResetLeavesThemAlone(source: string): void {
	const seam = squash(block(source, RESET_SEAM_OPEN, HATCH_CLOSE, 'the hostLoopRef reset wrapper'));
	expect(seam.startsWith('liveHostLoop.reset(resetOptions);'), 'sanity: this is the host loop reset wrapper').toBe(true);
	for (const name of ['setArchitecturalLevel', 'setNodeVisible', 'resolveCabinet', 'resolveArchitecturalLamps', 'liveScene']) {
		expect(seam.includes(name), `reset() does not touch ${name}: a level and a hidden mesh are view state of the scene, not of the game loop`).toBe(false);
	}
	// Every mention of each seam in boot.ts is accounted for, so a second caller has nowhere to hide.
	expect(source.match(/\bsetArchitecturalLevel\b/g), 'setArchitecturalLevel: import, type, hatch key, its two messages, the one call').toHaveLength(6);
	expect(source.match(/\bsetArchitecturalLevel\(liveScene,/g), 'setArchitecturalLevel: one call').toHaveLength(1);
	expect(source.match(/\bsetNodeVisible\b/g), 'setNodeVisible: import, type, hatch key, its message, the one call').toHaveLength(5);
	expect(source.match(/\bsetNodeVisible\(liveScene,/g), 'setNodeVisible: one call').toHaveLength(1);
	expect(source.match(/\bresolveCabinet\b/g), 'resolveCabinet: import, call').toHaveLength(2);
	expect(source.match(/\bresolveArchitecturalLamps\b/g), 'resolveArchitecturalLamps: import, call').toHaveLength(2);
}

describe('Story 5.3 AC 8 -- src/host/boot.ts (source scan)', () => {
	it('imports the new functions in their own import statements, and no Babylon module (AD-1)', () => {
		const source = squash(bootSource());
		expect(source).toContain('import { resolveCabinet } from \'../presentation/scene/cabinet\';');
		expect(source).toContain('import { setNodeVisible } from \'../presentation/scene/node-visibility\';');
		const architectural = source.match(/import \{([^}]*)\} from '\.\.\/presentation\/lighting\/architectural';/);
		expect(architectural, 'boot.ts imports from lighting/architectural').not.toBeNull();
		expect(architectural![1]!.split(',').map((n) => n.trim()).sort()).toEqual(['ARCHITECTURAL_DEFAULT_LEVEL', 'architecturalLevelProblem', 'resolveArchitecturalLamps', 'setArchitecturalLevel']);
		expect(source, 'the mechanisms import statement is untouched').toContain('import { resolveMechanismNodes, syncMechanisms } from \'../presentation/mechanisms/sync-mechanisms\';');
		expect(source.includes('@babylonjs/'), 'host/boot.ts imports no Babylon module').toBe(false);
	});

	// mutation: move resolveCabinet(...) below the snapshot guard in boot.ts -> red here.
	it('resolveCabinet(scene, nodes.cabinetRoot) and resolveArchitecturalLamps(scene) each run once inside the render hook, BEFORE the latestSnapshot guard', () => {
		checkHookResolvesBeforeGuard(bootSource());
	});

	it('both hatches are typed on window.__dragonwarBoot', () => {
		checkHatchesTyped(bootSource());
	});

	it('the setArchitecturalLevel() hatch refuses to run before a scene exists, validates before it acts, and acts on liveScene', () => {
		checkLevelHatch(bootSource());
	});

	it('the setNodeVisible() hatch refuses to run before a scene exists, and acts on liveScene', () => {
		checkVisibleHatch(bootSource());
	});

	it('reset() restores neither: the reset seam names none of them, and each seam has no other caller', () => {
		checkResetLeavesThemAlone(bootSource());
	});
});

describe('Story 5.3 AC 8 -- negative controls: each scanner fails on a mutated copy of the real boot.ts', () => {
	const real = bootSource();
	const mutate = (from: string | RegExp, to: string): string => {
		const next = real.replace(from, to);
		expect(next, `precondition: the mutation ${String(from)} applies to the real source`).not.toBe(real);
		return next;
	};
	/** Moves one resolve call from above the guard to just below it. */
	const below = (call: string): string => mutate(`${call}\n`, '').replace(/(if \(!latestSnapshot\) \{\s*return;\s*\})/, `$1\n\t\t\t${call}`);

	it('the cabinet resolve moved below the guard fails the ordering check', () => {
		expect(() => checkHookResolvesBeforeGuard(below(RESOLVE_CABINET))).toThrow(/must run BEFORE the latestSnapshot guard/);
	});

	it('the lamp resolve moved below the guard fails the ordering check', () => {
		expect(() => checkHookResolvesBeforeGuard(below(RESOLVE_LAMPS))).toThrow(/must run BEFORE the latestSnapshot guard/);
	});

	it('a resolve deleted, or called twice, fails the ordering check', () => {
		expect(() => checkHookResolvesBeforeGuard(mutate(`${RESOLVE_LAMPS}\n`, ''))).toThrow(/occurs exactly once/);
		expect(() => checkHookResolvesBeforeGuard(mutate(RESOLVE_CABINET, `${RESOLVE_CABINET}\n\t\t\t${RESOLVE_CABINET}`))).toThrow(/occurs exactly once/);
	});

	it('a hatch missing from the type block fails the type check', () => {
		expect(() => checkHatchesTyped(mutate(LEVEL_TYPE, ''))).toThrow(/declares/);
		expect(() => checkHatchesTyped(mutate(VISIBLE_TYPE, ''))).toThrow(/declares/);
	});

	it('a level hatch that acts without validating, or on something other than liveScene, fails the hatch check', () => {
		expect(() => checkLevelHatch(mutate(/\n\t*const problem = architecturalLevelProblem\(channel, level\);/, '\n\t\t\t\tconst problem = null;'))).toThrow(/validates/);
		expect(() => checkLevelHatch(mutate('setArchitecturalLevel(liveScene, channel, level ?? ARCHITECTURAL_DEFAULT_LEVEL);', 'setArchitecturalLevel(scene, channel, level ?? ARCHITECTURAL_DEFAULT_LEVEL);'))).toThrow(/acts on liveScene/);
		expect(() => checkLevelHatch(mutate('[dragonwar] setArchitecturalLevel(): no scene has rendered yet', '[dragonwar] setArchitecturalLevel(): later'))).toThrow(/before a scene exists/);
	});

	it('a visibility hatch that skips the scene check fails the hatch check', () => {
		expect(() => checkVisibleHatch(mutate(/\n\t*if \(!liveScene\) \{\n\t*throw new Error\('\[dragonwar\] setNodeVisible\(\): no scene has rendered yet'\);\n\t*\}/, ''))).toThrow(/before a scene exists/);
	});

	it('a reset seam that restores a level fails the reset check', () => {
		expect(() => checkResetLeavesThemAlone(mutate('sequencesEnabled = true;\n\t\t\t},', 'sequencesEnabled = true;\n\t\t\t\tif (liveScene) { setArchitecturalLevel(liveScene, CHANNEL, 1); }\n\t\t\t},'))).toThrow(/reset\(\) does not touch/);
	});

	it('the real source passes every check (the positive control, restated beside the negatives)', () => {
		expect(() => {
			checkHookResolvesBeforeGuard(real);
			checkHatchesTyped(real);
			checkLevelHatch(real);
			checkVisibleHatch(real);
			checkResetLeavesThemAlone(real);
		}).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Behaviour, on the committed glb.
// ---------------------------------------------------------------------------

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's header
}

/** Renames one glTF node in the committed glb's JSON chunk, BIN chunk byte-identical (`test/boot-mechanisms-wiring.test.ts`'s own helper, restated). */
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
 * boot.ts's render hook, restated with only its first-frame resolves: the
 * mechanism resolve, then this story's two, then the snapshot guard.
 * `resolveFirst: false` is the regression (the resolves moved below the
 * guard). No snapshot ever arrives, exactly as on boot's first frame.
 */
function bootShapedHook(resolveFirst: boolean): RenderHook {
	const latestSnapshot: Snapshot | undefined = undefined as Snapshot | undefined;
	return (scene, nodes) => {
		if (resolveFirst) {
			resolveMechanismNodes(scene, nodes.playfieldRoot);
			resolveCabinet(scene, nodes.cabinetRoot);
			resolveArchitecturalLamps(scene);
		}
		if (!latestSnapshot) {
			return;
		}
		resolveMechanismNodes(scene, nodes.playfieldRoot);
		resolveCabinet(scene, nodes.cabinetRoot);
		resolveArchitecturalLamps(scene);
	};
}

async function bootWith(glb: Buffer, hook: RenderHook, body?: (scene: Scene) => void): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene } = await loadAndRenderOnceForTests(engine, glbDataUrl(glb), { pluginExtension: '.glb' }, hook);
		try {
			body?.(scene);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

describe('Story 5.3 AC 8 -- the first-frame contract boot.ts\'s hook ordering relies on (NullEngine + committed glb, the same loadAndRenderOnce() bootScene() uses)', () => {
	const channels = Object.keys(TABLE.giChannels) as GiChannel[];

	it('Boot with the shipped glb: the boot-shaped hook boots cleanly; after the first frame the cabinet is resolved, the glass and translite blend, and three lights exist at level 1', async () => {
		let lightsAtLoad = -1;
		const hook = bootShapedHook(true);
		const counting: RenderHook = (scene, nodes) => {
			if (lightsAtLoad < 0) {
				lightsAtLoad = scene.lights.length;
			}
			hook!(scene, nodes);
		};
		await bootWith(readFileSync(GLB_PATH), counting, (scene) => {
			expect(scene.lights.length - lightsAtLoad, 'the first frame added one light per channel, and later frames none').toBe(channels.length);
			expect(channels.map((channel) => architecturalLevel(scene, channel)), 'every channel at the default level').toEqual(channels.map(() => ARCHITECTURAL_DEFAULT_LEVEL));
			for (const [name, alpha] of [['vis_top_glass', TOP_GLASS_ALPHA], ['vis_head_translite', TRANSLITE_ALPHA]] as const) {
				const mesh = getRequiredNode(scene, name) as AbstractMesh;
				expect(mesh.material!.needAlphaBlendingForMesh(mesh), `${name}: alpha-blended by the first frame`).toBe(true);
				expect((mesh.material as PBRMaterial).alpha).toBe(alpha);
			}
		});
	});

	it('Cabinet mesh missing: with vis_top_glass renamed out of the glb, the first-frame promise rejects naming vis_top_glass (what boot.ts shows in its error panel)', async () => {
		const broken = renameGlbNode(readFileSync(GLB_PATH), 'vis_top_glass', 'vis_top_glass_gone');
		await expect(bootWith(broken, bootShapedHook(true))).rejects.toThrow(/"vis_top_glass"/);
	});

	it('Lamp Empty missing: with a lamp Empty renamed out of the glb, the first-frame promise rejects naming the channel\'s node', async () => {
		for (const channel of channels) {
			const broken = renameGlbNode(readFileSync(GLB_PATH), channel, `${channel}_gone`);
			await expect(bootWith(broken, bootShapedHook(true)), channel).rejects.toThrow(new RegExp(`"${channel}"`));
		}
	});

	it('negative control: with the resolves moved below the guard, the same broken glbs boot WITHOUT error on the first frame -- the ordering the source scan pins is load-bearing', async () => {
		await expect(bootWith(renameGlbNode(readFileSync(GLB_PATH), 'vis_top_glass', 'vis_top_glass_gone'), bootShapedHook(false))).resolves.toBeUndefined();
		await expect(bootWith(renameGlbNode(readFileSync(GLB_PATH), channels[2]!, 'lamp_gone'), bootShapedHook(false))).resolves.toBeUndefined();
	});
});

/**
 * The two hatches, restated word for word from boot.ts (`checkLevelHatch()`
 * and `checkVisibleHatch()` pin the real bodies to these same statements).
 */
function restatedHatches(scene: () => Scene | undefined): { setArchitecturalLevel: (channel: GiChannel, level: number | null) => void; setNodeVisible: (name: string, visible: boolean) => void } {
	return {
		setArchitecturalLevel: (channel: GiChannel, level: number | null) => {
			const liveScene = scene();
			if (!liveScene) {
				throw new Error('[dragonwar] setArchitecturalLevel(): no scene has rendered yet');
			}
			const problem = architecturalLevelProblem(channel, level);
			if (problem !== null) {
				// eslint-disable-next-line no-console
				console.error(`[dragonwar] setArchitecturalLevel(): ${problem} -- ignored.`);
				return;
			}
			setArchitecturalLevel(liveScene, channel, level ?? ARCHITECTURAL_DEFAULT_LEVEL);
		},
		setNodeVisible: (name: string, visible: boolean) => {
			const liveScene = scene();
			if (!liveScene) {
				throw new Error('[dragonwar] setNodeVisible(): no scene has rendered yet');
			}
			setNodeVisible(liveScene, name, visible);
		},
	};
}

describe('Story 5.3 AC 8 -- the dev hatches\' behaviour (their bodies restated, run on the committed glb)', () => {
	const channels = Object.keys(TABLE.giChannels) as GiChannel[];

	it('Hatch before a scene exists: either hatch throws "no scene has rendered yet"', () => {
		const hatches = restatedHatches(() => undefined);
		expect(() => hatches.setArchitecturalLevel(channels[0]!, 0)).toThrow(/no scene has rendered yet/);
		expect(() => hatches.setNodeVisible('vis_top_glass', false)).toThrow(/no scene has rendered yet/);
	});

	it('Level set, Hatch level null, Unknown channel and a bad level at the hatch', async () => {
		await bootWith(readFileSync(GLB_PATH), bootShapedHook(true), (scene) => {
			const hatches = restatedHatches(() => scene);
			const lamps = resolveArchitecturalLamps(scene);
			const state = (): string => JSON.stringify(channels.map((c) => [architecturalLevel(scene, c), lamps.get(c)!.intensity]));
			const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			try {
				const initial = state();
				hatches.setArchitecturalLevel(channels[0]!, 0);
				expect(architecturalLevel(scene, channels[0]!), 'Level set').toBe(0);
				expect(lamps.get(channels[0]!)!.intensity).toBe(0);
				hatches.setArchitecturalLevel(channels[0]!, null);
				expect(architecturalLevel(scene, channels[0]!), 'Hatch level null restores the default').toBe(ARCHITECTURAL_DEFAULT_LEVEL);
				expect(state(), 'back to the initial state').toBe(initial);
				expect(errors, 'no error logged for good calls').not.toHaveBeenCalled();

				// Unknown channel: nothing changes; a console error names the value.
				hatches.setArchitecturalLevel('gi_nope' as GiChannel, 1);
				expect(state(), 'Unknown channel: nothing changes').toBe(initial);
				expect(errors).toHaveBeenCalledTimes(1);
				expect(String(errors.mock.calls[0]![0])).toContain('"gi_nope"');

				// A bad level: logged, ignored -- the hatch does not throw.
				for (const bad of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
					expect(() => hatches.setArchitecturalLevel(channels[1]!, bad), `level ${bad}: the hatch logs instead of throwing`).not.toThrow();
					expect(state(), `level ${bad}: nothing changes`).toBe(initial);
				}
				expect(errors).toHaveBeenCalledTimes(5);
				expect(String(errors.mock.calls[4]![0]), 'the last error names the channel and the value').toMatch(new RegExp(`${channels[1]}: level Infinity `));
			} finally {
				errors.mockRestore();
			}
		});
	});

	it('Hide a mesh and Hide an unknown or mesh-less node, at the hatch', async () => {
		await bootWith(readFileSync(GLB_PATH), bootShapedHook(true), (scene) => {
			const hatches = restatedHatches(() => scene);
			const glass = getRequiredNode(scene, 'vis_top_glass') as AbstractMesh;
			hatches.setNodeVisible('vis_top_glass', false);
			expect(glass.isVisible).toBe(false);
			hatches.setNodeVisible('vis_top_glass', true);
			expect(glass.isVisible).toBe(true);
			expect(() => hatches.setNodeVisible('vis_coin_door', false)).toThrow(/"vis_coin_door"/);
			expect(() => hatches.setNodeVisible(channels[0]!, false)).toThrow(new RegExp(`"${channels[0]}" carries no mesh`));
		});
	});
});
