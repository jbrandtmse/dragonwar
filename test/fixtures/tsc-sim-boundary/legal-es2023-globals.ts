// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: `Date`, `Math.random`
// and `globalThis` are legal ES2023 -- tsconfig.sim.json's `lib: ["ES2023"]`
// cannot reject them by name (this story's Design Notes, "Why the boundary
// gate is three parts, not one"). This file must typecheck clean here;
// tools/boundary-lint.mjs's textual pass is the layer that actually bans
// these three inside src/sim/**.

export function useLegalGlobals(): number {
	const marker: unknown = globalThis;
	const roll = Math.random();
	const stamp = Date.now();
	return roll + stamp + (marker ? 1 : 0);
}
