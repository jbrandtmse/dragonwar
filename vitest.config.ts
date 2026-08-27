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
	},
});
