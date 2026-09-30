// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.5 (AC 6; AD-8, AD-9, FR-34, FR-41): a running Hurry-up on the
// Backglass's score screen (`src/presentation/backglass/frame.ts`). Its
// `ModeView` entry owns the status line (`HURRY-UP`, with `BALL n`
// right-aligned) and the fields line (`timerTicks` in seconds, then the
// decaying `value`). With the entry gone there is no fields line. DW-311 is
// measured here with the real entry shape and Quick multiball lit: the lit
// line fits under one player, is dropped under two while Hurry-up runs, and
// returns the tick it stops. Pure functions, no Babylon.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, DMD_COLS, INITIAL_BACKGLASS_VIEW, renderFrame, type DmdFrame } from '../src/presentation/backglass/frame';
import { GLYPH_ADVANCE } from '../src/presentation/backglass/font';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import type { PlayerState } from '../src/sim/contracts/state';
import type { FrameOutput, GameState } from '../src/sim/table/names';

/** The real Hurry-up entry shape (Story 3.5): `{ mode, priority, player, startTick, value, timerTicks? }`. */
function hurryup(value: number, timerTicks?: number): GameState['modes'][number] {
	return timerTicks === undefined
		? { mode: 'hurryup', priority: 300, player: 0, startTick: 0, value }
		: { mode: 'hurryup', priority: 300, player: 0, startTick: 0, value, timerTicks };
}

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

describe('Story 3.5 -- AC 6: a running Hurry-up owns the status line and the fields line', () => {
	it('the premise: BALL 1 right-aligns at col 91', () => {
		expect(BALL_1_COL).toBe(91);
	});

	it('e = 0: the status line reads HURRY-UP with BALL 1 right-aligned, and the fields line reads "20.0  250000"', () => {
		expect(rows(inGame({ modes: [BASE, hurryup(250000, 20000)] }))).toEqual([
			['0', 2, 0],
			['HURRY-UP', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['20.0  250000', 2, 16],
		]);
	});

	it('e = 1000: the fields line reads "19.0  240000"', () => {
		expect(rows(inGame({ modes: [BASE, hurryup(240000, 19000)] }))).toEqual([
			['0', 2, 0],
			['HURRY-UP', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['19.0  240000', 2, 16],
		]);
	});

	it('on the floor (no timerTicks): the fields line reads "50000" alone', () => {
		expect(rows(inGame({ modes: [BASE, hurryup(50000)] }))).toEqual([
			['0', 2, 0],
			['HURRY-UP', 2, 8],
			['BALL 1', BALL_1_COL, 8],
			['50000', 2, 16],
		]);
	});

	it('control: with the entry gone there is no HURRY-UP and no fields line', () => {
		expect(rows(inGame({ modes: [BASE] }))).toEqual([
			['0', 2, 0],
			['BALL 1', BALL_1_COL, 8],
		]);
	});
});

describe('Story 3.5 -- AC 6: DW-311, measured with the real entry shape and Quick multiball lit', () => {
	const litQuickMb = (overrides: Partial<PlayerState> = {}): PlayerState => buildPlayer({ ballNumber: 1, modesLit: ['quickmb'], ...overrides });
	const litRow = (game: GameState): [string, number, number] | undefined => rows(game).find(([text]) => text.endsWith(' LIT'));

	it('one player: QUICK MB LIT sits at row 24, below the fields line', () => {
		expect(litRow(inGame({ players: [litQuickMb()], modes: [BASE, hurryup(250000, 20000)] }))).toEqual(['QUICK MB LIT', 2, 24]);
	});

	it('two players: scores at rows 0 and 8, status 16, fields 24 -- there is no LIT row, and every row is on the panel', () => {
		const game = inGame({ players: [litQuickMb(), buildPlayer({ ballNumber: 0 })], modes: [BASE, hurryup(250000, 20000)] });
		expect(rows(game)).toEqual([
			['0', 2, 0],
			['0', 2, 8],
			['HURRY-UP', 2, 16],
			['BALL 1', BALL_1_COL, 16],
			['20.0  250000', 2, 24],
		]);
		expect(litRow(game)).toBeUndefined();
	});

	it('three and four players: the 2x2 grid takes rows 0 and 8, status 16, fields 24 -- there is no LIT row, and every row is on the panel', () => {
		for (const count of [3, 4]) {
			const others = Array.from({ length: count - 1 }, () => buildPlayer({ ballNumber: 0 }));
			const game = inGame({ players: [litQuickMb(), ...others], modes: [BASE, hurryup(250000, 20000)] });
			const all = rows(game);
			expect(all.filter(([text]) => text === '0').map(([, , row]) => row).sort((a, b) => a - b), `${count} players: the grid`).toEqual(count === 3 ? [0, 0, 8] : [0, 0, 8, 8]);
			expect(all.filter(([text]) => text !== '0'), `${count} players`).toEqual([
				['HURRY-UP', 2, 16],
				['BALL 1', BALL_1_COL, 16],
				['20.0  250000', 2, 24],
			]);
			expect(litRow(game), `${count} players`).toBeUndefined();
		}
	});

	it('two players after Hurry-up stops: the LIT row is back at row 24', () => {
		const game = inGame({ players: [litQuickMb(), buildPlayer({ ballNumber: 0 })], modes: [BASE] });
		expect(litRow(game)).toEqual(['QUICK MB LIT', 2, 24]);
	});
});
