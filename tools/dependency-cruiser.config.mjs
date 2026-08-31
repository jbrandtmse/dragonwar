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

// Story 2.1a (DW-105): the `no-circular` rule below used to exempt the whole
// `src/sim/physics/` directory as a cycle ORIGIN, which hid a real cycle
// spanning two AUTHORED files (`flipper/flipper-config.ts`,
// `loader/index.ts`) and two FROZEN ports (`game/player-physics.ts`,
// `flipper/flipper-mover.ts`) -- the directory-wide carve-out could not tell
// an authored-to-ported cycle apart from the 33 real internal cycles the
// upstream engine's OWN structure carries (every one of them both FROM and
// TO a frozen port). Narrowed here to the opposite shape: every file is a
// cycle origin, and only a PORTED physics file (declared authored files
// excluded) is exempted as a cycle TARGET -- so a cycle entirely within
// frozen ports still stays quiet (Design Notes: "if a real cycle survives
// that spans only frozen ports, record why here instead of forcing it" --
// none does today, this narrowing alone was sufficient once the hoist above
// broke the one real cycle), while a cycle that touches even one authored
// file -- including one under `src/sim/physics/` itself, unlike the old
// exemption -- still fails. This list mirrors (never imports, to keep this
// config file's own dependency-free contract) `test/port-provenance.test.ts`'s
// `AUTHORED_FILES`; a stale or typo'd entry there is caught by that test's own
// "every entry names a real file" assertion, not by this file.
const AUTHORED_PHYSICS_FILES = [
	'loader/index',
	'loader/loaded-flipper',
	'switches',
	'devices',
	'machine',
	'flipper/flipper-config',
	'flippers',
	'plunger',
	'cabinet/slam',
	'cabinet/index',
	'hop',
	'geometry',
];
const PORTED_PHYSICS_FILE_PATTERN =
	`^src/sim/physics/(?!(?:${AUTHORED_PHYSICS_FILES.join('|').replace(/\//g, '\\/')})\\.tsx?$).+\\.tsx?$`;

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
	options: {
		parser: 'swc',
		doNotFollow: {
			path: 'node_modules',
		},
		// Stated explicitly (this story's task 9 pins it) even though `false`
		// is already the default: pre-compilation dependency resolution is
		// dependency-cruiser's TypeScript-compiler-backed path, which is the
		// very compiler-API dependency AD-16 forbids. Pinning it here means a
		// future default change cannot quietly switch it on.
		tsPreCompilationDeps: false,
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
		{
			name: 'no-circular',
			comment:
				"AD-1: the layer graph is a DAG -- a dependency cycle anywhere under src/ means two " +
				"modules cannot be reasoned about independently, which the seam contracts exist to " +
				"prevent. dependency-cruiser's own built-in cycle detector (`to.circular: true`), not a " +
				"hand-rolled graph walk. Story 2.1a (DW-105) narrowed this rule: every file, INCLUDING " +
				"every authored src/sim/physics/** module, is now a cycle origin (the previous " +
				"directory-wide `from.pathNot` exemption hid a real cycle spanning two authored files and " +
				"two frozen ports -- see this file's own header comment above). `to.pathNot` now excludes " +
				"only the declared PORTED files (PORTED_PHYSICS_FILE_PATTERN) as a cycle TARGET: the " +
				"vpx-js/vpinball-ported time-of-impact core carries 33 real internal cycles (e.g. " +
				"ball-hit.ts <-> player-physics.ts, hit-kd.ts <-> hit-kd-node.ts), every one of them both " +
				"FROM and TO a DW-79-frozen port body (test/port-provenance.test.ts's PORT_BODY_HASHES); " +
				"breaking one means editing a frozen port and re-pinning its hash, which this story's own " +
				"Block If rules out. This still catches every cycle this rule exists for: one introduced " +
				"among the seam contracts, one that newly drags host/, presentation/, sim/table/, " +
				"sim/rules/ or sim/loop/ into a cycle touching physics/, AND -- unlike the previous " +
				"exemption -- one introduced between an AUTHORED physics/ file and a frozen port, because " +
				"an authored file is never in PORTED_PHYSICS_FILE_PATTERN and so never exempted as a " +
				"target.",
			severity: 'error',
			from: {},
			to: { circular: true, pathNot: PORTED_PHYSICS_FILE_PATTERN },
		},
		{
			name: 'sim-table-no-physics-rules-loop',
			comment:
				"AD-1: sim/table/** authors WHAT the table is (devices, tunables, frames) -- it never " +
				"reaches into HOW the simulation runs. sim/table/** must not import sim/physics/**, " +
				"sim/rules/** or sim/loop/**; sim/contracts/** stays the only sanctioned inward seam.",
			severity: 'error',
			from: { path: '^src/sim/table/' },
			to: { path: '^src/sim/(physics|rules|loop)/' },
		},
	],
};
