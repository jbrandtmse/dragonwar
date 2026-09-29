// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-8 (amended 2026-09-29, Story 3.0a): every score write a mode makes goes
// through `src/sim/rules/scoring.ts`'s `awardScore()`, the one gated write
// path (closed under Tilt and outside a game, FR-15 as decided at DW-246).
// A source-level ratchet over every file under `src/sim/rules/**`
// (recursively), so a later mode or helper (Stories 3.5-3.9) that writes
// `players[].score` directly turns this red. The only sanctioned writers are
// pinned by count: `awardScore()` itself, and the ball controller's new-player
// `score: 0` and its drain-tick bonus write (outside the gate by design: it
// runs at ball end and already forfeits on Tilt).
// Kept out of the headless `test/rules-*.test.ts` set because it reads the
// filesystem (`test/rules-devices-headless.test.ts`).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AD-8 (Story 3.0a): no mode writes players[].score except through scoring.ts awardScore()', () => {
	const RULES_DIR = path.resolve(__dirname, '..', 'src', 'sim', 'rules');
	const DIRECT_SCORE_WRITE = /\bscore\s*:|\.score\s*(?:[-+*/]?=(?!=)|[+])|\[\s*['"]score['"]\s*\]\s*:/;
	/** Lines of `source` holding a direct score write. */
	const writeLines = (source: string): number => source.split('\n').filter((line) => DIRECT_SCORE_WRITE.test(line)).length;
	/** The sanctioned writers, by file (POSIX path under `src/sim/rules`) and exact line count. */
	const SANCTIONED: Readonly<Record<string, number>> = { 'scoring.ts': 1, 'ball-controller/start.ts': 1, 'ball-controller/ball-end.ts': 1 };

	it('no file under src/sim/rules/** holds a direct score write beyond the sanctioned ones', () => {
		const files = (readdirSync(RULES_DIR, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/')).filter((f) => f.endsWith('.ts'));
		expect(files, 'sanity: the scan reaches the modes subdirectory').toEqual(expect.arrayContaining(['modes/base.ts', 'modes/skill-shot.ts', 'scoring.ts']));
		const hits = Object.fromEntries(files.map((f) => [f, writeLines(readFileSync(path.join(RULES_DIR, f), 'utf8'))] as const).filter(([, n]) => n > 0));
		expect(hits).toEqual(SANCTIONED);
	});

	it('control: the pattern flags each direct-write shape and passes the helper call', () => {
		const count = writeLines;
		expect(count('score: existing.score + tuning.skillShotAward.value,'), 'the write the skill shot used before this story').toBe(1);
		expect(count('p.score += 10;')).toBe(1);
		expect(count('p.score = p.score + 10;')).toBe(1);
		expect(count("{ ...p, ['score']: 10 }")).toBe(1);
		expect(count('awardScore(nextState, player, tuning.skillShotAward.value)')).toBe(0);
		expect(count('if (a.score === b.score) {')).toBe(0);
	});
});
