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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `from '<specifier>'` module path (or a dynamic `import('<specifier>')`
 * call, caught by the same quoting shape) named anywhere in `source` --
 * static imports, type-only imports and re-exports alike, which is
 * everything both files under test actually write.
 */
function importSpecifiers(source: string): readonly string[] {
	const specifiers: string[] = [];
	const pattern = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		specifiers.push(match[1]);
	}
	return specifiers;
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
	{ label: 'node:fs', matches: (s) => s === 'node:fs' || s === 'fs' },
];

function assertNoForbiddenImports(relativePath: string): void {
	const absolutePath = path.join(__dirname, relativePath);
	const source = readFileSync(absolutePath, 'utf8');
	const specifiers = importSpecifiers(source);
	for (const specifier of specifiers) {
		for (const forbidden of FORBIDDEN_FAMILIES) {
			expect(
				forbidden.matches(specifier),
				`${relativePath} imports "${specifier}", matching the forbidden "${forbidden.label}" family -- ` +
					`AC 9's headless claim requires neither physics, rendering nor loop code (nor a real filesystem ` +
					`read) to load when this test runs`,
			).toBe(false);
		}
	}
}

describe('AC 9 (headless) -- test/rules-devices.test.ts and its switch-script DSL import no physics, loop, rendering or filesystem module (DW-172)', () => {
	it('test/rules-devices.test.ts names no forbidden specifier in its own import statements', () => {
		assertNoForbiddenImports('rules-devices.test.ts');
	});

	it('test/util/switch-script.ts -- the DSL rules-devices.test.ts drives its whole suite through -- names no forbidden specifier either; a leak here would defeat the headless claim just as surely as one in the test file itself', () => {
		assertNoForbiddenImports(path.join('util', 'switch-script.ts'));
	});

	it('sanity: the scan actually finds real imports in both files, so a broken pattern could not silently pass by finding zero specifiers', () => {
		const testFileSpecifiers = importSpecifiers(readFileSync(path.join(__dirname, 'rules-devices.test.ts'), 'utf8'));
		expect(testFileSpecifiers.length, 'expected rules-devices.test.ts to have several import statements').toBeGreaterThan(3);
		expect(testFileSpecifiers).toContain('./util/switch-script');

		const dslSpecifiers = importSpecifiers(readFileSync(path.join(__dirname, 'util', 'switch-script.ts'), 'utf8'));
		expect(dslSpecifiers.length, 'expected switch-script.ts to have several import statements').toBeGreaterThan(2);
		expect(dslSpecifiers).toContain('../../src/sim/rules/devices');
	});
});
