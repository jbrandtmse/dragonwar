#!/usr/bin/env node
// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.4 -- `pnpm export:assets`'s driver. A LOCAL AUTHORING STEP, never
// run from CI (CI has no Blender; the committed `public/assets/dragonwar.glb`
// and `public/assets/dragonwar.collision.json` are what CI and the default
// test suite consume): builds the table-contract dump (the JSON
// `tools/export.py` validates every authored `.blend` node's names and
// properties against), writes it to a throwaway temp file, resolves Blender
// (`tools/blender.mjs` -- BLENDER env var, then PATH, then a short
// per-platform list) and shells out to `tools/export.py` inside it, forwards
// its stdout/stderr, deletes the temp file and exits with the child's code.
//
// Usage: BLENDER=/path/to/blender node tools/export-assets.mjs
//   (or, once BLENDER is resolvable another way: node tools/export-assets.mjs)

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BlenderNotFoundError, resolveBlender } from './blender.mjs';
import { TABLE } from '../src/sim/table/dragonwar.ts';
import { CONTACT_SURFACES } from '../src/sim/contracts/events.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BLEND_PATH = path.join(REPO_ROOT, 'assets', 'src', 'dragonwar.blend');
const EXPORT_PY = path.join(REPO_ROOT, 'tools', 'export.py');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'public', 'assets');

// Passed to Blender's own `--python-exit-code`: the exit code Blender uses
// when `tools/export.py` raises an uncaught Python exception instead of
// calling `sys.exit(n)` itself -- the measured trap (Code Map, "Verified
// upstream facts"): `blender --python script.py` exits 0 by default even
// when the script raised. Any non-zero value works; 1 is the ordinary
// "something failed" convention this repository's other tools already use.
const PYTHON_EXIT_CODE = 1;

// A hung Blender process must not block `pnpm export:assets` forever with
// no feedback (review finding, this story's review pass) -- matches
// test/export-py.test.ts's own equivalent spawnSync call's timeout.
const BLENDER_TIMEOUT_MS = 90_000;

/**
 * The table-contract dump `tools/export.py` validates every authored node's
 * names and properties against: real source (`TABLE`, `CONTACT_SURFACES`),
 * never a hand-copied duplicate (Design Notes, "The phys_material name list
 * lives in TABLE, not in tuning.ts").
 */
export function buildTableDump(table = TABLE, surfaces = CONTACT_SURFACES) {
	return {
		reference: table.reference,
		switches: table.switches,
		coils: table.coils,
		ballDevices: table.ballDevices,
		lamps: table.lamps,
		lightGroups: table.lightGroups,
		physMaterials: table.physMaterials,
		nodes: table.nodes,
		surfaces,
	};
}

/**
 * Runs the export end to end and returns the process exit code that should
 * be used -- never calls `process.exit()` itself, so tests can drive it and
 * inspect the result. Options exist for tests only; every production call
 * uses the defaults.
 */
export function runExportAssets({ blendPath = DEFAULT_BLEND_PATH, outDir = DEFAULT_OUT_DIR, env = process.env } = {}) {
	let blenderPath;
	try {
		blenderPath = resolveBlender(env);
	} catch (err) {
		if (err instanceof BlenderNotFoundError) {
			console.error(`[export-assets] FAILED: ${err.message}`);
			return 1;
		}
		throw err;
	}

	const dump = buildTableDump();
	const tmpDir = mkdtempSync(path.join(tmpdir(), 'dragonwar-export-'));
	const tmpJson = path.join(tmpDir, 'table.json');
	writeFileSync(tmpJson, JSON.stringify(dump, null, 2), 'utf8');

	try {
		const result = spawnSync(
			blenderPath,
			[
				'--background',
				'--factory-startup',
				blendPath,
				'--python-exit-code', String(PYTHON_EXIT_CODE),
				'--python', EXPORT_PY,
				'--',
				'--table-json', tmpJson,
				'--out', outDir,
			],
			{ cwd: REPO_ROOT, stdio: 'inherit', timeout: BLENDER_TIMEOUT_MS },
		);
		if (result.error) {
			console.error(`[export-assets] FAILED to run Blender: ${result.error.message}`);
			return 1;
		}
		if (result.signal) {
			// spawnSync sets .signal (and leaves .status null) both on an
			// explicit kill and on a timeout -- report a clear message rather
			// than returning a silent, confusing exit code (review finding,
			// this story's review pass).
			console.error(`[export-assets] FAILED: Blender process was killed by signal ${result.signal} (a timeout after ${BLENDER_TIMEOUT_MS}ms is the likely cause)`);
			return 1;
		}
		return result.status ?? 1;
	} finally {
		// Deleted unconditionally, success or failure: the dump is a generated
		// artifact of this run, never a committed input.
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

function main() {
	const code = runExportAssets();
	process.exit(code);
}

const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
	main();
}
