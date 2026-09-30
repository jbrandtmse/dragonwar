// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.4 (AD-7, AD-8, AD-18, FR-33): the headless coverage of the
// campaign -- lighting a Mode at the Ramp (the base mode), starting it at the
// Lock lane (the Lock arbiter), the mode-select window, and DW-293's
// `modesPlayed`. Every row of the spec's I/O & Edge-Case Matrix, the two AC 3
// entry rows and the AC 7 integration run, driven through `runRulesScript()`
// (`test/util/switch-script.ts`) on a real `createRules()`, with switch edges
// scripted by hand. No physics, no rendering, no `sim/loop` (gated by
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES).
//
// Every tick below is derived from `resolveTuning()`: W is `modeSelectTicks`,
// Hd `modeSelectHoldTicks`, L `mouthOpenLeadTicks`. A capture at t is Story
// 3.2's `capture(s_lock_N, t)`: the lane closes inside the capture window and
// the slot closes at t. Every negative is paired with its positive.

import { describe, expect, it } from 'vitest';
import { createRules, DEFAULT_ADJUSTMENTS } from '../src/sim/rules';
import { MODE_PRIORITIES } from '../src/sim/rules/modes';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { CampaignModeName, PlayerState } from '../src/sim/contracts/state';
import type { ModeEvent } from '../src/sim/rules';
import type { GameState, MachineState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const W = shotWindowTicks('modeSelectMs', TUNING);
const HD = shotWindowTicks('modeSelectHoldMs', TUNING);
const L = shotWindowTicks('mouthOpenLeadMs', TUNING);
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);

/** The lane closure lands this many ticks before its slot's close -- inside the capture window, so the devices layer resolves a captured entry. */
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const MOUTH_COIL = 'c_mouth';
const TROUGH_EJECT_COIL = 'c_trough_eject';
const MODE_START_SHOW = 'show_mode_start';
const MOUTH_OPEN_SHOW = 'show_dragon_mouth_open';

/** The Lock arbiter's outcome events and the window's, in emission order. */
const ARBITER_TYPES: readonly string[] = ['lock_lane_locked', 'lock_lane_spit', 'lock_lane_mode_start', 'mode_select_moved', 'mode_select_ended'];

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

/** A mid-game state: one ball in play for player 0 with the base mode active, the Lock holding `held` balls. */
function gameState(options: {
	readonly phase?: GameState['phase'];
	readonly player?: Partial<PlayerState>;
	readonly held?: number;
	readonly machine?: Partial<MachineState>;
	readonly modes?: GameState['modes'];
} = {}): GameState {
	const base = machine(options.machine ?? {});
	return {
		tick: 0,
		phase: options.phase ?? 'game',
		machine: { ...base, deviceSlots: { ...base.deviceSlots, bd_lock: lockSlots(options.held ?? 0) } },
		players: [player(options.player ?? {})],
		currentPlayer: 0,
		modes: options.modes ?? [BASE_ENTRY],
		rng: 0,
	};
}

/** A captured Lock entry: the lane closes `LANE_LEAD` ticks before `slot` closes at `t` (inside the capture window). */
function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

/** A made Ramp: `s_ramp_enter` then `s_ramp_made` closing at `t` (inside `rampWindowMs`), so `shot_ramp_made` fires at `t`. */
function ramp(t: number): readonly SwitchEvent[] {
	return close('s_ramp_enter').at(t - 20).open().at(t - 15).close('s_ramp_made').at(t).open().at(t + 5).build();
}

/** A button pressed at `at` and released at `release`. */
function press(button: SwitchName, at: number, release: number): readonly SwitchEvent[] {
	return close(button).at(at).open().at(release).build();
}

function arbiterEvents(result: RunRulesScriptResult, tick?: number): SemanticEvent[] {
	return result.events.filter((event) => ARBITER_TYPES.includes(event.type) && (tick === undefined || event.tick === tick));
}

function pulseTicks(result: RunRulesScriptResult, coil: string): number[] {
	return result.coilCommands.filter((command) => command.coil === coil && command.action === 'pulse').map((command) => command.tick);
}

function showsAt(result: RunRulesScriptResult, tick: number): string[] {
	return result.commands.filter((command) => command.tick === tick).map((command) => command.show);
}

function showTicks(result: RunRulesScriptResult, show: string): number[] {
	return result.commands.filter((command) => command.show === show).map((command) => command.tick);
}

/** The lifecycle events of `mode`, as `[type, tick]`. */
function lifecycleOf(result: RunRulesScriptResult, mode: string): [string, number][] {
	return result.modeEvents.filter((event): event is Extract<ModeEvent, { mode: string }> => 'mode' in event && event.mode === mode).map((event) => [event.type, event.tick]);
}

function startTriple(mode: CampaignModeName, tick: number): [string, number][] {
	return [
		[`mode_${mode}_will_start`, tick],
		[`mode_${mode}_starting`, tick],
		[`mode_${mode}_started`, tick],
	];
}

function lit(result: RunRulesScriptResult, tick: number): readonly CampaignModeName[] {
	return result.statesByTick.get(tick)!.players[0]!.modesLit;
}

function played(result: RunRulesScriptResult, tick: number): readonly string[] {
	return result.statesByTick.get(tick)!.players[0]!.modesPlayed;
}

// ---------------------------------------------------------------------------
// AC 2 (Matrix rows 1-3): the base mode lights the next Mode at the Ramp.
// ---------------------------------------------------------------------------

describe('Story 3.4 -- AC 2: every Ramp completion lights the next campaign Mode, under the round rule, only while scoring is open', () => {
	it('Matrix "First Ramp": a fresh player\'s Ramp lights [hurryup] on the shot_ramp_made tick', () => {
		const t = 200;
		const result = runRulesScript(ramp(t), { durationTicks: t + 10, initialState: gameState() });
		expect(lit(result, t - 1)).toEqual([]);
		expect(lit(result, t)).toEqual(['hurryup']);
		expect(result.finalState.players[0]!.modesPlayed, 'lighting plays nothing').toEqual([]);
	});

	it('control: the same Ramp while tilted lights nothing', () => {
		const t = 200;
		const result = runRulesScript(ramp(t), { durationTicks: t + 10, initialState: gameState({ machine: { tilt: { tilted: true, slamTilted: false } } }) });
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
	});

	it('control: the same Ramp outside a game (the base entry left over in Attract) lights nothing', () => {
		const t = 200;
		const result = runRulesScript(ramp(t), { durationTicks: t + 10, initialState: gameState({ phase: 'attract' }) });
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
	});

	it('control: the same Ramp with no base mode active lights nothing -- the base mode is the one lighter', () => {
		const t = 200;
		const result = runRulesScript(ramp(t), { durationTicks: t + 10, initialState: gameState({ modes: [] }) });
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
	});

	it('Matrix "Order": four Ramps light [hurryup], [hurryup, quickmb], [hurryup, quickmb, joust], then nothing more', () => {
		const ticks = [200, 400, 600, 800];
		const result = runRulesScript(ticks.flatMap((t) => ramp(t)), { durationTicks: 900, initialState: gameState() });
		expect(ticks.map((t) => lit(result, t))).toEqual([['hurryup'], ['hurryup', 'quickmb'], ['hurryup', 'quickmb', 'joust'], ['hurryup', 'quickmb', 'joust']]);
	});

	it('Matrix "Restart": played [hurryup, quickmb, joust] and nothing lit -- the round has risen, so the Ramp lights [hurryup] again', () => {
		const t = 200;
		const result = runRulesScript(ramp(t), { durationTicks: t + 10, initialState: gameState({ player: { modesPlayed: ['hurryup', 'quickmb', 'joust'] } }) });
		expect(lit(result, t)).toEqual(['hurryup']);
	});

	it('control: played [hurryup, quickmb] -- the round is still 0, so the Ramp lights [joust]', () => {
		const t = 200;
		const result = runRulesScript(ramp(t), { durationTicks: t + 10, initialState: gameState({ player: { modesPlayed: ['hurryup', 'quickmb'] } }) });
		expect(lit(result, t)).toEqual(['joust']);
	});

	it('modesLit persists across a ball end (like lockCredits)', () => {
		const t = 200;
		const drain = 300;
		const result = runRulesScript([...ramp(t), ...close('s_trough_4').at(drain).build()], { durationTicks: drain + 5, initialState: gameState() });
		expect(result.events.filter((event) => event.type === 'ball_ended').map((event) => event.tick), 'the premise: the ball ended').toEqual([drain]);
		expect(lit(result, drain)).toEqual(['hurryup']);
	});
});

// ---------------------------------------------------------------------------
// AC 3 (Matrix rows 4-8, plus the two entry rows): one candidate.
// ---------------------------------------------------------------------------

describe('Story 3.4 -- AC 3 / AC 5: a captured entry with one candidate starts it on that tick, crediting the lock first', () => {
	it('Matrix "One lit, lock applies": [locked, mode_start{[hurryup]}] at t, Hurry-up\'s triple at t, played [hurryup] and lit [], credits 1, the trough serves at t, show_mode_start at t, no c_mouth', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_1', t), { durationTicks: t + L + 10, initialState: gameState({ player: { modesLit: ['hurryup'] } }) });
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup'], selected: 'hurryup', tick: t },
		]);
		expect(lifecycleOf(result, 'hurryup')).toEqual(startTriple('hurryup', t));
		expect(played(result, t - 1)).toEqual([]);
		expect(lit(result, t - 1)).toEqual(['hurryup']);
		expect(played(result, t), 'AC 5: the start appends the Mode to modesPlayed').toEqual(['hurryup']);
		expect(lit(result, t), 'AC 5: and removes it from modesLit').toEqual([]);
		expect(result.statesByTick.get(t)!.modes.map((entry) => entry.mode), 'Hurry-up is active').toEqual(['base', 'hurryup']);
		expect(result.statesByTick.get(t)!.players[0]!.lockCredits).toBe(1);
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'the lock serves on the capture tick').toEqual([t]);
		expect(showsAt(result, t)).toEqual([MODE_START_SHOW]);
		expect(pulseTicks(result, MOUTH_COIL), 'a locked ball opens no Mouth').toEqual([]);
	});

	it('control: the same capture with nothing lit is 3.2\'s lock alone -- no mode_start, no show, no start', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_1', t), { durationTicks: t + 10, initialState: gameState() });
		expect(arbiterEvents(result)).toEqual([{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t }]);
		expect(result.commands).toEqual([]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([t]);
		expect(result.finalState.modes.map((entry) => entry.mode)).toEqual(['base']);
	});

	it('Matrix "One lit, two credits": mode_start{[joust]} is the only outcome (no spit), [show_mode_start, mouth open] at t, c_mouth at t+L, credits stay 2', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), { durationTicks: t + L + 10, initialState: gameState({ player: { modesLit: ['joust'], lockCredits: 2 }, held: 2 }) });
		expect(arbiterEvents(result)).toEqual([{ type: 'lock_lane_mode_start', player: 0, candidates: ['joust'], selected: 'joust', tick: t }]);
		expect(lifecycleOf(result, 'joust')).toEqual(startTriple('joust', t));
		expect(showsAt(result, t), 'the Mode start\'s show precedes the Mouth open').toEqual([MODE_START_SHOW, MOUTH_OPEN_SHOW]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + L]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'an unlocked capture serves nothing').toEqual([]);
		expect(result.finalState.players[0]!.lockCredits).toBe(2);
		expect(result.finalState.players[0]!.modesPlayed).toEqual(['joust']);
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
	});

	it('Matrix "None lit, two credits": the uncredited spit, exactly as in 3.2', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), { durationTicks: t + L + 10, initialState: gameState({ player: { lockCredits: 2 }, held: 2 }) });
		expect(arbiterEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 2, credited: false, tick: t }]);
		expect(showsAt(result, t)).toEqual([MOUTH_OPEN_SHOW]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + L]);
	});

	for (const [label, overrides] of [
		['a multiball running', { multiball: 'quickmb' }],
		['tilted', { tilt: { tilted: true, slamTilted: false } }],
	] as const) {
		it(`Matrix "Multiball / Tilt" (${label}): lit [hurryup] and a capture give the uncredited spit, no mode_start, and the lit Mode stays lit`, () => {
			const t = 300;
			const result = runRulesScript(capture('s_lock_1', t), {
				durationTicks: t + L + 10,
				initialState: gameState({ player: { modesLit: ['hurryup'] }, machine: overrides as Partial<MachineState> }),
			});
			expect(arbiterEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 0, credited: false, tick: t }]);
			expect(showTicks(result, MODE_START_SHOW)).toEqual([]);
			expect(lifecycleOf(result, 'hurryup')).toEqual([]);
			expect(result.finalState.players[0]!.modesLit).toEqual(['hurryup']);
			expect(pulseTicks(result, MOUTH_COIL), 'the spit still ejects').toEqual([t + L]);
		});
	}

	it('Matrix "Active excluded": lit [hurryup, quickmb] with Hurry-up already active -- the one candidate is quickmb, and it starts at once', () => {
		const t = 300;
		const hurryup = { mode: 'hurryup', priority: MODE_PRIORITIES.hurryup, player: 0 };
		const result = runRulesScript(capture('s_lock_1', t), {
			durationTicks: t + 10,
			initialState: gameState({ player: { modesLit: ['hurryup', 'quickmb'] }, modes: [BASE_ENTRY, hurryup] }),
		});
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['quickmb'], selected: 'quickmb', tick: t },
		]);
		expect(lifecycleOf(result, 'quickmb')).toEqual(startTriple('quickmb', t));
		expect(lifecycleOf(result, 'hurryup'), 'the active Hurry-up is neither restarted nor stopped').toEqual([]);
		expect(lit(result, t), 'the active Mode stays lit').toEqual(['hurryup']);
		expect(played(result, t)).toEqual(['quickmb']);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([t]);
	});

	it('entry row "the capture fills the Lock": lit [hurryup], credits 0, two other balls held -- [spit{credited: true}, mode_start], one show_mode_start, exactly one Mouth sequence, Hurry-up started', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), { durationTicks: t + L + 10, initialState: gameState({ player: { modesLit: ['hurryup'] }, held: 2 }) });
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_spit', player: 0, credits: 1, credited: true, tick: t },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup'], selected: 'hurryup', tick: t },
		]);
		expect(showTicks(result, MODE_START_SHOW)).toEqual([t]);
		expect(showsAt(result, t)).toEqual([MODE_START_SHOW, MOUTH_OPEN_SHOW]);
		expect(showTicks(result, MOUTH_OPEN_SHOW), 'one Mouth sequence').toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + L]);
		expect(lifecycleOf(result, 'hurryup')).toEqual(startTriple('hurryup', t));
		expect(result.finalState.players[0]!.lockCredits).toBe(1);
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
	});

	it('entry row "full-device": the same lit and credits with three balls held (the ball is never captured) -- lock_lane_spit alone, no start, modesLit unchanged, no Mouth request', () => {
		// Three balls parked in Attract, then Start and a Ramp to light Hurry-up,
		// then the lane closure while the Lock is full.
		const start = 100;
		const rampAt = 400;
		const lane = 700;
		const script = [
			...close('s_lock_1').at(10).build(),
			...close('s_lock_2').at(20).build(),
			...close('s_lock_3').at(30).build(),
			...close('s_start').at(start).open().at(start + 5).build(),
			...ramp(rampAt),
			...close('s_lock_lane').at(lane).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: lane + L + 10,
			initialState: {
				...gameState({ phase: 'attract', machine: { ballsInPlay: 0, hardwareEnabled: false, deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] } } }),
				players: [],
				modes: [],
			},
		});
		expect(lit(result, lane - 1), 'the premise: Hurry-up is lit before the entry').toEqual(['hurryup']);
		expect(arbiterEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 1, credited: true, tick: lane }]);
		expect(showTicks(result, MODE_START_SHOW)).toEqual([]);
		expect(lifecycleOf(result, 'hurryup')).toEqual([]);
		expect(result.finalState.players[0]!.modesLit).toEqual(['hurryup']);
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC 4 (Matrix rows 9-14): two or more candidates open the window.
// ---------------------------------------------------------------------------

/** Two lit Modes, two credits, two balls held: the capture into s_lock_3 opens a window whose release is the Mouth. */
const WINDOW_MOUTH = (): GameState => gameState({ player: { modesLit: ['hurryup', 'quickmb'], lockCredits: 2 }, held: 2 });

describe('Story 3.4 -- AC 4: two or more candidates hold the ball in bd_lock for the mode-select window', () => {
	it('Matrix "Window, Start": mode_start{[hurryup, quickmb], hurryup} at t; the right flipper moves to quickmb at t+10; Start confirms at t+20, quickmb starts and the Mouth opens then; Start adds no player', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_flipper_r', t + 10, t + 12), ...press('s_start', t + 20, t + 21)];
		const result = runRulesScript(script, { durationTicks: t + 20 + L + 10, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
			{ type: 'mode_select_moved', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'quickmb', tick: t + 10 },
			{ type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'start', tick: t + 20 },
		]);
		expect(lifecycleOf(result, 'quickmb')).toEqual(startTriple('quickmb', t + 20));
		expect(lifecycleOf(result, 'hurryup')).toEqual([]);
		expect(showsAt(result, t), 'nothing is shown or started while the window is open').toEqual([]);
		expect(showsAt(result, t + 20)).toEqual([MODE_START_SHOW, MOUTH_OPEN_SHOW]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + 20 + L]);
		expect(lit(result, t + 19)).toEqual(['hurryup', 'quickmb']);
		expect(lit(result, t + 20)).toEqual(['hurryup']);
		expect(played(result, t + 20)).toEqual(['quickmb']);
		expect(result.finalState.players, 'the window\'s Start never reaches S6: no Hot-seat player').toHaveLength(1);
	});

	it('control: the same Start press with no window open (nothing lit) adds a Hot-seat player -- the Start filter is what keeps players.length at 1', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_start', t + 20, t + 21)];
		const result = runRulesScript(script, { durationTicks: t + 30, initialState: gameState({ player: { lockCredits: 2 }, held: 2 }) });
		expect(result.finalState.players).toHaveLength(2);
	});

	it('Matrix "Window, expiry": with no input the window confirms the selection at exactly t+W -- not a tick earlier', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), { durationTicks: t + W + L + 10, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result).filter((event) => event.type === 'mode_select_ended')).toEqual([
			{ type: 'mode_select_ended', player: 0, mode: 'hurryup', reason: 'expired', tick: t + W },
		]);
		expect(lifecycleOf(result, 'hurryup')).toEqual(startTriple('hurryup', t + W));
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([t + W]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + W + L]);
		expect(result.statesByTick.get(t + W - 1)!.machine.deviceSlots.bd_lock, 'the ball stays parked in bd_lock meanwhile').toEqual([true, true, true]);
	});

	it('Matrix "Window, hold": the left flipper pressed at t+10 and held moves (wrapping) to quickmb, and confirms at exactly t+10+Hd', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_flipper_l', t + 10, t + 10 + HD + 50)];
		const result = runRulesScript(script, { durationTicks: t + 10 + HD + L + 60, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
			{ type: 'mode_select_moved', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'quickmb', tick: t + 10 },
			{ type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'flipper_held', tick: t + 10 + HD },
		]);
		expect(lifecycleOf(result, 'quickmb')).toEqual(startTriple('quickmb', t + 10 + HD));
	});

	it('a released press then a second press: the hold counts from the SECOND press edge, so it confirms at its press + Hd', () => {
		const t = 300;
		const second = t + 10 + HD;
		const script = [...capture('s_lock_3', t), ...press('s_flipper_l', t + 10, t + 10 + HD - 1), ...press('s_flipper_l', second, second + HD + 5)];
		const result = runRulesScript(script, { durationTicks: second + HD + 10, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result).map((event) => [event.type, event.tick])).toEqual([
			['lock_lane_mode_start', t],
			['mode_select_moved', t + 10],
			['mode_select_moved', second],
			['mode_select_ended', second + HD],
		]);
	});

	it('control: the same press released one tick before Hd never confirms -- the window runs on to its expiry', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_flipper_l', t + 10, t + 10 + HD - 1)];
		const result = runRulesScript(script, { durationTicks: t + W + 10, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result).filter((event) => event.type === 'mode_select_ended')).toEqual([
			{ type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'expired', tick: t + W },
		]);
	});

	it('a flipper press made BEFORE the window opened, held across it, never confirms (and never moves)', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_flipper_r', t - 5, t + HD + 50)];
		const result = runRulesScript(script, { durationTicks: t + W + 10, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result).filter((event) => event.type === 'mode_select_moved')).toEqual([]);
		expect(arbiterEvents(result).filter((event) => event.type === 'mode_select_ended').map((event) => event.tick)).toEqual([t + W]);
	});

	it('Matrix "Window with lock": lit two, credits 0 -- [locked, mode_start] at t, no trough serve before the confirm, the serve at the confirm, credits 1', () => {
		const t = 300;
		const script = [...capture('s_lock_1', t), ...press('s_start', t + 20, t + 21)];
		const result = runRulesScript(script, { durationTicks: t + 30, initialState: gameState({ player: { modesLit: ['hurryup', 'quickmb'] } }) });
		expect(arbiterEvents(result, t)).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
		]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'the serve waits for the confirm').toEqual([t + 20]);
		expect(lifecycleOf(result, 'hurryup')).toEqual(startTriple('hurryup', t + 20));
		expect(result.statesByTick.get(t)!.players[0]!.lockCredits).toBe(1);
		expect(pulseTicks(result, MOUTH_COIL), 'a locked ball stays locked').toEqual([]);
	});

	it('Matrix "Tilt in window": a Tilt at t+5 ends the window with mode null -- no start, the lit Modes stay lit, and the release (the Mouth) still runs', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...close('s_tilt_bob').at(t + 5).open().at(t + 6).build()];
		const initialState = gameState({ player: { modesLit: ['hurryup', 'quickmb'], lockCredits: 2, tiltWarnings: DEFAULT_ADJUSTMENTS.tiltWarnings }, held: 2 });
		const result = runRulesScript(script, { durationTicks: t + 5 + L + 10, initialState });
		expect(result.events.filter((event) => event.type === 'tilt').map((event) => event.tick), 'the premise: the bob tilts at t+5').toEqual([t + 5]);
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
			{ type: 'mode_select_ended', player: 0, mode: null, reason: 'tilt', tick: t + 5 },
		]);
		expect(lifecycleOf(result, 'hurryup')).toEqual([]);
		expect(lifecycleOf(result, 'quickmb')).toEqual([]);
		expect(showTicks(result, MODE_START_SHOW)).toEqual([]);
		expect(result.finalState.players[0]!.modesLit).toEqual(['hurryup', 'quickmb']);
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([t + 5]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + 5 + L]);
	});

	it('a Tilt in a windowed LOCK still runs its release: the serve at the Tilt tick', () => {
		const t = 300;
		const script = [...capture('s_lock_1', t), ...close('s_tilt_bob').at(t + 5).open().at(t + 6).build()];
		const initialState = gameState({ player: { modesLit: ['hurryup', 'quickmb'], tiltWarnings: DEFAULT_ADJUSTMENTS.tiltWarnings } });
		const result = runRulesScript(script, { durationTicks: t + 20, initialState });
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
			{ type: 'mode_select_ended', player: 0, mode: null, reason: 'tilt', tick: t + 5 },
		]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([t + 5]);
	});

	it('a Slam in an unlocked capture\'s window discards it with no event and no start, but the ball\'s owed Mouth eject still runs (a Mouth sequence runs in any phase)', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...close('s_slam_tilt').at(t + 5).open().at(t + 6).build()];
		const result = runRulesScript(script, { durationTicks: t + W + L + 10, initialState: WINDOW_MOUTH() });
		expect(result.statesByTick.get(t + 5)!.phase, 'the premise: the Slam voids the game').toBe('attract');
		expect(arbiterEvents(result)).toEqual([{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t }]);
		expect(showTicks(result, MODE_START_SHOW)).toEqual([]);
		expect(lifecycleOf(result, 'hurryup')).toEqual([]);
		expect(lifecycleOf(result, 'quickmb')).toEqual([]);
		expect(showTicks(result, MOUTH_OPEN_SHOW), 'the staging ball is spat, not stranded in bd_lock').toEqual([t + 5]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + 5 + L]);
	});

	it('control: a Slam in a LOCKED capture\'s window requests nothing -- the locked ball stays locked and a voided game serves nothing', () => {
		const t = 300;
		const script = [...capture('s_lock_1', t), ...close('s_slam_tilt').at(t + 5).open().at(t + 6).build()];
		const result = runRulesScript(script, { durationTicks: t + W + L + 10, initialState: gameState({ player: { modesLit: ['hurryup', 'quickmb'] } }) });
		expect(result.statesByTick.get(t + 5)!.phase, 'the premise: the Slam voids the game').toBe('attract');
		expect(arbiterEvents(result).map((event) => event.type)).toEqual(['lock_lane_locked', 'lock_lane_mode_start']);
		expect(showTicks(result, MOUTH_OPEN_SHOW)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([]);
	});

	it('Matrix "Lane change in window": a flipper press inside the window leaves lanes.lit unchanged -- on the opening tick and mid-window', () => {
		const t = 300;
		const lanes = { lit: { top_1: true }, completedSets: [] };
		const script = [...capture('s_lock_3', t), ...press('s_flipper_r', t, t + 3), ...press('s_flipper_r', t + 10, t + 12), ...press('s_flipper_l', t + 20, t + 20 + HD + 5)];
		const initialState = gameState({ player: { modesLit: ['hurryup', 'quickmb'], lockCredits: 2, lanes }, held: 2 });
		const result = runRulesScript(script, { durationTicks: t + 20 + HD + 10, initialState });
		expect(arbiterEvents(result).map((event) => [event.type, event.tick]), 'the premise: the opening-tick press moves nothing; the others move; the hold confirms').toEqual([
			['lock_lane_mode_start', t],
			['mode_select_moved', t + 10],
			['mode_select_moved', t + 20],
			['mode_select_ended', t + 20 + HD],
		]);
		expect(result.finalState.players[0]!.lanes.lit).toEqual({ top_1: true });
	});

	it('a flipper press on the window\'s CONFIRM tick (open at the start of the tick, closed by its end) moves the selection and still never rotates the lanes', () => {
		const t = 300;
		const lanes = { lit: { top_1: true }, completedSets: [] };
		const script = [...capture('s_lock_3', t), ...press('s_flipper_r', t + W, t + W + 3)];
		const initialState = gameState({ player: { modesLit: ['hurryup', 'quickmb'], lockCredits: 2, lanes }, held: 2 });
		const result = runRulesScript(script, { durationTicks: t + W + 10, initialState });
		expect(arbiterEvents(result), 'the premise: the press moves, then the expiry confirms, on one tick').toEqual([
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
			{ type: 'mode_select_moved', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'quickmb', tick: t + W },
			{ type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'expired', tick: t + W },
		]);
		expect(result.finalState.players[0]!.lanes.lit).toEqual({ top_1: true });
	});

	it('control: the same flipper press outside any window rotates the lit lane', () => {
		const t = 300;
		const lanes = { lit: { top_1: true }, completedSets: [] };
		const result = runRulesScript(press('s_flipper_r', t + 10, t + 12), { durationTicks: t + 20, initialState: gameState({ player: { lanes } }) });
		expect(result.finalState.players[0]!.lanes.lit).not.toEqual({ top_1: true });
		expect(result.finalState.players[0]!.lanes.lit.top_2).toBe(true);
	});

	it('mode-select 0 ms (the dev panel can hot-apply it): the window is floored at 1 tick and expires on t+1', () => {
		const tuned = resolveTuning({ ...RAW_TUNING, modeSelectMs: { ...RAW_TUNING.modeSelectMs, value: 0 } });
		expect(shotWindowTicks('modeSelectMs', tuned), 'the premise: a 0-tick window resolves').toBe(0);
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), { durationTicks: t + 10, tuning: tuned, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result).filter((event) => event.type === 'mode_select_ended').map((event) => event.tick)).toEqual([t + 1]);
	});

	it('mode-select hold 0 ms: the hold is floored at 1 tick -- a press moves the selection on its own tick and confirms one tick later', () => {
		const tuned = resolveTuning({ ...RAW_TUNING, modeSelectHoldMs: { ...RAW_TUNING.modeSelectHoldMs, value: 0 } });
		expect(shotWindowTicks('modeSelectHoldMs', tuned), 'the premise: a 0-tick hold resolves').toBe(0);
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_flipper_r', t + 10, t + 50)];
		const result = runRulesScript(script, { durationTicks: t + 60, tuning: tuned, initialState: WINDOW_MOUTH() });
		expect(arbiterEvents(result)).toEqual([
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
			{ type: 'mode_select_moved', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'quickmb', tick: t + 10 },
			{ type: 'mode_select_ended', player: 0, mode: 'quickmb', reason: 'flipper_held', tick: t + 11 },
		]);
	});

	it('three candidates: the right flipper steps forward, the left steps back, and both wrap -- and the confirmed Mode is the one selected', () => {
		const t = 300;
		const all: readonly CampaignModeName[] = ['hurryup', 'quickmb', 'joust'];
		const script = [
			...capture('s_lock_3', t),
			...press('s_flipper_l', t + 10, t + 12),
			...press('s_flipper_r', t + 20, t + 22),
			...press('s_flipper_r', t + 30, t + 32),
			...press('s_flipper_r', t + 40, t + 42),
			...press('s_flipper_l', t + 50, t + 52),
			...press('s_start', t + 60, t + 61),
		];
		const initialState = gameState({ player: { modesLit: [...all], lockCredits: 2 }, held: 2 });
		const result = runRulesScript(script, { durationTicks: t + 70, initialState });
		const trace = arbiterEvents(result).map((event) => {
			if (event.type === 'mode_select_ended') {
				return [event.type, event.mode, event.tick];
			}
			return [event.type, 'selected' in event ? event.selected : null, event.tick];
		});
		expect(trace).toEqual([
			['lock_lane_mode_start', 'hurryup', t],
			['mode_select_moved', 'joust', t + 10],
			['mode_select_moved', 'hurryup', t + 20],
			['mode_select_moved', 'quickmb', t + 30],
			['mode_select_moved', 'joust', t + 40],
			['mode_select_moved', 'quickmb', t + 50],
			['mode_select_ended', 'quickmb', t + 60],
		]);
		expect(lifecycleOf(result, 'quickmb')).toEqual(startTriple('quickmb', t + 60));
		expect(result.finalState.players[0]!.modesLit).toEqual(['hurryup', 'joust']);
	});

	it('a capture that fills the Lock with two candidates: [spit{credited: true}, mode_start] at t, the Mouth waits for the confirm, then [show_mode_start, mouth open] at it', () => {
		const t = 300;
		const script = [...capture('s_lock_3', t), ...press('s_start', t + 20, t + 21)];
		const result = runRulesScript(script, { durationTicks: t + 20 + L + 10, initialState: gameState({ player: { modesLit: ['hurryup', 'quickmb'] }, held: 2 }) });
		expect(arbiterEvents(result, t)).toEqual([
			{ type: 'lock_lane_spit', player: 0, credits: 1, credited: true, tick: t },
			{ type: 'lock_lane_mode_start', player: 0, candidates: ['hurryup', 'quickmb'], selected: 'hurryup', tick: t },
		]);
		expect(showsAt(result, t), 'nothing shown or ejected while the window is open').toEqual([]);
		expect(showsAt(result, t + 20)).toEqual([MODE_START_SHOW, MOUTH_OPEN_SHOW]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + 20 + L]);
		expect(result.finalState.players[0]!.lockCredits).toBe(1);
	});
});

describe('Story 3.4 -- the mode-select window is discarded, with no event, when tick runs backwards', () => {
	function runTimeline(restartAt: number | null): SemanticEvent[] {
		const rules = createRules(TUNING);
		const t = 300;
		const script = capture('s_lock_3', t);
		const ended: SemanticEvent[] = [];
		let state = WINDOW_MOUTH();
		const step = (tick: number, events: readonly SwitchEvent[]): void => {
			const result = rules.step(state, events, tick);
			state = result.state;
			ended.push(...result.events.filter((event) => event.type === 'mode_select_ended'));
		};
		for (let tick = 1; tick <= t; tick++) {
			step(tick, script.filter((event) => event.tick === tick));
		}
		expect(ended, 'the premise: the window is open, not yet confirmed').toEqual([]);
		for (let tick = restartAt ?? t + 1; tick <= t + W + 5; tick++) {
			step(tick, []);
		}
		return ended;
	}

	it('control: an uninterrupted timeline expires at t+W; a timeline restarted at tick 1 (tick < openTick) never confirms', () => {
		expect(runTimeline(null).map((event) => event.tick), 'positive: the window expires W later').toEqual([300 + W]);
		expect(runTimeline(1), 'the restarted timeline discarded the stale window').toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC 5 (Matrix row 15, DW-293): the ball end credits nothing.
// ---------------------------------------------------------------------------

describe('Story 3.4 -- AC 5 (DW-293): modesPlayed is the log of campaign starts; the ball end credits nothing', () => {
	it('Matrix "Ball end": Hurry-up active, the ball drains -- its stop triple comes first, ball_ended fires, and modesPlayed gains nothing (not base, not skill_shot, not hurryup)', () => {
		const drain = 300;
		const hurryup = { mode: 'hurryup', priority: MODE_PRIORITIES.hurryup, player: 0 };
		const skillShot = { mode: 'skill_shot', priority: MODE_PRIORITIES.skill_shot, player: 0, launched: true };
		const result = runRulesScript(close('s_trough_4').at(drain).build(), {
			durationTicks: drain + 1,
			initialState: gameState({ player: { modesPlayed: ['hurryup'] }, modes: [BASE_ENTRY, skillShot, hurryup] }),
		});
		expect(result.events.filter((event) => event.type === 'ball_ended').map((event) => event.tick)).toEqual([drain]);
		expect(result.modeEvents.slice(0, 3).map((event) => event.type), 'Hurry-up (the highest active) stops first').toEqual([
			'mode_hurryup_will_stop',
			'mode_hurryup_stopping',
			'mode_hurryup_stopped',
		]);
		expect(result.finalState.players[0]!.modesPlayed, 'the ball end appends nothing').toEqual(['hurryup']);
	});
});

// ---------------------------------------------------------------------------
// AC 7 (Integration, Rules 1/2): three balls, three Modes, in campaign order.
// ---------------------------------------------------------------------------

/** No ball save, so every scripted drain ends the ball rather than re-serving. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});
const L_NBS = shotWindowTicks('mouthOpenLeadMs', NO_BALL_SAVE_TUNING);

/** A served ball's arrival (its trough slot opening with the shooter lane closing, DW-187) at `arrive`, then its launch at `launch`. */
function serve(troughSlot: SwitchName, arrive: number, launch: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').at(arrive).open(troughSlot).at(arrive).open('s_shooter_lane').at(launch).build();
}

/**
 * One player, three balls. Each ball is served and plunged, strikes a DRAGON
 * target (ball 1 only), makes the Ramp (unless `withRamps` is false) and
 * enters the Lock lane: balls 1 and 2 lock (a serve follows each), ball 3
 * arrives with two credits and is spat by the Mouth. Each ball then drains.
 */
function campaignScript(withRamps: boolean): { readonly script: readonly SwitchEvent[]; readonly captures: readonly number[]; readonly duration: number } {
	const start = 10;
	const script: SwitchEvent[] = [...press('s_start', start, start + 5), ...serve('s_trough_4', start + 5, start + 50), ...close('s_dragon_d').at(start + 100).build()];
	// Ball 1: lock into s_lock_1; the serve takes trough slot 3; the drain refills slot 3.
	const c1 = start + 400;
	const d1 = c1 + 500;
	// Ball 2: served from slot 3; lock into s_lock_2; the serve takes slot 2; the drain refills slot 2.
	const c2 = d1 + 400;
	const d2 = c2 + 500;
	// Ball 3: served from slot 2; the capture into s_lock_3 is spat (two credits).
	const c3 = d2 + 400;
	const d3 = c3 + L_NBS + 500;
	script.push(
		...capture('s_lock_1', c1),
		...serve('s_trough_3', c1 + 10, c1 + 30),
		...close('s_trough_3').at(d1).build(),
		...serve('s_trough_3', d1 + 10, d1 + 50),
		...capture('s_lock_2', c2),
		...serve('s_trough_2', c2 + 10, c2 + 30),
		...close('s_trough_2').at(d2).build(),
		...serve('s_trough_2', d2 + 10, d2 + 50),
		...capture('s_lock_3', c3),
		...close('s_lock_3').open().at(c3 + L_NBS + 1).build(),
		...close('s_trough_2').at(d3).build(),
	);
	if (withRamps) {
		script.push(...ramp(c1 - 200), ...ramp(c2 - 200), ...ramp(c3 - 200));
	}
	return { script: [...script].sort((a, b) => a.tick - b.tick), captures: [c1, c2, c3], duration: d3 + 10 };
}

describe('Story 3.4 -- AC 7 (Integration): a real createRules(), one player, three balls -- Hurry-up, Quick multiball and Joust start on balls 1, 2 and 3', () => {
	const campaign = campaignScript(true);
	const control = campaignScript(false);
	const run = (script: readonly SwitchEvent[], duration: number): RunRulesScriptResult =>
		runRulesScript(script, { durationTicks: duration, tuning: NO_BALL_SAVE_TUNING, adjustments: { ...DEFAULT_ADJUSTMENTS, ballsPerGame: 3 } });
	const result = run(campaign.script, campaign.duration);
	const controlResult = run(control.script, control.duration);

	it('each ball\'s Lock capture starts the Mode its Ramp lit, in campaign order, on balls 1, 2 and 3', () => {
		const starts = result.modeEvents.filter((event) => event.type.endsWith('_started') && 'mode' in event && ['hurryup', 'quickmb', 'joust'].includes(event.mode));
		expect(starts.map((event) => [event.type, event.tick])).toEqual([
			['mode_hurryup_started', campaign.captures[0]],
			['mode_quickmb_started', campaign.captures[1]],
			['mode_joust_started', campaign.captures[2]],
		]);
		expect(campaign.captures.map((tick) => result.statesByTick.get(tick)!.players[0]!.ballNumber), 'on balls 1, 2 and 3').toEqual([1, 2, 3]);
		expect(result.events.filter((event) => event.type === 'lock_lane_mode_start').map((event) => event.tick)).toEqual([...campaign.captures]);
		expect(result.finalState.players[0]!.modesPlayed).toEqual(['hurryup', 'quickmb', 'joust']);
		expect(result.finalState.players[0]!.modesLit).toEqual([]);
		expect(result.finalState.phase, 'the game ran to its end').toBe('game_over');
	});

	it('the premise of the control: without the Ramps nothing is lit and nothing starts, while the locks and the spit happen exactly as with them', () => {
		expect(controlResult.modeEvents.filter((event) => 'mode' in event && ['hurryup', 'quickmb', 'joust'].includes(event.mode))).toEqual([]);
		expect(controlResult.events.filter((event) => event.type === 'lock_lane_locked' || event.type === 'lock_lane_spit').map((event) => [event.type, event.tick])).toEqual([
			['lock_lane_locked', control.captures[0]],
			['lock_lane_locked', control.captures[1]],
			['lock_lane_spit', control.captures[2]],
		]);
		expect(controlResult.finalState.phase).toBe('game_over');
		expect(controlResult.finalState.players[0]!.letters, 'the letter premise: a DRAGON letter is in both runs').toBe('D');
	});

	it('at every tick, lockCredits and letters equal the control run\'s -- lighting and starting Modes touches neither', () => {
		expect(campaign.duration).toBe(control.duration);
		const mismatches: number[] = [];
		for (let tick = 1; tick <= campaign.duration; tick++) {
			const a = result.statesByTick.get(tick)!.players.map((p) => [p.lockCredits, p.letters]);
			const b = controlResult.statesByTick.get(tick)!.players.map((p) => [p.lockCredits, p.letters]);
			if (JSON.stringify(a) !== JSON.stringify(b)) {
				mismatches.push(tick);
			}
		}
		expect(mismatches).toEqual([]);
		expect(result.finalState.players[0]!.lockCredits, 'the positive: the credits genuinely moved').toBe(2);
	});
});
