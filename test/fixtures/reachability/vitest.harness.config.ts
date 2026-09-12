// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1e, `pnpm check:reachability` -- mirrors
// test/fixtures/dw137-corridor/vitest.harness.config.ts's and
// test/fixtures/dw70-ad7/vitest.harness.config.ts's own shape and their own
// stated reason: `include` matches ONLY `*.harness.ts` files under this
// directory, so this harness never runs as part of the default `pnpm test`
// suite (`vitest.config.ts`'s own `include` matches `test/**/*.test.ts`
// only -- a `*.harness.ts` file never matches that pattern either). Unlike
// its two siblings, this check is intended GREEN and carries no in-suite
// wrapper (package.json task 9's own reasoning: a wrapper would either spawn
// the dense sweep inside `pnpm test`, defeating the cost split this story's
// Design Notes describe, or assert a failure that must not occur). Run only
// via the `check:reachability` script in `package.json`.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/fixtures/reachability/**/*.harness.ts'],
		// 'verbose' rather than the default reporter, matching vitest.config.ts's
		// own convention -- the default reporter swallows a PASSING test's own
		// console output, and this harness's whole point (per-case verdicts,
		// the number of releases evaluated) is meant to be read on every run,
		// not only on a failure.
		reporters: ['verbose'],
		// The dense sweep below is a single long-running `it()`, not many
		// short ones -- Vitest's 5 s default is nowhere near enough for a
		// deliberately exhaustive, hundreds-of-trajectories search. This
		// mirrors this project's own precedent for a single expensive case
		// (test/spike-1.test.ts's own reporting timeout).
		//
		// [CODE REVIEW, Story 2.15] Was 180_000, set when the sweep built 644
		// recipes and ran ~75-131 s. Story 2.15's axis (c) took it to 681
		// recipes and 138-151 s measured at this tree, leaving this hard stop
		// only ~19% above the worst observed figure -- a modestly slower host
		// would fail `pnpm check:reachability` on the clock rather than on a
		// verdict. Raised to 300_000, restoring roughly the headroom the
		// 180_000 figure originally carried.
		testTimeout: 300_000,
	},
});
