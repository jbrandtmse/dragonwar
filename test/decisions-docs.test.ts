// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b, AC 7: "given the drawn geometry, when the two decisions this
// epic charters to this story are made, then docs/decisions.md records the
// Ramp's return inlane (FR-27 / OQ-6) and whether the Lock lane carries both
// the lock and the mode start (OQ-5), each with its date and its reasoning."
// Also records the spinner side, the Dragon's side and the pop-bumper count
// (task 23). Content-based, not heading-position-based, following
// test/feel-test-docs.test.ts's own precedent.
//
// Falsifiability (spec ## Verification, AC 7): mutation: delete the OQ-5 row
// from docs/decisions.md -> the decisions-document test goes red naming the
// missing decision.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DOC_PATH = path.resolve(__dirname, '..', 'docs', 'decisions.md');

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ');
}

describe('docs/decisions.md -- the two epic-chartered decisions and the three author-settled ones (AC 7, task 23)', () => {
	const raw = readFileSync(DOC_PATH, 'utf8');
	const normalized = normalize(raw);

	it('records the Ramp return-inlane decision (OQ-6/FR-27), with its date', () => {
		expect(normalized).toMatch(/Ramp return inlane/);
		expect(normalized).toMatch(/OQ-6/);
		expect(normalized).toMatch(/FR-27/);
		expect(normalized).toMatch(/2026-09-01/);
	});

	it('records the Lock lane / mode start decision (OQ-5), with its evidence -- deleting this row must fail this assertion', () => {
		const row = raw.split('\n').find((line) => line.includes('OQ-5'));
		expect(row, 'the OQ-5 row must exist -- mutation: delete it and this assertion goes red').toBeDefined();
		expect(row).toMatch(/Lock lane/);
		expect(normalized).toMatch(/lock_lane_entered/);
	});

	it('records the spinner placement (Left Loop only)', () => {
		expect(normalized).toMatch(/[Ss]pinner placement/);
		expect(normalized).toMatch(/Left Loop only/);
	});

	it('records the Dragon\'s side (left of centre)', () => {
		expect(normalized.toLowerCase()).toMatch(/dragon'?s side/);
		expect(normalized).toMatch(/[Ll]eft of centre/);
	});

	it('records the pop-bumper count (three), dated 2026-08-31, attributed to the author', () => {
		expect(normalized).toMatch(/[Pp]op-bumper count/);
		expect(normalized).toMatch(/[Tt]hree/);
		expect(normalized).toMatch(/2026-08-31/);
		expect(normalized.toLowerCase()).toContain('author');
	});

	it('follows the four-column | Decision | Chosen | Rejected / deferred | Why | table shape', () => {
		expect(raw).toMatch(/\|\s*Decision\s*\|\s*Chosen\s*\|\s*Rejected\s*\/\s*deferred\s*\|\s*Why\s*\|/);
	});
});
