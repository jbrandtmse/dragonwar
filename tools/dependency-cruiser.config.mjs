// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-16: dependency-cruiser enforces the layer graph's import direction in
// CI. `options.parser: 'swc'` is not a style preference -- dependency-cruiser
// 18.2.0's own bundled TypeScript support is capped at `>=2.0.0 <7.0.0`
// (see `src/meta.cjs`'s `supportedTranspilers`), so under this repository's
// pinned `typescript@7.0.2` it silently drops `.ts` from `scannableExtensions`
// and cruises zero modules with exit code 0 -- verified during this story's
// planning (`depcruise --info` prints `x typescript` and `x .ts`). `@swc/core`
// is a Rust parser with no TypeScript-compiler dependency, so this also
// honours AD-16's "no lint may depend on [the TypeScript compiler API]"
// literally, not just in spirit. `tools/boundary-lint.mjs` asserts every
// `.ts` file under `src/` actually appears in the cruise result, so a parser
// regression like this one fails loudly instead of passing an empty graph.
//
// Every rule below is `severity: 'error'` and names the AD it enforces, per
// this story's own task list. `no-havok` is scoped to `path: '^src/'` (not
// every possible import site in the repository) because `@babylonjs/havok`
// is banned everywhere source lives; `tools/`, `test/` and root config files
// are covered by review and by the boundary lint's own scope, not this rule.
//
// The two `@babylonjs` `to.path` patterns below are deliberately UNANCHORED
// (no leading `^`), verified empirically against this repository's own
// pnpm-managed node_modules: pnpm resolves a scoped package through its
// virtual store, e.g.
// `node_modules/.pnpm/@babylonjs+core@9.22.2/node_modules/@babylonjs/core/...`
// -- an anchored `^@babylonjs` pattern never matches that resolved path and
// the rule silently catches nothing (confirmed with a smoke-test violation
// file during this story's implementation: an anchored pattern let a
// `sim/` -> `@babylonjs/core` import straight through). An unanchored
// substring match still finds the real `@babylonjs/<pkg>/` segment nested at
// the end of the resolved path under any package manager's layout.

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
	options: {
		parser: 'swc',
		doNotFollow: {
			path: 'node_modules',
		},
		// AD-16's own rationale: dependency-cruiser's TypeScript-compiler-backed
		// pre-compilation-dependency resolution is exactly the compiler-API
		// dependency this project avoids; swc's own import-graph resolution is
		// sufficient for the import-direction rules below. No `tsConfig` option
		// is set: the project's own tsconfig files declare no `baseUrl` or path
		// mapping (this story's own "Always" rule), so there is nothing for one
		// to resolve, and omitting it lets this same config run unmodified
		// against `tools/boundary-lint.mjs`'s fixture root
		// (`test/fixtures/boundary`), which carries no tsconfig.json of its own.
	},
	forbidden: [
		{
			name: 'sim-no-upward-import',
			comment:
				"AD-1: sim/** is DOM-free and Babylon-free and never imports presentation/ or host/. " +
				"AD-16: dependency-cruiser enforces this import rule in CI.",
			severity: 'error',
			from: { path: '^src/sim/' },
			to: { path: '^src/(host|presentation)/' },
		},
		{
			name: 'sim-no-babylon',
			comment:
				"AD-1: sim/** is DOM-free and Babylon-free -- @babylonjs/* is imported only under " +
				"presentation/ and host/. AD-16: dependency-cruiser enforces this import rule in CI.",
			severity: 'error',
			from: { path: '^src/sim/' },
			to: { path: '@babylonjs' },
		},
		{
			name: 'contracts-no-outside-import',
			comment:
				"This story's own 'Never' rule: src/sim/contracts/** never imports anything outside " +
				"src/sim/contracts/** -- the seam contracts stay table-free and dependency-free, the " +
				"same way the four sibling import-direction rules above are each CI-enforced rather " +
				"than true only by inspection (review finding, this story's own review pass).",
			severity: 'error',
			from: { path: '^src/sim/contracts/' },
			to: { pathNot: '^src/sim/contracts/' },
		},
		{
			name: 'presentation-only-contracts-and-table',
			comment:
				"AD-1: presentation/** reads FrameOutput and never calls into physics or rules -- it may " +
				"import only sim/contracts and sim/table from sim/. AD-16: dependency-cruiser enforces " +
				"this import rule in CI.",
			severity: 'error',
			from: { path: '^src/presentation/' },
			to: { path: '^src/sim/', pathNot: '^src/sim/(contracts|table)/' },
		},
		{
			name: 'host-no-physics-or-rules',
			comment:
				"AD-1: host/** composes; it owns no game logic and never imports sim/physics or " +
				"sim/rules directly. AD-16: dependency-cruiser enforces this import rule in CI.",
			severity: 'error',
			from: { path: '^src/host/' },
			to: { path: '^src/sim/(physics|rules)/' },
		},
		{
			name: 'no-havok',
			comment:
				"AD-1, AD-16: the engine's own physics plugin (@babylonjs/havok) is banned everywhere -- " +
				"DragonWar's physics is the ported vpx-js time-of-impact core, never a general rigid-body " +
				"engine.",
			severity: 'error',
			from: { path: '^src/' },
			to: { path: '@babylonjs/havok' },
		},
	],
};
