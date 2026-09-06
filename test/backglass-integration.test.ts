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
// this exact setup, reproduced 3/3 times). Disabling those two coils is a
// real, physically legitimate configuration (AD-5: "Disabled, they act as
// passive rubber and emit no actuation"), not a mock of the drain itself.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type DmdScreen } from '../src/presentation/backglass/frame';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { CoilName, GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS: readonly CoilName[] = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'];
const MAX_TICKS = 15000;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: resolveTuning(),
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
		highscores: [],
	};
}

describe('Integration AC -- a real createLoop, Hot seat with two players, a genuine drain, piped through advanceBackglass()/renderFrame()', () => {
	it('the screen sequence passes through an in-game score screen and reaches ball_ended at the frame carrying that event, naming the PAYLOAD player', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });

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

		for (let tick = 1; tick <= MAX_TICKS; tick++) {
			const output = loop.advance(1, []);
			view = advanceBackglass(view, output);
			screenSequence.push(view.screen);
			if (output.events.some((e) => e.type === 'ball_ended')) {
				ballEndedTick = tick;
				ballEndedScreen = renderFrame(view, output.snapshot);
				break;
			}
		}

		expect(ballEndedTick, `the served ball must genuinely drain within ${MAX_TICKS} ticks -- the whole test is vacuous otherwise`).toBeGreaterThan(0);
		expect(screenSequence, 'the sequence must pass through an in-game score screen before ball_ended').toContain('score');
		expect(screenSequence[screenSequence.length - 1]).toBe('ball_ended');

		expect(ballEndedScreen!.screen).toBe('ball_ended');
		// This is the story's own sharpest discriminator (Design Notes): the
		// real loop's currentPlayer has ALREADY rotated by the time this
		// same-tick snapshot arrives, so a correct read of event.player, not
		// snapshot.game.currentPlayer, is what makes this assertion meaningful.
		expect(ballEndedScreen!.rows.some((r) => r.text === 'PLAYER 1'), 'must name PLAYER 1 (the ENDING player, 0-indexed 0, 1-indexed for display)').toBe(true);
		expect(ballEndedScreen!.rows.some((r) => r.text === 'PLAYER 2'), 'must NOT name PLAYER 2 -- that would mean reading currentPlayer post-rotation instead of the event payload').toBe(false);
	});

	it('control (Rule 19): the identical composition, with this frame\'s events emptied, never shows ball_ended -- proving the assertion above reads events, not only the snapshot', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart() });
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
