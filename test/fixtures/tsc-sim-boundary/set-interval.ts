// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `setInterval`
// reference, as if it leaked into src/sim/**. Must fail under
// tsconfig.sim.json (TS2304).

export function scheduleRepeat(): void {
	setInterval(() => {
		/* no-op */
	}, 0);
}
