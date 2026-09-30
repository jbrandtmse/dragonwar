// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 QA (AC 6, AC 2, AC 4; AD-9, AD-18): what a player SEES of the
// campaign, read back from the rasterised DMD's lit dots. The implement
// stage's `test/backglass-mode-select.test.ts` feeds hand-made events and
// compares `renderFrame()` row text; here the events and states are a real
// `createRules()`'s (through `runRulesScript()`, from Attract with a real
// Start), folded tick by tick through `advanceBackglass()`/`renderFrame()`
// exactly as `src/host/boot.ts` does, taken to dots with `rasterise()` and
// read back glyph by glyph against `FONT_5X7` by a test-local reader (the
// `test/rules-scoring-qa-integration.test.ts` reader, which detects a row
// drawn in inverse video -- the selected candidate's marker).
//
// `-integration.test.ts`-suffixed: it imports the presentation rasteriser,
// so `test/rules-devices-headless.test.ts`'s ENTRY_FILES ratchet excludes it
// by name, as it does every other `rules-*-integration.test.ts`.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { FrameOutput, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const LANE_LEAD = Math.floor(shotWindowTicks('lockCaptureWindowMs', TUNING) / 2);

/**
 * Reads one DMD text row back from the lit dots: each `GLYPH_ADVANCE`-wide
 * cell from `(col, row)` is matched against every `FONT_5X7` glyph. A row
 * drawn in inverse video is detected by its lit left gutter dot (`col - 1`,
 * never lit by a glyph) and un-inverted before matching. Stops at the first
 * cell no glyph matches; trailing blanks are trimmed.
 */
function readRow(raster: DmdRaster, col: number, row: number): { text: string; inverse: boolean } {
	const dot = (r: number, c: number): number => raster.dots[r * raster.cols + c] ?? 0;
	const inverse = col > 0 && dot(row, col - 1) === 1;
	let text = '';
	for (let origin = col; origin + GLYPH_W <= raster.cols; origin += GLYPH_ADVANCE) {
		const bits: number[] = [];
		for (let gy = 0; gy < GLYPH_H; gy++) {
			let mask = 0;
			for (let gx = 0; gx < GLYPH_W; gx++) {
				mask = (mask << 1) | (dot(row + gy, origin + gx) ^ (inverse ? 1 : 0));
			}
			bits.push(mask);
		}
		const match = Object.entries(FONT_5X7).find(([, glyph]) => glyph.every((m, i) => m === bits[i]));
		if (!match) {
			break;
		}
		text += match[0];
	}
	return { text: text.trimEnd(), inverse };
}

/** Every row of `frame`, read back from its rasterised dots at the row's own origin: `[text, inverse]`. */
function panel(frame: DmdFrame): [string, boolean][] {
	const raster = rasterise(frame, FONT_5X7);
	return frame.rows.map((row) => {
		const read = readRow(raster, row.col, row.row);
		return [read.text, read.inverse];
	});
}

/** Folds every tick of a real run through the Backglass, one tick per frame, returning each tick's rendered frame. */
function foldRun(result: RunRulesScriptResult, durationTicks: number): Map<number, DmdFrame> {
	let view: BackglassView = INITIAL_BACKGLASS_VIEW;
	const frames = new Map<number, DmdFrame>();
	for (let tick = 1; tick <= durationTicks; tick++) {
		const game = result.statesByTick.get(tick)!;
		const output: FrameOutput = { snapshot: buildSnapshot({ tick, game }), events: result.events.filter((event) => event.tick === tick), contactEvents: [], commands: [] };
		view = advanceBackglass(view, output);
		frames.set(tick, renderFrame(view, output.snapshot));
	}
	return frames;
}

function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

function ramp(t: number): readonly SwitchEvent[] {
	return close('s_ramp_enter').at(t - 20).open().at(t - 15).close('s_ramp_made').at(t).open().at(t + 5).build();
}

function press(button: SwitchName, at: number, release: number): readonly SwitchEvent[] {
	return close(button).at(at).open().at(release).build();
}

describe('QA harness -- readRow() reads a rasterised candidate row back, plain and inverse', () => {
	it('reads HURRY-UP plain and QUICK MB in inverse video, and tells them apart', () => {
		const frame: DmdFrame = {
			screen: 'mode_select',
			rows: [
				{ text: 'HURRY-UP', col: 2, row: 0, emphasis: false },
				{ text: 'QUICK MB', col: 2, row: 8, emphasis: true },
			],
		};
		expect(panel(frame)).toEqual([
			['HURRY-UP', false],
			['QUICK MB', true],
		]);
		expect(panel({ ...frame, rows: [{ ...frame.rows[0]!, text: 'JOUST' }] }), 'control: different text reads differently').toEqual([['JOUST', false]]);
	});
});

describe('Story 3.4 QA -- AC 6 on the rasterised DMD of a real run: the lit line, the candidates, the marker, and the drop', () => {
	// From Attract: Start, a served and launched ball, two Ramps (Hurry-up,
	// then Quick multiball lit), a Lock capture with nothing locked yet (the
	// lock applies, and two candidates open the window), a right-flipper move
	// and a Start confirm.
	const FIRST_RAMP = 300;
	const SECOND_RAMP = 500;
	const CAPTURE = 800;
	const MOVE = CAPTURE + 10;
	const CONFIRM = CAPTURE + 20;
	const DURATION = CONFIRM + 10;
	const script = [
		...press('s_start', 10, 12),
		...close('s_shooter_lane').at(15).open('s_trough_4').at(15).open('s_shooter_lane').at(50).build(),
		...ramp(FIRST_RAMP),
		...ramp(SECOND_RAMP),
		...capture('s_lock_1', CAPTURE),
		...press('s_flipper_r', MOVE, MOVE + 2),
		...press('s_start', CONFIRM, CONFIRM + 1),
	].sort((a, b) => a.tick - b.tick);
	const result = runRulesScript(script, { durationTicks: DURATION, tuning: TUNING });
	const frames = foldRun(result, DURATION);
	const litLines = (tick: number): string[] => panel(frames.get(tick)!).map(([text]) => text).filter((text) => text.endsWith(' LIT'));

	it('the premise: the real run lit two Modes, opened the window on the capture, moved on the flipper, and confirmed Quick multiball on Start', () => {
		expect(result.statesByTick.get(SECOND_RAMP)!.players[0]!.modesLit).toEqual(['hurryup', 'quickmb']);
		expect(result.events.filter((event) => event.type === 'lock_lane_mode_start' || event.type.startsWith('mode_select_')).map((event) => [event.type, event.tick])).toEqual([
			['lock_lane_mode_start', CAPTURE],
			['mode_select_moved', MOVE],
			['mode_select_ended', CONFIRM],
		]);
		expect(result.finalState.players, 'the window\'s Start added no player').toHaveLength(1);
	});

	it('control: before any Ramp the score screen carries no lit line', () => {
		expect(frames.get(FIRST_RAMP - 1)!.screen).toBe('score');
		expect(litLines(FIRST_RAMP - 1)).toEqual([]);
	});

	it('the first Ramp puts HURRY-UP LIT on the panel\'s dots, on its own tick; the second leaves it naming the FIRST lit Mode', () => {
		expect(frames.get(FIRST_RAMP)!.screen).toBe('score');
		expect(litLines(FIRST_RAMP)).toEqual(['HURRY-UP LIT']);
		expect(litLines(SECOND_RAMP)).toEqual(['HURRY-UP LIT']);
		expect(litLines(CAPTURE - 1), 'held continuously between them').toEqual(['HURRY-UP LIT']);
	});

	it('the capture opens SELECT MODE: both candidates on the dots, HURRY-UP (the selected one) in inverse video', () => {
		expect(frames.get(CAPTURE)!.screen).toBe('mode_select');
		expect(panel(frames.get(CAPTURE)!)).toEqual([
			['SELECT MODE', false],
			['HURRY-UP', true],
			['QUICK MB', false],
		]);
		expect(panel(frames.get(MOVE - 1)!), 'held unchanged until the move').toEqual(panel(frames.get(CAPTURE)!));
	});

	it('the right flipper moves the inverse marker to QUICK MB on the move tick', () => {
		expect(panel(frames.get(MOVE)!)).toEqual([
			['SELECT MODE', false],
			['HURRY-UP', false],
			['QUICK MB', true],
		]);
	});

	it('the confirm drops the screen on its own tick: the score screen returns, and its lit line now names the Mode still lit (HURRY-UP), not the one that started', () => {
		expect(frames.get(CONFIRM - 1)!.screen).toBe('mode_select');
		expect(frames.get(CONFIRM)!.screen).toBe('score');
		expect(panel(frames.get(CONFIRM)!).map(([text]) => text)).not.toContain('SELECT MODE');
		expect(result.statesByTick.get(CONFIRM)!.players[0]!.modesLit, 'the premise: Quick multiball started and left modesLit').toEqual(['hurryup']);
		expect(litLines(CONFIRM)).toEqual(['HURRY-UP LIT']);
	});
});
