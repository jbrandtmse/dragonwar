// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1's AC: TICK_HZ is set to 1000 on PASS (480 on FAIL) and, either way,
// marked loudly as PROVISIONAL, pending the author's macOS leg, referencing the
// pre-adjudicated "Author-owned: TICK_HZ ratification from Spike 1" ledger
// entry with no new entry filed. Nothing pinned the constant's value or the
// presence of that provisional language before this file -- a future edit could
// silently "ratify" TICK_HZ (dropping the provisional comment) or change its
// value without any test noticing. AD-3: TICK_HZ is the single simulation-clock
// constant; changing it re-records every golden replay (AD-3, AD-15), so this
// is a load-bearing pin, not a style nit.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TICK_HZ } from '../src/sim/contracts/time';

const TIME_TS_PATH = path.resolve(__dirname, '..', 'src', 'sim', 'contracts', 'time.ts');
const LEDGER_PATH = path.resolve(
	__dirname, '..', '_bmad-output', 'implementation-artifacts', 'deferred-work.md',
);

/**
 * Strips one leading "//" (plus an optional following space) from each source
 * line and rejoins with spaces, so a sentence that a human wrapped across two
 * `//` comment lines reads as continuous prose to a regex -- plain whitespace
 * collapsing alone would leave the two lines' "//" markers stuck between the
 * words. Lines that are not `//` comments (e.g. the `export const` line) pass
 * through unchanged.
 */
function joinComments(text: string): string {
	return text
		.split('\n')
		.map((line) => line.replace(/^\s*\/\/ ?/, ''))
		.join(' ')
		.replace(/\s+/g, ' ');
}

describe('src/sim/contracts/time.ts -- TICK_HZ provisional pin (Story 1.1 AC, AD-3)', () => {
	it('TICK_HZ is 1000 or 480 -- the only two values the AC permits', () => {
		expect([1000, 480]).toContain(TICK_HZ);
	});

	it('is marked loudly PROVISIONAL and explicitly NOT ratified', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toContain('PROVISIONAL');
		expect(joined).toMatch(/NOT ratified/);
	});

	it('names the pre-adjudicated TICK_HZ ratification ledger entry (no new entry filed)', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toContain('Author-owned: TICK_HZ ratification from Spike 1');
	});

	it('the referenced ledger entry actually exists in deferred-work.md under that exact name', () => {
		const ledger = joinComments(readFileSync(LEDGER_PATH, 'utf8'));
		expect(ledger).toContain('Author-owned: TICK_HZ ratification from Spike 1');
	});

	it('flags the macOS leg as the still-pending condition for ratification', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toMatch(/PENDING/);
		expect(joined).toMatch(/macOS/);
	});
});
