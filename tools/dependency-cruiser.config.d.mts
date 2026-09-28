// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for dependency-cruiser.config.mjs's named export, so
// test/port-provenance.test.ts (a .ts file, strict mode) can import it
// without TS7016 -- tsconfig.node.json has no `allowJs`, so a plain .mjs
// carries no inferred types on its own. Named `.d.mts` (not `.d.ts`) to pair
// with the `.mjs` extension, per TypeScript's extension-specific declaration
// file convention (see tools/check-attributions.d.mts, the precedent this
// mirrors). Story 2.1a task 29 (review finding, rework iteration 4): this
// export exists so the drift check in test/port-provenance.test.ts can
// compare it against that file's own AUTHORED_FILES.

export declare const AUTHORED_PHYSICS_FILES: readonly string[];
