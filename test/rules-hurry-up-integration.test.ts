// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.5 (AC 7, Integration -- Rules 1/2; AD-8, AD-9, FR-34): a real
// `createRules()` in `runRulesScript()`, from Attract with a real Start. A
// Ramp lights Hurry-up, a Lock capture at t0 starts it, and a Ramp at
// t0+1000 collects it: the score rises by exactly v(1000) through
// `scoring.ts`, and the run, folded tick by tick through
// `advanceBackglass()`/`renderFrame()` exactly as `src/host/boot.ts` does and
// taken to dots with `rasterise()`, shows `HURRY-UP` and the decaying fields
// line before the collect, then the new score and no fields line after it --
// read back glyph by glyph from the lit dots against `FONT_5X7` (the
// `test/rules-campaign-qa-integration.test.ts` reader).
//
// `-integration.test.ts`-suffixed: it imports the presentation rasteriser,
// so `test/rules-devices-headless.test.ts`'s ENTRY_FILES ratchet excludes it.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { FrameOutput, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const S = TUNING.hurryUpStartValue.value;
const F = TUNING.hurryUpFloor.value;
const T = Math.max(1, shotWindowTicks('hurryUpMs', TUNING));
const LANE_LEAD = Math.floor(shotWindowTicks('lockCaptureWindowMs', TUNING) / 2);

/** v(e), asserting the straight line is exact at `e`. */
function v(e: number): number {
	expect((S - F) * e % T, `the premise: (S - F) * ${e} divides by T exactly`).toBe(0);
	return S - ((S - F) * e) / T;
}

/**
 * Reads one DMD text row back from the lit dots: each `GLYPH_ADVANCE`-wide
 * cell from `(col, row)` is matched against every `FONT_5X7` glyph. A row
 * drawn in inverse video (the current player's score, `emphasis`) is
 * detected by its lit left gutter dot and un-inverted before matching.
 */
function readRow(raster: DmdRaster, col: number, row: number): string {
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
	return text.trimEnd();
}

/** Every row of `frame`, read back from its rasterised dots at the row's own origin. */
function panel(frame: DmdFrame): string[] {
	const raster = rasterise(frame, FONT_5X7);
	return frame.rows.map((row) => readRow(raster, row.col, row.row));
}

/** Folds every tick of a real run through the Backglass, one tick per frame. */
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

describe('Story 3.5 -- AC 7 (Integration): a real Start, a Ramp lights Hurry-up, a capture starts it, a Ramp collects it -- the score and the DMD dots', () => {
	// From Attract: Start, a served and launched ball, a Ramp (Hurry-up lit),
	// a Lock capture with no credits (the lock applies; one candidate starts
	// at once), then the collecting Ramp.
	const LIGHT_RAMP = 300;
	const T0 = 800;
	const COLLECT = T0 + 1000;
	const DURATION = COLLECT + 10;
	const script = [
		...press('s_start', 10, 12),
		...close('s_shooter_lane').at(15).open('s_trough_4').at(15).open('s_shooter_lane').at(50).build(),
		...ramp(LIGHT_RAMP),
		...capture('s_lock_1', T0),
		...ramp(COLLECT),
	].sort((a, b) => a.tick - b.tick);
	const result = runRulesScript(script, { durationTicks: DURATION, tuning: TUNING });
	const frames = foldRun(result, DURATION);
	const score = (tick: number): number => result.statesByTick.get(tick)!.players[0]!.score;

	it('the premise: the real Start began a one-player game, the Ramp lit Hurry-up, and the capture started it on t0', () => {
		expect(result.statesByTick.get(9)!.phase, 'Attract until the Start press at tick 10').toBe('attract');
		expect(result.statesByTick.get(LIGHT_RAMP)!.phase).toBe('game');
		expect(result.statesByTick.get(LIGHT_RAMP)!.players[0]!.modesLit).toEqual(['hurryup']);
		expect(result.modeEvents.filter((event) => event.type === 'mode_hurryup_started').map((event) => event.tick)).toEqual([T0]);
		expect(result.finalState.players).toHaveLength(1);
	});

	it('the score rises by exactly v(1000) (240000) at the collect, through a real hurryup_collected', () => {
		expect(score(COLLECT) - score(COLLECT - 1)).toBe(v(1000));
		expect(v(1000)).toBe(240000);
		expect(result.modeEvents.filter((event) => event.type === 'hurryup_collected')).toEqual([{ type: 'hurryup_collected', player: 0, value: 240000, tick: COLLECT }]);
	});

	it('control: the tick before the collect, nothing has been paid yet', () => {
		expect(score(COLLECT - 1)).toBe(score(T0));
		expect(score(T0), 'the premise: the game had scored nothing before').toBe(0);
	});

	it('on t0 the dots read HURRY-UP, BALL 1 and the fields line 20.0  250000', () => {
		expect(frames.get(T0)!.screen).toBe('score');
		expect(panel(frames.get(T0)!)).toEqual(['0', 'HURRY-UP', 'BALL 1', '20.0  250000']);
	});

	it('the fields line decays on the dots: 19.5  245000 at t0+500, 19.0  240010 at t0+999', () => {
		expect(panel(frames.get(T0 + 500)!)).toEqual(['0', 'HURRY-UP', 'BALL 1', '19.5  245000']);
		expect(panel(frames.get(COLLECT - 1)!)).toEqual(['0', 'HURRY-UP', 'BALL 1', '19.0  240010']);
	});

	it('after the collect the dots read the new score, no HURRY-UP and no fields line -- and the Ramp\'s newly lit Quick multiball', () => {
		expect(panel(frames.get(COLLECT)!)).toEqual(['240,000', 'BALL 1', 'QUICK MB LIT']);
		expect(panel(frames.get(DURATION)!)).toEqual(['240,000', 'BALL 1', 'QUICK MB LIT']);
	});
});
