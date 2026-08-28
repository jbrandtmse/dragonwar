// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `navigator` reference,
// as if it leaked into src/sim/**. Must fail under tsconfig.sim.json
// (TS2304).

export function readUserAgent(): string {
	return navigator.userAgent;
}
