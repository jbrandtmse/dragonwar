// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// This file holds THREE independent gates on AD-7, which is why its describes
// do not share a subject (review finding 2026-09-06, blind-hunter -- the header
// used to describe only the first and had gone stale as the other two landed):
//
//   1. `DW-70: AD-7 ... post-fix` -- the in-suite wrapper (Story 2.5 task 9).
//      Spawns the nested vitest project at
//      test/fixtures/dw70-ad7/vitest.harness.config.ts (the same config
//      `pnpm check:ad7` runs) as a subprocess and asserts it now PASSES, with
//      an EXACT passing-test count, naming AD-7 and bd_trough, and carrying
//      the device-slot values the harness actually computed.
//   2. `... JSON reporter contract ...` -- pure, in-process pins on the parse
//      that reads (1)'s result. No subprocess (DW-189).
//   3. `AD-7 (AC 1, whole-invariant)` -- a source-level scan of
//      src/sim/loop/**, covering EVERY GameState field rather than only
//      deviceSlots. No subprocess.
//
// Fixing DW-70 without rewriting this wrapper turns `pnpm test` red (the
// wrapper's OLD assertions all expected a FAILING harness); rewriting this
// wrapper without fixing DW-70 would make it assert nothing true. Both land
// in the same change (epic-2-context.md's own framing of this obligation).
//
// `it.fails()` is still deliberately NOT used (it passes on any throw and
// cannot distinguish "passed for the DW-70 reason" from "the harness broke
// and vacuously exited 0"): the exact passing-count assertion below is what
// makes a gutted-to-nothing harness fail this wrapper even though its own
// exit code would be 0.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_CONFIG = path.join(REPO_ROOT, 'test', 'fixtures', 'dw70-ad7', 'vitest.harness.config.ts');
const HARD_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// DW-189 (code-review re-review, 2026-09-06): read the nested harness's result
// from vitest's JSON REPORTER CONTRACT, never by scraping its human summary
// line.
//
// History, so this is not re-derived later. Story 2.5 shipped this wrapper
// scraping `/Tests\s+(\d+)\s+passed/` out of the harness's rendered output.
// CI run 34038163487 (Ubuntu) went red on exactly that while the file was
// green on Windows: the runner colourises the summary, so ANSI SGR escapes
// land BETWEEN "Tests" and the digit --
// `\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m3 passed\x1b[39m (3)` -- which
// `\s+` does not match, and the extraction returned `null`. The assertion
// message proved it against itself: it printed "Tests  3 passed (3)" in the
// very output it claimed had no match. The first rework stripped the escapes
// and asked the nested runner for no colour, which closed the COLOUR trigger
// but not the failure CLASS -- a future vitest summary-wording change breaks
// the same scrape by a different trigger.
//
// This codebase had already solved the class. DW-107 (Story 1.10) closed an
// IDENTICAL ANSI-colourised-summary-line failure in
// test/export-py-skip-visibility.test.ts by spawning with `--reporter=json
// --outputFile=...` and reading structured fields, and recorded the
// generalized rationale: "a reporter contract cannot drift with a terminal's
// colour support; a human summary line can, and did." This file now follows
// that precedent, and takes it one step further: the harness publishes the
// device-slot views it actually COMPUTED on `task.meta`, which vitest's JSON
// reporter carries verbatim into `assertionResults[].meta`, so even the
// value-level evidence arrives structurally rather than as printed text.
//
// What that buys, concretely -- three assertions in this file used to be
// satisfiable by the harness's own WORDING rather than by its behaviour:
//   - `AD-7`, `bd_trough` and `DW-70` came from `--reporter=verbose`'s
//     rendered test titles. They now come from `assertionResults[].fullName`,
//     which is the same information under a contract instead of a rendering.
//   - `[true,true,true,true]` came from a `console.log` -- but the harness's
//     own case (iii) was TITLED "... is OBSERVED leaving [true,true,true,true]",
//     so the verbose reporter printed that literal for a green run whether or
//     not the body ever computed it. (Found by this pass's verification-gap
//     layer, confirmed against captured output: emptying case (iii)'s body in
//     place left this wrapper fully green.) It now comes from
//     `task.meta.bdTroughAtBoot`, which exists only if the body ran, and the
//     harness's title no longer carries the literal.
// ---------------------------------------------------------------------------

/** One `assertionResults[]` entry of vitest's JSON report, narrowed to what this gate reads. */
interface HarnessAssertion {
	readonly fullName: string;
	readonly status: string;
	readonly meta: Record<string, unknown>;
}

/** Vitest's JSON report, narrowed to what this gate reads. */
interface HarnessReport {
	readonly numTotalTests: number;
	readonly numPassedTests: number;
	readonly assertions: readonly HarnessAssertion[];
}

/**
 * Parse vitest's JSON report into the fields this gate asserts on.
 *
 * Every failure mode throws with a named reason. That is deliberate and is the
 * DW-107 precedent's own rule: a missing, empty, unparseable or contract-broken
 * report must be a LOUD failure, never a silent zero or a `null` that a later
 * assertion quietly tolerates. A tolerant parse here would let a run that
 * executed nothing at all -- or a runner that stopped emitting a field
 * altogether -- slide through as "0 passing", which is exactly the shape of
 * defect this whole gate exists to make impossible.
 *
 * Module-local, not exported: the real assertion below and the synthetic-report
 * regression tests at the bottom of this file exercise the IDENTICAL parse
 * path, so a fix verified only against a live run would leave the malformed
 * cases unpinned.
 */
function parseHarnessReport(raw: string): HarnessReport {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch (cause) {
		throw new Error(
			`the harness's JSON report was not parseable JSON (${String(cause)}) -- if this is vitest's rendered ` +
				`human output rather than a report, the spawn is missing --reporter=json/--outputFile (DW-189). raw:\n${raw.slice(0, 2_000)}`,
		);
	}
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`the harness's JSON report was not an object. raw:\n${raw.slice(0, 2_000)}`);
	}
	const report = parsed as Record<string, unknown>;

	for (const key of ['numTotalTests', 'numPassedTests'] as const) {
		if (typeof report[key] !== 'number') {
			throw new Error(
				`vitest's JSON report is missing a numeric "${key}" -- the reporter contract changed; fix this gate ` +
					`deliberately rather than loosening it. raw:\n${raw.slice(0, 2_000)}`,
			);
		}
	}
	if (!Array.isArray(report.testResults)) {
		throw new Error(`vitest's JSON report has no "testResults" array -- the reporter contract changed. raw:\n${raw.slice(0, 2_000)}`);
	}

	const assertions: HarnessAssertion[] = [];
	for (const file of report.testResults as unknown[]) {
		if (typeof file !== 'object' || file === null || !Array.isArray((file as Record<string, unknown>).assertionResults)) {
			throw new Error(`a "testResults" entry has no "assertionResults" array -- the reporter contract changed. raw:\n${raw.slice(0, 2_000)}`);
		}
		for (const entry of (file as Record<string, unknown>).assertionResults as unknown[]) {
			const assertion = entry as Record<string, unknown>;
			if (typeof assertion?.fullName !== 'string' || typeof assertion?.status !== 'string') {
				throw new Error(`an "assertionResults" entry has no string fullName/status -- the reporter contract changed. raw:\n${raw.slice(0, 2_000)}`);
			}
			assertions.push({
				fullName: assertion.fullName,
				status: assertion.status,
				// `meta` is absent on a runner that stops carrying task metadata; an
				// empty bag then makes the value assertions below fail by name rather
				// than throw here, which reads better at the failure site.
				meta: (typeof assertion.meta === 'object' && assertion.meta !== null ? assertion.meta : {}) as Record<string, unknown>,
			});
		}
	}

	return {
		numTotalTests: report.numTotalTests as number,
		numPassedTests: report.numPassedTests as number,
		assertions,
	};
}

/** Merge every case's `task.meta` bag into one lookup. Keys are distinct per case by construction. */
function mergedMeta(report: HarnessReport): Record<string, unknown> {
	return Object.assign({}, ...report.assertions.map((assertion) => assertion.meta)) as Record<string, unknown>;
}

/**
 * The child environment with every colour-FORCING key removed and `NO_COLOR`
 * set. See the call site for why `FORCE_COLOR: '0'` is not a disable signal.
 * Exported nowhere; kept a named function so the deletion is legible as intent
 * rather than as an incidental destructure.
 */
function childEnvWithoutColour(): NodeJS.ProcessEnv {
	const { FORCE_COLOR: _forceColour, FORCE_TTY: _forceTty, ...rest } = process.env;
	return { ...rest, NO_COLOR: '1' };
}

describe('DW-70: AD-7 ("GameState mutated only inside rules.step") now holds for deviceSlots -- out-of-process harness, post-fix', () => {
	it('the harness process exits 0 and its JSON report shows exactly 3 passing tests, names AD-7 / bd_trough / DW-70, and carries the device-slot values it computed', () => {
		const reportDir = mkdtempSync(path.join(tmpdir(), 'dw-ad7-gate-'));
		const reportPath = path.join(reportDir, 'harness-run.json');
		try {
			const result = spawnSync(
				process.execPath,
				[
					path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
					'run',
					'--config',
					HARNESS_CONFIG,
					'--reporter=json',
					`--outputFile=${reportPath}`,
					// Purely cosmetic now, and deliberately kept: NO assertion in this
					// file reads rendered output any more, but the diagnostic strings
					// below interpolate stdout/stderr into this suite's own failure
					// report, and ANSI escapes there garble the outer CI log. This is
					// the one thing `--no-color` still buys; it is no longer what makes
					// the gate correct (that is the JSON contract above).
					'--no-color',
				],
				{
					cwd: REPO_ROOT,
					encoding: 'utf8',
					timeout: HARD_TIMEOUT_MS,
					// Review finding 2026-09-06 (code-review re-review, blind-hunter +
					// edge-case-hunter, measured): the previous form set
					// `FORCE_COLOR: '0'`, which is not a disable signal for the library
					// vitest actually colours with. tinyrainbow (vitest 4.1.11's
					// dependency) tests for the KEY, not its value --
					// `!("NO_COLOR" in env || argv.includes("--no-color")) &&
					// ("FORCE_COLOR" in env || ...)` -- so `FORCE_COLOR: '0'` ADDS the
					// key and would turn colour ON; it is inert today only because
					// `NO_COLOR` short-circuits ahead of it. Deleting the inherited key
					// is the portable disable, and it removes a line that would silently
					// reverse meaning if `NO_COLOR` were ever dropped as "redundant with
					// --no-color". (vitest's own code uses the opposite, value-based
					// convention `FORCE_COLOR !== '0'`; the two disagree inside one
					// package, which is exactly why "set it to 0" is not portable.)
					env: childEnvWithoutColour(),
					// The JSON report goes to a file, so stdout is now one line -- but a
					// nested run that dies early can still dump to stderr, and at Node's
					// 1 MiB default that is silently TRUNCATED with `result.error` set to
					// ENOBUFS. Matching test/story-2-0-rename-provenance.test.ts:199.
					maxBuffer: 10 * 1024 * 1024,
				},
			);

			const rendered = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

			// Asserted FIRST, and separately from the exit code: a spawn that never
			// launched (a moved vitest entry point -> ENOENT) or one whose output
			// overran maxBuffer (ENOBUFS) yields `status: null`, `signal: null` and
			// empty output, which would otherwise surface as the least informative
			// failure this gate can produce -- "expected null to be 0" against an
			// empty `output:`. (Review finding 2026-09-06, blind-hunter +
			// edge-case-hunter; test/story-2-0-rename-provenance.test.ts:201 already
			// does this and this file did not.)
			expect(result.error, `the harness process could not be spawned at all: ${String(result.error)}`).toBeUndefined();

			expect(result.signal, `the harness process was killed by signal ${String(result.signal)} -- unexpected. output:\n${rendered}`).toBeNull();

			expect(
				result.status,
				`expected the DW-70 gate to PASS now that the violation is fixed -- got exit ${result.status}. output:\n${rendered}`,
			).toBe(0);

			expect(existsSync(reportPath), `the harness run wrote no JSON report at ${reportPath}. output:\n${rendered}`).toBe(true);

			const report = parseHarnessReport(readFileSync(reportPath, 'utf8'));

			// The EXACT passing-test count, never `>= N` (a `>= N` form is
			// satisfied by deleting one of the harness's three `it()` blocks,
			// which is exactly the anti-vacuity mutation this assertion exists to
			// catch -- Rule 19). Read from `numPassedTests`, a field of the
			// reporter contract, so it cannot drift with a terminal's colour
			// support or with vitest's summary wording (DW-107, DW-189).
			expect(
				report.numPassedTests,
				`expected exactly 3 PASSING tests in the harness's JSON report; got ${report.numPassedTests}. output:\n${rendered}`,
			).toBe(3);
			// Independently falsifiable, and not entailed by the line above: a
			// FOURTH harness case that is skipped (or todo) leaves numPassedTests
			// at 3 while numTotalTests moves to 4.
			expect(
				report.numTotalTests,
				`expected the harness to declare exactly 3 tests; got ${report.numTotalTests}. A case added but skipped would ` +
					`leave the passing count at 3, which is why this is asserted separately. output:\n${rendered}`,
			).toBe(3);

			// The content checks, re-derived from `assertionResults[].fullName`
			// (describe titles + test titles) rather than from rendered output.
			const fullNames = report.assertions.map((assertion) => assertion.fullName).join('\n');
			expect(fullNames, 'the harness report must still name AD-7').toContain('AD-7');
			expect(fullNames, 'the harness report must still name bd_trough').toContain('bd_trough');
			expect(fullNames, 'the harness report must still name DW-70').toContain('DW-70');

			// VALUE-level evidence, and the reason a title can no longer stand in
			// for it: these keys are written by the harness's `it()` BODIES onto
			// `task.meta`, so a body replaced in place by `expect(true).toBe(true)`
			// -- which keeps the exit code, the exact passing count AND every
			// title -- leaves them undefined and reddens here by name.
			const meta = mergedMeta(report);
			expect(
				meta.bdTroughAtBoot,
				`the harness must publish the boot-full bd_trough view it actually computed (task.meta.bdTroughAtBoot). meta:\n${JSON.stringify(meta)}`,
			).toEqual([true, true, true, true]);
			expect(
				meta.bdTroughAfterEject,
				`the harness must publish the post-eject bd_trough view it actually computed (task.meta.bdTroughAfterEject). meta:\n${JSON.stringify(meta)}`,
			).toEqual([true, true, true, false]);
			expect(
				meta.bdTroughRulesDerivedAfterEject,
				`the harness must publish the RULES-derived post-eject bd_trough view it cross-checked (task.meta.bdTroughRulesDerivedAfterEject). meta:\n${JSON.stringify(meta)}`,
			).toEqual([true, true, true, false]);
			expect(
				meta.bdTroughPhysicsDerivedAfterEject,
				`the harness must publish the PHYSICS-derived post-eject bd_trough view it cross-checked (task.meta.bdTroughPhysicsDerivedAfterEject). meta:\n${JSON.stringify(meta)}`,
			).toEqual([true, true, true, false]);
		} finally {
			rmSync(reportDir, { recursive: true, force: true });
		}
	});
});

// DW-189 (code-review re-review, 2026-09-06). These cases replace the
// synthetic-ANSI-summary pin the first rework added, and keep its job: the
// wrapper's parse is exercised locally against byte shapes the real spawn will
// never produce on this host, so a defect that is unreproducible on Windows by
// construction still fails here today.
//
// The first case is the direct heir of that pin -- it feeds the EXACT
// colourised bytes CI run 34038163487 emitted and asserts they are now
// REJECTED loudly rather than scraped. That is the whole substance of DW-189:
// human-rendered output is no longer an input this gate can be fooled by,
// coloured or not. The rest pin the contract-drift and wrong-run cases the
// scrape never covered at all.
describe('ad7-device-slots wrapper: the harness result is read from vitest\'s JSON reporter contract, never scraped from rendered output (DW-189; the DW-107 pattern)', () => {
	/** A minimal, well-formed report in vitest's own JSON shape. */
	function reportJson(overrides: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): string {
		return JSON.stringify({
			numTotalTests: 3,
			numPassedTests: 3,
			testResults: [
				{
					name: 'test/fixtures/dw70-ad7/ad7-device-slots.harness.ts',
					assertionResults: [
						{ fullName: 'DW-70 (AD-7): ... (iii) anti-vacuity: bd_trough ...', status: 'passed', meta },
					],
				},
			],
			...overrides,
		});
	}

	it('reads the counts, the titles and the harness\'s own computed values out of a well-formed report', () => {
		const report = parseHarnessReport(reportJson({}, { bdTroughAtBoot: [true, true, true, true] }));

		expect(report.numPassedTests).toBe(3);
		expect(report.numTotalTests).toBe(3);
		expect(report.assertions.map((assertion) => assertion.fullName).join('\n')).toContain('bd_trough');
		expect(mergedMeta(report).bdTroughAtBoot).toEqual([true, true, true, true]);
	});

	it('REJECTS the human summary line -- including the exact ANSI bytes that reddened CI run 34038163487 -- loudly, instead of scraping a count out of it', () => {
		// The exact shape from the CI log: `ESC[2m      Tests ESC[22m
		// ESC[1mESC[32m3 passedESC[39m...`. The old scrape's whole defect was
		// that this string was an INPUT it tried to read a number out of. It is
		// no longer a valid input at all, in either its coloured or its plain
		// form -- which is what closes the failure class rather than the one
		// colour-shaped trigger.
		const colouredSummary = '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m3 passed\x1b[39m\x1b[22m (3)\x1b[0m\n';

		expect(() => parseHarnessReport(colouredSummary)).toThrow(/not parseable JSON/);
		expect(() => parseHarnessReport('Tests  3 passed (3)')).toThrow(/not parseable JSON/);
	});

	it('throws, never yields a silent zero, when the report parses but omits a counter the reporter contract promises', () => {
		expect(() => parseHarnessReport(reportJson({ numPassedTests: undefined }))).toThrow(/missing a numeric "numPassedTests"/);
		expect(() => parseHarnessReport(reportJson({ numTotalTests: '3' }))).toThrow(/missing a numeric "numTotalTests"/);
	});

	it('throws when the report carries no testResults / assertionResults arrays, or an entry with no fullName', () => {
		expect(() => parseHarnessReport(reportJson({ testResults: undefined }))).toThrow(/no "testResults" array/);
		expect(() => parseHarnessReport(reportJson({ testResults: [{ name: 'x' }] }))).toThrow(/no "assertionResults" array/);
		expect(() => parseHarnessReport(reportJson({ testResults: [{ name: 'x', assertionResults: [{ status: 'passed' }] }] }))).toThrow(
			/no string fullName\/status/,
		);
		expect(() => parseHarnessReport('[]')).toThrow(/missing a numeric "numTotalTests"/);
		expect(() => parseHarnessReport('null')).toThrow(/was not an object/);
	});

	it('a report describing a 2-passing-test run yields 2 -- the exact-3 pin above is live, not vacuous', () => {
		// The anti-vacuity mutation this gate exists to catch (one of the
		// harness's three `it()` blocks deleted or skipped) reaches the wrapper
		// as exactly this report shape. Proving the parse propagates the real
		// number is what makes `toBe(3)` above a pin rather than a coincidence.
		expect(parseHarnessReport(reportJson({ numPassedTests: 2 })).numPassedTests).toBe(2);
		expect(parseHarnessReport(reportJson({ numTotalTests: 4 })).numTotalTests).toBe(4);
	});

	it('an emptied harness body reaches the wrapper as an EMPTY meta bag, which is why the value assertions cannot be satisfied by a title', () => {
		// A case whose body was replaced by `expect(true).toBe(true)` still
		// reports `passed`, still carries its full title, and still counts --
		// but publishes nothing on `task.meta`. This is the shape the wrapper's
		// `meta.bdTroughAtBoot` assertion reddens against.
		const gutted = parseHarnessReport(reportJson({}, {}));

		expect(gutted.numPassedTests).toBe(3);
		expect(gutted.assertions.map((assertion) => assertion.fullName).join('\n')).toContain('bd_trough');
		expect(mergedMeta(gutted).bdTroughAtBoot).toBeUndefined();
	});
});

// Review finding 2026-09-06 (code-review, verification-gap -- confirmed by
// mutation at review time): AC 1's own wording, and the spec's frozen `Never`
// clause, are broader than the harness above. AC 1: "no assignment to ANY
// GameState field appears outside src/sim/rules/". `Never`: "Never write any
// GameState field from sim/loop, sim/physics or presentation."
//
// The out-of-process harness observes `deviceSlots` and nothing else, so the
// invariant this story exists to establish was enforced for exactly ONE field.
// Measured: re-introducing DW-70's own defect class on a DIFFERENT field --
// `state = { ...rulesResult.state, players: [] };` at the same seam, which
// wipes every player on every tick and destroys Start, Hot seat, rotation and
// game over outright -- left `pnpm test` at 101 files / 1580 passed / 0 failed
// AND `pnpm check:ad7` at exit 0, 3/3. The goldens cannot see it (they never
// press s_start, so players/currentPlayer/modes never leave their attract
// values) and the harness cannot see it (a spread carries machine.deviceSlots
// by reference, so the `toBe` in assertion (i) still holds).
//
// This gate closes that. It is a SOURCE-level assertion because the invariant
// is itself structural -- "sim/loop constructs GameState once at boot and
// never writes a field of it again" (Design Notes, "The boot seed is
// construction, not mutation") -- and this repository already gates structural
// invariants by reading source (tools/boundary-lint.mjs, the ENTRY_FILES
// import walk in test/rules-devices-headless.test.ts, the DW-79 port-body
// freeze in test/port-provenance.test.ts).
// Review finding 2026-09-06 (code-review re-review, acceptance-auditor): the
// scan was pinned to `src/sim/loop/index.ts` alone while AC 1's wording is
// repo-wide, so a GameState write introduced in `src/sim/loop/replay.ts` -- or
// in any file added under `src/sim/loop/` later -- would escape the ratchet
// entirely. No violation today (measured: `replay.ts` yields zero matches; it
// only READS GameState), which is what makes widening it a ratchet rather than
// a repair. Every `.ts` file in the directory is now scanned, and the two
// permitted writes must be the only ones in the whole directory.
describe('AD-7 (AC 1, whole-invariant): sim/loop writes no GameState field after rules.step() returns -- EVERY field, not only deviceSlots', () => {
	const LOOP_DIR = path.join(REPO_ROOT, 'src', 'sim', 'loop');
	const LOOP_SOURCE = path.join(LOOP_DIR, 'index.ts');

	/** Every assignment to the `state` binding itself. `ball.state = `, `nextState = ` and `stateAfterAccounting = ` are deliberately NOT matched. */
	function stateAssignments(source: string): string[] {
		const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
		return withoutComments
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => /(?<![.\w$])state\s*(?::[^=]*)?=(?!=)/.test(line));
	}

	it('the only two writes to the `state` binding are the boot construction and `state = rulesResult.state;`', () => {
		const assignments = stateAssignments(readFileSync(LOOP_SOURCE, 'utf8'));

		expect(
			assignments.length,
			`expected exactly two writes to sim/loop's \`state\` binding -- the boot construction and the ` +
				`post-rules.step() assignment -- found ${assignments.length}:\n${assignments.join('\n')}`,
		).toBe(2);

		expect(
			assignments[0],
			'the first write must be the boot construction of the initial GameState (Design Notes: construction, not mutation)',
		).toBe('let state: GameState = {');

		expect(
			assignments[1],
			`the second write must assign rules.step()'s returned GameState WHOLE -- any spread, any field override, is ` +
				`DW-70's own defect class on another field (AC 1: "no assignment to any GameState field appears outside ` +
				`src/sim/rules/"). Found: ${assignments[1]}`,
		).toBe('state = rulesResult.state;');
	});

	it('no OTHER file under src/sim/loop/ writes the `state` binding at all -- AC 1 is repo-wide, not index.ts-wide', () => {
		const siblings = readdirSync(LOOP_DIR).filter((entry) => entry.endsWith('.ts') && entry !== 'index.ts');

		// Anti-vacuity: if the directory listing ever comes back empty (a moved
		// directory, a changed extension convention), the loop below would assert
		// nothing at all and pass silently. `replay.ts` is the file that exists
		// today; the floor is "at least one sibling", not a hardcoded list.
		expect(
			siblings.length,
			`expected at least one sibling module under ${LOOP_DIR} besides index.ts -- found none, which would make ` +
				`the per-file assertions below vacuous. Entries: ${readdirSync(LOOP_DIR).join(', ')}`,
		).toBeGreaterThan(0);

		for (const sibling of siblings) {
			const assignments = stateAssignments(readFileSync(path.join(LOOP_DIR, sibling), 'utf8'));
			expect(
				assignments,
				`src/sim/loop/${sibling} writes the \`state\` binding, which AC 1 forbids outside src/sim/rules/ ` +
					`("no assignment to any GameState field appears outside src/sim/rules/"). Only index.ts's boot ` +
					`construction and its post-rules.step() assignment are permitted. Found:\n${assignments.join('\n')}`,
			).toEqual([]);
		}
	});

	it('sanity: the scan finds real writes and rejects the three near-misses -- it is discriminating, not vacuously empty', () => {
		expect(stateAssignments('let state: GameState = {\n\tstate = rulesResult.state;\n')).toHaveLength(2);
		expect(stateAssignments('const nextState: GameState = { ...x };')).toHaveLength(0);
		expect(stateAssignments('const stateAfterAccounting: GameState = state;')).toHaveLength(0);
		expect(stateAssignments('before.set(ball, ball.state.pos);')).toHaveLength(0);
	});
});
