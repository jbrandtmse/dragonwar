// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.6, Integration AC (Rule 1) -- a real consumer against a real
// instance: a real createLoop, driven through Start with two players (Hot
// seat) and a genuine drain, piping each real FrameOutput through
// advanceBackglass()/renderFrame() exactly as src/host/boot.ts's onFrame
// body does. Follows test/rules-lifecycle-integration.test.ts:36-60's own
// real-loop pattern -- never a mock.
//
// The drain itself is real physics, not fabricated: c_pop_1/2/3 and
// c_sling_l/c_sling_r are disabled first (AD-5's own sanctioned coil-enable
// dev hatch -- the SAME one src/host/boot.ts exposes as
// window.__dragonwarBoot.setCoilEnabled) so the served ball's descent is
// governed by gravity and passive collision losses alone, which -- given
// this table's own "no permanent stranding" design invariant (2.1a-2.1d's
// many DW-119-class fixes) -- drains deterministically in a bounded number
// of ticks (measured during this story's own planning: ~4,278 ticks with
// this exact setup, reproduced 3/3 times). Disabling those five coils (three pops, two slingshots -- code review: this comment previously said "two") is a
// real, physically legitimate configuration (AD-5: "Disabled, they act as
// passive rubber and emit no actuation"), not a mock of the drain itself.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type DmdScreen } from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
const MAX_TICKS = 15000;

/**
 * Story 2.9: this file's own served ball drains after ~4,278 real-physics
 * ticks (this file's own header) -- comfortably inside the production
 * ball-save window (8 s default), which this story's own drain
 * interception would otherwise turn into a SAVE (re-serving the ball, never
 * emitting ball_ended) rather than the real drain this whole describe block
 * exists to exercise. An override tuning with the window and grace both
 * shrunk to near-zero keeps this file's own drain mechanism (gravity and
 * passive collision losses alone, per this file's own header) and every
 * assertion EXACTLY as Story 2.6 authored them -- only the ball-save
 * timing (incidental to what this file actually covers) changes. Passed as
 * `createLoop()`'s own `tuning` option -- the loop's ACTUAL physics/rules
 * tuning, never `GameStart.tuning` alone, which `createLoop()` embeds in
 * `GameState` but does not itself resolve from.
 */
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
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

describe('Integration AC -- a real createLoop, Hot seat with two players, a genuine drain, piped through advanceBackglass()/renderFrame()', () => {
	it('the screen sequence passes through an in-game score screen and reaches ball_ended at the frame carrying that event, naming the PAYLOAD player', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		loop.advance(1, [{ tick: 10, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 11, frame: { ...NO_FRAME, start: false } }]);

		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		let view = INITIAL_BACKGLASS_VIEW;
		const screenSequence: DmdScreen[] = [];
		let ballEndedScreen: ReturnType<typeof renderFrame> | undefined;
		let ballEndedTick = -1;
		let playersAtEnd = -1;
		let currentPlayerAtEnd = -1;
		let payloadPlayerAtEnd = -1;

		for (let iteration = 1; iteration <= MAX_TICKS; iteration++) {
			const output = loop.advance(1, []);
			view = advanceBackglass(view, output);
			screenSequence.push(view.screen);
			const ended = output.events.find((e) => e.type === 'ball_ended');
			if (ended && ended.type === 'ball_ended') {
				ballEndedTick = output.snapshot.tick;
				playersAtEnd = output.snapshot.game.players.length;
				currentPlayerAtEnd = output.snapshot.game.currentPlayer;
				payloadPlayerAtEnd = ended.player;
				ballEndedScreen = renderFrame(view, output.snapshot);
				break;
			}
		}

		expect(ballEndedTick, `the served ball must genuinely drain within ${MAX_TICKS} advances -- the whole test is vacuous otherwise`).toBeGreaterThan(0);

		// Code review: the PLAYER 1 / not-PLAYER 2 pair below only discriminates
		// payload-from-snapshot if Hot seat genuinely added a second player AND
		// currentPlayer genuinely rotated off the ending player. If Hot seat
		// ever regressed to a single player, `nextPlayer` would wrap to 0, the
		// two sources would AGREE, `PLAYER 1` would still be correct, and a
		// snapshot-reading implementation would pass silently. This story's own
		// unit sibling guards exactly this (test/backglass-frame.test.ts:89-90);
		// the Integration AC did not.
		expect(playersAtEnd, 'Hot seat must have genuinely added a second player, or the payload/snapshot discriminator below is vacuous').toBe(2);
		expect(payloadPlayerAtEnd, 'the ENDING player must be player 0').toBe(0);
		expect(currentPlayerAtEnd, 'currentPlayer must have genuinely rotated off the ending player by the time this same-frame snapshot arrives').not.toBe(payloadPlayerAtEnd);

		expect(screenSequence, 'the sequence must pass through an in-game score screen before ball_ended').toContain('score');
		// Code review: assert the ball_ended screen appears ONCE, at the end --
		// `expect(last).toBe('ball_ended')` alone was tautological, since the
		// loop pushes `view.screen` and breaks on that same iteration.
		expect(screenSequence[screenSequence.length - 1]).toBe('ball_ended');
		expect(
			screenSequence.slice(0, -1).includes('ball_ended'),
			'ball_ended must appear only at the frame carrying the event, never before it',
		).toBe(false);

		expect(ballEndedScreen!.screen).toBe('ball_ended');
		// This is the story's own sharpest discriminator (Design Notes): the
		// real loop's currentPlayer has ALREADY rotated by the time this
		// same-tick snapshot arrives, so a correct read of event.player, not
		// snapshot.game.currentPlayer, is what makes this assertion meaningful.
		expect(ballEndedScreen!.rows.some((r) => r.text === 'PLAYER 1'), 'must name PLAYER 1 (the ENDING player, 0-indexed 0, 1-indexed for display)').toBe(true);
		expect(ballEndedScreen!.rows.some((r) => r.text === 'PLAYER 2'), 'must NOT name PLAYER 2 -- that would mean reading currentPlayer post-rotation instead of the event payload').toBe(false);

		// Code review: the Integration AC stopped one call short of the
		// composition src/host/boot.ts:236 actually runs -- it is
		// `rasterise(renderFrame(...), FONT_5X7)`, not `renderFrame` alone. Take
		// the real loop's own end-of-ball frame all the way to lit dots, so the
		// frame -> raster leg is exercised against real loop output and not only
		// against synthetic frames.
		const realRaster = rasterise(ballEndedScreen!, FONT_5X7);
		expect(realRaster.dots.length).toBe(realRaster.cols * realRaster.rows);
		expect(
			realRaster.dots.some((d) => d === 1),
			'the real end-of-ball frame must actually light dots once rasterised -- a blank panel is the failure this pins',
		).toBe(true);
	});

	it('control (Rule 19): the identical composition, with this frame\'s events emptied, never shows ball_ended -- proving the assertion above reads events, not only the snapshot', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });
		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		let view = INITIAL_BACKGLASS_VIEW;
		let sawBallEndedEvent = false;
		for (let tick = 1; tick <= MAX_TICKS; tick++) {
			const output = loop.advance(1, []);
			if (output.events.some((e) => e.type === 'ball_ended')) {
				sawBallEndedEvent = true;
				// The SAME snapshot the real event carried, but events emptied --
				// the composition src/host/boot.ts would never actually construct,
				// used only to prove the discriminator.
				view = advanceBackglass(view, { ...output, events: [] });
				break;
			}
			view = advanceBackglass(view, output);
		}

		expect(sawBallEndedEvent, 'sanity: the real run must still have produced the event this control strips').toBe(true);
		expect(view.screen, 'with events emptied, the ball_ended screen must never be selected').not.toBe('ball_ended');
	});
});
