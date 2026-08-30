// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for boundary-lint.mjs's named exports, so .ts consumers
// (strict mode) can import them without TS7016 -- mirrors tools/blender.d.mts
// and tools/size-budget.d.mts, the established pattern for this repository's
// `.mjs` tools. DW-32: test/typecheck-sim-boundary.test.ts imports
// `listFilesRecursive` and `TEXTUAL_SCAN_EXTENSION_PATTERN` directly, so its
// own file-coverage listing can never silently drift from the extension set
// tools/boundary-lint.mjs's own textual scan actually uses.

export interface BoundaryLintViolation {
	readonly rule: string;
	readonly file: string;
	readonly line: number | undefined;
	readonly message: string;
	readonly importRule?: boolean;
}

export interface BoundaryLintResult {
	readonly importViolations: readonly BoundaryLintViolation[];
	readonly textualViolations: readonly BoundaryLintViolation[];
	readonly coverage: number;
}

export declare function runBoundaryLint(root: string): BoundaryLintResult;

/** Recursively lists every file (not directory) under `root`, absolute paths. */
export declare function listFilesRecursive(root: string): string[];

/** The extension set boundary-lint.mjs's own textual checks scan: ts, tsx, mts, cts, js, mjs, cjs. */
export declare const TEXTUAL_SCAN_EXTENSION_PATTERN: RegExp;
