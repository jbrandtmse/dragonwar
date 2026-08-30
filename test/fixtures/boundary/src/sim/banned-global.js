// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation, NOT a .ts file: a `.js` file dropped under src/sim/
// must still be caught by the textual checks (review finding, this story's
// own review pass -- the three textual checks had narrowed to `.ts`-only,
// same class of gap Story 1.1's original textual boundary check (superseded
// by this tool per AD-16) guarded against explicitly). Excluded from
// dependency-cruiser's `.ts`-only coverage guard by design -- that guard's
// job is proving TypeScript files reach the swc parser, not textual scanning
// breadth.
export function nowFromJs() {
	return Date.now();
}
