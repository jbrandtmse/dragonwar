// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13, QA pass (epic-cycle stage: qa) -- a seam AC 3's own headless
// twin tests (`test/rules-match.test.ts`) never cross: those tests script
// `close('s_start')`/`close('s_trough_1')` directly against `runRulesScript`
// and read `ballsInPlay`/`players[0].ballNumber` off the RULES state alone --
// proof that the ball controller INTENDS to serve a ball, never proof a ball
// genuinely reaches the shooter lane and launches through real physics. This
// file drives a REAL `createLoop()` to a REAL game over (a genuine gravity
// drain, `test/game-over-integration.test.ts`'s own DISABLED_HAZARD_COILS/
// dev-autolaunch idiom), then presses Start before and at/after the
// resolution tick R, and follows the resulting new game's ball 1 through
// REAL physics: the trough's slot count, `bd_shooter`'s own switch, and a
// manual plunge's `ball_launched` -- proving DW-244's "every ball start
// clears stray balls itself" clause runs on the ORDINARY post-Match restart
// path too, not only the Slam-voided routes `test/stray-clear-integration.test.ts`
// already pins, and that it never stacks a second ball onto the new game's
// first serve.
//
// `-integration.test.ts`-suffixed, so `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES ratchet excludes it (it does not match `test/rules-*.test.ts`).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const DISABLED_HAZARD_COILS = ['c_pop_1', 'c_pop_2', 'c_pop_3', 'c_sling_l', 'c_sling_r'] as const;

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Same reasoning as every other real-drain test in this suite: the drain must be real, never intercepted as a ball-save re-serve. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: NO_BALL_SAVE_TUNING,
		// ballsPerGame: 1 and matchProbability: 0 -- a single-ball game reaches
		// game over on the served ball's own drain, and a guaranteed loss keeps
		// this test's own focus (the restart, not the Match outcome) simple.
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 0 },
		highscores: [],
	};
}

describe('Story 2.13, QA seam -- Start is ignored strictly before R and honoured at/after it, and the new game serves exactly one ball with the stray clear running', () => {
	it('a real game over, a real R-5 Start ignored, a real Start at R starting a new game whose ball 1 genuinely reaches the lane and launches, with no stacking', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: NO_BALL_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: NO_FRAME }]);
		for (const coil of DISABLED_HAZARD_COILS) {
			loop.setCoilEnabled(coil, false);
		}
		loop.pulseCoil('c_autolaunch');

		// Find G: the real drain that ends the only ball of the only player.
		let out = loop.advance(1, []);
		let G = -1;
		for (let i = 0; i < 20000 && G === -1; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_ended')) {
				G = out.snapshot.tick;
			}
		}
		expect(G, 'the served ball must genuinely drain, or this test is vacuous').toBeGreaterThan(0);
		expect(out.snapshot.game.phase).toBe('game_over');

		// Production timeline literals, authored here (never re-imported from
		// tuning.ts): matchDelayTicks 5000, ten reveal steps at 250 each = 2500.
		const R = G + 5000 + 2500;

		// A real Start press at R-5, released two ticks later -- must be
		// ignored: no ball_will_start, phase stays game_over, and (the
		// physics-level positive this headless-only claim never checked) no
		// ball ever appears on the table because of it.
		while (out.snapshot.tick < R - 6) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: R - 5, frame: { ...NO_FRAME, start: true } }]);
		expect(out.events.some((e) => e.type === 'ball_will_start'), 'a Start strictly before R must be ignored').toBe(false);
		expect(out.snapshot.game.phase, 'phase must still read game_over at R-5').toBe('game_over');
		out = loop.advance(1, [{ tick: R - 3, frame: NO_FRAME }]);
		// The negative, carried through to R: nothing serves from the ignored press.
		while (out.snapshot.tick < R - 1) {
			out = loop.advance(1, []);
			expect(out.snapshot.balls, `no ball may appear before R from the ignored R-5 press (tick ${out.snapshot.tick})`).toHaveLength(0);
		}

		// A fresh Start press exactly at R -- honoured. This is the positive
		// proving the screen genuinely changed because of THIS press, not the
		// earlier ignored one.
		out = loop.advance(1, [{ tick: R, frame: { ...NO_FRAME, start: true } }]);
		expect(out.events.some((e) => e.type === 'ball_will_start'), 'a Start at R must be honoured').toBe(true);
		expect(out.snapshot.game.phase).toBe('game');
		expect(out.snapshot.game.players).toHaveLength(1);
		expect(out.snapshot.game.players[0]!.score).toBe(0);
		expect(out.snapshot.game.players[0]!.ballNumber).toBe(1);
		expect(out.snapshot.game.machine.ballsInPlay, 'DW-244: ballsInPlay is zeroed on the Start tick itself').toBe(0);
		out = loop.advance(1, [{ tick: R + 1, frame: NO_FRAME }]);

		// The physics-level positive: the new game's own stray clear (always
		// issued, task 5(c)) runs and a real ball genuinely settles into
		// bd_shooter -- exactly one ball, never two, despite the
		// unconditional RecoverCommand this same startBall() call issues.
		let settledAt = -1;
		for (let i = 0; i < 500 && settledAt === -1; i++) {
			out = loop.advance(1, []);
			if (out.snapshot.mechanisms.devices.bd_shooter.slots[0]) {
				settledAt = out.snapshot.tick;
			}
		}
		expect(settledAt, 'the new game\'s ball 1 must genuinely reach the shooter lane through real physics').toBeGreaterThan(0);
		expect(out.snapshot.balls, 'exactly one ball on the table -- the stray clear\'s always-issued RecoverCommand never stacks a second one when nothing is loose').toHaveLength(1);
		expect(out.snapshot.mechanisms.devices.bd_trough.slots.filter(Boolean).length, 'the trough conserves its own count: no phantom ball invented or destroyed').toBe(3);

		// The manual plunge -- the positive that this physically-served ball
		// really launches and plays as ball 1 of the new game.
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 1199; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let sawLaunch = false;
		for (let i = 0; i < 500 && !sawLaunch; i++) {
			out = loop.advance(1, []);
			if (out.events.some((e) => e.type === 'ball_launched')) {
				sawLaunch = true;
			}
		}
		expect(sawLaunch, 'the plunge must genuinely launch the new game\'s served ball').toBe(true);
		expect(out.snapshot.game.currentPlayer).toBe(0);
		expect(out.snapshot.game.players[0]!.ballNumber).toBe(1);
		expect(out.snapshot.game.machine.ballsInPlay).toBe(1);
		expect(out.snapshot.balls, 'still exactly one ball -- no stacking anywhere across the whole restart').toHaveLength(1);
	}, 60000);
});
