// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1c, DW-137's red test (spec's own "Tasks & Acceptance", the
// "2026-09-03 -- lead rework dispatch (final iteration)" dated heading,
// item 1) -- the IN-SUITE wrapper, mirroring test/ad7-device-slots.test.ts's
// own precedent (DW-70, Story 1.8): spawns the nested vitest project at
// test/fixtures/dw137-corridor/vitest.harness.config.ts (the same config
// `pnpm check:corridor` runs) as a subprocess, and asserts it fails WITH
// CONTENT -- not merely a non-zero exit code. `it.fails()` is deliberately
// NOT used here, for the same reason DW-70's own wrapper avoids it: it
// passes on ANY throw and cannot distinguish "failed for the DW-137 reason"
// from "the harness broke" (a stale import, a typo) -- the exact
// polarity-inverted vacuity shape this whole story's Phase 1 exists to
// hunt.
//
// This keeps `pnpm test` (and CI, which runs a fixed script list that never
// invokes `check:corridor`) GREEN while the live DW-137 defect -- the
// bottom-right corridor does not admit a ball into the Ramp channel -- is
// named by a real, running, failing assertion one command away (`pnpm
// check:corridor`). Story 2.1f's own AC (epics.md) requires this gate to go
// GREEN when the corridor is re-solved -- at which point THIS wrapper
// (asserting the harness fails) goes red by design, and 2.1f removes the
// intended-red documentation in the same change (see AGENTS.md,
// epic-2-context.md and this file's own header, mirroring DW-70's own
// documentation convention).
//
// Review finding (this pass): the `DW-137` / `2.1f` content checks below
// are, individually, satisfiable by Vitest's own FAIL header alone -- it
// echoes the harness's own `describe`/`it` titles on ANY failure in that
// file (a stale import, an unrelated throw), not only the intended
// corridor-shortfall failure. DW-70's own wrapper documents this exact gap
// (`test/ad7-device-slots.test.ts`'s own header) and closes it with two
// further assertions that are NOT title-echoable -- hardcoded literal
// values that appear only inside the harness's own failure MESSAGE, never
// in a title. `EXPECTED_SHORTFALL_MM` below is this file's equivalent: a
// hardcoded snapshot of the measured shortfall (not recomputed from the
// live collision document via the same formula the harness itself uses --
// that would let a shared bug in the shared formula pass both sides
// silently), so it appears only inside `ramp-corridor.harness.ts`'s own
// custom assertion message, never in a title. If Story 2.1f moves
// `col_sling_r` or `col_ramp_wall_l` without yet closing the corridor, this
// constant goes stale and must be updated by hand (or, more likely, 2.1f
// removes this whole file per its own AC, since the gate is expected to go
// green in that story, not merely change its number).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_CONFIG = path.join(REPO_ROOT, 'test', 'fixtures', 'dw137-corridor', 'vitest.harness.config.ts');
const HARD_TIMEOUT_MS = 30_000;

/**
 * A hardcoded snapshot of `ramp-corridor.harness.ts`'s own measurement
 * (`col_sling_r`'s west face 314.000 minus the 13.495 mm ball radius =
 * 300.505 mm reachable, vs. `col_ramp_wall_l`'s east face 338.000 plus the
 * ball radius = 351.495 mm needed) -- deliberately NOT recomputed from the
 * live collision document here, so this check is independent of the
 * harness's own formula (see this file's own header).
 */
const EXPECTED_SHORTFALL_MM = '50.990';

describe('DW-137: the bottom-right corridor does not admit a ball into the Ramp channel -- out-of-process harness', () => {
	it('the harness process exits non-zero, and the failure content names DW-137, Story 2.1f and the measured shortfall (asserting the REASON, not just the exit code)', () => {
		const result = spawnSync(
			process.execPath,
			[path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', HARNESS_CONFIG],
			{ cwd: REPO_ROOT, encoding: 'utf8', timeout: HARD_TIMEOUT_MS },
		);

		expect(
			result.error,
			`spawning the DW-137 harness process itself failed (before it could run any test) -- ${String(result.error)}`,
		).toBeUndefined();

		expect(
			result.signal,
			`the harness process was killed by signal ${String(result.signal)} -- unexpected. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		).toBeNull();

		const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

		// DW-137 is a live, pre-existing defect (chartered into Story 2.1f) --
		// this harness is expected to FAIL. A zero exit here would mean either
		// the corridor was re-solved (Story 2.1f's own AC: "that gate goes
		// green ... and its intended-red documentation is removed in the same
		// change" -- update THIS test then, not the harness) or the harness
		// broke in a way that made it vacuously pass, which the content
		// assertions below rule out.
		expect(
			result.status,
			`expected the DW-137 harness to fail (it is a live, pre-existing corridor defect) -- got exit ${result.status}. output:\n${output}`,
		).not.toBe(0);

		expect(output, 'the failure output must name DW-137').toContain('DW-137');
		expect(output, 'the failure output must name Story 2.1f (the story chartered to re-solve the corridor)').toContain('2.1f');

		// The distinguishing check (see this file's own header): a hardcoded
		// literal, not recomputed from the same formula the harness uses, so a
		// shared bug in that formula cannot make both sides agree silently.
		expect(
			output,
			`the failure output must name the measured shortfall (${EXPECTED_SHORTFALL_MM} mm)`,
		).toContain(EXPECTED_SHORTFALL_MM);
	});
});
