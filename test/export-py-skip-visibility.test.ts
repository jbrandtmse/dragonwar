// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8 (Code Map Part D item 7): "No test asserts the expected skip
// count on the running platform, so coverage lost to a skipIf is invisible
// (test/export-py.test.ts:102, export-py-version-gate.test.ts:76,143,
// blender-resolve.test.ts:117 -- the last is win32-only, so local skips 21
// and CI skips 22)." Two gated groups exist:
//   - test/export-py.test.ts's ONE `describe.skipIf(!blenderPath)` block,
//     holding a FIXED, PINNED count of `it()` cases (21) -- skipped entirely
//     when Blender is not resolvable on this machine.
//   - test/blender-resolve.test.ts's ONE `it.skipIf(process.platform !==
//     'win32')` case -- skipped on every non-Windows runner (CI's own
//     ubuntu-latest included).
// (test/export-py-version-gate.test.ts's OWN two `describe.skipIf(!pythonCmd)`
// blocks are Python-gated, not Blender-gated, and are not part of this
// story's Blender-specific "21 / 22" figure -- excluded here for the same
// reason the Code Map itself only lists them as related context, not as
// part of the count.)
//
// This file makes that arithmetic OBSERVABLE rather than silent, two ways:
//   1. A STRUCTURAL pin -- the `it(`/`it.skipIf(` count inside each gated
//      block, counted from the real source text, asserted against a named
//      constant -- so a case silently added or removed without updating
//      this file fails loudly here.
//   2. A REAL, end-to-end check -- spawns a nested `vitest run` over
//      exactly those two files and asserts the REPORTED skip count against
//      the live formula for THIS platform and THIS machine's Blender
//      resolvability, so the number is proven correct by an actual run, not
//      merely computed and trusted. That count is read from vitest's JSON
//      reporter -- `--reporter=json --outputFile=...`, whose
//      `numPendingTests` IS the skip count -- and never scraped from the
//      human summary line; see `DW-107` and the comment on that case below.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBlender } from '../tools/blender.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');
const RUN_TIMEOUT_MS = 120_000;

function countOccurrences(text: string, pattern: RegExp): number {
	return (text.match(pattern) ?? []).length;
}

/** Extracts the source slice for ONE `describe.skipIf(...)(...) => { ... }` block, matched by its opening line's own literal text -- from that line to the FIRST column-0 `});` after it (this repository's own consistent indentation style, matching every other structural-count helper in this suite, e.g. test/hardware-rule-seam.test.ts's own comment-stripping approach). */
function extractDescribeBlock(source: string, openingLineText: string): string {
	const startIdx = source.indexOf(openingLineText);
	if (startIdx === -1) {
		throw new Error(`export-py-skip-visibility.test.ts: could not find the line "${openingLineText}" -- has the describe block's own wording changed? Update this pin to match.`);
	}
	const closeMarker = '\n});';
	const endIdx = source.indexOf(closeMarker, startIdx);
	if (endIdx === -1) {
		throw new Error('export-py-skip-visibility.test.ts: could not find the closing "});" for the describe block');
	}
	return source.slice(startIdx, endIdx);
}

describe('Blender-gated skip visibility (Code Map Part D item 7): the skip count is pinned and proven, never silent', () => {
	it('structural pin: test/export-py.test.ts\'s ONE Blender-gated describe.skipIf block holds EXACTLY 21 it() cases', () => {
		const source = readFileSync(path.join(REPO_ROOT, 'test', 'export-py.test.ts'), 'utf8');
		const block = extractDescribeBlock(source, "describe.skipIf(!blenderPath)('tools/export.py -- Blender-gated");
		// `it(` only -- this block's own 21 cases are all plain `it(`, never
		// `it.skipIf(`; matching on the more specific token avoids double
		// counting or catching an unrelated `it(` inside a nested string.
		const count = countOccurrences(block, /\n\tit\(/g);
		expect(count, 'the Blender-gated block\'s own it() count changed -- update this pin (and the "21"/"22" figures in this file\'s and the Code Map\'s own prose) deliberately, not silently').toBe(21);
	});

	it('structural pin: test/blender-resolve.test.ts holds EXACTLY ONE win32-only it.skipIf case', () => {
		const source = readFileSync(path.join(REPO_ROOT, 'test', 'blender-resolve.test.ts'), 'utf8');
		const count = countOccurrences(source, /it\.skipIf\(process\.platform !== 'win32'\)/g);
		expect(count, 'blender-resolve.test.ts\'s win32-only skipIf count changed -- update this pin deliberately').toBe(1);
	});

	// Review finding 2026-08-29: this file was written to close "coverage
	// lost to a skipIf is invisible", but it scoped itself to the two
	// PRE-EXISTING gated groups and never covered the python-gated block THIS
	// SAME STORY added -- test/export-py-hull.test.ts's four cases, which are
	// the entire DW-64 deliverable. On a machine with no plain python3/python
	// all four skip silently and every assertion here still passed, which is
	// exactly the condition this file exists to make impossible.
	it('structural pin: test/export-py-hull.test.ts\'s ONE python-gated describe.skipIf block holds EXACTLY 4 it() cases (DW-64\'s whole deliverable)', () => {
		const source = readFileSync(path.join(REPO_ROOT, 'test', 'export-py-hull.test.ts'), 'utf8');
		const block = extractDescribeBlock(source, "describe.skipIf(!pythonCmd)(");
		const count = countOccurrences(block, /\n\tit\(/g);
		expect(count, 'the python-gated hull block\'s own it() count changed -- update this pin AND the expectedSkips formula below deliberately, not silently').toBe(4);
	});

	it('a nested vitest run over exactly these three files reports the LIVE expected skip count for this platform, this machine\'s Blender resolvability and its plain-Python availability', () => {
		let blenderResolvable: boolean;
		try {
			resolveBlender();
			blenderResolvable = true;
		} catch {
			blenderResolvable = false;
		}
		// The same two-candidate probe test/export-py-hull.test.ts's own
		// resolvePlainPython() uses -- duplicated deliberately, per this
		// suite's own "each file that spawns a real subprocess stays
		// independently reviewable" convention.
		let pythonAvailable = false;
		for (const candidate of ['python3', 'python']) {
			if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
				pythonAvailable = true;
				break;
			}
		}
		const isWin32 = process.platform === 'win32';
		const expectedSkips = (blenderResolvable ? 0 : 21) + (isWin32 ? 0 : 1) + (pythonAvailable ? 0 : 4);

		// eslint-disable-next-line no-console
		console.log(
			`[export-py-skip-visibility] this run: platform=${process.platform} blenderResolvable=${blenderResolvable} pythonAvailable=${pythonAvailable} -- expected skip count = ${expectedSkips} ` +
			`(${blenderResolvable ? 0 : 21} Blender-gated + ${isWin32 ? 0 : 1} win32-only + ${pythonAvailable ? 0 : 4} python-gated hull)`,
		);

		// `DW-107` (Story 1.10 follow-up): the skip count is read from vitest's
		// JSON reporter, never scraped from its human summary line. That scrape
		// was CI-red from Story 1.8's push through Story 1.10 and no pipeline
		// gate caught it, because every gate ran `pnpm test` on a Windows TTY
		// where it passed -- local-green and CI-green were never the same claim.
		// GitHub Actions' runner advertises colour support, so vitest emits ANSI
		// escapes BETWEEN the word "Tests" and "10 passed"; the old pattern's
		// segments were ALL optional, so it matched the bare word "Tests" with
		// both capture groups undefined and failed on terminal formatting rather
		// than on the skip arithmetic it exists to pin. The arithmetic was right
		// the whole time -- CI reported exactly the 22 this formula predicts. A
		// reporter contract cannot drift with a terminal's colour support; a
		// human summary line can, and did.
		const reportDir = mkdtempSync(path.join(tmpdir(), 'dw-skip-visibility-'));
		const reportPath = path.join(reportDir, 'nested-run.json');
		try {
			const result = spawnSync(
				process.execPath,
				[
					path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
					'run',
					'test/export-py.test.ts',
					'test/blender-resolve.test.ts',
					'test/export-py-hull.test.ts',
					'--reporter=json',
					`--outputFile=${reportPath}`,
				],
				{ cwd: REPO_ROOT, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
			);
			expect(result.status, `the nested run itself must succeed. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
			expect(existsSync(reportPath), `the nested run wrote no JSON report at ${reportPath}. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(true);

			const raw = readFileSync(reportPath, 'utf8');
			// A missing, empty or unparseable report is a LOUD failure, never a
			// silent zero: defaulting the count here would let a run that executed
			// nothing at all still satisfy the assertion on any platform whose
			// expectedSkips happens to be 0.
			let report: Record<string, unknown>;
			try {
				report = JSON.parse(raw) as Record<string, unknown>;
			} catch (cause) {
				throw new Error(`the nested run's JSON report was not parseable JSON (${String(cause)}). raw:\n${raw.slice(0, 2_000)}`);
			}
			for (const key of ['numTotalTests', 'numPassedTests', 'numPendingTests', 'numFailedTests'] as const) {
				expect(typeof report[key], `vitest's JSON report is missing a numeric "${key}" -- the reporter contract changed; fix this pin deliberately rather than loosening it`).toBe('number');
			}
			const numTotal = report.numTotalTests as number;
			const numPassed = report.numPassedTests as number;
			const numSkipped = report.numPendingTests as number;
			const numFailed = report.numFailedTests as number;

			// Three guards, so the skip assertion below cannot be satisfied by a
			// run that did not happen: cases were executed at all, none of them
			// failed, and the report's own passed+skipped accounts for its total.
			expect(numTotal, 'the nested run reported ZERO tests -- it did not actually execute the three files').toBeGreaterThan(0);
			expect(numFailed, `the nested run reported failing cases, which would make its skip count meaningless. report:\n${raw.slice(0, 2_000)}`).toBe(0);
			expect(numPassed + numSkipped, `the nested run's passed (${numPassed}) + skipped (${numSkipped}) does not account for its own total (${numTotal}) -- this report is not describing the run this test spawned`).toBe(numTotal);

			expect(
				numSkipped,
				`expected ${expectedSkips} skipped test(s) on this platform (blenderResolvable=${blenderResolvable}, win32=${isWin32}, pythonAvailable=${pythonAvailable}), but the nested run reported ${numSkipped}. report:\n${raw.slice(0, 2_000)}`,
			).toBe(expectedSkips);
		} finally {
			rmSync(reportDir, { recursive: true, force: true });
		}
	}, RUN_TIMEOUT_MS + 5_000);
});
