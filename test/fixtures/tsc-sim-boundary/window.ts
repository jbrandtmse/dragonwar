// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `window` reference, as
// if it leaked into src/sim/**. Must fail under tsconfig.sim.json (TS2304 --
// "DOM" is not in `lib`, so no ambient declaration exists at all).

export function readWindowWidth(): number {
	return window.innerWidth;
}
