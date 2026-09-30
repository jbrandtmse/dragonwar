// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 (AC 6; AD-9, AD-18): the Backglass's `mode_select` screen and
// the score screen's lit-Mode line (`src/presentation/backglass/frame.ts`).
// The screen is held from a `lock_lane_mode_start` with two or more
// candidates, follows `mode_select_moved` and drops at `mode_select_ended`
// or on any phase other than `game` -- read from the events alone (AD-9).
// The lit line is continuous display, read off the snapshot's
// `players[current].modesLit`. Pure functions, no Babylon.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { BASE_GAME_STATE, buildPlayer, buildSnapshot } from './util/snapshot-factory';
import type { CampaignModeName } from '../src/sim/contracts/state';
import type { FrameOutput, GameState, SemanticEvent } from '../src/sim/table/names';

function inGame(overrides: Partial<GameState> = {}): GameState {
	return { ...BASE_GAME_STATE, phase: 'game', players: [buildPlayer({ ballNumber: 1 })], currentPlayer: 0, ...overrides };
}

function frame(tick: number, events: readonly SemanticEvent[], game: GameState = inGame()): FrameOutput {
	return { snapshot: buildSnapshot({ tick, game }), events, contactEvents: [], commands: [] };
}

const CANDIDATES: readonly CampaignModeName[] = ['hurryup', 'quickmb'];
const MODE_START: SemanticEvent = { type: 'lock_lane_mode_start', player: 0, candidates: CANDIDATES, selected: 'hurryup', tick: 100 };
const MOVED: SemanticEvent = { type: 'mode_select_moved', player: 0, candidates: CANDIDATES, selected: 'quickmb', tick: 110 };
const ENDED: SemanticEvent = { type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'start', tick: 120 };

/** The rendered rows as `[text, emphasis]`. */
function rows(rendered: DmdFrame): [string, boolean][] {
	return rendered.rows.map((row) => [row.text, row.emphasis]);
}

function render(view: BackglassView, game: GameState = inGame()): DmdFrame {
	return renderFrame(view, buildSnapshot({ game }));
}

describe('Story 3.4 -- AC 6: the mode_select screen', () => {
	const scoreView = advanceBackglass(INITIAL_BACKGLASS_VIEW, frame(50, []));
	const opened = advanceBackglass(scoreView, frame(100, [MODE_START]));
	const moved = advanceBackglass(opened, frame(110, [MOVED]));
	const ended = advanceBackglass(moved, frame(120, [ENDED]));

	it('the premise: an ordinary game frame shows the score screen', () => {
		expect(scoreView.screen).toBe('score');
	});

	it('lock_lane_mode_start with two candidates opens it, listing both by display name with the marker (emphasis) on the selected one', () => {
		expect(opened.screen).toBe('mode_select');
		const rendered = render(opened);
		expect(rendered.screen).toBe('mode_select');
		expect(rows(rendered)).toEqual([
			['SELECT MODE', false],
			['HURRY-UP', true],
			['QUICK MB', false],
		]);
	});

	it('it follows mode_select_moved: the marker moves to QUICK MB', () => {
		expect(moved.screen).toBe('mode_select');
		expect(rows(render(moved))).toEqual([
			['SELECT MODE', false],
			['HURRY-UP', false],
			['QUICK MB', true],
		]);
	});

	it('it drops at mode_select_ended: the next screen is the score screen and no payload is held', () => {
		expect(ended.screen).toBe('score');
		expect(ended.heldModeSelect).toBeNull();
	});

	it('one frame carrying the whole window (open, move, end) ends on the score screen', () => {
		expect(advanceBackglass(scoreView, frame(120, [MODE_START, MOVED, ENDED])).screen).toBe('score');
	});

	it('it is held across frames with no event, and dropped on any phase other than game (a Slam discards the window with no event)', () => {
		const later = advanceBackglass(moved, frame(500, []));
		expect(later.screen).toBe('mode_select');
		expect(rows(render(later))[2]).toEqual(['QUICK MB', true]);
		const slammed = advanceBackglass(moved, frame(510, [], { ...inGame(), phase: 'attract' }));
		expect(slammed.heldModeSelect).toBeNull();
		expect(slammed.screen).not.toBe('mode_select');
	});

	it('control: lock_lane_mode_start with ONE candidate opens no screen (that Mode starts at once)', () => {
		const single: SemanticEvent = { type: 'lock_lane_mode_start', player: 0, candidates: ['joust'], selected: 'joust', tick: 100 };
		const view = advanceBackglass(scoreView, frame(100, [single]));
		expect(view.screen).toBe('score');
		expect(view.heldModeSelect).toBeNull();
	});

	it('three candidates: all three rows, the selected one marked', () => {
		const three: SemanticEvent = { type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb', 'joust'], selected: 'hurryup', tick: 100 };
		const toJoust: SemanticEvent = { type: 'mode_select_moved', player: 0, candidates: ['hurryup', 'quickmb', 'joust'], selected: 'joust', tick: 105 };
		const view = advanceBackglass(advanceBackglass(scoreView, frame(100, [three])), frame(105, [toJoust]));
		expect(rows(render(view))).toEqual([
			['SELECT MODE', false],
			['HURRY-UP', false],
			['QUICK MB', false],
			['JOUST', true],
		]);
	});

	it('a tilt_warning inside the window is not lost: it shows on the first frame after the window ends', () => {
		const warned = advanceBackglass(opened, frame(105, [{ type: 'tilt_warning', player: 0, remaining: 1, tick: 105 }]));
		expect(warned.screen, 'the window keeps the panel').toBe('mode_select');
		const afterEnd = advanceBackglass(warned, frame(120, [ENDED]));
		expect(afterEnd.screen).toBe('tilt_warning');
	});

	it('a WARNING already showing when the window opens is carried too: it shows again on the first frame after the window ends', () => {
		const warning = advanceBackglass(scoreView, frame(95, [{ type: 'tilt_warning', player: 0, remaining: 1, tick: 95 }]));
		expect(warning.screen, 'the premise: WARNING is showing').toBe('tilt_warning');
		const openedOverWarning = advanceBackglass(warning, frame(100, [MODE_START]));
		expect(openedOverWarning.screen, 'the window takes the panel').toBe('mode_select');
		const afterEnd = advanceBackglass(openedOverWarning, frame(120, [ENDED]));
		expect(afterEnd.screen).toBe('tilt_warning');
	});

	it('control: with no WARNING before or during the window, the first frame after it is the score screen', () => {
		expect(advanceBackglass(opened, frame(120, [ENDED])).screen).toBe('score');
	});
});

describe('Story 3.4 -- AC 6: the score screen\'s lit-Mode line', () => {
	const scoreView = advanceBackglass(INITIAL_BACKGLASS_VIEW, frame(50, []));

	it('reads HURRY-UP LIT when the current player\'s modesLit is [hurryup]', () => {
		const game = inGame({ players: [buildPlayer({ ballNumber: 1, modesLit: ['hurryup'] })] });
		const texts = render(scoreView, game).rows.map((row) => row.text);
		expect(texts).toContain('HURRY-UP LIT');
	});

	it('control: no lit line when modesLit is []', () => {
		const texts = render(scoreView, inGame()).rows.map((row) => row.text);
		expect(texts.filter((text) => text.endsWith(' LIT'))).toEqual([]);
	});

	it('names only the FIRST lit Mode, and follows the CURRENT player (Hot seat)', () => {
		const game = inGame({
			players: [buildPlayer({ ballNumber: 1, modesLit: ['hurryup'] }), buildPlayer({ ballNumber: 1, modesLit: ['quickmb', 'joust'] })],
			currentPlayer: 1,
		});
		const texts = render(scoreView, game).rows.map((row) => row.text);
		expect(texts.filter((text) => text.endsWith(' LIT'))).toEqual(['QUICK MB LIT']);
	});

	it('sits on the first free line below the status line, inside the panel', () => {
		const game = inGame({ players: [buildPlayer({ ballNumber: 1, modesLit: ['joust'] })] });
		const rendered = render(scoreView, game).rows;
		const statusRow = rendered.find((row) => row.text === 'BALL 1')!.row;
		const pitch = statusRow - rendered.find((row) => row.text === '0')!.row;
		expect(pitch, 'the premise: the status line sits one pitch below the one player line').toBeGreaterThan(0);
		expect(rendered.find((row) => row.text === 'JOUST LIT')?.row).toBe(statusRow + pitch);
	});

	it('with a fields line (a top mode publishing timerTicks), it sits one line further down, below the fields line', () => {
		const skillShot = { mode: 'skill_shot', priority: 200, player: 0, timerTicks: 1000 };
		const game = inGame({ players: [buildPlayer({ ballNumber: 1, modesLit: ['joust'] })], modes: [skillShot] });
		const rendered = render(scoreView, game).rows;
		const statusRow = rendered.find((row) => row.text === 'BALL 1')!.row;
		const fieldsRow = rendered.find((row) => row.text === '1.0')!.row;
		expect(fieldsRow, 'the premise: the fields line is below the status line').toBeGreaterThan(statusRow);
		expect(rendered.find((row) => row.text === 'JOUST LIT')?.row).toBe(fieldsRow + (fieldsRow - statusRow));
	});

	it('two player lines plus a fields line leave no free line: the lit line is dropped rather than drawn off the panel -- control: without the fields line it is drawn', () => {
		const skillShot = { mode: 'skill_shot', priority: 200, player: 0, timerTicks: 1000 };
		const players = [buildPlayer({ ballNumber: 1, modesLit: ['hurryup'] }), buildPlayer({ ballNumber: 0 })];
		const crowded = render(scoreView, inGame({ players, modes: [skillShot] })).rows;
		expect(crowded.map((row) => row.text), 'the premise: the fields line is drawn').toContain('1.0');
		expect(crowded.filter((row) => row.text.endsWith(' LIT'))).toEqual([]);
		expect(crowded.every((row) => row.row < 32), 'every row is on the 32-row panel').toBe(true);
		const roomy = render(scoreView, inGame({ players })).rows;
		expect(roomy.filter((row) => row.text.endsWith(' LIT')).map((row) => row.text)).toEqual(['HURRY-UP LIT']);
	});
});
