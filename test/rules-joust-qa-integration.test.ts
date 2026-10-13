// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 QA (AC 9's panel rows; AD-8, AD-9, FR-36): who owns the DMD when
// Joust and Hurry-up both run -- read from the rasterised dots of a real
// `createRules()` run, from Attract with a real Start.
//
// `test/backglass-joust.test.ts` pins these rows on hand-built snapshots whose
// `modes[]` entries, priorities and timers are typed in by the test, and
// `test/rules-joust.test.ts`'s "Hurry-up below" row runs both Modes on real
// rules but never draws them. Neither shows the panel the rules themselves
// produce with both Modes live, and neither performs a hand-back: the panel
// returning to Hurry-up on the tick a real Joust stops. This file does both.
//
// The run (switch edges scripted by hand; no state is seeded): Start, a
// served and launched ball, three Ramps lighting Hurry-up, Quick multiball
// and Joust; a Lock capture whose window Start confirms on its first
// selection, Hurry-up (t0); a second capture whose window, one left-flipper
// press later, Start confirms on Joust (t1). Then either a made Left Loop and
// a Ramp (the default tuning), or nothing until Joust's own timer ends it
// under a still-running Hurry-up (`joustMs` 3000).
//
// Every tick is folded through `advanceBackglass()`/`renderFrame()` exactly
// as `src/host/boot.ts` does, taken to dots with `rasterise()`, and read back
// glyph by glyph against `FONT_5X7`. Expected text is computed here from
// `resolveTuning()` and the script's own ticks, never from a Mode.
//
// `-integration.test.ts`-suffixed: it imports the presentation rasteriser, so
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES ratchet excludes it.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { ActiveModeState } from '../src/sim/contracts/state';
import type { FrameOutput, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const V = TUNING.loopValue.value;
const T = Math.max(1, shotWindowTicks('joustMs', TUNING));
const TICKS_PER_SECOND = T / (TUNING.joustMs.value / 1000);
const HURRYUP_START = TUNING.hurryUpStartValue.value;
const HURRYUP_FLOOR = TUNING.hurryUpFloor.value;
const HURRYUP_TICKS = Math.max(1, shotWindowTicks('hurryUpMs', TUNING));
const LANE_LEAD = Math.floor(shotWindowTicks('lockCaptureWindowMs', TUNING) / 2);

/** Reads one DMD text row back from the lit dots (the `test/rules-hurry-up-integration.test.ts` reader). */
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

function merged(...parts: readonly (readonly SwitchEvent[])[]): readonly SwitchEvent[] {
	return parts.flat().sort((a, b) => a.tick - b.tick);
}

/** A tuning set with `joustMs` overridden on the raw `TUNING` before `resolveTuning()`. */
function withJoustMs(ms: number): ResolvedTuning {
	return resolveTuning({ ...RAW_TUNING, joustMs: { ...RAW_TUNING.joustMs, value: ms } });
}

// From Attract: Start, a served and launched ball, three Ramps, then the two
// captures and their windows.
const RAMPS = [300, 500, 700] as const;
const CAPTURE_1 = 1000;
/** Hurry-up starts here: Start confirms the first window's own first selection. */
const T0 = CAPTURE_1 + 20;
const CAPTURE_2 = T0 + 2000;
const MOVE = CAPTURE_2 + 10;
/** Joust starts here: Start confirms the second window after the left flipper moved it. */
const T1 = CAPTURE_2 + 20;
const PROLOGUE = merged(
	press('s_start', 10, 12),
	close('s_shooter_lane').at(15).open('s_trough_4').at(15).open('s_shooter_lane').at(50).build(),
	...RAMPS.map((t) => ramp(t)),
	capture('s_lock_1', CAPTURE_1),
	press('s_start', T0, T0 + 1),
	capture('s_lock_2', CAPTURE_2),
	press('s_flipper_l', MOVE, MOVE + 2),
	press('s_start', T1, T1 + 1),
);

function entryOf(result: RunRulesScriptResult, mode: string, tick: number): ActiveModeState | undefined {
	return result.statesByTick.get(tick)!.modes.find((entry) => entry.mode === mode);
}

/** Hurry-up's value on its straight line, `e` ticks after its start. */
function hurryUpValue(e: number): number {
	return HURRYUP_START - ((HURRYUP_START - HURRYUP_FLOOR) * e) / HURRYUP_TICKS;
}

/** Hurry-up's fields line `e` ticks after its start: its remaining seconds, then its value. */
function hurryUpFields(e: number): string {
	return `${((HURRYUP_TICKS - e) / TICKS_PER_SECOND).toFixed(1)}  ${hurryUpValue(e)}`;
}

describe('Story 3.6 QA -- AC 9 on real rules: with Hurry-up and Joust both running, Joust owns the rasterised panel', () => {
	/** The made Left Loop: its entry, and its far switch 223 ticks later (the measured figure of `test/loop-fall-back-physics.test.ts`). */
	const loopIn = T1 + 1000;
	const made = loopIn + 223;
	const collect = T0 + 8000;
	const DURATION = collect + 100;
	const script = merged(PROLOGUE, close('s_loop_l_in').at(loopIn).close('s_loop_l_out').at(made).build(), ramp(collect));
	const result = runRulesScript(script, { durationTicks: DURATION, tuning: TUNING });
	const frames = foldRun(result, DURATION);
	const rows = (tick: number): string[] => panel(frames.get(tick)!);

	it('the premise: a real Start, three lit Modes, and the two windows confirm Hurry-up at t0 and then Joust at t1 -- both entries live from t1', () => {
		expect(result.statesByTick.get(9)!.phase).toBe('attract');
		expect(result.statesByTick.get(RAMPS[2])!.players[0]!.modesLit).toEqual(['hurryup', 'quickmb', 'joust']);
		const trace = result.events
			.filter((event) => event.type === 'lock_lane_mode_start' || event.type.startsWith('mode_select_'))
			.map((event) => [event.type, 'selected' in event ? event.selected : 'mode' in event ? event.mode : null, event.tick]);
		expect(trace).toEqual([
			['lock_lane_mode_start', 'hurryup', CAPTURE_1],
			['mode_select_ended', 'hurryup', T0],
			['lock_lane_mode_start', 'quickmb', CAPTURE_2],
			['mode_select_moved', 'joust', MOVE],
			['mode_select_ended', 'joust', T1],
		]);
		expect(entryOf(result, 'hurryup', T0)?.startTick).toBe(T0);
		expect(entryOf(result, 'joust', T1 - 1)).toBeUndefined();
		expect(entryOf(result, 'joust', T1)?.startTick).toBe(T1);
		expect(entryOf(result, 'hurryup', T1), 'Hurry-up is still running under it').toBeDefined();
		expect(result.finalState.players).toHaveLength(1);
	});

	it('control: before Joust starts, the running Hurry-up owns the panel -- HURRY-UP and "19.0  240000" a second in', () => {
		expect(frames.get(T0 + 1000)!.screen).toBe('score');
		expect(rows(T0 + 1000)).toEqual(['0', 'HURRY-UP', 'BALL 1', hurryUpFields(1000), 'QUICK MB LIT']);
		expect(hurryUpFields(1000), 'at the defaults').toBe('19.0  240000');
	});

	it('on t1 the panel is Joust\'s: JOUST, BALL 1 and "60.0  CHARGE X1" -- no HURRY-UP row, and Hurry-up\'s value is not drawn', () => {
		expect(frames.get(T1 - 1)!.screen, 'the premise: the window held the panel until the confirm').toBe('mode_select');
		expect(frames.get(T1)!.screen).toBe('score');
		expect(rows(T1)).toEqual(['0', 'JOUST', 'BALL 1', '60.0  CHARGE X1', 'QUICK MB LIT']);
		expect(rows(T1).join('|')).not.toContain(String(hurryUpValue(T1 - T0)));
		expect(entryOf(result, 'hurryup', T1)?.value, 'the premise: Hurry-up is publishing that value on the same tick').toBe(hurryUpValue(T1 - T0));
	});

	it('Joust\'s timer decays on the panel to the tenth: 59.9 at t1+100, 58.8 at t1+1234, 57.0 at t1+3000', () => {
		const timer = (e: number): string => `${((T - e) / TICKS_PER_SECOND).toFixed(1)}  CHARGE X1`;
		expect([rows(T1 + 100)[3], rows(T1 + 1234)[3], rows(T1 + 3000)[3]]).toEqual([timer(100), timer(1234), timer(3000)]);
		expect([timer(100), timer(1234), timer(3000)], 'at the defaults').toEqual(['59.9  CHARGE X1', '58.8  CHARGE X1', '57.0  CHARGE X1']);
	});

	it('the made Loop pays V onto the score row under Joust\'s panel: 0 the tick before, 25,000 on it', () => {
		expect([rows(made - 1)[0], rows(made - 1)[1]]).toEqual(['0', 'JOUST']);
		expect([rows(made)[0], rows(made)[1]]).toEqual([V.toLocaleString('en-US'), 'JOUST']);
		expect(V.toLocaleString('en-US'), 'at the defaults').toBe('25,000');
	});

	it('the Ramp collects Hurry-up under Joust\'s panel: the score row gains Hurry-up\'s value, Hurry-up stops, and the panel is still JOUST with its own fields line', () => {
		const value = hurryUpValue(collect - T0);
		expect(value, 'at the defaults: 250000 - 10 x 8000').toBe(170000);
		expect(entryOf(result, 'hurryup', collect - 1), 'the premise: Hurry-up ran until the Ramp').toBeDefined();
		expect(entryOf(result, 'hurryup', collect)).toBeUndefined();
		expect(rows(collect - 1).slice(0, 2)).toEqual(['25,000', 'JOUST']);
		expect(rows(collect).slice(0, 4)).toEqual([(V + value).toLocaleString('en-US'), 'JOUST', 'BALL 1', `${((T - (collect - T1)) / TICKS_PER_SECOND).toFixed(1)}  CHARGE X1`]);
		expect((V + value).toLocaleString('en-US'), 'at the defaults').toBe('195,000');
	});
});

describe('Story 3.6 QA -- AC 9 on real rules: when Joust\'s timer ends under a running Hurry-up, the panel goes back to Hurry-up on that tick (joustMs 3000)', () => {
	const tuning = withJoustMs(3000);
	const shortT = Math.max(1, shotWindowTicks('joustMs', tuning));
	const stop = T1 + shortT;
	const DURATION = stop + 100;
	const result = runRulesScript(PROLOGUE, { durationTicks: DURATION, tuning });
	const frames = foldRun(result, DURATION);
	const rows = (tick: number): string[] => panel(frames.get(tick)!);

	it('the premise: Joust runs 3000 ticks from t1 and stops by its own timer while Hurry-up still has time left', () => {
		expect(shortT).toBe(3000);
		expect(entryOf(result, 'joust', T1)?.timerTicks).toBe(shortT);
		expect(entryOf(result, 'joust', stop - 1)?.timerTicks).toBe(1);
		expect(entryOf(result, 'joust', stop)).toBeUndefined();
		expect(result.modeEvents.filter((event) => event.type === 'mode_joust_stopped').map((event) => event.tick)).toEqual([stop]);
		expect(stop - T0, 'Hurry-up outlasts it').toBeLessThan(HURRYUP_TICKS);
		expect(entryOf(result, 'hurryup', stop)).toBeDefined();
	});

	it('the tick before the stop the panel is still Joust\'s, reading "0.0  CHARGE X1"', () => {
		expect(rows(T1)).toEqual(['0', 'JOUST', 'BALL 1', '3.0  CHARGE X1', 'QUICK MB LIT']);
		expect(rows(stop - 1)).toEqual(['0', 'JOUST', 'BALL 1', '0.0  CHARGE X1', 'QUICK MB LIT']);
	});

	it('on the stop tick the panel is Hurry-up\'s again: HURRY-UP with its own timer and value, and no JOUST or CHARGE anywhere', () => {
		const e = stop - T0;
		expect(rows(stop)).toEqual(['0', 'HURRY-UP', 'BALL 1', hurryUpFields(e), 'QUICK MB LIT']);
		expect(hurryUpFields(e), 'at the defaults: 14.98 s and 250000 - 10 x 5020').toBe('15.0  199800');
		expect(rows(stop + 50)).toEqual(['0', 'HURRY-UP', 'BALL 1', hurryUpFields(e + 50), 'QUICK MB LIT']);
		expect(rows(stop + 50).join('|')).not.toMatch(/JOUST|CHARGE/);
	});
});
