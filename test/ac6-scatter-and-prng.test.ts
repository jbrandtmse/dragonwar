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
			// scatterAngle's own formula, applied here for every real
			// globalDifficulty a scene could plausibly carry: 0 for every value.
			for (const globalDifficulty of [0, 0.5, 1, 2, 100]) {
				const scatterAngle = value * globalDifficulty;
				expect(scatterAngle, `scatterAngle for material "${name}" at globalDifficulty ${globalDifficulty} must never exceed 1.0e-5`).toBeLessThanOrEqual(1.0e-5);
			}
		}
	});
});
