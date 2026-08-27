// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1's Integration AC (I/O & Edge-Case Matrix, "Integration (consumer)"
// row) requires the shared six-ball harness (tools/spike-1/scene.ts) to import
// only from src/sim/physics/** and src/sim/contracts/time.ts, so that
// test/spike-1.test.ts (Node) and tools/spike-1/browser.ts (the Vite dev page)
// both step the identical, boundary-respecting scene (AD-1: the harness sits
// outside sim/, but sim/ is the only thing it's allowed to depend on). Nothing
// currently asserts this direction of the boundary --
// test/sim-boundary.test.ts checks the opposite direction (that files *under*
// src/sim/ stay clean of DOM/engine globals), not that tools/spike-1/scene.ts
// stays clean of imports from anywhere *outside* those two roots. A future edit
// that reaches for, say, `@babylonjs/core` or a not-yet-built `src/sim/table/`
// module directly from the harness would otherwise pass every existing test.
//
// Plain textual parsing only (no TypeScript compiler API), matching this
// story's other Story-1.3-dependency-cruiser stand-in (test/sim-boundary.test.ts).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCENE_PATH = path.resolve(__dirname, '..', 'tools', 'spike-1', 'scene.ts');
const BROWSER_PATH = path.resolve(__dirname, '..', 'tools', 'spike-1', 'browser.ts');
const ALLOWED_IMPORT_PATTERN = /^(\.\.\/\.\.\/src\/sim\/contracts\/time|\.\.\/\.\.\/src\/sim\/physics\/.+)$/;

// Matches every module-specifier form, not only `import ... from '...'`: a bare
// side-effect import (`import '@babylonjs/core';`), a re-export (`export * from
// '...'`) and a dynamic `import('...')` all reach outside the boundary just as
// effectively, and the first of those is the exact example this file's header
// names as the threat.
function importSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	const patterns = [
		/^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm,
		/^\s*import\s+['"]([^'"]+)['"]/gm,
		/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	];
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(source)) !== null) {
			specifiers.push(match[1]);
		}
	}
	return specifiers;
}

describe('tools/spike-1/scene.ts -- harness import boundary (Integration AC, AD-1)', () => {
	const specifiers = importSpecifiers(readFileSync(SCENE_PATH, 'utf8'));

	it('finds at least one import statement (sanity check the parser above is wired up)', () => {
		expect(specifiers.length).toBeGreaterThan(0);
	});

	it('imports only from src/sim/physics/** or src/sim/contracts/time', () => {
		const offenders = specifiers.filter((spec) => !ALLOWED_IMPORT_PATTERN.test(spec));
		expect(
			offenders,
			`disallowed import(s) found in tools/spike-1/scene.ts: ${offenders.join(', ')}`,
		).toEqual([]);
	});
});

describe('tools/spike-1/browser.ts -- harness import boundary (Integration AC, AD-1)', () => {
	// The other half of the harness. It may additionally import the scene beside it;
	// what it must not do is reach for an engine or any other module outside sim/.
	const BROWSER_ALLOWED = /^(\.\/scene|\.\.\/\.\.\/src\/sim\/contracts\/time|\.\.\/\.\.\/src\/sim\/physics\/.+)$/;
	const specifiers = importSpecifiers(readFileSync(BROWSER_PATH, 'utf8'));

	it('finds at least one import statement (sanity check the parser above is wired up)', () => {
		expect(specifiers.length).toBeGreaterThan(0);
	});

	it('imports only the harness scene or src/sim/**', () => {
		const offenders = specifiers.filter((spec) => !BROWSER_ALLOWED.test(spec));
		expect(
			offenders,
			`disallowed import(s) found in tools/spike-1/browser.ts: ${offenders.join(', ')}`,
		).toEqual([]);
	});
});
