// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient types for export-assets.mjs's named exports, so .ts consumers
// (strict mode) can import them without TS7016 -- mirrors
// tools/size-budget.d.mts, the established pattern for this repository's
// `.mjs` tools.

export interface TableDump {
	readonly reference: unknown;
	readonly switches: unknown;
	readonly coils: unknown;
	readonly ballDevices: unknown;
	readonly lamps: unknown;
	readonly lightGroups: unknown;
	readonly physMaterials: unknown;
	readonly nodes: unknown;
	readonly surfaces: readonly string[];
}

export declare function buildTableDump(table?: unknown, surfaces?: readonly string[]): TableDump;

export interface BuildBlenderArgsOptions {
	readonly blendPath: string;
	readonly tableJsonPath: string;
	readonly outDir: string;
}

export declare function buildBlenderArgs(options: BuildBlenderArgsOptions): string[];

export interface RunExportAssetsOptions {
	readonly blendPath?: string;
	readonly outDir?: string;
	readonly env?: NodeJS.ProcessEnv;
}

export declare function runExportAssets(options?: RunExportAssetsOptions): number;
