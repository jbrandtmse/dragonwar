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

/** The distinct dot ROWS carrying at least one lit dot -- the observable that proves text actually reached the panel. */
function litDotRows(raster: { cols: number; rows: number; dots: Uint8Array }): number[] {
	const rows: number[] = [];
	for (let r = 0; r < raster.rows; r++) {
		for (let c = 0; c < raster.cols; c++) {
			if (raster.dots[r * raster.cols + c] === 1) {
				rows.push(r);
				break;
			}
		}
	}
	return rows;
}

/** The leftmost lit dot COLUMN across the whole buffer, or -1 when nothing is lit. */
function leftmostLitCol(raster: { cols: number; rows: number; dots: Uint8Array }): number {
	let min = -1;
	for (let r = 0; r < raster.rows; r++) {
		for (let c = 0; c < raster.cols; c++) {
			if (raster.dots[r * raster.cols + c] === 1 && (min === -1 || c < min)) {
				min = c;
			}
		}
	}
	return min;
}

describe('code review -- a REAL renderFrame() output actually LIGHTS DOTS, at the dot coordinates frame.ts assigns', () => {
	// Found by code review: before this test, nothing anywhere tied a real
	// `renderFrame()` output to a single lit dot. Every assertion in this file
	// read `.text` / `.emphasis` / `rows.length`; the one place a real frame
	// reached `rasterise()` (the over-width case below) asserted only
	// `not.toThrow()` and the buffer's LENGTH -- both of which hold for an
	// all-zero buffer. `frame.ts`'s `LEFT_MARGIN_COL` and `LINE_PITCH_ROWS`,
	// and every `col`/`row` they produce, were therefore completely unpinned:
	// MEASURED, `LEFT_MARGIN_COL = 200` pushes every glyph past `DMD_COLS` so
	// `raster.ts` drops it and the panel is COMPLETELY BLANK in production --
	// and all 33 backglass tests still passed. This is the composition
	// `src/host/boot.ts:236` actually ships (`rasterise(renderFrame(...))`),
	// so it is the one that has to be observable.
	it('the score screen lights dots in four distinct 8-row bands with genuinely unlit gutter rows between them, and starts near the left edge', () => {
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
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game }));
		expect(frame.rows.length, 'sanity: three scores plus the ball row').toBe(4);

		const raster = rasterise(frame, FONT_5X7);
		const lit = litDotRows(raster);

		// (a) SOMETHING is lit. Kills LEFT_MARGIN_COL = 200 (blank panel).
		expect(lit.length, 'a real score frame must light at least one dot -- a blank panel is the failure this pins').toBeGreaterThan(0);

		// (b) The text starts near the left edge, not off-panel to the right.
		expect(leftmostLitCol(raster), 'the score rows must begin within a few dots of the left edge').toBeLessThan(8);

		// (c) All four lines are present, each inside its own 7-row glyph band.
		//     Kills LINE_PITCH_ROWS = 0 (all four lines overprinted on rows 0-6).
		const BANDS = [0, 8, 16, 24];
		for (const band of BANDS) {
			expect(
				lit.some((r) => r >= band && r <= band + 6),
				`line at dot row ${band} must light at least one dot -- a missing band means that line never reached the panel`,
			).toBe(true);
		}

		// (d) The gutter rows between the bands are genuinely unlit. This is
		//     what pins LINE_PITCH_ROWS = 8 against GLYPH_H = 7: any overlap or
		//     any different pitch puts a lit dot on one of these rows.
		for (const gutter of [7, 15, 23, 31]) {
			expect(lit, `dot row ${gutter} is the gutter between two lines and must carry no lit dot`).not.toContain(gutter);
		}

		// (e) No lit dot outside the four bands at all.
		for (const r of lit) {
			expect(
				BANDS.some((band) => r >= band && r <= band + 6),
				`lit dot row ${r} falls outside every line band -- the line arithmetic has drifted`,
			).toBe(true);
		}
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

	/** The same REAL 20-tick disagreeing end-of-ball frame the case above builds, reusable by the hold cases below. */
	function realBallEndedFrame(): { output: FrameOutput; game: GameState } {
		const script = close('s_start').at(5).at(8).open('s_shooter_lane').at(10).close('s_trough_1').at(20);
		const result = runRulesScript(script.build(), { durationTicks: 20 });
		const eventsAtTick20 = result.events.filter((e) => e.tick === 20);
		expect(eventsAtTick20.some((e) => e.type === 'ball_ended'), 'sanity: the script must still produce ball_ended at tick 20').toBe(true);
		const game: GameState = {
			...result.finalState,
			players: result.finalState.players.map((player, index) => ({ ...player, score: index === 0 ? 1111 : 2222 })),
		};
		return { output: frameOutput({ snapshot: buildSnapshot({ tick: 20, game }), events: eventsAtTick20 }), game };
	}

	// Found by code review: the hold branch and the frozen `heldBallEnded`
	// payload had NO coverage anywhere -- every existing case (this file's AC 3
	// case and both integration cases) stopped at or before the ARMING frame,
	// so nothing ever passed `advanceBackglass()` a view whose screen was
	// already 'ball_ended'. MEASURED: setting BALL_ENDED_HOLD_TICKS to 0 --
	// which reduces the end-of-ball screen to a single 1 ms tick nobody could
	// ever see -- left all 33 backglass tests green.
	it('code review: the end-of-ball screen HOLDS across later event-free frames, keeps its frozen payload, and releases at the deadline', () => {
		const { output, game } = realBallEndedFrame();
		const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, output);
		expect(armed.screen).toBe('ball_ended');
		expect(armed.holdUntilTick, 'arming must set a hold deadline').not.toBeNull();

		// The NEXT sim frame carries NO event and the snapshot has already moved
		// on -- exactly what boot.ts feeds it 1 ms later.
		const nextTickFrame = frameOutput({ snapshot: buildSnapshot({ tick: 21, game }), events: [] });
		const held = advanceBackglass(armed, nextTickFrame);
		expect(held.screen, 'the frame after ball_ended must STILL show the end-of-ball screen').toBe('ball_ended');
		const heldRows = renderFrame(held, nextTickFrame.snapshot).rows;
		expect(heldRows.some((r) => r.text === 'PLAYER 1'), 'the held screen must keep naming the ENDING player, from the frozen payload').toBe(true);
		expect(heldRows.some((r) => r.text === '1,111'), 'the held screen must keep the ENDING player\'s own score').toBe(true);
		expect(heldRows.some((r) => r.text === '2,222'), 'the held screen must never show the rotated-to player\'s score').toBe(false);

		// At the deadline it releases back to live play.
		const releaseFrame = frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game }), events: [] });
		expect(advanceBackglass(held, releaseFrame).screen, 'at holdUntilTick the hold must expire').toBe('score');
	});

	// Found by code review: `src/host/loop.ts`'s `reset()` (tuning hot-apply,
	// replay playback, both boot.ts dev hatches) rebuilds the sim and restarts
	// the tick count at 0, while boot.ts's `backglassView` survives in its
	// closure. The hold check used to be `tick < holdUntilTick` alone, so a
	// reset landing inside an end-of-ball hold froze the DMD on the previous
	// game's screen for the whole of the OLD tick count.
	it('code review: a hold armed on a PREVIOUS timeline does not survive a reset -- a tick below the hold window releases instead of freezing the panel', () => {
		const staleFromLongGame: BackglassView = {
			screen: 'ball_ended',
			holdUntilTick: 500_000,
			attractCycleOriginTick: 0,
			heldBallEnded: { player: 0, score: 1111 },
		};
		const game: GameState = {
			...BASE_GAME_STATE,
			phase: 'game',
			currentPlayer: 0,
			players: [buildPlayer({ score: 0, ballNumber: 1 })],
		};
		// hostLoop.reset() -> createLoop() -> tick restarts near 0.
		const afterReset = advanceBackglass(staleFromLongGame, frameOutput({ snapshot: buildSnapshot({ tick: 0, game }), events: [] }));
		expect(afterReset.screen, 'a tick from before the hold was armed must not be treated as "still holding"').toBe('score');
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

		// Story 2.7: MODE_DISPLAY_NAMES renders 'skill_shot' as 'ARM YOURSELF',
		// not the mechanical 'SKILL SHOT' this test pinned before that mapping
		// existed (frame.ts's own modeDisplayName()).
		expect(texts).toContain('ARM YOURSELF');
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
		expect(frame.rows.map((r) => r.text)).toEqual(['0', 'BALL 1', 'ARM YOURSELF', '1.0']);
	});
});

describe('DW-200 -- a mode with no authored MODE_DISPLAY_NAMES entry contributes NO rows to the frame, rendered rows and rasterised dots alike', () => {
	function gameWithOnlyBase(): GameState {
		return {
			...BASE_GAME_STATE,
			phase: 'game',
			players: [buildPlayer({ score: 0, ballNumber: 1 })],
			currentPlayer: 0,
			modes: [{ mode: 'base', priority: 100, player: 0 }],
		};
	}

	it('once only the base mode remains active, the mode block is simply absent: no BASE row, and no lit dot at all in the row slot it would have occupied', () => {
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game: gameWithOnlyBase() }));

		// The rendered ROWS: exactly the score and BALL rows -- not a third
		// row with empty text occupying the mode's slot, no row at all.
		expect(frame.rows.map((r) => r.text)).toEqual(['0', 'BALL 1']);
		expect(frame.rows.some((r) => r.text.includes('BASE'))).toBe(false);

		// Rule 19 condition this ledger entry (DW-200) imposes explicitly: a
		// helper returning empty text is not enough to trust -- the
		// RASTERISED dot buffer must actually be dark where the mode's own
		// name row would have landed. For a single player the name row would
		// sit at dot row 16 (player row 0, BALL row 8, mode name row 16 --
		// LEFT_MARGIN_COL/LINE_PITCH_ROWS math, this file's own AC 5 block)
		// and span GLYPH_H (7) rows beneath it.
		const raster = rasterise(frame, FONT_5X7);
		const MODE_NAME_ROW = 16;
		const GLYPH_H = 7;
		for (let row = MODE_NAME_ROW; row < MODE_NAME_ROW + GLYPH_H; row++) {
			for (let col = 0; col < raster.cols; col++) {
				expect(raster.dots[row * raster.cols + col], `dot at row ${row}, col ${col} must be unlit -- no mode row may render`).toBe(0);
			}
		}
	});

	// Code review, intent-alignment layer, 2026-09-06: `buildModeRows()`'s own
	// doc comment claims an unlabelled mode suppresses "not any of its
	// published fields either" -- the test above only covers `base`, which
	// publishes no `ModeView` fields at all, so that specific claim was
	// otherwise untested (a mode WITH published fields but no authored name
	// does not exist anywhere in this codebase yet, so this is coverage for a
	// structural guarantee -- `buildModeRows()` returns before it ever reads
	// `mode.timerTicks` -- rather than a live product defect today).
	it('an unmapped mode id that ALSO publishes a ModeView field (timerTicks) still contributes NO rows and no lit dots -- the field is suppressed too, not just the name', () => {
		const game: GameState = {
			...BASE_GAME_STATE,
			phase: 'game',
			players: [buildPlayer({ score: 0, ballNumber: 1 })],
			currentPlayer: 0,
			modes: [{ mode: 'some_unmapped_mode', priority: 100, player: 0, timerTicks: 1000 }],
		};
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game }));

		expect(frame.rows.map((r) => r.text)).toEqual(['0', 'BALL 1']);
		expect(frame.rows.some((r) => r.text.includes('SOME UNMAPPED MODE') || r.text === '1.0')).toBe(false);

		const raster = rasterise(frame, FONT_5X7);
		const MODE_NAME_ROW = 16;
		const GLYPH_H = 7;
		for (let row = MODE_NAME_ROW; row < MODE_NAME_ROW + GLYPH_H; row++) {
			for (let col = 0; col < raster.cols; col++) {
				expect(raster.dots[row * raster.cols + col], `dot at row ${row}, col ${col} must be unlit -- no mode row may render`).toBe(0);
			}
		}
	});
});

describe('a row wider than the panel is clamped by rasterise(), through the real renderFrame() -> rasterise() pipeline', () => {
	it('an implausibly long BALL row never throws and never lights a dot outside the buffer', () => {
		// DW-200 closed off the vector this test used to use: an unmapped
		// mode id mechanically rendering its own snake_case text. A mode row
		// now renders only an authored, short display literal or nothing at
		// all (frame.ts's MODE_DISPLAY_NAMES), so there is no longer a real
		// code path that turns an arbitrary long mode id into an on-panel
		// row. `BALL <n>` (frame.ts's own buildScoreRows(), never clamped
		// there) is a still-live, still-real vector for the exact same
		// underlying claim this test exists to prove: rasterise() never
		// throws and never writes outside its own buffer on an implausibly
		// wide row.
		const game: GameState = {
			...BASE_GAME_STATE,
			phase: 'game',
			players: [buildPlayer({ score: 0, ballNumber: 12345678901234567 })],
			currentPlayer: 0,
			modes: [],
		};
		const frame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game }));
		const longRow = frame.rows.find((r) => r.text.startsWith('BALL '));
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

	const DISPLAY_LITERALS = ['PRESS START', 'PLAYER ', 'BALL ', 'ARM YOURSELF'];

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
		const simFiles = listTsFiles(simDir);
		// Code review: without this guard the whole check is vacuous if the
		// listing ever returns nothing (a moved directory, a changed
		// readdirSync signature) -- the loop body simply never runs and the
		// test passes. Its positive-control sibling above is self-guarding
		// because it asserts on the JOINED contents; this one is not.
		expect(simFiles.length, 'the scan must actually find files under src/sim/** -- an empty listing would make every assertion below vacuous').toBeGreaterThan(20);
		for (const file of simFiles) {
			const contents = stripComments(readFileSync(file, 'utf8'));
			for (const literal of DISPLAY_LITERALS) {
				expect(contents.includes(literal), `${path.relative(simDir, file)} must not contain the display literal "${literal}" outside a comment (AD-9: rules never format text)`).toBe(false);
			}
		}
	});
});
