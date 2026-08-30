// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for size-budget.mjs's named exports, so test/size-budget.test.ts
// (a .ts file, strict mode) can import them without TS7016 -- tsconfig.json has
// no `allowJs`, so a plain .mjs carries no inferred types on its own. Named
// `.d.mts` (not `.d.ts`) to pair with the `.mjs` extension, per TypeScript's
// extension-specific declaration file convention.

export declare const BUDGET_BYTES: number;

export interface GzipFileMeasurement {
	file: string;
	bytes: number;
}

export interface GzipDistMeasurement {
	totalBytes: number;
	perFile: GzipFileMeasurement[];
}

export declare function measureGzippedDist(distDir: string): GzipDistMeasurement;
