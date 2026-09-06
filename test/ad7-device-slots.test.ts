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
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_CONFIG = path.join(REPO_ROOT, 'test', 'fixtures', 'dw70-ad7', 'vitest.harness.config.ts');
const HARD_TIMEOUT_MS = 30_000;

describe('DW-70: AD-7 ("GameState mutated only inside rules.step") now holds for deviceSlots -- out-of-process harness, post-fix', () => {
	it('the harness process exits 0, reports exactly 3 passing tests, and the output still names AD-7 and bd_trough', () => {
		// `--reporter=verbose`: a fully PASSING run's default reporter prints
		// only a summary line, never the individual describe/it titles -- those
		// only appear on a FAILURE. Since this gate is now expected to PASS
		// (post-fix), the titles (which carry "AD-7" and "bd_trough") need the
		// verbose reporter to appear in stdout at all.
		const result = spawnSync(
			process.execPath,
			[path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', HARNESS_CONFIG, '--reporter=verbose'],
			{ cwd: REPO_ROOT, encoding: 'utf8', timeout: HARD_TIMEOUT_MS },
		);

		const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

		expect(
			result.signal,
			`the harness process was killed by signal ${String(result.signal)} -- unexpected. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		).toBeNull();

		expect(
			result.status,
			`expected the DW-70 gate to PASS now that the violation is fixed -- got exit ${result.status}. output:\n${output}`,
		).toBe(0);

		// The EXACT passing-test count, never `>= N` (a `>= N` form is
		// satisfied by deleting one of the harness's three `it()` blocks,
		// which is exactly the anti-vacuity mutation this assertion exists to
		// catch -- Rule 19). Today's all-passing run emits vitest's own
		// "Tests  3 passed (3)" summary line; the pattern tolerates variable
		// whitespace.
		const match = /Tests\s+(\d+)\s+passed/.exec(output);
		expect(match, `expected a "Tests N passed" summary in the harness output; got:\n${output}`).not.toBeNull();
		expect(Number(match?.[1]), `expected exactly 3 passing tests; got ${match?.[1]} from output:\n${output}`).toBe(3);

		expect(output, 'the output must still name AD-7').toContain('AD-7');
		expect(output, 'the output must still name bd_trough').toContain('bd_trough');
	});
});
