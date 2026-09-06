// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.4 QA (DW-172): AC 9's own named Rule 19 mutation -- "drop the
// DSL's tick ordering" -- turned out to be a no-op. Applying it (reversing
// test/util/switch-script.ts's build() sort comparator from `a.tick -
// b.tick` to `b.tick - a.tick`) left test/rules-devices.test.ts GREEN at
// 32/32 (measured by the lead's AD gate, 2026-09-05): runSwitchScript()
// re-groups every scripted edge into a `Map` keyed by tick and iterates
// `1..durationTicks` in order, so build()'s own array order -- the one thing
// that mutation touches -- never reaches the layer (same-tick ties are
// resolved by the stable sort's ORIGINAL push order regardless of overall
// sort direction, so even within-tick ordering is unaffected). The AC's real
// claim was left with no falsifiable pin at all.
//
// AC 9's REAL, load-bearing claim is "no physics or rendering module is
// imported by [test/rules-devices.test.ts]" (spec I/O matrix, AC 9) -- true
// today, but until now asserted only by this file's own header comment and
// the spec's Manual Checks bullet ("Confirm test/rules-devices.test.ts's
// import list contains no src/sim/physics/**, no src/sim/loop/**, no
// @babylonjs/* and no node:fs specifier"). Neither a comment nor a manual
// check can turn red. This file replaces both with a textual scan --
// mirroring tools/boundary-lint.mjs's own textual-scan idiom (this story's
// Design Notes: "a hand-rolled textual pass instead"), scoped to exactly the
// claim AC 9 makes -- over the two files whose import lists together decide
// whether running rules-devices.test.ts ever loads physics, rendering, loop
// or real-filesystem code: rules-devices.test.ts itself, and the
// switch-script DSL it drives its whole suite through
// (test/util/switch-script.ts). A forbidden import landing in the DSL would
// defeat the headless claim exactly as surely as one landing in the test
// file, since the DSL's own module load is part of running the test.
//
// Mutation (Rule 19, replacing AC 9's no-op): add
// `import type { SwitchTracker } from '../src/sim/physics/switches';` to
// test/rules-devices.test.ts, then run this file -- it reddens naming the
// forbidden specifier and the offending file/family. Revert; confirm
// `git status --short` / `git diff --stat` unchanged. (QA-observed
// 2026-09-05: applied, watched red on both the direct assertion and the
// arrayContaining("sim/physics") check below, reverted, tree byte-identical.)

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const toPosix = (p: string): string => p.split(path.sep).join('/');

/**
 * Blanks line and block comments, preserving length and newlines --
 * `tools/boundary-lint.mjs`'s `maskForCodeOnly()` idiom, which this file's
 * header says it mirrors and originally did not actually apply. Without it a
 * comment merely MENTIONING a forbidden path in `from '...'` shape reddens the
 * scan spuriously -- and this file's own header carries exactly such a line
 * (its Rule 19 mutation recipe), so the risk is one copy-paste away. String
 * literals are deliberately left intact: an import specifier IS a string
 * literal.
 */
function maskComments(source: string): string {
	const chars = source.split('');
	let i = 0;
	let quote: string | null = null;
	while (i < chars.length) {
		const c = chars[i];
		const next = chars[i + 1];
		if (quote) {
			if (c === '\\') { i += 2; continue; }
			if (c === quote) { quote = null; }
			i += 1;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') { quote = c; i += 1; continue; }
		if (c === '/' && next === '/') {
			while (i < chars.length && chars[i] !== '\n') { chars[i] = ' '; i += 1; }
			continue;
		}
		if (c === '/' && next === '*') {
			while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
				if (chars[i] !== '\n') { chars[i] = ' '; }
				i += 1;
			}
			chars[i] = ' ';
			if (i + 1 < chars.length) { chars[i + 1] = ' '; }
			i += 2;
			continue;
		}
		i += 1;
	}
	return chars.join('');
}

/**
 * Every `from '<specifier>'` module path (or a dynamic `import('<specifier>')`
 * call, caught by the same quoting shape) named in `source`'s CODE --
 * static imports, type-only imports and re-exports alike.
 */
function importSpecifiers(source: string): readonly string[] {
	const specifiers: string[] = [];
	const pattern = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
	const code = maskComments(source);
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(code)) !== null) {
		specifiers.push(match[1]);
	}
	return specifiers;
}

/**
 * Resolves a RELATIVE specifier against the importing file's directory, trying
 * the extensionless spellings this repository actually writes. Returns null for
 * a bare specifier (`vitest`, `node:fs`) -- those are checked against
 * `FORBIDDEN_FAMILIES` but never recursed into.
 */
function resolveRelative(fromFile: string, specifier: string): string | null {
	if (!specifier.startsWith('.')) {
		return null;
	}
	const base = path.resolve(path.dirname(fromFile), specifier);
	for (const candidate of [`${base}.ts`, path.join(base, 'index.ts'), `${base}.tsx`, base]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) {
			return candidate;
		}
	}
	return null;
}

/**
 * The TRANSITIVE first-party module closure reachable from `entryFiles` -- the
 * set of modules that actually LOAD when the entry files run, as opposed to the
 * handful they name directly. Returns every visited file plus every specifier
 * seen along the way, each tagged with the file that named it.
 */
function importClosure(entryFiles: readonly string[]): {
	readonly files: readonly string[];
	readonly edges: ReadonlyArray<{ readonly from: string; readonly specifier: string; readonly target: string }>;
} {
	const visited = new Set<string>();
	const edges: Array<{ from: string; specifier: string; target: string }> = [];
	const queue = [...entryFiles];
	while (queue.length > 0) {
		const file = queue.shift()!;
		if (visited.has(file)) {
			continue;
		}
		visited.add(file);
		for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
			const resolved = resolveRelative(file, specifier);
			// `target` is what the families are matched against: the
			// repo-relative path a RELATIVE specifier resolves to, and the raw
			// specifier for a bare one (`@babylonjs/core`, `node:fs`). Matching
			// the raw specifier alone is what made the original two-file version
			// of this pin unable to see the very import it exists to catch --
			// `src/sim/rules/index.ts` reaches physics as `'../physics/machine'`,
			// which does not contain the string `sim/physics` at all.
			const target = resolved ? toPosix(path.relative(REPO_ROOT, resolved)) : specifier;
			edges.push({ from: toPosix(path.relative(REPO_ROOT, file)), specifier, target });
			if (resolved && !visited.has(resolved)) {
				queue.push(resolved);
			}
		}
	}
	return { files: [...visited], edges };
}

/**
 * The exact module families AC 9's headless claim rules out, plus `node:fs`
 * (the spec's own Manual Checks bullet for this AC) -- a "headless" rules
 * test that starts reading real files off disk is no longer headless in the
 * sense AC 9 means, even though nothing here is physics or rendering.
 */
const FORBIDDEN_FAMILIES: ReadonlyArray<{ readonly label: string; readonly matches: (specifier: string) => boolean }> = [
	{ label: 'src/sim/physics', matches: (s) => s.includes('sim/physics') },
	{ label: 'src/sim/loop', matches: (s) => s.includes('sim/loop') },
	{ label: '@babylonjs', matches: (s) => s.includes('@babylonjs') },
	// `node:fs/promises`, `fs/promises` and the like are the same claim: a
	// headless rules test that reads real files off disk is not headless.
	{ label: 'node:fs', matches: (s) => /^(?:node:)?fs(?:\/|$)/.test(s) },
];

const ENTRY_FILES = [path.join(__dirname, 'rules-devices.test.ts'), path.join(__dirname, 'util', 'switch-script.ts')];

describe('AC 9 (headless) -- nothing in test/rules-devices.test.ts\'s TRANSITIVE module closure is physics, loop, rendering or filesystem code (DW-172)', () => {
	const { files, edges } = importClosure(ENTRY_FILES);

	// Scanning only the two entry files' own import lists was the original
	// shape of this pin, and it was measured too narrow at code review: adding
	// a real `import { createMachine } from '../physics/machine'` to
	// `src/sim/rules/index.ts` pulled 55 `src/sim/physics/**` modules into this
	// test's load graph and left the pin GREEN. Nothing else in the gate
	// catches it either -- `tools/dependency-cruiser.config.mjs` has no rule
	// forbidding `sim/rules/**` from importing `sim/physics/**` or
	// `sim/loop/**`, and boundary-lint's textual checks do not inspect import
	// targets at all. Story 2.5 wires the ball controller into
	// `src/sim/rules/**`, which is exactly where such an import would arrive.
	it('no module anywhere in the closure names a forbidden specifier', () => {
		for (const edge of edges) {
			for (const forbidden of FORBIDDEN_FAMILIES) {
				expect(
					forbidden.matches(edge.target),
					`${edge.from} imports "${edge.specifier}" (resolving to "${edge.target}"), matching the forbidden "${forbidden.label}" family -- ` +
						`AC 9's headless claim requires neither physics, rendering nor loop code (nor a real filesystem ` +
						`read) to load when test/rules-devices.test.ts runs`,
				).toBe(false);
			}
		}
	});

	// The guard that keeps the assertion above non-vacuous: a resolver that
	// silently stopped walking (a changed file layout, a broken regex, a
	// masking bug that blanked real code) would visit almost nothing and the
	// loop would pass by finding no edges at all.
	it('sanity: the closure really is transitive -- it reaches the layer\'s own modules, not just the two entry files', () => {
		const relative = files.map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
		expect(relative, 'the DSL entry itself').toContain('test/util/switch-script.ts');
		expect(relative, 'one hop out: the devices layer barrel').toContain('src/sim/rules/devices/index.ts');
		expect(relative, 'two hops out: a component the barrel imports').toContain('src/sim/rules/devices/shots.ts');
		expect(relative, 'the registry, reached only transitively').toContain('src/sim/table/dragonwar.ts');
		expect(
			relative.length,
			`expected the closure to span the whole rules/table/contracts graph, got ${relative.length}: ${JSON.stringify(relative)}`,
		).toBeGreaterThan(10);
		expect(edges.length, 'and to have collected an edge for every specifier along the way').toBeGreaterThan(relative.length);
	});
});
