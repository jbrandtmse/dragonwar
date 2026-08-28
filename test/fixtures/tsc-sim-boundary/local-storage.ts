// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `localStorage`
// reference, as if it leaked into src/sim/**. Must fail under
// tsconfig.sim.json (TS2304) -- sim/ owns no persistence (that is host/).

export function readStoredValue(): string | null {
	return localStorage.getItem('x');
}
