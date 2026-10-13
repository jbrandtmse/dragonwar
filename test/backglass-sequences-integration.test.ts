// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.5, Integration AC (Rule 1) -- the Backglass art sequences over a
// REAL `createLoop()`, piping every real `FrameOutput` through the same order
// `src/host/boot.ts`'s `onFrame` uses: `advanceBackglass()`, then
// `advanceSequences()`, then `rasterise(composeSequence(renderFrame(...)))`.
// Frames are 16 ms (16 ticks), as a 60 Hz host delivers them, so a
// `match_drawn` usually lands INSIDE a frame and the sequence must be timed
// from the event's own tick, not the frame's.
//
// Two runs:
// 1. A cold boot: the keys screen, then the PRESS START prompt with the
//    Attract art under it, PRESS START's box unchanged.
// 2. A real game over (`test/game-over-integration.test.ts`'s idiom: hazard
//    coils off, `ballsPerGame: 1`, `matchProbability: 1`): Match art in rows
//    24-31 from `match_drawn`, none after its window and none in Attract.
//
// Two controls ride along with every frame:
// - no art: the same frame rasterised without `composeSequence()` -- what
//   `setBackglassSequencesEnabled(false)` shows;
// - events stripped: a second `advanceSequences()` fold fed the same real
//   frames with `events: []`. It must never SELECT Match (its `active` is
//   asserted, not only what it shows: a Match started without the event at
//   the drain would run its whole 2.5 s window behind the 3 s end-of-ball
//   hold and never reach a raster), while it still selects Attract, which
//   presentation raises without an event.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME, type Loop } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type BackglassView, type DmdFrame } from '../src/presentation/backglass/frame';
import { rasterise, type DmdRaster } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { activeSequenceFrame, advanceSequences, composeSequence, INITIAL_SEQUENCE_VIEW, type SequenceView } from '../src/presentation/backglass/sequences';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, FrameOutput, GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
const FRAME_MS = 16;

/** The drain must be a real one, never intercepted as a ball-save re-serve (`test/game-over-integration.test.ts`). */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 1 },
		highscores: [],
	};
}

/** One observed host frame: the composed raster and its no-art control. */
interface Observed {
	readonly output: FrameOutput;
	readonly view: BackglassView;
	readonly seq: SequenceView;
	/** The I/O "Control: events stripped" fold: the same real frames with `events: []` (the backglass view itself still folds the real output). */
	readonly strippedSeq: SequenceView;
	readonly frame: DmdFrame;
	readonly composed: DmdRaster;
	readonly plain: DmdRaster;
}

/** `boot.ts`'s `onFrame` order, replicated. */
function makeHost(loop: Loop) {
	let view = INITIAL_BACKGLASS_VIEW;
	let seq = INITIAL_SEQUENCE_VIEW;
	let strippedSeq = INITIAL_SEQUENCE_VIEW;
	return (ms: number, transitions: Parameters<Loop['advance']>[1] = []): Observed => {
		const output = loop.advance(ms, transitions);
		view = advanceBackglass(view, output);
		seq = advanceSequences(seq, view, output);
		strippedSeq = advanceSequences(strippedSeq, view, { ...output, events: [] });
		const frame = renderFrame(view, output.snapshot);
		return {
			output,
			view,
			seq,
			strippedSeq,
			frame,
			composed: rasterise(composeSequence(frame, seq, output.snapshot.tick), FONT_5X7),
			plain: rasterise(frame, FONT_5X7),
		};
	};
}

/** Dot indices where the composed raster differs from its no-art control. */
function artDots(o: Observed): number[] {
	const out: number[] = [];
	for (let i = 0; i < o.composed.dots.length; i++) {
		if (o.composed.dots[i] !== o.plain.dots[i]) {
			out.push(i);
		}
	}
	return out;
}

/** Every dot inside a text row's protected box, `[col-1, col+6n-1] x [row-1, row+7]` (authored here). */
function protectedIndices(frame: DmdFrame): Set<number> {
	const out = new Set<number>();
	for (const row of frame.rows) {
		const n = Math.min(row.text.length, 21);
		for (let r = Math.max(0, row.row - 1); r <= Math.min(31, row.row + 7); r++) {
			for (let c = Math.max(0, row.col - 1); c <= Math.min(127, row.col + 6 * n - 1); c++) {
				out.add(r * 128 + c);
			}
		}
	}
	return out;
}

const rowOf = (i: number): number => Math.floor(i / 128);

describe('Story 5.5, Integration AC -- the art sequences over a real createLoop, in boot.ts onFrame order', () => {
	it('cold boot: the keys screen shows no art; from the first PRESS START frame the Attract art appears in rows 8-31 and PRESS START\'s box is unchanged', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });
		const host = makeHost(loop);

		let keysFrames = 0;
		let promptFrames = 0;
		let firstPromptTick = -1;
		let tick = 0;
		while (tick < 9000) {
			const o = host(FRAME_MS);
			tick = o.output.snapshot.tick;
			const art = artDots(o);
			// Events stripped: a cold boot carries no keyed event, and Attract is raised by presentation, so the stripped fold is the same fold.
			expect(o.strippedSeq, `tick ${tick}: Attract does not depend on an event`).toEqual(o.seq);
			if (o.view.screen === 'attract_keys') {
				keysFrames += 1;
				expect(art, `tick ${tick}: no art on the keys screen`).toEqual([]);
				continue;
			}
			expect(o.view.screen, `tick ${tick}: cold boot pins the prompt after the keys`).toBe('attract_prompt');
			promptFrames += 1;
			if (firstPromptTick === -1) {
				firstPromptTick = tick;
				expect(o.seq.active, 'the first prompt frame starts the Attract sequence at its own tick').toEqual({ key: 'mode_attract_started', startTick: tick });
			}
			expect(art.length, `tick ${tick}: Attract art lights dots`).toBeGreaterThan(0);
			const box = protectedIndices(o.frame);
			expect(art.filter((i) => rowOf(i) < 8 || box.has(i)), `tick ${tick}: art stays in rows 8-31, outside PRESS START's box`).toEqual([]);
		}
		expect(keysFrames, 'the keys screen showed first').toBeGreaterThan(100);
		expect(firstPromptTick).toBeGreaterThanOrEqual(3000);
		expect(promptFrames, 'the prompt showed, with art, across more than one loop of the 3 s sequence').toBeGreaterThan(300);
	}, 60000);

	it('a real game over: Match art in rows 24-31 from match_drawn, timed from its tick; none after its window; none in Attract; events stripped, Match is never selected', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });
		const host = makeHost(loop);

		host(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		host(1, [{ tick: 3, frame: NO_FRAME }]);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		let matchTick = -1;
		let matchWindowFrames = 0;
		let afterWindowFrames = 0;
		let attractPromptFrames = 0;
		let reachedAttract = false;
		for (let i = 0; i < 3000 && !(reachedAttract && attractPromptFrames > 20); i++) {
			const o = host(FRAME_MS);
			const tick = o.output.snapshot.tick;
			const drawn = o.output.events.find((e) => e.type === 'match_drawn');
			if (drawn) {
				matchTick = drawn.tick;
				expect(tick, 'sanity: match_drawn lands strictly INSIDE its frame, so the frame tick and the event tick differ and timing from the wrong one fails on the next line').toBeGreaterThan(matchTick);
				expect(o.seq.active, 'Match is selected from the event, timed from event.tick').toEqual({ key: 'match_drawn', startTick: matchTick });
			}
			const art = artDots(o);
			const shown = activeSequenceFrame(o.seq, o.view.screen, tick);
			// Control: events stripped -- the same real frames never SELECT Match, and so never show or draw it.
			expect(o.strippedSeq.active?.key, `tick ${tick}: events stripped, Match is never selected`).not.toBe('match_drawn');
			expect(activeSequenceFrame(o.strippedSeq, o.view.screen, tick)?.key, `tick ${tick}: no Match without match_drawn`).not.toBe('match_drawn');
			if (o.view.screen === 'game_over') {
				expect(composeSequence(o.frame, o.strippedSeq, tick), `tick ${tick}: events stripped, game_over carries no art`).toBe(o.frame);
			}

			if (o.output.snapshot.game.phase === 'attract') {
				reachedAttract = true;
				expect(shown?.key, `tick ${tick}: no Match sequence in Attract`).not.toBe('match_drawn');
				if (o.view.screen === 'attract_prompt') {
					attractPromptFrames += 1;
					expect(shown?.key, `tick ${tick}: the PRESS START screen plays the Attract sequence`).toBe('mode_attract_started');
					expect(art.length, `tick ${tick}: Attract art lights dots`).toBeGreaterThan(0);
					// Positive for the stripped fold: it is not inert -- it selects the presentation-raised Attract exactly as the real fold does.
					expect(o.strippedSeq.active, `tick ${tick}: events stripped, Attract is still selected`).toEqual(o.seq.active);
				} else {
					expect(art, `tick ${tick}: no art on ${o.view.screen}`).toEqual([]);
				}
				continue;
			}
			// In the game and on the game-over screen, with the events stripped, NOTHING is selected (AC 2).
			expect(o.strippedSeq.active, `tick ${tick}: events stripped, nothing is selected (${o.view.screen})`).toBeNull();
			if (matchTick === -1) {
				expect(o.seq.active, `tick ${tick}: nothing is selected before match_drawn (${o.view.screen})`).toBeNull();
				expect(art, `tick ${tick}: no art before match_drawn (${o.view.screen})`).toEqual([]);
				continue;
			}
			if (tick < matchTick + 2500) {
				expect(o.view.screen).toBe('game_over');
				expect(shown).toEqual({ key: 'match_drawn', index: Math.floor((tick - matchTick) / 250) });
				expect(art.length, `tick ${tick}: Match art lights dots`).toBeGreaterThan(0);
				const box = protectedIndices(o.frame);
				expect(art.filter((d) => rowOf(d) < 24 || box.has(d)), `tick ${tick}: Match art stays in rows 24-31, outside every text box`).toEqual([]);
				matchWindowFrames += 1;
			} else {
				expect(art, `tick ${tick}: no art after the Match window`).toEqual([]);
				afterWindowFrames += 1;
			}
		}
		expect(matchTick, 'match_drawn must genuinely arrive').toBeGreaterThan(0);
		expect(matchWindowFrames, 'Match art showed for its 2.5 s window').toBeGreaterThan(140);
		expect(afterWindowFrames, 'the game_over screen continued after the window').toBeGreaterThan(100);
		expect(reachedAttract, 'the machine returned to Attract').toBe(true);
		expect(attractPromptFrames, 'positive: in Attract the PRESS START art (not Match) plays').toBeGreaterThan(20);
	}, 120000);
});
