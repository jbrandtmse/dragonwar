// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.5 (AD-3, AD-7, AD-8, AD-18, FR-34): Hurry-up -- "start 250,000
// decaying to a 50,000 floor over 20 s", collected at the Ramp. Every row of
// the spec's I/O & Edge-Case Matrix, as AC 2-5 and AC 8, driven headless
// through `runRulesScript()` (`test/util/switch-script.ts`) on a real
// `createRules()`, with switch edges scripted by hand -- except the "3.7
// stand-in" row, which drives `createModeStack(tuning, definitions)`
// directly. No physics, no rendering, no `sim/loop` (gated by
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES).
//
// Every figure is derived from `resolveTuning()`: S = `hurryUpStartValue`,
// F = `hurryUpFloor`, T = `hurryUpTicks` (clamped to at least 1). An
// expected value v(e) is `S - (S - F) * e / T`, computed HERE at an `e` the
// test asserts divides exactly -- never by calling Hurry-up's own function.
// t0 is a capture of `s_lock_1` with lit [hurryup] and no credits: the lock
// applies, one candidate, so Hurry-up starts on the capture tick (Story
// 3.4). Every negative is paired with its positive.

import { describe, expect, it } from 'vitest';
import { createBaseMode } from '../src/sim/rules/modes/base';
import { createHurryUpMode } from '../src/sim/rules/modes/hurry-up';
import { createModeStack, MODE_PRIORITIES, startModes, type ModeDefinition, type ModeEvent } from '../src/sim/rules/modes';
import { awardScore } from '../src/sim/rules/scoring';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { ActiveModeState, PlayerState } from '../src/sim/contracts/state';
import type { DeviceEvent } from '../src/sim/rules/devices';
import type { GameState, MachineState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const S = TUNING.hurryUpStartValue.value;
const F = TUNING.hurryUpFloor.value;
const T = Math.max(1, shotWindowTicks('hurryUpMs', TUNING));
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);
const SPACING = shotWindowTicks('tiltWarningSpacingMs', TUNING);
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);

/** The lane closure lands this many ticks before its slot's close -- inside the capture window. */
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const MOUTH_COIL = 'c_mouth';
const AUTOLAUNCH_COIL = 'c_autolaunch';
const MOUTH_OPEN_SHOW = 'show_dragon_mouth_open';

/** v(e) at the production tunables, asserting the straight line is exact at `e` -- so the expected value needs no rounding at all. */
function v(e: number): number {
	expect((S - F) * e % T, `the premise: (S - F) * ${e} divides by T exactly`).toBe(0);
	return S - ((S - F) * e) / T;
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
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
		ballNumber: 1,
		...overrides,
	};
}

function machine(overrides: Partial<MachineState> = {}): MachineState {
	return {
		ballsInPlay: 1,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
		...overrides,
	};
}

function lockSlots(held: number): readonly boolean[] {
	return [0, 1, 2].map((slot) => slot < held);
}

const BASE_ENTRY = { mode: 'base', priority: MODE_PRIORITIES.base, player: 0 } as const;

/** A mid-game state: player 0 (or `players`) up, the base mode active, the Lock holding `held` balls. */
function gameState(options: {
	readonly player?: Partial<PlayerState>;
	readonly players?: readonly PlayerState[];
	readonly currentPlayer?: number;
	readonly held?: number;
	readonly machine?: Partial<MachineState>;
	readonly modes?: GameState['modes'];
} = {}): GameState {
	const base = machine(options.machine ?? {});
	return {
		tick: 0,
		phase: 'game',
		machine: { ...base, deviceSlots: { ...base.deviceSlots, bd_lock: lockSlots(options.held ?? 0) } },
		players: options.players ?? [player(options.player ?? {})],
		currentPlayer: options.currentPlayer ?? 0,
		modes: options.modes ?? [BASE_ENTRY],
		rng: 0,
	};
}

/** A captured Lock entry: the lane closes `LANE_LEAD` ticks before `slot` closes at `t`. */
function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

/** A made Ramp: `shot_ramp_made` fires at `t`. */
function ramp(t: number): readonly SwitchEvent[] {
	return close('s_ramp_enter').at(t - 20).open().at(t - 15).close('s_ramp_made').at(t).open().at(t + 5).build();
}

/** A button pressed at `at` and released at `release`. */
function press(button: SwitchName, at: number, release: number): readonly SwitchEvent[] {
	return close(button).at(at).open().at(release).build();
}

/** A served ball's arrival at `arrive` (its trough slot opening with the shooter lane closing), then its launch at `launch`. */
function serve(troughSlot: SwitchName, arrive: number, launch: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').at(arrive).open(troughSlot).at(arrive).open('s_shooter_lane').at(launch).build();
}

function sorted(script: readonly SwitchEvent[]): readonly SwitchEvent[] {
	return [...script].sort((a, b) => a.tick - b.tick);
}

/** `mode`'s entry at `tick` (any player), or `undefined`. */
function entryAt(result: RunRulesScriptResult, tick: number, mode = 'hurryup'): ActiveModeState | undefined {
	return result.statesByTick.get(tick)!.modes.find((entry) => entry.mode === mode);
}

/** `[value, timerTicks]` of the Hurry-up entry at `tick`; `timerTicks` is `'absent'` when the key is not on the entry at all. */
function published(result: RunRulesScriptResult, tick: number): [unknown, unknown] {
	const entry = entryAt(result, tick);
	expect(entry, `the premise: Hurry-up is active at ${tick}`).toBeDefined();
	return [entry!.value, 'timerTicks' in entry! ? entry!.timerTicks : 'absent'];
}

function scoreAt(result: RunRulesScriptResult, tick: number, index = 0): number {
	return result.statesByTick.get(tick)!.players[index]!.score;
}

function modeEventsAt(result: RunRulesScriptResult, tick: number): ModeEvent[] {
	return result.modeEvents.filter((event) => event.tick === tick);
}

function collected(result: RunRulesScriptResult): ModeEvent[] {
	return result.modeEvents.filter((event) => event.type === 'hurryup_collected');
}

function eventsOfType(result: RunRulesScriptResult, type: string): SemanticEvent[] {
	return result.events.filter((event) => event.type === type);
}

function pulseTicks(result: RunRulesScriptResult, coil: string): number[] {
	return result.coilCommands.filter((command) => command.coil === coil && command.action === 'pulse').map((command) => command.tick);
}

function showTicks(result: RunRulesScriptResult, show: string): number[] {
	return result.commands.filter((command) => command.show === show).map((command) => command.tick);
}

function stopTriple(tick: number): ModeEvent[] {
	return (['will_stop', 'stopping', 'stopped'] as const).map((phase) => ({ type: `mode_hurryup_${phase}`, mode: 'hurryup', player: 0, tick }));
}

/** A tuning set with `overrides` applied to the raw `TUNING` before `resolveTuning()`. */
function tuned(overrides: Partial<Record<'hurryUpStartValue' | 'hurryUpFloor' | 'hurryUpMs', number>>): ResolvedTuning {
	return resolveTuning({
		...RAW_TUNING,
		...(overrides.hurryUpStartValue === undefined ? {} : { hurryUpStartValue: { ...RAW_TUNING.hurryUpStartValue, value: overrides.hurryUpStartValue } }),
		...(overrides.hurryUpFloor === undefined ? {} : { hurryUpFloor: { ...RAW_TUNING.hurryUpFloor, value: overrides.hurryUpFloor } }),
		...(overrides.hurryUpMs === undefined ? {} : { hurryUpMs: { ...RAW_TUNING.hurryUpMs, value: overrides.hurryUpMs } }),
	});
}

/** Lit [hurryup], no credits: the capture at t0 locks and starts Hurry-up. */
const T0 = 300;
const START_STATE = (): GameState => gameState({ player: { modesLit: ['hurryup'] } });

describe('Story 3.5 -- the premise: a capture at t0 with lit [hurryup] starts Hurry-up on t0', () => {
	it('lock_lane_locked then lock_lane_mode_start at t0, and Hurry-up\'s start triple at t0', () => {
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + 2, initialState: START_STATE() });
		expect(result.events.filter((event) => event.type.startsWith('lock_lane_')).map((event) => [event.type, event.tick])).toEqual([
			['lock_lane_locked', T0],
			['lock_lane_mode_start', T0],
		]);
		expect(result.modeEvents.filter((event) => 'mode' in event && event.mode === 'hurryup').map((event) => [event.type, event.tick])).toEqual([
			['mode_hurryup_will_start', T0],
			['mode_hurryup_starting', T0],
			['mode_hurryup_started', T0],
		]);
		expect(entryAt(result, T0 - 1), 'nothing before t0').toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// AC 2 (Matrix rows Start, Decay end, Rounding, Zero ms): value(e) and
// timerTicks(e), published on the entry every tick.
// ---------------------------------------------------------------------------

describe('Story 3.5 -- AC 2: the entry publishes value(e) and timerTicks(e) every tick', () => {
	it('the production figures: S 250000, F 50000, T 20000 ticks', () => {
		expect([S, F, T]).toEqual([250000, 50000, 20000]);
	});

	it('Matrix "Start": at t0 the entry is { mode, priority, player, startTick: t0, value: S, timerTicks: T }; at t0+1 it is v(1), T-1', () => {
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + 2, initialState: START_STATE() });
		expect(entryAt(result, T0)).toEqual({ mode: 'hurryup', priority: MODE_PRIORITIES.hurryup, player: 0, startTick: T0, value: S, timerTicks: T });
		expect(published(result, T0 + 1)).toEqual([v(1), T - 1]);
		expect(published(result, T0 + 1), 'at the defaults: 250000 - 10e').toEqual([249990, 19999]);
	});

	describe('Matrix "Decay end": the timer runs out at t0+T; the Mode holds F and stays active', () => {
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + T + 5000, initialState: START_STATE() });

		it('at t0+T-1: value F + (S-F)/T (50010 at the defaults), timerTicks 1', () => {
			expect(published(result, T0 + T - 1)).toEqual([v(T - 1), 1]);
			expect(v(T - 1)).toBe(50010);
		});

		it('at t0+T: value F, and no timerTicks key at all', () => {
			expect(published(result, T0 + T)).toEqual([F, 'absent']);
		});

		it('at t0+T+5000: still F, still no timerTicks, still in modes[]', () => {
			expect(published(result, T0 + T + 5000)).toEqual([F, 'absent']);
			expect(result.finalState.modes.map((entry) => entry.mode)).toEqual(['base', 'hurryup']);
		});

		it('every tick from t0 to t0+T+5000 follows value(e) and timerTicks(e) exactly (the straight line, rounded down, exact at both ends)', () => {
			const mismatches: number[] = [];
			for (let tick = T0; tick <= T0 + T + 5000; tick++) {
				const e = tick - T0;
				// At the defaults the line is exact on every tick: (S - F) / T = 10.
				const expected: [unknown, unknown] = e < T ? [S - ((S - F) / T) * e, T - e] : [F, 'absent'];
				if (JSON.stringify(published(result, tick)) !== JSON.stringify(expected)) {
					mismatches.push(tick);
				}
			}
			expect((S - F) % T, 'the premise: the per-tick step is an integer at the defaults').toBe(0);
			expect(mismatches).toEqual([]);
		});
	});

	it('Matrix "Rounding": S 100, F 0, hurryUpMs 3 -- values 100, 66, 33, 0, 0 and timerTicks 3, 2, 1, absent, absent at e = 0..4', () => {
		const result = runRulesScript(capture('s_lock_1', T0), {
			durationTicks: T0 + 5,
			tuning: tuned({ hurryUpStartValue: 100, hurryUpFloor: 0, hurryUpMs: 3 }),
			initialState: START_STATE(),
		});
		expect([0, 1, 2, 3, 4].map((e) => published(result, T0 + e))).toEqual([
			[100, 3],
			[66, 2],
			[33, 1],
			[0, 'absent'],
			[0, 'absent'],
		]);
	});

	it('Matrix "Zero ms": hurryUpMs 0 -- T clamps to 1: S with timerTicks 1 at e = 0, then F with no timer at e = 1', () => {
		const zero = tuned({ hurryUpMs: 0 });
		expect(zero.hurryUpTicks.value, 'the premise: 0 ms resolves to 0 ticks').toBe(0);
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + 2, tuning: zero, initialState: START_STATE() });
		expect(published(result, T0)).toEqual([S, 1]);
		expect(published(result, T0 + 1)).toEqual([F, 'absent']);
	});
});

// ---------------------------------------------------------------------------
// AC 3 (Matrix rows Collect, Tilted Ramp, Hot seat): the Ramp collects.
// ---------------------------------------------------------------------------

describe('Story 3.5 -- AC 3: a Ramp pays v(e) through awardScore, fires hurryup_collected, stops the Mode, and still lights the next Mode', () => {
	const collectAt = T0 + 1000;

	describe('Matrix "Collect": a Ramp at t0+1000', () => {
		const result = runRulesScript(sorted([...capture('s_lock_1', T0), ...ramp(collectAt)]), { durationTicks: collectAt + 5, initialState: START_STATE() });

		it('the score rises by exactly v(1000) (240000) on the collecting tick, and not before', () => {
			expect(scoreAt(result, collectAt) - scoreAt(result, collectAt - 1)).toBe(v(1000));
			expect(v(1000)).toBe(240000);
			expect(scoreAt(result, collectAt - 1), 'nothing paid before the Ramp').toBe(0);
		});

		it('modeEvents on that tick: [hurryup_collected{0, 240000}, will_stop, stopping, stopped], and hurryup has left modes[]', () => {
			expect(modeEventsAt(result, collectAt)).toEqual([{ type: 'hurryup_collected', player: 0, value: 240000, tick: collectAt }, ...stopTriple(collectAt)]);
			expect(entryAt(result, collectAt - 1), 'the premise: running the tick before').toBeDefined();
			expect(entryAt(result, collectAt)).toBeUndefined();
			expect(collected(result), 'exactly one collect').toHaveLength(1);
		});

		it('the base mode still receives the same Ramp: modesLit is [quickmb] on the collecting tick', () => {
			expect(result.statesByTick.get(collectAt - 1)!.players[0]!.modesLit, 'the premise: nothing lit before').toEqual([]);
			expect(result.statesByTick.get(collectAt)!.players[0]!.modesLit).toEqual(['quickmb']);
		});
	});

	it('control: the same Ramp with no Hurry-up running also lights [quickmb] (played [hurryup]), and pays nothing', () => {
		const result = runRulesScript(ramp(collectAt), { durationTicks: collectAt + 5, initialState: gameState({ player: { modesPlayed: ['hurryup'] } }) });
		expect(result.statesByTick.get(collectAt)!.players[0]!.modesLit).toEqual(['quickmb']);
		expect(scoreAt(result, collectAt)).toBe(0);
	});

	describe('Matrix "Tilted Ramp": tilted, then a Ramp at t0+1000', () => {
		const warn = T0 + 100;
		const tilt = warn + SPACING + 10;
		const script = sorted([...capture('s_lock_1', T0), ...press('s_tilt_bob', warn, warn + 2), ...press('s_tilt_bob', tilt, tilt + 2), ...ramp(collectAt)]);
		const result = runRulesScript(script, { durationTicks: collectAt + 5, initialState: START_STATE() });

		it('the premise: the ball is tilted before the Ramp, and Hurry-up is running', () => {
			expect(tilt).toBeLessThan(collectAt - 20);
			expect(result.statesByTick.get(tilt - 1)!.machine.tilt.tilted, 'not yet tilted before the second closure').toBe(false);
			expect(result.statesByTick.get(collectAt - 1)!.machine.tilt.tilted).toBe(true);
			expect(entryAt(result, collectAt - 1)).toBeDefined();
		});

		it('the score is unchanged, no hurryup_collected, Hurry-up still active, modesLit unchanged', () => {
			expect(scoreAt(result, collectAt)).toBe(scoreAt(result, collectAt - 1));
			expect(collected(result)).toEqual([]);
			expect(entryAt(result, collectAt)).toBeDefined();
			expect(published(result, collectAt), 'and it runs on, decaying').toEqual([v(1000), T - 1000]);
			expect(result.statesByTick.get(collectAt)!.players[0]!.modesLit).toEqual([]);
		});
	});

	it('Matrix "Hot seat": player 1\'s Hurry-up -- the Ramp pays players[1] v(1000); players[0] is untouched', () => {
		const players = [player({ score: 1234 }), player({ modesLit: ['hurryup'] })];
		const result = runRulesScript(sorted([...capture('s_lock_1', T0), ...ramp(collectAt)]), {
			durationTicks: collectAt + 5,
			initialState: gameState({ players, currentPlayer: 1, modes: [{ ...BASE_ENTRY, player: 1 }] }),
		});
		expect(entryAt(result, T0)?.player, 'the premise: Hurry-up runs for player 1').toBe(1);
		expect(scoreAt(result, collectAt, 1) - scoreAt(result, collectAt - 1, 1)).toBe(v(1000));
		expect(scoreAt(result, collectAt, 0), 'players[0] untouched').toBe(1234);
		expect(collected(result)).toEqual([{ type: 'hurryup_collected', player: 1, value: v(1000), tick: collectAt }]);
	});
});

// ---------------------------------------------------------------------------
// AC 4 (Matrix rows Floor collect, Ball end).
// ---------------------------------------------------------------------------

describe('Story 3.5 -- AC 4: the floor pays exactly F; the ball end pays nothing', () => {
	it('Matrix "Floor collect": a Ramp at t0+T+3000 pays exactly F, with hurryup_collected{value: F}', () => {
		const at = T0 + T + 3000;
		const result = runRulesScript(sorted([...capture('s_lock_1', T0), ...ramp(at)]), { durationTicks: at + 10, initialState: START_STATE() });
		expect(published(result, at - 1), 'the premise: on the floor, no timer').toEqual([F, 'absent']);
		expect(scoreAt(result, at) - scoreAt(result, at - 1)).toBe(F);
		expect(collected(result)).toEqual([{ type: 'hurryup_collected', player: 0, value: F, tick: at }]);
		expect(entryAt(result, at)).toBeUndefined();
	});

	describe('Matrix "Ball end": a drain while Hurry-up runs, with no Ramp', () => {
		// The lock serves on t0; the served ball arrives, is launched, and drains.
		const drain = T0 + 2000;
		const script = sorted([...capture('s_lock_1', T0), ...serve('s_trough_3', T0 + 10, T0 + 30), ...close('s_trough_3').at(drain).build()]);
		// Two DRAGON letters in the bonus, so ball_ended.total is nonzero and the
		// drain tick's score change is a real measurement.
		const result = runRulesScript(script, {
			durationTicks: drain + 2,
			initialState: gameState({ player: { modesLit: ['hurryup'], bonus: { byCategory: { letters: 2, loops: 0, strikes: 0 }, multiplier: 1 } } }),
		});
		const ended = eventsOfType(result, 'ball_ended');

		it('the premise: the ball ended on the drain tick, with Hurry-up running the tick before', () => {
			expect(ended.map((event) => event.tick)).toEqual([drain]);
			expect(entryAt(result, drain - 1)).toBeDefined();
		});

		it('Hurry-up\'s stop triple fires on the drain tick and it has left modes[] by ball_ended; no hurryup_collected anywhere', () => {
			const hurryupEvents = result.modeEvents.filter((event) => 'mode' in event && event.mode === 'hurryup' && event.tick > T0);
			expect(hurryupEvents).toEqual(stopTriple(drain));
			expect(entryAt(result, drain)).toBeUndefined();
			expect(collected(result)).toEqual([]);
		});

		it('the score\'s change at the drain tick equals ball_ended.total -- the bonus, and nothing from Hurry-up', () => {
			const total = (ended[0] as { total: number }).total;
			expect(total, 'the premise: a nonzero bonus').toBeGreaterThan(0);
			expect(scoreAt(result, drain) - scoreAt(result, drain - 1)).toBe(total);
		});
	});
});

// ---------------------------------------------------------------------------
// AC 5 (Matrix rows Quick MB on top, 3.7 stand-in): a higher mode changes
// nothing about Hurry-up's clock or its collect.
// ---------------------------------------------------------------------------

describe('Story 3.5 -- AC 5: under a higher mode Hurry-up keeps its own clock, and a Ramp still collects it', () => {
	describe('Matrix "Quick MB on top": lit [hurryup, quickmb]; the window confirms Hurry-up; a second capture starts Quick multiball; a Ramp', () => {
		const capturedAt = 300;
		const t0 = capturedAt + 20; // Start confirms the window's selection (hurryup)
		const t1 = t0 + 2000; // the second capture starts Quick multiball
		const t2 = t0 + 5000; // the Ramp
		const script = sorted([...capture('s_lock_1', capturedAt), ...press('s_start', t0, t0 + 1), ...capture('s_lock_2', t1), ...ramp(t2)]);
		const result = runRulesScript(script, { durationTicks: t2 + 5, initialState: gameState({ player: { modesLit: ['hurryup', 'quickmb'] } }) });

		it('the premise: Hurry-up starts at t0, Quick multiball at t1, and both run until the Ramp', () => {
			expect(entryAt(result, t0)?.startTick).toBe(t0);
			expect(entryAt(result, t0 - 1), 'not before the confirm').toBeUndefined();
			expect(entryAt(result, t1 - 1, 'quickmb')).toBeUndefined();
			expect(entryAt(result, t1, 'quickmb')).toBeDefined();
			expect(entryAt(result, t2 - 1)).toBeDefined();
		});

		it('at t1+k, Hurry-up\'s published value is still v(t1+k-t0) -- the higher mode pauses nothing', () => {
			for (const k of [0, 1000, 2000]) {
				expect(published(result, t1 + k), `t1+${k}`).toEqual([v(t1 + k - t0), T - (t1 + k - t0)]);
			}
		});

		it('at t2: the score rises by v(t2-t0); Quick multiball is still active, Hurry-up stopped, and modesLit is [joust]', () => {
			expect(scoreAt(result, t2) - scoreAt(result, t2 - 1)).toBe(v(t2 - t0));
			expect(entryAt(result, t2, 'quickmb')).toBeDefined();
			expect(entryAt(result, t2)).toBeUndefined();
			expect(result.statesByTick.get(t2)!.players[0]!.modesLit).toEqual(['joust']);
		});
	});

	describe('Matrix "3.7 stand-in": a stack of base, the real Hurry-up and a stub quickmb@400 with a tick hook that pays 1000 on the Ramp', () => {
		const RAMP_MADE: DeviceEvent = { type: 'shot_ramp_made', tick: 0 };
		const stub: ModeDefinition = {
			name: 'quickmb',
			priority: MODE_PRIORITIES.quickmb,
			tick: (state, entry) => ({ state: { ...state, modes: state.modes.map((mode) => (mode === entry ? { ...mode, ticked: ((mode.ticked as number | undefined) ?? 0) + 1 } : mode)) } }),
			onEvent: (state, entry, event) => (event.type === 'shot_ramp_made' ? { state: awardScore(state, entry.player, 1000) } : { state }),
		};
		const hurryup = createHurryUpMode(TUNING);
		const stack = createModeStack(TUNING, [createBaseMode(TUNING), hurryup, stub]);
		const t0 = 100;
		const t1 = t0 + 3000;
		const t2 = t0 + 7000;

		let state = startModes(gameState({ modes: [] }), [stack.registry.get('base')!], 0, 0).state;
		const valueByTick = new Map<number, unknown>();
		const eventsAtRamp: ModeEvent[] = [];
		let scoreBeforeRamp = 0;
		for (let tick = 1; tick <= t2; tick++) {
			if (tick === t0) {
				state = startModes(state, [stack.registry.get('hurryup')!], 0, tick).state;
			}
			if (tick === t1) {
				state = startModes(state, [stack.registry.get('quickmb')!], 0, tick).state;
			}
			if (tick === t2) {
				scoreBeforeRamp = state.players[0]!.score;
			}
			const result = stack.step({ ...state, tick }, tick === t2 ? [{ ...RAMP_MADE, tick }] : [], [], tick);
			state = result.state;
			if (tick === t2) {
				eventsAtRamp.push(...result.events);
			}
			valueByTick.set(tick, state.modes.find((entry) => entry.mode === 'hurryup')?.value);
		}

		it('the premise: the stub\'s tick hook runs every tick from t1 (it is a real higher-priority tick hook)', () => {
			expect(state.modes.find((entry) => entry.mode === 'quickmb')?.ticked).toBe(t2 - t1 + 1);
		});

		it('Hurry-up\'s value is still v(e) under the stub, at every sampled tick', () => {
			for (const tick of [t1, t1 + 1000, t1 + 2000, t2 - 1]) {
				expect(valueByTick.get(tick), `tick ${tick}`).toBe(S - ((S - F) / T) * (tick - t0));
			}
			expect(valueByTick.get(t1 + 1000)).toBe(v(t1 + 1000 - t0));
		});

		it('the Ramp pays 1000 + v(e); Hurry-up stops and the stub stays', () => {
			expect(state.players[0]!.score - scoreBeforeRamp).toBe(1000 + v(t2 - t0));
			expect(eventsAtRamp).toEqual([{ type: 'hurryup_collected', player: 0, value: v(t2 - t0), tick: t2 }, ...stopTriple(t2)]);
			expect(state.modes.map((entry) => entry.mode)).toEqual(['base', 'quickmb']);
		});
	});
});

// ---------------------------------------------------------------------------
// AC 8 (Integration, Matrix row Ball search): a decaying Hurry-up keeps ball
// search off the Mouth; one on the floor does not.
// ---------------------------------------------------------------------------

/** A stuck ball: launched at `O`, closing nothing afterwards. */
function stuckFrom(O: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').open().at(O).build();
}

/** Story 3.2 AC 8's `stuckState({ held: 2 })`, with `modes`. */
function stuckState(modes: GameState['modes']): GameState {
	return gameState({
		held: 2,
		modes,
		machine: { ballsInPlay: 0, deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] } },
	});
}

/** The tick stage slot `k` of an uninterrupted pass started at `O` falls due. */
function slotTick(O: number, k: number): number {
	return O + SEARCH + k * STEP;
}

describe('Story 3.5 -- AC 8: ball search skips the Mouth while a real Hurry-up decays, and opens it once Hurry-up is on the floor', () => {
	const O = 100;
	const lockStage = slotTick(O, 6);
	const hurryupEntry = { mode: 'hurryup', priority: MODE_PRIORITIES.hurryup, player: 0, startTick: 0, value: S, timerTicks: T };

	it('decaying at the Lock stage: no show_dragon_mouth_open and no c_mouth; the pass itself runs on undelayed', () => {
		expect(lockStage, 'the premise: the Lock stage falls inside the decay').toBeLessThan(T);
		const result = runRulesScript(stuckFrom(O), { durationTicks: slotTick(O, 8) + 10, initialState: stuckState([BASE_ENTRY, hurryupEntry]) });
		expect(published(result, lockStage), 'the real tick hook publishes the timer at the Lock stage').toEqual([v(lockStage), T - lockStage]);
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL), 'the search itself still runs').toEqual([slotTick(O, 8)]);
	});

	it('control: on the floor at the Lock stage (hurryUpMs 10000), the stage opens the Mouth at slotTick(O, 6), as with no timer', () => {
		const short = tuned({ hurryUpMs: 10000 });
		expect(shotWindowTicks('hurryUpMs', short), 'the premise: the decay ends before the Lock stage').toBeLessThan(lockStage);
		const result = runRulesScript(stuckFrom(O), {
			durationTicks: lockStage + 10,
			tuning: short,
			initialState: stuckState([BASE_ENTRY, { ...hurryupEntry, timerTicks: shotWindowTicks('hurryUpMs', short) }]),
		});
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([lockStage]);
		expect(published(result, lockStage - 1), 'the premise: Hurry-up is still active, on the floor, with no timer').toEqual([F, 'absent']);
	});

	it('control of the control: the same stuck state with no Hurry-up at all opens the Mouth at the same tick', () => {
		const result = runRulesScript(stuckFrom(O), { durationTicks: lockStage + 10, initialState: stuckState([BASE_ENTRY]) });
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([lockStage]);
	});
});
