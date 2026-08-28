// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: DOM/Node-global-free,
// wall-clock-free code -- a sanity control proving the fixture tsconfig
// harness itself compiles real sim-shaped code cleanly, so a failure
// elsewhere in this fixture set is the DOM/Node global under test, not a
// broken harness.

export function pureTickMath(tick: number): number {
	return tick + 1;
}
