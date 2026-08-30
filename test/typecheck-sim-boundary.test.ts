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
import { listFilesRecursive, TEXTUAL_SCAN_EXTENSION_PATTERN } from '../tools/boundary-lint.mjs';

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

// DW-32: the second half of the hole this story's Code Map names -- the two
// gates (`pnpm typecheck`'s three tsconfig projects and
// tools/boundary-lint.mjs's textual scan) disagree about what files EXIST
// under src/, because every project's `include` is `*.ts` only while the
// lint's own TEXTUAL_SCAN_EXTENSION_PATTERN also covers `.tsx`/`.mts`/`.cts`/
// `.js`/`.mjs`/`.cjs`. `src/` holds no orphan file today (the hole is
// latent), so the real-tree assertion below is trivially green against any
// implementation -- the synthetic positive control immediately after it is
// what actually exercises the comparison function's discriminating power
// inside this suite (this story's own Design Notes, "DW-32's set difference
// is trivially green").
/** Every file under `src/` this suite considers "covered" (present in at least one of the three tsconfig projects' real programs), repo-root-relative POSIX paths. */
function listCoveredSrcFiles(): Set<string> {
	const repoRootPosix = REPO_ROOT.split(path.sep).join('/');
	const covered = new Set<string>();
	for (const project of ['tsconfig.sim.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
		const result = spawnSync(process.execPath, [TSC_BIN, '--noEmit', '-p', project, '--listFiles'], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			timeout: RUN_TIMEOUT_MS,
		});
		const lines = (result.stdout ?? '').split(path.sep).join('/').split('\n');
		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (line.length === 0) {
				continue;
			}
			const prefix = `${repoRootPosix}/src/`;
			if (line.startsWith(prefix)) {
				covered.add(line.slice(repoRootPosix.length + 1));
			}
		}
	}
	return covered;
}

/** Every real file under `<repoRoot>/src` whose extension matches boundary-lint.mjs's own textual-scan extension set, repo-root-relative POSIX paths. */
function listAllSrcFilesWithCodeExtension(): string[] {
	const srcRoot = path.join(REPO_ROOT, 'src');
	return listFilesRecursive(srcRoot)
		.filter((f) => TEXTUAL_SCAN_EXTENSION_PATTERN.test(f))
		.map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'))
		.sort();
}

/**
 * The set-difference itself, as a pure function so the synthetic control
 * below can drive it directly without touching the filesystem or spawning
 * `tsc` -- exactly the discriminating power this story's Design Notes calls
 * for ("the synthetic positive control ... is what carries the
 * discriminating power inside the suite; the tree mutation only demonstrates
 * it once").
 */
function computeUncoveredSrcFiles(coveredFiles: ReadonlySet<string>, allSrcFiles: readonly string[]): string[] {
	return allSrcFiles.filter((f) => !coveredFiles.has(f));
}

describe('typecheck coverage -- every src/** file with a code extension is covered by at least one tsconfig project (DW-32)', () => {
	it('sanity: the real src/ tree actually holds files, and TEXTUAL_SCAN_EXTENSION_PATTERN actually matches some of them, or the assertion below is vacuous', () => {
		const all = listAllSrcFilesWithCodeExtension();
		expect(all.length).toBeGreaterThan(0);
	});

	it('every file under src/ with a code extension (tools/boundary-lint.mjs\'s own extension set) is included by at least one of the three tsconfig projects', () => {
		const covered = listCoveredSrcFiles();
		const all = listAllSrcFilesWithCodeExtension();
		const uncovered = computeUncoveredSrcFiles(covered, all);
		expect(
			uncovered,
			`the following src/** file(s) are in no tsconfig project (typecheck and boundary-lint disagree about what exists): ${uncovered.join(', ')}`,
		).toEqual([]);
	});

	it('SYNTHETIC CONTROL: the comparison function reports a path fed to it as uncovered -- proves the assertion above can actually fail, not just happens to pass today', () => {
		const covered = new Set(['src/sim/real.ts']);
		const all = ['src/sim/real.ts', 'src/shared/orphan.ts', 'src/sim/widget.tsx'];
		const uncovered = computeUncoveredSrcFiles(covered, all);
		expect(uncovered).toEqual(['src/shared/orphan.ts', 'src/sim/widget.tsx']);
	});

	it('SYNTHETIC CONTROL: reports nothing when every file is covered (no false positive)', () => {
		const covered = new Set(['src/sim/real.ts', 'src/shared/orphan.ts']);
		const all = ['src/sim/real.ts', 'src/shared/orphan.ts'];
		expect(computeUncoveredSrcFiles(covered, all)).toEqual([]);
	});
});
