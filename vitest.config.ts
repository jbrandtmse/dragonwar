// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		// 'verbose' (rather than the default reporter) so the Node per-tick mean/p95
		// cost report (test/spike-1.test.ts) prints on a plain `pnpm test` run, not
		// only with an explicit --reporter flag. See spec-1-1's Verification section.
		reporters: ['verbose'],
		// The Node correctness leg steps 10,000 ticks over six balls per test — several
		// seconds each on this host, and more on a shared CI runner (Story 1.2). Vitest's
		// 5s default is not enough: the bounds test alone crossed it as soon as the
		// harness gravity was corrected to a real 6.5 deg playfield. A generous ceiling
		// here is a hang guard, not a performance assertion — the cost figures that
		// matter are reported by the spike, never asserted by a timeout.
		testTimeout: 60_000,
	},
});
