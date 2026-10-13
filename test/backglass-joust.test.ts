// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 (AC 9; AD-8, AD-9, FR-36, FR-41): a running Joust on the
// Backglass's score screen (`src/presentation/backglass/frame.ts`). Its
// `ModeView` entry owns the status line (`JOUST`, with `BALL n`
// right-aligned) and the fields line: `timerTicks` in seconds, then the
// Charge as `CHARGE X<n>` -- the letter X, because the 5x7 DMD font has no
// multiplication sign. Joust (310) is above Hurry-up (300), so while both run
// Joust owns the panel. With the entry gone there is no fields line. Pure
// functions, no Babylon.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, DMD_COLS, INITIAL_BACKGLASS_VIEW, renderFrame, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import type { FrameOutput, GameState } from '../src/sim/table/names';

/** The real Joust entry shape (Story 3.6): `{ mode, priority, player, startTick, charge, timerTicks?, lastLoop?, fullCharge? }`. */
function joust(charge: number, timerTicks: number, extra: Readonly<Record<string, unknown>> = {}): GameState['modes'][number] {
	return { mode: 'joust', priority: 310, player: 0, startTick: 0, charge, timerTicks, ...extra };
}

/** The real Hurry-up entry shape (Story 3.5). */
const HURRYUP = { mode: 'hurryup', priority: 300, player: 0, startTick: 0, value: 250000, timerTicks: 20000 } as const;
const BASE = { mode: 'base', priority: 100, player: 0 } as const;

function inGame(overrides: Partial<GameState> = {}): GameState {
	return { ...BASE_GAME_STATE, phase: 'game', players: [buildPlayer({ ballNumber: 1 })], currentPlayer: 0, ...overrides };
}

const scoreView = advanceBackglass(INITIAL_BACKGLASS_VIEW, { snapshot: buildSnapshot({ tick: 50, game: inGame() }), events: [], contactEvents: [], commands: [] } satisfies FrameOutput);

function render(game: GameState): DmdFrame {
	return renderFrame(scoreView, buildSnapshot({ game }));
}

/** The rendered rows as `[text, col, row]`. */
function rows(game: GameState): [string, number, number][] {
	return render(game).rows.map((row) => [row.text, row.col, row.row]);
}

/** `BALL 1`'s right-aligned column: the one-dot gutter mirrored on the panel's right edge (hand-derived: 128 - 2 - (6 * 6 - 1) = 91). */
const BALL_1_COL = DMD_COLS - 2 - (GLYPH_ADVANCE * 'BALL 1'.length - 1);

describe('Story 3.6 -- AC 9: a running Joust owns the status line and the fields line', () => {
	it('the premise: the score screen is up, and BALL 1 right-aligns at col 91', () => {
		expect(render(inGame()).screen).toBe('score');
		expect(BALL_1_COL).toBe(91);
	});

	it('at the start: the status line reads JOUST with BALL 1 right-aligned, and the fields line reads "60.0  CHARGE X1"', () => {
		expect(rows(inGame({ modes: [BASE, joust(1, 60000)] }))).toEqual([
			['0', 2, 0],
			['JOUST', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['60.0  CHARGE X1', 2, 16],
		]);
	});

	it('at Charge 3, 11.5 s in: the fields line reads "48.5  CHARGE X3" -- lastLoop is never drawn', () => {
		expect(rows(inGame({ modes: [BASE, joust(3, 48500, { lastLoop: 'shot_left_loop' })] }))).toEqual([
			['0', 2, 0],
			['JOUST', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['48.5  CHARGE X3', 2, 16],
		]);
	});

	it('at the cap: "CHARGE X10", and the fullCharge mark is never drawn', () => {
		expect(rows(inGame({ modes: [BASE, joust(10, 20000, { lastLoop: 'shot_right_loop', fullCharge: true })] }))[3]).toEqual(['20.0  CHARGE X10', 2, 16]);
	});

	it('every character of the fields line has a glyph: the rasterised row lights dots under each one', () => {
		const frame = render(inGame({ modes: [BASE, joust(3, 48500)] }));
		const fields = frame.rows.find((row) => row.text.includes('CHARGE'))!;
		expect(fields, 'the premise: the frame has a Charge row').toBeDefined();
		const raster = rasterise(frame, FONT_5X7);
		const lit = [...fields.text].map((character, index) => {
			let dots = 0;
			for (let r = fields.row; r < fields.row + GLYPH_H; r++) {
				for (let c = fields.col + index * GLYPH_ADVANCE; c < fields.col + index * GLYPH_ADVANCE + GLYPH_W; c++) {
					dots += raster.dots[r * raster.cols + c] ?? 0;
				}
			}
			return character === ' ' ? dots === 0 : dots > 0;
		});
		expect(fields.text).toBe('48.5  CHARGE X3');
		expect(lit.every(Boolean), `each non-space character draws: ${JSON.stringify(lit)}`).toBe(true);
	});

	it('control: with the entry gone there is no JOUST and no fields line', () => {
		expect(rows(inGame({ modes: [BASE] }))).toEqual([
			['0', 2, 0],
			['BALL 1', BALL_1_COL, 8],
		]);
	});
});

describe('Story 3.6 -- AC 9: Joust (310) above a running Hurry-up (300) owns the panel', () => {
	it('with both running: JOUST and its fields line -- no HURRY-UP, and Hurry-up\'s value is not drawn', () => {
		const all = rows(inGame({ modes: [BASE, HURRYUP, joust(2, 55000)] }));
		expect(all).toEqual([
			['0', 2, 0],
			['JOUST', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['55.0  CHARGE X2', 2, 16],
		]);
	});

	it('the order of modes[] does not decide it: Joust listed first still owns the panel', () => {
		expect(rows(inGame({ modes: [joust(2, 55000), HURRYUP, BASE] })).map(([text]) => text)).toEqual(['0', 'JOUST', 'BALL 1', '55.0  CHARGE X2']);
	});

	it('control: with no Joust entry, the running Hurry-up owns the panel -- the same state Joust leaves behind when it stops first', () => {
		expect(rows(inGame({ modes: [BASE, HURRYUP] }))).toEqual([
			['0', 2, 0],
			['HURRY-UP', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['20.0  250000', 2, 16],
		]);
	});
});

describe('Story 3.6 -- AC 9: DW-311 applies to Joust exactly as to Hurry-up', () => {
	const litRow = (game: GameState): [string, number, number] | undefined => rows(game).find(([text]) => text.endsWith(' LIT'));

	it('one player: the lit line sits at row 24, below Joust\'s fields line', () => {
		const game = inGame({ players: [buildPlayer({ ballNumber: 1, modesLit: ['hurryup'] })], modes: [BASE, joust(1, 60000)] });
		expect(litRow(game)).toEqual(['HURRY-UP LIT', 2, 24]);
	});

	it('two players: scores at rows 0 and 8, status 16, fields 24 -- the lit line is dropped, and every row is on the panel', () => {
		const game = inGame({ players: [buildPlayer({ ballNumber: 1, modesLit: ['hurryup'] }), buildPlayer({ ballNumber: 0 })], modes: [BASE, joust(1, 60000)] });
		expect(rows(game)).toEqual([
			['0', 2, 0],
			['0', 2, 8],
			['JOUST', 2, 16],
			['BALL 1', BALL_1_COL, 16],
			['60.0  CHARGE X1', 2, 24],
		]);
		expect(litRow(game)).toBeUndefined();
	});
});
