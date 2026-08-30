// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `setTimeout` reference,
// as if it leaked into src/sim/**. Must fail under tsconfig.sim.json
// (TS2304) -- sim/ owns no wall-clock scheduling (AD-3).

export function scheduleOnce(): void {
	setTimeout(() => {
		/* no-op */
	}, 0);
}
