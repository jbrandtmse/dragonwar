// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1's hard, spec-level acceptance criterion: ATTRIBUTIONS.md's Code
// table must record the vpdb/vpx-js port's provenance -- commit, authors,
// licence (GPL-2.0-or-later, verified from the source file headers and
// explicitly NOT from package.json, which is exactly the trap CLAUDE.md's
// provenance rule warns about), and the verification date -- before any ported
// file exists under src/sim/physics/. Nothing currently pins this content by an
// automated test; only manual inspection did (see the spec's Verification
// section). This is a regression guard: a future edit that trims or "corrects"
// away this record would otherwise go undetected by `pnpm test`.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ATTRIBUTIONS_PATH = path.resolve(__dirname, '..', 'ATTRIBUTIONS.md');

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ');
}

describe('ATTRIBUTIONS.md -- vpdb/vpx-js provenance record (Story 1.1 AC)', () => {
	const normalized = normalize(readFileSync(ATTRIBUTIONS_PATH, 'utf8'));

	it('names the upstream project and the pinned commit', () => {
		expect(normalized).toContain('vpdb/vpx-js');
		expect(normalized).toContain('e8a6d6f');
	});

	it('names all three upstream authors', () => {
		expect(normalized).toContain('freezy');
		expect(normalized).toContain('Jason Millard');
		expect(normalized).toContain('Michael Vogt');
	});

	it('records the licence as GPL-2.0-or-later, verified in the source file headers', () => {
		expect(normalized).toContain('GPL-2.0-or-later');
		expect(normalized).toMatch(/verified in the source file headers/);
	});

	it('explicitly records the package.json-vs-header divergence (the CLAUDE.md trap)', () => {
		expect(normalized).toMatch(/package\.json/);
		expect(normalized).toMatch(/"license":\s*"GPL-2\.0"/);
		expect(normalized).toMatch(/or \(at your option\) any later version/);
	});

	it('records the 2026-08-27 verification date', () => {
		expect(normalized).toContain('2026-08-27');
	});

	it('states the GPL-3.0 or-later exercise reasoning', () => {
		expect(normalized).toMatch(/GPL-3\.0/);
		expect(normalized).toMatch(/or-later clause/);
	});
});

describe('ATTRIBUTIONS.md -- Babylon.js provenance record (Story 1.2 AC)', () => {
	// Story 1.2's hard, spec-level acceptance criterion: the two Babylon rows
	// must record the source URL, the author, Apache-2.0 as read in license.md
	// at the repository root -- explicitly not from package.json or npm
	// metadata (the CLAUDE.md trap this story's Always list names again) -- and
	// the verification date. Nothing pinned this content before this test;
	// a future edit that trims or "corrects" it away would go undetected.
	const normalized = normalize(readFileSync(ATTRIBUTIONS_PATH, 'utf8'));

	it('names both packages at the pinned 9.22.2 version', () => {
		expect(normalized).toContain('@babylonjs/core');
		expect(normalized).toContain('@babylonjs/loaders');
		expect(normalized).toContain('9.22.2');
	});

	it('names the author and the source repository', () => {
		expect(normalized).toContain('The Babylon.js team');
		expect(normalized).toContain('https://github.com/BabylonJS/Babylon.js/blob/master/license.md');
	});

	it('records the licence as Apache-2.0, read in license.md at source -- not from package.json or npm metadata', () => {
		expect(normalized).toContain('Apache-2.0');
		expect(normalized).toMatch(/as read in `?license\.md`? at (the )?(repository root|source)/);
		expect(normalized).toMatch(/not\*{0,2} from `?package\.json`?/);
	});

	it('records the 2026-08-27 verification date for both rows', () => {
		const matches = normalized.match(/2026-08-27/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(2);
	});

	it('names NOTICE.md and where its content ships (THIRD-PARTY-NOTICES.txt)', () => {
		expect(normalized).toContain('NOTICE.md');
		expect(normalized).toContain('THIRD-PARTY-NOTICES.txt');
	});
});

describe('package.json licence identifier (code review 2026-08-27, HIGH-2)', () => {
	it("declares GPL-3.0-or-later, matching NOTICE's or-later grant", () => {
		// NOTICE grants "either version 3 of the License, or (at your option) any
		// later version". package.json previously declared the narrower, contradictory
		// GPL-3.0-only -- exactly the package.json-vs-headers trap CLAUDE.md names.
		// Nothing pinned it, so the fix could silently revert.
		const pkgPath = path.resolve(__dirname, '..', 'package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { license?: string };
		expect(pkg.license).toBe('GPL-3.0-or-later');
	});
});
