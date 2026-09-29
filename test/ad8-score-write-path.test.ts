// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-8 (amended 2026-09-29, Story 3.0a): every score write a mode makes goes
// through `src/sim/rules/scoring.ts`'s `awardScore()`, the one gated write
// path (closed under Tilt and outside a game, FR-15 as decided at DW-246).
// A source-level ratchet over `src/sim/rules/modes/**`, so a later mode
// (Stories 3.5-3.9) that writes `players[].score` directly turns this red.
// Kept out of the headless `test/rules-*.test.ts` set because it reads the
// filesystem (`test/rules-devices-headless.test.ts`).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AD-8 (Story 3.0a): no mode writes players[].score except through scoring.ts awardScore()', () => {
	const MODES_DIR = path.resolve(__dirname, '..', 'src', 'sim', 'rules', 'modes');
	const DIRECT_SCORE_WRITE = /\bscore\s*:|\.score\s*[+]/;

	it('no file under src/sim/rules/modes holds a direct score write', () => {
		const files = readdirSync(MODES_DIR).filter((f) => f.endsWith('.ts'));
		expect(files, 'sanity: the modes directory holds the base mode and the skill shot').toEqual(expect.arrayContaining(['base.ts', 'skill-shot.ts']));
		const offenders = files.filter((f) => DIRECT_SCORE_WRITE.test(readFileSync(path.join(MODES_DIR, f), 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('control: the pattern flags the direct write the skill shot used before this story', () => {
		expect(DIRECT_SCORE_WRITE.test('score: existing.score + tuning.skillShotAward.value,')).toBe(true);
		expect(DIRECT_SCORE_WRITE.test('awardScore(nextState, player, tuning.skillShotAward.value)')).toBe(false);
	});
});
