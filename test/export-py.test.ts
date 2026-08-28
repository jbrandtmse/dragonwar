// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's I/O & Edge-Case Matrix, Blender-gated half: real subprocess
// invocations of tools/export.py against the committed assets/src/dragonwar.blend
// and against copies deliberately mutated by
// test/fixtures/export-py/mutate-blend.py. The whole suite SKIPS (not fails)
// when Blender is not resolvable (tools/blender.mjs) -- CI has no Blender
// (Story 1.4's own "Always" rule) -- so this file must never turn `pnpm test`
// red on a Blender-less machine.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveBlender } from '../tools/blender.mjs';
import { buildTableDump, runExportAssets } from '../tools/export-assets.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');
const BLEND_PATH = path.join(REPO_ROOT, 'assets', 'src', 'dragonwar.blend');
const EXPORT_PY = path.join(REPO_ROOT, 'tools', 'export.py');
const MUTATOR_PY = path.join(REPO_ROOT, 'test', 'fixtures', 'export-py', 'mutate-blend.py');
const COMMITTED_GLB = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.glb');
const COMMITTED_COLLISION = path.join(REPO_ROOT, 'public', 'assets', 'dragonwar.collision.json');
const RUN_TIMEOUT_MS = 90_000;

let blenderPath: string | undefined;
try {
	blenderPath = resolveBlender();
} catch {
	blenderPath = undefined;
}

const createdDirs: string[] = [];
afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function freshTmpDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-export-py-'));
	createdDirs.push(dir);
	return dir;
}

function writeTableJson(dir: string): string {
	const dump = buildTableDump();
	const tableJsonPath = path.join(dir, 'table.json');
	writeFileSync(tableJsonPath, JSON.stringify(dump), 'utf8');
	return tableJsonPath;
}

interface RunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function runExportPy(blendPath: string, outDir: string): RunResult {
	const tableJsonPath = writeTableJson(freshTmpDir());
	const result = spawnSync(
		blenderPath!,
		[
			'--background',
			'--factory-startup',
			blendPath,
			'--python-exit-code', '1',
			'--python', EXPORT_PY,
			'--',
			'--table-json', tableJsonPath,
			'--out', outDir,
		],
		{ cwd: REPO_ROOT, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
	);
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function mutateBlend(mutation: string): string {
	const dir = freshTmpDir();
	const outBlend = path.join(dir, 'mutated.blend');
	const result = spawnSync(
		blenderPath!,
		[
			'--background',
			'--factory-startup',
			BLEND_PATH,
			'--python', MUTATOR_PY,
			'--',
			'--out', outBlend,
			'--mutation', mutation,
		],
		{ cwd: REPO_ROOT, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
	);
	if (result.status !== 0) {
		throw new Error(`mutateBlend("${mutation}") failed (exit ${result.status}):\n${result.stderr}`);
	}
	return outBlend;
}

describe.skipIf(!blenderPath)('tools/export.py -- Blender-gated (skipped when Blender is not resolvable)', () => {
	it('a clean export of the committed .blend exits 0 and writes both artifacts', () => {
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(BLEND_PATH, outDir);
		expect(status, `stderr: ${stderr}`).toBe(0);
		expect(existsSync(path.join(outDir, 'dragonwar.glb'))).toBe(true);
		expect(existsSync(path.join(outDir, 'dragonwar.collision.json'))).toBe(true);
	});

	it('re-exporting the committed .blend reproduces BOTH committed artifacts byte-for-byte (verified byte-deterministic, Code Map)', () => {
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(BLEND_PATH, outDir);
		expect(status, `stderr: ${stderr}`).toBe(0);

		const fresh = readFileSync(path.join(outDir, 'dragonwar.glb'));
		const committed = readFileSync(COMMITTED_GLB);
		expect(Buffer.compare(fresh, committed), 'public/assets/dragonwar.glb is stale: re-exporting the committed .blend produced different bytes').toBe(0);

		// The collision document was previously checked for EXISTENCE only, so a
		// regression in export.py's collision maths -- wall_footprint_mm()'s
		// dominant-axis choice, the dMm plane constant, a switch-zone bound, the
		// devices' millimetre scaling -- would leave the committed document stale
		// with nothing going red, on any machine, ever. That document is the input
		// every physics test reads, so the whole collision suite would keep passing
		// against outdated geometry (review finding, this story's code-review pass).
		// export.py writes it with sort_keys=True and indent=2, so it is
		// byte-deterministic exactly as the glb is.
		const freshDoc = readFileSync(path.join(outDir, 'dragonwar.collision.json'));
		const committedDoc = readFileSync(COMMITTED_COLLISION);
		expect(
			Buffer.compare(freshDoc, committedDoc),
			'public/assets/dragonwar.collision.json is stale: re-exporting the committed .blend produced a different collision document. Re-run `pnpm export:assets` and commit both artifacts together.',
		).toBe(0);
	});

	it('the real pnpm export:assets entry point (runExportAssets(), not just this file’s own hand-rolled spawnSync helper) succeeds end to end', () => {
		// test/export-py.test.ts's own runExportPy() above independently
		// hand-rolls an equivalent spawnSync call with its own argument list --
		// a bug introduced into runExportAssets()'s own argument-building (e.g.
		// dropping the ‘--’ separator, or reordering flags) would break
		// ‘pnpm export:assets’ in reality while every test above stayed green
		// (review finding, this story's review pass). This drives the real,
		// exported driver function directly.
		const outDir = freshTmpDir();
		const status = runExportAssets({ blendPath: BLEND_PATH, outDir, env: process.env });
		expect(status).toBe(0);
		expect(existsSync(path.join(outDir, 'dragonwar.glb'))).toBe(true);
		expect(existsSync(path.join(outDir, 'dragonwar.collision.json'))).toBe(true);
	});

	it('a bad node name exits non-zero naming the offending node and the grammar', () => {
		const mutated = mutateBlend('bad-name');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('Col_Playfield');
		expect(stderr).toMatch(/\^\[a-z\]\[a-z0-9_\]\*\$/);
	});

	it('two materials on one mesh exits non-zero naming the offending node', () => {
		const mutated = mutateBlend('two-materials');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('vis_playfield');
		expect(stderr).toMatch(/material slot/);
	});

	it('an unknown property value exits non-zero naming the node, the property and the value', () => {
		const mutated = mutateBlend('unknown-property');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_playfield');
		expect(stderr).toContain('surface');
		expect(stderr).toContain('unobtainium');
	});

	it('a name-collision attempt is rejected -- Blender auto-suffixes it, and the resulting "col_playfield.001" fails the name grammar (a true duplicate cannot exist in one .blend; see test/fixtures/export-py/mutate-blend.py\'s header)', () => {
		const mutated = mutateBlend('name-collision-attempt');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('col_playfield.001');
	});

	it('a missing required node exits non-zero naming the missing node', () => {
		const mutated = mutateBlend('missing-node');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('pivot_pitch');
	});

	it('a static mesh with fewer than two UV layers exits non-zero naming the node', () => {
		const mutated = mutateBlend('missing-uv');
		const outDir = freshTmpDir();
		const { status, stderr } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(stderr).toContain('vis_playfield');
		expect(stderr).toMatch(/UV layer/);
	});

	it('an exception raised instead of sys.exit still exits non-zero (the measured --python-exit-code trap)', () => {
		// The mutator's own failure path IS this trap in miniature: if
		// tools/export.py ever regressed to a bare `raise` instead of
		// `sys.exit(n)`, every mutation case above would start reporting
		// exit 0 instead -- this case pins that the DRIVER command line
		// (--python-exit-code) is actually wired up, by asserting on a
		// mutation this suite already knows must fail.
		const mutated = mutateBlend('unknown-property');
		const outDir = freshTmpDir();
		const { status } = runExportPy(mutated, outDir);
		expect(status).not.toBe(0);
		expect(status).not.toBeNull();
	});
});
