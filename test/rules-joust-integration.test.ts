// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 (AC 10, Integration -- Rules 1/2; AD-8, AD-9, AD-18, AD-19,
// FR-36): Joust through a real `createRules()` in `runRulesScript()`, from
// Attract with a real Start. Three Ramps light Hurry-up, Quick multiball and
// Joust; a Lock capture opens the mode-select window, where one left-flipper
// press moves the selection back (wrapping) to Joust and Start confirms it.
//
// 1. Scripted orbits. O_l then O_r (the measured made-Left-Loop timeline and
//    its mirror, `test/rules-joust.test.ts`'s header) raise the score by
//    exactly V and then 2V through `scoring.ts`, and the run, folded tick by
//    tick through `advanceBackglass()`/`renderFrame()` exactly as
//    `src/host/boot.ts` does and taken to dots with `rasterise()`, shows
//    `JOUST` and `CHARGE X2` -- read back glyph by glyph from the lit dots
//    against `FONT_5X7` (the `test/rules-hurry-up-integration.test.ts`
//    reader).
// 2. Recorded physics. The switch timelines of two of AC 3's recipes are
//    RECORDED here from a real `createMachine()` -- a ball served by a real
//    `c_trough_eject`, then repositioned by hand at the manifest's
//    `left-loop-orbit-31` release point and launched straight up the entry
//    column at 2200 mm/s (a made Loop) and at 800 mm/s (a fall-back) -- and
//    every playfield-switch edge of each is replayed, shifted in time, through
//    the same real `createRules()` with Joust running: the made Loop pays V,
//    and the fall-back emits `joust_charge_broken`. The launches are
//    teleported: this proves the rules read real switch timing correctly, not
//    that a flipper can make the shot (at this tree none can, DW-319).
//
// `-integration.test.ts`-suffixed: it imports the presentation rasteriser and
// real physics, so `test/rules-devices-headless.test.ts`'s ENTRY_FILES ratchet
// excludes it.

import { describe, expect, it } from 'vitest';
import { advanceBackglass, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { PLAYFIELD_SWITCHES } from '../src/sim/rules/devices';
import { MM_PER_VU, toPhysics } from '../src/sim/table/frames';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { readCollisionDoc } from './util/collision-doc';
import { shotCase } from './util/shot-cases';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { ActiveModeState } from '../src/sim/contracts/state';
import type { FrameOutput, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const V = TUNING.loopValue.value;
const T = Math.max(1, shotWindowTicks('joustMs', TUNING));
const SPINNER_SCORE = TUNING.spinnerScore.value;
const LANE_LEAD = Math.floor(shotWindowTicks('lockCaptureWindowMs', TUNING) / 2);

const LEFT = 'shot_left_loop';
const RIGHT = 'shot_right_loop';

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

/** The measured made-Left-Loop timeline, in ticks after the Loop's entry switch (`test/rules-joust.test.ts`). */
const ORBIT = { out: 223, farOut: 1759, farIn: 2618, farInlane: 3568 } as const;

/** Each Loop's own switches, by side. */
const LOOP = {
	l: { in: 's_loop_l_in', out: 's_loop_l_out', inlane: 's_inlane_l' },
	r: { in: 's_loop_r_in', out: 's_loop_r_out', inlane: 's_inlane_r' },
} as const satisfies Record<'l' | 'r', Readonly<Record<'in' | 'out' | 'inlane', SwitchName>>>;

/** One scripted Loop orbit entered at `t`: `side`'s entry and far switch, then the descent down the other lane. */
function orbit(side: 'l' | 'r', t: number): readonly SwitchEvent[] {
	const own = LOOP[side];
	const far = LOOP[side === 'l' ? 'r' : 'l'];
	return close(own.in).at(t).close(own.out).at(t + ORBIT.out).close(far.out).at(t + ORBIT.farOut).close(far.in).at(t + ORBIT.farIn).close(far.inlane).at(t + ORBIT.farInlane).build();
}

// From Attract: Start, a served and launched ball, three Ramps, a Lock
// capture with nothing locked yet (the lock applies, and three candidates
// open the window), a left-flipper move and a Start confirm.
const RAMPS = [300, 500, 700] as const;
const CAPTURE = 1000;
const MOVE = CAPTURE + 10;
const CONFIRM = CAPTURE + 20;
const PROLOGUE = merged(
	press('s_start', 10, 12),
	close('s_shooter_lane').at(15).open('s_trough_4').at(15).open('s_shooter_lane').at(50).build(),
	...RAMPS.map((t) => ramp(t)),
	capture('s_lock_1', CAPTURE),
	press('s_flipper_l', MOVE, MOVE + 2),
	press('s_start', CONFIRM, CONFIRM + 1),
);

function joustAt(result: RunRulesScriptResult, tick: number): ActiveModeState | undefined {
	return result.statesByTick.get(tick)!.modes.find((entry) => entry.mode === 'joust');
}

function scoreAt(result: RunRulesScriptResult, tick: number): number {
	return result.statesByTick.get(tick)!.players[0]!.score;
}

function paidOn(result: RunRulesScriptResult, tick: number): number {
	return scoreAt(result, tick) - scoreAt(result, tick - 1);
}

describe('Story 3.6 -- AC 10 (Integration): a real Start, three Ramps, the mode-select window confirms Joust, and O_l then O_r pay V then 2V -- the score and the DMD dots', () => {
	const first = CONFIRM + 1000;
	const second = first + 4000;
	const madeFirst = first + ORBIT.out;
	const madeSecond = second + ORBIT.out;
	const DURATION = second + 4000;
	const result = runRulesScript(merged(PROLOGUE, orbit('l', first), orbit('r', second)), { durationTicks: DURATION, tuning: TUNING });
	const frames = foldRun(result, DURATION);

	it('the premise: the real Start began a one-player game, and the three Ramps lit Hurry-up, Quick multiball and Joust in order', () => {
		expect(result.statesByTick.get(9)!.phase, 'Attract until the Start press at tick 10').toBe('attract');
		expect(result.statesByTick.get(RAMPS[0])!.phase).toBe('game');
		expect(RAMPS.map((t) => result.statesByTick.get(t)!.players[0]!.modesLit)).toEqual([['hurryup'], ['hurryup', 'quickmb'], ['hurryup', 'quickmb', 'joust']]);
		expect(result.finalState.players, 'the window\'s Start added no player').toHaveLength(1);
	});

	it('the premise: the capture opens the window on Hurry-up, the left flipper wraps back to Joust, and Start confirms it -- Joust starts on the confirm tick', () => {
		const trace = result.events
			.filter((event) => event.type === 'lock_lane_mode_start' || event.type.startsWith('mode_select_'))
			.map((event) => [event.type, 'selected' in event ? event.selected : 'mode' in event ? event.mode : null, event.tick]);
		expect(trace).toEqual([
			['lock_lane_mode_start', 'hurryup', CAPTURE],
			['mode_select_moved', 'joust', MOVE],
			['mode_select_ended', 'joust', CONFIRM],
		]);
		expect(result.modeEvents.filter((event) => event.type === 'mode_joust_started').map((event) => event.tick)).toEqual([CONFIRM]);
		expect(joustAt(result, CONFIRM - 1)).toBeUndefined();
		expect(joustAt(result, CONFIRM)).toEqual({ mode: 'joust', priority: 310, player: 0, startTick: CONFIRM, charge: 1, timerTicks: T });
		expect(result.statesByTick.get(CONFIRM)!.players[0]!.modesLit, 'the start consumed the lit Mode').toEqual(['hurryup', 'quickmb']);
	});

	it('the score rises by exactly V on the Left Loop\'s _made tick, and by exactly 2V on the Right Loop\'s', () => {
		expect(scoreAt(result, madeFirst - 1), 'the premise: the game had scored nothing before').toBe(0);
		expect(paidOn(result, madeFirst)).toBe(V);
		expect(scoreAt(result, madeSecond - 1), 'nothing in between').toBe(V);
		expect(paidOn(result, madeSecond)).toBe(2 * V);
		expect(scoreAt(result, DURATION)).toBe(3 * V);
		expect([V, 3 * V], 'at the defaults').toEqual([25000, 75000]);
	});

	it('the entry carries Charge 2 on the Right Loop after the second Loop', () => {
		expect([joustAt(result, madeFirst)!.charge, joustAt(result, madeFirst)!.lastLoop]).toEqual([1, LEFT]);
		expect([joustAt(result, madeSecond)!.charge, joustAt(result, madeSecond)!.lastLoop]).toEqual([2, RIGHT]);
	});

	it('on the confirm tick the dots read JOUST, BALL 1 and the fields line 60.0  CHARGE X1, above the first Mode still lit', () => {
		expect(T, 'the premise of the timer literals below').toBe(60000);
		expect(frames.get(CONFIRM - 1)!.screen, 'the premise: the window held the panel until the confirm').toBe('mode_select');
		expect(frames.get(CONFIRM)!.screen).toBe('score');
		expect(panel(frames.get(CONFIRM)!)).toEqual(['0', 'JOUST', 'BALL 1', '60.0  CHARGE X1', 'HURRY-UP LIT']);
	});

	it('after the Left Loop the dots read 25,000 and CHARGE X1; after the Right Loop, 75,000, JOUST and CHARGE X2', () => {
		expect(panel(frames.get(CONFIRM + 2000)!)).toEqual(['25,000', 'JOUST', 'BALL 1', '58.0  CHARGE X1', 'HURRY-UP LIT']);
		expect(panel(frames.get(madeSecond - 1)!)[3], 'still X1 the tick before the Right Loop is made').toMatch(/  CHARGE X1$/);
		expect(panel(frames.get(madeSecond)!)[3], 'X2 on the tick it is made').toMatch(/  CHARGE X2$/);
		expect(panel(frames.get(CONFIRM + 6000)!)).toEqual(['75,000', 'JOUST', 'BALL 1', '54.0  CHARGE X2', 'HURRY-UP LIT']);
	});
});

// ---------------------------------------------------------------------------
// Recorded physics, replayed through the rules.
// ---------------------------------------------------------------------------

/** One recorded switch edge, `tick` counted from the launch (the first step after the reposition is tick 1). */
interface RecordedEdge {
	readonly switch: SwitchName;
	readonly closed: boolean;
	readonly tick: number;
}

/**
 * Records a TELEPORTED launch on a real `createMachine()`: a ball served by
 * `c_trough_eject` and left to settle for 320 ticks is repositioned at the
 * manifest's `left-loop-orbit-31` release point, moving straight up the
 * playfield at `speedMmPerS` with no spin (`test/shot-routing.test.ts`'s
 * `driveShot()` technique). Returns every PLAYFIELD-switch edge until the
 * ball leaves play -- the trough and shooter-lane edges are the serve's and
 * the drain's, not the shot's, and are left out so the replay neither
 * launches nor ends a ball.
 */
function recordLeftEntryLaunch(speedMmPerS: number): RecordedEdge[] {
	const entry = shotCase('left-loop-orbit-31');
	const machine = createMachine(readCollisionDoc(), TUNING);
	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	const ball = machine.balls[0];
	if (!ball) {
		throw new Error('recordLeftEntryLaunch(): no served ball to reposition');
	}
	const start = toPhysics(entry.startMm);
	ball.state.pos.set(start.x, start.y, start.z);
	ball.hit.vel.set(0, -speedMmPerS / (MM_PER_VU * 100), 0);
	ball.hit.angularVelocity.set(0, 0, 0);
	ball.hit.angularMomentum.set(0, 0, 0);

	const launch = tick;
	const edges: RecordedEdge[] = [];
	for (let i = 0; i < entry.ticks && machine.balls.length > 0; i++) {
		tick += 1;
		for (const event of machine.step(tick, NO_FRAME, []).switchEvents) {
			if (PLAYFIELD_SWITCHES.has(event.switch)) {
				edges.push({ switch: event.switch, closed: event.closed, tick: event.tick - launch });
			}
		}
	}
	return edges;
}

/** `edges` as rules-script switch events, with launch tick 0 placed at `at`. */
function replayAt(edges: readonly RecordedEdge[], at: number): readonly SwitchEvent[] {
	return edges.map((edge) => ({ type: 'switch' as const, switch: edge.switch, closed: edge.closed, tick: at + edge.tick }));
}

/** The launch-relative ticks `switchName` closed on. */
function closes(edges: readonly RecordedEdge[], switchName: SwitchName): number[] {
	return edges.filter((edge) => edge.closed && edge.switch === switchName).map((edge) => edge.tick);
}

describe('Story 3.6 -- AC 10 (Integration): the switch timelines of a real made Loop and a real fall-back, replayed through createRules() with Joust running', () => {
	const madeLoop = recordLeftEntryLaunch(2200);
	const fallBack = recordLeftEntryLaunch(800);
	const loopAt = CONFIRM + 1000;
	const fallBackAt = loopAt + 5000;
	const lastEdge = Math.max(...fallBack.map((edge) => edge.tick));
	const DURATION = fallBackAt + lastEdge + 10;
	const result = runRulesScript(merged(PROLOGUE, replayAt(madeLoop, loopAt), replayAt(fallBack, fallBackAt)), { durationTicks: DURATION, tuning: TUNING });
	const madeTick = loopAt + closes(madeLoop, 's_loop_l_out')[0]!;
	const brokenTick = fallBackAt + closes(fallBack, 's_loop_l_in')[1]!;

	it('the premise: the recordings are a real orbit and a real fall-back, and the first ends before the second begins', () => {
		const loopSwitches: readonly SwitchName[] = ['s_loop_l_in', 's_loop_l_out', 's_loop_r_in', 's_loop_r_out', 's_inlane_l', 's_inlane_r', 's_outlane_l', 's_outlane_r'];
		const order = (edges: readonly RecordedEdge[]): SwitchName[] => edges.filter((edge) => edge.closed && loopSwitches.includes(edge.switch)).map((edge) => edge.switch);
		expect(order(madeLoop)).toEqual(['s_loop_l_in', 's_loop_l_out', 's_loop_r_out', 's_loop_r_in', 's_inlane_r']);
		expect(order(fallBack)).toEqual(['s_loop_l_in', 's_loop_l_in', 's_outlane_l']);
		expect(madeLoop.some((edge) => !edge.closed), 'the recordings carry the opening edges too').toBe(true);
		expect(Math.max(...madeLoop.map((edge) => edge.tick))).toBeLessThan(fallBackAt - loopAt);
		expect(joustAt(result, CONFIRM)?.startTick, 'Joust is running, started by the real window confirm').toBe(CONFIRM);
	});

	it('the made Loop pays exactly V on the tick its s_loop_l_out closed, opening the chain at Charge 1', () => {
		expect(paidOn(result, madeTick)).toBe(V);
		expect([joustAt(result, madeTick)!.charge, joustAt(result, madeTick)!.lastLoop]).toEqual([1, LEFT]);
		expect(scoreAt(result, madeTick - 1), 'nothing before it').toBe(0);
	});

	it('the orbit\'s real descent through the right lane arms nothing: the chain is still Charge 1 on the Left Loop when the fall-back begins', () => {
		expect([joustAt(result, fallBackAt)!.charge, joustAt(result, fallBackAt)!.lastLoop]).toEqual([1, LEFT]);
	});

	it('the fall-back emits joust_charge_broken{player 0, the Left Loop, charge 1} on the tick s_loop_l_in closed the second time, and pays nothing', () => {
		expect(result.modeEvents.filter((event) => event.type.startsWith('joust_'))).toEqual([{ type: 'joust_charge_broken', player: 0, shot: LEFT, charge: 1, tick: brokenTick }]);
		expect(paidOn(result, brokenTick)).toBe(0);
		expect('lastLoop' in joustAt(result, brokenTick)!, 'the chain is forgotten').toBe(false);
	});

	it('everything else the run scored is the real Spinner turning as the ball passed it: the total is V plus spinnerScore per recorded turn', () => {
		const turns = closes(madeLoop, 's_spinner').length + closes(fallBack, 's_spinner').length;
		expect(turns, 'the premise: the real Left Loop turns the Spinner').toBeGreaterThan(0);
		expect(scoreAt(result, DURATION)).toBe(V + turns * SPINNER_SCORE);
	});
});
