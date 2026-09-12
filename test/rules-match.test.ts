// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13: headless coverage for `sim/rules/match.ts`'s own pure draw
// functions (AC 2's "draw units" clauses, the I/O Matrix's own "Weighted
// draw" row) and, through `runRulesScript()` (`test/util/switch-script.ts`),
// the ball controller's own game-over TIMELINE (AC 2's own real-sequence
// clauses, AC 3 and AC 11) -- no physics, no rendering, no `sim/loop` (AC 9,
// pinned transitively by `test/rules-devices-headless.test.ts`).
//
// Every literal tick/step/shown value below is authored directly at the
// probe, never re-imported from `tuning.ts`/`match.ts` (Rule 19 shape 3):
// production `matchDelayTicks` (5000), `matchRevealTicks` (250) and
// `attractTicks` (8000) at TICK_HZ 1000.

import { describe, expect, it } from 'vitest';
import { drawMatch, matchNumberFor, revealShown, MATCH_NUMBERS, MATCH_REVEAL_STEPS } from '../src/sim/rules/match';
import { HARDWARE_COILS } from '../src/sim/rules/ball-controller';
import { DEFAULT_ADJUSTMENTS, createRules } from '../src/sim/rules';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript } from './util/switch-script';
import type { GameState, SwitchEvent } from '../src/sim/table/names';

/**
 * The identical literal `DEFAULT_INITIAL_STATE` `test/util/switch-script.ts`
 * uses internally (not exported -- copied here, not re-derived, since this
 * describe block drives `createRules()` directly rather than through
 * `runRulesScript()`, to keep ONE instance alive across an out-of-order tick
 * -- see the block's own header comment for why).
 */
function freshAttractState(): GameState {
	return {
		tick: 0,
		phase: 'attract',
		machine: {
			ballsInPlay: 0,
			hardwareEnabled: false,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] },
		},
		players: [],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

/** Same reasoning as `test/rules-lifecycle.test.ts`'s own override: a scripted plunge and drain only 10 ticks apart sit comfortably inside production `ballSaveMs` -- shrunk to near-zero so the scripted drain is a real end, not a save. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

/** Production tuning, resolved once -- AC 11's own script never plunges (it drives ballsInPlay via `initialState` directly), so no ball-save override is needed there. */
const PRODUCTION_TUNING = resolveTuning();

describe('sim/rules/match.ts -- MATCH_NUMBERS / MATCH_REVEAL_STEPS', () => {
	it('MATCH_NUMBERS is 0..90 step 10, ten members; MATCH_REVEAL_STEPS is its own length', () => {
		expect(MATCH_NUMBERS).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
		expect(MATCH_REVEAL_STEPS).toBe(10);
	});
});

describe('sim/rules/match.ts -- matchNumberFor() (AC 2, I/O Matrix "Weighted draw")', () => {
	it('over rng states 0-99,999 with scores [25000] and p = 0.08: every number is in {0,...,90} step 10, all ten occur, and the win fraction lies in 0.08 +/- 0.0035 (4 sigma of the binomial, N = 100,000)', () => {
		const seen = new Set<number>();
		let wins = 0;
		const total = 100_000;
		for (let rng = 0; rng < total; rng++) {
			const drawn = drawMatch(rng, [25000], 0.08);
			expect(MATCH_NUMBERS).toContain(drawn.number);
			seen.add(drawn.number);
			if (drawn.winners.length > 0) {
				wins += 1;
			}
		}
		expect(seen.size, 'all ten numbers must occur across 100,000 draws').toBe(10);
		const fraction = wins / total;
		// 4 sigma of Binomial(100000, 0.08): sqrt(100000 * 0.08 * 0.92) ~= 85.75;
		// as a fraction of N, 4 * 85.75 / 100000 ~= 0.00343 -- the spec's own
		// authored tolerance (0.0035) is used directly, never re-derived here.
		expect(fraction, `win fraction ${fraction} must lie in 0.08 +/- 0.0035`).toBeGreaterThanOrEqual(0.08 - 0.0035);
		expect(fraction).toBeLessThanOrEqual(0.08 + 0.0035);
	});

	it('matchNumberFor at v = 0.0799999 with p = 0.08 wins; at v = 0.08 (on the bound) it loses', () => {
		const winning = matchNumberFor(0.0799999, [25000], 0.08);
		expect(winning.winners.length, 'strictly below p must win').toBeGreaterThan(0);
		const losing = matchNumberFor(0.08, [25000], 0.08);
		expect(losing.winners.length, 'exactly at p (never <) must lose').toBe(0);
	});

	it('with W = the empty set (scores [25005], no player value a multiple of ten), every draw has winners: [] -- uniform over all ten, p unconsulted', () => {
		for (const v of [0, 0.05, 0.08, 0.2, 0.5, 0.79, 0.999]) {
			for (const p of [0, 0.08, 0.5, 1]) {
				const drawn = matchNumberFor(v, [25005], p);
				expect(drawn.winners, `v=${v} p=${p}`).toEqual([]);
				expect(MATCH_NUMBERS, `v=${v} p=${p}`).toContain(drawn.number);
			}
		}
	});

	it('p = 1.5 behaves as 1 (always draws from W when non-empty); p = -0.2 behaves as 0 (always draws from C)', () => {
		const highP = matchNumberFor(0.999, [25000], 1.5);
		expect(highP.winners, 'clamped to 1: even the highest v must still win').toEqual([0]);
		const lowP = matchNumberFor(0, [25000], -0.2);
		expect(lowP.winners, 'clamped to 0: even v = 0 must lose').toEqual([]);
	});

	it('winners with scores [100, 250, 3100] and number 0 are [0, 2] -- ascending player index, never score order', () => {
		// W = {0, 50} (100%100=0, 250%100=50, 3100%100=0), MATCH_NUMBERS-ordered
		// ascending -> W = [0, 50]. p = 1 forces a win; v in [0, 0.5) picks
		// index 0 of W (floor(v/p*|W|) = floor(2v)).
		const drawn = matchNumberFor(0.25, [100, 250, 3100], 1);
		expect(drawn.number).toBe(0);
		expect(drawn.winners).toEqual([0, 2]);
	});

	it('does not throw for any v/p combination, including out-of-range p', () => {
		expect(() => matchNumberFor(0.5, [0], 5)).not.toThrow();
		expect(() => matchNumberFor(0.5, [0], -5)).not.toThrow();
		expect(() => matchNumberFor(0.5, [], 0.08)).not.toThrow();
	});
});

describe('sim/rules/match.ts -- drawMatch() (AC 2, AD-3: exactly one nextRng() step)', () => {
	it('advances rng exactly once, and its number/winners agree with matchNumberFor() fed the SAME advanced value', () => {
		const before = 12345;
		const drawn = drawMatch(before, [25000], 0.08);
		expect(drawn.rng).not.toBe(before);
		// A second draw from the SAME advanced rng must differ in general from
		// a re-draw at the ORIGINAL rng -- proving this really advanced, not a
		// pass-through.
		const redrawnFromOriginal = drawMatch(before, [25000], 0.08);
		expect(redrawnFromOriginal.rng, 'drawMatch is a pure function of its rng argument').toBe(drawn.rng);
	});
});

describe('sim/rules/match.ts -- revealShown() (I/O Matrix "Reveal")', () => {
	it('(number + 10*step) mod 100; step 10 shows number itself', () => {
		expect(revealShown(0, 1)).toBe(10);
		expect(revealShown(0, 10)).toBe(0);
		expect(revealShown(30, 1)).toBe(40);
		expect(revealShown(30, 10)).toBe(30);
		expect(revealShown(90, 2)).toBe(10);
	});
});

/**
 * Production tuning's own game-over sequence marks, authored as literals
 * (never imported): matchDelayTicks 5000, matchRevealTicks 250 (x10 = 2500),
 * attractTicks 8000, at TICK_HZ 1000.
 */
const MATCH_DELAY_TICKS = 5000;
const REVEAL_STEP_TICKS = 250;
const ATTRACT_TICKS = 8000;

/** A single-player, single-ball-per-game script: Start, plunge, drain at G = 20 -- the last (only) ball of the only player, so the drain is game over. `NO_BALL_SAVE_TUNING`-shaped override keeps this scripted drain from being intercepted as a save (the plunge and the drain sit well inside production ballSaveMs otherwise). */
function gameOverScript() {
	return close('s_start').at(2).open('s_shooter_lane').at(10).close('s_trough_1').at(20).build();
}

const G = 20;
const MATCH_TICK = G + MATCH_DELAY_TICKS;
const RESOLVED_TICK = MATCH_TICK + MATCH_REVEAL_STEPS * REVEAL_STEP_TICKS;
const ATTRACT_TICK = RESOLVED_TICK + ATTRACT_TICKS;

describe('the game-over timeline, driven headless through a real ball controller (AC 2, AC 3)', () => {
	it('run W (matchProbability 1): game_ended at G, match_drawn at G+5000 with number 0 / winners [0], the shown sequence [10,20,...,90,0], and Attract at resolvedTick+8000', () => {
		const result = runRulesScript(gameOverScript(), {
			durationTicks: ATTRACT_TICK + 1,
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 1 },
		});

		const atG = result.statesByTick.get(G)!;
		expect(atG.phase, 'the drain ends the only ball of the only player -- game over').toBe('game_over');
		const eventsAtG = result.events.filter((e) => e.tick === G).map((e) => e.type);
		const endedIndex = eventsAtG.indexOf('ball_ended');
		const gameEndedIndex = eventsAtG.indexOf('game_ended');
		expect(endedIndex, 'ball_ended must arrive at G').toBeGreaterThanOrEqual(0);
		expect(gameEndedIndex, 'game_ended must arrive at G, after ball_ended').toBeGreaterThan(endedIndex);
		const gameEnded = result.events.find((e) => e.type === 'game_ended' && e.tick === G);
		expect(gameEnded).toMatchObject({ scores: [0] });
		expect(result.events.some((e) => e.type === 'match_drawn' && e.tick < MATCH_TICK), 'no match_drawn before matchTick').toBe(false);

		const drawn = result.events.find((e) => e.type === 'match_drawn');
		expect(drawn, 'match_drawn must arrive exactly at matchTick').toMatchObject({ tick: MATCH_TICK, number: 0, winners: [0] });

		const steps = result.events.filter((e) => e.type === 'match_reveal_step');
		expect(steps).toHaveLength(10);
		const shownSequence = steps.map((s) => (s.type === 'match_reveal_step' ? s.shown : -1));
		expect(shownSequence).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 0]);
		expect(steps.map((s) => s.tick)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => MATCH_TICK + k * REVEAL_STEP_TICKS));

		expect(result.statesByTick.get(ATTRACT_TICK - 1)!.phase, 'still game_over one tick before the Attract transition').toBe('game_over');
		const atAttract = result.statesByTick.get(ATTRACT_TICK)!;
		expect(atAttract.phase).toBe('attract');
		expect(atAttract.modes).toEqual([]);
		expect(atAttract.machine.hardwareEnabled).toBe(false);
		const disablesAtAttract = result.coilCommands.filter((c) => c.tick === ATTRACT_TICK && c.action === 'disable').map((c) => c.coil);
		for (const coil of HARDWARE_COILS) {
			expect(disablesAtAttract).toContain(coil);
		}

		// Display-only (AC 2): the score is unchanged by the whole reveal.
		expect(result.statesByTick.get(RESOLVED_TICK)!.players[0]!.score).toBe(0);
		expect(result.statesByTick.get(G)!.players[0]!.score).toBe(0);
	});

	it('run L (matchProbability 0): match_drawn.winners is [] and number is a non-zero multiple of ten', () => {
		const result = runRulesScript(gameOverScript(), {
			durationTicks: RESOLVED_TICK + 1,
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 0 },
		});
		const drawn = result.events.find((e) => e.type === 'match_drawn');
		expect(drawn).toBeDefined();
		if (drawn && drawn.type === 'match_drawn') {
			expect(drawn.winners).toEqual([]);
			expect(drawn.number).not.toBe(0);
			expect(drawn.number % 10).toBe(0);
		}
	});
});

describe('AC 3 -- leaving game over', () => {
	function runTwin(pressAt: readonly number[], releaseAt: readonly number[]): ReturnType<typeof runRulesScript> {
		let script = close('s_start').at(2).open('s_shooter_lane').at(10).close('s_trough_1').at(20);
		for (let i = 0; i < pressAt.length; i++) {
			script = script.close('s_start').at(pressAt[i]!);
			if (releaseAt[i] !== undefined) {
				script = script.open().at(releaseAt[i]!);
			}
		}
		return runRulesScript(script.build(), {
			durationTicks: ATTRACT_TICK + 10,
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 0 },
		});
	}

	it('(i) no Start: phase reads game_over at R+7999 and attract at R+8000; hardwareEnabled false, modes [], the disable batch issued', () => {
		const result = runTwin([], []);
		expect(result.statesByTick.get(RESOLVED_TICK + 7999)!.phase).toBe('game_over');
		const atAttract = result.statesByTick.get(RESOLVED_TICK + 8000)!;
		expect(atAttract.phase).toBe('attract');
		expect(atAttract.machine.hardwareEnabled).toBe(false);
		expect(atAttract.modes).toEqual([]);
		expect(result.coilCommands.some((c) => c.tick === RESOLVED_TICK + 8000 && c.action === 'disable')).toBe(true);
	});

	it('(ii) Start at R-5 (released at R-3) is ignored; Start at R starts a new game; the phase is still "game" at R+8000', () => {
		const result = runTwin([RESOLVED_TICK - 5, RESOLVED_TICK], [RESOLVED_TICK - 3]);
		const beforeR = result.events.filter((e) => e.tick === RESOLVED_TICK - 5);
		expect(beforeR.some((e) => e.type === 'ball_will_start'), 'the R-5 press must be ignored (before resolution)').toBe(false);
		expect(result.statesByTick.get(RESOLVED_TICK - 5)!.phase, 'must still read game_over').toBe('game_over');

		const atR = result.events.filter((e) => e.tick === RESOLVED_TICK);
		expect(atR.some((e) => e.type === 'ball_will_start'), 'the press at R (>= resolvedTick) must start a new game').toBe(true);
		const stateAtR = result.statesByTick.get(RESOLVED_TICK)!;
		expect(stateAtR.phase).toBe('game');
		expect(stateAtR.players).toHaveLength(1);
		expect(stateAtR.players[0]!.score).toBe(0);
		expect(stateAtR.players[0]!.ballNumber).toBe(1);
		expect(stateAtR.machine.ballsInPlay).toBe(0);

		expect(result.statesByTick.get(RESOLVED_TICK + 8000)!.phase, 'the new game must never be swept into the OLD Attract transition').toBe('game');
	});

	it('(iii) players is non-empty in Attract after (i); after Start it is exactly one fresh player', () => {
		const noStart = runTwin([], []);
		const inAttract = noStart.statesByTick.get(RESOLVED_TICK + 8000)!;
		expect(inAttract.players.length, 'Attract cycles the last game\'s scores -- players is kept, not cleared').toBeGreaterThan(0);

		const withLateStart = runTwin([ATTRACT_TICK + 5], []);
		const afterStart = withLateStart.statesByTick.get(ATTRACT_TICK + 5)!;
		expect(afterStart.phase).toBe('game');
		expect(afterStart.players).toHaveLength(1);
	});
});

describe('AC 11 (DW-235) -- a new game drops the previous game\'s count-up', () => {
	const D = 10;

	function midGameState(): GameState {
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
				deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] },
			},
			players: [
				{
					score: 0,
					letters: 'AB',
					lockCredits: 0,
					tiltWarnings: 0,
					bonus: { byCategory: { letters: 2, loops: 0, strikes: 0 }, multiplier: 1 },
					lanes: { lit: {}, completedSets: [] },
					extraBalls: 0,
					jackpotSeed: 0,
					warsStarted: 0,
					modesPlayed: [],
					ballNumber: 1,
				},
			],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};
	}

	function script(withStart: boolean) {
		let s = close('s_trough_1').at(D).close('s_slam_tilt').at(D + 100).open().at(D + 101);
		if (withStart) {
			s = s.close('s_start').at(D + 200);
		}
		return s.build();
	}

	it('with the Start press at D+200: no bonus_count_step arrives at or after D+200 (the control below proves one otherwise would, at D+400)', () => {
		const result = runRulesScript(script(true), {
			durationTicks: D + 450,
			tuning: PRODUCTION_TUNING,
			adjustments: { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
			initialState: midGameState(),
		});
		const late = result.events.filter((e) => e.type === 'bonus_count_step' && e.tick >= D + 200);
		expect(late, 'DW-235: a new game must clear the previous game\'s pending count-up').toEqual([]);
	});

	it('the IDENTICAL script WITHOUT the Start press emits bonus_count_step at D+400 -- the positive proving the schedule was genuinely armed', () => {
		const result = runRulesScript(script(false), {
			durationTicks: D + 450,
			tuning: PRODUCTION_TUNING,
			adjustments: { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0 },
			initialState: midGameState(),
		});
		const stepAt400 = result.events.find((e) => e.type === 'bonus_count_step' && e.tick === D + 400);
		expect(stepAt400, 'without a Start, the armed schedule must still fire at D+400').toBeDefined();
	});
});

describe('AC 12 -- DEFAULT_ADJUSTMENTS.matchProbability', () => {
	it('is 0.08 (the table default, TUNING.matchProbability.value)', () => {
		expect(DEFAULT_ADJUSTMENTS.matchProbability).toBe(0.08);
	});
});

/**
 * I/O & Edge-Case Matrix, "Restarted timeline": "A game-over mark from a
 * later tick than the current one | It is discarded: no Attract transition
 * and no step from it." Boundaries & Constraints (AD-7, closure state):
 * `gameOverSequence` must be "reset-safe: a mark strictly greater than
 * `tick` is discarded, following the `tilt.ts:88-97` precedent" --
 * `ball-controller.ts`'s own `armTick` guard (`if (gameOverSequence !== null
 * && tick < gameOverSequence.armTick) gameOverSequence = null;`).
 *
 * `runRulesScript()` can never exercise this: it always builds a FRESH
 * `createRules()` (and so a fresh, closure-empty ball controller) per call,
 * and it only ever steps ticks forward in order. This describe block drives
 * `createRules()` directly instead, across two out-of-order phases on ONE
 * instance -- the SAME technique `test/rules-tilt.test.ts`'s own "a stale
 * mark from a DIFFERENT (higher) timeline is discarded when tick restarts
 * lower" test uses for `createTiltController()` (that test's own header
 * comment: "the only way to exercise the branch at all").
 */
describe('reset-safety -- I/O Matrix "Restarted timeline": a stale gameOverSequence armed at a HIGH tick is discarded when the tick count restarts LOWER', () => {
	function stepThrough(rules: ReturnType<typeof createRules>, state: GameState, script: readonly SwitchEvent[], fromTick: number, toTick: number): GameState {
		let current = state;
		for (let tick = fromTick; tick <= toTick; tick++) {
			const edgesThisTick = script.filter((e) => e.tick === tick);
			const result = rules.step(current, edgesThisTick, tick);
			current = result.state;
		}
		return current;
	}

	it('a stale sequence armed at armTick=20 (old resolvedTick ~22520) never fires match_drawn/reveal/Attract on a restarted LOW-tick timeline; Start succeeds immediately there instead of waiting for the stale resolvedTick -- the positive proving the discard, not merely a still-pending wait', () => {
		const rules = createRules(NO_BALL_SAVE_TUNING, { pitchDeg: 0, tiltWarnings: 1, ballsPerGame: 1, matchProbability: 0 });
		const armingScript = close('s_start').at(2).open('s_shooter_lane').at(10).close('s_trough_1').at(20).build();

		// Phase 1 (the ORIGINAL, high timeline): drive ticks 1..20 -- Start,
		// serve, drain -- exactly `gameOverScript()`/`G` above. Ball 1 of 1
		// ends the (only) player's (only) ball: game over, armTick = 20,
		// matchTick = 5020, resolvedTick = 22520.
		let state = stepThrough(rules, freshAttractState(), armingScript, 1, 20);
		expect(state.phase, 'sanity: armed -- the drain at tick 20 is game over').toBe('game_over');

		// Phase 2 (the RESTARTED, low timeline): the tick counter itself
		// restarts at 1 on the SAME `rules` instance (`hostLoop.reset()`'s own
		// shape -- a fresh `createLoop()`/`createRules()` in production, this
		// test's own direct-instance drive is "defence in depth for any caller
		// that reuses ONE controller across a restarted tick count", the
		// identical justification `rules-tilt.test.ts`'s own precedent test
		// gives). No switch edges: a quiet run from 1 through 100, far short of
		// the OLD matchTick (5020) let alone the OLD resolvedTick (22520).
		state = stepThrough(rules, state, [], 1, 100);
		expect(state.phase, 'no Attract transition from the stale sequence anywhere in the restarted run').toBe('game_over');

		// The positive: Start at tick 101 -- WAY below the stale sequence's own
		// resolvedTick (22520) -- must succeed immediately. If the stale
		// sequence had NOT been discarded, `gameOverResolved` requires `tick >=
		// gameOverSequence.resolvedTick`, which 101 is nowhere near: the Start
		// press would be ignored and `phase` would stay `game_over`. Success
		// here is only possible because the restart discarded it, letting
		// `gameOverSequence === null` count as resolved.
		const afterStart = stepThrough(rules, state, close('s_start').at(101).build(), 101, 101);
		expect(afterStart.phase, 'Start on the restarted timeline starts a new game immediately -- the stale sequence is genuinely gone, not merely still pending').toBe('game');
		expect(afterStart.players).toHaveLength(1);
	});
});
