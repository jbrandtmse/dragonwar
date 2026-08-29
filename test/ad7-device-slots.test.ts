// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8, DW-70's red test -- the IN-SUITE wrapper, mirroring
// test/solver-termination.test.ts's own precedent: spawns the nested vitest
// project at test/fixtures/dw70-ad7/vitest.harness.config.ts (the same
// config `pnpm check:ad7` runs) as a subprocess, and asserts it fails WITH
// CONTENT -- not merely a non-zero exit code. `it.fails()` is deliberately
// NOT used here (spec Design Notes, "DW-70 gets a red test"): it passes on
// ANY throw and cannot distinguish "failed for the DW-70 reason" from "the
// harness broke" (a stale import, a typo) -- the exact polarity-inverted
// vacuity shape this whole story's sweep exists to hunt, made worse here
// because tsconfig.node.json:31 excludes test/fixtures/** from typecheck, so
// a broken import gets NO safety net from `pnpm typecheck` either.
//
// This keeps `pnpm test` (and CI, which runs a fixed script list that never
// invokes `check:ad7`) GREEN while the live AD-7 violation is named by a
// real, running, failing assertion one command away (`pnpm check:ad7`).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_CONFIG = path.join(REPO_ROOT, 'test', 'fixtures', 'dw70-ad7', 'vitest.harness.config.ts');
const HARD_TIMEOUT_MS = 30_000;

describe('DW-70: AD-7 ("GameState mutated only inside rules.step") is violated by deviceSlots -- out-of-process harness', () => {
	it('the harness process exits non-zero, and the failure content names DW-70, AD-7 and bd_trough (asserting the REASON, not just the exit code)', () => {
		const result = spawnSync(
			process.execPath,
			[path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', HARNESS_CONFIG],
			{ cwd: REPO_ROOT, encoding: 'utf8', timeout: HARD_TIMEOUT_MS },
		);

		expect(
			result.signal,
			`the harness process was killed by signal ${String(result.signal)} -- unexpected. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		).toBeNull();

		const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

		// DW-70 is a LIVE violation -- this harness is expected to FAIL. A
		// zero exit here would mean either the violation was fixed (great --
		// but this test, not the harness, is what should then be updated to
		// reflect that; see this file's own header) or the harness broke in a
		// way that made it vacuously pass, which the content assertions below
		// are what rules out.
		expect(result.status, `expected the DW-70 harness to fail (it is a live, uncaught AD-7 violation) -- got exit ${result.status}. output:\n${output}`).not.toBe(0);

		expect(output, 'the failure output must name DW-70').toContain('DW-70');
		expect(output, 'the failure output must name AD-7').toContain('AD-7');
		expect(output, 'the failure output must name bd_trough (the scoped slot this harness checks)').toContain('bd_trough');
	});
});
