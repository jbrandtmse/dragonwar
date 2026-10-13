// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.6 (AD-3, AD-7, AD-8, AD-18, AD-19, FR-36): Joust -- alternating
// Loops build a Charge that multiplies the Loop award; a broken Loop or the
// same Loop twice loses it. The Joust rows of the spec's I/O & Edge-Case
// Matrix (AC 4-9, AC 11), driven headless through `runRulesScript()`
// (`test/util/switch-script.ts`) on a real `createRules()`, with every switch
// edge scripted by hand. No physics, no rendering, no `sim/loop` (gated by
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES). The tracker's own rows
// (Break, Windows, Non-entry, Exit clears descent) are pinned at the device
// level in `test/rules-devices.test.ts`, and on real physics in
// `test/loop-fall-back-physics.test.ts`.
//
// Every figure is derived from `resolveTuning()`: V = `loopValue`, M =
// `joustChargeMax`, T = `joustTicks` (clamped to at least 1) -- never by
// calling one of Joust's own functions. t0 is a capture of `s_lock_1` with
// lit [joust] and no credits: the lock applies, one candidate, so Joust
// starts on the capture tick (Story 3.4).
//
// A scripted Loop ORBIT is the measured made-Left-Loop timeline (a real
// `createMachine()` launch at 2200 mm/s up the entry column, re-measured by
// `test/loop-fall-back-physics.test.ts`): the entry switch at t, the Loop's
// far switch at t+223, then the descent down the OTHER lane -- its far switch
// at t+1759, its entry switch at t+2618 and its inlane at t+3568. The right
// orbit is that timeline mirrored. Orbits are spaced 4000 ticks apart. These
// are synthetic inputs: they prove what the rules do with those edges, not
// that a flipper can produce them (at this tree none can, DW-319). Every
// negative is paired with its positive.

import { describe, expect, it } from 'vitest';
import { MODE_PRIORITIES, type ModeEvent } from '../src/sim/rules/modes';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { close, runRulesScript, runSwitchScript, type RunRulesScriptResult } from './util/switch-script';
import type { ActiveModeState, PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const V = TUNING.loopValue.value;
const M = TUNING.joustChargeMax.value;
const T = Math.max(1, shotWindowTicks('joustMs', TUNING));
const LOOP_WINDOW = shotWindowTicks('loopWindowMs', TUNING);
const BREAK_WINDOW = shotWindowTicks('loopBreakWindowMs', TUNING);
const DESCENT_WINDOW = shotWindowTicks('loopDescentWindowMs', TUNING);
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);
const SPACING = shotWindowTicks('tiltWarningSpacingMs', TUNING);
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);
/** A Mouth eject's `c_mouth` pulse follows its `show_dragon_mouth_open` by this many ticks (AD-18). */
const MOUTH_LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const SPINNER_SCORE = TUNING.spinnerScore.value;
// Hurry-up's own figures, for the "Hurry-up below" row.
const HURRYUP_START = TUNING.hurryUpStartValue.value;
const HURRYUP_FLOOR = TUNING.hurryUpFloor.value;
const HURRYUP_TICKS = Math.max(1, shotWindowTicks('hurryUpMs', TUNING));

/** The lane closure lands this many ticks before its slot's close -- inside the capture window. */
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const LEFT = 'shot_left_loop';
const RIGHT = 'shot_right_loop';
const MOUTH_COIL = 'c_mouth';
const AUTOLAUNCH_COIL = 'c_autolaunch';
const MOUTH_OPEN_SHOW = 'show_dragon_mouth_open';

/** Each Loop's own switches, by side. */
const LOOP = {
	l: { in: 's_loop_l_in', out: 's_loop_l_out', inlane: 's_inlane_l', outlane: 's_outlane_l' },
	r: { in: 's_loop_r_in', out: 's_loop_r_out', inlane: 's_inlane_r', outlane: 's_outlane_r' },
} as const satisfies Record<'l' | 'r', Readonly<Record<'in' | 'out' | 'inlane' | 'outlane', SwitchName>>>;

/** The measured made-Left-Loop timeline, in ticks after the Loop's entry switch -- see this file's header. */
const ORBIT = { out: 223, farOut: 1759, farIn: 2618, farInlane: 3568 } as const;
/** Ticks between one scripted Loop's entry and the next. */
const GAP = 4000;

/** One scripted Loop orbit entered at `t` on `side`: its `_made` fires at `t + ORBIT.out`. */
function orbit(side: 'l' | 'r', t: number): readonly SwitchEvent[] {
	const own = LOOP[side];
	const far = LOOP[side === 'l' ? 'r' : 'l'];
	return close(own.in).at(t).close(own.out).at(t + ORBIT.out).close(far.out).at(t + ORBIT.farOut).close(far.in).at(t + ORBIT.farIn).close(far.inlane).at(t + ORBIT.farInlane).build();
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

/** Several scripts merged into one, in tick order (stable, so same-tick edges keep their authored order). */
function merged(...parts: readonly (readonly SwitchEvent[])[]): readonly SwitchEvent[] {
	return parts.flat().sort((a, b) => a.tick - b.tick);
}

/** Joust's entry at `tick` (any player), or `undefined`. */
function joustAt(result: RunRulesScriptResult, tick: number): ActiveModeState | undefined {
	return result.statesByTick.get(tick)!.modes.find((entry) => entry.mode === 'joust');
}

/** `[charge, lastLoop]` of the Joust entry at `tick`; `lastLoop` is `'absent'` when the key is not on the entry at all. */
function chain(result: RunRulesScriptResult, tick: number): [unknown, unknown] {
	const entry = joustAt(result, tick);
	expect(entry, `the premise: Joust is active at ${tick}`).toBeDefined();
	return [entry!.charge, 'lastLoop' in entry! ? entry!.lastLoop : 'absent'];
}

function scoreAt(result: RunRulesScriptResult, tick: number, index = 0): number {
	return result.statesByTick.get(tick)!.players[index]!.score;
}

/** What the score gained ON `tick`. */
function paidOn(result: RunRulesScriptResult, tick: number, index = 0): number {
	return scoreAt(result, tick, index) - scoreAt(result, tick - 1, index);
}

function modeEventsAt(result: RunRulesScriptResult, tick: number): ModeEvent[] {
	return result.modeEvents.filter((event) => event.tick === tick);
}

/** Every Joust event of the run that is not a lifecycle event: `joust_charge_broken` and `joust_full_charge`. */
function joustEvents(result: RunRulesScriptResult): ModeEvent[] {
	return result.modeEvents.filter((event) => event.type.startsWith('joust_'));
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

function stopTriple(tick: number, playerIndex = 0): ModeEvent[] {
	return (['will_stop', 'stopping', 'stopped'] as const).map((phase) => ({ type: `mode_joust_${phase}`, mode: 'joust', player: playerIndex, tick }));
}

/** The shot events the devices layer emits for `script`, as `[type, tick]` -- the tracker's own verdict on the same edges, read without going through Joust. */
function shotEvents(script: readonly SwitchEvent[], durationTicks: number): [string, number][] {
	return runSwitchScript(script, { durationTicks })
		.events.filter((event) => event.type.startsWith('shot_'))
		.map((event) => [event.type, event.tick]);
}

/** A tuning set with `overrides` applied to the raw `TUNING` before `resolveTuning()`. */
function tuned(overrides: Partial<Record<'joustChargeMax' | 'joustMs' | 'loopValue', number>>): ResolvedTuning {
	return resolveTuning({
		...RAW_TUNING,
		...(overrides.joustChargeMax === undefined ? {} : { joustChargeMax: { ...RAW_TUNING.joustChargeMax, value: overrides.joustChargeMax } }),
		...(overrides.joustMs === undefined ? {} : { joustMs: { ...RAW_TUNING.joustMs, value: overrides.joustMs } }),
		...(overrides.loopValue === undefined ? {} : { loopValue: { ...RAW_TUNING.loopValue, value: overrides.loopValue } }),
	});
}

/** Lit [joust], no credits: the capture at t0 locks and starts Joust. */
const T0 = 300;
/** The first scripted Loop's entry tick in most rows. */
const FIRST = T0 + 1000;
const START_STATE = (): GameState => gameState({ player: { modesLit: ['joust'] } });

describe('Story 3.6 -- the premises: the production figures, the scripted orbit, and a capture at t0 starting Joust', () => {
	it('the production figures: V 25000, M 10, T 60000 ticks; Joust is priority 310, above Hurry-up', () => {
		expect([V, M, T]).toEqual([25000, 10, 60000]);
		expect(MODE_PRIORITIES.joust).toBe(310);
		expect(MODE_PRIORITIES.joust).toBeGreaterThan(MODE_PRIORITIES.hurryup);
	});

	it('the scripted orbit sits inside the tracker\'s windows, and orbits spaced GAP apart never overlap', () => {
		expect(ORBIT.out, 'a Loop is made inside the loop window').toBeLessThanOrEqual(LOOP_WINDOW);
		expect(ORBIT.farIn - ORBIT.farOut, 'the descent crosses the far lane inside the descent window').toBeLessThanOrEqual(DESCENT_WINDOW);
		expect(ORBIT.farInlane, 'an orbit is over before the next begins').toBeLessThan(GAP);
		expect(Math.max(1372, 1281), 'the scripted fall-backs resolve inside the break window').toBeLessThanOrEqual(BREAK_WINDOW);
	});

	it('lock_lane_locked then lock_lane_mode_start at t0, and Joust\'s start triple at t0', () => {
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + 2, initialState: START_STATE() });
		expect(result.events.filter((event) => event.type.startsWith('lock_lane_')).map((event) => [event.type, event.tick])).toEqual([
			['lock_lane_locked', T0],
			['lock_lane_mode_start', T0],
		]);
		expect(result.modeEvents.filter((event) => 'mode' in event && event.mode === 'joust').map((event) => [event.type, event.tick])).toEqual([
			['mode_joust_will_start', T0],
			['mode_joust_starting', T0],
			['mode_joust_started', T0],
		]);
		expect(joustAt(result, T0 - 1), 'nothing before t0').toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// AC 5 (Matrix rows Start, Alternate, Repeat, Cap).
// ---------------------------------------------------------------------------

describe('Story 3.6 -- AC 5: the Charge, lastLoop and the awards follow the made Loops', () => {
	it('Matrix "Start": at t0 the entry is { mode, priority, player, startTick: t0, charge: 1, timerTicks: T } with no lastLoop; at t0+1 timerTicks is T-1', () => {
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + 2, initialState: START_STATE() });
		expect(joustAt(result, T0)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: T0, charge: 1, timerTicks: T });
		expect(joustAt(result, T0 + 1)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: T0, charge: 1, timerTicks: T - 1 });
	});

	describe('Matrix "Alternate": O_l, O_r, O_l', () => {
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP), orbit('l', FIRST + 2 * GAP));
		const duration = FIRST + 3 * GAP;
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });
		const made = [FIRST, FIRST + GAP, FIRST + 2 * GAP].map((t) => t + ORBIT.out);

		it('the tracker makes exactly left, right, left -- no right _made from the first orbit\'s descent', () => {
			expect(shotEvents(script, duration)).toEqual([
				[`${LEFT}_made`, made[0]],
				[`${RIGHT}_made`, made[1]],
				[`${LEFT}_made`, made[2]],
			]);
		});

		it('Charges 1, 2, 3 with lastLoop left, right, left -- each from its own _made tick', () => {
			expect(chain(result, made[0]! - 1), 'before the first Loop').toEqual([1, 'absent']);
			expect(made.map((tick) => chain(result, tick))).toEqual([
				[1, LEFT],
				[2, RIGHT],
				[3, LEFT],
			]);
			expect(chain(result, made[1]! - 1), 'the first orbit\'s descent through the right lane changed nothing').toEqual([1, LEFT]);
		});

		it('awards V, 2V, 3V, each on its own _made tick, and nothing in between', () => {
			expect(made.map((tick) => paidOn(result, tick))).toEqual([V, 2 * V, 3 * V]);
			expect(scoreAt(result, made[0]! - 1), 'nothing before the first Loop').toBe(0);
			expect(scoreAt(result, made[1]! - 1), 'nothing between the first and the second').toBe(V);
			expect(scoreAt(result, made[2]! - 1), 'nothing between the second and the third').toBe(3 * V);
			expect(scoreAt(result, duration)).toBe(6 * V);
		});

		it('the entry after the first Loop: charge 1, lastLoop the Left Loop, the timer still running, and no fullCharge', () => {
			expect(joustAt(result, made[0]!)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: T0, charge: 1, lastLoop: LEFT, timerTicks: T - (made[0]! - T0) });
		});

		it('no Joust event at all: nothing broke and the cap was not reached', () => {
			expect(joustEvents(result)).toEqual([]);
		});
	});

	it('Matrix "Repeat": O_l, O_r, O_r -- Charges 1, 2, 1 and awards V, 2V, V', () => {
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP), orbit('r', FIRST + 2 * GAP));
		const duration = FIRST + 3 * GAP;
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });
		const made = [FIRST, FIRST + GAP, FIRST + 2 * GAP].map((t) => t + ORBIT.out);
		expect(shotEvents(script, duration), 'the premise: the tracker makes left, right, right').toEqual([
			[`${LEFT}_made`, made[0]],
			[`${RIGHT}_made`, made[1]],
			[`${RIGHT}_made`, made[2]],
		]);
		expect(made.map((tick) => chain(result, tick))).toEqual([
			[1, LEFT],
			[2, RIGHT],
			[1, RIGHT],
		]);
		expect(made.map((tick) => paidOn(result, tick))).toEqual([V, 2 * V, V]);
		expect(joustEvents(result), 'a repeat is not a break: no joust_charge_broken').toEqual([]);
	});

	// Story 3.6 review: every row above pays at the default `loopValue`, so V
	// and the award came from the same default. This row moves the tunable:
	// the award is the RESOLVED tuning's `loopValue` (a dev-panel hot-apply, or
	// a replay recorded with another figure), never the module-level default.
	it('the award follows the resolved loopValue: with loopValue 7, O_l then O_r pay 7 and then 14', () => {
		const tuning = tuned({ loopValue: 7 });
		expect([tuning.loopValue.value, V], 'the premise: the override reached the resolved tuning, and differs from the default').toEqual([7, 25000]);
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP));
		const result = runRulesScript(script, { durationTicks: FIRST + 2 * GAP, tuning, initialState: START_STATE() });
		expect([paidOn(result, FIRST + ORBIT.out), paidOn(result, FIRST + GAP + ORBIT.out)]).toEqual([7, 14]);
		expect(scoreAt(result, FIRST + 2 * GAP)).toBe(21);
	});

	describe('Matrix "Cap": M + 1 alternating orbits', () => {
		const count = M + 1;
		const entries = Array.from({ length: count }, (_, index) => FIRST + index * GAP);
		const script = merged(capture('s_lock_1', T0), ...entries.map((t, index) => orbit(index % 2 === 0 ? 'l' : 'r', t)));
		const duration = FIRST + count * GAP;
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });
		const made = entries.map((t) => t + ORBIT.out);
		// 1, 2, ..., M, then M again.
		const expectedCharges = entries.map((_, index) => Math.min(index + 1, M));

		it('the premise: all eleven orbits end inside the Joust timer', () => {
			expect(count).toBe(11);
			expect(duration).toBeLessThan(T0 + T);
			expect(joustAt(result, duration), 'still running at the end').toBeDefined();
		});

		it('Charges 1..10, then 10', () => {
			expect(made.map((tick) => chain(result, tick)[0])).toEqual(expectedCharges);
			expect(expectedCharges).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]);
		});

		it('each Loop pays V x its Charge; the last two pay 10V each', () => {
			expect(made.map((tick) => paidOn(result, tick))).toEqual(expectedCharges.map((charge) => V * charge));
			expect(made.slice(-2).map((tick) => paidOn(result, tick))).toEqual([10 * V, 10 * V]);
			expect(scoreAt(result, duration)).toBe(V * expectedCharges.reduce((sum, charge) => sum + charge, 0));
		});

		it('joust_full_charge{player 0} fires exactly once, on the tenth _made tick, and the entry is marked', () => {
			expect(joustEvents(result)).toEqual([{ type: 'joust_full_charge', player: 0, tick: made[M - 1] }]);
			expect(modeEventsAt(result, made[M - 1]!)).toEqual([{ type: 'joust_full_charge', player: 0, tick: made[M - 1] }]);
			expect(joustAt(result, made[M - 1]! - 1)!.fullCharge, 'not marked before the tenth Loop').toBeUndefined();
			expect(joustAt(result, made[M - 1]!)!.fullCharge).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// AC 6 (Matrix rows Break).
// ---------------------------------------------------------------------------

describe('Story 3.6 -- AC 6: a broken Loop fires joust_charge_broken with the Charge that was lost, and forgets the chain', () => {
	describe('Matrix "Break (re-entry)": O_l, O_r, then s_loop_l_in twice, 1372 ticks apart, then O_l', () => {
		const t = FIRST + 2 * GAP;
		const next = t + GAP;
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP), close('s_loop_l_in').at(t).close('s_loop_l_in').at(t + 1372).build(), orbit('l', next));
		const duration = next + GAP;
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });

		it('the tracker breaks the Left Loop on the second closure, t+1372', () => {
			expect(shotEvents(script, duration)).toEqual([
				[`${LEFT}_made`, FIRST + ORBIT.out],
				[`${RIGHT}_made`, FIRST + GAP + ORBIT.out],
				[`${LEFT}_broken`, t + 1372],
				[`${LEFT}_made`, next + ORBIT.out],
			]);
		});

		it('joust_charge_broken{player 0, the Left Loop, charge 2} on that tick, and nothing paid', () => {
			expect(chain(result, t + 1371), 'the premise: Charge 2 on the right Loop the tick before').toEqual([2, RIGHT]);
			expect(joustEvents(result)).toEqual([{ type: 'joust_charge_broken', player: 0, shot: LEFT, charge: 2, tick: t + 1372 }]);
			expect(paidOn(result, t + 1372)).toBe(0);
		});

		it('the Charge is 1 and lastLoop is absent from that tick', () => {
			expect(chain(result, t + 1372)).toEqual([1, 'absent']);
			expect(chain(result, next + ORBIT.out - 1)).toEqual([1, 'absent']);
		});

		it('the next O_l opens a new chain: Charge 1, paying V', () => {
			expect(chain(result, next + ORBIT.out)).toEqual([1, LEFT]);
			expect(paidOn(result, next + ORBIT.out)).toBe(V);
		});
	});

	it('control: the same run without the break -- the third Loop (O_l after O_r) builds to Charge 3 and pays 3V', () => {
		const next = FIRST + 3 * GAP;
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP), orbit('l', next));
		const result = runRulesScript(script, { durationTicks: next + GAP, initialState: START_STATE() });
		expect(chain(result, next + ORBIT.out)).toEqual([3, LEFT]);
		expect(paidOn(result, next + ORBIT.out)).toBe(3 * V);
		expect(joustEvents(result)).toEqual([]);
	});

	for (const [side, exit, shot] of [
		['l', 'outlane', LEFT],
		['r', 'inlane', RIGHT],
	] as const) {
		it(`Matrix "Break (exit)": ${LOOP[side].in}, then ${LOOP[side][exit]} 1281 ticks later -- ${shot}_broken, and joust_charge_broken{charge: 1} even at Charge 1`, () => {
			const script = merged(capture('s_lock_1', T0), close(LOOP[side].in).at(FIRST).close(LOOP[side][exit]).at(FIRST + 1281).build());
			const duration = FIRST + 1281 + 10;
			const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });
			expect(shotEvents(script, duration)).toEqual([[`${shot}_broken`, FIRST + 1281]]);
			expect(joustEvents(result)).toEqual([{ type: 'joust_charge_broken', player: 0, shot, charge: 1, tick: FIRST + 1281 }]);
			expect(chain(result, FIRST + 1281)).toEqual([1, 'absent']);
			expect(scoreAt(result, duration)).toBe(0);
		});
	}
});

// ---------------------------------------------------------------------------
// AC 7 (Matrix rows Cap, above, and No re-fire).
// ---------------------------------------------------------------------------

describe('Story 3.6 -- AC 7, Matrix "No re-fire": joust_full_charge fires at most once per Joust entry (joustChargeMax 3)', () => {
	// One game, two Joust entries. The first: three alternating orbits reach
	// the cap of 3, a break, then three more reach it again. It stops on its
	// timer (joustMs 30000). A Ramp then re-lights Joust -- with Hurry-up and
	// Quick multiball already played twice each, Joust is the one Mode whose
	// count equals the round (Story 3.4's round rule) -- and a second capture
	// starts a second entry, whose own three orbits reach the cap again.
	const tuning = tuned({ joustChargeMax: 3, joustMs: 30000 });
	const max = tuning.joustChargeMax.value;
	const timer = Math.max(1, shotWindowTicks('joustMs', tuning));
	const firstRun = [FIRST, FIRST + GAP, FIRST + 2 * GAP];
	const breakAt = FIRST + 3 * GAP;
	const secondRun = [FIRST + 4 * GAP, FIRST + 5 * GAP, FIRST + 6 * GAP];
	const firstStop = T0 + timer;
	const relight = firstStop + 500;
	const secondStart = firstStop + 1000;
	const thirdRun = [secondStart + 1000, secondStart + 1000 + GAP, secondStart + 1000 + 2 * GAP];
	const sides = ['l', 'r', 'l'] as const;
	const script = merged(
		capture('s_lock_1', T0),
		...firstRun.map((t, index) => orbit(sides[index]!, t)),
		close('s_loop_l_in').at(breakAt).close('s_loop_l_in').at(breakAt + 1372).build(),
		...secondRun.map((t, index) => orbit(sides[index]!, t)),
		ramp(relight),
		capture('s_lock_2', secondStart),
		...thirdRun.map((t, index) => orbit(sides[index]!, t)),
	);
	const duration = thirdRun[2]! + GAP;
	const result = runRulesScript(script, {
		durationTicks: duration,
		tuning,
		initialState: gameState({ player: { modesLit: ['joust'], modesPlayed: ['hurryup', 'quickmb', 'hurryup', 'quickmb'] } }),
	});
	const fullCharges = result.modeEvents.filter((event) => event.type === 'joust_full_charge');

	it('the premise: max 3; the first entry runs t0..t0+30000 and holds all seven of its Loops; the Ramp re-lights Joust; the second capture starts a second entry', () => {
		expect([max, timer]).toEqual([3, 30000]);
		expect(secondRun[2]! + ORBIT.farInlane, 'the first entry\'s last orbit ends inside its timer').toBeLessThan(firstStop);
		expect(result.modeEvents.filter((event) => event.type === 'mode_joust_started').map((event) => event.tick)).toEqual([T0, secondStart]);
		expect(result.modeEvents.filter((event) => event.type === 'mode_joust_stopped').map((event) => event.tick)).toEqual([firstStop]);
		expect(result.statesByTick.get(relight)!.players[0]!.modesLit).toEqual(['joust']);
		expect(joustAt(result, secondStart)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: secondStart, charge: 1, timerTicks: timer });
	});

	it('the premise: the first entry reaches Charge 3 twice -- before the break and again after it', () => {
		expect(firstRun.map((t) => chain(result, t + ORBIT.out)[0])).toEqual([1, 2, 3]);
		expect(chain(result, breakAt + 1372)).toEqual([1, 'absent']);
		expect(secondRun.map((t) => chain(result, t + ORBIT.out)[0])).toEqual([1, 2, 3]);
		expect(secondRun.map((t) => paidOn(result, t + ORBIT.out)), 'and it still pays on the capped Charge').toEqual([V, 2 * V, 3 * V]);
	});

	it('the first entry fires joust_full_charge exactly once, on the first reach of 3', () => {
		expect(fullCharges.filter((event) => event.tick < firstStop)).toEqual([{ type: 'joust_full_charge', player: 0, tick: firstRun[2]! + ORBIT.out }]);
		expect(joustAt(result, secondRun[2]! + ORBIT.out)!.fullCharge, 'the entry stays marked through the break').toBe(true);
	});

	it('control: the second entry, started later in the same game, fires again on its own first reach of 3', () => {
		expect(fullCharges.filter((event) => event.tick >= secondStart)).toEqual([{ type: 'joust_full_charge', player: 0, tick: thirdRun[2]! + ORBIT.out }]);
		expect(fullCharges).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// AC 4 (Matrix row DW-173) and the Non-entry row, at the Joust level.
// ---------------------------------------------------------------------------

describe('Story 3.6 -- AC 4, Matrix "DW-173": two same-side orbits are a repeat, never a faked alternation', () => {
	for (const offset of [50, 300, 550]) {
		it(`O_l, then a compressed second left orbit whose s_loop_r_out lands ${offset} ticks after the first orbit's s_loop_r_in: two left _made, no right Loop event, Charges 1, 1 and awards V, V`, () => {
			expect(offset, 'the premise: inside the loop window of the first orbit\'s s_loop_r_in').toBeLessThanOrEqual(LOOP_WINDOW);
			const g = FIRST + ORBIT.farIn + offset;
			const second = close('s_loop_l_in').at(g - 40).close('s_loop_l_out').at(g - 20).close('s_loop_r_out').at(g).close('s_loop_r_in').at(g + 60).build();
			const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), second);
			const duration = FIRST + GAP;
			const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });

			expect(shotEvents(script, duration)).toEqual([
				[`${LEFT}_made`, FIRST + ORBIT.out],
				[`${LEFT}_made`, g - 20],
			]);
			expect([chain(result, FIRST + ORBIT.out), chain(result, g - 20)]).toEqual([
				[1, LEFT],
				[1, LEFT],
			]);
			expect([paidOn(result, FIRST + ORBIT.out), paidOn(result, g - 20)]).toEqual([V, V]);
			expect(paidOn(result, g), 'nothing on the second orbit\'s s_loop_r_out').toBe(0);
			expect(scoreAt(result, duration)).toBe(2 * V);
			expect(chain(result, duration)).toEqual([1, LEFT]);
		});
	}

	it('control: O_l then O_r gives Charge 2, paying V then 2V', () => {
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP));
		const result = runRulesScript(script, { durationTicks: FIRST + 2 * GAP, initialState: START_STATE() });
		expect(chain(result, FIRST + GAP + ORBIT.out)).toEqual([2, RIGHT]);
		expect(scoreAt(result, FIRST + 2 * GAP)).toBe(3 * V);
	});
});

describe('Story 3.6 -- Matrix "Non-entry", at the Joust level: a ball coming down a Loop lane changes nothing', () => {
	// Charge 2 first (O_l, O_r), so "unchanged" is a real measurement.
	const descent = FIRST + 2 * GAP;
	const rampMade = FIRST + 3 * GAP;
	const bare = FIRST + 4 * GAP;
	const plungeDescent = close('s_loop_l_out').at(descent).close('s_loop_l_in').at(descent + 582).close('s_inlane_l').at(descent + 582 + 640).build();
	const rampReturn = merged(ramp(rampMade), close('s_loop_r_in').at(rampMade + 1893).close('s_inlane_r').at(rampMade + 1893 + 946).build());
	const quiet = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP), plungeDescent, rampReturn);

	it('the plunge descent (s_loop_l_out, s_loop_l_in 582 ticks later, s_inlane_l) and the Ramp return (s_ramp_made, s_loop_r_in 1893 ticks later, s_inlane_r): no Loop event, the Charge, lastLoop and score unchanged', () => {
		const duration = bare;
		const result = runRulesScript(quiet, { durationTicks: duration, initialState: START_STATE() });
		expect(shotEvents(quiet, duration)).toEqual([
			[`${LEFT}_made`, FIRST + ORBIT.out],
			[`${RIGHT}_made`, FIRST + GAP + ORBIT.out],
			['shot_ramp_made', rampMade],
		]);
		expect(chain(result, descent - 1), 'the premise: Charge 2 before the descents').toEqual([2, RIGHT]);
		expect(chain(result, duration)).toEqual([2, RIGHT]);
		expect(scoreAt(result, duration)).toBe(scoreAt(result, descent - 1));
		expect(joustEvents(result)).toEqual([]);
	});

	it('control: a bare s_loop_r_in then s_outlane_r is a broken Right Loop -- joust_charge_broken{the Right Loop, charge 2}', () => {
		const script = merged(quiet, close('s_loop_r_in').at(bare).close('s_outlane_r').at(bare + 1281).build());
		const duration = bare + 1281 + 10;
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });
		expect(shotEvents(script, duration).slice(-1)).toEqual([[`${RIGHT}_broken`, bare + 1281]]);
		expect(joustEvents(result)).toEqual([{ type: 'joust_charge_broken', player: 0, shot: RIGHT, charge: 2, tick: bare + 1281 }]);
		expect(chain(result, duration)).toEqual([1, 'absent']);
	});
});

// ---------------------------------------------------------------------------
// AC 8 (Matrix rows Timer, Ball end, Spinner).
// ---------------------------------------------------------------------------

describe('Story 3.6 -- AC 8: the timer and the ball end stop Joust with no award; the Spinner scores as it does with no Joust', () => {
	describe('Matrix "Timer": a Left Loop made on t0+T-1, a Right Loop completing on t0+T', () => {
		const last = T0 + T - 1;
		const script = merged(
			capture('s_lock_1', T0),
			close('s_loop_l_in').at(last - ORBIT.out).close('s_loop_l_out').at(last).build(),
			close('s_loop_r_in').at(last + 1 - ORBIT.out).close('s_loop_r_out').at(last + 1).build(),
		);
		const duration = T0 + T + 5;
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });

		it('the premise: the tracker makes the Left Loop on t0+T-1 and the Right Loop on t0+T', () => {
			expect(shotEvents(script, duration)).toEqual([
				[`${LEFT}_made`, T0 + T - 1],
				[`${RIGHT}_made`, T0 + T],
			]);
		});

		it('at t0+T-1 the timer reads 1 and the Loop pays V', () => {
			expect(joustAt(result, T0 + T - 1)!.timerTicks).toBe(1);
			expect(paidOn(result, T0 + T - 1)).toBe(V);
			expect(chain(result, T0 + T - 1)).toEqual([1, LEFT]);
		});

		it('at t0+T the stop triple fires -- and nothing else -- and the Right Loop pays nothing', () => {
			expect(modeEventsAt(result, T0 + T)).toEqual(stopTriple(T0 + T));
			expect(joustAt(result, T0 + T)).toBeUndefined();
			expect(paidOn(result, T0 + T), 'it would have paid 2V a tick earlier').toBe(0);
			expect(scoreAt(result, duration)).toBe(V);
		});

		it('every tick from t0 to t0+T-1 publishes timerTicks = T - e', () => {
			const mismatches: number[] = [];
			for (let tick = T0; tick < T0 + T; tick++) {
				if (joustAt(result, tick)?.timerTicks !== T - (tick - T0)) {
					mismatches.push(tick);
				}
			}
			expect(mismatches).toEqual([]);
		});
	});

	it('Matrix "Timer", joustMs 0: T clamps to 1 -- timerTicks 1 at t0, and the stop triple at t0+1', () => {
		const zero = tuned({ joustMs: 0 });
		expect(zero.joustTicks.value, 'the premise: 0 ms resolves to 0 ticks').toBe(0);
		const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + 3, tuning: zero, initialState: START_STATE() });
		expect(joustAt(result, T0)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: T0, charge: 1, timerTicks: 1 });
		expect(modeEventsAt(result, T0 + 1)).toEqual(stopTriple(T0 + 1));
		expect(joustAt(result, T0 + 1)).toBeUndefined();
	});

	describe('Matrix "Ball end": O_l, then a drain while Joust runs', () => {
		// The lock serves on t0; the served ball arrives, is launched, makes a
		// Left Loop and drains.
		const drain = FIRST + GAP + 1000;
		const script = merged(capture('s_lock_1', T0), serve('s_trough_3', T0 + 10, T0 + 30), orbit('l', FIRST), close('s_trough_3').at(drain).build());
		// Two DRAGON letters in the bonus, so ball_ended.total is nonzero whatever
		// the Loop's own bonus credit is.
		const result = runRulesScript(script, {
			durationTicks: drain + 2,
			initialState: gameState({ player: { modesLit: ['joust'], bonus: { byCategory: { letters: 2, loops: 0, strikes: 0 }, multiplier: 1 } } }),
		});
		const ended = eventsOfType(result, 'ball_ended');

		it('the premise: the Loop paid V, and the ball ended on the drain tick with Joust running the tick before', () => {
			expect(paidOn(result, FIRST + ORBIT.out)).toBe(V);
			expect(ended.map((event) => event.tick)).toEqual([drain]);
			expect(chain(result, drain - 1)).toEqual([1, LEFT]);
		});

		it('Joust\'s stop triple fires on the drain tick and it has left modes[] by ball_ended; no Joust event anywhere', () => {
			const joustLifecycle = result.modeEvents.filter((event) => 'mode' in event && event.mode === 'joust' && event.tick > T0);
			expect(joustLifecycle).toEqual(stopTriple(drain));
			expect(joustAt(result, drain)).toBeUndefined();
			expect(joustEvents(result)).toEqual([]);
		});

		it('the score\'s change at the drain tick equals ball_ended.total -- the bonus, and nothing from Joust', () => {
			const total = (ended[0] as { total: number }).total;
			expect(total, 'the premise: a nonzero bonus').toBeGreaterThan(0);
			expect(paidOn(result, drain)).toBe(total);
		});
	});

	// Story 3.6 review: the Boundaries name the Slam and the Attract entry
	// beside the ball end. The Slam IS the Attract entry with modes still
	// live, so one row pins both: Joust is stopped through the lifecycle, with
	// no Joust event of its own.
	describe('the Slam (the Attract entry with Joust live): O_l, O_r, then s_slam_tilt while Joust runs at Charge 2', () => {
		const slam = FIRST + 2 * GAP;
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP), press('s_slam_tilt', slam, slam + 1));
		const result = runRulesScript(script, { durationTicks: slam + 5, initialState: START_STATE() });

		it('the premise: Joust is at Charge 2 with 3V scored the tick before, and the Slam takes the machine to Attract', () => {
			expect(chain(result, slam - 1)).toEqual([2, RIGHT]);
			expect(scoreAt(result, slam - 1)).toBe(3 * V);
			expect(result.statesByTick.get(slam - 1)!.phase).toBe('game');
			expect(result.statesByTick.get(slam)!.phase).toBe('attract');
		});

		it('Joust\'s stop triple fires on the Slam tick, it has left modes[], and no Joust event fires -- nothing is awarded on the way out', () => {
			const joustLifecycle = result.modeEvents.filter((event) => 'mode' in event && event.mode === 'joust' && event.tick > T0);
			expect(joustLifecycle).toEqual(stopTriple(slam));
			expect(joustAt(result, slam)).toBeUndefined();
			expect(joustEvents(result)).toEqual([]);
			expect(scoreAt(result, slam), 'the Slam keeps the players; the score is exactly what the two Loops paid').toBe(3 * V);
			expect(scoreAt(result, slam + 5)).toBe(3 * V);
		});
	});

	describe('Matrix "Spinner": two Spinner turns on one tick while Joust runs at Charge 2', () => {
		const spin = FIRST + 2 * GAP;
		const turns = close('s_spinner').at(spin).open().at(spin).close().at(spin).build();
		const loops = merged(orbit('l', FIRST), orbit('r', FIRST + GAP));
		const withJoust = runRulesScript(merged(capture('s_lock_1', T0), loops, turns), { durationTicks: spin + 10, initialState: START_STATE() });
		// The same edges with nothing lit: the capture starts no Mode.
		const withoutJoust = runRulesScript(merged(capture('s_lock_1', T0), loops, turns), { durationTicks: spin + 10, initialState: gameState() });

		it('the premise: Joust is at Charge 2 in one run and absent from the other', () => {
			expect(chain(withJoust, spin - 1)).toEqual([2, RIGHT]);
			expect(joustAt(withoutJoust, spin - 1)).toBeUndefined();
			expect(scoreAt(withoutJoust, spin - 1), 'Loops outside Joust score nothing').toBe(0);
		});

		it('the Spinner pays 2 x spinnerScore in Joust -- exactly what it pays with no Joust', () => {
			expect(paidOn(withJoust, spin)).toBe(2 * SPINNER_SCORE);
			expect(paidOn(withoutJoust, spin)).toBe(2 * SPINNER_SCORE);
			expect(2 * SPINNER_SCORE, 'at the defaults').toBe(500);
		});

		it('and the Charge is unchanged, with no Joust event', () => {
			expect(chain(withJoust, spin)).toEqual([2, RIGHT]);
			expect(joustEvents(withJoust)).toEqual([]);
		});
	});
});

// ---------------------------------------------------------------------------
// AC 9 (Matrix rows Tilt, Hot seat, Hurry-up below).
// ---------------------------------------------------------------------------

describe('Story 3.6 -- AC 9: under Tilt a Loop is ignored entirely; a Joust belongs to its own player; a Hurry-up below keeps its Ramp', () => {
	const breakAt = FIRST + GAP;
	const loops = merged(orbit('l', FIRST), close('s_loop_l_in').at(breakAt).close('s_outlane_l').at(breakAt + 1281).build());
	const duration = breakAt + 1281 + 10;

	describe('Matrix "Tilt": tilted, then O_l, then a fall-back', () => {
		const warn = T0 + 100;
		const tilt = warn + SPACING + 10;
		const script = merged(capture('s_lock_1', T0), press('s_tilt_bob', warn, warn + 2), press('s_tilt_bob', tilt, tilt + 2), loops);
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });

		it('the premise: the ball is tilted before the Loop, Joust is running, and the tracker still makes and breaks the Left Loop', () => {
			expect(tilt).toBeLessThan(FIRST);
			expect(result.statesByTick.get(tilt - 1)!.machine.tilt.tilted, 'not yet tilted before the second closure').toBe(false);
			expect(result.statesByTick.get(FIRST)!.machine.tilt.tilted).toBe(true);
			expect(shotEvents(script, duration)).toEqual([
				[`${LEFT}_made`, FIRST + ORBIT.out],
				[`${LEFT}_broken`, breakAt + 1281],
			]);
		});

		it('no award, no Charge change, no lastLoop, no Joust event -- and Joust is still active, its timer running', () => {
			expect(scoreAt(result, duration)).toBe(0);
			expect(chain(result, FIRST + ORBIT.out), 'the made Loop did not even open a chain').toEqual([1, 'absent']);
			expect(joustEvents(result)).toEqual([]);
			expect(joustAt(result, duration)).toEqual({ mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: T0, charge: 1, timerTicks: T - (duration - T0) });
		});
	});

	it('control: the same Loop and fall-back untilted -- V paid, lastLoop set, then joust_charge_broken{charge: 1}', () => {
		const result = runRulesScript(merged(capture('s_lock_1', T0), loops), { durationTicks: duration, initialState: START_STATE() });
		expect(paidOn(result, FIRST + ORBIT.out)).toBe(V);
		expect(chain(result, FIRST + ORBIT.out)).toEqual([1, LEFT]);
		expect(joustEvents(result)).toEqual([{ type: 'joust_charge_broken', player: 0, shot: LEFT, charge: 1, tick: breakAt + 1281 }]);
	});

	it('Matrix "Hot seat": player 1\'s Joust -- the Loop pays players[1] V, players[0] is untouched, and the events name player 1', () => {
		const players = [player({ score: 1234 }), player({ modesLit: ['joust'] })];
		const result = runRulesScript(merged(capture('s_lock_1', T0), loops), {
			durationTicks: duration,
			initialState: gameState({ players, currentPlayer: 1, modes: [{ ...BASE_ENTRY, player: 1 }] }),
		});
		expect(joustAt(result, T0)?.player, 'the premise: Joust runs for player 1').toBe(1);
		expect(paidOn(result, FIRST + ORBIT.out, 1)).toBe(V);
		expect(scoreAt(result, duration, 1)).toBe(V);
		expect(scoreAt(result, duration, 0), 'players[0] untouched').toBe(1234);
		expect(joustEvents(result)).toEqual([{ type: 'joust_charge_broken', player: 1, shot: LEFT, charge: 1, tick: breakAt + 1281 }]);
	});

	// Story 3.6 review: every `joust_full_charge` above names player 0, which a
	// hard-coded 0 would also satisfy -- and Story 3.10 reads this event's
	// `player` for the Extra-ball achievement. Player 1 reaches the cap here.
	it('Matrix "Hot seat", at the cap: player 1 reaching the cap (joustChargeMax 2) fires joust_full_charge{player: 1}', () => {
		const tuning = tuned({ joustChargeMax: 2 });
		expect(tuning.joustChargeMax.value, 'the premise: the cap is 2').toBe(2);
		const players = [player({ score: 1234 }), player({ modesLit: ['joust'] })];
		const script = merged(capture('s_lock_1', T0), orbit('l', FIRST), orbit('r', FIRST + GAP));
		const result = runRulesScript(script, {
			durationTicks: FIRST + 2 * GAP,
			tuning,
			initialState: gameState({ players, currentPlayer: 1, modes: [{ ...BASE_ENTRY, player: 1 }] }),
		});
		expect(joustAt(result, T0)?.player, 'the premise: Joust runs for player 1').toBe(1);
		expect(joustEvents(result)).toEqual([{ type: 'joust_full_charge', player: 1, tick: FIRST + GAP + ORBIT.out }]);
		expect(scoreAt(result, FIRST + 2 * GAP, 1), 'V then 2V, to player 1').toBe(3 * V);
		expect(scoreAt(result, FIRST + 2 * GAP, 0), 'players[0] untouched').toBe(1234);
	});

	describe('Matrix "Hurry-up below": Hurry-up starts at t0, Joust at t1, then O_l, then a Ramp', () => {
		// Lit [hurryup, joust]: the first capture opens the window and Start
		// confirms its selection (Hurry-up); the second capture has one candidate
		// left and starts Joust at once.
		const captured = 300;
		const t0 = captured + 20;
		const t1 = t0 + 2000;
		const loop = t1 + 1000;
		const collect = t0 + 8000;
		const script = merged(capture('s_lock_1', captured), press('s_start', t0, t0 + 1), capture('s_lock_2', t1), orbit('l', loop), ramp(collect));
		const result = runRulesScript(script, { durationTicks: collect + 10, initialState: gameState({ player: { modesLit: ['hurryup', 'joust'] } }) });
		const hurryupAt = (tick: number): ActiveModeState | undefined => result.statesByTick.get(tick)!.modes.find((entry) => entry.mode === 'hurryup');
		// v(e) = S - (S - F) * e / T, exact at this e.
		const e = collect - t0;
		const value = HURRYUP_START - ((HURRYUP_START - HURRYUP_FLOOR) * e) / HURRYUP_TICKS;

		it('the premise: Hurry-up starts at t0 and Joust at t1, both run until the Ramp, and v(e) is exact', () => {
			expect(hurryupAt(t0)?.startTick).toBe(t0);
			expect(joustAt(result, t1 - 1)).toBeUndefined();
			expect(joustAt(result, t1)?.startTick).toBe(t1);
			expect(hurryupAt(collect - 1)).toBeDefined();
			expect(((HURRYUP_START - HURRYUP_FLOOR) * e) % HURRYUP_TICKS, 'the straight line divides exactly at e').toBe(0);
			expect(e).toBeLessThan(HURRYUP_TICKS);
			expect(value, 'at the defaults: 250000 - 10 x 8000').toBe(170000);
		});

		it('the Loop pays exactly V -- Joust\'s award, and nothing from Hurry-up', () => {
			expect(paidOn(result, loop + ORBIT.out)).toBe(V);
			expect(chain(result, loop + ORBIT.out)).toEqual([1, LEFT]);
			expect(hurryupAt(loop + ORBIT.out), 'Hurry-up runs on').toBeDefined();
		});

		it('the Ramp collects v(e) and stops Hurry-up; Joust stays active with its chain intact', () => {
			expect(paidOn(result, collect)).toBe(value);
			expect(result.modeEvents.filter((event) => event.type === 'hurryup_collected')).toEqual([{ type: 'hurryup_collected', player: 0, value, tick: collect }]);
			expect(hurryupAt(collect)).toBeUndefined();
			expect(chain(result, collect)).toEqual([1, LEFT]);
			expect(joustAt(result, collect + 10)!.timerTicks).toBe(T - (collect + 10 - t1));
		});
	});
});

// ---------------------------------------------------------------------------
// AC 11 (Matrix row Ball search).
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

describe('Story 3.6 -- AC 11, Matrix "Ball search": ball search skips the Mouth while a real Joust publishes its timer, and opens it once Joust has stopped', () => {
	const O = 100;
	const lockStage = slotTick(O, 6);
	// A Joust entry as the lifecycle leaves it, but WITHOUT timerTicks: the
	// timer the Lock stage reads below is the one the real tick hook publishes.
	const joustEntry = { mode: 'joust', priority: MODE_PRIORITIES.joust, player: 0, startTick: 0, charge: 1 };

	// Story 3.6 review: a Lock-stage open pulses `c_mouth` MOUTH_LEAD ticks
	// after its show, so both runs below last past `lockStage + MOUTH_LEAD` --
	// a run that ended sooner could never see the pulse, and "no c_mouth"
	// would hold whether or not the stage had opened the Mouth.
	const pulseDue = lockStage + MOUTH_LEAD;

	it('running at the Lock stage: the hook publishes timerTicks = T - tick; no show_dragon_mouth_open and no c_mouth; the pass itself runs on undelayed', () => {
		expect(lockStage, 'the premise: the Lock stage falls inside the Joust timer').toBeLessThan(T);
		const duration = Math.max(slotTick(O, 8), pulseDue) + 10;
		expect(pulseDue, 'the premise: the run lasts past the tick a Lock-stage open would have pulsed c_mouth').toBeLessThan(duration);
		const result = runRulesScript(stuckFrom(O), { durationTicks: duration, initialState: stuckState([BASE_ENTRY, joustEntry]) });
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL), 'the search itself still runs').toEqual([slotTick(O, 8)]);
		expect(joustAt(result, lockStage)!.timerTicks, 'and what kept the Mouth shut is the timer the real tick hook publishes at the Lock stage').toBe(T - lockStage);
	});

	it('control: Joust stopped before the Lock stage (joustMs 10000) -- the stage opens the Mouth at slotTick(O, 6), and c_mouth pulses MOUTH_LEAD later', () => {
		const short = tuned({ joustMs: 10000 });
		const stop = Math.max(1, shotWindowTicks('joustMs', short));
		expect(stop, 'the premise: Joust\'s timer ends before the Lock stage').toBeLessThan(lockStage);
		const result = runRulesScript(stuckFrom(O), { durationTicks: pulseDue + 10, tuning: short, initialState: stuckState([BASE_ENTRY, joustEntry]) });
		expect(modeEventsAt(result, stop), 'the premise: the real tick hook stopped Joust').toEqual(stopTriple(stop));
		expect(joustAt(result, lockStage - 1)).toBeUndefined();
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([lockStage]);
		expect(pulseTicks(result, MOUTH_COIL), 'the positive for "no c_mouth" above: the same coil does pulse once the stage opens the Mouth').toEqual([pulseDue]);
	});

	it('control of the control: the same stuck state with no Joust at all opens the Mouth at the same tick', () => {
		const result = runRulesScript(stuckFrom(O), { durationTicks: lockStage + 10, initialState: stuckState([BASE_ENTRY]) });
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([lockStage]);
	});
});
