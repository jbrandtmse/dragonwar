// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `performance` reference,
// as if it leaked into src/sim/**. Must fail under tsconfig.sim.json
// (TS2304) -- sim/ has no wall clock (AD-3).

export function readNowMs(): number {
	return performance.now();
}
