// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Review finding 2026-08-29: tools/replay-parity/browser.ts's runOneGolden()
// comparison (the AD-15 cross-engine-safety choice: compare
// finalGameStateHash, NEVER finalHash) and tools/replay-parity/serve.mjs's
// golden-name/URL-routing regexes had no automated coverage -- unlike the
// precedent this story explicitly follows: tools/spike-1/browser.ts's
// equivalent non-DOM logic is unit-tested in
// test/spike-1-browser-guard.test.ts, without a live browser. Same shape
// here: import the pure pieces directly and assert against them.

import { describe, expect, it } from 'vitest';
import { judgeGoldenResult } from '../tools/replay-parity/browser';
import { GOLDEN_NAME_PATTERN, GOLDEN_ROUTE_PATTERN } from '../tools/replay-parity/serve.mjs';

describe('tools/replay-parity/browser.ts -- judgeGoldenResult() (AD-15 cross-engine-safety field selection)', () => {
	it('reports PASS when finalGameStateHash matches, regardless of finalHash', () => {
		const result = { finalHash: 'aaaaaaaa', finalGameStateHash: 'shared-hash' };
		const golden = { expectedHash: 'zzzzzzzz', expectedGameStateHash: 'shared-hash' };
		// finalHash (aaaaaaaa) deliberately does NOT match expectedHash
		// (zzzzzzzz) -- if judgeGoldenResult() keyed off finalHash, this would
		// report FAIL. It must still report PASS, because only
		// finalGameStateHash/expectedGameStateHash are compared.
		expect(result.finalHash).not.toBe(golden.expectedHash);
		expect(judgeGoldenResult(result, golden).pass).toBe(true);
	});

	it('reports FAIL when finalGameStateHash does NOT match, even though finalHash does', () => {
		const result = { finalHash: 'shared-hash', finalGameStateHash: 'bbbbbbbb' };
		const golden = { expectedHash: 'shared-hash', expectedGameStateHash: 'yyyyyyyy' };
		// finalHash (shared-hash) deliberately DOES match expectedHash -- if
		// judgeGoldenResult() keyed off finalHash, this would report PASS. It
		// must still report FAIL, because finalGameStateHash/
		// expectedGameStateHash disagree.
		expect(result.finalHash).toBe(golden.expectedHash);
		expect(judgeGoldenResult(result, golden).pass).toBe(false);
	});

	it("PASS detail names the matching hash", () => {
		const result = { finalHash: 'x', finalGameStateHash: 'abc123' };
		const golden = { expectedHash: 'x', expectedGameStateHash: 'abc123' };
		expect(judgeGoldenResult(result, golden).detail).toContain('abc123');
	});

	it('FAIL detail names both the computed and expected GameState hash', () => {
		const result = { finalHash: 'x', finalGameStateHash: 'computed-hash' };
		const golden = { expectedHash: 'x', expectedGameStateHash: 'expected-hash' };
		const { detail } = judgeGoldenResult(result, golden);
		expect(detail).toContain('computed-hash');
		expect(detail).toContain('expected-hash');
	});
});

describe('tools/replay-parity/serve.mjs -- GOLDEN_NAME_PATTERN (kebab-case golden names only)', () => {
	it('accepts kebab-case names', () => {
		expect(GOLDEN_NAME_PATTERN.test('roll-and-drain')).toBe(true);
		expect(GOLDEN_NAME_PATTERN.test('two-ball-collision')).toBe(true);
		expect(GOLDEN_NAME_PATTERN.test('a')).toBe(true);
	});

	it('rejects non-kebab-case names (uppercase, underscores, spaces, dots)', () => {
		expect(GOLDEN_NAME_PATTERN.test('Roll-And-Drain')).toBe(false);
		expect(GOLDEN_NAME_PATTERN.test('roll_and_drain')).toBe(false);
		expect(GOLDEN_NAME_PATTERN.test('roll and drain')).toBe(false);
		expect(GOLDEN_NAME_PATTERN.test('roll.and.drain')).toBe(false);
		expect(GOLDEN_NAME_PATTERN.test('')).toBe(false);
	});
});

describe('tools/replay-parity/serve.mjs -- GOLDEN_ROUTE_PATTERN (the per-golden URL route)', () => {
	it('matches a well-formed golden URL and captures the kebab-case name', () => {
		const match = GOLDEN_ROUTE_PATTERN.exec('/dragonwar-goldens/nudge-coupling.golden.json');
		expect(match).not.toBeNull();
		expect(match?.[1]).toBe('nudge-coupling');
	});

	it('does not match a non-kebab-case name, an unrelated path, or a missing .golden.json suffix', () => {
		expect(GOLDEN_ROUTE_PATTERN.exec('/dragonwar-goldens/Nudge_Coupling.golden.json')).toBeNull();
		expect(GOLDEN_ROUTE_PATTERN.exec('/dragonwar-goldens/index.json')).toBeNull();
		expect(GOLDEN_ROUTE_PATTERN.exec('/dragonwar-goldens/nudge-coupling.json')).toBeNull();
		expect(GOLDEN_ROUTE_PATTERN.exec('/other/nudge-coupling.golden.json')).toBeNull();
	});
});
