// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5, task 9: the IN-SUITE wrapper, REWRITTEN in the same change that
// fixes DW-70 -- mirroring test/solver-termination.test.ts's own precedent,
// spawns the nested vitest project at
// test/fixtures/dw70-ad7/vitest.harness.config.ts (the same config
// `pnpm check:ad7` runs) as a subprocess, and asserts it now PASSES, with an
// EXACT passing-test count, naming AD-7 and bd_trough in its output.
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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_CONFIG = path.join(REPO_ROOT, 'test', 'fixtures', 'dw70-ad7', 'vitest.harness.config.ts');
const HARD_TIMEOUT_MS = 30_000;

// Story 2.5, [CI] rework (2026-09-06): run 34038163487 failed on Ubuntu while
// this file was green on Windows. The CI runner colourises the nested
// harness's vitest summary line -- ANSI SGR escapes land BETWEEN "Tests" and
// the digit, e.g. `\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m3 passed\x1b[39m
// (3)`, which `\s+` does not match, so the extraction returned `null`. The
// assertion message proved it against itself: it printed "Tests  3 passed
// (3)" in the very output it claimed had no match. Unreproducible on Windows
// by construction -- Git Bash pipes give plain output even under
// `FORCE_COLOR=1` -- so the fix is belt-and-braces: strip escapes from the
// captured output before matching AND ask the nested runner for no colour in
// the first place. Either alone would have prevented the CI failure; the
// strip is what keeps this assertion robust against a future runner that
// colourises regardless of the flag/env.
// Review finding 2026-09-06 (build-auto step-04, blind-hunter + edge-case-hunter,
// this [CI] rework): matching only the `m`-terminated SGR form understated the
// pattern's own "robust against a future runner" claim -- any CSI escape (cursor
// movement, erase, etc.) ends in a different final letter and would have survived
// the strip. Widened to any CSI sequence terminated by a letter; still anchored on
// the literal ESC+`[` prefix, so it cannot match ordinary text.
// eslint-disable-next-line no-control-regex -- deliberately matching ANSI/CSI escape bytes
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Strip ANSI/CSI colour/style escapes from captured subprocess output. */
function stripAnsi(text: string): string {
	return text.replace(ANSI_ESCAPE_PATTERN, '');
}

/**
 * Pull vitest's "Tests N passed" summary count out of combined stdout+stderr,
 * ANSI-proof. Factored out as its own function (module-local, not exported) so
 * the real assertion below and the synthetic-coloured-input regression test
 * exercise the IDENTICAL extraction path -- a fix verified only against the
 * real assertion would leave the exact byte shape that broke CI unpinned
 * locally.
 */
function extractPassingCount(rawOutput: string): number | null {
	const match = /Tests\s+(\d+)\s+passed/.exec(stripAnsi(rawOutput));
	return match ? Number(match[1]) : null;
}

describe('DW-70: AD-7 ("GameState mutated only inside rules.step") now holds for deviceSlots -- out-of-process harness, post-fix', () => {
	it('the harness process exits 0, reports exactly 3 passing tests, and the output still names AD-7 and bd_trough', () => {
		// `--reporter=verbose`: a fully PASSING run's default reporter prints
		// only a summary line, never the individual describe/it titles -- those
		// only appear on a FAILURE. Since this gate is now expected to PASS
		// (post-fix), the titles (which carry "AD-7" and "bd_trough") need the
		// verbose reporter to appear in stdout at all.
		const result = spawnSync(
			process.execPath,
			[path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', HARNESS_CONFIG, '--reporter=verbose', '--no-color'],
			{
				cwd: REPO_ROOT,
				encoding: 'utf8',
				timeout: HARD_TIMEOUT_MS,
				// Belt and braces alongside `--no-color` above (CI rework,
				// 2026-09-06): the CI runner colourised vitest's summary line
				// even without either signal being explicitly requested by the
				// pre-fix spawn, so both are set rather than relying on either
				// alone.
				env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
			},
		);

		const rawOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
		// All downstream assertions read the STRIPPED output, per task item 4
		// ("check the sibling assertions in the same file for the same ANSI
		// fragility") -- a colourised run could in principle interleave escapes
		// around any of the literal substrings below, not only the "Tests N
		// passed" summary the regex targets.
		const output = stripAnsi(rawOutput);

		expect(
			// Review finding 2026-09-06 (build-auto step-04, blind-hunter, this [CI]
			// rework): this message previously interpolated the raw, potentially
			// colourised stdout/stderr while the assertion immediately below already
			// reads the ANSI-stripped `output` -- inconsistent within the same test,
			// and the one sibling spot task item 4's ANSI-fragility sweep had missed.
			result.signal,
			`the harness process was killed by signal ${String(result.signal)} -- unexpected. output:\n${output}`,
		).toBeNull();

		expect(
			result.status,
			`expected the DW-70 gate to PASS now that the violation is fixed -- got exit ${result.status}. output:\n${output}`,
		).toBe(0);

		// The EXACT passing-test count, never `>= N` (a `>= N` form is
		// satisfied by deleting one of the harness's three `it()` blocks,
		// which is exactly the anti-vacuity mutation this assertion exists to
		// catch -- Rule 19). Today's all-passing run emits vitest's own
		// "Tests  3 passed (3)" summary line; the extraction tolerates
		// variable whitespace AND (CI rework, 2026-09-06) ANSI colour codes
		// interposed between "Tests" and the digit -- `extractPassingCount()`
		// strips those before matching, and is the same function the
		// synthetic-coloured-input regression test below pins directly.
		const passingCount = extractPassingCount(rawOutput);
		expect(passingCount, `expected a "Tests N passed" summary in the harness output; got:\n${output}`).not.toBeNull();
		expect(passingCount, `expected exactly 3 passing tests; got ${String(passingCount)} from output:\n${output}`).toBe(3);

		expect(output, 'the output must still name AD-7').toContain('AD-7');
		expect(output, 'the output must still name bd_trough').toContain('bd_trough');
		// Review finding 2026-09-06 (code-review, blind-hunter): the pre-fix
		// wrapper asserted the output named DW-70 too; the harness's own
		// describe title still carries it, so restoring the check is free.
		expect(output, 'the output must still name DW-70').toContain('DW-70');

		// Review finding 2026-09-06 (code-review, verification-gap): the three
		// assertions above are satisfied by the harness's TEST TITLES alone,
		// which --reporter=verbose prints on a green run -- so a harness whose
		// three `it()` bodies were replaced in place by `expect(true).toBe(true)`
		// would keep the exit code, the exact passing count AND the titles, and
		// pass every assertion above while verifying nothing (the count catches
		// a DELETED test, not an EMPTIED one). The harness now prints both
		// device-slot views unconditionally, so the wrapper can assert on a
		// VALUE it computed rather than on its own wording -- restoring the
		// value-level evidence the pre-fix wrapper carried at its own `:69`/`:73`.
		expect(
			output,
			`the harness must print the boot-full bd_trough view it actually computed; got:
${output}`,
		).toContain('[true,true,true,true]');
		expect(
			output,
			`the harness must print the post-eject bd_trough view it actually computed; got:
${output}`,
		).toContain('[true,true,true,false]');
	});
});

// Story 2.5, [CI] rework (2026-09-06): run 34038163487 failed on Ubuntu on
// exactly this extraction, and it could not be reproduced locally by
// construction -- Git Bash pipes give plain output even under
// `FORCE_COLOR=1`, on both the outer and the nested command. This pins the
// extraction against the exact byte shape the CI log showed, independent of
// any runner's actual colourisation behaviour, converting an
// unreproducible-on-Windows defect into one that fails locally today without
// the fix.
describe('ad7-device-slots wrapper: passing-count extraction is ANSI-proof (CI rework, run 34038163487)', () => {
	it('extracts 3 from a synthetic summary line carrying the exact ANSI SGR byte shape the CI runner emitted', () => {
		// The exact shape from the CI log: `ESC[2m      Tests ESC[22m
		// ESC[1mESC[32m3 passedESC[39m...` -- ANSI codes sit between "Tests"
		// and the digit, which `\s+` alone does not match.
		const colouredSummary = '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m3 passed\x1b[39m\x1b[22m (3)\x1b[0m\n';

		expect(extractPassingCount(colouredSummary)).toBe(3);
	});

	it('sanity: still extracts from a plain, uncoloured summary line (the pre-CI-fix case must keep working)', () => {
		expect(extractPassingCount('Tests  3 passed (3)')).toBe(3);
	});

	it('returns null, not a false count, when no "Tests N passed" summary is present', () => {
		expect(extractPassingCount('\x1b[31mTest Files  1 failed\x1b[39m')).toBeNull();
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
describe('AD-7 (AC 1, whole-invariant): sim/loop writes no GameState field after rules.step() returns -- EVERY field, not only deviceSlots', () => {
	const LOOP_SOURCE = path.join(REPO_ROOT, 'src', 'sim', 'loop', 'index.ts');

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

	it('sanity: the scan finds real writes and rejects the three near-misses -- it is discriminating, not vacuously empty', () => {
		expect(stateAssignments('let state: GameState = {\n\tstate = rulesResult.state;\n')).toHaveLength(2);
		expect(stateAssignments('const nextState: GameState = { ...x };')).toHaveLength(0);
		expect(stateAssignments('const stateAfterAccounting: GameState = state;')).toHaveLength(0);
		expect(stateAssignments('before.set(ball, ball.state.pos);')).toHaveLength(0);
	});
});
