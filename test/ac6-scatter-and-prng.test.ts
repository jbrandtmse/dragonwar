// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Epic 1 AC 6 (as amended -- spec Design Notes, "AC 6 has no PRNG to count"):
// "scatter is 0 on every material and the physics PRNG is never drawn,
// asserted by a test." There IS no physics PRNG to count draws from --
// `deterministicScatterUnit()` (src/sim/physics/ball/ball-hit.ts) always
// returns 0, and a naive `expect(prngDraws).toBe(0)` would be EXACTLY the
// vacuity shape this story's sweep exists to hunt (a counter that can only
// ever read zero -- Code Map, Part D). The honest form is three separate,
// independently falsifiable claims:
//   1. Every declared material's `scatter` tunable resolves to 0.
//   2. The `Math.random` token ban under sim/** holds (already pinned by a
//      REAL, failing-capable check -- test/boundary-lint.test.ts's red-path
//      fixture over test/fixtures/boundary/src/sim/banned-globals.ts).
//   3. The `scatterAngle > 1.0e-5` branch (ball-hit.ts:406) is unreachable
//      UNDER THE RESOLVED TUNING -- proven from its own two inputs, both
//      independently asserted here: every material's scatter is 0 (claim 1)
//      and HARD_SCATTER (the branch's own fallback for a negative material
//      scatter) is 0 too, so `scatterAngle` is 0 * globalDifficulty = 0 in
//      EVERY reachable configuration, and 0 > 1.0e-5 is false.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/sim/table/tuning';
import { HARD_SCATTER } from '../src/sim/physics/functions';

const REPO_ROOT = path.resolve(__dirname, '..');
const BOUNDARY_LINT_SCRIPT = path.join(REPO_ROOT, 'tools', 'boundary-lint.mjs');

describe('AC 6 (amended): scatter is 0 on every material, and the physics PRNG is never drawn -- the honest three claims', () => {
	it('1. every declared phys_material carries scatter.value === 0', () => {
		const materials = TUNING.materials as Record<string, { readonly scatter: { readonly value: number } }>;
		const names = Object.keys(materials);
		// Sanity: this must find real materials, or the loop below is vacuous.
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			expect(materials[name]!.scatter.value, `TUNING.materials.${name}.scatter.value must be 0`).toBe(0);
		}
	});

	it('2. the Math.random token ban under sim/** holds -- a REAL, failing-capable check (not merely absence-by-inspection)', () => {
		// This re-runs the exact tool test/boundary-lint.test.ts's own
		// "repository as committed" describe block already exercises against
		// the real tree; that file's OWN red-path fixture
		// (test/fixtures/boundary/src/sim/banned-globals.ts) is what proves
		// this check can actually fail, not merely that it currently reports
		// nothing -- see that file for the failing-capable half of this claim.
		const result = spawnSync(process.execPath, [BOUNDARY_LINT_SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' });
		expect(result.status, `pnpm lint:boundaries must exit 0 against the real repository -- among its checks is the Math.random ban under sim/**. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
		expect(result.stdout, 'must report a real, non-empty scan (not a vacuous empty-graph pass)').toMatch(/OK -- \d+ \.ts file\(s\)/);
	});

	it('3. the scatterAngle > 1.0e-5 branch (ball-hit.ts) is unreachable under the resolved tuning -- proven from its own two inputs', () => {
		// ball-hit.ts's own logic (read directly, not re-executed here -- the
		// method is private and deep inside a large collision routine):
		//   scatterAngle = (material.scatter.value < 0 ? HARD_SCATTER : material.scatter.value) * globalDifficulty;
		//   if (dot > 1.0 && scatterAngle > 1.0e-5) { ... deterministicScatterUnit() ... }
		// Both of scatterAngle's own possible sources are asserted 0 here,
		// independently of claim 1 above (this claim must survive even if
		// claim 1's own assertion were ever weakened) -- so scatterAngle is
		// EXACTLY 0 in every configuration `resolveTuning()` can produce, and
		// `0 > 1.0e-5` is false. HARD_SCATTER is a plain top-level exported
		// constant (src/sim/physics/functions.ts), asserted directly.
		expect(HARD_SCATTER, 'HARD_SCATTER (the scatterAngle fallback for a negative material scatter) must be 0').toBe(0);

		const materials = TUNING.materials as Record<string, { readonly scatter: { readonly value: number } }>;
		for (const name of Object.keys(materials)) {
			const value = materials[name]!.scatter.value;
			expect(value, `TUNING.materials.${name}.scatter.value must be 0 (both scatterAngle inputs are checked in this test, independently of claim 1's own test)`).toBe(0);
			// Review finding 2026-08-29: a `const scatterAngle = value *
			// globalDifficulty; expect(scatterAngle).toBeLessThanOrEqual(1e-5)`
			// loop sat here. With `value` asserted `toBe(0)` on the line above,
			// that is `0 * g <= 1e-5` for a fixed list of g -- arithmetically
			// incapable of failing. Worse, it RE-IMPLEMENTED ball-hit.ts's
			// formula in the test rather than observing it, so changing the real
			// one (e.g. `scatterAngle += 0.5`) made the branch reachable while
			// this stayed green. Removed; the source-text pin after this loop
			// observes the production arithmetic instead.
		}

		// The arithmetic itself, OBSERVED rather than re-implemented: a
		// source-text pin on ball-hit.ts's own lines, the same technique
		// test/hardware-rule-seam.test.ts uses on machine.ts. Its honest limit
		// is the same too -- it catches a changed formula, not a changed
		// meaning. Its complement is this story's own DW-79 port-body freeze
		// (test/port-provenance.test.ts), which fails loudly and by name on ANY
		// edit to ball-hit.ts; together they mean the claim above cannot go
		// stale silently.
		const ballHitSource = readFileSync(path.join(REPO_ROOT, 'src', 'sim', 'physics', 'ball', 'ball-hit.ts'), 'utf8');
		expect(
			ballHitSource,
			'ball-hit.ts must still derive scatterAngle by MULTIPLYING the material value by globalDifficulty -- if that changed, scatterAngle no longer reduces to 0 for a 0-scatter material and this whole claim needs re-deriving',
		).toContain('scatterAngle *= this.tableData.globalDifficulty');
		expect(
			ballHitSource,
			'ball-hit.ts must still gate the scatter branch on `scatterAngle > 1.0e-5` -- the exact threshold this claim reasons about',
		).toContain('scatterAngle > 1.0e-5');
		expect(
			ballHitSource,
			"ball-hit.ts must still substitute HARD_SCATTER only for a NEGATIVE material scatter -- the other of scatterAngle's two sources, asserted 0 above",
		).toContain('HARD_SCATTER');
	});
});
