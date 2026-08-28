// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `requestAnimationFrame`
// reference, as if it leaked into src/sim/**. Must fail under
// tsconfig.sim.json (TS2304) -- sim/ has no render loop of its own.

export function scheduleFrame(): void {
	requestAnimationFrame(() => {
		/* no-op */
	});
}
