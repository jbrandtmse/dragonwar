// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Fixture for test/typecheck-sim-boundary.test.ts: a `document` reference,
// as if it leaked into src/sim/**. tsconfig.sim.json's `lib: ["ES2023"]`
// (no "DOM") must reject this at the type level (DW-15's closure) with
// TS2584, not just "some error".

export function readDocumentTitle(): string {
	return document.title;
}
