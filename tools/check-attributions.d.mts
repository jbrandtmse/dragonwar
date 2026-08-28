// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for check-attributions.mjs's named exports, so
// test/check-attributions.test.ts (a .ts file, strict mode) can import them
// without TS7016 -- tsconfig.node.json has no `allowJs`, so a plain .mjs
// carries no inferred types on its own. Named `.d.mts` (not `.d.ts`) to pair
// with the `.mjs` extension, per TypeScript's extension-specific declaration
// file convention.

export declare class CheckAttributionsError extends Error {}

export declare function checkAttributions(packageJsonPath?: string, attributionsPath?: string): string[];
