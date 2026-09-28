// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8 (Code Map Part D item 7): "No test asserts the expected skip
// count on the running platform, so coverage lost to a skipIf is invisible
// (test/export-py.test.ts:102, export-py-version-gate.test.ts:76,143,
// blender-resolve.test.ts:117 -- the last is win32-only, so local skips 21
// and CI skips 22)." Two gated groups exist:
//   - test/export-py.test.ts's ONE `describe.skipIf(!blenderPath)` block,
//     holding a FIXED, PINNED count of `it()` cases (23, as of Story 2.1d
//     task 15's DW-125 concave-footprint rejection pin -- was 22 through
//     Story 2.1a's own LF regression pin, and 21 through Story 1.8/1.10) --
//     skipped entirely when Blender is not resolvable on this machine.
//   - test/blender-resolve.test.ts's `it.skipIf(process.platform !==
//     'win32')` cases (THREE as of Story 2.1b task 20's DW-46 fix -- was
//     ONE through Story 1.8/2.1a) -- skipped on every non-Windows runner
//     (CI's own ubuntu-latest included).
// (test/export-py-version-gate.test.ts's OWN two `describe.skipIf(!pythonCmd)`
// blocks are Python-gated, not Blender-gated, and are not part of this
// story's Blender-specific "22 / 23" figure -- excluded here for the same
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
/**
 * DW-227. Was `120_000` -- a budget with no stated measurement behind it,
 * and one already close to the ledger's own recorded UNDER-LOAD range
 * (103-118 s), so a nested run sharing the host with the rest of a parallel
 * `pnpm test` invocation could genuinely exceed it. Measured, not guessed:
 * isolated baseline **45.9 s** at this tree, 2026-09-12 (re-measured; the
 * ledger's own dispatch-time figure was 54.8 s -- both hosts, not a
 * regression here) and an observed under-load range of **103-118 s**
 * (the ledger's own citation, this story's own re-measurement pass did not
 * repeat the load condition). `300_000` (5 min) is a little over 2.5x the
 * worst OBSERVED figure and over 6x the isolated baseline -- real headroom
 * against both, not merely against the number this constant used to be.
 */
const RUN_TIMEOUT_MS = 300_000;

function countOccurrences(text: string, pattern: RegExp): number {
	return (text.match(pattern) ?? []).length;
}

/**
 * DW-227. `spawnSync()`'s own contract (Node's `child_process` docs): a
 * process killed by its own `timeout` option never sets `status` (it stays
 * `null`) -- only `signal` does. The bare `expect(result.status).toBe(0)`
 * this replaces reported `expected null to be 0` on a timeout, which reads
 * identically to an ordinary nonzero exit and names neither the cause nor
 * the budget it was measured against. Pure and instance-free: takes only
 * the two fields `spawnSync()` actually sets on kill/exit, so the timeout
 * branch is unit-testable against a synthesized result without ever
 * spawning a process or waiting for a real kill (task 14).
 */
export interface NestedRunOutcome {
	readonly kind: 'ok' | 'timeout' | 'nonzero';
	readonly message: string;
}

export function describeNestedRunOutcome(result: { readonly status: number | null; readonly signal: NodeJS.Signals | null }, timeoutMs: number): NestedRunOutcome {
	if (result.status === 0) {
		return { kind: 'ok', message: 'the nested run exited 0' };
	}
	if (result.status === null) {
		return {
			kind: 'timeout',
			message: `the nested run was killed (signal ${result.signal ?? 'unknown'}) -- it did not complete within the ${timeoutMs} ms budget`,
		};
	}
	return {
		kind: 'nonzero',
		message: `the nested run exited with a nonzero status (${result.status})`,
	};
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
	it('structural pin: test/export-py.test.ts\'s ONE Blender-gated describe.skipIf block holds EXACTLY 23 it() cases', () => {
		const source = readFileSync(path.join(REPO_ROOT, 'test', 'export-py.test.ts'), 'utf8');
		const block = extractDescribeBlock(source, "describe.skipIf(!blenderPath)('tools/export.py -- Blender-gated");
		// `it(` only -- this block's own 23 cases are all plain `it(`, never
		// `it.skipIf(`; matching on the more specific token avoids double
		// counting or catching an unrelated `it(` inside a nested string.
		// Story 2.1a (task 21, iteration 2) added the 22nd case: a
		// platform-independent regression pin for tools/export.py's
		// newline='\n' fix (the collision-document writer no longer depends
		// on the host's text-mode line-ending translation). Story 2.1d
		// (task 15, DW-125) added the 23rd: an end-to-end pin for the
		// DW-68 concave-footprint rejection, which previously had no
		// regression test anywhere in this suite.
		const count = countOccurrences(block, /\n\tit\(/g);
		expect(count, 'the Blender-gated block\'s own it() count changed -- update this pin (and the "22"/"23" figures in this file\'s and the Code Map\'s own prose) deliberately, not silently').toBe(23);
	});

	it('structural pin: test/blender-resolve.test.ts holds EXACTLY THREE win32-only it.skipIf cases', () => {
		// Story 2.1b task 20 (DW-46): grew from 1 to 3 -- the ORIGINAL
		// LOCALAPPDATA-based conventional-install case, plus two new cases
		// asserting env.ProgramFiles and env['ProgramFiles(x86)'] are honoured
		// (a localized, non-"Program Files" Windows install). Deliberately
		// still win32-gated: Windows-specific env vars, asserted against the
		// real win32 conventionalCandidates() branch, not the injectable-
		// platform branches (which are asserted unconditionally, on any host,
		// in this same file's own DW-46 darwin/Linux cases below).
		const source = readFileSync(path.join(REPO_ROOT, 'test', 'blender-resolve.test.ts'), 'utf8');
		const count = countOccurrences(source, /it\.skipIf\(process\.platform !== 'win32'\)/g);
		expect(count, 'blender-resolve.test.ts\'s win32-only skipIf count changed -- update this pin (and the expectedSkips formula below) deliberately').toBe(3);
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
		// Story 2.1a (task 21, iteration 2): the Blender-gated block grew from
		// 21 to 22 cases (the LF regression pin), so this term moved from 21
		// to 22 deliberately. Story 2.1d (task 15, DW-125): grew again, 22 to
		// 23 (the new concave-footprint rejection pin), matching the
		// structural pin above. Story 2.1b task 20 (DW-46): the win32-only
		// term grew from 1 to 3, matching the structural pin above.
		const expectedSkips = (blenderResolvable ? 0 : 23) + (isWin32 ? 0 : 3) + (pythonAvailable ? 0 : 4);

		// eslint-disable-next-line no-console
		console.log(
			`[export-py-skip-visibility] this run: platform=${process.platform} blenderResolvable=${blenderResolvable} pythonAvailable=${pythonAvailable} -- expected skip count = ${expectedSkips} ` +
			`(${blenderResolvable ? 0 : 23} Blender-gated + ${isWin32 ? 0 : 3} win32-only + ${pythonAvailable ? 0 : 4} python-gated hull)`,
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
		//
		// Reciprocal pointer (DW-189, Story 2.5): the identical defect recurred
		// in test/ad7-device-slots.test.ts, which scraped the same summary line
		// for the same reason and went red on the same Ubuntu runner (CI run
		// 34038163487). Nothing in either file named the other, so the second
		// author re-derived the whole diagnosis from scratch rather than
		// inheriting this conclusion -- which is precisely how the class
		// survived a second time. That file now reads its nested harness's
		// result through this same JSON-reporter contract; if a THIRD nested
		// vitest spawn is ever added, start from these two.
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
			// DW-227: names a timeout distinctly from an ordinary nonzero exit
			// (and the elapsed budget it was measured against), rather than
			// `expected null to be 0` -- see describeNestedRunOutcome() above.
			const outcome = describeNestedRunOutcome(result, RUN_TIMEOUT_MS);
			expect(outcome.kind, `the nested run itself must succeed: ${outcome.message}. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe('ok');
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

// DW-227, task 14. The timeout branch above is otherwise unreachable in a
// green run (Anti-vacuity plan, "a check that never ran") -- a real kill is
// slow and flaky to arrange on demand, so this proves the branch against a
// synthesized result instead: exactly the shape `spawnSync()` produces when
// its own `timeout` option fires (`status: null`, `signal` set) and the
// ordinary nonzero-exit shape it must be told apart from.
describe('DW-227 -- describeNestedRunOutcome() distinguishes ok / timeout / nonzero without waiting for a real kill', () => {
	it('a synthesized killed result ({ status: null, signal: "SIGTERM" }) is classified "timeout", naming the signal and the elapsed budget', () => {
		const outcome = describeNestedRunOutcome({ status: null, signal: 'SIGTERM' }, 300_000);
		expect(outcome.kind).toBe('timeout');
		expect(outcome.message).toContain('SIGTERM');
		expect(outcome.message).toContain('300000');
	});

	it('a synthesized nonzero exit ({ status: 1, signal: null }) is classified "nonzero", distinctly from "timeout"', () => {
		const outcome = describeNestedRunOutcome({ status: 1, signal: null }, 300_000);
		expect(outcome.kind).toBe('nonzero');
		expect(outcome.message).toContain('1');
	});

	it('a successful exit ({ status: 0, signal: null }) is classified "ok"', () => {
		const outcome = describeNestedRunOutcome({ status: 0, signal: null }, 300_000);
		expect(outcome.kind).toBe('ok');
	});

	// mutation: remove the `result.status === null` branch (fall through to
	// the nonzero case, or delete the check entirely so `status: null`
	// reaches the `ok` check's `=== 0` and falls to "nonzero") -> the first
	// test above goes red, asserting "nonzero" (or the message losing
	// "SIGTERM"/the budget) where "timeout" is required.
});
