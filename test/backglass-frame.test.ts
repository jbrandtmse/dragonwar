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
	BALL_ENDED_HOLD_TICKS,
	INITIAL_BACKGLASS_VIEW,
	TILT_WARNING_HOLD_TICKS,
	type BackglassView,
} from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_H } from '../src/presentation/backglass/font';
import { MAX_OWED_TICKS } from '../src/sim/contracts/time';
import { close, open, runRulesScript } from './util/switch-script';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import { TABLE } from '../src/sim/table/dragonwar';
import { BONUS_CATEGORIES } from '../src/sim/rules/bonus';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import type { FrameOutput, GameState } from '../src/sim/table/names';

/**
 * Story 2.9: this file's own AC 3 scripts drain only 10 ticks after their
 * own plunge -- comfortably inside the production ball-save window, which
 * this story's own drain interception would otherwise turn into a SAVE
 * (re-serving the same ball, never rotating, never emitting ball_ended)
 * rather than the real drain/rotation this describe block's whole point is
 * to exercise. An override tuning with the window and grace both shrunk to
 * near-zero keeps every scripted tick number, and every assertion, EXACTLY
 * as Story 2.6 authored them -- only the ball-save timing (incidental to
 * what this file actually covers) changes.
 */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

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
		const result = runRulesScript(script.build(), { durationTicks: 20, tuning: NO_BALL_SAVE_TUNING });

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
		const result = runRulesScript(script.build(), { durationTicks: 20, tuning: NO_BALL_SAVE_TUNING });
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
			heldBallEnded: { player: 0, score: 1111, bonusRunning: null },
			pendingTiltWarning: false,
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

describe('Story 2.11 -- AC 9: the Backglass shows WARNING from the event and TILT from the state', () => {
	const gameInPlay: GameState = {
		...BASE_GAME_STATE,
		phase: 'game',
		currentPlayer: 0,
		players: [buildPlayer({ score: 0, ballNumber: 1 })],
	};

	/** The band's own dot content, row-major, full column width -- an exact slice of `raster.dots`, so two calls' results can be compared for a "demonstrably different dot set" (Rule 19; both TILT and WARNING share row 0 with the score screen's own player-0 row, so an EMPTY control band is not always available -- a different PATTERN in the same band is the discriminating check task 11 names as the alternative). */
	function dotsInBand(raster: { cols: number; rows: number; dots: Uint8Array }, rowStart: number, rowEnd: number): number[] {
		const slice: number[] = [];
		for (let r = rowStart; r < rowEnd; r++) {
			for (let c = 0; c < raster.cols; c++) {
				slice.push(raster.dots[r * raster.cols + c]!);
			}
		}
		return slice;
	}

	// Code review finding (Verification Gap Reviewer): the title used to
	// claim "the SAME band is dark on the arming input with no event" -- this
	// test never renders an event-stripped frame at all; it compares against
	// the SCORE screen's differing row-0 content (task 11's documented
	// alternative to an empty control band, since WARNING/TILT share row 0
	// with the score screen's own player-0 row). The event-stripped control
	// this title used to describe is the SEPARATE 'control (Rule 19)' test
	// immediately below, which checks `.screen`, not rasterised dots.
	it('a tilt_warning event arms the tilt_warning screen; the WARNING row lights dots in its OWN declared band, genuinely different from the score screen\'s own row-0 content', () => {
		const output = frameOutput({
			snapshot: buildSnapshot({ tick: 10, game: gameInPlay }),
			events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 10 }],
		});
		const view = advanceBackglass(INITIAL_BACKGLASS_VIEW, output);
		expect(view.screen).toBe('tilt_warning');
		expect(view.holdUntilTick, 'arming must set a hold deadline').toBe(10 + TILT_WARNING_HOLD_TICKS);

		const frame = renderFrame(view, output.snapshot);
		const warningRow = frame.rows.find((r) => r.text === 'WARNING');
		expect(warningRow, 'sanity: the frame must carry a WARNING row at all').toBeDefined();
		const raster = rasterise(frame, FONT_5X7);
		const litRows = litDotRows(raster);
		const inBand = (r: number): boolean => r >= warningRow!.row && r < warningRow!.row + GLYPH_H;
		expect(litRows.filter(inBand), 'the WARNING row must light dots in ITS OWN dot band once rasterised').not.toEqual([]);

		// The control frame: the score screen's own player-0 row occupies the
		// SAME row-0 band (so it is not dark), but it renders "0", a
		// demonstrably different dot pattern from "WARNING" (task 11's own
		// alternative to an empty band).
		const scoreFrame = renderFrame({ ...INITIAL_BACKGLASS_VIEW, screen: 'score' }, buildSnapshot({ game: gameInPlay }));
		const scoreRaster = rasterise(scoreFrame, FONT_5X7);
		expect(
			dotsInBand(scoreRaster, warningRow!.row, warningRow!.row + GLYPH_H),
			'the WARNING band\'s dot pattern must genuinely differ from the score screen\'s own row-0 content',
		).not.toEqual(dotsInBand(raster, warningRow!.row, warningRow!.row + GLYPH_H));
	});

	it('holds across a later event-free frame within the window, and releases back to live play at the deadline', () => {
		const armed = advanceBackglass(
			INITIAL_BACKGLASS_VIEW,
			frameOutput({ snapshot: buildSnapshot({ tick: 10, game: gameInPlay }), events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 10 }] }),
		);
		const held = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 11, game: gameInPlay }), events: [] }));
		expect(held.screen, 'the frame after arming must STILL show the warning screen').toBe('tilt_warning');

		const released = advanceBackglass(
			held,
			frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }),
		);
		expect(released.screen, 'at holdUntilTick the hold must expire').toBe('score');
	});

	it('control (Rule 19): re-folding the SAME frame with events stripped never shows tilt_warning -- proving the screen reads the event, not player state', () => {
		const output = frameOutput({
			snapshot: buildSnapshot({ tick: 10, game: gameInPlay }),
			events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 10 }],
		});
		const real = advanceBackglass(INITIAL_BACKGLASS_VIEW, output);
		expect(real.screen, 'sanity: the real fold must arm the warning screen').toBe('tilt_warning');

		const stripped = advanceBackglass(INITIAL_BACKGLASS_VIEW, { ...output, events: [] });
		expect(stripped.screen, 'with events emptied, the warning screen must never be selected').not.toBe('tilt_warning');
	});

	it('code review: a warning hold armed on a PREVIOUS timeline does not survive a reset', () => {
		const staleFromLongGame: BackglassView = {
			screen: 'tilt_warning',
			holdUntilTick: 500_000,
			attractCycleOriginTick: 0,
			heldBallEnded: null,
			pendingTiltWarning: false,
		};
		const afterReset = advanceBackglass(staleFromLongGame, frameOutput({ snapshot: buildSnapshot({ tick: 0, game: gameInPlay }), events: [] }));
		expect(afterReset.screen, 'a tick from before the hold was armed must not be treated as "still holding"').toBe('score');
	});

	it('machine.tilt.tilted in phase "game" shows the TILT screen; the TILT row lights dots in its OWN band; the same fold with tilted:false shows a DIFFERENT dot set with no TILT row', () => {
		const tiltedGame: GameState = {
			...gameInPlay,
			machine: { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } },
		};
		const view = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 20, game: tiltedGame }), events: [] }));
		expect(view.screen).toBe('tilt');

		const tiltFrame = renderFrame(view, buildSnapshot({ game: tiltedGame }));
		const tiltRow = tiltFrame.rows.find((r) => r.text === 'TILT');
		expect(tiltRow, 'sanity: the frame must carry a TILT row at all').toBeDefined();
		const tiltRaster = rasterise(tiltFrame, FONT_5X7);
		const tiltLitRows = litDotRows(tiltRaster);
		const inBand = (r: number): boolean => r >= tiltRow!.row && r < tiltRow!.row + GLYPH_H;
		expect(tiltLitRows.filter(inBand), 'the TILT row must light dots in ITS OWN dot band once rasterised').not.toEqual([]);

		// The untilted control: the IDENTICAL machine.tilt.tilted: false state
		// shows the score screen instead -- its own player-0 row occupies the
		// SAME row-0 band, but "0" is a demonstrably different dot pattern from
		// "TILT" (task 11's own alternative to an empty band).
		const untiltedView = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 20, game: gameInPlay }), events: [] }));
		expect(untiltedView.screen).toBe('score');
		const scoreFrame = renderFrame(untiltedView, buildSnapshot({ game: gameInPlay }));
		expect(scoreFrame.rows.some((r) => r.text === 'TILT'), 'the untilted control must carry no TILT row').toBe(false);
		const scoreRaster = rasterise(scoreFrame, FONT_5X7);
		expect(
			dotsInBand(scoreRaster, tiltRow!.row, tiltRow!.row + GLYPH_H),
			'the TILT band\'s dot pattern must genuinely differ from the untilted score screen\'s own row-0 content',
		).not.toEqual(dotsInBand(tiltRaster, tiltRow!.row, tiltRow!.row + GLYPH_H));
	});

	it('a tilt condition supersedes a live tilt_warning hold', () => {
		const warned = advanceBackglass(
			INITIAL_BACKGLASS_VIEW,
			frameOutput({ snapshot: buildSnapshot({ tick: 10, game: gameInPlay }), events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 10 }] }),
		);
		expect(warned.screen).toBe('tilt_warning');

		const tiltedGame: GameState = {
			...gameInPlay,
			machine: { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } },
		};
		const afterTilt = advanceBackglass(warned, frameOutput({ snapshot: buildSnapshot({ tick: 11, game: tiltedGame }), events: [] }));
		expect(afterTilt.screen, 'the TILT condition must win over a still-live WARNING hold').toBe('tilt');
	});

	it('an ended ball still wins the panel over a same-tick TILT condition', () => {
		const tiltedGame: GameState = {
			...gameInPlay,
			machine: { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } },
		};
		const output = frameOutput({
			snapshot: buildSnapshot({ tick: 30, game: tiltedGame }),
			events: [
				{
					type: 'ball_ended',
					player: 0,
					bonusByCategory: { letters: 0, loops: 0, strikes: 0 },
					multiplier: 1,
					total: 0,
					tilted: true,
					tick: 30,
				},
			],
		});
		const view = advanceBackglass(INITIAL_BACKGLASS_VIEW, output);
		expect(view.screen, 'a ball_ended event this frame must still win, even though the same snapshot is already tilted').toBe('ball_ended');
	});

	// Code review finding (Blind Hunter / Edge Case Hunter, converged
	// independently): `sim/rules/tilt.ts` processes a same-tick
	// slam_tilt_closed before any tilt_bob_closed, so the rules layer cannot
	// produce a `tilt_warning` on the very tick a slam ends the game. That
	// orders ONE tick only (corrected at Story 2.11's code review): a
	// `FrameOutput` carries every owed tick's events, so one frame CAN carry
	// a tick-k `tilt_warning` beside a snapshot already in 'attract' from a
	// slam at tick k+j. The two tests below pin the presentation gates that
	// handle exactly that -- both the arming branch and the hold-continuation
	// branch are gated on `game.phase === 'game'`, mirroring the TILT
	// branch's own gate above. They are load-bearing, not defence in depth.
	it('a tilt_warning event arriving on a frame whose snapshot phase is already "attract" never arms the WARNING screen', () => {
		const attractGame: GameState = { ...gameInPlay, phase: 'attract' };
		const output = frameOutput({
			snapshot: buildSnapshot({ tick: 50, game: attractGame }),
			events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 50 }],
		});
		const view = advanceBackglass(INITIAL_BACKGLASS_VIEW, output);
		expect(view.screen, 'phase is already attract this frame -- the WARNING screen must never arm').not.toBe('tilt_warning');
	});

	it('a live tilt_warning hold is abandoned the moment phase leaves "game" -- a slam tilt landing mid-hold does not keep showing WARNING', () => {
		const warned = advanceBackglass(
			INITIAL_BACKGLASS_VIEW,
			frameOutput({ snapshot: buildSnapshot({ tick: 10, game: gameInPlay }), events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 10 }] }),
		);
		expect(warned.screen).toBe('tilt_warning');
		expect(warned.holdUntilTick, 'sanity: the hold has not yet expired at the very next tick').toBeGreaterThan(11);

		const attractGame: GameState = { ...gameInPlay, phase: 'attract', players: [] };
		const afterSlam = advanceBackglass(warned, frameOutput({ snapshot: buildSnapshot({ tick: 11, game: attractGame }), events: [] }));
		expect(
			afterSlam.screen,
			'the hold must be abandoned the instant phase is no longer "game" -- a slam tilt mid-hold must not keep the WARNING screen alive',
		).not.toBe('tilt_warning');
	});

	// Code review (Story 2.11, Rule 19): the TILT branch's `phase === 'game'`
	// gate was unpinned -- removing it left the suite green. A tilted LAST
	// ball ends the game with `machine.tilt.tilted` still true (only the next
	// startBall() clears it), so without the gate the panel would show TILT
	// for the whole of game over instead of the final scores.
	it('a tilted snapshot in phase "game_over" does NOT show the TILT screen -- against the same snapshot in phase "game", which does', () => {
		const tiltedMachine = { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } };
		const inGame = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 40, game: { ...gameInPlay, machine: tiltedMachine } }), events: [] }));
		expect(inGame.screen, 'control: the same tilted machine in phase "game" shows TILT').toBe('tilt');

		const gameOverSnapshot = buildSnapshot({ tick: 40, game: { ...gameInPlay, phase: 'game_over', machine: tiltedMachine } });
		const afterGameOver = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: gameOverSnapshot, events: [] }));
		expect(afterGameOver.screen, 'game over after a tilted last ball must not show TILT').not.toBe('tilt');
		expect(renderFrame(afterGameOver, gameOverSnapshot).rows.some((r) => r.text === 'TILT'), 'no TILT row anywhere on the game-over panel').toBe(false);
	});

	// Code review (Story 2.11, Rule 19): "an ended ball still wins the panel
	// over TILT" was pinned on the ARMING frame only -- moving the TILT branch
	// between the ball_ended arming and its hold left the suite green. A
	// player whose warnings are spent can tilt the NEXT ball on its first
	// eligible closure, inside the previous ball's 3-second hold.
	it('a live ball_ended hold keeps the panel through a LATER tilted frame, and TILT shows once the hold expires', () => {
		const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
		const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
		expect(armed.screen, 'sanity: the ball_ended hold is armed').toBe('ball_ended');

		const tiltedGame: GameState = { ...gameInPlay, machine: { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } } };
		const inHold = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 31, game: tiltedGame }), events: [] }));
		expect(inHold.screen, 'the previous ball\'s end screen must still hold over a later tilted frame').toBe('ball_ended');

		const afterHold = advanceBackglass(inHold, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: tiltedGame }), events: [] }));
		expect(afterHold.screen, 'control: once the hold expires the TILT condition shows').toBe('tilt');
	});

	// Code review (Story 2.11): a Slam tilt within BALL_ENDED_HOLD_TICKS of
	// the previous drain used to leave that ball's end-of-ball/BONUS screen
	// up in Attract for the rest of the hold -- the shape the tilt_warning
	// hold's own phase gate already closes.
	it('a live ball_ended hold is abandoned the moment phase becomes "attract" (a slam mid-hold) -- against the same hold in phase "game", which keeps it', () => {
		const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
		const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
		expect(armed.screen, 'sanity: the ball_ended hold is armed').toBe('ball_ended');

		const stillHeld = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 31, game: gameInPlay }), events: [] }));
		expect(stillHeld.screen, 'control: in phase "game" the hold is still live at the next tick').toBe('ball_ended');

		const attractGame: GameState = { ...gameInPlay, phase: 'attract' };
		const afterSlam = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 31, game: attractGame }), events: [] }));
		expect(afterSlam.screen, 'a slam mid-hold must drop the end-of-ball screen for Attract').not.toBe('ball_ended');
	});

	// Code review (cycle 2, edge-case-hunter): one FrameOutput carries every
	// owed tick's events, so a `ball_ended` and a LATER `slam_tilt` can share
	// a frame whose snapshot is already 'attract'. The arming branch used to
	// arm anyway and flash the voided game's end-of-ball screen over Attract.
	it('a ball_ended sharing a FrameOutput with a LATER slam (snapshot already attract) does not arm the end-of-ball screen over Attract', () => {
		const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 32 };
		const attractGame: GameState = { ...gameInPlay, phase: 'attract', modes: [] };
		const afterSlamFrame = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 46, game: attractGame }), events: [endedEvent, { type: 'slam_tilt', tick: 45 }] }));
		expect(afterSlamFrame.screen, 'the frame\'s snapshot is already Attract -- no end-of-ball screen (mutation: dropping `game.phase !== \'attract\'` from the arming branch arms ball_ended here)').not.toBe('ball_ended');
		// Positive control: the same event with the game still live arms the hold.
		const live = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 46, game: gameInPlay }), events: [endedEvent] }));
		expect(live.screen, 'positive control: in a live game the same event arms the end-of-ball hold').toBe('ball_ended');
	});

	// Smoke rework (DW-247, reopened `by=smoke`, 2026-09-11): browser smoke
	// found that a tilt_warning landing while a ball_ended hold is live was
	// swallowed for good -- both the arming branch and the hold-continuation
	// branch returned above the warning-arming check with no memory of the
	// event. The player never saw WARNING, and the next eligible closure
	// could TILT them with no visible warning at all. Fixed by carrying the
	// event forward as `BackglassView.pendingTiltWarning` (presentation
	// state, never GameState -- no golden moves) and consuming it the
	// instant the hold ends.
	describe('smoke rework (DW-247) -- a tilt_warning arriving during a ball_ended hold is carried, never swallowed', () => {
		// Code review (Blind Hunter, corroborated by Verification Gap): unlike
		// `screen`/`holdUntilTick` -- protected by the pre-existing "armed on a
		// PREVIOUS timeline" tests just above, in this exact shape -- nothing
		// pinned `pendingTiltWarning` against the identical reset-shaped hazard.
		// `host/loop.ts`'s `reset()` restarts `tick` near 0 while the
		// closure-held `BackglassView` survives; a stale carried flag paired
		// with a stale, far-future `holdUntilTick` must not resurface as
		// WARNING the moment `tick` is small again.
		it('a pendingTiltWarning carried from a PREVIOUS timeline does not resurface on a new timeline\'s frame below its stale deadline', () => {
			const staleFromLongGame: BackglassView = {
				screen: 'ball_ended',
				holdUntilTick: 500_000,
				attractCycleOriginTick: 0,
				heldBallEnded: { player: 0, score: 1234, bonusRunning: null },
				pendingTiltWarning: true,
			};
			const afterReset = advanceBackglass(staleFromLongGame, frameOutput({ snapshot: buildSnapshot({ tick: 0, game: gameInPlay }), events: [] }));
			expect(afterReset.screen, 'a stale carried warning paired with a stale, far-future holdUntilTick must not resurface just because tick is small again (mutation: dropping the `tick >= view.holdUntilTick` bound on the carried flag shows tilt_warning here instead of score)').toBe('score');

			// Positive control (vacuity #51, code review cycle 2): the SAME view
			// does surface its carried warning at a tick that genuinely reaches
			// its recorded end -- so the `score` above is the bound at work, not a
			// flag nothing reads.
			const atRecordedEnd = advanceBackglass(staleFromLongGame, frameOutput({ snapshot: buildSnapshot({ tick: 500_000, game: gameInPlay }), events: [] }));
			expect(atRecordedEnd.screen, 'positive control: the same carried flag at its own recorded hold end shows WARNING').toBe('tilt_warning');
		});

		it('a tilt_warning arriving DURING a live ball_ended hold is carried and shown once the hold ends, for its own full window; the same fold without the event never shows WARNING', () => {
			const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
			expect(armed.screen, 'sanity: the ball_ended hold is armed').toBe('ball_ended');

			const withWarning = advanceBackglass(armed, frameOutput({
				snapshot: buildSnapshot({ tick: 31, game: gameInPlay }),
				events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 31 }],
			}));
			expect(withWarning.screen, 'the ball_ended hold must still win the panel -- the warning must not surface early').toBe('ball_ended');

			const beforeHoldEnd = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick! - 1, game: gameInPlay }), events: [] }));
			expect(beforeHoldEnd.screen, 'still one tick before the hold ends').toBe('ball_ended');

			const atHoldEnd = advanceBackglass(beforeHoldEnd, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(atHoldEnd.screen, 'the carried warning must surface the instant the ball_ended hold ends').toBe('tilt_warning');
			expect(
				atHoldEnd.holdUntilTick,
				'the warning\'s own hold is measured from the moment it is shown, not from when the event originally arrived',
			).toBe(armed.holdUntilTick! + TILT_WARNING_HOLD_TICKS);

			const stillWarned = advanceBackglass(atHoldEnd, frameOutput({ snapshot: buildSnapshot({ tick: atHoldEnd.holdUntilTick! - 1, game: gameInPlay }), events: [] }));
			expect(stillWarned.screen, 'the surfaced warning must hold for its own full window').toBe('tilt_warning');

			const released = advanceBackglass(stillWarned, frameOutput({ snapshot: buildSnapshot({ tick: atHoldEnd.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(released.screen, 'once the warning\'s own hold ends, live play resumes').toBe('score');

			// Control (Rule 19): the IDENTICAL fold, minus the tilt_warning event,
			// never shows WARNING anywhere, including at the moment the hold ends.
			const controlArmed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
			const controlDuringHold = advanceBackglass(controlArmed, frameOutput({ snapshot: buildSnapshot({ tick: 31, game: gameInPlay }), events: [] }));
			const controlAtHoldEnd = advanceBackglass(controlDuringHold, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(controlAtHoldEnd.screen, 'control: with no tilt_warning event anywhere in the fold, the hold\'s end must show score, never WARNING').toBe('score');
		});

		it('a tilt_warning landing on the SAME frame as the ball_ended ARMING (one FrameOutput carries every owed tick\'s events) is carried and shown once the hold ends', () => {
			const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
			const warningEvent = { type: 'tilt_warning' as const, player: 0, remaining: 0, tick: 30 };
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent, warningEvent] }));
			expect(armed.screen, 'the ball_ended arming still wins the panel even though the SAME frame also carries a tilt_warning').toBe('ball_ended');

			const atHoldEnd = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(atHoldEnd.screen, 'the warning carried from the arming frame itself must surface once the hold ends').toBe('tilt_warning');

			// Control: the identical arming frame with the tilt_warning stripped never shows WARNING afterward.
			const controlArmed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
			const controlAtHoldEnd = advanceBackglass(controlArmed, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(controlAtHoldEnd.screen, 'control: without the warning event on the arming frame, the hold\'s end must show score').toBe('score');
		});

		it('a pending warning is superseded by TILT if the machine is genuinely tilted by the time the hold ends', () => {
			const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
			const withWarning = advanceBackglass(armed, frameOutput({
				snapshot: buildSnapshot({ tick: 31, game: gameInPlay }),
				events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 31 }],
			}));
			expect(withWarning.screen).toBe('ball_ended');
			// Positive control (vacuity #51, code review cycle 2): the IDENTICAL
			// carry released into an untilted game shows WARNING -- so a warning
			// genuinely is pending here, and TILT below has something to supersede.
			const carriedControl = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(carriedControl.screen, 'positive control: the same carry released untilted shows WARNING').toBe('tilt_warning');

			const tiltedGame: GameState = { ...gameInPlay, machine: { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } } };
			const atHoldEnd = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: tiltedGame }), events: [] }));
			expect(atHoldEnd.screen, 'a genuine Tilt by the hold\'s end must show TILT, not the pending WARNING (mutation: moving the warning-arming branch above the TILT branch shows WARNING here instead)').toBe('tilt');

			// Code review (Blind Hunter): the assertion above only proves TILT wins
			// on THIS frame -- it says nothing about whether the TILT branch
			// actually clears the carry rather than merely outranking it for one
			// frame. Fold one more frame, back in a live untilted game with no new
			// tilt_warning event: if the carry leaked past the TILT branch, this
			// frame would wrongly show 'tilt_warning' instead of 'score'.
			// (Verified defense-in-depth, not a single point of failure: this
			// project's actual reset-safety guard on `pendingTiltWarning` --
			// consumption requires `view.holdUntilTick !== null && tick >=
			// view.holdUntilTick`, and TILT always returns `holdUntilTick: null`
			// -- independently blocks a leaked flag here too, so mutating ONLY the
			// TILT branch's `pendingTiltWarning: false` to `pendingTiltWarning:
			// view.pendingTiltWarning` does not redden this assertion by itself.
			// mutation: replacing the TILT branch's explicit return literal with
			// `{ ...view, screen: 'tilt' }` -- a realistic "simplify to a spread"
			// refactor that leaks BOTH `pendingTiltWarning` and the stale
			// `holdUntilTick` together -- reddens this assertion; reverted and
			// confirmed green again.)
			// (Code review, cycle 2: the other way out of TILT -- the tilted ball's
			// own ball_ended re-arming a hold -- is closed in the arming branch
			// itself and pinned by the re-arm test below. The probe tick is fixed
			// rather than read back from the output under test.)
			const afterTilt = advanceBackglass(atHoldEnd, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick! + 1, game: gameInPlay }), events: [] }));
			expect(afterTilt.screen, 'the TILT branch must actually clear the carried warning, not merely outrank it for one frame').toBe('score');
		});

		it('a pending warning is dropped, not shown later, when a Slam ends the game mid-hold (phase -> attract), matching this file\'s existing "a slam mid-hold" precedent', () => {
			const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
			const withWarning = advanceBackglass(armed, frameOutput({
				snapshot: buildSnapshot({ tick: 31, game: gameInPlay }),
				events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 31 }],
			}));
			expect(withWarning.screen).toBe('ball_ended');
			// Positive control (vacuity #51, code review cycle 2): the IDENTICAL
			// carry, had the game stayed live, shows WARNING at the hold's end.
			const carriedControl = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(carriedControl.screen, 'positive control: the same carry in a live game shows WARNING').toBe('tilt_warning');

			// A Slam tilt reaches Attract directly (Story 2.11's own "minimum state
			// change" design, Design Notes) -- this is the SAME shape as the
			// pre-existing "a slam mid-hold must drop the end-of-ball screen for
			// Attract" test above, extended to prove the carried warning does not
			// survive it either.
			const attractGame: GameState = { ...gameInPlay, phase: 'attract', modes: [] };
			const midHold = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: 32, game: attractGame }), events: [] }));
			expect(midHold.screen, 'sanity: a slam mid-hold must drop the end-of-ball screen for Attract, exactly as the pre-existing test above establishes').not.toBe('ball_ended');
			expect(midHold.screen, 'a slam mid-hold must not surface the carried warning either -- the game it belonged to is already gone').not.toBe('tilt_warning');

			// If a later frame somehow returned to phase 'game' with no new
			// tilt_warning event, the dropped carry must not resurface.
			// A tick comfortably PAST the abandoned ball_ended hold's own recorded
			// end (`armed.holdUntilTick`), not merely later than 32 -- otherwise a
			// leaked, stale `holdUntilTick` surviving the Attract branch would
			// still fail this file's own `tick >= holdUntilTick` reset-safety
			// bound by coincidence, the same way it would after a genuine reset,
			// and the assertion below would pass for the wrong reason.
			const laterInGame = advanceBackglass(midHold, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick! + 1, game: gameInPlay }), events: [] }));
			expect(laterInGame.screen, 'the warning dropped by the slam must not resurface on a later game frame (mutation: replacing the Attract branch\'s explicit return literal with a spread that omits `pendingTiltWarning: false` -- leaking both it and the abandoned holdUntilTick together -- reddens this; reverted and confirmed green again)').not.toBe('tilt_warning');
		});

		it('a pending warning is dropped, not shown later, once phase is no longer "game" by the time the hold ends (game over, not a slam)', () => {
			const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick: 30 };
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));
			const withWarning = advanceBackglass(armed, frameOutput({
				snapshot: buildSnapshot({ tick: 31, game: gameInPlay }),
				events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 31 }],
			}));
			expect(withWarning.screen).toBe('ball_ended');
			// Positive control (vacuity #51, code review cycle 2): the IDENTICAL
			// carry, released in phase 'game', shows WARNING at the hold's end.
			const carriedControl = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(carriedControl.screen, 'positive control: the same carry released in phase game shows WARNING').toBe('tilt_warning');

			// 'game_over' keeps the ball_ended hold alive (this file's own
			// established convention, just above) -- unlike 'attract', which ends
			// it immediately. The pending warning must still be dropped once the
			// hold's own end tick is reached with the game no longer live.
			const gameOverGame: GameState = { ...gameInPlay, phase: 'game_over' };
			const stillHeld = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick! - 1, game: gameOverGame }), events: [] }));
			expect(stillHeld.screen, 'sanity: game_over keeps the hold alive, unlike attract').toBe('ball_ended');

			const atHoldEnd = advanceBackglass(stillHeld, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameOverGame }), events: [] }));
			expect(atHoldEnd.screen, 'phase is no longer "game" at the hold\'s end -- the pending warning must be dropped, not shown over game_over (mutation: dropping `game.phase === \'game\' &&` from the warning-arming branch shows WARNING here)').toBe('score');
		});

		// Code review (cycle 2, verification-gap / blind-hunter / acceptance-
		// auditor): nothing folded a `tilt_warning` through the BONUS count-up
		// return path of the hold branch -- every DW-247 fixture was a zero-bonus
		// ball -- so dropping the carry from that return re-opened DW-247 for any
		// warning sharing a frame with a step, with the whole suite green.
		it('a tilt_warning sharing a frame with a BONUS count-up step inside the hold is carried, and the carry survives the later steps and a mismatched-player step', () => {
			const endedEvent = { type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 2, loops: 0, strikes: 0 }, multiplier: 1, total: 2000, tilted: false, tick: 30 };
			const step = (n: number, running: number, tick: number, player = 0) => ({ type: 'bonus_count_step' as const, player, step: n, steps: 2, running, total: 2000, tick });
			const warning = { type: 'tilt_warning' as const, player: 0, remaining: 0, tick: 425 };
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedEvent] }));

			const withWarningAndStep = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 430, game: gameInPlay }), events: [warning, step(1, 1000, 430)] }));
			expect(withWarningAndStep.heldBallEnded?.bonusRunning, 'sanity: the step was folded into the held payload').toBe(1000);
			const laterStep = advanceBackglass(withWarningAndStep, frameOutput({ snapshot: buildSnapshot({ tick: 830, game: gameInPlay }), events: [step(2, 2000, 830)] }));
			expect(laterStep.heldBallEnded?.bonusRunning, 'sanity: the later step was folded too').toBe(2000);
			const atHoldEnd = advanceBackglass(laterStep, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(atHoldEnd.screen, 'a warning that shared a frame with a bonus step, then rode through a later step, must surface at the hold end').toBe('tilt_warning');

			const mismatched = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 430, game: gameInPlay }), events: [warning, step(1, 1000, 430, 1)] }));
			const mismatchedEnd = advanceBackglass(mismatched, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(mismatchedEnd.screen, 'the mismatched-player step path must carry the warning too').toBe('tilt_warning');

			// Control: the identical bonus fold with no warning ends on score.
			const controlStep = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 430, game: gameInPlay }), events: [step(1, 1000, 430)] }));
			const controlEnd = advanceBackglass(controlStep, frameOutput({ snapshot: buildSnapshot({ tick: armed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(controlEnd.screen, 'control: the same bonus fold without a warning ends on score').toBe('score');
		});

		// Code review (cycle 2, all four layers converged): a warning pending in
		// a hold, then a Tilt of the next ball INSIDE that hold (the hold wins
		// the panel, so TILT never shows), then that tilted ball draining inside
		// the hold: its ball_ended re-armed with the stale carry, and because
		// `ball_will_start` had already cleared `machine.tilt`, WARNING showed on
		// the NEXT ball -- after a Tilt, possibly to another player.
		it('a second ball_ended re-arming the hold keeps a pending warning; a TILTED ball end drops it (TILT supersedes) but keeps a warning sharing its frame (the next ball\'s)', () => {
			const endedAt = (tick: number, tilted: boolean) => ({ type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted, tick });
			const armed = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 30, game: gameInPlay }), events: [endedAt(30, false)] }));
			const withWarning = advanceBackglass(armed, frameOutput({ snapshot: buildSnapshot({ tick: 31, game: gameInPlay }), events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 31 }] }));
			const tiltedSnapshotGame: GameState = { ...gameInPlay, machine: { ...gameInPlay.machine, tilt: { tilted: true, slamTilted: false } } };
			const tiltedInHold = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: 700, game: tiltedSnapshotGame }), events: [{ type: 'tilt', player: 0, tick: 700 }] }));
			expect(tiltedInHold.screen, 'sanity: the live hold still wins over TILT (task 10)').toBe('ball_ended');

			// (1) An UNTILTED re-arm keeps the pending warning through the new hold.
			const reArmed = advanceBackglass(withWarning, frameOutput({ snapshot: buildSnapshot({ tick: 1500, game: gameInPlay }), events: [endedAt(1500, false)] }));
			const reArmedEnd = advanceBackglass(reArmed, frameOutput({ snapshot: buildSnapshot({ tick: reArmed.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(reArmedEnd.screen, 'an untilted re-arm must keep the pending warning through the NEW hold').toBe('tilt_warning');

			// (2) The tilted ball drains inside the same hold; by the new hold's end the next ball is untilted.
			const tiltedEnd = advanceBackglass(tiltedInHold, frameOutput({ snapshot: buildSnapshot({ tick: 1500, game: gameInPlay }), events: [endedAt(1500, true)] }));
			const tiltedEndRelease = advanceBackglass(tiltedEnd, frameOutput({ snapshot: buildSnapshot({ tick: tiltedEnd.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(tiltedEndRelease.screen, 'a warning pending from BEFORE a tilt must not be shown after that tilted ball ends -- TILT superseded it').toBe('score');

			// (3) A warning sharing the tilted ball's end frame is the NEXT ball's own, and is kept.
			const tiltedEndWithNextWarning = advanceBackglass(tiltedInHold, frameOutput({ snapshot: buildSnapshot({ tick: 1516, game: gameInPlay }), events: [endedAt(1500, true), { type: 'tilt_warning', player: 0, remaining: 0, tick: 1510 }] }));
			const nextWarningRelease = advanceBackglass(tiltedEndWithNextWarning, frameOutput({ snapshot: buildSnapshot({ tick: tiltedEndWithNextWarning.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(nextWarningRelease.screen, 'the next ball\'s own warning in the tilted end frame must still surface').toBe('tilt_warning');
		});

		// DW-250 (reopened by code review, cycle 2): a WARNING already SHOWING
		// when a drain arrives used to be replaced with no memory of it. The
		// shown window can be a single frame (~16 ms) -- a nudge to save a ball
		// already heading for the drain -- and the outcome hinged on a frame
		// boundary: the same two events inside ONE FrameOutput were carried.
		it('DW-250: a ball_ended interrupting a WARNING that is still SHOWING carries it; a warning that already ran its window, or one from a previous timeline, is not re-shown', () => {
			const endedAt = (tick: number) => ({ type: 'ball_ended' as const, player: 0, bonusByCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1, total: 0, tilted: false, tick });
			const warned = advanceBackglass(INITIAL_BACKGLASS_VIEW, frameOutput({ snapshot: buildSnapshot({ tick: 100, game: gameInPlay }), events: [{ type: 'tilt_warning', player: 0, remaining: 0, tick: 100 }] }));
			expect(warned.screen, 'sanity: WARNING is showing').toBe('tilt_warning');

			// The drain lands in the NEXT frame, 16 ticks later (one 60 Hz frame).
			const interrupted = advanceBackglass(warned, frameOutput({ snapshot: buildSnapshot({ tick: 116, game: gameInPlay }), events: [endedAt(116)] }));
			expect(interrupted.screen, 'the ended ball still wins the panel (task 10)').toBe('ball_ended');
			const atHoldEnd = advanceBackglass(interrupted, frameOutput({ snapshot: buildSnapshot({ tick: interrupted.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(atHoldEnd.screen, 'a WARNING cut short by a drain one frame later must be re-shown once the hold ends').toBe('tilt_warning');
			expect(atHoldEnd.holdUntilTick, 'for its full window, measured from the hold\'s end').toBe(interrupted.holdUntilTick! + TILT_WARNING_HOLD_TICKS);

			// Control: a warning that already ran its whole window is over.
			const expired = advanceBackglass(warned, frameOutput({ snapshot: buildSnapshot({ tick: warned.holdUntilTick!, game: gameInPlay }), events: [endedAt(warned.holdUntilTick!)] }));
			const expiredEnd = advanceBackglass(expired, frameOutput({ snapshot: buildSnapshot({ tick: expired.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(expiredEnd.screen, 'control: a warning whose own window had ended is not re-shown').toBe('score');

			// Reset-safety (this file's half-open discipline): a WARNING view from a
			// PREVIOUS, longer timeline is not "still showing" on a new one.
			const staleWarning: BackglassView = { screen: 'tilt_warning', holdUntilTick: 500_000, attractCycleOriginTick: 0, heldBallEnded: null, pendingTiltWarning: false };
			const afterReset = advanceBackglass(staleWarning, frameOutput({ snapshot: buildSnapshot({ tick: 40, game: gameInPlay }), events: [endedAt(40)] }));
			const afterResetEnd = advanceBackglass(afterReset, frameOutput({ snapshot: buildSnapshot({ tick: afterReset.holdUntilTick!, game: gameInPlay }), events: [] }));
			expect(afterResetEnd.screen, 'a stale WARNING from a previous timeline must not be carried into a new one').toBe('score');
		});

		// Rule 1 (Integration AC): the fix proven against REAL frames from a
		// real `createRules()` run (`runRulesScript`), folded the way
		// `src/host/boot.ts` does -- EVERY tick, batched into FrameOutputs that
		// each carry all their ticks' events beside the LAST tick's snapshot.
		// (Code review, cycle 2: the first version folded three hand-picked
		// single-tick frames and skipped the rest of the hold.) Two batchings of
		// the SAME run: one tick per frame, where the warning lands while the
		// hold is already live (the hold-branch carry), and 16 ticks per frame,
		// one 60 Hz frame at TICK_HZ 1000, where the drain and the warning share
		// the arming frame (the arming-branch carry). A control run without the
		// bob closure never shows WARNING.
		const REAL_RUN_TICKS = 3100;
		type RealFrame = { readonly tick: number; readonly view: BackglassView; readonly events: FrameOutput['events'] };
		function foldRealRun(result: ReturnType<typeof runRulesScript>, ticksPerFrame: number): RealFrame[] {
			const frames: RealFrame[] = [];
			let view = INITIAL_BACKGLASS_VIEW;
			for (let first = 1; first <= REAL_RUN_TICKS; first += ticksPerFrame) {
				const last = Math.min(first + ticksPerFrame - 1, REAL_RUN_TICKS);
				const events = result.events.filter((e) => e.tick >= first && e.tick <= last);
				view = advanceBackglass(view, frameOutput({ snapshot: buildSnapshot({ tick: last, game: result.statesByTick.get(last)! }), events }));
				frames.push({ tick: last, view, events });
			}
			return frames;
		}
		const realDrainScript = () => close('s_start').at(5).at(8).open('s_shooter_lane').at(10).close('s_trough_1').at(20);

		for (const ticksPerFrame of [1, 16]) {
			it(`REAL frames (runRulesScript, ${ticksPerFrame} tick(s) per FrameOutput): a ball drains and s_tilt_bob closes within the following hold -- the WARNING row lights dots in its own declared band at the first frame at or after the hold's end, never before`, () => {
				const result = runRulesScript(realDrainScript().close('s_tilt_bob').at(25).build(), { durationTicks: REAL_RUN_TICKS, tuning: NO_BALL_SAVE_TUNING });
				expect(result.events.some((e) => e.type === 'ball_ended' && e.tick === 20), 'sanity: the script genuinely drains at tick 20').toBe(true);
				expect(result.events.some((e) => e.type === 'tilt_warning' && e.tick === 25), 'sanity: the bob closure genuinely produces a tilt_warning at tick 25, inside the hold -- vacuous otherwise').toBe(true);

				const frames = foldRealRun(result, ticksPerFrame);
				const armingIndex = frames.findIndex((f) => f.events.some((e) => e.type === 'ball_ended'));
				const arming = frames[armingIndex]!;
				expect(
					arming.events.some((e) => e.type === 'tilt_warning'),
					'sanity: at 16 ticks per frame the drain and the warning share the arming frame (the arming-branch carry); at 1 they do not (the hold-branch carry)',
				).toBe(ticksPerFrame === 16);
				const holdEnd = arming.view.holdUntilTick!;
				const duringHold = frames.slice(armingIndex).filter((f) => f.tick < holdEnd);
				expect(duringHold.every((f) => f.view.screen === 'ball_ended'), 'the ended ball keeps the panel for its whole hold -- the warning never leaks out early').toBe(true);
				const release = frames.find((f) => f.tick >= holdEnd)!;
				expect(release.view.screen, 'the first frame at or after the REAL hold\'s end shows the carried warning').toBe('tilt_warning');

				const frame = renderFrame(release.view, buildSnapshot({ tick: release.tick, game: result.statesByTick.get(release.tick)! }));
				const warningRow = frame.rows.find((r) => r.text === 'WARNING');
				expect(warningRow, 'sanity: the frame must carry a WARNING row at all').toBeDefined();
				const litRows = litDotRows(rasterise(frame, FONT_5X7));
				const inBand = (r: number): boolean => r >= warningRow!.row && r < warningRow!.row + GLYPH_H;
				expect(litRows.filter(inBand), 'the WARNING row must light dots in ITS OWN dot band once rasterised, from REAL rules-layer frames').not.toEqual([]);

				// Control: the IDENTICAL run minus the bob closure never shows WARNING in any frame.
				const control = foldRealRun(runRulesScript(realDrainScript().build(), { durationTicks: REAL_RUN_TICKS, tuning: NO_BALL_SAVE_TUNING }), ticksPerFrame);
				expect(control.some((f) => f.view.screen === 'tilt_warning'), 'control: without the bob closure no frame shows WARNING').toBe(false);
			});
		}
	});
});

describe('AC 8 (Story 2.10) -- the end-of-ball BONUS row animates to the real bonus_count_step stream, built from a REAL runRulesScript run', () => {
	const PRODUCTION_TUNING = resolveTuning();
	const LOOP_WINDOW_TICKS = PRODUCTION_TUNING.loopWindowTicks.value;
	const BONUS_COUNT_TICKS = PRODUCTION_TUNING.bonusCountTicks.value;

	/**
	 * Two nonzero categories (letters, loops) credited BEFORE a real drain --
	 * two DRAGON-bank targets (`bank_target_down` x2 -> letters) and one
	 * completed Left Loop (`shot_left_loop_made` -> loops) -- so the ending
	 * player's real bonus is genuinely nonzero and the count-up schedule
	 * genuinely arms three `bonus_count_step`s (two categories + the final
	 * multiplier step), exactly this story's own "Count-up stream" I/O row.
	 *
	 * Code review 2026-09-08 (acceptance auditor, blind-hunter): the script
	 * also completes the Top lane set ONCE, taking the multiplier off rung 1.
	 * Without it the multiplier stayed 1, so the final (multiplier-applied)
	 * step carried the SAME running total as the loops step before it and the
	 * three rendered rows read 10,000 / 20,000 / 20,000 -- the row did NOT
	 * change at each step, which is precisely what AC 8 and this describe
	 * block's own title claim it does. At 2x the three values are genuinely
	 * distinct, so the claim is true and testable rather than merely survived
	 * by a `size > 1` assertion.
	 */
	function realBonusBallEndRun() {
		const loopOutTick = 20 + LOOP_WINDOW_TICKS - 1;
		const drainTick = loopOutTick + 20;
		// Hot seat (two Start presses, ticks 5/8): player 1's ball has not been
		// served when player 0 drains, so rotation lands on player 1, NOT back
		// on player 0 -- unlike a single-player game, where the SAME-tick
		// rotation would immediately reset player 0's own `bonus` to
		// BONUS_EMPTY (AC 6) before this test ever gets to look at it. This is
		// what keeps player 0's credited bonus genuinely observable in the
		// snapshot through the whole count-up window, which the control test
		// below depends on.
		const script = close('s_start').at(5).at(8)
			.open('s_shooter_lane').at(10)
			.close(TABLE.dropBankWiring.d.switch).at(15)
			.close(TABLE.dropBankWiring.r.switch).at(16)
			.close('s_loop_l_in').at(20)
			.close('s_loop_l_out').at(loopOutTick)
			.close('s_top_1').at(loopOutTick + 1)
			.close('s_top_2').at(loopOutTick + 2)
			.close('s_top_3').at(loopOutTick + 3)
			.close('s_trough_1').at(drainTick);
		const durationTicks = drainTick + BONUS_COUNT_TICKS * 3 + 20;
		const result = runRulesScript(script.build(), { durationTicks, tuning: NO_BALL_SAVE_TUNING });

		const found = result.events.find((e) => e.type === 'ball_ended');
		expect(found, 'sanity: the script must genuinely drain and end the ball').toBeDefined();
		const ballEndedEvent = found!;
		if (ballEndedEvent.type !== 'ball_ended') {
			throw new Error('unreachable: filtered on type ball_ended above');
		}
		expect(ballEndedEvent.tick).toBe(drainTick);
		expect(ballEndedEvent.player, 'sanity: player 0 is the one that drained').toBe(0);
		const total = ballEndedEvent.total;
		expect(total, 'sanity: the credited letters + loop must genuinely produce a nonzero bonus, or this whole test is vacuous').toBeGreaterThan(0);
		expect(
			ballEndedEvent.multiplier,
			'sanity: the Top-lane completion must genuinely have moved the multiplier off rung 1, or the final count-up step repeats the previous row and the "changes at each step" claim below is untestable',
		).toBe(2);

		const stepTicks = [1, 2, 3].map((n) => drainTick + BONUS_COUNT_TICKS * n);
		const stepEvents = stepTicks.map((t) => result.events.filter((e) => e.tick === t));
		expect(stepEvents.every((events) => events.some((e) => e.type === 'bonus_count_step')), 'sanity: all three scheduled steps must actually fire').toBe(true);

		return { result, drainTick, stepTicks, total };
	}

	function outputAt(result: ReturnType<typeof runRulesScript>, tick: number, events: FrameOutput['events']): FrameOutput {
		return frameOutput({ snapshot: buildSnapshot({ tick, game: result.statesByTick.get(tick)! }), events });
	}

	it('the BONUS row is absent while armed, changes at each step, and ends at the real total -- with the ROW\'S OWN dot band genuinely lit on the final frame', () => {
		const { result, drainTick, stepTicks, total } = realBonusBallEndRun();

		let view = advanceBackglass(INITIAL_BACKGLASS_VIEW, outputAt(result, drainTick, result.events.filter((e) => e.tick === drainTick)));
		expect(view.screen).toBe('ball_ended');
		const armedFrame = renderFrame(view, buildSnapshot());
		expect(armedFrame.rows.some((r) => r.text.startsWith('BONUS ')), 'no BONUS row before the first step').toBe(false);
		const armedLitRows = litDotRows(rasterise(armedFrame, FONT_5X7));

		const rowTextAtEachStep: string[] = [];
		for (const tick of stepTicks) {
			view = advanceBackglass(view, outputAt(result, tick, result.events.filter((e) => e.tick === tick)));
			const row = renderFrame(view, buildSnapshot()).rows.find((r) => r.text.startsWith('BONUS '));
			expect(row, `a BONUS row must be present at step tick ${tick}`).toBeDefined();
			rowTextAtEachStep.push(row!.text);
		}

		// Code review 2026-09-08: `size > 1` passed on 2 of 3 distinct values
		// while the message claimed all three changed. With the multiplier at 2x
		// (see `realBonusBallEndRun()`) all three genuinely differ, so this is
		// now the exact claim AC 8 makes.
		expect(new Set(rowTextAtEachStep).size, 'the row text must genuinely change at EACH of the three steps, not repeat a value').toBe(3);
		const formattedTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		expect(rowTextAtEachStep[rowTextAtEachStep.length - 1]).toBe(`BONUS ${formattedTotal}`);

		// Code review 2026-09-08 (verification-gap, acceptance auditor; epic
		// vacuity #42 and Story 2.6's own standing precedent): this used to read
		// `raster.dots.some((d) => d === 1)`, a predicate over the WHOLE 128x32
		// buffer -- satisfied by the PLAYER and score rows alone, so it passed
		// with the BONUS row rasterising to nothing. MEASURED at the time: giving
		// the row a `row` of 4 * LINE_PITCH_ROWS (32) or a `col` past DMD_COLS
		// makes `raster.ts` silently drop every one of its glyph pixels, and the
		// old assertion stayed green -- which is exactly the blank-panel failure
		// the neighbouring "a REAL renderFrame() output actually LIGHTS DOTS"
		// block above exists to kill for the score screen. The band is taken from
		// the row's OWN declared coordinate, so this tests the frame -> raster
		// leg (the leg that drops out-of-range glyphs) rather than restating
		// frame.ts's arithmetic back at it.
		const finalFrame = renderFrame(view, buildSnapshot());
		const bonusRowSpec = finalFrame.rows.find((r) => r.text.startsWith('BONUS '));
		expect(bonusRowSpec, 'sanity: the final frame must carry a BONUS row at all').toBeDefined();
		const litRows = litDotRows(rasterise(finalFrame, FONT_5X7));
		const inBonusBand = (r: number): boolean => r >= bonusRowSpec!.row && r < bonusRowSpec!.row + GLYPH_H;
		expect(
			litRows.filter(inBonusBand),
			'the BONUS row must light dots in ITS OWN dot band once rasterised -- a whole-buffer "something is lit" check passes on the PLAYER row alone',
		).not.toEqual([]);
		expect(
			armedLitRows.filter(inBonusBand),
			'and that band must have been DARK on the arming frame, before any step arrived -- otherwise the band assertion above is not observing the BONUS row',
		).toEqual([]);
	});

	it('control (Rule 19): re-folding the SAME real ticks with events stripped never shows a BONUS row, even though the real (unreset) player bonus in the snapshot is genuinely nonzero -- proving the row reads bonus_count_step, not snapshot.game.players[...].bonus', () => {
		const { result, drainTick, stepTicks, total } = realBonusBallEndRun();
		void total;

		// Sanity: the snapshot's own raw bonus data at the final step tick is
		// genuinely nonzero -- a fake fed from the snapshot would have
		// something real to show, so this control is not vacuously trivial.
		const finalGame = result.statesByTick.get(stepTicks[stepTicks.length - 1]!)!;
		const endingPlayerBonus = finalGame.players[0]!.bonus;
		expect(endingPlayerBonus.byCategory.letters + endingPlayerBonus.byCategory.loops, 'sanity: the raw snapshot bonus is genuinely nonzero').toBeGreaterThan(0);

		let view = advanceBackglass(INITIAL_BACKGLASS_VIEW, outputAt(result, drainTick, result.events.filter((e) => e.tick === drainTick)));
		expect(view.screen).toBe('ball_ended');

		for (const tick of stepTicks) {
			view = advanceBackglass(view, outputAt(result, tick, []));
			const hasBonusRow = renderFrame(view, buildSnapshot()).rows.some((r) => r.text.startsWith('BONUS '));
			expect(hasBonusRow, `no BONUS row at tick ${tick} once bonus_count_step is stripped`).toBe(false);
		}
	});

	// Code review 2026-09-08 (verification-gap): `advanceBackglass()`'s step
	// fold matches `stepEvent.player === view.heldBallEnded.player`, and its own
	// comment calls that deliberate ("payload completeness (AD-9) means never
	// trusting 'the only one running' by convention alone"). Every
	// `bonus_count_step` anywhere in the suite carried the SAME player as the
	// held payload, so deleting the comparison entirely left the whole suite
	// green -- a guard the code documents as load-bearing with nothing that
	// falsifies its removal.
	it('control (Rule 19): a bonus_count_step for a DIFFERENT player never writes into this player\'s held payload', () => {
		const { result, drainTick, stepTicks } = realBonusBallEndRun();

		let view = advanceBackglass(INITIAL_BACKGLASS_VIEW, outputAt(result, drainTick, result.events.filter((e) => e.tick === drainTick)));
		expect(view.heldBallEnded?.player, 'sanity: the hold must be player 0\'s, or there is no cross-player case to test').toBe(0);

		const stepTick = stepTicks[0]!;
		// Well-formed and otherwise indistinguishable from the real first step --
		// only `player` differs.
		const foreignStep = frameOutput({
			snapshot: buildSnapshot({ tick: stepTick, game: result.statesByTick.get(stepTick)! }),
			events: [{ type: 'bonus_count_step', player: 1, step: 1, steps: 3, running: 12_345, total: 67_890, tick: stepTick }],
		});
		view = advanceBackglass(view, foreignStep);

		expect(view.heldBallEnded?.bonusRunning, 'another player\'s count-up must never reach this player\'s held payload').toBeNull();
		expect(
			renderFrame(view, buildSnapshot()).rows.some((r) => r.text.startsWith('BONUS ')),
			'and no BONUS row may appear from it',
		).toBe(false);
	});
});

// Code review 2026-09-08 (blind-hunter, edge-case-hunter and the acceptance
// auditor, independently): two constraints the count-up genuinely depends on
// lived only in `bonusCountMs`'s own `source` prose and in a review-triage
// rejection paragraph. `bonusCountMs` ships `unverified` and its own source
// says it is "adjustable until Epic 3's playtest freeze (Story 3.11)", so both
// were one retune away from breaking silently with the whole suite green.
describe('Story 2.10 -- the count-up\'s pacing is coupled to two constants nothing else pinned', () => {
	const PRODUCTION_TUNING = resolveTuning();

	it('bonusCountTicks exceeds the loop\'s own frame cap, so no FrameOutput can batch two bonus_count_steps into one frame', () => {
		// `advanceBackglass()` folds `input.events.find(isBonusCountStepEvent)` --
		// the FIRST step in the frame. A frame spans at most `MAX_OWED_TICKS`
		// (`sim/loop/index.ts`'s cap), so two steps can share a frame only once
		// the spacing falls to that cap, at which point the row would show a
		// stale step and could never reach the total. This inequality is exactly
		// what the review triage rejected that finding on; now it is a gate.
		expect(PRODUCTION_TUNING.bonusCountTicks.value).toBeGreaterThan(MAX_OWED_TICKS);
	});

	it('a whole count-up fits inside the ball_ended hold, so the row always reaches the total before the screen releases', () => {
		// `bonusCountMs`'s own `source` argues "at most 4 steps x 400 ms = 1600
		// ms, comfortably inside the Backglass's existing 3000 ms ball_ended
		// hold". Worst case is one step per category plus the multiplier step.
		const worstCaseSteps = BONUS_CATEGORIES.length + 1;
		expect(PRODUCTION_TUNING.bonusCountTicks.value * worstCaseSteps).toBeLessThan(BALL_ENDED_HOLD_TICKS);
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

	const DISPLAY_LITERALS = ['PRESS START', 'PLAYER ', 'BALL ', 'ARM YOURSELF', 'BONUS ', 'TILT', 'WARNING'];

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
