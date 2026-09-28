// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.10: the headless scripted tests for every I/O & Edge-Case Matrix
// row that is rules-side (Rule 8) -- `sim/rules/bonus.ts`'s own two pure
// folds (`creditBonusFromDeviceEvents`/`advanceBonusMultiplier`), called
// DIRECTLY where the row is a claim about the fold itself (AC 1's category
// credits, the "not in a game" identity rows), and through a REAL
// `runRulesScript()` run where the row is a claim about the composed
// `rules.step()` path -- the multiplier ladder (AC 2/AC 7's own mutation:
// "delete the advanceBonusMultiplier call ... every AC 2 assertion reddens
// through the real rules.step() path") and every ball-controller row (AC
// 3/AC 4/AC 5/AC 6, the drain/payment/count-up/reset, none of which lives in
// `bonus.ts`). Every scenario runs at BOTH `currentPlayer` 0 and 1 (Rule 8's
// own "Second player" row), never `sim/loop`/`sim/physics` (AC 9, pinned
// transitively by `test/rules-devices-headless.test.ts`'s ENTRY_FILES gate,
// which this file is added to in the same change).
//
// Anti-vacuity (Design Notes, epic vacuity #43, Story 2.9's own twin
// failures): AC 3's `total: 60000` and AC 4's three step offsets
// (400/800/1200) are authored HERE as literals, arithmetically consistent
// with the shipped tunables but never read back from them. `NO_BALL_SAVE_TUNING`
// is the one override every drain-driving test here uses -- it replaces
// `ballSaveMs`/`ballSaveGraceMs` and NOTHING else, so `bonusCountMs` and all
// three scoring values stay at their PRODUCTION values while the ball-save
// early return is kept off the path.

import { describe, expect, it } from 'vitest';
import {
	advanceBonusMultiplier,
	creditBonusFromDeviceEvents,
	BONUS_CATEGORIES,
	BONUS_EMPTY as PRODUCTION_BONUS_EMPTY,
} from '../src/sim/rules/bonus';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript } from './util/switch-script';
import type { PlayerBonusState, PlayerState } from '../src/sim/contracts/state';
import type { GameState } from '../src/sim/table/names';

/**
 * Story 2.9's own idiom, reproduced byte-identically (this file's own
 * Boundaries: "Every drain-driving test runs at a non-saving tuning" --
 * `test/rules-lifecycle.test.ts:34-38`, `test/rules-modes.test.ts:47-51`,
 * `test/backglass-frame.test.ts:38-42`, `test/backglass-integration.test.ts:52-56`
 * are the four existing copies this is the fifth of): several scenarios
 * below drain a ball only a handful of ticks after it starts, comfortably
 * inside the PRODUCTION ball-save window (8 s default), which would
 * otherwise turn every one of them into a SAVE instead of a genuine drain.
 * Replaces ONLY `ballSaveMs`/`ballSaveGraceMs` -- every other tunable,
 * including `bonusCountMs` and the three scoring values, stays at its
 * shipped production value.
 */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

const BONUS_EMPTY: PlayerBonusState = { byCategory: { letters: 0, loops: 0, strikes: 0 }, multiplier: 1 };

interface PlayerOverrides {
	readonly score?: number;
	readonly letters?: string;
	readonly lockCredits?: number;
	readonly extraBalls?: number;
	readonly bonus?: PlayerBonusState;
	readonly ballNumber?: number;
}

/** A fresh empty player, overridable -- mirrors `ball-controller.ts`'s own `emptyPlayer()`, duplicated test-local (the established precedent: `test/rules-lifecycle.test.ts`, `test/rules-modes.test.ts`, `test/rules-lamps.test.ts`, `test/rules-ball-save.test.ts`, `test/util/snapshot-factory.ts` each keep their own copy). */
function player(overrides: PlayerOverrides = {}): PlayerState {
	return {
		score: overrides.score ?? 0,
		letters: overrides.letters ?? '',
		lockCredits: overrides.lockCredits ?? 0,
		tiltWarnings: 0,
		bonus: overrides.bonus ?? BONUS_EMPTY,
		lanes: { lit: {}, completedSets: [] },
		extraBalls: overrides.extraBalls ?? 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [],
		ballNumber: overrides.ballNumber ?? 1,
	};
}

interface GameStateOverrides {
	readonly phase?: GameState['phase'];
	readonly currentPlayer: number;
	readonly players: readonly PlayerState[];
	readonly modes?: GameState['modes'];
	readonly ballsInPlay?: number;
	readonly tilted?: boolean;
	readonly ballSave?: GameState['machine']['ballSave'];
}

/** A mid-game `GameState` -- mirrors `test/rules-modes.test.ts`'s own `gameState()`, widened with `currentPlayer`/`tilted`/`ballSave` (this file's own scenarios need all three, unlike that file's). */
function gameState(options: GameStateOverrides): GameState {
	return {
		tick: 0,
		phase: options.phase ?? 'game',
		machine: {
			ballsInPlay: options.ballsInPlay ?? 1,
			hardwareEnabled: true,
			ballSave: options.ballSave ?? { untilTick: null, sources: [] },
			tilt: { tilted: options.tilted ?? false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] },
		},
		players: options.players,
		currentPlayer: options.currentPlayer,
		modes: options.modes ?? [],
		rng: 0,
	};
}

function twoPlayers(currentPlayer: 0 | 1, current: PlayerOverrides = {}, other: PlayerOverrides = {}): PlayerState[] {
	const players: PlayerState[] = [player(other), player(other)];
	players[currentPlayer] = player(current);
	return players;
}

describe('AC 1 -- categories increment from device events (creditBonusFromDeviceEvents, called directly)', () => {
	it.each([0, 1] as const)('bank_target_down credits letters by exactly 1 for currentPlayer %i; the other player is untouched', (currentPlayer) => {
		const other = currentPlayer === 0 ? 1 : 0;
		const state = gameState({ currentPlayer, players: twoPlayers(currentPlayer) });
		const next = creditBonusFromDeviceEvents(state, [{ type: 'bank_target_down', letter: 'd', tick: 1 }]);
		expect(next.players[currentPlayer]!.bonus.byCategory).toEqual({ letters: 1, loops: 0, strikes: 0 });
		expect(next.players[other]!.bonus, 'the other player is untouched').toEqual(BONUS_EMPTY);
	});

	it.each([0, 1] as const)('shot_left_loop_made then shot_right_loop_made each credit loops by 1 (0 -> 1 -> 2) for currentPlayer %i, in successive folds', (currentPlayer) => {
		const state = gameState({ currentPlayer, players: twoPlayers(currentPlayer) });
		const afterFirst = creditBonusFromDeviceEvents(state, [{ type: 'shot_left_loop_made', tick: 1 }]);
		expect(afterFirst.players[currentPlayer]!.bonus.byCategory.loops).toBe(1);
		const afterSecond = creditBonusFromDeviceEvents(afterFirst, [{ type: 'shot_right_loop_made', tick: 2 }]);
		expect(afterSecond.players[currentPlayer]!.bonus.byCategory.loops).toBe(2);
		expect(afterSecond.players[currentPlayer]!.bonus.byCategory.letters, 'letters untouched by a loop credit').toBe(0);
	});

	it.each([0, 1] as const)('shot_ramp_made credits nothing at all -- TABLE.bonusWiring has no entry for it (currentPlayer %i); the fold returns the SAME state reference', (currentPlayer) => {
		const state = gameState({ currentPlayer, players: twoPlayers(currentPlayer) });
		const next = creditBonusFromDeviceEvents(state, [{ type: 'shot_ramp_made', tick: 1 }]);
		expect(next).toBe(state);
	});

	it('phase "attract": the same device events credit nothing, and the fold returns the SAME state reference', () => {
		const state = gameState({ phase: 'attract', currentPlayer: 0, players: [player()] });
		const next = creditBonusFromDeviceEvents(state, [
			{ type: 'bank_target_down', letter: 'd', tick: 1 },
			{ type: 'shot_left_loop_made', tick: 1 },
		]);
		expect(next).toBe(state);
	});

	it('no player at currentPlayer: the fold returns the SAME state reference', () => {
		const state = gameState({ currentPlayer: 0, players: [] });
		const next = creditBonusFromDeviceEvents(state, [{ type: 'bank_target_down', letter: 'd', tick: 1 }]);
		expect(next).toBe(state);
	});
});

describe('AC 2 / AC 7 -- the multiplier ladder, through the REAL rules.step() path (DW-208)', () => {
	it.each([0, 1] as const)('four lanes_completed{set:"top"} advance the multiplier 1 -> 2 -> 3 -> 5 -> 5 for currentPlayer %i; the other player is untouched', (currentPlayer) => {
		const other = currentPlayer === 0 ? 1 : 0;
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer),
			modes: [{ mode: 'base', priority: 100, player: currentPlayer }],
		});
		// Four completions of the Top set: s_top_1/2/3 in sequence, four times.
		const script = close('s_top_1').at(1).close('s_top_2').at(2).close('s_top_3').at(3)
			.close('s_top_1').at(4).close('s_top_2').at(5).close('s_top_3').at(6)
			.close('s_top_1').at(7).close('s_top_2').at(8).close('s_top_3').at(9)
			.close('s_top_1').at(10).close('s_top_2').at(11).close('s_top_3').at(12);
		const result = runRulesScript(script.build(), { durationTicks: 12, initialState: initial });

		expect(result.statesByTick.get(3)!.players[currentPlayer]!.bonus.multiplier).toBe(2);
		expect(result.statesByTick.get(6)!.players[currentPlayer]!.bonus.multiplier).toBe(3);
		expect(result.statesByTick.get(9)!.players[currentPlayer]!.bonus.multiplier).toBe(5);
		expect(result.statesByTick.get(12)!.players[currentPlayer]!.bonus.multiplier, 'capped at the ladder\'s last rung').toBe(5);
		expect(result.finalState.players[other]!.bonus.multiplier, 'the other player is untouched').toBe(1);
	});

	it.each([0, 1] as const)('lanes_completed{set:"inout"} never moves the multiplier for currentPlayer %i', (currentPlayer) => {
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer),
			modes: [{ mode: 'base', priority: 100, player: currentPlayer }],
		});
		const script = close('s_outlane_l').at(1).close('s_inlane_l').at(2).close('s_inlane_r').at(3).close('s_outlane_r').at(4);
		const result = runRulesScript(script.build(), { durationTicks: 4, initialState: initial });
		expect(result.finalState.players[currentPlayer]!.bonus.multiplier).toBe(1);
	});

	it('advanceBonusMultiplier, called directly: phase "attract" or no player at currentPlayer returns the SAME state reference', () => {
		const attractState = gameState({ phase: 'attract', currentPlayer: 0, players: [player()] });
		expect(advanceBonusMultiplier(attractState, [{ type: 'lanes_completed', set: 'top', tick: 1 }])).toBe(attractState);

		const noPlayerState = gameState({ currentPlayer: 0, players: [] });
		expect(advanceBonusMultiplier(noPlayerState, [{ type: 'lanes_completed', set: 'top', tick: 1 }])).toBe(noPlayerState);
	});
});

describe('AC 3 -- the untilted payload and the score', () => {
	it.each([0, 1] as const)('letters 2, loops 1, multiplier 3 -> ball_ended carries total 60000 (authored literal), paid onto the ENDING player\'s score; the other player is untouched (currentPlayer %i)', (currentPlayer) => {
		const other = currentPlayer === 0 ? 1 : 0;
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer, { bonus: seededBonus, score: 1000 }, { score: 500 }),
			ballsInPlay: 1,
		});
		const result = runRulesScript(close('s_trough_1').at(1).build(), { durationTicks: 1, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended, 'sanity: the drain must genuinely end the ball').toBeDefined();
		if (ended!.type !== 'ball_ended') {
			throw new Error('unreachable: filtered on type ball_ended above');
		}
		expect(ended!.player).toBe(currentPlayer);
		expect(ended!.bonusByCategory).toEqual({ letters: 2, loops: 1, strikes: 0 });
		expect(ended!.multiplier).toBe(3);
		// Authored literal (2 * 5000 + 1 * 10000) * 3 = 60000 -- arithmetically
		// consistent with the shipped bonusLetterValue/bonusLoopValue/multiplier
		// but NEVER read back from tuning.ts here (epic vacuity #43).
		expect(ended!.total).toBe(60000);
		expect(ended!.tilted).toBe(false);

		expect(result.finalState.players[currentPlayer]!.score, 'the ending player\'s score rises by exactly the authored total').toBe(1000 + 60000);
		expect(result.finalState.players[other]!.score, 'the other player\'s score is untouched').toBe(500);
	});
});

// Code review 2026-09-08 (verification-gap): sim/rules/index.ts's own Design
// Notes call the device-credit-before-controller ordering load-bearing --
// "a category credited on the drain tick lands inside that same ball's own
// ball_ended payload" -- but every AC 1/AC 3 test above credits on a tick
// STRICTLY EARLIER than the drain, so the literal same-tick case (the one the
// ordering exists for) had no covering test; swapping the two calls in
// index.ts would leave the whole suite green. This closes that gap.
describe('AC 1 / AC 3 integration -- a category credited on the IDENTICAL tick the ball drains still lands in that ball\'s own payload', () => {
	it.each([0, 1] as const)('a bank_target_down and the draining trough switch close on the SAME tick -- the credit is paid onto THIS ball, not lost to the reset (currentPlayer %i)', (currentPlayer) => {
		const other = currentPlayer === 0 ? 1 : 0;
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer, { score: 1000 }, { score: 500 }),
			ballsInPlay: 1,
		});
		const script = close(TABLE.dropBankWiring.d.switch).at(1).close('s_trough_1').at(1).build();
		const result = runRulesScript(script, { durationTicks: 1, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended, 'sanity: the drain must genuinely end the ball').toBeDefined();
		if (ended!.type !== 'ball_ended') {
			throw new Error('unreachable: filtered on type ball_ended above');
		}
		expect(ended!.bonusByCategory, 'the same-tick letter credit is inside THIS ball\'s own payload').toEqual({ letters: 1, loops: 0, strikes: 0 });
		// Authored literal: 1 * bonusLetterValue(5000) * multiplier(1) = 5000 --
		// never read back from tuning.ts (epic vacuity #43).
		expect(ended!.total).toBe(5000);
		expect(result.finalState.players[currentPlayer]!.score, 'the same-tick credit is paid onto the ending player\'s score').toBe(1000 + 5000);
		expect(result.finalState.players[other]!.score, 'the other player is untouched').toBe(500);
		// Code review 2026-09-08 (acceptance auditor): the "Letter credited" I/O
		// row has TWO clauses -- the bonus category increments AND
		// `players[i].letters` still advances via the pre-existing accumulator
		// (`ball-controller.ts`'s own DRAGON-letter fold). Nothing in this file
		// read the second clause back, so a regression that routed the letter
		// into the bonus INSTEAD of the accumulator would have passed here.
		expect(
			result.finalState.players[currentPlayer]!.letters,
			'the same bank_target_down still advances the letters accumulator -- the bonus category is an addition, not a replacement',
		).toBe('D');
	});
});

// Code review 2026-09-08 (blind-hunter): sim/rules/bonus.ts's own header and
// this spec's Design Notes both claim "a seeded non-zero strikes count is
// proven to contribute" to bonusTotal(), but no test anywhere in the file
// actually seeded one -- every byCategory fixture above carries strikes: 0.
// This is that test (Design Notes, "The strikes category has no producer
// this epic, and that is not a gap" -- strikes has no event source until
// Epic 3's War, but the Sigma arithmetic must still cover it uniformly).
describe('The arithmetic covers strikes exhaustively even though nothing credits it this epic', () => {
	it.each([0, 1] as const)('a seeded non-zero strikes count contributes to the total exactly like any other category (currentPlayer %i)', (currentPlayer) => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 0, loops: 0, strikes: 2 }, multiplier: 1 };
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer, { bonus: seededBonus }),
			ballsInPlay: 1,
		});
		const result = runRulesScript(close('s_trough_1').at(1).build(), { durationTicks: 1, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended, 'sanity: the drain must genuinely end the ball').toBeDefined();
		if (ended!.type !== 'ball_ended') {
			throw new Error('unreachable: filtered on type ball_ended above');
		}
		expect(ended!.bonusByCategory).toEqual({ letters: 0, loops: 0, strikes: 2 });
		// Authored literal: 2 * bonusStrikeValue(25000) * multiplier(1) = 50000 --
		// never read back from tuning.ts (epic vacuity #43).
		expect(ended!.total).toBe(50000);
		expect(result.finalState.players[currentPlayer]!.score).toBe(50000);
	});
});

describe('AC 4 -- the count-up stream is paced by bonusCountMs at its PRODUCTION value', () => {
	it.each([0, 1] as const)('three bonus_count_step at E+400/E+800/E+1200 (literal offsets, never read back from tuning), step 1..3/steps 3, the last carrying running === total === 60000 (currentPlayer %i)', (currentPlayer) => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const initial = gameState({ currentPlayer, players: twoPlayers(currentPlayer, { bonus: seededBonus }), ballsInPlay: 1 });
		const drainTick = 5;
		const result = runRulesScript(close('s_trough_1').at(drainTick).build(), {
			durationTicks: drainTick + 1300,
			initialState: initial,
			tuning: NO_BALL_SAVE_TUNING,
		});

		const steps = result.events.filter((e) => e.type === 'bonus_count_step');
		expect(steps).toHaveLength(3);
		expect(steps.map((e) => e.tick)).toEqual([drainTick + 400, drainTick + 800, drainTick + 1200]);
		// Un-multiplied running subtotal per nonzero category (BONUS_CATEGORIES
		// order: letters, then loops), then the final multiplier-applied step --
		// authored from THIS test's own fixture (2 letters, 1 loop, x3), never
		// read back from tuning.ts.
		const expectedRunning = [2 * 5000, 2 * 5000 + 1 * 10000, 60000];
		for (const [index, event] of steps.entries()) {
			if (event.type !== 'bonus_count_step') {
				throw new Error('unreachable: filtered on type bonus_count_step above');
			}
			expect(event.player).toBe(currentPlayer);
			expect(event.step).toBe(index + 1);
			expect(event.steps).toBe(3);
			expect(event.total).toBe(60000);
			expect(event.running).toBe(expectedRunning[index]);
		}
	});

	it('a zero-total (all-categories-empty) ball end emits no bonus_count_step at all', () => {
		const initial = gameState({ currentPlayer: 0, players: [player()], ballsInPlay: 1 });
		const result = runRulesScript(close('s_trough_1').at(5).build(), {
			durationTicks: 5 + 1300,
			initialState: initial,
			tuning: NO_BALL_SAVE_TUNING,
		});
		expect(result.events.some((e) => e.type === 'bonus_count_step')).toBe(false);
	});

	// Story 2.15 (DW-235). Reproduces the measured scenario exactly: ball 1
	// drains at tick D with a nonzero bonus (arming the 400/800/1200 count-up
	// schedule), a Slam tilt one tick later ends the game (phase -> 'attract')
	// WITHOUT touching that schedule -- `pendingBonusCountSteps` is
	// ball-controller closure state (AD-7), armed once on drain and cleared
	// only by a new game's own Start, never by a slam -- and Start is pressed
	// on EXACTLY the tick the second step (E+800) is due. `pendingBonusCount
	// Steps` IS cleared when the new game is created, but the drain that
	// reports a step due THIS tick runs before Start-handling in the SAME
	// `step()` call, so without the guard the stale step still fires. A
	// negative with no positive proves nothing (Anti-vacuity plan): this
	// pins BOTH that the schedule genuinely was armed (E+400 still fires,
	// well before the slam/Start) AND that nothing fires at or after E+800.
	describe('DW-235 -- Start on the exact tick a count-up step is due, after a Slam-tilt game-over, emits no stale bonus_count_step', () => {
		it('E+400 still fires (the schedule was genuinely armed); nothing fires at or after the new game\'s own Start tick (E+800)', () => {
			const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
			const initial = gameState({ currentPlayer: 0, players: [player({ bonus: seededBonus })], ballsInPlay: 1 });
			const drainTick = 5;
			const slamTick = drainTick + 1;
			const startTick = drainTick + 800; // exactly the schedule's own second step
			const script = close('s_trough_1')
				.at(drainTick)
				.close('s_slam_tilt')
				.at(slamTick)
				.close('s_start')
				.at(startTick)
				.build();
			const result = runRulesScript(script, {
				durationTicks: drainTick + 1300,
				initialState: initial,
				tuning: NO_BALL_SAVE_TUNING,
			});

			// Sanity: the slam genuinely ended the game, and Start genuinely
			// started a new one on the tick this test is about.
			expect(result.events, 'sanity: the slam must fire as scripted').toEqual(expect.arrayContaining([{ type: 'slam_tilt', tick: slamTick }]));
			expect(result.finalState.phase, 'sanity: Start must have created a new game').toBe('game');

			const steps = result.events.filter((e) => e.type === 'bonus_count_step');
			// Positive first (Anti-vacuity plan, "a negative with no
			// positive"): the schedule genuinely was armed and would have
			// gone on to fire every step, undisturbed by the slam alone.
			expect(steps.some((e) => e.tick === drainTick + 400), 'sanity: the count-up schedule must genuinely have been armed by the drain').toBe(true);
			// The negative this story's own guard exists for: nothing at or
			// after the tick the new game's own Start created it -- neither
			// the exact due tick (E+800) nor the still-later E+1200.
			const leaked = steps.filter((e) => e.tick >= startTick);
			expect(
				leaked,
				`bonus_count_step emitted at or after the new game's own Start tick (${startTick}): ${JSON.stringify(leaked)} -- reverting the DW-235 guard in ball-controller.ts reproduces this at tick ${startTick}`,
			).toEqual([]);
		});
	});
});

describe('AC 5 -- a tilted ball forfeits the bonus and keeps the score', () => {
	it.each([0, 1] as const)('total: 0, tilted: true, score unchanged, no bonus_count_step (currentPlayer %i)', (currentPlayer) => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer, { bonus: seededBonus, score: 1000 }),
			ballsInPlay: 1,
			tilted: true,
		});
		const result = runRulesScript(close('s_trough_1').at(1).build(), {
			durationTicks: 1 + 1300,
			initialState: initial,
			tuning: NO_BALL_SAVE_TUNING,
		});

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended).toBeDefined();
		if (ended!.type !== 'ball_ended') {
			throw new Error('unreachable: filtered on type ball_ended above');
		}
		expect(ended!.total).toBe(0);
		expect(ended!.tilted).toBe(true);
		expect(result.finalState.players[currentPlayer]!.score, 'a tilted ball forfeits the bonus -- score is unchanged').toBe(1000);
		expect(result.events.some((e) => e.type === 'bonus_count_step'), 'no count-up for a tilted ball').toBe(false);
	});
});

describe('Ball saved instead of ended', () => {
	it('a drain inside a live ball-save window re-serves the ball: no ball_ended, no score write, no reset, no bonus_count_step', () => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const initial = gameState({
			currentPlayer: 0,
			players: [player({ bonus: seededBonus, score: 1000 })],
			ballsInPlay: 1,
			ballSave: { untilTick: 100000, sources: ['test'] },
		});
		// Deliberately NOT NO_BALL_SAVE_TUNING here -- this scenario needs the save to actually be live.
		const result = runRulesScript(close('s_trough_1').at(1).build(), { durationTicks: 1 + 1300, initialState: initial });

		expect(result.events.some((e) => e.type === 'ball_ended'), 'a live save must never also emit ball_ended').toBe(false);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(true);
		expect(result.finalState.players[0]!.score, 'no score write on a save').toBe(1000);
		expect(result.finalState.players[0]!.bonus, 'no reset on a save -- same ball, bonus untouched').toEqual(seededBonus);
		expect(result.events.some((e) => e.type === 'bonus_count_step'), 'no count-up on a save').toBe(false);
	});
});

describe('AC 6 -- the per-ball reset, and what survives it', () => {
	it('single-player wrap-around: ball_will_start resets byCategory/multiplier for the SAME player\'s next ball; letters/score(including the just-paid bonus)/lockCredits/extraBalls are byte-identical', () => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const initial = gameState({
			currentPlayer: 0,
			players: [player({ bonus: seededBonus, score: 1000, letters: 'DR', lockCredits: 2, extraBalls: 1, ballNumber: 1 })],
			ballsInPlay: 1,
		});
		const result = runRulesScript(close('s_trough_1').at(1).build(), { durationTicks: 1, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		const after = result.finalState.players[0]!;
		expect(after.bonus, 'byCategory all-zero, multiplier back to 1').toEqual(BONUS_EMPTY);
		expect(after.letters, 'letters survives the reset').toBe('DR');
		expect(after.score, 'score (now including the just-paid 60000 bonus) survives the reset -- startBall() never touches it').toBe(1000 + 60000);
		expect(after.lockCredits, 'lockCredits survives').toBe(2);
		expect(after.extraBalls, 'extraBalls survives').toBe(1);
		expect(after.ballNumber, 'sanity: this genuinely is the NEXT ball').toBe(2);
	});

	it('two-player: player 1\'s own next ball (reached after player 0\'s ball also ends and rotation returns to player 1) resets THEIR bonus the same way; letters/score/lockCredits/extraBalls survive', () => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const players: PlayerState[] = [
			player({ ballNumber: 1 }),
			player({ bonus: seededBonus, score: 1000, letters: 'DR', lockCredits: 2, extraBalls: 1, ballNumber: 1 }),
		];
		// Player 1 (currentPlayer) drains first -- not the last player's last
		// ball, so it rotates to player 0 (index 0, the "isLastPlayer wraps to
		// 0" rule), NOT back to player 1. Player 0's ball then drains too
		// (immediately, since ballsInPlay is floored at 0 from the first
		// drain, and this closes a DIFFERENT trough slot switch, which is
		// still a genuine parking-device entry) -- THAT rotation is what
		// finally reaches player 1's OWN next ball.
		const initial = gameState({ currentPlayer: 1, players, ballsInPlay: 1 });
		const script = close('s_trough_1').at(1).close('s_trough_2').at(2);
		const result = runRulesScript(script.build(), { durationTicks: 2, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		const endedEvents = result.events.filter((e) => e.type === 'ball_ended');
		expect(endedEvents, 'sanity: both drains must genuinely end a ball').toHaveLength(2);

		const after = result.finalState.players[1]!;
		expect(after.bonus, 'byCategory all-zero, multiplier back to 1').toEqual(BONUS_EMPTY);
		expect(after.letters, 'letters survives the reset').toBe('DR');
		expect(after.score, 'score (including the bonus paid when THIS player\'s own ball ended) survives the reset').toBe(1000 + 60000);
		expect(after.lockCredits, 'lockCredits survives').toBe(2);
		expect(after.extraBalls, 'extraBalls survives').toBe(1);
		expect(after.ballNumber, 'sanity: this genuinely is player 1\'s NEXT ball').toBe(2);
	});
});

// Code review 2026-09-08 (blind-hunter, edge-case-hunter and the acceptance
// auditor, independently): `armBonusCountSchedule()` returned BEFORE assigning
// on a zero total, and was not called at all for a tilted end -- so the
// documented invariant "arming replaces any previous schedule wholesale" held
// only when the NEXT ball also had a nonzero, untilted bonus. A single-player
// game is the reachable shape: both ball ends carry player index 0, which is
// exactly what `advanceBackglass()`'s own `stepEvent.player ===
// heldBallEnded.player` guard cannot filter, so ball 1's leftover steps
// rendered a BONUS row over ball 2's own `ball_ended` screen. This also means
// AC 5's and the "Zero bonus" row's "no `bonus_count_step` is emitted" held
// only by the accident that nothing had been armed earlier in those runs.
describe('A ball end always ends the PREVIOUS ball\'s count-up, armed or not', () => {
	it('a zero-bonus ball ending inside the previous ball\'s count-up window cancels it: no bonus_count_step survives the second ball_ended', () => {
		const seededBonus: PlayerBonusState = { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 3 };
		const initial = gameState({ currentPlayer: 0, players: [player({ bonus: seededBonus })], ballsInPlay: 1 });
		// Ball 1 drains at tick 1 and arms three steps (401 / 801 / 1201). Ball 2
		// -- whose bonus `startBall()` reset to empty on that same tick -- drains
		// at tick 2, well inside that window, and arms nothing.
		const script = close('s_trough_1').at(1).close('s_trough_2').at(2);
		const result = runRulesScript(script.build(), { durationTicks: 1 + 1300, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		const ends = result.events.filter((e) => e.type === 'ball_ended');
		expect(ends, 'sanity: both drains must genuinely end a ball, or this scenario never happened').toHaveLength(2);
		expect(ends[1]!.tick, 'sanity: the second end must land INSIDE ball 1\'s own count-up window').toBeLessThan(1 + 400);

		const leaked = result.events.filter((e) => e.type === 'bonus_count_step' && e.tick > ends[1]!.tick);
		expect(leaked, 'ball 1\'s schedule must be cancelled by ball 2\'s own end, never keep draining over it').toEqual([]);
	});
});

// Code review 2026-09-08 (blind-hunter): AC 2's ladder test never drains and
// AC 3's payment test SEEDS `multiplier: 3` directly, so `advanceBonusMultiplier()`'s
// write and `bonusTotal()`'s read were each covered but never in the same run --
// the seam this whole story exists for was untested end to end.
describe('AC 2 x AC 3 -- the multiplier a player EARNS is the multiplier that pays', () => {
	it.each([0, 1] as const)('three Top-lane completions take the ladder to 5x through the real rules.step() path, and the drain pays the letter at 5x (currentPlayer %i)', (currentPlayer) => {
		const initial = gameState({
			currentPlayer,
			players: twoPlayers(currentPlayer),
			modes: [{ mode: 'base', priority: 100, player: currentPlayer }],
			ballsInPlay: 1,
		});
		const script = close('s_top_1').at(1).close('s_top_2').at(2).close('s_top_3').at(3)
			.close('s_top_1').at(4).close('s_top_2').at(5).close('s_top_3').at(6)
			.close('s_top_1').at(7).close('s_top_2').at(8).close('s_top_3').at(9)
			.close(TABLE.dropBankWiring.d.switch).at(10)
			.close('s_trough_1').at(11);
		const result = runRulesScript(script.build(), { durationTicks: 11, initialState: initial, tuning: NO_BALL_SAVE_TUNING });

		expect(
			result.statesByTick.get(9)!.players[currentPlayer]!.bonus.multiplier,
			'sanity: the ladder must genuinely have been climbed by real lane completions, not seeded',
		).toBe(5);

		const ended = result.events.find((e) => e.type === 'ball_ended');
		expect(ended, 'sanity: the drain must genuinely end the ball').toBeDefined();
		if (ended!.type !== 'ball_ended') {
			throw new Error('unreachable: filtered on type ball_ended above');
		}
		expect(ended!.multiplier, 'the payload carries the EARNED multiplier').toBe(5);
		// Authored literal: 1 letter * bonusLetterValue(5000) * the EARNED
		// multiplier(5) = 25000 -- never read back from tuning.ts (vacuity #43).
		expect(ended!.total).toBe(25000);
		expect(result.finalState.players[currentPlayer]!.score, 'the earned multiplier is what reaches the score').toBe(25000);
	});
});

// Code review 2026-09-08 (blind-hunter): `BONUS_CATEGORIES` is typed
// `readonly BonusCategory[]`, not a tuple over the union, so adding a fourth
// category to `BonusCategory` would be caught at `BONUS_EMPTY` (a TOTAL
// record) and at `valueOf()`'s switch, but omitting it HERE would make
// `bonusTotal()`'s Sigma and the count-up silently skip it, with no compile
// error and no test failure.
describe('The bonus vocabulary is complete, and its iteration order is pinned', () => {
	it('BONUS_CATEGORIES carries every category BONUS_EMPTY declares, in the documented order', () => {
		// The literal is authored here as an INDEPENDENT anchor on the order the
		// count-up's running subtotals depend on (AC 4), not read back from the
		// module under test.
		expect([...BONUS_CATEGORIES]).toEqual(['letters', 'loops', 'strikes']);
		// ... and this half is what a fourth union member would trip:
		// `BONUS_EMPTY.byCategory` is a total `Record<BonusCategory, number>`, so
		// the type system forces the new key to appear there.
		expect([...BONUS_CATEGORIES].sort()).toEqual(Object.keys(PRODUCTION_BONUS_EMPTY.byCategory).sort());
	});
});
