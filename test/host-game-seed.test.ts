// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-201 -- `deriveGameSeed()` must genuinely produce a different value per
// call (a disguised constant would defeat the whole point), and the real
// gameplay boot path (`src/host/boot.ts`'s `createHostLoop()` call, the one
// every real machine actually plays through) must call it rather than
// hardcoding a literal seed. `src/host/boot.ts` itself composes DOM,
// `fetch()` and the Babylon engine boot (`test/module-coverage.test.ts`'s
// own allowlist reason for it) -- executing it end to end needs a real
// browser, so this pins the two things a headless suite CAN prove directly:
// the seed function's own genuine randomness, and (by source scan, the same
// established pattern `test/entry-html-csp.test.ts` uses for this exact
// file) that the real gameplay call site actually reads from it.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveGameSeed } from '../src/host/game-seed';
import { DEFAULT_ADJUSTMENTS } from '../src/sim/rules';

const BOOT_PATH = path.resolve(__dirname, '..', 'src', 'host', 'boot.ts');

describe('DW-201 -- deriveGameSeed() draws a real, non-constant seed', () => {
	it('returns a finite, non-negative integer (a valid GameStart.seed)', () => {
		const seed = deriveGameSeed();
		expect(Number.isInteger(seed)).toBe(true);
		expect(seed).toBeGreaterThanOrEqual(0);
	});

	it('produces different values across repeated calls -- a hardcoded constant (this ledger entry\'s exact regression) would fail this immediately', () => {
		const seeds = new Set(Array.from({ length: 20 }, () => deriveGameSeed()));
		expect(seeds.size, 'at least one of 20 draws must differ from the others').toBeGreaterThan(1);
	});
});

describe('DW-201 -- src/host/boot.ts (source scan): the real gameplay GameStart reads its seed from deriveGameSeed(), not a literal', () => {
	function realGameplayCreateHostLoopCall(source: string): string {
		// The one call this ledger entry is about is `createHostLoop(...)` --
		// the real gameplay loop every player actually plays through. The dev
		// `replayRecorder.start()` hatch further down builds its OWN, separate
		// GameStart with a deliberately fixed seed (a reproducible-recording
		// tool, not gameplay) and is untouched by this fix -- so this isolates
		// the real GameStart construction plus the createHostLoop(...) call
		// that consumes it, ending at hostLoop.start() (which fires strictly
		// before the dev hatch's own, later, separate GameStart literal), never
		// scanning the whole file, or this assertion could not tell the two
		// apart.
		const start = source.indexOf('let tuningPanel: TuningPanel | undefined;');
		expect(start, 'sanity: the real gameplay setup must still exist at this anchor').toBeGreaterThan(-1);
		const end = source.indexOf('hostLoop.start();', start);
		expect(end, 'sanity: the call must be followed by hostLoop.start() a few lines later').toBeGreaterThan(start);
		return source.slice(start, end);
	}

	it('imports deriveGameSeed from ./game-seed', () => {
		const source = readFileSync(BOOT_PATH, 'utf8');
		expect(source).toMatch(/import\s*\{\s*deriveGameSeed\s*\}\s*from\s*['"]\.\/game-seed['"]/);
	});

	it('the real createHostLoop(...) call site\'s GameStart uses deriveGameSeed(), not a numeric literal', () => {
		const call = realGameplayCreateHostLoopCall(readFileSync(BOOT_PATH, 'utf8'));
		expect(call, 'the real gameplay call must read its seed from deriveGameSeed()').toContain('deriveGameSeed()');
		expect(call, 'DW-201\'s exact regression: a hardcoded "seed: 0" must not appear in the real gameplay call').not.toMatch(/seed:\s*0\b/);
	});

	// Code review, verification-gap layer, 2026-09-06: the assertion above
	// scans the WHOLE anchor-bounded window, so it cannot tell "gameStart is
	// constructed AND passed to createHostLoop(...)" apart from "gameStart is
	// constructed but never actually passed" -- a `const gameStart = { seed:
	// deriveGameSeed(), ... }` object built and then silently dropped (the
	// 4th `createHostLoop(...)` argument deleted) would leave `deriveGameSeed()`
	// and the absence of `seed: 0` both still textually true, and the test
	// above would stay green while the real boot path fell back to
	// `sim/loop/index.ts`'s own `options.gameStart?.seed ?? 0` -- DW-201's
	// exact regression, reintroduced silently. Verified by applying that
	// exact mutation and confirming the test above still passed. This test
	// instead pins that `gameStart` is the LITERAL LAST ARGUMENT of the
	// `createHostLoop(...)` call itself -- the call's own closing `);` is the
	// last one inside the anchor window (the two callback arguments are
	// arrow functions that close with `},`, never a bare `);`), so the token
	// immediately preceding it is exactly this call's last argument.
	it('gameStart is passed as the actual LAST ARGUMENT to the real createHostLoop(...) call, not merely constructed nearby', () => {
		const call = realGameplayCreateHostLoopCall(readFileSync(BOOT_PATH, 'utf8'));
		const callCloseIndex = call.lastIndexOf(');');
		expect(callCloseIndex, 'the createHostLoop(...) call\'s own closing ")" must exist inside this window').toBeGreaterThan(-1);
		const lastArgument = call.slice(0, callCloseIndex).trimEnd();
		expect(
			lastArgument.endsWith('gameStart,') || lastArgument.endsWith('gameStart'),
			`the createHostLoop(...) call's last argument must be the bare identifier "gameStart", not merely present somewhere upstream of it -- found the call ending in: ${JSON.stringify(lastArgument.slice(-40))}`,
		).toBe(true);
	});
});

// Code review, blind-hunter layer, 2026-09-06: `boot.ts`'s new `gameStart`
// hand-types `{ tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 }`
// rather than importing `sim/rules/index.ts`'s own `DEFAULT_ADJUSTMENTS` --
// it MUST hand-type it, since `host/**` may never import `sim/rules/**`
// directly (AD-1/AD-16, `dependency-cruiser.config.mjs`'s own
// `host-no-physics-or-rules` rule, `severity: 'error'`). The comment beside
// it claims this literal "mirrors this loop's own PRE-EXISTING implicit
// defaults exactly," which is true today only because nothing enforces it
// stays true -- a future change to `DEFAULT_ADJUSTMENTS` would silently stop
// matching the literal every real game actually boots with. This test is
// that enforcement: it reads `DEFAULT_ADJUSTMENTS` (a test-only named
// export, the `HARDWARE_COILS`/`PLAYFIELD_SWITCHES` precedent) and the
// boot.ts source text side by side.
describe('DW-201 code review -- boot.ts\'s real gameplay adjustments literal must not silently drift from sim/rules/index.ts\'s own DEFAULT_ADJUSTMENTS', () => {
	it('tiltWarnings, ballsPerGame and matchProbability in the real createHostLoop(...) call equal DEFAULT_ADJUSTMENTS\'s own values', () => {
		const source = readFileSync(BOOT_PATH, 'utf8');
		const match = source.match(
			/adjustments:\s*\{\s*pitchDeg:\s*TABLE\.reference\.pitchDeg,\s*tiltWarnings:\s*(-?\d+(?:\.\d+)?),\s*ballsPerGame:\s*(-?\d+(?:\.\d+)?),\s*matchProbability:\s*(-?\d+(?:\.\d+)?)\s*\}/,
		);
		expect(match, 'the real gameplay adjustments literal must be found in this exact shape in boot.ts').not.toBeNull();
		const [, tiltWarnings, ballsPerGame, matchProbability] = match!;

		expect(Number(tiltWarnings), 'boot.ts\'s tiltWarnings must equal DEFAULT_ADJUSTMENTS.tiltWarnings').toBe(DEFAULT_ADJUSTMENTS.tiltWarnings);
		expect(Number(ballsPerGame), 'boot.ts\'s ballsPerGame must equal DEFAULT_ADJUSTMENTS.ballsPerGame').toBe(DEFAULT_ADJUSTMENTS.ballsPerGame);
		expect(Number(matchProbability), 'boot.ts\'s matchProbability must equal DEFAULT_ADJUSTMENTS.matchProbability').toBe(
			DEFAULT_ADJUSTMENTS.matchProbability,
		);
	});
});
