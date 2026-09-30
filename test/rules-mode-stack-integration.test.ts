// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8, DW-209): the mode stack inside a whole `createRules()`,
// driven by `runRulesScript()` -- the three Slam rows of the I/O Matrix and
// their controls (AC8), the ball-end rows (AC5), the event-major pair (AC3)
// and the Integration AC through the Backglass fold (AC7, Rule 1). Named
// `-integration` because each row composes the devices layer, the tilt
// controller, the ball controller and the stack end to end (and AC7 the
// Backglass); `test/rules-mode-stack.test.ts` holds the headless unit rows.
//
// Expected values come from `resolveTuning()`, `MODE_PRIORITIES`, `TABLE`
// and `nextRngInt()` applied to the seed -- never from the value under test.

import { describe, expect, it } from 'vitest';
import { createBallController } from '../src/sim/rules/ball-controller';
import { createProductionModeRegistry, MODE_PRIORITIES, type ModeDefinition, type ModeEvent, type ModeLookup } from '../src/sim/rules/modes';
import { createTiltController } from '../src/sim/rules/tilt';
import { nextRngInt } from '../src/sim/rules/rng';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW } from '../src/presentation/backglass/frame';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, open, runRulesScript } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { PlayerState } from '../src/sim/contracts/state';
import type { FrameOutput, GameState, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();

/** Ball save shrunk to nothing, so a scripted drain ends the ball instead of re-serving it (the `test/rules-modes.test.ts` precedent). */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

const ADJUSTMENTS: GameAdjustments = { pitchDeg: 0, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

type LaneName = keyof typeof TABLE.laneWiring;

/** The Top set in `order` -- the skill shot's own `TOP_LANES`, re-derived from `TABLE`. */
const TOP_LANES: readonly LaneName[] = (Object.keys(TABLE.laneWiring) as LaneName[])
	.filter((lane) => TABLE.laneWiring[lane].set === 'top')
	.sort((a, b) => TABLE.laneWiring[a].order - TABLE.laneWiring[b].order);

const POP_SWITCH = Object.values(TABLE.popWiring)[0]!.switch as SwitchName;

/** The first DRAGON letter, as the skill shot awards it on an empty `letters`. */
const FIRST_LETTER = Object.keys(TABLE.dropBankWiring)[0]!.toUpperCase();

/** A game's first draw from `seed`: the lit Top lane's switch and the rng after it. */
function firstDraw(seed: number): { readonly lane: LaneName; readonly switch: SwitchName; readonly rng: number } {
	const draw = nextRngInt(seed, TOP_LANES.length);
	const lane = TOP_LANES[draw.value]!;
	return { lane, switch: TABLE.laneWiring[lane].switch as SwitchName, rng: draw.rng };
}

function attractState(rng: number): GameState {
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
		rng,
	};
}

function player(ballNumber: number, overrides: Partial<PlayerState> = {}): PlayerState {
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
		modesPlayed: [],
		modesLit: [],
		ballNumber,
		...overrides,
	};
}

/** A mid-ball state: player 0's ball in play, [base, skill_shot (launched)] active. */
function midBall(players: readonly PlayerState[], lit: Record<string, boolean> = {}): GameState {
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
		players: players.map((p, index) => (index === 0 ? { ...p, lanes: { lit, completedSets: [] } } : p)),
		currentPlayer: 0,
		modes: [
			{ mode: 'base', priority: MODE_PRIORITIES.base, player: 0 },
			{ mode: 'skill_shot', priority: MODE_PRIORITIES.skill_shot, player: 0, launched: true },
		],
		rng: 0,
	};
}

function freshPair(playerIndex: number): GameState['modes'] {
	return [
		{ mode: 'base', priority: MODE_PRIORITIES.base, player: playerIndex },
		{ mode: 'skill_shot', priority: MODE_PRIORITIES.skill_shot, player: playerIndex, launched: false },
	];
}

function triple(mode: string, kind: 'start' | 'stop'): string[] {
	return kind === 'start'
		? [`mode_${mode}_will_start`, `mode_${mode}_starting`, `mode_${mode}_started`]
		: [`mode_${mode}_will_stop`, `mode_${mode}_stopping`, `mode_${mode}_stopped`];
}

function typesAt(modeEvents: readonly ModeEvent[], tick: number): string[] {
	return modeEvents.filter((event) => event.tick === tick).map((event) => event.type);
}

function hasDuplicate(modes: GameState['modes']): boolean {
	const keys = modes.map((m) => `${m.mode}/${m.player}`);
	return new Set(keys).size !== keys.length;
}

// ---------------------------------------------------------------------------
// AC8 (DW-209) -- the three Slam rows.
// ---------------------------------------------------------------------------

describe('AC8 (DW-209) -- a Slam never leaves live modes in Attract, and the next Start runs exactly one fresh pair', () => {
	const SEED = 7;
	const draw1 = firstDraw(SEED);
	const draw2 = nextRngInt(draw1.rng, TOP_LANES.length);

	it('Matrix row "Ball start, same tick": at the Start tick modes[] = [base, skill_shot], rng = one draw, modeEvents = base\'s start triple then skill_shot\'s', () => {
		const result = runRulesScript(close('s_start').at(5).build(), { durationTicks: 5, initialState: attractState(SEED), adjustments: ADJUSTMENTS });
		const atStart = result.statesByTick.get(5)!;
		expect(atStart.modes).toEqual(freshPair(0));
		expect(atStart.rng).toBe(draw1.rng);
		expect(result.modeEvents.filter((event) => event.tick === 5)).toEqual(
			[...triple('base', 'start'), ...triple('skill_shot', 'start')].map((type) => ({
				type,
				mode: type.startsWith('mode_base') ? 'base' : 'skill_shot',
				player: 0,
				tick: 5,
			})),
		);
	});

	it('Matrix row "Slam after start": Slam at 6 stops both modes there; every Attract tick has modes [], rng one draw, all scores 0 (a plunge and the lit lane change nothing); Start at 20 runs exactly one fresh pair on two draws', () => {
		const script = close('s_start').at(5)
			.close('s_slam_tilt').at(6)
			.open('s_shooter_lane').at(10)
			.close(draw1.switch).at(12)
			.close('s_start').at(20)
			.build();
		const result = runRulesScript(script, { durationTicks: 22, initialState: attractState(SEED), adjustments: ADJUSTMENTS });

		const atSlam = result.statesByTick.get(6)!;
		expect(atSlam.phase).toBe('attract');
		expect(atSlam.modes).toEqual([]);
		expect(typesAt(result.modeEvents, 6), 'the Slam\'s stop triples, skill_shot then base').toEqual([...triple('skill_shot', 'stop'), ...triple('base', 'stop')]);

		for (let tick = 6; tick < 20; tick++) {
			const state = result.statesByTick.get(tick)!;
			expect(state.phase, `tick ${tick}: Attract`).toBe('attract');
			expect(state.modes, `tick ${tick}: no mode lives in Attract`).toEqual([]);
			expect(state.rng, `tick ${tick}: rng is still exactly the game's one draw`).toBe(draw1.rng);
			expect(state.players.map((p) => p.score), `tick ${tick}: nothing scores in Attract`).toEqual([0]);
			if (tick > 6) {
				expect(typesAt(result.modeEvents, tick), `tick ${tick}: no lifecycle event in Attract`).toEqual([]);
			}
		}
		expect(typesAt(result.modeEvents, 20), 'the next Start: the base start triple, then the skill_shot one, and nothing else').toEqual([
			...triple('base', 'start'),
			...triple('skill_shot', 'start'),
		]);

		for (const tick of [20, 21, 22]) {
			const state = result.statesByTick.get(tick)!;
			expect(state.modes, `tick ${tick}: exactly one fresh [base, skill_shot]`).toEqual(freshPair(0));
			expect(state.rng, `tick ${tick}: exactly two draws`).toBe(draw2.rng);
		}
	});

	it('control, "Slam control": the same script without the Slam -- the lit Top lane pays skillShotAward and the first letter to player 0, and modes[] never holds a duplicate', () => {
		const script = close('s_start').at(5)
			.open('s_shooter_lane').at(10)
			.close(draw1.switch).at(12)
			.close('s_start').at(20)
			.build();
		const result = runRulesScript(script, { durationTicks: 22, initialState: attractState(SEED), adjustments: ADJUSTMENTS });

		const paid = result.statesByTick.get(12)!.players[0]!;
		expect(paid.score).toBe(TUNING.skillShotAward.value);
		expect(paid.letters).toBe(FIRST_LETTER);
		for (let tick = 1; tick <= 22; tick++) {
			expect(hasDuplicate(result.statesByTick.get(tick)!.modes), `tick ${tick}: no duplicate mode entry`).toBe(false);
		}
	});

	it('Matrix row "Slam and Start on one tick": Start 5, then Slam + Start at 6 -- tick 6 holds one fresh pair on two draws, and tick 7 is unchanged', () => {
		const script = close('s_start').at(5).close('s_slam_tilt').at(6).close('s_start').at(6).build();
		const result = runRulesScript(script, { durationTicks: 7, initialState: attractState(SEED), adjustments: ADJUSTMENTS });

		const at6 = result.statesByTick.get(6)!;
		expect(at6.phase).toBe('game');
		expect(at6.modes).toEqual(freshPair(0));
		expect(at6.rng).toBe(draw2.rng);
		expect(typesAt(result.modeEvents, 6), 'the Slam\'s stops, then the new game\'s starts').toEqual([
			...triple('skill_shot', 'stop'),
			...triple('base', 'stop'),
			...triple('base', 'start'),
			...triple('skill_shot', 'start'),
		]);

		const at7 = result.statesByTick.get(7)!;
		expect(at7.modes).toEqual(freshPair(0));
		expect(at7.rng).toBe(draw2.rng);
		for (const tick of [6, 7]) {
			expect(result.statesByTick.get(tick)!.players.map((p) => p.score), `tick ${tick}: every player's score is 0`).toEqual([0]);
		}
	});
});

// ---------------------------------------------------------------------------
// AC5 -- the ball end stops every mode before ball_ended.
// ---------------------------------------------------------------------------

describe('AC5 -- the ball end: every active mode gets its stop triple, the controller returns modes [], nothing of the ending player survives', () => {
	it('Matrix row "Ball end, rotation" (controller level): the state returned alongside ball_ended has modes [], and modeEvents are the stop triples, skill_shot then base', () => {
		const controller = createBallController(ADJUSTMENTS, NO_BALL_SAVE_TUNING);
		const state: GameState = { ...midBall([player(1), player(0)]), machine: { ...midBall([player(1), player(0)]).machine, ballsInPlay: 0 } };
		const result = controller.step(state, [{ type: 'device_ball_entered', device: 'bd_trough', slot: 3, tick: 1 }], 1, { recovered: null, failures: [] });

		expect(result.events.map((event) => event.type)).toContain('ball_ended');
		expect(result.state.modes).toEqual([]);
		expect(result.modeEvents.map((event) => event.type)).toEqual([...triple('skill_shot', 'stop'), ...triple('base', 'stop')]);
		// Story 3.4 (DW-293): the ball end no longer credits the active modes' names.
		expect(result.state.players[0]!.modesPlayed, 'the ball end credits nothing to modesPlayed (DW-293)').toEqual([]);
	});

	it('Matrix row "Ball end, rotation" (rules level): that tick\'s modeEvents are the stop triples then player 1\'s start triples; the end state holds player 1\'s entries only', () => {
		const result = runRulesScript(close('s_trough_4').at(1).build(), {
			durationTicks: 1,
			initialState: midBall([player(1), player(0)]),
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: ADJUSTMENTS,
		});
		expect(result.events.some((event) => event.type === 'ball_ended' && event.player === 0)).toBe(true);
		expect(typesAt(result.modeEvents, 1)).toEqual([
			...triple('skill_shot', 'stop'),
			...triple('base', 'stop'),
			...triple('base', 'start'),
			...triple('skill_shot', 'start'),
		]);
		expect(result.finalState.modes).toEqual(freshPair(1));
		expect(result.finalState.modes.some((m) => m.player === 0)).toBe(false);
	});

	it('Matrix row "Last ball": one player on the last ball drains -- modes [] after the drain tick, the stop triples fire, game_over', () => {
		const result = runRulesScript(close('s_trough_4').at(1).build(), {
			durationTicks: 2,
			initialState: midBall([player(ADJUSTMENTS.ballsPerGame)]),
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: ADJUSTMENTS,
		});
		const after = result.statesByTick.get(1)!;
		expect(after.phase).toBe('game_over');
		expect(after.modes).toEqual([]);
		expect(typesAt(result.modeEvents, 1)).toEqual([...triple('skill_shot', 'stop'), ...triple('base', 'stop')]);
		expect(result.statesByTick.get(2)!.modes).toEqual([]);
	});

	/** The production registry, each definition wrapped with logging stop hooks -- what a later mode's `_stopping` / `_stopped` work looks like to the controllers. */
	function loggingStopLookup(seen: string[]): ModeLookup {
		const production = createProductionModeRegistry(NO_BALL_SAVE_TUNING);
		const present = (state: GameState, name: string): boolean => state.modes.some((m) => m.mode === name);
		return {
			get: (name): ModeDefinition | undefined => {
				const definition = production.get(name);
				return (
					definition && {
						...definition,
						onStopping: (state) => {
							seen.push(`${name}.onStopping present=${present(state, name)}`);
							return state;
						},
						onStopped: (state) => {
							seen.push(`${name}.onStopped present=${present(state, name)}`);
							return state;
						},
					}
				);
			},
		};
	}

	const HOOKS_IN_ORDER = [
		'skill_shot.onStopping present=true',
		'skill_shot.onStopped present=false',
		'base.onStopping present=true',
		'base.onStopped present=false',
	];

	it('the ball end runs the registry\'s stop hooks in place: the controller given a registry calls each hook at its phase before it returns ball_ended', () => {
		const seen: string[] = [];
		const controller = createBallController(ADJUSTMENTS, NO_BALL_SAVE_TUNING, loggingStopLookup(seen));
		const state: GameState = { ...midBall([player(1), player(0)]), machine: { ...midBall([player(1), player(0)]).machine, ballsInPlay: 0 } };
		const result = controller.step(state, [{ type: 'device_ball_entered', device: 'bd_trough', slot: 3, tick: 1 }], 1, { recovered: null, failures: [] });

		expect(result.events.map((event) => event.type)).toContain('ball_ended');
		expect(seen).toEqual(HOOKS_IN_ORDER);
		expect(result.state.modes).toEqual([]);
	});

	it('the Slam runs the registry\'s stop hooks in place: the tilt controller given a registry calls each hook at its phase as it enters Attract', () => {
		const seen: string[] = [];
		const controller = createTiltController(ADJUSTMENTS, NO_BALL_SAVE_TUNING, loggingStopLookup(seen));
		const result = controller.step(midBall([player(1)]), [{ type: 'slam_tilt_closed', tick: 1 }], 1);

		expect(result.state.phase).toBe('attract');
		expect(seen).toEqual(HOOKS_IN_ORDER);
		expect(result.modeEvents.map((event) => event.type)).toEqual([...triple('skill_shot', 'stop'), ...triple('base', 'stop')]);
		expect(result.state.modes).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC3 -- the event-major pair (a flipper press and a closure on one tick).
// ---------------------------------------------------------------------------

describe('AC3 -- event-major: a lane change and the resolving closure on ONE tick are judged in the order they happened', () => {
	it('Matrix row "Event-major fan-out": top_3 lit, then the right flipper and s_top_1 on one tick -- the rotation lands first (top_3 -> top_1), so the shot pays', () => {
		const initialState = midBall([player(1)], { top_3: true });
		const result = runRulesScript(close('s_flipper_r').at(1).close(TABLE.laneWiring.top_1.switch as SwitchName).at(1).build(), {
			durationTicks: 1,
			initialState,
			adjustments: ADJUSTMENTS,
		});
		expect(result.finalState.players[0]!.score).toBe(TUNING.skillShotAward.value);
		expect(result.finalState.modes.map((m) => m.mode), 'the shot resolved').toEqual(['base']);
	});

	it('Matrix row "Event-major control": the same flipper press, then s_top_3 -- no award, and the shot still stops', () => {
		const initialState = midBall([player(1)], { top_3: true });
		const result = runRulesScript(close('s_flipper_r').at(1).close(TABLE.laneWiring.top_3.switch as SwitchName).at(1).build(), {
			durationTicks: 1,
			initialState,
			adjustments: ADJUSTMENTS,
		});
		expect(result.finalState.players[0]!.score).toBe(0);
		expect(result.finalState.modes.map((m) => m.mode)).toEqual(['base']);
		expect(typesAt(result.modeEvents, 1)).toEqual(triple('skill_shot', 'stop'));
	});
});

// ---------------------------------------------------------------------------
// AC7 (Integration, Rule 1) -- a real createRules() folded through the Backglass.
// ---------------------------------------------------------------------------

describe('AC7 (Integration) -- a real createRules() run, folded tick by tick through advanceBackglass()/renderFrame(): ARM YOURSELF from the Start tick, cleared on resolution, both modes\' awards on the score row', () => {
	it('Start, plunge, the lit Top lane, a pop: the DMD shows ARM YOURSELF from the Start tick, clears it at the lane, and the score row reads skillShotAward then + popScore', () => {
		const seed = 11;
		const lit = firstDraw(seed);
		const startTick = 5;
		const laneTick = 20;
		const popTick = 30;
		const durationTicks = 35;
		const script = close('s_start').at(startTick)
			.open('s_shooter_lane').at(10)
			.close(lit.switch).at(laneTick)
			.close(POP_SWITCH).at(popTick)
			.build();
		const result = runRulesScript(script, { durationTicks, initialState: attractState(seed), adjustments: ADJUSTMENTS });

		let view = INITIAL_BACKGLASS_VIEW;
		const armed: number[] = [];
		const scoreRow = new Map<number, string | undefined>();
		for (let tick = 1; tick <= durationTicks; tick++) {
			const output: FrameOutput = {
				snapshot: buildSnapshot({ tick, game: result.statesByTick.get(tick)! }),
				events: result.events.filter((event) => event.tick === tick),
				contactEvents: [],
				commands: [],
			};
			view = advanceBackglass(view, output);
			const frame = renderFrame(view, output.snapshot);
			if (frame.rows.some((row) => row.text === 'ARM YOURSELF')) {
				armed.push(tick);
			}
			if (frame.screen === 'score') {
				scoreRow.set(tick, frame.rows[0]?.text);
			}
		}

		const commas = (value: number): string => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		expect(armed[0], 'ARM YOURSELF is on the DMD from the Start tick itself').toBe(startTick);
		expect(armed, 'and stays up, every tick, until the lane resolves the shot').toEqual(Array.from({ length: laneTick - startTick }, (_, i) => startTick + i));
		expect(scoreRow.get(laneTick - 1)).toBe('0');
		expect(scoreRow.get(laneTick), 'the skill shot\'s award').toBe(commas(TUNING.skillShotAward.value));
		expect(scoreRow.get(popTick), 'the base mode\'s pop accrues on top').toBe(commas(TUNING.skillShotAward.value + TUNING.popScore.value));
	});
});
