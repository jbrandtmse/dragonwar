// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.3's I/O & Edge-Case Matrix row "DOM/Node global in sim/" and DW-15's
// closure: `document`, `window`, `navigator`, `performance`, `setTimeout`,
// `setInterval`, `requestAnimationFrame` and `localStorage` used inside
// `src/sim/**` must fail `pnpm typecheck`, because `tsconfig.sim.json` compiles
// that project with `lib: ["ES2023"]` and `types: []` -- no DOM lib, no
// ambient types at all. This story's own Verification section demonstrated
// this live during implementation (inject `document.title;` into a real
// src/sim/** file, confirm TS2584, revert) but that demonstration left no
// persisted regression coverage: nothing in the automated suite would notice
// if `tsconfig.sim.json`'s `lib`/`types` were ever widened back. This is
// exactly the "enforcement machinery passing vacuously" hazard this story
// calls out for dependency-cruiser's own parser -- the DOM/Node ban is
// enforced by the compiler, not by tools/boundary-lint.mjs (see this story's
// Design Notes, "Why the boundary gate is three parts, not one"), and had no
// test of its own.
//
// This suite closes that gap with a real subprocess `tsc --noEmit` invocation
// (Rule 3: real-runtime evidence; the `test/measure-cli.test.ts` /
// `test/boundary-lint.test.ts` subprocess idiom) against a fixture tsconfig
// that `extends` the REAL, shipped `tsconfig.sim.json` (not a hand-copied
// duplicate of its `lib`/`types` values) with only `include` overridden to
// point at `test/fixtures/tsc-sim-boundary/` -- so a future edit to the real
// file's `lib` or `types` changes what this test observes, the way a
// hand-copied literal would not. The fixture root is excluded from every real
// tsconfig's own `include` via `tsconfig.node.json`'s
// `exclude: ["test/fixtures/**"]` (Code Map, `test/fixtures/boundary/**`'s
// same requirement), so it cannot poison `pnpm typecheck` itself.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const TSC_BIN = path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const FIXTURE_TSCONFIG = path.join('test', 'fixtures', 'tsc-sim-boundary', 'tsconfig.json');
const RUN_TIMEOUT_MS = 30_000;

interface RunResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function runTsc(tsconfigRelative: string): RunResult {
	const result = spawnSync(process.execPath, [TSC_BIN, '--noEmit', '-p', tsconfigRelative], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		timeout: RUN_TIMEOUT_MS,
	});
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('tsconfig.sim.json -- DOM/Node globals fail pnpm typecheck (DW-15 closure)', () => {
	const { status, stdout, stderr } = runTsc(FIXTURE_TSCONFIG);
	const combined = `${stdout}${stderr}`;

	it('exits non-zero (compiler diagnostics present)', () => {
		expect(status, `expected non-zero exit, output:\n${combined}`).not.toBe(0);
	});

	it.each([
		['document', 'document.ts', 'TS2584'],
		['window', 'window.ts', 'TS2304'],
		['navigator', 'navigator.ts', 'TS2304'],
		['performance', 'performance.ts', 'TS2304'],
		['setTimeout', 'set-timeout.ts', 'TS2304'],
		['setInterval', 'set-interval.ts', 'TS2304'],
		['requestAnimationFrame', 'request-animation-frame.ts', 'TS2304'],
		['localStorage', 'local-storage.ts', 'TS2304'],
	])('rejects "%s" (I/O matrix: "DOM/Node global in sim/")', (identifier, file, code) => {
		const pattern = new RegExp(
			`${file.replace(/[.]/g, '\\.')}\\(\\d+,\\d+\\): error ${code}: Cannot find name '${identifier}'`,
		);
		expect(combined).toMatch(pattern);
	});

	it('does not reject Date, Math.random or globalThis (legal ES2023 -- tools/boundary-lint.mjs\'s job, not this project\'s)', () => {
		expect(combined).not.toContain('legal-es2023-globals.ts');
	});

	it('does not reject DOM/Node-global-free code (sanity control on the fixture harness itself)', () => {
		expect(combined).not.toContain('clean.ts');
	});
});

describe('tsconfig.sim.json -- the real src/sim/** tree (repository as committed)', () => {
	it('typechecks clean on its own (no DOM/Node global has crept back in)', () => {
		const { status, stdout, stderr } = runTsc(path.join('tsconfig.sim.json'));
		expect(status, `expected exit 0, output:\n${stdout}${stderr}`).toBe(0);
	});
});

// Review finding, this story's review pass. The root `tsconfig.json` is now a
// solution file (`files: []`), so a bare `tsc --noEmit` at the repo root
// compiles ZERO files and exits 0 -- verified with `tsc --noEmit --listFiles`.
// The whole typecheck gate therefore rests on `package.json`'s script naming
// all three projects, and nothing observed that: reverting the script to the
// pre-story `tsc --noEmit`, or dropping just the `app` leg (the only program
// that covers `src/host/**`, including build-info.ts's AR-34 SHA stamp), left
// all tests and `pnpm lint:boundaries` green. This pins the composition.
describe('pnpm typecheck -- the gate covers all three projects', () => {
	const scripts = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).scripts as Record<string, string>;

	it.each(['tsconfig.sim.json', 'tsconfig.app.json', 'tsconfig.node.json'])(
		'names %s, so that project cannot be silently dropped from the gate',
		(project) => {
			expect(scripts.typecheck).toContain(project);
		},
	);

	it('runs each project explicitly rather than relying on the root solution file (which compiles nothing)', () => {
		expect(scripts.typecheck).toMatch(/-p\s+tsconfig\.sim\.json/);
		expect(scripts.typecheck).not.toMatch(/tsc\s+--noEmit\s*(&&|$)/);
	});

	it('the app project really does cover src/host/** (the SHA-stamp module has no other program)', () => {
		const { status, stdout, stderr } = runTsc(path.join('tsconfig.app.json'));
		expect(status, `expected exit 0, output:\n${stdout}${stderr}`).toBe(0);
		const listed = spawnSync(process.execPath, [TSC_BIN, '--noEmit', '-p', 'tsconfig.app.json', '--listFiles'], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			timeout: RUN_TIMEOUT_MS,
		});
		// tsc --listFiles emits absolute POSIX-separated paths on every platform.
		expect((listed.stdout ?? '').split(path.sep).join('/')).toContain('src/host/build-info.ts');
	});
});
