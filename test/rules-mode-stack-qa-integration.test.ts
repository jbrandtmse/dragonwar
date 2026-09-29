// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 QA (AD-8, DW-209, DW-206, DW-290): real-runtime rows the
// implement stage's suite left open. Every row drives a whole `createRules()`
// through `runRulesScript()` (the devices layer, the tilt controller, the
// split ball controller and the mode stack, end to end), and the DW-206 rows
// fold a real run through `advanceBackglass()` / `renderFrame()` and read the
// rasterised DMD -- the dots a player sees. No `createLoop()`, no physics:
// gated as headless by `test/rules-devices-headless.test.ts`'s ENTRY_FILES,
// like `test/rules-mode-stack-integration.test.ts`.
//
// - AC8 (DW-209): the Slam from a hot-seat player 1 (every stop event carries
//   player 1; the next Start is player 0's one fresh pair), and Slam + Start
//   on one tick with the Start edge listed FIRST.
// - AC3: the event-major pair's mirror -- the LEFT flipper and the lane its
//   rotation lands on, on one tick.
// - AC5 / DW-290, the split under the stack: a saved drain (the S8a early
//   return) stops only the launched skill shot and re-arms nothing; the
//   early return still skips S10 (an overflow report on the save tick gets
//   no second trough pulse -- no pre-split test pinned that); a ball-search
//   recover never ends the ball or touches the base mode; a whole game over
//   -> Match -> Attract -> Start keeps `modes` empty and emits no lifecycle
//   event until the next ball.
// - DW-206 on the rasterised DMD: a fieldless unlabelled mode above the
//   skill shot leaves its dots untouched, and an unlabelled field publisher
//   lights exactly the fields line a labelled mode's field would.
//
// Expected values come from `resolveTuning()`, `MODE_PRIORITIES`, `TABLE`,
// `nextRngInt()` applied to a seed, and control runs -- never from the value
// under test.

import { describe, expect, it } from 'vitest';
import { MODE_PRIORITIES, type ModeEvent } from '../src/sim/rules/modes';
import { nextRngInt } from '../src/sim/rules/rng';
import { advanceBackglass, renderFrame, INITIAL_BACKGLASS_VIEW, type BackglassView } from '../src/presentation/backglass/frame';
import { rasterise } from '../src/presentation/backglass/raster';
import { FONT_5X7 } from '../src/presentation/backglass/font';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import { buildSnapshot } from './util/snapshot-factory';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { PlayerState } from '../src/sim/contracts/state';
import type { CoilName, FrameOutput, GameState, MachineReport, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();

/** Ball save shrunk to nothing, so a scripted drain ends the ball instead of re-serving it. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

const ADJUSTMENTS: GameAdjustments = { pitchDeg: 0, tiltWarnings: 3, ballsPerGame: 3, matchProbability: 0 };

const TROUGH_EJECT_COIL = TABLE.ballDevices.bd_trough.ejectCoil as CoilName;

type LaneName = keyof typeof TABLE.laneWiring;

/** The Top set in `order` -- re-derived from `TABLE`, never listed by hand. */
const TOP_LANES: readonly LaneName[] = (Object.keys(TABLE.laneWiring) as LaneName[])
	.filter((lane) => TABLE.laneWiring[lane].set === 'top')
	.sort((a, b) => TABLE.laneWiring[a].order - TABLE.laneWiring[b].order);

const laneSwitch = (lane: LaneName): SwitchName => TABLE.laneWiring[lane].switch as SwitchName;

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
		ballNumber,
		...overrides,
	};
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

/** A mid-ball state: `current`'s ball in play (one ball, trough slot 4 empty), `modes` as given. */
function midBall(options: {
	readonly players: readonly PlayerState[];
	readonly current?: number;
	readonly modes: GameState['modes'];
	readonly lit?: Record<string, boolean>;
	readonly ballSave?: GameState['machine']['ballSave'];
	readonly rng?: number;
}): GameState {
	const current = options.current ?? 0;
	return {
		tick: 0,
		phase: 'game',
		machine: {
			ballsInPlay: 1,
			hardwareEnabled: true,
			ballSave: options.ballSave ?? { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
		},
		players: options.players.map((p, index) => (index === current ? { ...p, lanes: { lit: options.lit ?? {}, completedSets: [] } } : p)),
		currentPlayer: current,
		modes: options.modes,
		rng: options.rng ?? 0,
	};
}

const base = (p: number): GameState['modes'][number] => ({ mode: 'base', priority: MODE_PRIORITIES.base, player: p });
const shot = (p: number, launched: boolean): GameState['modes'][number] => ({ mode: 'skill_shot', priority: MODE_PRIORITIES.skill_shot, player: p, launched });
const freshPair = (p: number): GameState['modes'] => [base(p), shot(p, false)];

/** The three lifecycle events of `mode` for `p` at `tick`, as whole objects. */
function triple(mode: string, kind: 'start' | 'stop', p: number, tick: number): ModeEvent[] {
	const phases = kind === 'start' ? ['will_start', 'starting', 'started'] : ['will_stop', 'stopping', 'stopped'];
	return phases.map((phase) => ({ type: `mode_${mode}_${phase}`, mode, player: p, tick }) as ModeEvent);
}

const eventsAt = (result: RunRulesScriptResult, tick: number): ModeEvent[] => result.modeEvents.filter((event) => event.tick === tick);

// ---------------------------------------------------------------------------
// AC8 (DW-209) -- two Slam shapes the Matrix rows leave open.
// ---------------------------------------------------------------------------

describe('AC8 (DW-209), QA -- the Slam stops the modes of whoever holds them, and the switch order on a Slam + Start tick is irrelevant', () => {
	it('a Slam during hot-seat player 1\'s ball: its stop triples carry player 1, Attract holds modes [] with rng untouched, and the next Start runs player 0\'s one fresh pair on exactly one draw', () => {
		const SEED = 4242;
		const initialState = midBall({ players: [player(1, { score: 500 }), player(1, { score: 700 })], current: 1, modes: freshPair(1), rng: SEED });
		const result = runRulesScript(close('s_slam_tilt').at(1).close('s_start').at(10).build(), {
			durationTicks: 11,
			initialState,
			adjustments: ADJUSTMENTS,
		});

		const atSlam = result.statesByTick.get(1)!;
		expect(atSlam.phase).toBe('attract');
		expect(atSlam.modes).toEqual([]);
		expect(eventsAt(result, 1), 'skill_shot then base, both player 1\'s').toEqual([...triple('skill_shot', 'stop', 1, 1), ...triple('base', 'stop', 1, 1)]);
		for (let tick = 1; tick < 10; tick++) {
			const state = result.statesByTick.get(tick)!;
			expect(state.modes, `tick ${tick}: nothing lives in Attract`).toEqual([]);
			expect(state.rng, `tick ${tick}: no draw in Attract`).toBe(SEED);
			if (tick > 1) {
				expect(eventsAt(result, tick), `tick ${tick}: no lifecycle event in Attract`).toEqual([]);
			}
		}

		const atStart = result.statesByTick.get(10)!;
		expect(atStart.phase).toBe('game');
		expect(atStart.players.map((p) => p.score), 'a new one-player game').toEqual([0]);
		expect(atStart.modes, 'exactly player 0\'s fresh pair -- nothing of player 1 survives').toEqual(freshPair(0));
		expect(atStart.rng, 'one draw from the seed, the Slammed game\'s rng').toBe(nextRngInt(SEED, TOP_LANES.length).rng);
		expect(eventsAt(result, 10)).toEqual([...triple('base', 'start', 0, 10), ...triple('skill_shot', 'start', 0, 10)]);
		expect(result.statesByTick.get(11)!.modes, 'and the tick after is unchanged').toEqual(freshPair(0));
	});

	it('Slam + Start on one tick with the Start edge listed BEFORE the Slam: the same outcome as the Matrix row -- one fresh pair on two draws, the stops then the starts, and tick 7 unchanged with no lifecycle event', () => {
		const SEED = 7;
		const draw1 = nextRngInt(SEED, TOP_LANES.length);
		const draw2 = nextRngInt(draw1.rng, TOP_LANES.length);
		const script = close('s_start').at(5).at(6).close('s_slam_tilt').at(6).build();
		expect(script.filter((edge) => edge.tick === 6).map((edge) => edge.switch), 'sanity: Start is first on tick 6').toEqual(['s_start', 's_slam_tilt']);
		const result = runRulesScript(script, { durationTicks: 7, initialState: attractState(SEED), adjustments: ADJUSTMENTS });

		expect(result.statesByTick.get(5)!.rng, 'positive: the first game drew once').toBe(draw1.rng);
		const at6 = result.statesByTick.get(6)!;
		expect(at6.phase).toBe('game');
		expect(at6.modes).toEqual(freshPair(0));
		expect(at6.rng).toBe(draw2.rng);
		expect(at6.players.map((p) => p.score)).toEqual([0]);
		expect(eventsAt(result, 6)).toEqual([
			...triple('skill_shot', 'stop', 0, 6),
			...triple('base', 'stop', 0, 6),
			...triple('base', 'start', 0, 6),
			...triple('skill_shot', 'start', 0, 6),
		]);
		const at7 = result.statesByTick.get(7)!;
		expect(at7.phase).toBe('game');
		expect(at7.modes).toEqual(freshPair(0));
		expect(at7.rng).toBe(draw2.rng);
		expect(eventsAt(result, 7)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC3 -- the event-major pair's mirror, through the real devices layer.
// ---------------------------------------------------------------------------

describe('AC3, QA -- event-major with the LEFT flipper: the rotation the press causes lands before the closure that follows it on the same tick', () => {
	/** The Top lane a left press moves `lane`'s lit flag onto -- one `order` step down, wrapping. */
	const leftOf = (lane: LaneName): LaneName => TOP_LANES[(TOP_LANES.indexOf(lane) - 1 + TOP_LANES.length) % TOP_LANES.length]!;

	function run(hit: LaneName): RunRulesScriptResult {
		const initialState = midBall({ players: [player(1)], modes: [base(0), shot(0, true)], lit: { [TOP_LANES[0]!]: true } });
		return runRulesScript(close('s_flipper_l').at(1).close(laneSwitch(hit)).at(1).build(), { durationTicks: 1, initialState, adjustments: ADJUSTMENTS });
	}

	it('the first Top lane lit, then the left flipper and the lane it rotates onto (wrapping to the last) on one tick: the skill shot pays skillShotAward and stops', () => {
		const target = leftOf(TOP_LANES[0]!);
		expect(target, 'sanity: the left rotation wraps from the first Top lane to the last').toBe(TOP_LANES[TOP_LANES.length - 1]);
		const result = run(target);
		expect(result.finalState.players[0]!.score).toBe(TUNING.skillShotAward.value);
		expect(result.finalState.modes).toEqual([base(0)]);
		expect(eventsAt(result, 1)).toEqual(triple('skill_shot', 'stop', 0, 1));
	});

	it('control: the same press, then the lane that WAS lit before it -- no award, and the shot still stops', () => {
		const result = run(TOP_LANES[0]!);
		expect(result.finalState.players[0]!.score).toBe(0);
		expect(result.finalState.modes).toEqual([base(0)]);
		expect(eventsAt(result, 1)).toEqual(triple('skill_shot', 'stop', 0, 1));
	});
});

// ---------------------------------------------------------------------------
// AC5 / DW-290 -- the split ball controller under the real stack.
// ---------------------------------------------------------------------------

describe('AC5 / DW-290, QA -- the split ball controller\'s save, search and game-over paths under the real mode stack', () => {
	it('a saved drain re-serves the SAME ball: the launched skill shot closes (its stop triple only), the base mode survives untouched, nothing re-arms, and the re-launched ball\'s lit-lane hit pays exactly what a run with no skill shot pays', () => {
		const lit = TOP_LANES[1]!;
		const script = close('s_trough_4').at(1) // the drain, inside the window
			.open('s_trough_4').at(3) // the re-served ball leaves the trough
			.close('s_shooter_lane').at(5) // it arrives at the shooter lane (the deferred autolaunch)
			.open('s_shooter_lane').at(8) // the autolaunch's own launch edge
			.close(laneSwitch(lit)).at(12) // the lit Top lane, with no aim behind it
			.build();
		const saveWindow = { untilTick: 500, sources: ['test'] };
		const withShot = runRulesScript(script, {
			durationTicks: 14,
			initialState: midBall({ players: [player(1)], modes: [base(0), shot(0, true)], lit: { [lit]: true }, ballSave: saveWindow }),
			adjustments: ADJUSTMENTS,
		});
		const control = runRulesScript(script, {
			durationTicks: 14,
			initialState: midBall({ players: [player(1)], modes: [base(0)], lit: { [lit]: true }, ballSave: saveWindow }),
			adjustments: ADJUSTMENTS,
		});

		expect(withShot.events.filter((event) => event.type === 'ball_saved').map((event) => event.tick), 'positive: the drain was saved').toEqual([1]);
		expect(withShot.events.some((event) => event.type === 'ball_ended'), 'a save is never a ball end').toBe(false);
		expect(eventsAt(withShot, 1), 'only the skill shot closes on the drain (DW-232); the base mode gets no stop').toEqual(triple('skill_shot', 'stop', 0, 1));
		expect(withShot.modeEvents.filter((event) => event.tick !== 1), 'and no lifecycle event anywhere else -- no re-arm on the re-serve').toEqual([]);
		for (let tick = 1; tick <= 14; tick++) {
			expect(withShot.statesByTick.get(tick)!.modes, `tick ${tick}: the base mode alone, the same player's`).toEqual([base(0)]);
		}
		expect(withShot.finalState.players[0]!.letters, 'no skill-shot letter').toBe('');
		expect(withShot.finalState.players[0]!.score, 'the lit-lane hit pays exactly what a run with no skill shot pays').toBe(control.finalState.players[0]!.score);
		expect(withShot.finalState.players[0]!.score, 'and not the skill-shot award').not.toBe(control.finalState.players[0]!.score + TUNING.skillShotAward.value);
	});

	it('the save\'s early return (S8a) still skips S9-S12: a trough overflow reported on the saved drain\'s tick gets no answer, so that tick pulses the trough exactly once -- the re-serve; the same report on a quiet tick is answered', () => {
		const overflow: MachineReport = { recovered: null, failures: [{ type: 'device_overflow', device: 'bd_trough', tick: 0 }] };
		const initialState = midBall({ players: [player(1)], modes: [base(0)], ballSave: { untilTick: 500, sources: ['test'] } });

		const onSaveTick = runRulesScript(close('s_trough_4').at(1).build(), {
			durationTicks: 1,
			initialState,
			adjustments: ADJUSTMENTS,
			machineReports: new Map([[1, overflow]]),
		});
		expect(onSaveTick.events.map((event) => event.type), 'positive: the drain was saved on that tick').toContain('ball_saved');
		expect(onSaveTick.coilCommands.filter((command) => command.tick === 1), 'one trough pulse: the re-serve, and no overflow answer').toEqual([
			{ type: 'coil', coil: TROUGH_EJECT_COIL, action: 'pulse', tick: 1 },
		]);

		const onQuietTick = runRulesScript([], { durationTicks: 1, initialState, adjustments: ADJUSTMENTS, machineReports: new Map([[1, overflow]]) });
		expect(onQuietTick.coilCommands, 'control: with no drain, S10 answers the overflow with a trough pulse').toEqual([
			{ type: 'coil', coil: TROUGH_EJECT_COIL, action: 'pulse', tick: 1 },
		]);
	});

	it('a ball-search recover whose park lands in the trough is never a ball end: ball_missing, no ball_ended, the launched skill shot closes and the base mode survives; control -- the same entry with no recover report ends the ball and stops both', () => {
		const initialState = midBall({ players: [player(1), player(0)], modes: [base(0), shot(0, true)] });
		const script = close('s_trough_4').at(5).build();
		const recovered = runRulesScript(script, {
			durationTicks: 6,
			initialState,
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: ADJUSTMENTS,
			machineReports: new Map([[5, { recovered: 1, failures: [] }]]),
		});
		expect(recovered.events.filter((event) => event.tick === 5).map((event) => event.type)).toEqual(['ball_missing']);
		expect(eventsAt(recovered, 5)).toEqual(triple('skill_shot', 'stop', 0, 5));
		expect(recovered.modeEvents.filter((event) => event.tick !== 5)).toEqual([]);
		expect(recovered.statesByTick.get(6)!.modes).toEqual([base(0)]);
		expect(recovered.statesByTick.get(6)!.currentPlayer, 'no rotation').toBe(0);

		const drained = runRulesScript(script, { durationTicks: 6, initialState, tuning: NO_BALL_SAVE_TUNING, adjustments: ADJUSTMENTS });
		expect(drained.events.some((event) => event.type === 'ball_ended' && event.tick === 5), 'control: a real drain ends the ball').toBe(true);
		expect(eventsAt(drained, 5)).toEqual([
			...triple('skill_shot', 'stop', 0, 5),
			...triple('base', 'stop', 0, 5),
			...triple('base', 'start', 1, 5),
			...triple('skill_shot', 'start', 1, 5),
		]);
	});

	it('a whole game over -> Match -> Attract -> Start: modes [] on every tick from the last drain to the Start, no lifecycle event between the drain\'s stop triples and the next Start\'s start triples, no draw in Attract, and the Start draws exactly once', () => {
		const initialState = midBall({ players: [player(ADJUSTMENTS.ballsPerGame, { score: 1230 })], modes: [base(0), shot(0, false)], rng: 99 });
		const drainOnly = runRulesScript(close('s_trough_4').at(1).build(), { durationTicks: 20000, initialState, tuning: NO_BALL_SAVE_TUNING, adjustments: ADJUSTMENTS });
		let attractTick = -1;
		for (let tick = 1; tick <= 20000 && attractTick < 0; tick++) {
			if (drainOnly.statesByTick.get(tick)!.phase === 'attract') {
				attractTick = tick;
			}
		}
		expect(attractTick, 'positive: the game-over sequence genuinely reaches Attract inside the run').toBeGreaterThan(1);
		expect(drainOnly.events.map((event) => event.type), 'positive: the game ended and the Match ran').toEqual(expect.arrayContaining(['ball_ended', 'game_ended', 'match_drawn']));

		const startTick = attractTick + 10;
		const result = runRulesScript(close('s_trough_4').at(1).close('s_start').at(startTick).build(), {
			durationTicks: startTick + 1,
			initialState,
			tuning: NO_BALL_SAVE_TUNING,
			adjustments: ADJUSTMENTS,
		});
		expect(result.statesByTick.get(1)!.phase).toBe('game_over');
		expect(eventsAt(result, 1)).toEqual([...triple('skill_shot', 'stop', 0, 1), ...triple('base', 'stop', 0, 1)]);
		expect(result.modeEvents.filter((event) => event.tick !== 1 && event.tick !== startTick), 'nothing through game over, the Match and Attract').toEqual([]);
		for (let tick = 1; tick < startTick; tick++) {
			expect(result.statesByTick.get(tick)!.modes, `tick ${tick}`).toEqual([]);
		}
		const attractRng = result.statesByTick.get(attractTick)!.rng;
		for (let tick = attractTick; tick < startTick; tick++) {
			expect(result.statesByTick.get(tick)!.rng, `tick ${tick}: no draw in Attract`).toBe(attractRng);
		}
		expect(result.statesByTick.get(startTick)!.modes).toEqual(freshPair(0));
		expect(result.statesByTick.get(startTick)!.rng).toBe(nextRngInt(attractRng, TOP_LANES.length).rng);
		expect(eventsAt(result, startTick)).toEqual([...triple('base', 'start', 0, startTick), ...triple('skill_shot', 'start', 0, startTick)]);
	});
});

// ---------------------------------------------------------------------------
// DW-206 -- the two symptoms, on the rasterised DMD of a real run.
// ---------------------------------------------------------------------------

describe('DW-206, QA -- on the rasterised DMD: an unlabelled mode never hides a labelled one below it, and its published field lights exactly the dots a labelled mode\'s field would', () => {
	/** A real Start at tick 5, folded through the Backglass up to that tick: the view and the state a player is looking at. */
	function realBallStart(): { readonly view: BackglassView; readonly state: GameState } {
		const result = runRulesScript(close('s_start').at(5).build(), { durationTicks: 5, initialState: attractState(11), adjustments: ADJUSTMENTS });
		let view = INITIAL_BACKGLASS_VIEW;
		for (let tick = 1; tick <= 5; tick++) {
			const output: FrameOutput = {
				snapshot: buildSnapshot({ tick, game: result.statesByTick.get(tick)! }),
				events: result.events.filter((event) => event.tick === tick),
				contactEvents: [],
				commands: [],
			};
			view = advanceBackglass(view, output);
		}
		return { view, state: result.statesByTick.get(5)! };
	}

	const { view, state } = realBallStart();
	const dots = (modes: GameState['modes']): Uint8Array => rasterise(renderFrame(view, buildSnapshot({ tick: 5, game: { ...state, modes } })), FONT_5X7).dots;
	const lit = (buffer: Uint8Array): number => buffer.reduce((sum, dot) => sum + dot, 0);
	const unmapped = (fields: Record<string, number> = {}): GameState['modes'][number] => ({ mode: 'some_unmapped_mode', priority: 300, player: 0, ...fields });

	it('sanity: the real run is on the score screen with [base, skill_shot], and ARM YOURSELF lights dots the base mode alone does not', () => {
		expect(view.screen).toBe('score');
		expect(state.modes).toEqual(freshPair(0));
		expect(Array.from(dots(state.modes)), 'the skill shot\'s name must change the panel').not.toEqual(Array.from(dots([base(0)])));
		expect(lit(dots(state.modes))).toBeGreaterThan(lit(dots([base(0)])));
	});

	it('symptom 1 ("Transparent unlabelled"): a fieldless unlabelled mode at 300 over the real [base, skill_shot] leaves the panel dot-for-dot identical -- ARM YOURSELF still lit', () => {
		const withUnlabelled = dots([...state.modes, unmapped()]);
		expect(Array.from(withUnlabelled)).toEqual(Array.from(dots(state.modes)));
	});

	it('symptom 2 ("Unlabelled field publisher"): an unlabelled mode publishing timerTicks lights exactly the base panel plus the fields-line dots a labelled mode with the same field adds', () => {
		const baseOnly = dots([base(0)]);
		const labelled = dots([base(0), shot(0, false)]);
		const labelledWithField = dots([base(0), { ...shot(0, false), timerTicks: 1000 }]);
		const fieldDots = labelledWithField.map((dot, index) => (dot === 1 && labelled[index] === 0 ? 1 : 0));
		expect(lit(fieldDots), 'positive: a labelled mode\'s timerTicks lights a fields line').toBeGreaterThan(0);
		const expected = baseOnly.map((dot, index) => (dot === 1 || fieldDots[index] === 1 ? 1 : 0));

		const unlabelledPublisher = dots([base(0), unmapped({ timerTicks: 1000 })]);
		expect(Array.from(unlabelledPublisher), 'the base panel (no name) plus exactly the field\'s dots').toEqual(Array.from(expected));
		expect(Array.from(unlabelledPublisher), 'and not the base panel alone').not.toEqual(Array.from(baseOnly));
	});
});
