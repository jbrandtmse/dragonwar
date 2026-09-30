// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.5 QA (AC 2, AC 4, AC 6/7's DMD read; AD-3, AD-8, AD-9, FR-34): the
// whole Hurry-up path on REAL physics and a real `createRules()`, composed by
// a real `createLoop()` from Attract -- no seeded state, no scripted switch
// edges, no teleported ball. Every Hurry-up test before this one drives
// `runRulesScript()` with switch edges written by hand; this one asks the
// table itself.
//
// - Ball 1: the reachability witness `plunge-then-bat-r-3899`
//   (`test/util/reachability.ts`: a 285-tick plunge, then the right bat for
//   60 ticks 3899 ticks after the release) makes the Ramp, and the Ramp
//   lights Hurry-up (Story 3.4's round rule). The ball then drains, is saved
//   once, and ends.
// - Ball 2: the witness `plunge-then-bat-l-3945` (a 521-tick plunge, then
//   the left bat for 30 ticks 3945 ticks after the release) is captured by
//   the Lock. No credits, one lit candidate: the lock applies and Hurry-up
//   starts on the capture tick t0 (Story 3.4). The served ball is
//   autolaunched (`serveAfterLock`), drains inside its save, is saved, and
//   the re-served ball's drain ends ball 2.
//
// Each witness's inputs are offset from its own ball's `ball_started` tick:
// the witness ejects on physics tick 1, and the loop consumes the rules'
// `c_trough_eject` on the tick after `ball_started` (AD-4), so a plunge
// that began 321 ticks after tick 0 in the witness begins 321 ticks after
// `ball_started` here (the `test/lock-arbiter-physics.test.ts` offset).
//
// Asserted on the loop's own `FrameOutput`s: the entry's `value` and
// `timerTicks` on every real tick from t0 to the ball end (both computed
// here from `resolveTuning()`, never by calling Hurry-up); Hurry-up surviving
// the ball save (a save is not a ball end); the ball end removing the entry
// and paying exactly `ball_ended.total`; and the DMD, folded through
// `advanceBackglass()`/`renderFrame()` exactly as `src/host/boot.ts` does and
// read back from `rasterise()`'s dots.
//
// A `*-physics.test.ts` file: it drives real physics on purpose, so it is not
// a `rules-*` headless test and is not listed in
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceBackglass, BALL_ENDED_HOLD_TICKS, INITIAL_BACKGLASS_VIEW, renderFrame, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7, GLYPH_ADVANCE, GLYPH_H, GLYPH_W } from '../src/presentation/backglass/font';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { MODE_PRIORITIES } from '../src/sim/rules/modes';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { InputFrame, InputTransition } from '../src/sim/contracts/input';
import type { FrameOutput, GameStart, SemanticEvent } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

const TUNING = resolveTuning();
const S = TUNING.hurryUpStartValue.value;
const F = TUNING.hurryUpFloor.value;
const T = Math.max(1, shotWindowTicks('hurryUpMs', TUNING));
const ADJUSTMENTS: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

/** The two reachability witnesses (`test/util/reachability.ts`), by their own recorded parameters. */
const RAMP_WITNESS = { plungeHoldTicks: 285, side: 'r', flipAt: 3899, flipHold: 60 } as const;
const LOCK_WITNESS = { plungeHoldTicks: 521, side: 'l', flipAt: 3945, flipHold: 30 } as const;
/** The witness's plunge begins 321 ticks after its eject tick's predecessor (settle 320, eject on tick 1). */
const PLUNGE_AFTER_BALL_STARTED = 321;

/** Guards against a run that never ends: ball 2's own end measured at ~26300 at this tree. */
const CAP_TICKS = 60_000;
/** Ticks the run continues past ball 3's start, so the ball-ended screen's hold releases and the score screen is drawn again (code review 2026-09-30). */
const AFTER_BALL_3_TICKS = BALL_ENDED_HOLD_TICKS + 100;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** A witness's input transitions, offset from its own ball's `ball_started` tick. */
function witnessInputs(ballStarted: number, witness: typeof RAMP_WITNESS | typeof LOCK_WITNESS): InputTransition[] {
	const plungeOn = ballStarted + PLUNGE_AFTER_BALL_STARTED;
	const releaseOn = plungeOn + witness.plungeHoldTicks;
	const flipOn = releaseOn + witness.flipAt;
	const flipper: keyof InputFrame = witness.side === 'l' ? 'flipper_l' : 'flipper_r';
	return [
		{ tick: plungeOn, frame: { ...NO_FRAME, plunger: true } },
		{ tick: releaseOn, frame: NO_FRAME },
		{ tick: flipOn, frame: { ...NO_FRAME, [flipper]: true } },
		{ tick: flipOn + witness.flipHold, frame: NO_FRAME },
	];
}

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

function panel(frame: DmdFrame): string[] {
	const raster = rasterise(frame, FONT_5X7);
	return frame.rows.map((row) => readRow(raster, row.col, row.row));
}

interface Run {
	readonly outputs: Map<number, FrameOutput>;
	readonly frames: Map<number, DmdFrame>;
	readonly events: SemanticEvent[];
	readonly ballStarted: number[];
	readonly lastTick: number;
}

/** From Attract: Start, ball 1 on the Ramp witness, ball 2 on the Lock witness; runs until `AFTER_BALL_3_TICKS` after ball 3 starts. */
function runGame(): Run {
	const gameStart: GameStart = { seed: 0, tuning: TUNING, adjustments: ADJUSTMENTS, highscores: [] };
	const loop = createLoop({ collisionDoc: loadDoc(), gameStart, tuning: TUNING });
	let transitions: InputTransition[] = [
		{ tick: 2, frame: { ...NO_FRAME, start: true } },
		{ tick: 3, frame: NO_FRAME },
	];
	const outputs = new Map<number, FrameOutput>();
	const frames = new Map<number, DmdFrame>();
	const events: SemanticEvent[] = [];
	const ballStarted: number[] = [];
	let view: BackglassView = INITIAL_BACKGLASS_VIEW;
	let tick = 0;
	while (tick < CAP_TICKS && (ballStarted.length < 3 || tick < ballStarted[2]! + AFTER_BALL_3_TICKS)) {
		tick += 1;
		const out = loop.advance(1, transitions.filter((transition) => transition.tick === tick));
		outputs.set(tick, out);
		events.push(...out.events);
		view = advanceBackglass(view, out);
		frames.set(tick, renderFrame(view, out.snapshot));
		if (out.events.some((event) => event.type === 'ball_started')) {
			ballStarted.push(tick);
			if (ballStarted.length === 1) {
				transitions = transitions.concat(witnessInputs(tick, RAMP_WITNESS));
			} else if (ballStarted.length === 2) {
				transitions = transitions.concat(witnessInputs(tick, LOCK_WITNESS));
			}
		}
	}
	return { outputs, frames, events, ballStarted, lastTick: tick };
}

describe('Story 3.5 QA -- on real physics: a real Ramp lights Hurry-up on ball 1, a real Lock capture starts it on ball 2, it decays on real ticks, and the ball end stops it with no award', () => {
	const run = runGame();
	const game = (tick: number) => run.outputs.get(tick)!.snapshot.game;
	const entry = (tick: number) => game(tick).modes.find((mode) => mode.mode === 'hurryup');
	const eventsOf = (type: string) => run.events.filter((event) => event.type === type);
	const [ball1, ball2, ball3] = run.ballStarted;
	const t0 = eventsOf('lock_lane_mode_start')[0]?.tick ?? -1;
	const endOfBall2 = eventsOf('ball_ended').find((event) => event.tick > t0)?.tick ?? -1;

	it('the premise: a real Start from Attract, and three balls started in one game', () => {
		expect(run.outputs.get(1)!.snapshot.game.phase, 'Attract before the Start press on tick 2').toBe('attract');
		expect(run.ballStarted, `the run reached ball 3 inside ${CAP_TICKS} ticks`).toHaveLength(3);
		expect([ball1, ball2, ball3].map((tick) => game(tick!).players[0]!.ballNumber)).toEqual([1, 2, 3]);
		expect(game(run.lastTick).players, 'one player').toHaveLength(1);
	});

	it('ball 1: the Ramp witness lights Hurry-up, and nothing starts it on ball 1', () => {
		const litAt = [...run.outputs.keys()].find((tick) => (game(tick).players[0]?.modesLit ?? []).includes('hurryup'));
		expect(litAt, 'the Ramp lit Hurry-up').toBeDefined();
		expect(litAt!, 'on ball 1').toBeLessThan(ball2!);
		expect(game(litAt! - 1).players[0]!.modesLit, 'nothing lit the tick before').toEqual([]);
		for (let tick = ball1!; tick < ball2!; tick++) {
			expect(entry(tick), `no Hurry-up entry on ball 1 (tick ${tick})`).toBeUndefined();
		}
		expect(game(ball2!).players[0]!.modesLit, 'still lit at ball 2\'s start').toEqual(['hurryup']);
	});

	it('ball 2: the Lock witness is captured and locked with no credits, and the one lit candidate -- Hurry-up -- starts on the capture tick t0', () => {
		const lockEvents = run.events.filter((event) => event.type.startsWith('lock_lane_'));
		expect(lockEvents).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t0 },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup'], selected: 'hurryup', tick: t0 },
		]);
		expect(t0).toBeGreaterThan(ball2!);
		expect(t0).toBeLessThan(ball3!);
		expect(entry(t0 - 1), 'not running before the capture').toBeUndefined();
		expect(entry(t0)).toEqual({ mode: 'hurryup', priority: MODE_PRIORITIES.hurryup, player: 0, startTick: t0, value: S, timerTicks: T });
		expect(game(t0).players[0]!.modesLit, 'the start consumed the lit Mode').toEqual([]);
		expect(game(t0).players[0]!.modesPlayed).toEqual(['hurryup']);
	});

	it('every real tick from t0 to the ball end publishes value(e) = S - (S-F)e/T and timerTicks(e) = T - e exactly', () => {
		expect((S - F) % T, 'the premise: at the defaults the line is an integer on every tick').toBe(0);
		expect(endOfBall2 - t0, 'the premise: the ball ends inside the decay, so every tick is on the line').toBeLessThan(T);
		const mismatches: string[] = [];
		for (let tick = t0; tick < endOfBall2; tick++) {
			const e = tick - t0;
			const got = entry(tick);
			const expected = { value: S - ((S - F) / T) * e, timerTicks: T - e };
			if (got?.value !== expected.value || got?.timerTicks !== expected.timerTicks) {
				mismatches.push(`${tick}: ${JSON.stringify(got)} vs ${JSON.stringify(expected)}`);
			}
		}
		expect(mismatches.slice(0, 5)).toEqual([]);
		expect(entry(t0 + 1000)?.value, 'hand literal at the defaults: 250000 - 10 * 1000').toBe(240000);
	});

	it('the ball save on ball 2 is not a ball end: Hurry-up runs straight through it, still on the line', () => {
		const saved = eventsOf('ball_saved').filter((event) => event.tick > t0 && event.tick < endOfBall2);
		expect(saved, 'the premise: ball 2\'s autolaunched ball drained inside its save').toHaveLength(1);
		const at = saved[0]!.tick;
		expect(entry(at)?.value).toBe(S - ((S - F) / T) * (at - t0));
		expect(entry(at + 1)?.timerTicks).toBe(T - (at + 1 - t0));
	});

	it('the ball end stops Hurry-up and pays nothing: the entry leaves modes[] on the ball_ended tick, and the score changes there by exactly ball_ended.total', () => {
		const ended = eventsOf('ball_ended').find((event) => event.tick === endOfBall2) as { total: number; player: number } | undefined;
		expect(ended, 'the premise: ball 2 ended after t0').toBeDefined();
		expect(ended!.player).toBe(0);
		expect(entry(endOfBall2 - 1), 'running the tick before').toBeDefined();
		expect(entry(endOfBall2)).toBeUndefined();
		const score = (tick: number) => game(tick).players[0]!.score;
		expect(score(endOfBall2) - score(endOfBall2 - 1)).toBe(ended!.total);
		for (let tick = endOfBall2; tick <= run.lastTick; tick++) {
			expect(entry(tick), `never restarted (tick ${tick})`).toBeUndefined();
		}
		expect(game(ball3!).players[0]!.modesLit, 'and not re-lit: a stopped Hurry-up is played').toEqual([]);
	});

	it('the DMD dots, folded from the loop\'s own FrameOutputs: HURRY-UP, BALL 2 and "20.0  250000" at t0; "19.0  240000" at t0+1000; no HURRY-UP and no fields line on the first score screen after the ball end', () => {
		expect(run.frames.get(t0)!.screen).toBe('score');
		expect(panel(run.frames.get(t0)!)).toEqual(['0', 'HURRY-UP', 'BALL 2', '20.0  250000']);
		expect(panel(run.frames.get(t0 + 1000)!)).toEqual(['0', 'HURRY-UP', 'BALL 2', '19.0  240000']);
		expect(panel(run.frames.get(endOfBall2 - 1)!), 'the premise: still on the panel the tick before the ball end').toContain('HURRY-UP');
		// The ball-ended screen (held BALL_ENDED_HOLD_TICKS from the ball end)
		// draws no mode rows whatever `modes[]` holds, so the read is taken on
		// the first tick the score screen is back (code review 2026-09-30).
		expect(run.frames.get(endOfBall2)!.screen, 'the premise: the ball end arms the ball-ended screen').toBe('ball_ended');
		const back = [...run.frames.keys()].find((tick) => tick > endOfBall2 && run.frames.get(tick)!.screen === 'score');
		expect(back, 'the premise: the score screen returns after the ball-ended hold').toBeDefined();
		const after = panel(run.frames.get(back!)!);
		expect(after, `the premise: ball 3's score screen at ${back}`).toContain('BALL 3');
		expect(after, `no HURRY-UP at ${back}`).not.toContain('HURRY-UP');
		expect(after.some((row) => /^\d+\.\d\s/.test(row) || /^\d{5,6}$/.test(row)), `no fields line at ${back}: ${JSON.stringify(after)}`).toBe(false);
	});
});
