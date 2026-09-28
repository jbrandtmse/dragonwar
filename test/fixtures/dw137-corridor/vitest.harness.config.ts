// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-137's out-of-process check -- mirrors
// test/fixtures/dw70-ad7/vitest.harness.config.ts's own shape and its own
// stated reason (DW-70, Story 1.8): `include` matches ONLY `*.harness.ts`
// files under this directory, so this harness never runs as part of the
// default `pnpm test` suite (whose own `vitest.config.ts`, out of this
// story's footprint, matches `test/**/*.test.ts` only -- a `*.harness.ts`
// file never matches that pattern either, so no `exclude` entry is even
// needed there). Run only via the `check:corridor` script in
// `package.json`.
//
// [STORY 2.1f] This project used to carry a deliberately-RED harness
// (DW-137: the bottom-right corridor did not admit a ball into the Ramp
// channel) plus an in-suite wrapper, `test/dw137-corridor-gate.test.ts`,
// that spawned it and asserted the failure's own CONTENT. Story 2.1f
// re-solved the corridor, so the harness is now INTENDED GREEN and the
// wrapper is removed: an intended-red wrapper around a green check asserts
// nothing at all, and its own header anticipated exactly this. The harness
// itself stays, out of `pnpm test` and out of CI's fixed script list, for
// the same cost/opt-in reason it always had -- run it whenever the committed
// geometry moves. `pnpm check:ad7` (DW-70, Story 2.5) is now the only
// intended-red check in the repository.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/fixtures/dw137-corridor/**/*.harness.ts'],
	},
});
