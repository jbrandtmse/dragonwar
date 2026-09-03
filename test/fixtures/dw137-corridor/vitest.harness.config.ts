// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1c, DW-137's red test -- mirrors
// test/fixtures/dw70-ad7/vitest.harness.config.ts's own shape and its own
// stated reason (DW-70, Story 1.8): `include` matches ONLY `*.harness.ts`
// files under this directory, so this harness never runs as part of the
// default `pnpm test` suite (whose own `vitest.config.ts`, out of this
// story's footprint, matches `test/**/*.test.ts` only -- a `*.harness.ts`
// file never matches that pattern either, so no `exclude` entry is even
// needed there). Run only via the `check:corridor` script in
// `package.json`.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/fixtures/dw137-corridor/**/*.harness.ts'],
	},
});
