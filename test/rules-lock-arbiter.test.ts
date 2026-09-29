// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2 (AD-18, AD-6, AD-7): the headless coverage of the Lock arbiter
// (`src/sim/rules/ball-controller/lock-arbiter.ts`) -- every row of the
// spec's I/O & Edge-Case Matrix, driven through `runRulesScript()`
// (`test/util/switch-script.ts`) with switch edges scripted by hand. No
// physics, no rendering, no `sim/loop` (gated by
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES). The real-physics
// half (AC 12) is `test/lock-arbiter-physics.test.ts`; the only-consumer
// half of AC 1 is `test/ad18-lock-lane-consumer.test.ts`.
//
// Every tick below is derived from `resolveTuning()` (the spec's
// Boundaries: "Tests derive every tick from resolveTuning(), never a
// literal"): LEAD is `mouthOpenLeadTicks`, INTERVAL `mouthEjectIntervalTicks`.
//
// The devices layer's own occupancy boots with the Lock empty, so a "Lock
// holds N" precondition is carried by `initialState.machine.deviceSlots`
// (what the arbiter reads) unless a row needs the devices layer itself to
// see a full Lock, in which case the slot closes are scripted in Attract,
// where the arbiter does nothing.

import { describe, expect, it } from 'vitest';
import { createRules } from '../src/sim/rules';
import { lampsOf } from '../src/sim/rules/lamps';
import { BALL_SAVE_SOURCE } from '../src/sim/rules/ball-controller';
import { resolveTuning, shotWindowTicks } from '../src/sim/table/tuning';
import { close, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineReport, MachineState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const INTERVAL = shotWindowTicks('mouthEjectIntervalMs', TUNING);
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);

/** The lane closure lands this many ticks before its slot's close -- inside the capture window, so the devices layer resolves a captured entry. */
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const MOUTH_COIL = 'c_mouth';
const TROUGH_EJECT_COIL = 'c_trough_eject';
const AUTOLAUNCH_COIL = 'c_autolaunch';
const MOUTH_SHOW = 'show_dragon_mouth_open';

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

/** A mid-game state: one ball in play for `currentPlayer`, the Lock holding `held` balls. */
function gameState(options: {
	readonly phase?: GameState['phase'];
	readonly players?: readonly PlayerState[];
	readonly currentPlayer?: number;
	readonly held?: number;
	readonly machine?: Partial<MachineState>;
	readonly modes?: GameState['modes'];
} = {}): GameState {
	const base = machine(options.machine ?? {});
	return {
		tick: 0,
		phase: options.phase ?? 'game',
		machine: { ...base, deviceSlots: { ...base.deviceSlots, bd_lock: lockSlots(options.held ?? 0) } },
		players: options.players ?? [player()],
		currentPlayer: options.currentPlayer ?? 0,
		modes: options.modes ?? [],
		rng: 0,
	};
}

/** A captured Lock entry: the lane closes `LANE_LEAD` ticks before `slot` closes at `t` (inside the capture window). */
function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

/** A served ball's arrival in the shooter lane (the trough slot opening and the lane closing in one batch, DW-187) at `arrive`, then its launch (the lane opening) at `launch`. */
function serveArrivesAndLaunches(troughSlot: SwitchName, arrive: number, launch: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').at(arrive).open(troughSlot).at(arrive).open('s_shooter_lane').at(launch).build();
}

function lockEvents(result: RunRulesScriptResult): SemanticEvent[] {
	return result.events.filter((event) => event.type === 'lock_lane_locked' || event.type === 'lock_lane_spit');
}

function pulseTicks(result: RunRulesScriptResult, coil: string): number[] {
	return result.coilCommands.filter((command) => command.coil === coil && command.action === 'pulse').map((command) => command.tick);
}

function showTicks(result: RunRulesScriptResult): number[] {
	return result.commands.filter((command) => command.show === MOUTH_SHOW).map((command) => command.tick);
}

function eventsOfType(result: RunRulesScriptResult, type: SemanticEvent['type']): SemanticEvent[] {
	return result.events.filter((event) => event.type === type);
}

// ---------------------------------------------------------------------------
// AC 2 (DW-221): a lock is not a drain; the ball controller serves.
// ---------------------------------------------------------------------------

describe('Story 3.2 -- AC 2 (DW-221): Lock and serve', () => {
	it('a captured entry with credits 0 locks: lock_lane_locked { 0, 1 } and c_trough_eject at t, ballsInPlay 0, no ball_ended and no ball_saved inside a live save; the arrival autolaunches and its ball_launched restores ballsInPlay without re-arming the save', () => {
		const plunge = 10;
		const t = 500;
		const arrive = t + 7;
		const launch = t + 20;
		const script = [
			...close('s_shooter_lane').open().at(plunge).build(),
			...capture('s_lock_1', t),
			...serveArrivesAndLaunches('s_trough_3', arrive, launch),
		];
		const result = runRulesScript(script, {
			durationTicks: launch + 50,
			initialState: gameState({ machine: { ballsInPlay: 0, ballSave: { untilTick: null, sources: [BALL_SAVE_SOURCE] }, deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] } } }),
		});

		// The premise, and the ball-save positive: the player's own plunge arms
		// the save, so it is live at the capture.
		expect(eventsOfType(result, 'ball_save_timer_started').map((e) => e.tick), 'the player plunge arms the save exactly once (the positive of the no-re-arm check below)').toEqual([plunge]);
		const saveUntil = result.statesByTick.get(t - 1)!.machine.ballSave.untilTick!;
		expect(saveUntil, 'the save is live at the capture').toBeGreaterThan(t);

		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t }]);
		expect(result.statesByTick.get(t)!.players[0]!.lockCredits).toBe(1);
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'the controller serves exactly once, on the capture tick').toEqual([t]);
		expect(result.statesByTick.get(t - 1)!.machine.ballsInPlay).toBe(1);
		expect(result.statesByTick.get(t)!.machine.ballsInPlay, 'the capture takes the ball out of play (AD-6)').toBe(0);
		expect(eventsOfType(result, 'ball_ended'), 'a Lock capture is not a drain').toEqual([]);
		expect(eventsOfType(result, 'ball_saved'), 'nor a saved drain').toEqual([]);

		expect(pulseTicks(result, AUTOLAUNCH_COIL), 'the served ball autolaunches on arrival').toEqual([arrive]);
		expect(result.statesByTick.get(launch - 1)!.machine.ballsInPlay).toBe(0);
		expect(result.statesByTick.get(launch)!.machine.ballsInPlay, 'the new ball\'s ball_launched restores ballsInPlay').toBe(1);
		expect(eventsOfType(result, 'ball_launched').map((e) => e.tick)).toEqual([plunge, launch]);
		expect(result.statesByTick.get(launch)!.machine.ballSave.untilTick, 'the relaunch never re-arms the save').toBe(saveUntil);
		expect(showTicks(result), 'a lock opens no Mouth').toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
	});

	it('control: the SAME live save and state with a trough drain at t instead of the capture gives ball_saved -- the harness sees a saved drain when one happens', () => {
		const plunge = 10;
		const t = 500;
		const script = [...close('s_shooter_lane').open().at(plunge).build(), ...close('s_trough_4').at(t).build()];
		const result = runRulesScript(script, {
			durationTicks: t + 10,
			initialState: gameState({ machine: { ballsInPlay: 0, ballSave: { untilTick: null, sources: [BALL_SAVE_SOURCE] }, deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] } } }),
		});
		expect(eventsOfType(result, 'ball_saved')).toEqual([{ type: 'ball_saved', player: 0, tick: t }]);
		expect(lockEvents(result)).toEqual([]);
	});

	it('Second lock: credits 1 with the Lock holding 1 locks again (credits 2) and serves; l_lock goes dragon/1 -> off/0', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_2', t), {
			durationTicks: t + 10,
			initialState: gameState({ players: [player({ lockCredits: 1 })], held: 1, modes: [{ mode: 'base', priority: 100, player: 0 }] }),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_locked', player: 0, credits: 2, tick: t }]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([t]);
		expect(lampsOf(result.statesByTick.get(t - 1)!).l_lock).toEqual({ role: 'dragon', step: 1 });
		expect(lampsOf(result.statesByTick.get(t)!).l_lock).toEqual({ role: 'off', step: 0 });
	});

	it('the serve reuses a ball already resting in bd_shooter: c_autolaunch at t, no c_trough_eject, and the launch does not arm the save', () => {
		const t = 300;
		const result = runRulesScript([...capture('s_lock_1', t), ...close('s_shooter_lane').open().at(t + 10).build()], {
			durationTicks: t + 20,
			initialState: gameState({ machine: { ballSave: { untilTick: null, sources: [BALL_SAVE_SOURCE] }, deviceSlots: { bd_trough: [true, true, false, false], bd_shooter: [true], bd_lock: [false, false, false] } } }),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t }]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL)).toEqual([t]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([]);
		expect(result.statesByTick.get(t + 10)!.machine.ballsInPlay).toBe(1);
		expect(eventsOfType(result, 'ball_save_timer_started')).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC 3, AC 4, AC 6 (UJ-3): spits, the Mouth lead, player-scoped credits.
// ---------------------------------------------------------------------------

describe('Story 3.2 -- AC 3 / AC 6 (UJ-3): the Lock full of another player\'s balls spits, and the credit still counts', () => {
	it('player 1 locks twice and drains; player 2 captures into s_lock_3: lock_lane_spit { 1, 1, credited } with the show at t and c_mouth at exactly t+LEAD; no trough serve; player 1 keeps 2; s_lock_3 opening returns the ball to play', () => {
		const lock1 = 100;
		const lock2 = 300;
		const drain = 500;
		const t = 800;
		const script = [
			...capture('s_lock_1', lock1),
			...serveArrivesAndLaunches('s_trough_3', lock1 + 10, lock1 + 20),
			...capture('s_lock_2', lock2),
			...serveArrivesAndLaunches('s_trough_2', lock2 + 10, lock2 + 20),
			// Player 1's ball drains: the ball ends and player 2's ball is served.
			...close('s_trough_2').at(drain).build(),
			...serveArrivesAndLaunches('s_trough_2', drain + 10, drain + 100),
			...capture('s_lock_3', t),
			...close('s_lock_3').open().at(t + LEAD + 1).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: t + LEAD + 10,
			initialState: gameState({ players: [player(), player({ ballNumber: 0 })] }),
		});

		expect(lockEvents(result)).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: lock1 },
			{ type: 'lock_lane_locked', player: 0, credits: 2, tick: lock2 },
			{ type: 'lock_lane_spit', player: 1, credits: 1, credited: true, tick: t },
		]);
		expect(eventsOfType(result, 'ball_ended').map((e) => e.tick), 'player 1\'s drain ends the ball; nothing else does').toEqual([drain]);
		expect(result.statesByTick.get(t - 1)!.currentPlayer).toBe(1);
		expect(result.statesByTick.get(t - 1)!.players[1]!.lockCredits).toBe(0);
		expect(result.finalState.players[1]!.lockCredits, 'player 2\'s credits go 0 -> 1').toBe(1);
		expect(result.finalState.players[0]!.lockCredits, 'player 1\'s credits remain 2').toBe(2);

		expect(showTicks(result), 'one spat ball: one show, on the capture tick').toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL), 'c_mouth exactly LEAD later -- not at t+LEAD-1').toEqual([t + LEAD]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL).filter((tick) => tick >= t), 'a spit serves nothing').toEqual([]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'the positive: both locks and the ball end each served once').toEqual([lock1, lock2, drain]);
		expect(result.statesByTick.get(t)!.machine.ballsInPlay).toBe(0);
		expect(result.statesByTick.get(t + LEAD + 1)!.machine.ballsInPlay, 'the Mouth\'s device_ball_left returns the spat ball to play').toBe(1);
	});

	it('AC 4: two credits and a capture earn nothing -- lock_lane_spit { credits 2, credited: false }, the show at t, c_mouth at t+LEAD, no serve', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), {
			durationTicks: t + LEAD + 10,
			initialState: gameState({ players: [player({ lockCredits: 2 })], held: 2 }),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 2, credited: false, tick: t }]);
		expect(result.finalState.players[0]!.lockCredits).toBe(2);
		expect(showTicks(result)).toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + LEAD]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([]);
	});

	it('AC 4 with the Lock under-full: two credits and only one ball held still spits (no award), never locks', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_2', t), {
			durationTicks: t + LEAD + 10,
			initialState: gameState({ players: [player({ lockCredits: 2 })], held: 1 }),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 2, credited: false, tick: t }]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + LEAD]);
	});

	it('multiball !== null takes the uncredited spit (Stories 3.7/3.8 refine it)', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_1', t), {
			durationTicks: t + 10,
			initialState: gameState({ machine: { multiball: 'quickmb' } }),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 0, credited: false, tick: t }]);
		expect(showTicks(result)).toEqual([t]);
	});
});

// ---------------------------------------------------------------------------
// AC 10 (DW-171), the tilted entry, Attract, and one sequence.
// ---------------------------------------------------------------------------

describe('Story 3.2 -- AC 10 (DW-171): an uncredited park is ejected with no outcome', () => {
	it('s_lock_1 closes with no lock_lane_entered: no lock_lane_* event, credits unchanged, the show at t and c_mouth at t+LEAD, no ball_ended -- and the spat ball\'s own later drain does end the ball', () => {
		const t = 600;
		const drain = t + LEAD + 300;
		const script = [
			// The lane closes far outside the capture window: DW-166's slow shot.
			...close('s_lock_lane').at(t - CAPTURE_WINDOW - 100).open().at(t - CAPTURE_WINDOW - 90).build(),
			...close('s_lock_1').at(t).open().at(t + LEAD + 1).build(),
			...close('s_trough_4').at(drain).build(),
		];
		const result = runRulesScript(script, { durationTicks: drain + 5, initialState: gameState() });
		expect(lockEvents(result), 'no outcome event').toEqual([]);
		expect(result.finalState.players[0]!.lockCredits).toBe(0);
		expect(showTicks(result)).toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + LEAD]);
		expect(result.statesByTick.get(t)!.machine.ballsInPlay).toBe(0);
		expect(result.statesByTick.get(t + LEAD + 1)!.machine.ballsInPlay).toBe(1);
		expect(eventsOfType(result, 'ball_ended').map((e) => e.tick), 'no ball_ended at the park; the spat ball\'s drain ends the ball').toEqual([drain]);
	});
});

describe('Story 3.2 -- the tilted entry, Attract, and one Mouth sequence', () => {
	it('Tilted entry: lock_lane_spit { credited: false }, eject at t+LEAD, and the spat ball\'s drain gives ball_ended { tilted: true }', () => {
		const t = 300;
		const drain = t + LEAD + 200;
		const script = [...capture('s_lock_1', t), ...close('s_lock_1').open().at(t + LEAD + 1).build(), ...close('s_trough_4').at(drain).build()];
		const result = runRulesScript(script, {
			durationTicks: drain + 5,
			initialState: gameState({ machine: { tilt: { tilted: true, slamTilted: false } } }),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 0, credited: false, tick: t }]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + LEAD]);
		const ended = eventsOfType(result, 'ball_ended');
		expect(ended.map((e) => e.tick)).toEqual([drain]);
		expect(ended[0]).toMatchObject({ tilted: true });
	});

	it('Attract: a capture emits nothing, schedules nothing, credits nothing, and the slot stays closed -- the SAME script in a game locks', () => {
		const t = 300;
		const attract = runRulesScript(capture('s_lock_1', t), {
			durationTicks: t + LEAD + 10,
			initialState: gameState({ phase: 'attract', machine: { ballsInPlay: 0, hardwareEnabled: false } }),
		});
		expect(lockEvents(attract)).toEqual([]);
		expect(attract.commands).toEqual([]);
		expect(pulseTicks(attract, MOUTH_COIL)).toEqual([]);
		expect(pulseTicks(attract, TROUGH_EJECT_COIL)).toEqual([]);
		expect(attract.finalState.players[0]!.lockCredits).toBe(0);
		expect(attract.finalState.machine.deviceSlots.bd_lock, 'the captured ball stays parked').toEqual([true, false, false]);

		const game = runRulesScript(capture('s_lock_1', t), { durationTicks: t + 10, initialState: gameState() });
		expect(lockEvents(game), 'positive: the same capture in a game locks').toEqual([{ type: 'lock_lane_locked', player: 0, credits: 1, tick: t }]);
	});

	it('Two ejects, one sequence: two uncredited parks 5 ticks apart give ONE show (at t) and c_mouth at t+LEAD and t+LEAD+INTERVAL', () => {
		const t = 300;
		const script = [...close('s_lock_1').at(t).build(), ...close('s_lock_2').at(t + 5).build()];
		const result = runRulesScript(script, { durationTicks: t + LEAD + INTERVAL + 10, initialState: gameState({ machine: { ballsInPlay: 2 } }) });
		expect(showTicks(result)).toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + LEAD, t + LEAD + INTERVAL]);
		expect(lockEvents(result)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC 9 (DW-174): the Lock overflow, answered once.
// ---------------------------------------------------------------------------

function overflowAt(tick: number): ReadonlyMap<number, MachineReport> {
	return new Map([[tick, { recovered: null, failures: [{ type: 'device_overflow', device: 'bd_lock', tick }] }]]);
}

describe('Story 3.2 -- AC 9 (DW-174): a bd_lock overflow is answered with one Mouth eject, and never a second while one is pending', () => {
	it('Overflow with nothing pending: the show at t and exactly one c_mouth at t+LEAD -- in a game and in Attract alike', () => {
		const t = 300;
		for (const phase of ['game', 'attract'] as const) {
			const result = runRulesScript([], { durationTicks: t + LEAD + INTERVAL + 10, initialState: gameState({ phase, held: 3 }), machineReports: overflowAt(t) });
			expect(showTicks(result), `${phase}: one show`).toEqual([t]);
			expect(pulseTicks(result, MOUTH_COIL), `${phase}: one pulse, LEAD later`).toEqual([t + LEAD]);
		}
	});

	it('Overflow with a spit pending: no second show and no second c_mouth -- the spit\'s own pulse is the only one', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), {
			durationTicks: t + LEAD + INTERVAL + 10,
			initialState: gameState({ players: [player({ lockCredits: 2 })], held: 2 }),
			machineReports: overflowAt(t + 10),
		});
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 2, credited: false, tick: t }]);
		expect(showTicks(result)).toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + LEAD]);
	});

	it('Overflow on the very tick the pending pulse fires: the pulse still counts as pending -- no second show and no second c_mouth', () => {
		const t = 300;
		const result = runRulesScript(capture('s_lock_3', t), {
			durationTicks: t + 2 * LEAD + 10,
			initialState: gameState({ players: [player({ lockCredits: 2 })], held: 2 }),
			machineReports: overflowAt(t + LEAD),
		});
		expect(pulseTicks(result, MOUTH_COIL), 'the premise: the spit\'s own pulse fires on the overflow tick').toEqual([t + LEAD]);
		expect(showTicks(result), 'no second show on the pulse tick').toEqual([t]);
	});

	it('the trough\'s own overflow is still answered at once, by the S10 eject (unchanged)', () => {
		const t = 300;
		const report: ReadonlyMap<number, MachineReport> = new Map([[t, { recovered: null, failures: [{ type: 'device_overflow', device: 'bd_trough', tick: t }] }]]);
		const result = runRulesScript([], { durationTicks: t + 5, initialState: gameState(), machineReports: report });
		expect(pulseTicks(result, TROUGH_EJECT_COIL)).toEqual([t]);
		expect(showTicks(result)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The drain gate while a spit is pending.
// ---------------------------------------------------------------------------

describe('Story 3.2 -- a drain while a spit is pending ends nothing', () => {
	it('two balls; one is captured and spat, the other drains to ballsInPlay 0 while the eject is pending: no ball_ended until the spat ball\'s own drain', () => {
		const t = 300;
		const otherDrain = t + 10;
		const spatDrain = t + LEAD + 300;
		const script = [
			...capture('s_lock_3', t),
			...close('s_trough_3').at(otherDrain).build(),
			...close('s_lock_3').open().at(t + LEAD + 1).build(),
			...close('s_trough_4').at(spatDrain).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: spatDrain + 5,
			initialState: gameState({
				players: [player({ lockCredits: 2 })],
				held: 2,
				machine: { ballsInPlay: 2, deviceSlots: { bd_trough: [true, true, false, false], bd_shooter: [false], bd_lock: [false, false, false] } },
			}),
		});
		expect(result.statesByTick.get(otherDrain)!.machine.ballsInPlay, 'the premise: the other ball drained to 0').toBe(0);
		expect(eventsOfType(result, 'ball_ended').map((e) => e.tick), 'only the spat ball\'s drain ends the ball').toEqual([spatDrain]);
	});

	it('the other ball drains on the very tick the Mouth pulses: that tick still counts as pending (the spat ball\'s +1 lands a tick later), so no ball_ended until the spat ball\'s own drain', () => {
		const t = 300;
		const otherDrain = t + LEAD;
		const spatDrain = t + LEAD + 300;
		const script = [
			...capture('s_lock_3', t),
			...close('s_trough_3').at(otherDrain).build(),
			...close('s_lock_3').open().at(t + LEAD + 1).build(),
			...close('s_trough_4').at(spatDrain).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: spatDrain + 5,
			initialState: gameState({
				players: [player({ lockCredits: 2 })],
				held: 2,
				machine: { ballsInPlay: 2, deviceSlots: { bd_trough: [true, true, false, false], bd_shooter: [false], bd_lock: [false, false, false] } },
			}),
		});
		expect(pulseTicks(result, MOUTH_COIL), 'the premise: the pulse fires on the drain tick').toEqual([otherDrain]);
		expect(result.statesByTick.get(otherDrain)!.machine.ballsInPlay, 'the premise: the other ball drained to 0 on the pulse tick').toBe(0);
		expect(result.statesByTick.get(otherDrain + 1)!.machine.ballsInPlay, 'the spat ball is back in play a tick later').toBe(1);
		expect(eventsOfType(result, 'ball_ended').map((e) => e.tick), 'only the spat ball\'s drain ends the ball').toEqual([spatDrain]);
	});
});

// ---------------------------------------------------------------------------
// AC 7, AC 8, AC 11 (DW-281, DW-282): ball search through the arbiter.
// ---------------------------------------------------------------------------

/** A stuck ball: launched at `O`, closing nothing afterwards. */
function stuckFrom(O: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').open().at(O).build();
}

function stuckState(options: { readonly held?: number; readonly tilted?: boolean; readonly modes?: GameState['modes'] } = {}): GameState {
	return gameState({
		held: options.held ?? 0,
		modes: options.modes,
		machine: {
			ballsInPlay: 0,
			tilt: { tilted: options.tilted ?? false, slamTilted: false },
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] },
		},
	});
}

/** The tick stage slot `k` of an uninterrupted pass started at `O` falls due. */
function slotTick(O: number, k: number): number {
	return O + SEARCH + k * STEP;
}

describe('Story 3.2 -- AC 7: ball search reaches the Lock through the Mouth', () => {
	it('Search reaches the Lock (L holds 2): each Lock stage is a show then c_mouth exactly LEAD later; the second stage comes due only after the first pulse; no c_autolaunch and no recover before the second pulse', () => {
		const O = 100;
		const firstShow = slotTick(O, 6);
		// The quiet count is held from the first request until its pulse (the
		// pulse tick counts), so the second stage falls due STEP - 1 ticks
		// after the first pulse.
		const secondShow = firstShow + LEAD + STEP - 1;
		const script = [
			...stuckFrom(O),
			// The first pulse spits the highest slot (s_lock_2), the second the
			// next (s_lock_1) -- each opening a tick after its pulse.
			...close('s_lock_2').open().at(firstShow + LEAD + 1).build(),
			...close('s_lock_1').open().at(secondShow + LEAD + 1).build(),
		];
		const result = runRulesScript(script, { durationTicks: secondShow + LEAD + 3 * STEP, initialState: stuckState({ held: 2 }) });

		expect(showTicks(result)).toEqual([firstShow, secondShow]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([firstShow + LEAD, secondShow + LEAD]);
		expect(secondShow, 'the second stage comes due only after the first pulse').toBeGreaterThan(firstShow + LEAD);
		const autolaunch = pulseTicks(result, AUTOLAUNCH_COIL);
		expect(autolaunch, 'the autolaunch stage still runs -- after the second pulse').toHaveLength(1);
		expect(autolaunch[0]!).toBeGreaterThan(secondShow + LEAD);
		expect(result.recoverCommands.filter((r) => r.tick <= secondShow + LEAD), 'no recover before the second pulse').toEqual([]);
		expect(result.statesByTick.get(firstShow + LEAD + 1)!.machine.ballsInPlay, 'the spat ball returns to play').toBe(2);
	});

	it('Search, empty Lock: the Lock stages issue nothing, and the pass is not delayed -- c_autolaunch at its own undelayed slot', () => {
		const O = 100;
		const result = runRulesScript(stuckFrom(O), { durationTicks: slotTick(O, 8) + 10, initialState: stuckState({ held: 0 }) });
		expect(showTicks(result)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL)).toEqual([slotTick(O, 8)]);
	});
});

describe('Story 3.2 -- AC 8: a mode publishing timerTicks skips the Mouth', () => {
	it('L holds 2 and a stub mode entry publishes timerTicks: no show and no c_mouth, the pass runs on undelayed -- the same state without the timer entry opens the Mouth', () => {
		const O = 100;
		const withTimer = runRulesScript(stuckFrom(O), {
			durationTicks: slotTick(O, 8) + 10,
			initialState: stuckState({ held: 2, modes: [{ mode: 'stub', priority: 300, player: 0, timerTicks: 5000 }] }),
		});
		expect(showTicks(withTimer)).toEqual([]);
		expect(pulseTicks(withTimer, MOUTH_COIL)).toEqual([]);
		expect(pulseTicks(withTimer, AUTOLAUNCH_COIL), 'the search itself still runs').toEqual([slotTick(O, 8)]);

		const withoutTimer = runRulesScript(stuckFrom(O), {
			durationTicks: slotTick(O, 6) + 10,
			initialState: stuckState({ held: 2, modes: [{ mode: 'stub', priority: 300, player: 0 }] }),
		});
		expect(showTicks(withoutTimer), 'positive: with no timer published the Lock stage opens the Mouth').toEqual([slotTick(O, 6)]);
	});
});

describe('Story 3.2 -- AC 11 (DW-281, DW-282): the trough stages issue nothing; the recover\'s answer serves, or under Tilt ends the ball', () => {
	it('Search under Tilt (DW-281): no trough, autolaunch or Lock output; the recover report gives ball_missing, then ball_ended { tilted: true }, then the rotation', () => {
		const O = 100;
		const recover = slotTick(O, 11);
		const result = runRulesScript(stuckFrom(O), {
			durationTicks: recover + 5,
			initialState: stuckState({ held: 2, tilted: true }),
			machineReports: new Map([[recover + 1, { recovered: 1, failures: [] }]]),
		});
		// The pass's own recover, then the next ball's stray clear (every ball
		// start issues one, AD-6) on the report tick.
		expect(result.recoverCommands.map((r) => r.tick), 'the pass runs to its recover; the rotation\'s stray clear follows').toEqual([recover, recover + 1]);
		expect(pulseTicks(result, 'c_sling_l'), 'the positive: the sling stages still pulse under Tilt').toEqual([slotTick(O, 0)]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL).filter((tick) => tick <= recover), 'no trough serve from the pass').toEqual([]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL)).toEqual([]);
		expect(showTicks(result)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);

		const atReport = result.events.filter((e) => e.tick === recover + 1).map((e) => e.type);
		expect(atReport.slice(0, 3)).toEqual(['ball_missing', 'ball_ended', 'ball_will_start']);
		const ended = eventsOfType(result, 'ball_ended');
		expect(ended).toHaveLength(1);
		expect(ended[0]).toMatchObject({ player: 0, tilted: true, total: 0 });
		expect(result.statesByTick.get(recover + 1)!.players[0]!.ballNumber, 'the rotation starts the next ball').toBe(2);
		expect(result.statesByTick.get(recover + 1)!.machine.tilt.tilted, 'the new ball starts untilted').toBe(false);
	});

	it('Search under Tilt with a Mouth eject pending at the recover report: ball_missing but no ball_ended there -- the spat ball is still the player\'s, and its own drain gives the one ball_ended { tilted: true }', () => {
		const O = 100;
		const recover = slotTick(O, 11);
		const report = recover + 1;
		const drain = report + LEAD + 300;
		const script = [
			...stuckFrom(O),
			// An uncredited park on the report tick itself (no lane closure, so
			// nothing resets the pass first): the Mouth eject is pending when
			// the recover's answer runs.
			...close('s_lock_1').at(report).open().at(report + LEAD + 1).build(),
			...close('s_trough_4').at(drain).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: drain + 5,
			initialState: stuckState({ tilted: true }),
			machineReports: new Map([[report, { recovered: 1, failures: [] }]]),
		});
		expect(result.recoverCommands.map((r) => r.tick), 'the premise: the pass reached its recover').toContain(recover);
		expect(showTicks(result), 'the premise: the park opened the Mouth on the report tick').toEqual([report]);
		expect(eventsOfType(result, 'ball_missing').map((e) => e.tick)).toEqual([report]);
		const ended = eventsOfType(result, 'ball_ended');
		expect(ended.map((e) => e.tick), 'no ball_ended at the report; the spat ball\'s drain ends the ball').toEqual([drain]);
		expect(ended[0]).toMatchObject({ tilted: true });
	});

	it('Search control (untilted): the trough stages issue nothing; the recover report gives ball_missing plus exactly one c_trough_eject, and no ball_ended', () => {
		const O = 100;
		const recover = slotTick(O, 11);
		const result = runRulesScript(stuckFrom(O), {
			durationTicks: recover + 5,
			initialState: stuckState(),
			machineReports: new Map([[recover + 1, { recovered: 1, failures: [] }]]),
		});
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'the recover\'s answer is the pass\'s only serve').toEqual([recover + 1]);
		expect(eventsOfType(result, 'ball_missing')).toEqual([{ type: 'ball_missing', count: 1, tick: recover + 1 }]);
		expect(eventsOfType(result, 'ball_ended')).toEqual([]);
		expect(pulseTicks(result, AUTOLAUNCH_COIL), 'the positive: the pass walked its stages').toEqual([slotTick(O, 8)]);
	});

	it('Closure after the trough slot (DW-282): a playfield closure between the trough slots and the recover resets the pass -- no c_trough_eject at any tick, no recover and no serve; the reset pass starts afresh from the closure', () => {
		const O = 100;
		const S = O + SEARCH;
		const C = slotTick(O, 9) + STEP / 2 + 25;
		const script = [...stuckFrom(O), ...close('s_drain').at(C).build()];
		const result = runRulesScript(script, { durationTicks: C + SEARCH + 5, initialState: stuckState() });
		expect(C, 'the premise: the closure lands after the first trough slot and before the recover').toBeGreaterThan(slotTick(O, 9));
		expect(C).toBeLessThan(slotTick(O, 11));
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'no served ball is left behind').toEqual([]);
		expect(result.recoverCommands, 'the closure reset the pass before its recover').toEqual([]);
		expect(eventsOfType(result, 'ball_search_started').map((e) => e.tick), 'the positive: the pass had started, and the closure restarts the count').toEqual([S, C + SEARCH]);
	});
});

// ---------------------------------------------------------------------------
// AC 5 (DW-212): l_lock follows the stack and the current player's credits.
// ---------------------------------------------------------------------------

describe('Story 3.2 -- AC 5 (DW-212): l_lock', () => {
	it('modes [] with an occupied Lock -> off/0; a mode on the stack with credits 0 -> dragon/1; credits 2 -> off/0', () => {
		expect(lampsOf(gameState({ held: 2, modes: [] })).l_lock).toEqual({ role: 'off', step: 0 });
		expect(lampsOf(gameState({ held: 0, modes: [{ mode: 'base', priority: 100, player: 0 }] })).l_lock).toEqual({ role: 'dragon', step: 1 });
		expect(lampsOf(gameState({ held: 2, players: [player({ lockCredits: 2 })], modes: [{ mode: 'base', priority: 100, player: 0 }] })).l_lock).toEqual({ role: 'off', step: 0 });
	});

	it('l_lock reads the CURRENT player\'s credits: with currentPlayer 1, credits [2, 0] -> dragon/1 and credits [0, 2] -> off/0', () => {
		const modes: GameState['modes'] = [{ mode: 'base', priority: 100, player: 1 }];
		const up = gameState({ currentPlayer: 1, players: [player({ lockCredits: 2 }), player({ lockCredits: 0 })], modes });
		expect(lampsOf(up).l_lock, 'player 2 can still lock, whatever player 1 holds').toEqual({ role: 'dragon', step: 1 });
		const done = gameState({ currentPlayer: 1, players: [player({ lockCredits: 0 }), player({ lockCredits: 2 })], modes });
		expect(lampsOf(done).l_lock, 'player 2 at 2 credits: off, whatever player 1 holds').toEqual({ role: 'off', step: 0 });
	});
});

// ---------------------------------------------------------------------------
// The Mouth sequence's reset-safety (Boundaries: discarded only if tick <
// openTick, `tilt.ts`'s precedent).
// ---------------------------------------------------------------------------

describe('Story 3.2 -- a pending Mouth sequence is discarded only when tick runs backwards', () => {
	function runTimeline(restartAt: number | null): number[] {
		const rules = createRules(TUNING);
		const park = 500;
		const mouthPulses: number[] = [];
		let state = gameState();
		const step = (tick: number, events: readonly SwitchEvent[]): void => {
			const result = rules.step(state, events, tick);
			state = result.state;
			for (const command of result.coilCommands) {
				if (command.coil === MOUTH_COIL && command.action === 'pulse') {
					mouthPulses.push(tick);
				}
			}
		};
		const parkEvents = close('s_lock_1').at(park).build();
		for (let tick = 1; tick <= park; tick++) {
			step(tick, tick === park ? parkEvents : []);
		}
		const from = restartAt ?? park + 1;
		for (let tick = from; tick <= park + LEAD + 5; tick++) {
			step(tick, []);
		}
		return mouthPulses;
	}

	it('control: an uninterrupted timeline pulses at park+LEAD; a timeline restarted at tick 1 (tick < openTick) never pulses', () => {
		expect(runTimeline(null), 'positive: the park\'s eject pulses LEAD later').toEqual([500 + LEAD]);
		expect(runTimeline(1), 'the restarted timeline discarded the stale sequence').toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The full-device entry: a closure while the Lock is already full.
// ---------------------------------------------------------------------------

describe('Story 3.2 -- a full-device entry spits without a Mouth eject (its ball was never parked)', () => {
	it('three balls parked in Attract, then Start; a lane closure in the game is lock_lane_spit { credited: true } with no show and no c_mouth', () => {
		const start = 100;
		const lane = 700;
		const script = [
			...close('s_lock_1').at(10).build(),
			...close('s_lock_2').at(20).build(),
			...close('s_lock_3').at(30).build(),
			...close('s_start').at(start).open().at(start + 5).build(),
			...close('s_lock_lane').at(lane).build(),
		];
		const result = runRulesScript(script, {
			durationTicks: lane + LEAD + 10,
			initialState: gameState({ phase: 'attract', players: [], machine: { ballsInPlay: 0, hardwareEnabled: false, deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] } } }),
		});
		expect(result.statesByTick.get(start)!.phase, 'the premise: Start created a game').toBe('game');
		expect(lockEvents(result)).toEqual([{ type: 'lock_lane_spit', player: 0, credits: 1, credited: true, tick: lane }]);
		expect(showTicks(result)).toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([]);
		expect(result.finalState.players[0]!.lockCredits).toBe(1);
	});
});
