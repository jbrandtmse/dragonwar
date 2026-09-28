// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8's sweep, Part 1 (mandate: "Coverage instrumentation -- BLOCKED,
// recorded rather than silently replaced"): every real coverage package
// (`@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `c8`, `nyc`) is a new
// npm dependency, and `tools/check-attributions.mjs` fails both CI and
// `pnpm test` for any dependency with no `ATTRIBUTIONS.md` row --
// `ATTRIBUTIONS.md` is out of this story's footprint with its one-time
// widening spent (see spec Design Notes, "Why coverage instrumentation is
// not added"). This is the in-footprint substitute the mandate itself
// endorses: a STATIC import-reachability check over `src/**`, built on
// `dependency-cruiser` (already an attributed devDependency, already driven
// by `tools/boundary-lint.mjs`), rather than a dynamic execution-coverage
// tool.
//
// What this proves, honestly: every `.ts` module under `src/**` is reachable
// by FOLLOWING IMPORT EDGES from some real test entry point
// (`test/**/*.test.ts`, the default suite; `test/**/*.harness.ts`, the
// out-of-suite harnesses `test/solver-termination.test.ts` and Story 1.8's
// own `test/ad7-device-slots.test.ts` spawn in a separate vitest project).
// What it does NOT prove -- state honestly, the same discipline this
// story's sweep applies everywhere else: reachability is not EXECUTION. A
// module imported only for its side-effect-free named exports, where the
// test never calls the one function that matters, is "reachable" here and
// would still not be caught by a real coverage tool either watching for
// per-STATEMENT execution (this check has no line-level resolution at all).
// This closes exactly the gap the mandate cites -- "two modules with no
// executed test host at all" -- and no more.
//
// ALLOWLIST_REASONS below is the "explicit visible allowlist naming each
// knowingly-unreached module and its reason" the spec's task list requires,
// seeded from Code Map Part D item 2's seven candidates and VERIFIED against
// this pass's actual dependency-cruiser run (which is authoritative -- Part
// D's list was itself derived by inspection at plan time, not exhaustive by
// its own admission "not exhaustive, derive the full list at plan time").
// Three of Part D's seven turned out to be import-reachable already
// (`sim/physics/game/event-proxy.ts`, `sim/physics/util/object-pool.ts`,
// `sim/contracts/mode-view.ts` -- each pulled in transitively through a
// barrel or a sibling import even though nothing calls their load-bearing
// members, which is precisely this check's own stated blind spot above) and
// are correctly NOT on this allowlist; `object-pool.ts` additionally gains
// its own real, exercising test this same story (DW-6,
// test/object-pool.test.ts). Two real, additional unreached modules were
// found that Part D did not name (`src/host/boot.ts`, `src/host/build-info.ts`)
// alongside Part D's four other dead ported primitives -- a newly-unreached
// module now fails loudly rather than silently, which is this test's whole
// point. (Story 2.1a's own DW-59 wired `sim/physics/hit-line-3d.ts` into
// `loader/index.ts`'s `addBox()`, so it moved OFF this allowlist -- this
// same test's "no stale entry" assertion caught that reachability change.)

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFilesRecursive } from './util/list-files';

const REPO_ROOT = path.resolve(__dirname, '..');
const DEPCRUISE_BIN = path.join(REPO_ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');
const DEPCRUISE_CONFIG = path.join(REPO_ROOT, 'tools', 'dependency-cruiser.config.mjs');

function toPosix(p: string): string {
	return p.split(path.sep).join('/');
}

/**
 * Every module under `src/**` this check knowingly and deliberately leaves
 * unreached, with a reason. A module here that later gains a real test
 * import is caught by this same test's own "no stale allowlist entry"
 * assertion below, keeping the list honest in both directions.
 */
const ALLOWLIST_REASONS: Readonly<Record<string, string>> = {
	'src/host/boot.ts':
		'the boot entry point itself -- composes DOM (document.getElementById), a press-to-begin gesture, fetch() and the Babylon engine boot; importing it as a module would require a real browser DOM and WebGL2 context, which this headless suite never has. Proven instead by text-level pins (test/entry-html-csp.test.ts) and by the lead\'s per-story manual smoke in a real browser (epic context: "A headless engine never decodes images ... a per-story smoke in a real browser is what catches it").',
	'src/host/build-info.ts':
		'BUILD_SHA, substituted at build time via import.meta.env.VITE_BUILD_SHA (Vite define/env replacement) -- reachable at runtime only through src/host/boot.ts above, which is itself never imported as a module for the same reason. Text-scanned instead by test/entry-html-csp.test.ts and test/typecheck-sim-boundary.test.ts.',
	'src/sim/physics/hit-3dpoly.ts':
		'a vpx-js port for 3D-polygon (ramp) collision; Epic 1\'s collision loader (sim/physics/loader) only ever constructs the wall/box/plane primitive set the placeholder table declares (AD-11) -- no ramp geometry exists yet to reach this hit-testing path.',
	// Story 2.2: 'src/sim/physics/anim-object.ts', 'src/sim/physics/anim-slingshot.ts'
	// and 'src/sim/physics/line-seg-slingshot.ts' are REMOVED from this
	// allowlist -- wiring the sling (sim/physics/slings.ts, imported by
	// sim/physics/loader/index.ts, imported by every test that drives a real
	// machine) makes line-seg-slingshot.ts import-reachable, which makes
	// anim-slingshot.ts (imported by it) and anim-object.ts (imported by
	// THAT) reachable in turn. This test's own "no stale entry" assertion
	// below is what catches a reachability change like this one.
};

interface DepCruiseModule {
	readonly source: string;
	readonly dependencies?: ReadonlyArray<{
		readonly resolved: string;
		readonly followable?: boolean;
		readonly coreModule?: boolean;
		readonly couldNotResolve?: boolean;
	}>;
}

interface DepCruiseReport {
	readonly modules: readonly DepCruiseModule[];
}

function runCruise(): DepCruiseReport {
	const result = spawnSync(
		process.execPath,
		[DEPCRUISE_BIN, '--config', DEPCRUISE_CONFIG, '-T', 'json', 'test', 'src'],
		{ cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);
	if (result.error) {
		throw new Error(`module-coverage.test.ts: failed to run dependency-cruiser: ${result.error.message}`);
	}
	try {
		return JSON.parse(result.stdout) as DepCruiseReport;
	} catch {
		throw new Error(`module-coverage.test.ts: dependency-cruiser did not produce valid JSON (exit ${result.status}). stderr:\n${result.stderr}`);
	}
}

/** DFS (stack-based) over the import graph from every real test entry point, returning every `src/**`-rooted module reached. */
function reachableSrcModules(report: DepCruiseReport): Set<string> {
	const graph = new Map<string, string[]>();
	for (const m of report.modules) {
		const edges = (m.dependencies ?? [])
			.filter((d) => d.followable && !d.coreModule && !d.couldNotResolve)
			.map((d) => d.resolved);
		graph.set(m.source, edges);
	}

	// Real test entry points: the default suite (`test/**/*.test.ts`,
	// vitest.config.ts's own `include`) plus the out-of-suite harnesses
	// (`test/**/*.harness.ts`, each run by its own nested vitest project --
	// test/fixtures/solver-termination/ and Story 1.8's
	// test/fixtures/dw70-ad7/). A plain support file under test/util/** is
	// not itself a seed -- it is reached transitively, same as any src/**
	// module, from whichever *.test.ts imports it.
	const seeds = [...graph.keys()].filter((source) => /^test\/.*\.(test|harness)\.ts$/.test(source));

	const visited = new Set<string>();
	const queue = [...seeds];
	while (queue.length > 0) {
		const current = queue.pop()!;
		if (visited.has(current)) {
			continue;
		}
		visited.add(current);
		for (const next of graph.get(current) ?? []) {
			if (!visited.has(next)) {
				queue.push(next);
			}
		}
	}

	const reachedSrc = new Set<string>();
	for (const source of visited) {
		if (source.startsWith('src/') && source.endsWith('.ts')) {
			reachedSrc.add(source);
		}
	}
	return reachedSrc;
}

describe('module-coverage.test.ts -- every src/** module is reachable from a test/** entry point (in-footprint substitute for coverage instrumentation)', () => {
	const report = runCruise();
	const reachable = reachableSrcModules(report);
	const allSrcFiles = listFilesRecursive(path.join(REPO_ROOT, 'src'))
		.filter((f) => f.endsWith('.ts'))
		.map((f) => toPosix(path.relative(REPO_ROOT, f)));

	it('sanity: this scan actually finds src/** files and actually reaches most of them, or every assertion below is vacuous', () => {
		expect(allSrcFiles.length).toBeGreaterThan(0);
		expect(reachable.size).toBeGreaterThan(0);
		// Not every file -- the whole point of this suite is that SOME are not.
		expect(reachable.size).toBeLessThan(allSrcFiles.length);
	});

	it('every allowlisted module actually exists under src/**', () => {
		for (const relative of Object.keys(ALLOWLIST_REASONS)) {
			const absolute = path.resolve(REPO_ROOT, relative);
			expect(allSrcFiles, `ALLOWLIST_REASONS entry "${relative}" does not name a real file under src/** -- stale allowlist entry`).toContain(toPosix(path.relative(REPO_ROOT, absolute)));
		}
	});

	it('every allowlisted module is GENUINELY unreached -- a stale entry (one that later gained a real test import) must be trimmed, not left standing', () => {
		const staleEntries = Object.keys(ALLOWLIST_REASONS).filter((relative) => reachable.has(relative));
		expect(
			staleEntries,
			`the following ALLOWLIST_REASONS entries are now reachable from a test/** entry point and must be REMOVED from the allowlist (their reason no longer holds): ${staleEntries.join(', ')}`,
		).toEqual([]);
	});

	it('every module under src/** is either reachable from a test/** entry point, or explicitly allowlisted with a reason', () => {
		const unaccountedFor = allSrcFiles.filter((f) => !reachable.has(f) && !(f in ALLOWLIST_REASONS));
		expect(
			unaccountedFor,
			`the following src/** module(s) are reachable from NO test/**.test.ts or test/**.harness.ts entry point, and are not on ALLOWLIST_REASONS -- either a test needs to import them (directly or transitively), or add a named, reasoned allowlist entry:\n` +
			unaccountedFor.map((f) => `  - ${f}`).join('\n'),
		).toEqual([]);
	});
});
