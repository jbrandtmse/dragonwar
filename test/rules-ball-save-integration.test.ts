// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.9, AC 8 (Rule 1 -- Integration): the ONE consumer-tier test for
// `l_ball_save` -- a real `createLoop({ collisionDoc, gameStart })`, a real
// `s_start` press and a real plunge (mirroring
// `test/rules-lifecycle-integration.test.ts`'s own proven recipe: the dev
// `pulseCoil('c_autolaunch')` hatch drives the SAME coil a live player's
// plunge would eventually reach), proving `lampsOf()` + `sim/loop`'s own
// lamp diff produce an OBSERVABLE `LampCommand` stream on `FrameOutput`, not
// merely a `machine.ballSave` field -- asserted on the loop's own command
// stream (AC 8's own wording), never by reading `machine.ballSave` directly.
//
// A `*-integration.test.ts` file (this file's own name): exempt, by the
// established naming convention, from `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES/headless-closure gate (mirrors
// `rules-lifecycle.test.ts`/`rules-lifecycle-integration.test.ts`'s own
// split) -- this file drives `sim/loop` and real physics on purpose, so it
// could never satisfy that gate's own headless claim, and does not try to.
//
// `ballSaveMs`/`ballSaveHurryUpMs` are overridden to a tiny window here
// (100 / 40 ticks) purely so the test does not need to run the production
// 8 s window in real physics ticks -- every OTHER tunable, and the plunge
// mechanics themselves, are untouched production values, matching this
// file's own "real physics" claim.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { GameStart } from '../src/sim/table/names';
import type { LampCommand } from '../src/sim/contracts/commands';
import type { ResolvedTuning } from '../src/sim/table/tuning';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

const FAST_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 100 },
	ballSaveHurryUpMs: { ...RAW_TUNING.ballSaveHurryUpMs, value: 40 },
});

function gameStart(): GameStart {
	return {
		seed: 0,
		tuning: FAST_BALL_SAVE_TUNING,
		adjustments: { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 },
		highscores: [],
	};
}

describe('Story 2.9, AC 8 -- Integration: a real createLoop, the ball-save insert drives a real LampCommand stream', () => {
	it('l_ball_save projects lit/1 at the plunge, later lit/3 in the hurry-up span, and finally off/0 past the displayed expiry -- observed on FrameOutput.commands, and no tick of the run carries more than two LampCommands', () => {
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: gameStart(), tuning: FAST_BALL_SAVE_TUNING });

		const lampCommands: LampCommand[] = [];
		const commandCountByTick = new Map<number, number>();
		let ballLaunchedTick: number | null = null;

		function advanceAndCollect(): void {
			const out = loop.advance(1, []);
			for (const cmd of out.commands) {
				// Code review (Story 2.9): count LAMP commands only. AC 8's own
				// wording, and the pre-existing sibling this mirrors
				// (test/lighting-integration.test.ts), both cap LampCommands per
				// tick; counting every PresentationCommand made the cap stricter
				// than the criterion and the failure message untrue, so an
				// unrelated Gi/Flasher/Show command landing on a lane-rotation
				// tick would redden a ball-save test for a reason it does not
				// intend to constrain.
				if (cmd.type !== 'lamp') continue;
				commandCountByTick.set(cmd.tick, (commandCountByTick.get(cmd.tick) ?? 0) + 1);
				if (cmd.lamp === 'l_ball_save') {
					lampCommands.push(cmd);
				}
			}
			for (const event of out.events) {
				if (event.type === 'ball_launched' && ballLaunchedTick === null) {
					ballLaunchedTick = event.tick;
				}
			}
		}

		// Boot (tick 1), a real s_start press (tick 2), the eject (tick 3) --
		// the identical recipe test/rules-lifecycle-integration.test.ts's own
		// AC 8 test already proves works.
		advanceAndCollect();
		{
			const out = loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
			for (const cmd of out.commands) {
				if (cmd.type !== 'lamp') continue;
				commandCountByTick.set(cmd.tick, (commandCountByTick.get(cmd.tick) ?? 0) + 1);
				if (cmd.lamp === 'l_ball_save') lampCommands.push(cmd);
			}
		}
		advanceAndCollect(); // tick 3: the served ball is ejected from the trough

		// The served ball rests in the shooter lane until it plunges (AD-6);
		// drive the SAME c_autolaunch coil a live player's plunge would
		// eventually reach, through the general-purpose dev hatch.
		loop.pulseCoil('c_autolaunch');
		for (let i = 0; i < 320; i++) {
			advanceAndCollect();
		}
		expect(ballLaunchedTick, 'the plunge must have genuinely fired within the travel window this recipe already proves sufficient').not.toBeNull();

		// Run well past the (tiny, overridden) ball-save window's own displayed
		// expiry -- 100 ticks of window plus a generous margin for the hurry-up
		// span and the off transition to both land inside the observed run.
		for (let i = 0; i < 200; i++) {
			advanceAndCollect();
		}

		const step1 = lampCommands.filter((c) => c.role === 'lit' && c.step === 1);
		const step3 = lampCommands.filter((c) => c.role === 'lit' && c.step === 3);
		const off = lampCommands.filter((c) => c.role === 'off' && c.step === 0);

		expect(step1.length, 'a lit/1 LampCommand must appear at the plunge').toBeGreaterThan(0);
		// Code review (Story 2.9): `ballLaunchedTick` was asserted non-null and
		// then never used, so "at the plunge" was pinned by nothing -- the
		// assertion above only proved a lit/1 existed SOMEWHERE in a ~520-tick
		// run. Tie it to the real plunge tick the loop reported.
		expect(Math.min(...step1.map((c) => c.tick)), 'the first lit/1 must not precede the plunge that arms the window').toBeGreaterThanOrEqual(
			ballLaunchedTick!,
		);
		expect(step3.length, 'a lit/3 LampCommand must appear in the hurry-up span').toBeGreaterThan(0);
		expect(off.length, 'an off/0 LampCommand must appear once the displayed window has passed').toBeGreaterThan(0);

		expect(Math.min(...step3.map((c) => c.tick)), 'every step-3 tick must be later than every step-1 tick').toBeGreaterThan(
			Math.max(...step1.map((c) => c.tick)),
		);
		expect(Math.min(...off.map((c) => c.tick)), 'the off transition must be later than every step-3 tick').toBeGreaterThan(
			Math.max(...step3.map((c) => c.tick)),
		);

		for (const [tick, count] of commandCountByTick) {
			expect(count, `tick ${tick} carried ${count} LampCommands -- no tick of the run may carry more than two`).toBeLessThanOrEqual(2);
		}
	});

	// Code review (Story 2.9, Rule 3 / AC 3): until this test existed, NOTHING
	// in the suite proved a saved ball actually comes back. The headless AC 3/4
	// test asserts only that two CoilCommand objects are in the right tick's
	// batch, and it SCRIPTS the re-served ball's arrival with a hand-written
	// `close('s_shooter_lane')` -- so a save that suppressed `ball_ended` and
	// then served nothing (the re-serve pulse is issued on the drain tick
	// itself, the same tick the drained ball parks and deriveDeviceSlots()
	// updates) would have left the game hung at ballsInPlay 0 with the suite
	// 1854 green. This drives a REAL drain through real physics and asserts the
	// ball genuinely returns to play. Measured: the drain lands at tick ~4273
	// under seed 0 and the whole run costs well under a second.
	it('a REAL physics drain inside the window is saved and the ball genuinely returns to play -- ballsInPlay goes back to 1, and no ball_ended is emitted', () => {
		// A window long enough that any realistic natural drain time falls
		// inside it -- this test is about the save CHAIN, not about the
		// production window's length (AC 9 owns that), so it must not be
		// coupled to how fast this particular geometry drains.
		const LONG_SAVE_TUNING = resolveTuning({
			...RAW_TUNING,
			ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 60000 },
		});
		const start: GameStart = { ...gameStart(), tuning: LONG_SAVE_TUNING };
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: start, tuning: LONG_SAVE_TUNING });

		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, [{ tick: 3, frame: { ...NO_FRAME, start: false } }]);
		loop.pulseCoil('c_autolaunch');

		let savedTick = -1;
		let endedTick = -1;
		let ballsInPlayAfterSave = -1;

		for (let i = 1; i <= 20000; i++) {
			const out = loop.advance(1, []);
			for (const event of out.events) {
				if (event.type === 'ball_saved' && savedTick < 0) savedTick = out.snapshot.tick;
				if (event.type === 'ball_ended' && endedTick < 0) endedTick = out.snapshot.tick;
			}
			if (savedTick > 0 && out.snapshot.game.machine.ballsInPlay > 0) {
				ballsInPlayAfterSave = out.snapshot.game.machine.ballsInPlay;
				break;
			}
		}

		expect(savedTick, 'the served ball must genuinely drain and be saved -- the whole test is vacuous otherwise').toBeGreaterThan(0);
		expect(endedTick, 'a save must never also end the ball').toBe(-1);
		expect(
			ballsInPlayAfterSave,
			'the save must put a ball BACK INTO PLAY through real physics -- a ball_saved that serves nothing hangs the game at ballsInPlay 0',
		).toBe(1);
	});

	// Rework iteration 1 (DW-218), Rule 3 (real-runtime evidence): code review
	// measured a real createLoop + real physics run at PRODUCTION tuning,
	// seed 0, no player input beyond each ball's own mechanical plunge --
	// 28 `ball_saved` and ZERO `ball_ended` in 120,000 ticks, because a
	// save's own deferred-autolaunch re-serve ALSO opened `s_shooter_lane`
	// and its resulting `ball_launched` re-armed a fresh full window, over
	// and over, forever -- ball 2, the bonus, rotation, game over and Match
	// were all unreachable. The fix is a closure-held discriminator
	// (`awaitingSaveRelaunch`, `ball-controller.ts`) that only a genuine
	// PLAYER plunge arms. This is the "passing form" of that measurement:
	// the property survives as a real, committed test, not merely an
	// observation made once during review.
	it('DW-218 regression guard -- PRODUCTION tuning, real physics, seed 0, no player input beyond each ball\'s own plunge: the game reaches game_over instead of looping forever on a single ball\'s own re-serve', () => {
		const PRODUCTION_TUNING = resolveTuning();
		const start: GameStart = { ...gameStart(), tuning: PRODUCTION_TUNING };
		const loop = createLoop({ collisionDoc: loadDoc(), gameStart: start, tuning: PRODUCTION_TUNING });

		loop.advance(1, []); // boot
		loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
		loop.advance(1, []); // tick 3: the served ball is ejected from the trough
		loop.pulseCoil('c_autolaunch'); // ball 1 plunge -- the only STANDING dev-hatch stimulus; every later ball gets its OWN, below

		const saved: number[] = [];
		const ended: number[] = [];
		let finalPhase: string = 'game';
		let plungeInNTicks = -1; // -1 = none pending

		// Measured at this tree, seed 0, production tuning: ball_saved at ticks
		// 4276/8575 (ball 1), 17120/21419 (ball 2), 29964/34263 (ball 3);
		// ball_ended at 12849/25693/38537; game_over reached well inside the
		// 60,000-tick budget below. Pre-fix (DW-218): 28 ball_saved and ZERO
		// ball_ended in 120,000 ticks -- phase never left "game".
		for (let i = 0; i < 60_000; i++) {
			const out = loop.advance(1, []);
			for (const event of out.events) {
				if (event.type === 'ball_saved') saved.push(out.snapshot.tick);
				if (event.type === 'ball_ended') ended.push(out.snapshot.tick);
				if (event.type === 'ball_started') {
					// A NEW ball (rotation, via startBall()): the DW-218 fix means it
					// must be independently plunged -- there is no more self-
					// sustaining re-serve loop to ride on. One settle tick after the
					// trough-eject, mirroring the very first plunge's own tick-2 to
					// tick-3 gap above.
					plungeInNTicks = 1;
				}
			}
			finalPhase = out.snapshot.game.phase;
			if (plungeInNTicks > 0) {
				plungeInNTicks -= 1;
				if (plungeInNTicks === 0) {
					loop.pulseCoil('c_autolaunch');
				}
			}
			if (finalPhase === 'game_over') break;
		}

		expect(
			finalPhase,
			'the game must reach game_over within the tick budget -- pre-fix this looped on a single ball forever and never left phase "game"',
		).toBe('game_over');
		// Review pass (rework iteration 1, blind-hunter + verification-gap,
		// independently): `saved.length` alone bounded only loosely (< 10)
		// while the exact value (6 -- two saves per ball, three balls) was
		// already known and measured identically twice (implementer's own
		// scratchpad and the build-auto stage's independent 120,000-tick
		// re-run). A partial regression reintroducing a few extra re-arms
		// (e.g. 7-9 saves) would have slipped past the old bound undetected.
		// Pinned to the exact tick sequences now -- deterministic under seed 0
		// with no player input, so this is a precise, non-flaky pin, not a
		// magic number.
		expect(saved, 'the exact save-tick sequence, matching two independent measurements at this tree').toEqual([
			4276, 8575, 17120, 21419, 29964, 34263,
		]);
		expect(ended, 'all three balls must genuinely end, at the exact measured ticks').toEqual([12849, 25693, 38537]);
	});

	// Rework iteration 1 (DW-218), verification bar: "Without the control, a
	// 'no more infinite saves' result is indistinguishable from a harness that
	// stopped seeing events at all -- which is precisely how this defect
	// survived the first pass." The control is a SHORT window -- independently
	// authored literals (500 ms / 100 ms grace), never read back from the
	// production tunable -- run against the IDENTICAL seed-0 physics as the
	// regression guard above. Both runs share the same setup, so they reach
	// the same first real-physics drain at the same tick; only the window's
	// length decides whether that drain is a save or an ending. Proves the
	// passing production-tuning test above is measuring a real effect, not a
	// harness that stopped delivering events.
	it('DW-218 regression control -- a SHORT ball-save window (ballSaveMs 500 / grace 100) still ends the ball at the SAME real-physics drain tick the production window saves, with zero saves', () => {
		const SHORT_SAVE_TUNING = resolveTuning({
			...RAW_TUNING,
			ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 500 },
			ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 100 },
		});
		const PRODUCTION_TUNING = resolveTuning();

		function firstDrain(tuning: ResolvedTuning): { savedTick: number; endedTick: number } {
			const start: GameStart = { ...gameStart(), tuning };
			const loop = createLoop({ collisionDoc: loadDoc(), gameStart: start, tuning });

			loop.advance(1, []); // boot
			loop.advance(1, [{ tick: 2, frame: { ...NO_FRAME, start: true } }]);
			loop.advance(1, []); // tick 3: the served ball is ejected from the trough
			loop.pulseCoil('c_autolaunch'); // the one, identical plunge stimulus both runs share

			let savedTick = -1;
			let endedTick = -1;
			for (let i = 0; i < 20_000; i++) {
				const out = loop.advance(1, []);
				for (const event of out.events) {
					if (event.type === 'ball_saved' && savedTick < 0) savedTick = out.snapshot.tick;
					if (event.type === 'ball_ended' && endedTick < 0) endedTick = out.snapshot.tick;
				}
				if (savedTick > 0 || endedTick > 0) break;
			}
			return { savedTick, endedTick };
		}

		const production = firstDrain(PRODUCTION_TUNING);
		const control = firstDrain(SHORT_SAVE_TUNING);

		expect(
			production.savedTick,
			'sanity: the production window must genuinely save the first natural drain -- the regression guard above depends on this',
		).toBeGreaterThan(0);
		expect(production.endedTick, 'sanity: the production window must not end the ball on its first natural drain').toBe(-1);

		expect(control.savedTick, 'a 500ms/100ms window is far shorter than the table\'s natural drain interval, so it must NOT save').toBe(-1);
		expect(
			control.endedTick,
			'the short window must end the ball at the SAME real-physics drain tick the production window saved -- proving both runs saw the identical event, and only the window length changed the outcome',
		).toBe(production.savedTick);
	});
});
