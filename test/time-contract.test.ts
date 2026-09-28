// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.1's AC: TICK_HZ is set to 1000 on PASS (480 on FAIL). Nothing pinned
// the constant's value before this file -- a future edit could change it
// without any test noticing. AD-3: TICK_HZ is the single simulation-clock
// constant; changing it re-records every golden replay (AD-3, AD-15), so this
// is a load-bearing pin, not a style nit.
//
// [CORRECTED, Story 2.15, DW-270] This file used to ALSO pin the comment's
// own "PROVISIONAL"/"NOT ratified" wording, on the premise that TICK_HZ was
// still awaiting the author's macOS legs. DW-2's own terminal trailer
// (2026-08-30) records the opposite: RATIFIED by the author at the Epic 1
// decision sheet, at 1000, on the Windows production-build numbers -- the
// macOS legs remain genuinely open (action item epic-1-retro-item-1) but no
// longer GATE the value. Pinning stale wording would have let the comment
// silently drift true without this file noticing, exactly the failure this
// file exists to prevent -- so it now pins the CORRECTED reading instead of
// being deleted. AC 1 itself (line ~41 below) is UNCHANGED and un-narrowed:
// it is Story 1.1's own acceptance criterion, and 480 stays a permitted
// value here even though no live path chooses it today (narrowing it is an
// ask-first call this story does not make -- see the spec's own "Owed
// amendments").

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

describe('src/sim/contracts/time.ts -- TICK_HZ ratification pin (Story 1.1 AC, AD-3, DW-2, DW-270)', () => {
	// Story 1.1's own AC, UNCHANGED and un-narrowed (Boundaries: "Never
	// narrow ... that is a Story 1.1 (Epic 1) acceptance criterion"). 480
	// stays permitted here even though DW-2 ratified 1000 and no live path
	// chooses 480 today -- narrowing this is an ask-first call for the
	// author, not this story's to make (see the spec's own "Owed
	// amendments").
	it('TICK_HZ is 1000 or 480 -- the only two values the AC permits', () => {
		expect([1000, 480]).toContain(TICK_HZ);
	});

	// [CORRECTED, Story 2.15, DW-270] Was "is marked loudly PROVISIONAL and
	// explicitly NOT ratified" -- the premise DW-2's own adjudication
	// overtook. Pins the CORRECTED reading instead of being deleted: an edit
	// that DELETED the ratification paragraph would fail here, because
	// "Epic 1 decision sheet" occurs nowhere else in the file.
	//
	// [CODE REVIEW, Story 2.15] This note used to claim the test also fails
	// if the comment "silently reverts back to claiming PROVISIONAL / NOT
	// ratified". It does not, and cannot: `time.ts` still contains both
	// phrases DELIBERATELY, as historical references to the premise DW-2
	// overtook, so no negative assertion is available here without
	// forbidding the file from describing its own history. Only the three
	// positive assertions below hold, and only `Epic 1 decision sheet` is
	// single-sourced -- `RATIFIED` and `DW-2` also appear on the
	// `export const TICK_HZ` line's own trailing comment, which
	// `joinComments()` passes through unchanged. Stated plainly rather than
	// left as a protection a reader would trust and not have.
	it('is marked RATIFIED, naming DW-2 and the Epic 1 decision sheet', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toMatch(/RATIFIED/);
		expect(joined).toContain('DW-2');
		expect(joined).toContain('Epic 1 decision sheet');
	});

	it('names the pre-adjudicated TICK_HZ ratification ledger entry (no new entry filed)', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toContain('Author-owned: TICK_HZ ratification from Spike 1');
	});

	it('the referenced ledger entry actually exists in deferred-work.md under that exact name', () => {
		const ledger = joinComments(readFileSync(LEDGER_PATH, 'utf8'));
		expect(ledger).toContain('Author-owned: TICK_HZ ratification from Spike 1');
	});

	// [CORRECTED, Story 2.15, DW-270] Was "the still-pending condition for
	// ratification" -- DW-2 ratified the value regardless of these two
	// rows; they remain genuinely open, but as their own tracked action
	// item, not as a gate on TICK_HZ's own value.
	it('flags the macOS leg as a still-open action item, DECOUPLED from TICK_HZ\'s own (already-ratified) value', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toMatch(/PENDING/);
		expect(joined).toMatch(/macOS/);
		expect(joined).toContain('epic-1-retro-item-1');
		expect(joined, 'macOS must no longer read as GATING the ratified value').toMatch(/no longer GATES?/i);
	});

	// DW-270's own reopen_if= probe (Design Notes, Ledger inbox): the 22
	// `value: 1` (ms) override sites this story closed `wontfix-accepted`
	// are latent on TICK_HZ specifically, so the comment beside the pin
	// must name them -- the next editor who changes this constant reads it
	// right where the change happens, not in a ledger they may not open.
	it('names the DW-270 reopen_if= probe: any future TICK_HZ change must re-examine the 22 value:1 override sites', () => {
		const joined = joinComments(readFileSync(TIME_TS_PATH, 'utf8'));
		expect(joined).toContain('DW-270');
		expect(joined).toMatch(/22 test-fixture sites|22 .*value: 1/);
	});
});
