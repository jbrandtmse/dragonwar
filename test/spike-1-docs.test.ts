// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1's results document, docs/spikes/spike-1.md, carries several
// AC-named structural requirements that were previously checked only by manual
// inspection (see the spec's Verification section): the four measurement-path
// rows, the two macOS/Safari rows marked PENDING and referencing the
// pre-adjudicated ledger entry (not a new one), a PASS/FAIL verdict, the p95
// method, the "17 steps" derivation, and the full port-deviation list (severed
// couplings, the extracted restitution constant, wall-clock/random
// substitutions, and any headerless upstream file). This file turns those into
// automated regressions.
//
// Deliberately content-based, not line/heading-position-based: the document has
// already been restructured once in this story (the original dev-page verdict
// was superseded by a production-build re-measurement) without invalidating any
// of these requirements, so pinning exact section order or exact numbers would
// be the wrong kind of brittle. Whitespace (including markdown line-wrap) is
// normalized before matching so a future rewrap doesn't break these on its own.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DOC_PATH = path.resolve(__dirname, '..', 'docs', 'spikes', 'spike-1.md');
const LEDGER_PATH = path.resolve(
	__dirname, '..', '_bmad-output', 'implementation-artifacts', 'deferred-work.md',
);

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ');
}

describe('docs/spikes/spike-1.md -- results document structure (Story 1.1 AC)', () => {
	const normalized = normalize(readFileSync(DOC_PATH, 'utf8'));

	it('carries all four measurement-path rows', () => {
		expect(normalized).toMatch(/Chrome\s*\/\s*Windows/);
		expect(normalized).toMatch(/Edge\s*\/\s*Windows/);
		expect(normalized).toMatch(/Chrome\s*\/\s*macOS/);
		expect(normalized).toMatch(/Safari\s*\/\s*macOS/);
	});

	it('marks the macOS/Safari legs PENDING, referencing the existing ledger entry by name', () => {
		expect(normalized).toMatch(/PENDING/);
		expect(normalized).toContain('Author-owned: macOS / Safari measurement legs');
	});

	it('references the TICK_HZ ratification ledger entry by name (no new entry filed)', () => {
		expect(normalized).toContain('Author-owned: TICK_HZ ratification from Spike 1');
	});

	it('both referenced ledger entries actually exist in deferred-work.md under those exact names', () => {
		const ledger = normalize(readFileSync(LEDGER_PATH, 'utf8'));
		expect(ledger).toContain('Author-owned: macOS / Safari measurement legs');
		expect(ledger).toContain('Author-owned: TICK_HZ ratification from Spike 1');
	});

	it('states a PASS or FAIL verdict', () => {
		expect(normalized).toMatch(/verdict:?\s*\*{0,2}(PASS|FAIL)/i);
	});

	it('records the p95 method (nearest-rank on the sorted sample array)', () => {
		expect(normalized).toMatch(/nearest-rank/i);
		expect(normalized).toContain('Math.ceil(0.95');
	});

	it('derives "17 steps" from TICK_HZ rather than stating it as a bare given', () => {
		expect(normalized).toMatch(/17 steps/i);
		expect(normalized).toContain('Math.ceil(TICK_HZ / 60)');
	});

	it('lists every category of port deviation the AC requires', () => {
		expect(normalized).toMatch(/[Ss]evered/); // severed lib/game/ and other non-physics couplings
		expect(normalized).toContain('BALL_BALL_RESTITUTION'); // the extracted restitution constant
		expect(normalized).toMatch(/Math\.random/); // wall-clock/random substitutions
		expect(normalized).toMatch(/[Hh]eaderless/); // any upstream file that carried no header
	});
});
