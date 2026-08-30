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
const THIRD_PARTY_NOTICES_PATH = path.resolve(__dirname, '..', 'public', 'THIRD-PARTY-NOTICES.txt');

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

describe('ATTRIBUTIONS.md -- vpinball/vpinball provenance record (Story 1.7 AC 9)', () => {
	// Mirrors the vpdb/vpx-js block above: pins the row CLAUDE.md's ordering
	// rule required to land BEFORE any ported file (commit `38e51cd`), so a
	// future edit that trims or "corrects" it away is caught by `pnpm test`
	// rather than by manual inspection.
	const normalized = normalize(readFileSync(ATTRIBUTIONS_PATH, 'utf8'));

	it('names the upstream project and the pinned commit', () => {
		expect(normalized).toContain('vpinball/vpinball');
		expect(normalized).toContain('3f838c14bd2e37fb49a0b5aa6a9d76d421846bef');
	});

	it('names the holder from the root LICENSE, not a per-file copyright line', () => {
		expect(normalized).toContain('Visual Pinball development team and contributors');
		expect(normalized).toMatch(/none of the ported files carries a per-file copyright line/);
	});

	it('records the licence as GPL-3.0-or-later, verified per file from each file\'s own "// license:GPLv3+" first line', () => {
		expect(normalized).toContain('GPL-3.0-or-later');
		expect(normalized).toMatch(/license:GPLv3\+/);
		expect(normalized).toMatch(/per file, from each file's own/);
	});

	it('explicitly excludes NudgeHandler.h and states why', () => {
		expect(normalized).toContain('NudgeHandler.h');
		expect(normalized).toMatch(/EXCLUDED/);
		expect(normalized).toMatch(/non-commercial/);
	});

	it('records the 2026-08-29 verification date', () => {
		expect(normalized).toContain('2026-08-29');
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

describe('ATTRIBUTIONS.md -- babylonjs-gltf2interface transitive-dependency record (review finding 2026-08-28)', () => {
	// @babylonjs/loaders pulls this in as a peerDependency, resolved into the
	// dependency tree by pnpm's autoInstallPeers -- a real package.json/
	// pnpm-lock.yaml dependency this story's original pass never recorded here.
	// Same source repository, same licence, same verification method as the
	// two direct Babylon rows above; pinned so a future edit cannot silently
	// drop the row this test itself added.
	const normalized = normalize(readFileSync(ATTRIBUTIONS_PATH, 'utf8'));

	it('names the package at the pinned 9.22.2 version, sourced from the same Babylon.js repository', () => {
		expect(normalized).toContain('babylonjs-gltf2interface');
		expect(normalized).toContain('9.22.2');
		expect(normalized).toContain('https://github.com/BabylonJS/Babylon.js/blob/master/license.md');
	});

	it('records the licence as Apache-2.0, read in license.md at source -- not from package.json or npm metadata', () => {
		const gltf2InterfaceRow = normalized.split('babylonjs-gltf2interface')[1] ?? '';
		expect(gltf2InterfaceRow).toContain('Apache-2.0');
		expect(gltf2InterfaceRow).toMatch(/read in `?license\.md`? at source/);
	});
});

describe('public/THIRD-PARTY-NOTICES.txt -- shipped content, not just presence (review finding 2026-08-28)', () => {
	// Review finding: tools/check-dist.mjs's checkThirdPartyNotices() and its
	// own test only assert the file exists and is linked from dist/index.html
	// -- neither ever reads what it actually contains. test/attributions.test.ts
	// above only asserts that ATTRIBUTIONS.md mentions this filename, not that
	// the shipped file itself carries real Apache-2.0 licence text and
	// Babylon's NOTICE.md content. A future edit that truncated or corrupted
	// public/THIRD-PARTY-NOTICES.txt would pass every other test in this repo;
	// this is the regression guard for that Apache-2.0 4(a)/4(d) obligation.
	const normalized = normalize(readFileSync(THIRD_PARTY_NOTICES_PATH, 'utf8'));

	it('names Babylon.js as the covered third-party component, at the pinned version', () => {
		expect(normalized).toContain('Babylon.js');
		expect(normalized).toContain('9.22.2');
		expect(normalized).toContain('The Babylon.js team');
	});

	it('carries Babylon NOTICE.md\'s verbatim copyright line', () => {
		expect(normalized).toContain('Copyright 2023 The Babylon.js team');
	});

	it('carries the real Apache License, Version 2.0 grant text, not a placeholder', () => {
		expect(normalized).toMatch(/Apache License,?\s*Version 2\.0/);
		expect(normalized).toContain('Licensed under the Apache License, Version 2.0');
		expect(normalized).toMatch(/http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/);
		expect(normalized).toMatch(/Unless required by applicable law/);
		expect(normalized).toMatch(/AS IS.* BASIS/);
	});
});

describe('ATTRIBUTIONS.md -- Build- and test-time tooling table (Story 1.3 AC)', () => {
	// Story 1.3's hard, spec-level acceptance criterion (task 1): the
	// dependency-cruiser and @swc/core rows land BEFORE `pnpm add -D` runs,
	// each naming the licence file URL read at its own source repository, the
	// licence, and the date it was read -- never from package.json or npm
	// metadata. Extended in the same normalised shape as the Code-table
	// describes above, plus the same rows for typescript/vitest/@types/node
	// (build tooling recorded for provenance completeness, per the rewritten
	// italic note distinguishing the two tables).
	const normalized = normalize(readFileSync(ATTRIBUTIONS_PATH, 'utf8'));

	it('names dependency-cruiser at 18.2.0, MIT, read at source', () => {
		expect(normalized).toContain('dependency-cruiser');
		expect(normalized).toContain('18.2.0');
		expect(normalized).toContain('https://github.com/sverweij/dependency-cruiser/blob/main/LICENSE');
		expect(normalized).toContain('MIT');
	});

	it('names @swc/core at 1.16.1, Apache-2.0, read at source', () => {
		expect(normalized).toContain('@swc/core');
		expect(normalized).toContain('1.16.1');
		expect(normalized).toContain('https://github.com/swc-project/swc/blob/main/LICENSE');
		expect(normalized).toContain('Apache-2.0');
	});

	it('names typescript, vitest and @types/node with their pinned versions', () => {
		expect(normalized).toContain('typescript');
		expect(normalized).toContain('7.0.2');
		expect(normalized).toContain('vitest');
		expect(normalized).toContain('4.1.11');
		expect(normalized).toContain('@types/node');
		expect(normalized).toContain('24.13.3');
	});

	it('records the 2026-08-27 verification date for the new rows', () => {
		const matches = normalized.match(/2026-08-27/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(5);
	});

	it("distinguishes the Code table from the Build- and test-time tooling table (no distribution obligation) instead of saying tooling is unrecorded", () => {
		expect(normalized).toMatch(/Build- and test-time tooling/);
		expect(normalized).not.toMatch(/is \*not\* listed here/);
	});

	it("states the ordering convention in the file's preamble", () => {
		expect(normalized).toMatch(/ordering convention/i);
		expect(normalized).toMatch(/check:attributions/);
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
