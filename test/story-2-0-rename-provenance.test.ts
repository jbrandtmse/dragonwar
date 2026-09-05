// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.0 QA pinning tests (bmad-qa-generate-e2e-tests pass, 2026-08-30;
// hardened at the Story 2.0 code review, same day).
//
// Story 2.0 was a chore: `git mv test/sim-boundary.test.ts
// test/port-provenance.test.ts`, a header rewrite naming Story 2.0 as
// owner, and 21 path-token reference updates across 18 files. No
// assertion was added, removed or weakened inside
// test/port-provenance.test.ts itself, and this file deliberately does
// NOT re-assert anything that file already covers (its own
// header-provenance / AD-15 constants pin / DW-79 port-body-freeze
// describe blocks -- see that file's own header for what it asserts).
//
// What nothing else in the suite pins is the CHORE's own invariants: that
// the rename actually landed cleanly with no stale reference left behind,
// that the sweep's own documented hazard (the bare substring
// "sim-boundary" also spelling two unrelated names) was not corrupted by
// an over-broad find/replace, that the three AD-16 gates all survived the
// rename and none was quietly retired, that the renamed file's structural
// shape -- at Story 2.0, three describe blocks, 101 tests (56 / 1 / 44) --
// is unchanged EXCEPT by deliberate, disclosed later additions (Story 2.1a
// task 11 raised the header-provenance block 56 -> 57 for a new authored
// file; task 29 added a fourth describe block, 3 tests, comparing this
// file's AUTHORED_FILES against tools/dependency-cruiser.config.mjs's own
// copy -- current true shape: four describe blocks, 105 tests
// (57 / 1 / 44 / 3)), and that its AC-2 ownership header still says what
// AD-16 requires it to say. Five invariants, five tests below. Each was
// confirmed falsifiable
// by a real, reverted mutation (see the spec's `## Verification` section
// for the mutation lines).
//
// THIS FILE EXCLUDES ITSELF FROM ITS OWN `git grep` SEARCHES, deliberately.
// It has to SPELL the tokens it asserts about -- the pre-rename path token
// appears in the prose above and in the test names below, and both
// sweep-hazard names appear in the comments below. `git grep` searches
// TRACKED files, so while this file was untracked those self-mentions were
// invisible and every assertion below passed; the moment the file is
// committed they would have flipped it red (measured at review: 3 spurious
// hits for the old token, counts 13 -> 17 and 2 -> 5). Excluding this file
// from its own searches is what makes the assertions mean the same thing
// before and after that commit. Do not remove SELF_PATHSPEC.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');

/** See the header note: this file's own text is not evidence about the sweep. */
const SELF_PATHSPEC = ':(exclude)test/story-2-0-rename-provenance.test.ts';

const GIT_TIMEOUT_MS = 30_000;

/**
 * All searches run with `-F` (fixed strings), never a regex. A user or CI
 * gitconfig setting `grep.patternType` (`fixed`, `extended`, `perl`) silently
 * changes how a pattern is interpreted, and under `fixed` an escaped-dot
 * regex matches NOTHING -- which would make the zero-hit assertion below pass
 * vacuously while a real stale reference sat in the tree. `-F` pins the
 * meaning; the positive control in the first test proves the search actually
 * reaches files.
 */
function runGitGrep(args: string[]): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
	if (result.error) {
		throw new Error(`\`git ${args.join(' ')}\` failed to run: ${String(result.error)}`);
	}
	if (result.signal) {
		throw new Error(`\`git ${args.join(' ')}\` was killed by signal ${result.signal} (timeout ${GIT_TIMEOUT_MS} ms)`);
	}
	// git grep exits 1 with empty stdout for "nothing found" -- that is a
	// result, not an error. Any other non-zero status is a real failure.
	if (result.status !== 0 && result.status !== 1) {
		throw new Error(`\`git ${args.join(' ')}\` errored (status ${String(result.status)}): ${result.stderr ?? ''}`);
	}
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function gitGrep(literal: string, paths: string[]): { status: number | null; stdout: string; stderr: string } {
	return runGitGrep(['grep', '-F', '-n', literal, '--', ...paths, SELF_PATHSPEC]);
}

function gitGrepCount(literal: string, paths: string[]): number {
	// `git grep -o` prints one matched substring per line.
	const { stdout } = runGitGrep(['grep', '-F', '-o', literal, '--', ...paths, SELF_PATHSPEC]);
	return stdout === '' ? 0 : stdout.trim().split('\n').length;
}

/**
 * Resolve the vitest CLI entry from vitest's own `package.json` `bin` field
 * rather than the bare `node_modules/vitest/vitest.mjs` literal. This is
 * DW-71's fix, applied in test/solver-termination.test.ts:84-91 for exactly
 * this reason -- see that function's doc comment for why
 * `import.meta.resolve('vitest/vitest.mjs')` cannot be used instead. Kept
 * identical to it deliberately: a divergent second copy is worse than a
 * duplicated one.
 */
function resolveVitestBin(): string {
	const vitestPkgPath = path.join(REPO_ROOT, 'node_modules', 'vitest', 'package.json');
	const vitestPkg = JSON.parse(readFileSync(vitestPkgPath, 'utf8')) as { readonly bin?: Record<string, string> };
	const binRelative = vitestPkg.bin?.vitest;
	if (!binRelative) {
		throw new Error(`could not resolve the vitest CLI entry: ${vitestPkgPath}'s "bin.vitest" field is missing`);
	}
	return path.join(REPO_ROOT, 'node_modules', 'vitest', binRelative);
}

const SWEPT_PATHS = ['src', 'test', 'tools', 'package.json', '.github'];

describe('Story 2.0: test/sim-boundary.test.ts -> test/port-provenance.test.ts rename -- chore invariants', () => {
	it('no reference to the pre-rename path token "test/sim-boundary.test.ts" survives in the swept paths', () => {
		// Positive control FIRST: if the search machinery were broken or
		// mis-scoped, the zero-hit assertion below would pass for the wrong
		// reason. The new path token must be found, and plentifully -- the
		// sweep replaced 21 references with it.
		const control = gitGrep('test/port-provenance.test.ts', SWEPT_PATHS);
		expect(
			control.status,
			`positive control found NO occurrences of the post-rename token, so the zero-hit assertion below would be vacuous. stderr: ${control.stderr}`,
		).toBe(0);

		const { status, stdout, stderr } = gitGrep('test/sim-boundary.test.ts', SWEPT_PATHS);
		expect(status, `git grep errored unexpectedly (status ${String(status)}); stderr: ${stderr}`).toBe(1);
		expect(stdout, `expected zero hits for the pre-rename path token; found:\n${stdout}`).toBe('');
	});

	it('the reference-sweep hazard survives untouched: "typecheck-sim-boundary" still has exactly 13 hits and "tsc-sim-boundary" still has exactly 2', () => {
		// These two name things unrelated to the rename that merely share the
		// word "sim-boundary" with the old filename --
		// test/typecheck-sim-boundary.test.ts (DW-32's typecheck-coverage
		// suite, 13 refs) and its test/fixtures/tsc-sim-boundary/ fixture
		// directory (2 refs). The anchored token used by the sweep,
		// "test/sim-boundary" + ".test.ts", does not match either (the
		// character before "sim-boundary" in "typecheck-sim-boundary" is "-",
		// not "/"), but a naive bare-substring find/replace would have
		// corrupted both. This pins that it did not.
		const HAZARD_NOTE =
			'If you deliberately ADDED or REMOVED a reference to the DW-32 typecheck-coverage suite, update this count. ' +
			'If you did not, an over-broad find/replace has corrupted a name that only shares a word with the renamed file.';
		expect(gitGrepCount('typecheck-sim-boundary', ['src', 'test', 'tools']), HAZARD_NOTE).toBe(13);
		expect(gitGrepCount('tsc-sim-boundary', ['src', 'test', 'tools']), HAZARD_NOTE).toBe(2);
	});

	it('all three AD-16 gates are present and wired: check:headers, the port-provenance structure test, and lint:boundaries', () => {
		const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
		expect(
			packageJson.scripts?.['check:headers'],
			'"check:headers" script must still run tools/check-licence-headers.mjs',
		).toContain('tools/check-licence-headers.mjs');
		expect(
			packageJson.scripts?.['lint:boundaries'],
			'"lint:boundaries" script must still run tools/boundary-lint.mjs',
		).toContain('tools/boundary-lint.mjs');

		// Existence -- readFileSync throws ENOENT if any gate file is missing.
		expect(() => readFileSync(path.join(REPO_ROOT, 'tools', 'check-licence-headers.mjs'), 'utf8')).not.toThrow();
		expect(() => readFileSync(path.join(REPO_ROOT, 'tools', 'boundary-lint.mjs'), 'utf8')).not.toThrow();
		expect(() => readFileSync(path.join(REPO_ROOT, 'test', 'port-provenance.test.ts'), 'utf8')).not.toThrow();

		// "Wired" means wired IN CI, not merely present in package.json: a gate
		// whose CI step is deleted has been retired in every way that matters,
		// which is the failure AD-16 was rewritten to prevent. The structural
		// gate rides on `pnpm test`.
		const ci = readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
		expect(ci, 'CI must still run the AD-16 presence gate').toContain('pnpm check:headers');
		expect(ci, 'CI must still run the AD-16 imports gate').toContain('pnpm lint:boundaries');
		expect(ci, 'CI must still run the suite that carries the AD-16 structure gate').toContain('pnpm test');

		const spine = readFileSync(
			path.join(
				REPO_ROOT,
				'_bmad-output',
				'planning-artifacts',
				'architecture',
				'architecture-dragonwar-2026-08-26',
				'ARCHITECTURE-SPINE.md',
			),
			'utf8',
		);
		// Terminate on the NEXT AD heading (or end of file), not on AD-17
		// specifically -- otherwise renumbering or inserting an AD makes this
		// report "AD-16 is missing" when AD-16 is present and something else moved.
		const ad16Match = spine.match(/### AD-16[\s\S]*?(?=\n### AD-|$)/);
		expect(ad16Match, 'AD-16 section must exist in the architecture spine').not.toBeNull();
		const ad16 = ad16Match![0];
		expect(ad16, 'AD-16 must still name the presence gate').toContain('tools/check-licence-headers.mjs');
		expect(ad16, 'AD-16 must still name the structure gate').toContain('test/port-provenance.test.ts');
		expect(ad16, 'AD-16 must still name the imports gate').toContain('tools/boundary-lint.mjs');
		expect(ad16, 'AD-16 must still forbid retiring any of the three gates').toMatch(/none may be retired/i);
	});

	it('test/port-provenance.test.ts still reports its current, deliberately-updated structural shape: four describe blocks, 107 tests (59 / 1 / 44 / 3)', { timeout: 180_000 }, () => {
		const result = spawnSync(
			process.execPath,
			[resolveVitestBin(), 'run', 'test/port-provenance.test.ts', '--reporter=json'],
			{ cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
		);

		expect(result.error, `the nested vitest run failed to spawn: ${String(result.error)}`).toBeUndefined();
		expect(
			result.signal,
			`the nested vitest run was killed by signal ${String(result.signal)} -- a hang, not a shape change. stderr:\n${result.stderr ?? ''}`,
		).toBeNull();

		const stdout = result.stdout ?? '';
		const jsonStart = stdout.indexOf('{');
		expect(
			jsonStart,
			`vitest --reporter=json produced no JSON on stdout. stdout:\n${stdout}\nstderr:\n${result.stderr ?? ''}`,
		).toBeGreaterThanOrEqual(0);
		let report: {
			numTotalTests: number;
			numPassedTests: number;
			testResults: Array<{ assertionResults: Array<{ ancestorTitles: string[] }> }>;
		};
		try {
			report = JSON.parse(stdout.slice(jsonStart));
		} catch (cause) {
			throw new Error(`vitest --reporter=json output was not parseable JSON (${String(cause)}). stdout:\n${stdout}`);
		}

		// The counts below are Story 2.0's AC-4 pin: the rename must not have
		// changed the file's shape. They are absolute on purpose. A LATER story
		// that legitimately adds a file under src/sim/physics/** raises the
		// header-provenance count (56), and a newly declared port raises the
		// freeze count (44) -- in that case update these numbers deliberately,
		// the same way PORT_BODY_HASHES is updated: never silently.
		const SHAPE_NOTE =
			'test/port-provenance.test.ts changed shape. If you added a file under src/sim/physics/** or declared a new port, update these counts deliberately; otherwise an assertion has been lost.';
		// Story 2.1a deliberately raised these counts by one: `loader/
		// loaded-flipper.ts` (DW-105's hoisted-out `LoadedFlipper` leaf module)
		// is a new, genuinely authored file under src/sim/physics/**, which
		// the SHAPE_NOTE below anticipates by name.
		//
		// Story 2.1a, rework iteration 4, task 29 (review finding): added a
		// FOURTH top-level describe block ("AUTHORED_PHYSICS_FILES ... agrees
		// with AUTHORED_FILES ...", 3 tests) asserting `tools/dependency-
		// cruiser.config.mjs`'s own AUTHORED_PHYSICS_FILES list agrees with
		// this file's AUTHORED_FILES -- a genuine new assertion, not file-count
		// drift, so it raises the block count (3 -> 4) and the total (102 -> 105)
		// deliberately, exactly as this note anticipates.
		//
		// Story 2.2: two new genuinely authored files under
		// src/sim/physics/** (slings.ts, pops.ts) each add one test to the
		// per-file header-provenance block (57 -> 59), raising the total
		// 105 -> 107 -- exactly the SHAPE_NOTE's own anticipated case.
		expect(report.numTotalTests, `total test count must stay 107. ${SHAPE_NOTE}`).toBe(107);
		expect(report.numPassedTests, `all 107 tests must pass. ${SHAPE_NOTE}`).toBe(107);

		const byTopDescribe = new Map<string, number>();
		for (const file of report.testResults) {
			for (const assertion of file.assertionResults) {
				const top = assertion.ancestorTitles[0] ?? '(none)';
				byTopDescribe.set(top, (byTopDescribe.get(top) ?? 0) + 1);
			}
		}
		const found = `found: ${[...byTopDescribe.keys()].join(' | ')}`;

		expect(byTopDescribe.size, `expected exactly 4 top-level describe blocks; ${found}`).toBe(4);
		expect(byTopDescribe.get('src/sim/physics/** header provenance (AD-16)'), `${SHAPE_NOTE} ${found}`).toBe(59);
		expect(
			// Rule 14: the em dash is escaped, never a literal byte.
			byTopDescribe.get('src/sim/physics/constants.ts \u2014 AD-15 verbatim solver constants pin'),
			`${SHAPE_NOTE} ${found}`,
		).toBe(1);
		expect(
			byTopDescribe.get(
				"src/sim/physics/** port-body freeze (DW-79): every declared ported file's content is pinned, normalised line endings",
			),
			`${SHAPE_NOTE} ${found}`,
		).toBe(44);
		expect(
			byTopDescribe.get('AUTHORED_PHYSICS_FILES (tools/dependency-cruiser.config.mjs) agrees with AUTHORED_FILES (this file)'),
			`${SHAPE_NOTE} ${found}`,
		).toBe(3);
	});

	it("AC 2: test/port-provenance.test.ts's header still names Story 2.0 as its owner, the four things it asserts, and the two it does not", () => {
		// AD-16 ends with an explicit requirement: "test/port-provenance.test.ts
		// is owned by Story 2.0 and names its owner in its header comment,
		// because the file it was renamed from was edited by all ten Epic 1
		// stories with no owner at all." Nothing else in the suite reads that
		// header, so without this test the whole AC-2 deliverable could be
		// deleted with every gate green -- and the "everybody edits it, nobody
		// owns it" condition the story exists to end would silently return.
		// A source-text pin, in the style test/entry-html-csp.test.ts
		// establishes for this repo.
		const source = readFileSync(path.join(REPO_ROOT, 'test', 'port-provenance.test.ts'), 'utf8');
		const header: string[] = [];
		for (const line of source.split('\n')) {
			if (!line.startsWith('//')) break;
			header.push(line);
		}
		const block = header.join('\n');

		expect(block, 'the header comment must name Story 2.0 as the file\'s documented owner (AC 2, AD-16)').toContain(
			'Owned by Story 2.0',
		);

		const asserted = block.match(/^\/\/\s+\d+\.\s/gm) ?? [];
		expect(
			asserted.length,
			`the header must enumerate the four things this file asserts (AC 2); found ${asserted.length} numbered items`,
		).toBe(4);

		const notAssertedAt = block.indexOf('deliberately does NOT assert');
		expect(notAssertedAt, 'the header must state what this file deliberately does NOT assert (AC 2)').toBeGreaterThan(-1);
		const notAsserted = block.slice(notAssertedAt);
		expect(
			notAsserted,
			'the "does NOT assert" list must name check-licence-headers.mjs as the gate that owns per-file header presence (AC 2)',
		).toContain('tools/check-licence-headers.mjs');
		expect(
			notAsserted,
			'the "does NOT assert" list must name boundary-lint.mjs as the gate that owns import direction (AC 2)',
		).toContain('tools/boundary-lint.mjs');
	});
});
