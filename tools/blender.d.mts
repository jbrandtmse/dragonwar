// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for blender.mjs's named exports, so .ts consumers (strict
// mode) can import them without TS7016 -- mirrors tools/size-budget.d.mts,
// the established pattern for this repository's `.mjs` tools.

export declare class BlenderNotFoundError extends Error {
	readonly candidates: readonly string[];
	constructor(candidates: readonly string[]);
}

export declare function resolveBlender(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string;
