// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4's I/O & Edge-Case Matrix, "Blender too old" row. tools/export.py
// checks `bpy.app.version` before any other validation (task 9: "Version
// gate runs before any validation, so the message is about the toolchain,
// not the model"), but this host -- like CI -- has exactly one Blender
// version installed (5.2.1), so that branch cannot be reached by actually
// launching an old Blender. Since the version check is the very first thing
// `run()` does -- before it opens `--table-json` or touches `bpy.data` --
// it is reachable with a minimal stand-in `bpy`/`mathutils` pair on
// `PYTHONPATH` and a PLAIN Python 3 interpreter (no Blender at all): the
// import machinery is satisfied, `bpy.app.version` reads the stubbed old
// version, and every line after the gate is provably unreached because
// nothing past it could work against the stub. This is narrower than a real
// Blender run (test/export-py.test.ts covers that, gated on a real
// resolvable Blender) but it is a faithful, isolated test of this one gate.
//
// Skips (not fails) when no plain `python`/`python3` is on PATH, matching
// this story's own "skip cleanly when a needed tool isn't present" rule --
// this suite must never turn `pnpm test` red on a Python-less machine.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const EXPORT_PY = path.join(REPO_ROOT, 'tools', 'export.py');

function resolvePlainPython(): string | undefined {
	for (const candidate of ['python3', 'python']) {
		const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
		if (probe.status === 0) {
			return candidate;
		}
	}
	return undefined;
}

const pythonCmd = resolvePlainPython();

const createdDirs: string[] = [];
afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function freshTmpDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'dragonwar-export-py-version-gate-'));
	createdDirs.push(dir);
	return dir;
}

/** A minimal stand-in for the two Blender-provided modules tools/export.py
 * imports at module scope. Nothing past the version gate is expected to
 * work against these -- the gate must fire before either module's other
 * members are ever touched. */
function writeBpyStub(dir: string, version: readonly [number, number, number]): void {
	// `bpy.app.version` is a real Blender tuple, compared against
	// MIN_BLENDER_VERSION (also a tuple) with `<` -- a Python tuple literal,
	// never JSON.stringify's `[...]` list syntax, which fails that comparison
	// with a TypeError instead of exercising the gate.
	const tupleLiteral = `(${version.join(', ')})`;
	writeFileSync(
		path.join(dir, 'bpy.py'),
		`# Minimal stand-in for Blender's bpy module -- see test/export-py-version-gate.test.ts.\nclass app:\n\tversion = ${tupleLiteral}\n`,
	);
	writeFileSync(
		path.join(dir, 'mathutils.py'),
		'# Minimal stand-in for Blender\'s mathutils module -- see test/export-py-version-gate.test.ts.\nclass Vector:\n\tdef __init__(self, *args, **kwargs):\n\t\tpass\n',
	);
}

describe.skipIf(!pythonCmd)('tools/export.py -- version gate (stubbed bpy; no Blender required)', () => {
	it('a stubbed Blender older than 5.2 exits non-zero naming bpy.app.version and the 5.2 minimum', () => {
		const stubDir = freshTmpDir();
		writeBpyStub(stubDir, [5, 1, 0]);
		const outDir = freshTmpDir();
		const result = spawnSync(
			pythonCmd!,
			[EXPORT_PY, '--', '--table-json', path.join(outDir, 'unused-table.json'), '--out', outDir],
			{
				cwd: REPO_ROOT,
				encoding: 'utf8',
				env: { ...process.env, PYTHONPATH: stubDir },
			},
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('5.1.0');
		expect(result.stderr).toContain('5.2.0');
		expect(result.stderr).toContain('too old');
	});

	it('a stubbed Blender at exactly 5.2.0 passes the gate (and then fails later, on the unused stub table.json -- proving the gate itself let it through)', () => {
		const stubDir = freshTmpDir();
		writeBpyStub(stubDir, [5, 2, 0]);
		const outDir = freshTmpDir();
		const result = spawnSync(
			pythonCmd!,
			[EXPORT_PY, '--', '--table-json', path.join(outDir, 'unused-table.json'), '--out', outDir],
			{
				cwd: REPO_ROOT,
				encoding: 'utf8',
				env: { ...process.env, PYTHONPATH: stubDir },
			},
		);
		// Still fails overall (no real --table-json content, and every other
		// bpy member this stub doesn't provide), but NOT on the version gate.
		expect(result.status).not.toBe(0);
		expect(result.stderr).not.toContain('too old');
	});
});
