// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5, ledger DW-8 -- the nested vitest project `test/
// solver-termination.test.ts` spawns to run `wedge.harness.ts` out of
// process. `include` matches ONLY `*.harness.ts` files under this directory,
// so this harness never runs as part of the default `pnpm test` suite (whose
// own `vitest.config.ts`, out of this story's footprint, matches
// `test/**/*.test.ts` only -- a `*.harness.ts` file never matches that
// pattern either, so no `exclude` entry is even needed there).

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/fixtures/solver-termination/**/*.harness.ts'],
	},
});
