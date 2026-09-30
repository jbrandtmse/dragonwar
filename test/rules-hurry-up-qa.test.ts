// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.5 QA (AC 2, AC 3, AC 4, AC 8; AD-3, AD-8, AD-18, FR-15, FR-23,
// FR-34): the rows `test/rules-hurry-up.test.ts` covers weakly or not at
// all, headless through `runRulesScript()` on a real `createRules()`, with a
// real Lock capture (lit [hurryup], no credits) starting Hurry-up at t0.
//
// - The decay at tunings where (S - F) / T is NOT an integer. The spec's own
//   rows are the defaults (exact on every tick, 10 per tick) and a 3-tick
//   toy; nothing pinned the rounding over a long decay. Asserted over every
//   tick without Hurry-up's formula: each value is an integer, exact at both
//   ends, never above the straight line and less than one point below it
//   (integer cross-multiplication, no float), never increasing; plus hand
//   literals, and a collect that pays the published value exactly.
// - The collect under Tilt, paired in ONE test with its untilted twin: the
//   two runs differ only by the tilt bob's second closure. And the tilted
//   ball's drain: the ball end stops Hurry-up with no award.
// - Ball search's `timerTicks` gate in ONE run, on a Hurry-up a real
//   capture started: the first pass's Lock stages fall inside the decay and
//   request nothing; a playfield closure restarts the search; the second
//   pass's Lock stage falls after the floor and opens the Mouth (the Lock
//   is released). Paired with the same run at a longer `hurryUpMs`, where
//   the second pass is still inside the decay and nothing opens.
//
// Headless: listed in `test/rules-devices-headless.test.ts`'s ENTRY_FILES.

import { describe, expect, it } from 'vitest';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING, type ResolvedTuning } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { ActiveModeState, PlayerState } from '../src/sim/contracts/state';
import type { ModeEvent } from '../src/sim/rules/modes';
import type { GameState, MachineState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const S = TUNING.hurryUpStartValue.value;
const F = TUNING.hurryUpFloor.value;
const T = Math.max(1, shotWindowTicks('hurryUpMs', TUNING));
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);
const SPACING = shotWindowTicks('tiltWarningSpacingMs', TUNING);
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);
const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const MOUTH_COIL = 'c_mouth';
const AUTOLAUNCH_COIL = 'c_autolaunch';
const MOUTH_OPEN_SHOW = 'show_dragon_mouth_open';

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

function machine(): MachineState {
	return {
		ballsInPlay: 1,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
	};
}

/** A mid-game state: player 0 up with `overrides`, the base mode active, the Lock empty, one ball in play. */
function gameState(overrides: Partial<PlayerState> = {}): GameState {
	return { tick: 0, phase: 'game', machine: machine(), players: [player(overrides)], currentPlayer: 0, modes: [{ mode: 'base', priority: 100, player: 0 }], rng: 0 };
}

/** Lit [hurryup], no credits: a capture locks and starts Hurry-up on the capture tick. */
const START_STATE = (): GameState => gameState({ modesLit: ['hurryup'] });

function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

function ramp(t: number): readonly SwitchEvent[] {
	return close('s_ramp_enter').at(t - 20).open().at(t - 15).close('s_ramp_made').at(t).open().at(t + 5).build();
}

function press(button: SwitchName, at: number, release: number): readonly SwitchEvent[] {
	return close(button).at(at).open().at(release).build();
}

/** A served ball's arrival at `arrive`, then its launch at `launch`. */
function serve(troughSlot: SwitchName, arrive: number, launch: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').at(arrive).open(troughSlot).at(arrive).open('s_shooter_lane').at(launch).build();
}

function sorted(...scripts: (readonly SwitchEvent[])[]): readonly SwitchEvent[] {
	return scripts.flat().sort((a, b) => a.tick - b.tick);
}

function entryAt(result: RunRulesScriptResult, tick: number): ActiveModeState | undefined {
	return result.statesByTick.get(tick)!.modes.find((entry) => entry.mode === 'hurryup');
}

function scoreAt(result: RunRulesScriptResult, tick: number): number {
	return result.statesByTick.get(tick)!.players[0]!.score;
}

function collected(result: RunRulesScriptResult): ModeEvent[] {
	return result.modeEvents.filter((event) => event.type === 'hurryup_collected');
}

function eventsOfType(result: RunRulesScriptResult, type: string): SemanticEvent[] {
	return result.events.filter((event) => event.type === type);
}

function showTicks(result: RunRulesScriptResult, show: string): number[] {
	return result.commands.filter((command) => command.show === show).map((command) => command.tick);
}

function pulseTicks(result: RunRulesScriptResult, coil: string): number[] {
	return result.coilCommands.filter((command) => command.coil === coil && command.action === 'pulse').map((command) => command.tick);
}

function tuned(overrides: Partial<Record<'hurryUpStartValue' | 'hurryUpFloor' | 'hurryUpMs', number>>): ResolvedTuning {
	return resolveTuning({
		...RAW_TUNING,
		...(overrides.hurryUpStartValue === undefined ? {} : { hurryUpStartValue: { ...RAW_TUNING.hurryUpStartValue, value: overrides.hurryUpStartValue } }),
		...(overrides.hurryUpFloor === undefined ? {} : { hurryUpFloor: { ...RAW_TUNING.hurryUpFloor, value: overrides.hurryUpFloor } }),
		...(overrides.hurryUpMs === undefined ? {} : { hurryUpMs: { ...RAW_TUNING.hurryUpMs, value: overrides.hurryUpMs } }),
	});
}

const T0 = 300;

// ---------------------------------------------------------------------------
// AC 2: the decay's integer arithmetic where (S - F) / T is not an integer.
// ---------------------------------------------------------------------------

describe('Story 3.5 QA -- AC 2: the decay at tunings where (S - F) / T is not an integer -- integers, exact at both ends, on or just under the line, never increasing', () => {
	const cases = [
		{ label: 'S 250000, F 50000, hurryUpMs 7777', s: 250000, f: 50000, ms: 7777, literals: { 1: 249974, 1000: 224283, 7776: 50025 } as Record<number, number> },
		{ label: 'S 100001, F 3, hurryUpMs 13', s: 100001, f: 3, ms: 13, literals: { 1: 92308, 6: 53848, 12: 7695 } as Record<number, number> },
	];

	for (const c of cases) {
		describe(c.label, () => {
			const tuning = tuned({ hurryUpStartValue: c.s, hurryUpFloor: c.f, hurryUpMs: c.ms });
			const t = Math.max(1, shotWindowTicks('hurryUpMs', tuning));
			const result = runRulesScript(capture('s_lock_1', T0), { durationTicks: T0 + t + 50, tuning, initialState: START_STATE() });
			const valueAt = (e: number): number => entryAt(result, T0 + e)!.value as number;

			it('the premise: T is the ms figure in ticks, (S - F) / T is not an integer, and Hurry-up started at t0', () => {
				expect(t).toBe(c.ms);
				expect((c.s - c.f) % t).not.toBe(0);
				expect(entryAt(result, T0)?.startTick).toBe(T0);
			});

			it('both ends are exact: value(0) = S with timerTicks T; value(T) = F with no timerTicks, held to T + 50', () => {
				expect(entryAt(result, T0)).toMatchObject({ value: c.s, timerTicks: t });
				for (const e of [t, t + 1, t + 50]) {
					const entry = entryAt(result, T0 + e)!;
					expect(entry.value, `e = ${e}`).toBe(c.f);
					expect('timerTicks' in entry, `e = ${e}: no timerTicks key`).toBe(false);
				}
			});

			it('every tick 0 <= e < T: an integer, (value - F) * T <= (S - F) * (T - e) < (value - F + 1) * T (on the line or under it by less than one point), timerTicks T - e', () => {
				const bad: string[] = [];
				for (let e = 0; e < t; e++) {
					const entry = entryAt(result, T0 + e)!;
					const value = entry.value as number;
					const numerator = (c.s - c.f) * (t - e);
					const ok = Number.isInteger(value) && (value - c.f) * t <= numerator && numerator < (value - c.f + 1) * t && entry.timerTicks === t - e;
					if (!ok) {
						bad.push(`e=${e}: ${JSON.stringify(entry)}`);
					}
				}
				expect(bad.slice(0, 5)).toEqual([]);
			});

			it('monotonic non-increasing from t0 to T + 50, and strictly below S from e = 1', () => {
				const rises: number[] = [];
				for (let e = 1; e <= t + 50; e++) {
					if (valueAt(e) > valueAt(e - 1)) {
						rises.push(e);
					}
				}
				expect(rises).toEqual([]);
				expect(valueAt(1)).toBeLessThan(c.s);
			});

			it('hand literals (rounded down, never to nearest)', () => {
				for (const [e, expected] of Object.entries(c.literals)) {
					expect(valueAt(Number(e)), `e = ${e}`).toBe(expected);
				}
			});
		});
	}

	it('a Ramp at a non-integer point pays exactly the published value: S 250000, F 50000, hurryUpMs 7777, collect at e = 1000 pays 224283', () => {
		const tuning = tuned({ hurryUpMs: 7777 });
		const at = T0 + 1000;
		const result = runRulesScript(sorted(capture('s_lock_1', T0), ramp(at)), { durationTicks: at + 5, tuning, initialState: START_STATE() });
		expect(entryAt(result, at - 1)?.value, 'the premise: e = 999 published 224308 (50000 + floor(200000 * 6778 / 7777))').toBe(224308);
		expect(scoreAt(result, at) - scoreAt(result, at - 1)).toBe(224283);
		expect(collected(result)).toEqual([{ type: 'hurryup_collected', player: 0, value: 224283, tick: at }]);
	});
});

// ---------------------------------------------------------------------------
// AC 3 / AC 4: the collect under Tilt vs untilted, paired; the tilted drain.
// ---------------------------------------------------------------------------

describe('Story 3.5 QA -- AC 3: a Ramp collects with a tilt warning standing, and not once the ball is tilted -- the two runs differ only by the second bob closure', () => {
	const warn = T0 + 100;
	const tilt = warn + SPACING + 10;
	const at = T0 + 1000;

	it('one closure (a warning): collects v(1000); two closures (Tilt): no award, no hurryup_collected, Hurry-up still running and decaying', () => {
		const warned = runRulesScript(sorted(capture('s_lock_1', T0), press('s_tilt_bob', warn, warn + 2), ramp(at)), { durationTicks: at + 5, initialState: START_STATE() });
		const tilted = runRulesScript(sorted(capture('s_lock_1', T0), press('s_tilt_bob', warn, warn + 2), press('s_tilt_bob', tilt, tilt + 2), ramp(at)), {
			durationTicks: at + 5,
			initialState: START_STATE(),
		});
		const v1000 = S - ((S - F) * 1000) / T;
		expect(((S - F) * 1000) % T, 'the premise: v(1000) is exact').toBe(0);

		// The premises of the pair.
		expect(eventsOfType(warned, 'tilt_warning').length, 'the warned run registered a warning').toBeGreaterThan(0);
		expect(warned.statesByTick.get(at - 1)!.machine.tilt.tilted, 'the warned run is NOT tilted').toBe(false);
		expect(tilted.statesByTick.get(at - 1)!.machine.tilt.tilted, 'the tilted run IS tilted').toBe(true);
		expect(entryAt(warned, at - 1) && entryAt(tilted, at - 1), 'Hurry-up runs in both before the Ramp').toBeTruthy();

		// Untilted: the collect.
		expect(scoreAt(warned, at) - scoreAt(warned, at - 1)).toBe(v1000);
		expect(collected(warned)).toEqual([{ type: 'hurryup_collected', player: 0, value: v1000, tick: at }]);
		expect(entryAt(warned, at)).toBeUndefined();

		// Tilted: nothing.
		expect(scoreAt(tilted, at) - scoreAt(tilted, at - 1)).toBe(0);
		expect(collected(tilted)).toEqual([]);
		expect(entryAt(tilted, at)).toMatchObject({ value: v1000, timerTicks: T - 1000 });
	});
});

describe('Story 3.5 QA -- AC 4: a tilted ball\'s drain stops Hurry-up with no award', () => {
	const warn = T0 + 100;
	const tilt = warn + SPACING + 10;
	const drain = T0 + 2000;
	const script = sorted(capture('s_lock_1', T0), serve('s_trough_3', T0 + 10, T0 + 30), press('s_tilt_bob', warn, warn + 2), press('s_tilt_bob', tilt, tilt + 2), close('s_trough_3').at(drain).build());
	const result = runRulesScript(script, { durationTicks: drain + 2, initialState: START_STATE() });

	it('the premise: tilted before the drain, Hurry-up running the tick before, and the ball ends (tilted) on the drain tick', () => {
		expect(result.statesByTick.get(drain - 1)!.machine.tilt.tilted).toBe(true);
		expect(entryAt(result, drain - 1)).toBeDefined();
		expect(eventsOfType(result, 'ball_ended').map((event) => [event.tick, (event as { tilted: boolean }).tilted])).toEqual([[drain, true]]);
	});

	it('the entry is gone on the drain tick, no hurryup_collected anywhere, and the score is unchanged by the ball end', () => {
		expect(entryAt(result, drain)).toBeUndefined();
		expect(collected(result)).toEqual([]);
		const total = (eventsOfType(result, 'ball_ended')[0] as { total: number }).total;
		expect(scoreAt(result, drain) - scoreAt(result, drain - 1)).toBe(total);
		expect(scoreAt(result, drain), 'nothing was paid on this ball at all').toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC 8: ball search's timerTicks gate releases the Lock once Hurry-up is on
// the floor -- in one run, on a Hurry-up a real capture started.
// ---------------------------------------------------------------------------

describe('Story 3.5 QA -- AC 8: in one run, ball search skips the Mouth while a capture-started Hurry-up decays, and opens it on the next pass once Hurry-up is on the floor', () => {
	// The capture locks the ball and starts Hurry-up at t0; the served ball
	// arrives and is launched at O (the in-play transition: the pass origin)
	// and closes nothing. Pass 1 runs its Lock stages (slots 6 and 7) inside
	// the decay; a playfield closure at R, after slot 7 and before the
	// autolaunch slot 8, restarts the search; pass 2's Lock stage is slot 6
	// from R.
	const O = T0 + 30;
	const slot = (origin: number, k: number): number => origin + SEARCH + k * STEP;
	const R = slot(O, 7) + 50;
	const script = sorted(capture('s_lock_1', T0), serve('s_trough_3', T0 + 10, O), close('s_inlane_l').at(R).open().at(R + 5).build());
	const duration = Math.max(slot(R, 8), slot(R, 6) + LEAD) + 10;

	it('the premise: the timeline -- pass 1\'s Lock stages fall inside the default decay, R falls before pass 1\'s autolaunch slot, pass 2\'s Lock stage after the floor', () => {
		expect(slot(O, 7) - T0).toBeLessThan(T);
		expect(R).toBeLessThan(slot(O, 8));
		expect(slot(R, 6) - T0).toBeGreaterThanOrEqual(T);
	});

	describe('production tuning (hurryUpMs 20000)', () => {
		const result = runRulesScript(script, { durationTicks: duration, initialState: START_STATE() });

		it('the premise: Hurry-up started at t0 by the capture, the Lock holds the captured ball, and two passes started (at O + SEARCH and R + SEARCH)', () => {
			expect(entryAt(result, T0)?.startTick).toBe(T0);
			expect(result.statesByTick.get(O)!.machine.deviceSlots.bd_lock).toEqual([true, false, false]);
			expect(eventsOfType(result, 'ball_search_started').map((event) => event.tick)).toEqual([O + SEARCH, R + SEARCH]);
		});

		it('pass 1, decaying: its Lock stages request nothing -- timerTicks is published at both', () => {
			expect(entryAt(result, slot(O, 6))?.timerTicks).toBe(T - (slot(O, 6) - T0));
			expect(entryAt(result, slot(O, 7))?.timerTicks).toBe(T - (slot(O, 7) - T0));
			expect(showTicks(result, MOUTH_OPEN_SHOW).filter((tick) => tick < R)).toEqual([]);
		});

		it('pass 2, on the floor: the Lock stage opens the Mouth at slot(R, 6), and c_mouth pulses LEAD later', () => {
			expect(entryAt(result, slot(R, 6)), 'the premise: Hurry-up is still active, on the floor, no timer').toMatchObject({ value: F });
			expect('timerTicks' in entryAt(result, slot(R, 6))!).toBe(false);
			expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([slot(R, 6)]);
			expect(pulseTicks(result, MOUTH_COIL)).toEqual([slot(R, 6) + LEAD]);
		});
	});

	it('paired control: the same run at hurryUpMs 60000 -- pass 2\'s Lock stage is still inside the decay, so the Mouth never opens in either pass, and both passes still run on', () => {
		const long = tuned({ hurryUpMs: 60000 });
		const longT = shotWindowTicks('hurryUpMs', long);
		expect(slot(R, 7) - T0, 'the premise: pass 2\'s Lock stages fall inside this decay').toBeLessThan(longT);
		const result = runRulesScript(script, { durationTicks: duration, tuning: long, initialState: START_STATE() });
		expect(entryAt(result, slot(R, 6))?.timerTicks).toBe(longT - (slot(R, 6) - T0));
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
		expect(eventsOfType(result, 'ball_search_started').map((event) => event.tick), 'both passes ran').toEqual([O + SEARCH, R + SEARCH]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL).filter((tick) => tick > R), 'pass 2 reached its autolaunch stage').toEqual([slot(R, 8)]);
	});
});
