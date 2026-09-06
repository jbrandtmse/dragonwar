// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6 -- the I/O & Edge-Case Matrix rows against `advanceBackglass()`
// and `renderFrame()`: score screen, end-of-ball disagreement (built from a
// REAL `runRulesScript` run, never by fiat -- Design Notes), attract with
// scores, attract at cold boot, mode-view selection, mode-view field
// subset, and a row wide enough to need `raster.ts`'s own clamping. Plus
// AC 2's source-level scan: every English display literal lives under
// `src/presentation/backglass/**` and nowhere under `src/sim/**`.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	advanceBackglass,
	renderFrame,
	INITIAL_BACKGLASS_VIEW,
	type BackglassView,
} from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { close, open, runRulesScript } from './util/switch-script';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import type { FrameOutput, GameState } from '../src/sim/table/names';

function frameOutput(overrides: Partial<FrameOutput> = {}): FrameOutput {
	return {
		snapshot: buildSnapshot(),
		events: [],
		contactEvents: [],
		commands: [],
		...overrides,
	};
}

describe('renderFrame() -- the score screen (AC 2)', () => {
	it('all three scores carry thousands separators, exactly the current-player row is flagged, and the ball row reads the CURRENT player\'s ball number', () => {
		const game: GameState = {
			...BASE_GAME_STATE,
			phase: 'game',
			currentPlayer: 1,
			players: [
				buildPlayer({ score: 1234, ballNumber: 1 }),
				buildPlayer({ score: 5678, ballNumber: 3 }),
				buildPlayer({ score: 90, ballNumber: 1 }),
			],
		};
		const view: BackglassView = { ...INITIAL_BACKGLASS_VIEW, screen: 'score' };
		const frame = renderFrame(view, buildSnapshot({ game }));

		expect(frame.screen).toBe('score');
		const scoreRows = frame.rows.slice(0, 3);
		expect(scoreRows.map((r) => r.text)).toEqual(['1,234', '5,678', '90']);
		expect(scoreRows.map((r) => r.emphasis), 'exactly index 1 (currentPlayer) must be flagged current').toEqual([false, true, false]);

		const ballRow = frame.rows.find((r) => r.text.startsWith('BALL'));
		expect(ballRow?.text, 'the ball row must read the CURRENT player\'s own ball number (3), not players[0]\'s (1)').toBe('BALL 3');
	});
});

describe('advanceBackglass() -- game_over and highscore_entry also fall through to the score screen (DW-196: only phase "game" was previously exercised, though the doc comment above advanceBackglass() names all three)', () => {
	it.each(['game_over', 'highscore_entry'] as const)('phase "%s" selects the score screen, exactly like phase "game"', (phase) => {
		const game: GameState = {
			...BASE_GAME_STATE,
			phase,
			players: [buildPlayer({ score: 42, ballNumber: 1 })],
		};
		const view = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ game }) }));
		expect(view.screen).toBe('score');
	});
});

describe('AC 3 -- the end-of-ball screen names the player from the event payload, built from a REAL runRulesScript run', () => {
	it('ball_ended.player and snapshot.game.currentPlayer genuinely disagree (Hot seat rotation), and the screen names the PAYLOAD player, not the snapshot\'s', () => {
		// Design Notes, "AC 3's disagreement is real": close('s_start') twice
		// (ticks 5, 8) opens the Hot seat window and adds a second player while
		// player 0's ball 1 is in progress; opening s_shooter_lane (tick 10)
		// plunges it; closing s_trough_1 (tick 20) is a parking-device entry
		// that -- with ballsInPlay driven to 0 by the drain -- ends player 0's
		// ball and rotates currentPlayer to 1, all inside rules.step(tick=20).
		const script = close('s_start').at(5).at(8).open('s_shooter_lane').at(10).close('s_trough_1').at(20);
		const result = runRulesScript(script.build(), { durationTicks: 20 });

		const eventsAtTick20 = result.events.filter((e) => e.tick === 20);
		const ballEnded = eventsAtTick20.find((e) => e.type === 'ball_ended');
		expect(ballEnded, 'the script must genuinely produce a ball_ended event at tick 20 -- the whole test is vacuous otherwise').toBeDefined();
		const endingPlayer = ballEnded && ballEnded.type === 'ball_ended' ? ballEnded.player : undefined;
		expect(endingPlayer, 'the ENDING player must be 0').toBe(0);
		expect(result.finalState.currentPlayer, 'currentPlayer must have rotated to 1 -- the two sources must genuinely disagree').toBe(1);
		expect(result.finalState.players.length, 'Hot seat must have genuinely added a second player').toBe(2);

		// Distinct scores layered on top of the REAL rotation/naming state (never
		// fabricating the disagreement itself, only making the score assertion
		// discriminating -- Design Notes: "a partially-correct implementation
		// cannot pass").
		const gameWithDistinctScores: GameState = {
			...result.finalState,
			players: result.finalState.players.map((player, index) => ({ ...player, score: index === 0 ? 1111 : 2222 })),
		};
		const output: FrameOutput = frameOutput({
			snapshot: buildSnapshot({ tick: 20, game: gameWithDistinctScores }),
			events: eventsAtTick20,
		});

		const view = advanceBackglass(INITIAL_BACKGLASS_VIEW, output);
		expect(view.screen).toBe('ball_ended');
		const frame = renderFrame(view, output.snapshot);

		expect(frame.rows.some((r) => r.text === 'PLAYER 1'), 'must name PLAYER 1 (event.player 0, 1-indexed for display) -- reading currentPlayer instead would say PLAYER 2').toBe(true);
		expect(frame.rows.some((r) => r.text === '1,111'), 'must show player 0\'s own score (1,111), not player 1\'s (2,222)').toBe(true);
		expect(frame.rows.some((r) => r.text === '2,222'), 'player 1\'s score must NOT appear on this screen').toBe(false);
	});
});

describe('AC 4 -- Attract cycles with scores, and pins to the prompt with none', () => {
	it('with two players carrying distinct scores, the screen id is not constant across a full cycle, both screens appear, the prompt reads PRESS START, the scores screen shows both scores, and it wraps', () => {
		const game: GameState = {
			...BASE_GAME_STATE,
			phase: 'attract',
			players: [buildPlayer({ score: 4200 }), buildPlayer({ score: 990 })],
		};

		let view = INITIAL_BACKGLASS_VIEW;
		const screensByTick = new Map<number, string>();
		// One full cycle's worth of ticks, plus one -- the cycle length is an
		// implementation constant, so probe generously past any single
		// reasonable period rather than importing it.
		const PROBE_TICKS = 8000;
		for (let tick = 0; tick <= PROBE_TICKS; tick++) {
			view = advanceBackglass(view, frameOutput({ snapshot: buildSnapshot({ tick, game }) }));
			screensByTick.set(tick, view.screen);
		}

		const distinctScreens = new Set(screensByTick.values());
		expect(distinctScreens.has('attract_prompt'), 'the cycle must visit attract_prompt').toBe(true);
		expect(distinctScreens.has('attract_scores'), 'the cycle must visit attract_scores').toBe(true);
		expect(distinctScreens.size, 'the screen id must not be constant').toBeGreaterThan(1);

		// The cycle must wrap: some later tick returns to tick 0's own screen,
		// with at least one tick strictly in between differing from it.
		const screenAtT0 = screensByTick.get(0)!;
		let sawDifferent = false;
		let wrapTick = -1;
		for (let tick = 1; tick <= PROBE_TICKS; tick++) {
			const screen = screensByTick.get(tick);
			if (screen !== screenAtT0) {
				sawDifferent = true;
			} else if (sawDifferent) {
				wrapTick = tick;
				break;
			}
		}
		expect(wrapTick, 'the cycle must return to tick 0\'s own screen after genuinely differing in between').toBeGreaterThan(0);

		const promptFrame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'attract_prompt' }, buildSnapshot({ game }));
		expect(promptFrame.rows.some((r) => r.text.includes('PRESS START'))).toBe(true);

		const scoresFrame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'attract_scores' }, buildSnapshot({ game }));
		expect(scoresFrame.rows.some((r) => r.text === '4,200')).toBe(true);
		expect(scoresFrame.rows.some((r) => r.text === '990')).toBe(true);
	});

	it('cold boot (players: []) renders only the prompt, at every tick, with no empty score rows', () => {
		const game: GameState = { ...BASE_GAME_STATE, phase: 'attract', players: [] };
		let view = INITIAL_BACKGLASS_VIEW;
		for (const tick of [0, 1000, 5000, 9000]) {
			view = advanceBackglass(view, frameOutput({ snapshot: buildSnapshot({ tick, game }) }));
			expect(view.screen, `at tick ${tick}, cold boot must show only the prompt`).toBe('attract_prompt');
		}
		const frame = renderFrame(view, buildSnapshot({ game }));
		expect(frame.rows.some((r) => r.text.includes('PRESS START'))).toBe(true);
		expect(frame.rows.length, 'no empty score row may be present').toBe(1);
	});
});

describe('AC 5 -- the highest-priority mode, with published fields converted to display units', () => {
	function gameWithModes(modes: GameState['modes']): GameState {
		return {
			...BASE_GAME_STATE,
			phase: 'game',
			players: [buildPlayer({ score: 0, ballNumber: 1 })],
			currentPlayer: 0,
			modes,
		};
	}

	it('low priority scripted FIRST so selecting modes[0] cannot accidentally pass: shows the skill-shot name and 4.5s, never the base mode\'s name, 250, or the raw 4500', () => {
		const game = gameWithModes([
			{ mode: 'base', priority: 100, player: 0, value: 250 },
			{ mode: 'skill_shot', priority: 200, player: 0, timerTicks: 4500 },
		]);
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game }));
		const texts = frame.rows.map((r) => r.text);

		expect(texts).toContain('SKILL SHOT');
		expect(texts).toContain('4.5');
		expect(texts.some((t) => t.includes('BASE'))).toBe(false);
		expect(texts).not.toContain('250');
		expect(texts.some((t) => t.includes('4500'))).toBe(false);
	});

	it('a ModeView publishing timerTicks only produces no row for value, charge or strikesRemaining', () => {
		const game = gameWithModes([{ mode: 'skill_shot', priority: 200, player: 0, timerTicks: 1000 }]);
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game }));
		// The EXACT row list, not merely a filtered subset (Rule 19's own
		// warning: a filter-based assertion cannot see an EXTRA row a
		// too-permissive implementation adds alongside the expected ones --
		// measured live authoring this test: unconditionally rendering
		// value/charge/strikesRemaining left this exact filtered assertion
		// green while three stray "undefined" rows had appeared).
		expect(frame.rows.map((r) => r.text)).toEqual(['0', 'BALL 1', 'SKILL SHOT', '1.0']);
	});
});

describe('a row wider than the panel is clamped by rasterise(), through the real renderFrame() -> rasterise() pipeline', () => {
	it('an implausibly long mode name never throws and never lights a dot outside the buffer', () => {
		const game: GameState = {
			...BASE_GAME_STATE,
			phase: 'game',
			players: [buildPlayer({ score: 0, ballNumber: 1 })],
			currentPlayer: 0,
			modes: [{ mode: 'a_very_long_mode_name_indeed_and_then_some', priority: 100, player: 0 }],
		};
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game }));
		const longRow = frame.rows.find((r) => r.text.startsWith('A VERY LONG'));
		expect(longRow, 'sanity: the over-width row must actually be present, unclamped, in renderFrame()\'s own output -- clamping is raster.ts\'s job, not frame.ts\'s').toBeDefined();
		expect(longRow!.text.length).toBeGreaterThan(21);

		expect(() => rasterise(frame, FONT_5X7)).not.toThrow();
		const raster = rasterise(frame, FONT_5X7);
		expect(raster.dots.length).toBe(raster.cols * raster.rows);
	});
});

describe('AC 2 (source scan) -- every English display literal lives under src/presentation/backglass/** and nowhere under src/sim/**', () => {
	function listTsFiles(dir: string): string[] {
		return readdirSync(dir, { recursive: true })
			.map((entry) => entry.toString())
			.filter((entry) => entry.endsWith('.ts'))
			.map((entry) => path.join(dir, entry));
	}

	const DISPLAY_LITERALS = ['PRESS START', 'PLAYER ', 'BALL '];

	/**
	 * Comments freely discuss balls and players in English prose -- this scan
	 * cares about actual source TEXT (string/template literal content), never
	 * comments, so strip both comment styles first (the same "comments exempt"
	 * carve-out `boundary-lint.mjs`'s own device-name-literal check applies).
	 *
	 * DW-195: a prior version of this function used
	 * `source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')` --
	 * both regexes look for "//" or `/*` ANYWHERE on a line, including inside
	 * a live string or template literal (e.g. a URL like `"http://example"`,
	 * or a genuine display-literal string that merely follows one earlier on
	 * the same line). That would truncate everything from the false "comment
	 * start" to end of line, silently deleting real source TEXT this scan is
	 * supposed to see -- which could hide an actual display-literal violation
	 * under `src/sim/**` from the negative-control test below, or hide a
	 * genuine literal from the positive control above. This version walks the
	 * source character by character, tracking whether it is inside a `'`/`"`/
	 * `` ` `` string (respecting `\`-escapes) so a `//` or `/*` inside a live
	 * string is left completely alone -- only a REAL comment, outside any
	 * string, is stripped.
	 */
	function stripComments(source: string): string {
		let out = '';
		let inString: '\'' | '"' | '`' | null = null;
		for (let i = 0; i < source.length; i++) {
			const c = source[i];
			if (inString) {
				out += c;
				if (c === '\\' && i + 1 < source.length) {
					out += source[i + 1];
					i += 1;
				} else if (c === inString) {
					inString = null;
				}
				continue;
			}
			if (c === '\'' || c === '"' || c === '`') {
				inString = c;
				out += c;
				continue;
			}
			if (c === '/' && source[i + 1] === '/') {
				while (i < source.length && source[i] !== '\n') {
					i += 1;
				}
				out += '\n';
				continue;
			}
			if (c === '/' && source[i + 1] === '*') {
				i += 2;
				while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
					i += 1;
				}
				i += 1; // land on the closing '/'; the loop's i++ advances past it
				continue;
			}
			out += c;
		}
		return out;
	}

	it('DW-195: stripComments() does not truncate a real string literal that shares a line with an earlier "//" inside ANOTHER string (the naive regex this replaced would delete everything after the first "//" on the line, comment or not)', () => {
		// "http://also-real" is real string content containing "//" -- a naive
		// line-comment regex firing on the FIRST "//" it sees would treat it as
		// a comment start and delete everything after it on the line, including
		// the "PLAYER " literal in the SECOND string below.
		const source = 'const url = "http://also-real"; const label = "PLAYER ";';
		const stripped = stripComments(source);
		expect(stripped, 'a "//" inside a string must not be treated as a comment start').toContain('http://also-real');
		expect(stripped, 'a real string literal sharing the line with an earlier "//"-in-a-string must survive').toContain('PLAYER ');
	});

	it('DW-195 control: stripComments() still strips a GENUINE line comment, including one that follows real code on the same line', () => {
		const source = 'const label = "PLAYER "; // PRESS START is only ever discussed here, in prose';
		const stripped = stripComments(source);
		expect(stripped, 'the real string literal before the comment must survive').toContain('PLAYER ');
		expect(stripped, 'a genuine comment must still be removed').not.toContain('PRESS START');
	});

	it('every display literal actually appears somewhere under src/presentation/backglass/** (a non-vacuous positive control)', () => {
		const backglassDir = path.resolve(__dirname, '..', 'src', 'presentation', 'backglass');
		const contents = listTsFiles(backglassDir).map((file) => stripComments(readFileSync(file, 'utf8'))).join('\n');
		for (const literal of DISPLAY_LITERALS) {
			expect(contents.includes(literal), `expected "${literal}" to appear (outside comments) under src/presentation/backglass/**`).toBe(true);
		}
	});

	it('no display literal appears anywhere under src/sim/** (outside comments -- comments freely discuss balls and players in English prose)', () => {
		const simDir = path.resolve(__dirname, '..', 'src', 'sim');
		for (const file of listTsFiles(simDir)) {
			const contents = stripComments(readFileSync(file, 'utf8'));
			for (const literal of DISPLAY_LITERALS) {
				expect(contents.includes(literal), `${path.relative(simDir, file)} must not contain the display literal "${literal}" outside a comment (AD-9: rules never format text)`).toBe(false);
			}
		}
	});
});
