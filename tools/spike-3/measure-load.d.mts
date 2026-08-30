// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for measure-load.mjs's named exports, so
// test/measure-load-cli.test.ts (a .ts file, strict mode) can import them
// without TS7016 -- tsconfig.json has no `allowJs`, so a plain .mjs carries no
// inferred types on its own. Named `.d.mts` (not `.d.ts`) to pair with the
// `.mjs` extension, per TypeScript's extension-specific declaration file
// convention (mirrors tools/size-budget.d.mts, the established pattern).

export declare function median(sortedAscending: number[]): number;
