// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5: the headless scripted tests for every I/O-matrix row, driven
// through `runRulesScript()` (`test/util/switch-script.ts`, task 11) -- the
// ball controller's own `GameState` lifecycle (AD-6, AD-7, AD-18), never a
// raw switch (AD-19). No physics, no rendering, no `sim/loop` (AC 9, pinned
// transitively by `test/rules-devices-headless.test.ts`, task 13).
//
// Every negative AC carries its positive control in the SAME `it()`
// (`test/rules-devices.test.ts:109-127` and `:401-424`'s proven shapes, Rule
// 19) -- a run that never grew `players` at all could not distinguish "the
// cap works" from "nothing works".

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { BALL_SAVE_SOURCE, HARDWARE_COILS } from '../src/sim/rules/ball-controller';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, open, runRulesScript } from './util/switch-script';
import type { GameState } from '../src/sim/table/names';

const TROUGH_EJECT_COIL = TABLE.ballDevices.bd_trough.ejectCoil;

/**
 * Story 2.9: several scripts below launch and drain the SAME ball only a
 * few ticks apart -- comfortably inside the production ball-save window,
 * which this story's own drain interception would otherwise turn into a
 * SAVE (re-serving the same ball, never rotating/ending it) rather than the
 * real drain/rotate/game-over this file's whole point is to exercise. An
 * override tuning with the window and grace both shrunk to near-zero keeps
 * every scripted tick number, and every assertion, EXACTLY as Story 2.5
 * authored them -- only the ball-save timing (incidental to what these
 * tests actually cover) changes.
 */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

/** A fresh empty player, mirroring `ball-controller.ts`'s own `emptyPlayer()` -- duplicated here (test-local) rather than exported from production code purely for test convenience. */
function emptyPlayer(ballNumber: number) {
	return {
		score: 0,
		letters: '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 },
		lanes: { lit: {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [] as string[],
		ballNumber,
	};
}

describe('Story 2.5 -- AC 2: Start from Attract', () => {
	it('phase becomes game, exactly one player is created, ball_will_start -> ball_starting -> ball_started in order, hardwareEnabled true from ball_starting, exactly one c_trough_eject pulse', () => {
		const result = runRulesScript(close('s_start').at(5).build(), { durationTicks: 5 });
		const after = result.statesByTick.get(5)!;

		expect(after.phase).toBe('game');
		expect(after.players).toHaveLength(1);
		expect(after.machine.hardwareEnabled, 'hardwareEnabled must be true from ball_starting (it boots false)').toBe(true);

		const tick5Events = result.events.filter((e) => e.tick === 5).map((e) => e.type);
		// Story 2.9, AC 1: ball_starting also enables ball save -- ball_save_enabled
		// now lands between ball_starting and ball_started, every time.
		expect(tick5Events).toEqual(['ball_will_start', 'ball_starting', 'ball_save_enabled', 'ball_started']);

		const troughPulses = result.coilCommands.filter((c) => c.coil === TROUGH_EJECT_COIL && c.action === 'pulse');
		expect(troughPulses, 'exactly one c_trough_eject pulse').toHaveLength(1);
	});

	// Review finding 2026-09-06 (blind-hunter): the serve-pulse assertion above
	// does not, by itself, prove `startBall()`'s SEPARATE `enable` batch
	// (`...HARDWARE_COILS.map(...)`) survived -- a mutation that dropped only
	// that spread would leave the trough-pulse assertion untouched. Asserted
	// against `HARDWARE_COILS` itself (never a hand-typed coil list, DW-149).
	it('ball_starting also enables every AD-5 hardware coil, as its own enable CoilCommand batch, distinct from the serve pulse', () => {
		const result = runRulesScript(close('s_start').at(5).build(), { durationTicks: 5 });

		const enabledCoils = new Set(
			result.coilCommands.filter((c) => c.tick === 5 && c.action === 'enable').map((c) => c.coil),
		);
		for (const coil of HARDWARE_COILS) {
			expect(enabledCoils.has(coil), `${coil} must receive an enable CoilCommand on ball_starting`).toBe(true);
		}
		expect(HARDWARE_COILS.length, 'sanity: the hardware set is non-empty, or the loop above is vacuous').toBeGreaterThan(0);
	});
});

describe('Story 2.5 -- AC 3: Hot seat add players, with the fifth-press positive control', () => {
	it('four presses each grow players by exactly one; a fifth (in the same test, proving the harness CAN add) leaves it at 4', () => {
		const script = close('s_start').at(5).at(15).at(25).at(35).at(45).build();
		const result = runRulesScript(script, { durationTicks: 50 });

		expect(result.statesByTick.get(5)!.players).toHaveLength(1);
		expect(result.statesByTick.get(15)!.players).toHaveLength(2);
		expect(result.statesByTick.get(25)!.players).toHaveLength(3);
		expect(result.statesByTick.get(35)!.players).toHaveLength(4);
		expect(result.statesByTick.get(45)!.players, 'a fifth press must not grow players past 4').toHaveLength(4);
	});
});

describe('Story 2.5 -- AC 4: Start after ball 1 has ended does nothing, with its own before/after control', () => {
	it('an identical Start script grows players BEFORE the drain and does not AFTER it, with at least one tick simulated past the drain', () => {
		const script = close('s_start').at(5)
			.at(8)
			.open('s_shooter_lane').at(10)
			.close('s_trough_1').at(20)
			.close('s_start').at(30)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, tuning: NO_BALL_SAVE_TUNING });

		expect(result.statesByTick.get(5)!.players).toHaveLength(1);
		expect(result.statesByTick.get(8)!.players, 'before the drain, an identical Start press grows players (positive control)').toHaveLength(2);
		expect(result.statesByTick.get(20)!.currentPlayer, 'ball 1 has ended and rotated').toBe(1);
		expect(result.statesByTick.get(30)!.players, 'after ball 1 has ended, an identical Start press must not grow players').toHaveLength(2);
	});

	// Review finding 2026-09-06 (verification-gap): the guard is
	// `players.length < 4 && currentPlayer === 0 && players[0]?.ballNumber === 1`.
	// The test above is a 2-PLAYER script, where the post-drain press already
	// sits with `currentPlayer === 1` -- so the `currentPlayer === 0` conjunct
	// alone blocks it, and the `ballNumber === 1` conjunct is never actually
	// exercised there (confirmed by mutation: removing only that conjunct left
	// the test above green). A SINGLE-player game exercises the OTHER conjunct:
	// ball 1 draining wraps back to the SAME player (`currentPlayer` stays 0)
	// for ball 2, so only `ballNumber === 1` still closes the window.
	it('single-player wrap-around: after ball 1 drains and rotates back to the SAME player for ball 2 (currentPlayer stays 0), a further Start press does not add a second player -- with a same-test positive control proving the harness can add before any drain', () => {
		// Positive control: an identical Start press BEFORE any drain (ball 1 still active, currentPlayer 0, ballNumber 1) DOES add a player.
		const control = runRulesScript(close('s_start').at(5).at(8).build(), { durationTicks: 8 });
		expect(control.statesByTick.get(8)!.players, 'before any drain, an identical Start press grows players (positive control)').toHaveLength(2);

		// Experiment: exactly one player throughout -- ball 1 drains and wraps back to the SAME player (ball 2), never rotating to a second player.
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(10)
			.close('s_trough_1').at(20)
			.close('s_start').at(30)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, tuning: NO_BALL_SAVE_TUNING });

		expect(result.statesByTick.get(20)!.currentPlayer, 'wraps back to the SAME player for ball 2 (single-player game)').toBe(0);
		expect(result.statesByTick.get(20)!.players[0]!.ballNumber, 'ball 2 begins for the only player').toBe(2);
		expect(result.statesByTick.get(30)!.players, 'a single-player wrap-around must not reopen the Hot-seat window').toHaveLength(1);
	});
});

describe('Story 2.5 -- Player rotation', () => {
	it('2 players: player 1\'s ball 1 ends -> currentPlayer becomes 1 and player 2\'s ball 1 starts', () => {
		const script = close('s_start').at(5)
			.at(8)
			.open('s_shooter_lane').at(10)
			.close('s_trough_1').at(20)
			.build();
		const result = runRulesScript(script, { durationTicks: 25, tuning: NO_BALL_SAVE_TUNING });

		const after = result.statesByTick.get(20)!;
		expect(after.currentPlayer).toBe(1);
		expect(after.players[1]!.ballNumber).toBe(1);
		// Story 2.9, AC 1: ball_save_enabled now lands between ball_starting and ball_started, every time.
		expect(result.events.filter((e) => e.tick === 20).map((e) => e.type)).toEqual([
			'ball_ended',
			'ball_will_start',
			'ball_starting',
			'ball_save_enabled',
			'ball_started',
		]);
	});
});

describe('Story 2.5 -- AC 5: drain, mode teardown, ball end and rotation', () => {
	it('the stub mode is present before the drain and gone after; teardown is credited to the ENDING player (pinning it strictly before the rotation); ball_will_start resets ballSave/tilt/multiball', () => {
		const initialState: GameState = {
			tick: 0,
			phase: 'game',
			machine: {
				ballsInPlay: 1,
				hardwareEnabled: true,
				ballSave: { untilTick: 500, sources: ['test'] },
				tilt: { tilted: true, slamTilted: false },
				multiball: 'quickmb',
				highscores: [],
				deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
			},
			players: [emptyPlayer(1), emptyPlayer(0)],
			currentPlayer: 0,
			modes: [{ mode: 'stub', priority: 100, player: 0 }],
			rng: 0,
		};
		expect(initialState.modes, 'the stub is present BEFORE the drain').toHaveLength(1);

		const result = runRulesScript(close('s_trough_4').at(1).build(), { durationTicks: 1, initialState });
		const after = result.finalState;

		expect(after.modes, 'modes[] must be empty AFTER the drain').toEqual([]);
		expect(after.players[0]!.modesPlayed, 'the ENDING player (0) is credited').toEqual(['stub']);
		expect(after.players[1]!.modesPlayed, 'the other player is NOT credited').toEqual([]);

		const ballEnded = result.events.filter((e) => e.type === 'ball_ended');
		expect(ballEnded).toHaveLength(1);
		expect(ballEnded[0]).toMatchObject({ type: 'ball_ended', player: 0 });

		expect(after.currentPlayer, 'rotates to player 1').toBe(1);
		// Story 2.9: `ball_will_start` resets ballSave, but the SAME rotation's
		// own `ball_starting` (for player 1's new ball) immediately re-enables
		// it (AC 1) -- both happen inside the same drain tick, so the NET
		// result carries the controller's own source, not an empty list.
		expect(after.machine.ballSave, 'ball_will_start resets ballSave, then ball_starting re-enables it for the new ball').toEqual({
			untilTick: null,
			sources: [BALL_SAVE_SOURCE],
		});
		expect(after.machine.tilt, 'ball_will_start resets tilt').toEqual({ tilted: false, slamTilted: false });
		expect(after.machine.multiball, 'ball_will_start resets multiball').toBeNull();
	});
});

describe('Story 2.5 -- AC 6: game over, threshold straddled', () => {
	function stateOnBall(ballNumber: number): GameState {
		return {
			tick: 0,
			phase: 'game',
			machine: {
				ballsInPlay: 1,
				hardwareEnabled: true,
				ballSave: { untilTick: null, sources: [] },
				tilt: { tilted: false, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
			},
			players: [emptyPlayer(ballNumber)],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};
	}

	it('the last player\'s ballsPerGame-th (3rd) ball ends the game; the (ballsPerGame - 1)-th does not, in the same test', () => {
		const control = runRulesScript(close('s_trough_4').at(1).build(), { durationTicks: 1, initialState: stateOnBall(2) });
		expect(control.finalState.phase, 'ballsPerGame - 1 (ball 2 of 3) must NOT end the game').toBe('game');
		expect(control.finalState.players[0]!.ballNumber, 'the game continues into ball 3').toBe(3);

		const ended = runRulesScript(close('s_trough_4').at(1).build(), { durationTicks: 1, initialState: stateOnBall(3) });
		expect(ended.finalState.phase).toBe('game_over');
		expect(ended.finalState.machine.hardwareEnabled).toBe(false);
		const disables = ended.coilCommands.filter((c) => c.action === 'disable');
		// Review finding 2026-09-06 (code-review): `disables.length > 0` alone
		// does NOT pin AC 6's "a disable for EACH hardware coil" -- confirmed by
		// mutation, reducing the game-over batch to `HARDWARE_COILS.slice(0, 1)`
		// left the whole suite green (101 files / 1580 passed), i.e. six of the
		// seven AD-5 hardware coils could stay energised after game over
		// ("Tilt, game over and Attract disable all of them together") with
		// nothing in the repository objecting. Asserted against `HARDWARE_COILS`
		// itself, mirroring the ball_starting enable-batch pin above (never a
		// hand-typed coil list, DW-149).
		const disabledCoils = new Set(disables.map((c) => c.coil));
		for (const coil of HARDWARE_COILS) {
			expect(disabledCoils.has(coil), `${coil} must receive a disable CoilCommand at game over`).toBe(true);
		}
		expect(HARDWARE_COILS.length, 'sanity: the hardware set is non-empty, or the loop above is vacuous').toBeGreaterThan(0);
		expect(
			disables.some((c) => c.coil === TROUGH_EJECT_COIL || c.coil === TABLE.ballDevices.bd_shooter.ballSearchOrder[0]!.coil),
			'the disable set must exclude the serving coils (task 7) or the controller could never serve again',
		).toBe(false);
	});

	// Review finding 2026-09-06 (verification-gap): the sole game-over test
	// above is single-player, so `endingPlayer === 0` and
	// `nextState.players.length - 1 === 0` agree under BOTH the real
	// `isLastPlayer` formula and a hypothetical hardcoded `endingPlayer === 0`
	// -- confirmed by mutation, that substitution leaves the test above green.
	// A 2-player game where the LAST player (index 1, not 0) reaches the
	// threshold is the case that actually discriminates the real formula.
	// Review finding 2026-09-06 (code-review, acceptance-auditor): AC 6 says
	// "GameStart.adjustments.ballsPerGame is 3 and REACHES rules.step through
	// createRules's constructor", and task 5 exists solely to make it
	// reachable ("Without this, AC 6 is not implementable as worded"). But
	// every test in the repository used ballsPerGame 3, which is also
	// `DEFAULT_ADJUSTMENTS`'s own value -- so replacing `adjustments.ballsPerGame`
	// in the controller with a literal `3` left the whole suite green
	// (confirmed by mutation). The plumbing shipped untested. Driving a
	// NON-default value through `runRulesScript`'s own `adjustments` option
	// (declared but, until now, passed by no caller) is what makes the
	// constructor path falsifiable, straddled on both sides.
	it('a NON-default ballsPerGame (2) supplied through the createRules constructor governs the threshold -- task 5 plumbing is actually read', () => {
		const twoBall = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 2, matchProbability: 0 };

		const control = runRulesScript(close('s_trough_4').at(1).build(), {
			durationTicks: 1,
			initialState: stateOnBall(1),
			adjustments: twoBall,
		});
		expect(control.finalState.phase, 'ball 1 of 2 must NOT end the game').toBe('game');

		const ended = runRulesScript(close('s_trough_4').at(1).build(), {
			durationTicks: 1,
			initialState: stateOnBall(2),
			adjustments: twoBall,
		});
		expect(
			ended.finalState.phase,
			'ball 2 of 2 MUST end the game -- with the default ballsPerGame of 3 this is still ball 2 of 3 and stays in play, so this assertion fails unless the constructor value is genuinely read',
		).toBe('game_over');
	});

	it('a 2-player game ends when the LAST player (index 1) reaches ballsPerGame, straddled the same way', () => {
		function twoPlayerStateOnBall(lastPlayerBallNumber: number): GameState {
			return {
				tick: 0,
				phase: 'game',
				machine: {
					ballsInPlay: 1,
					hardwareEnabled: true,
					ballSave: { untilTick: null, sources: [] },
					tilt: { tilted: false, slamTilted: false },
					multiball: null,
					highscores: [],
					deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
				},
				players: [emptyPlayer(3), emptyPlayer(lastPlayerBallNumber)],
				currentPlayer: 1,
				modes: [],
				rng: 0,
			};
		}

		const control = runRulesScript(close('s_trough_4').at(1).build(), { durationTicks: 1, initialState: twoPlayerStateOnBall(2) });
		expect(control.finalState.phase, 'ballsPerGame - 1 (ball 2 of 3) for the LAST player must NOT end the game').toBe('game');

		const ended = runRulesScript(close('s_trough_4').at(1).build(), { durationTicks: 1, initialState: twoPlayerStateOnBall(3) });
		expect(ended.finalState.phase, 'the LAST player (index 1) reaching ballsPerGame ends the game').toBe('game_over');
	});
});

describe('Story 2.5 -- AC 7: Hot seat isolation, two-sided', () => {
	it('player 1 drops three DRAGON letters and player 2\'s ball starts: player 2 has none, player 1 keeps theirs', () => {
		const script = close('s_start').at(5)
			.at(8)
			.close(TABLE.dropBankWiring.d.switch).at(10)
			.close(TABLE.dropBankWiring.r.switch).at(11)
			.close(TABLE.dropBankWiring.a.switch).at(12)
			.open('s_shooter_lane').at(20)
			.close('s_trough_1').at(30)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, tuning: NO_BALL_SAVE_TUNING });

		expect(result.finalState.players[0]!.letters, 'player 1 keeps their letters').toBe('DRA');
		expect(result.finalState.players[1]!.letters, 'player 2 starts with none').toBe('');
	});

	// QA probe 2026-09-06 (Rule 19 vacuity check on the test above): its own
	// script never moves `currentPlayer` away from 0 during the whole
	// letters-dropping window (both drops happen before the drain at tick 30),
	// so a mutation that hardcodes the credited index to 0 -- instead of
	// reading `nextState.currentPlayer` -- passes it unchanged (confirmed:
	// `src/sim/rules/ball-controller.ts`'s `index === currentPlayer` credit
	// guard mutated to `index === 0`, run in isolation, left the test above
	// GREEN). That mutation is a real "leaks to the wrong player" defect
	// distinct from the one the story's own review already found and fixed
	// (crediting/wiping EVERY player) -- this test discriminates it by
	// dropping a letter AFTER rotation, while player 2 (index 1) is current,
	// and asserting the credit lands on player 2, not player 1.
	//
	// Mutation (Rule 19): `src/sim/rules/ball-controller.ts`'s
	// `index === currentPlayer ? ... : player` -> `index === 0 ? ... : player`.
	// QA-observed 2026-09-06: reddened `player 2 (now current) is credited:
	// expected '' to be 'D'` while `test/rules-lifecycle.test.ts`'s OTHER AC 7
	// test (letters dropped only while player 1 is current) stayed green,
	// confirming this is the test that newly discriminates the hardcoded-index
	// defect; reverted, `git status --short` / `git diff --stat` unchanged.
	it('after rotation, a dropped letter credits whichever player is NOW current (player 2), not a hardcoded player 1 -- closes a vacuity in the test above, whose own script never changes currentPlayer during its letters window', () => {
		const script = close('s_start').at(5)
			.at(8)
			.open('s_shooter_lane').at(20)
			.close('s_trough_1').at(30)
			.close(TABLE.dropBankWiring.d.switch).at(32)
			.build();
		const result = runRulesScript(script, { durationTicks: 35, tuning: NO_BALL_SAVE_TUNING });

		expect(result.finalState.currentPlayer, 'sanity: rotation happened, player 2 is now current').toBe(1);
		expect(result.finalState.players[1]!.letters, 'player 2 (now current) is credited').toBe('D');
		expect(result.finalState.players[0]!.letters, 'player 1, no longer current, is untouched').toBe('');
	});
});

describe('Story 2.5 -- DW-70: slot derivation and identity stability', () => {
	it('a trough eject opens s_trough_4 -> deviceSlots.bd_trough becomes [true,true,true,false], derived inside rules.step', () => {
		const result = runRulesScript(open('s_trough_4').at(1).build(), { durationTicks: 1 });
		expect(result.finalState.machine.deviceSlots.bd_trough).toEqual([true, true, true, false]);
	});

	it('identity stability: two consecutive quiet ticks (no ball-device edge) leave machine.deviceSlots the SAME reference', () => {
		const result = runRulesScript([], { durationTicks: 2 });
		expect(result.statesByTick.get(2)!.machine.deviceSlots).toBe(result.statesByTick.get(1)!.machine.deviceSlots);
	});
});

describe('Story 2.5 -- Shooter-lane slot', () => {
	it('s_shooter_lane closes then opens: deviceSlots.bd_shooter goes [false] -> [true] -> [false]; the arrival must not decrement ballsInPlay; the open still emits exactly one ball_launched and increments ballsInPlay by one', () => {
		const result = runRulesScript(close('s_shooter_lane').at(1).open().at(2).build(), { durationTicks: 2 });

		expect(result.statesByTick.get(1)!.machine.deviceSlots.bd_shooter).toEqual([true]);
		expect(result.statesByTick.get(1)!.machine.ballsInPlay, 'a bd_shooter arrival must NOT decrement ballsInPlay').toBe(0);

		expect(result.statesByTick.get(2)!.machine.deviceSlots.bd_shooter).toEqual([false]);
		expect(result.statesByTick.get(2)!.machine.ballsInPlay).toBe(1);
		expect(result.events.filter((e) => e.type === 'ball_launched')).toHaveLength(1);
	});
});

// Review finding 2026-09-06 (verification-gap): every existing test observing
// `ball_will_start -> c_dragon_bank_reset` (`test/rules-devices.test.ts:319-343`)
// hand-builds `lifecycleEvents: [{ type: 'ball_will_start', tick }]` and drives
// the devices layer directly -- never through the `pendingLifecycleEvents`
// queue task 4 added to `sim/rules/index.ts`. Neither this file's own AC 2 nor
// `test/rules-lifecycle-integration.test.ts` checks for the reset coil at all,
// so a real Start press's own wiring into that queue was unexercised.
describe('Story 2.5 -- real Start press reaches the drop bank (task 4 wiring)', () => {
	// Note: `dropBank.onBallWillStart(lifecycleEvent.tick)`
	// (`src/sim/rules/devices/index.ts:322`) stamps the returned CoilCommand's
	// own `tick` field from the ORIGINAL ball_will_start event (the Start
	// press's own tick), not from the current `step()` call's tick parameter --
	// `sim/loop/index.ts` reassigns `tick` fresh at physics-consumption time
	// regardless, so this is a provenance-field detail, not a functional bug.
	// The genuinely observable proof of the one-tick deferral is therefore
	// WHETHER the reset appears at all after only N ticks vs N+1 -- not what
	// its own `.tick` field reads.
	it('a real s_start press queues ball_will_start into the devices layer, producing a c_dragon_bank_reset pulse only once the FOLLOWING tick actually runs', () => {
		const stoppedAtStart = runRulesScript(close('s_start').at(5).build(), { durationTicks: 5 });
		const resetAtStartOnly = stoppedAtStart.coilCommands.filter((c) => c.coil === TABLE.dropBankResetCoil && c.action === 'pulse');
		expect(resetAtStartOnly, 'stopping the run AT the Start-press tick must not yet show the reset -- the queue needs one more tick to run').toHaveLength(0);

		const throughNextTick = runRulesScript(close('s_start').at(5).build(), { durationTicks: 6 });
		const resetOnceNextTickRuns = throughNextTick.coilCommands.filter((c) => c.coil === TABLE.dropBankResetCoil && c.action === 'pulse');
		expect(resetOnceNextTickRuns, 'running one tick further shows exactly one reset pulse, through the real pendingLifecycleEvents queue').toHaveLength(1);
	});
});
