// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.2 QA: headless coverage the implement stage's own matrix file
// (`test/rules-lock-arbiter.test.ts`) left thin, all through a real
// `createRules()` via `runRulesScript()` (`test/util/switch-script.ts`). No
// physics, no rendering, no `sim/loop` (gated by
// `test/rules-devices-headless.test.ts`'s ENTRY_FILES). The real-physics
// additions are `test/lock-arbiter-qa-physics.test.ts`.
//
// 1. AC 6 (UJ-3) through a REAL Hot-seat: the game is created by a Start
//    press in Attract, player 2 joins by a second Start press during player
//    1's ball 1, and player 2 becomes current through the ball controller's
//    own rotation on player 1's drain -- never a hand-set `players[]` or
//    `currentPlayer`.
// 2. The Mouth sequence's timing: one open show, the first `c_mouth` exactly
//    `mouthOpenLeadTicks` later, each further pulse exactly
//    `mouthEjectIntervalTicks` after the previous one (anchored on the last
//    due pulse, never on the request tick), a request on the very tick a
//    pulse fires joining the running sequence, and a request after the last
//    pulse opening a NEW sequence with its own show and lead. A second run
//    on a non-production tuning proves both durations are read from the
//    resolved tuning, not constants.
// 3. The "pending" boundary at a Mouth pulse tick (EC4/IA1): the drain
//    gate, the overflow answer and ball search all count the pulse tick as
//    pending, because the rules-side Lock still shows the ball being pulsed
//    until the next tick (AD-4). QA found the search did NOT (reachable with
//    production tuning: an uncredited park landing on the very tick a Lock
//    stage would fall due made that stage fall due ON the pulse tick and
//    request a surplus eject for the one parked ball, a `c_mouth` physics
//    could only answer with `eject_failed`); the code review of Story 3.2
//    fixed it. Pinned by the park-on-the-stage-tick row plus its
//    one-tick-earlier control, and a no-stall pin for an `eject_failed`
//    answer (DW-297's evidence).
//
// Every duration is derived from `resolveTuning()` (the spec's Boundaries).

import { describe, expect, it } from 'vitest';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { close, open, runRulesScript, type RunRulesScriptResult } from './util/switch-script';
import type { PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineReport, MachineState, SemanticEvent, SwitchEvent, SwitchName } from '../src/sim/table/names';

const TUNING = resolveTuning();
const LEAD = shotWindowTicks('mouthOpenLeadMs', TUNING);
const INTERVAL = shotWindowTicks('mouthEjectIntervalMs', TUNING);
const CAPTURE_WINDOW = shotWindowTicks('lockCaptureWindowMs', TUNING);
const SEARCH = shotWindowTicks('ballSearchMs', TUNING);
const STEP = shotWindowTicks('ballSearchStepMs', TUNING);
const SAVE = shotWindowTicks('ballSaveMs', TUNING);
const SAVE_GRACE = shotWindowTicks('ballSaveGraceMs', TUNING);

/** The lane closure lands this many ticks before its slot's close -- inside the capture window, so the devices layer resolves a captured entry. */
const LANE_LEAD = Math.floor(CAPTURE_WINDOW / 2);

const MOUTH_COIL = 'c_mouth';
const TROUGH_EJECT_COIL = 'c_trough_eject';
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

function gameState(machine: Partial<MachineState> = {}): GameState {
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
			...machine,
		},
		players: [player()],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

/** A fresh Attract-phase machine: the trough full, the Lock and the shooter lane empty (the loop's own boot occupancy). */
function attractState(): GameState {
	return {
		...gameState({ ballsInPlay: 0, hardwareEnabled: false, deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] } }),
		phase: 'attract',
		players: [],
	};
}

/** A captured Lock entry: the lane closes `LANE_LEAD` ticks before `slot` closes at `t` (inside the capture window). */
function capture(slot: SwitchName, t: number): readonly SwitchEvent[] {
	return close('s_lock_lane').at(t - LANE_LEAD).open().at(t - LANE_LEAD + 5).close(slot).at(t).build();
}

/** A served ball's arrival in the shooter lane (its trough slot opening and the lane closing in one batch, DW-187) at `arrive`, then its launch (the lane opening) at `launch`. */
function serveArrivesAndLaunches(troughSlot: SwitchName, arrive: number, launch: number): readonly SwitchEvent[] {
	return close('s_shooter_lane').at(arrive).open(troughSlot).at(arrive).open('s_shooter_lane').at(launch).build();
}

function pressStart(t: number): readonly SwitchEvent[] {
	return close('s_start').at(t).open().at(t + 5).build();
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
// 1. AC 6 (UJ-3) through a real Hot-seat rotation.
// ---------------------------------------------------------------------------

describe('Story 3.2 QA -- AC 6 (UJ-3) through a real Hot-seat: Start creates the game, a second Start adds player 2, and player 1\'s drain rotates to player 2', () => {
	it('player 1 locks twice and drains; the rotation makes player 2 current; player 2\'s capture into s_lock_3 spits { player 1, credits 1, credited } -- player 2\'s credits go 0 -> 1, player 1\'s stay 2, one ball is spat after the lead', () => {
		const start = 10;
		const hotSeat = 40;
		const arrive = 60;
		const plunge = 100;
		const lock1 = 300;
		const lock2 = 600;
		// Player 1's own drain lands after the save window and its grace, so it
		// ends the ball (and rotates) instead of being saved.
		const drain = plunge + SAVE + SAVE_GRACE + 500;
		const p2Arrive = drain + 10;
		const p2Plunge = drain + 100;
		const t = p2Plunge + 400;
		const script = [
			...pressStart(start),
			...pressStart(hotSeat),
			...serveArrivesAndLaunches('s_trough_4', arrive, plunge),
			...capture('s_lock_1', lock1),
			...serveArrivesAndLaunches('s_trough_3', lock1 + 10, lock1 + 20),
			...capture('s_lock_2', lock2),
			...serveArrivesAndLaunches('s_trough_2', lock2 + 10, lock2 + 20),
			...close('s_trough_2').at(drain).build(),
			...serveArrivesAndLaunches('s_trough_2', p2Arrive, p2Plunge),
			...capture('s_lock_3', t),
			...open('s_lock_3').at(t + LEAD + 1).build(),
		];
		const result = runRulesScript(script, { durationTicks: t + LEAD + 10, initialState: attractState() });

		// The premises: a real game, a real Hot-seat join, a real rotation.
		expect(result.statesByTick.get(start - 1)!.phase, 'the premise: Attract before the first Start').toBe('attract');
		expect(result.statesByTick.get(start)!.players, 'the premise: the first Start creates a one-player game').toHaveLength(1);
		expect(result.statesByTick.get(hotSeat)!.players, 'the premise: the second Start joins player 2 (Hot-seat)').toHaveLength(2);
		expect(result.statesByTick.get(drain - 1)!.currentPlayer, 'player 1 is up until the drain').toBe(0);
		const ended = eventsOfType(result, 'ball_ended');
		expect(ended.map((event) => event.tick), 'player 1\'s drain ends the ball; the Lock captures end nothing').toEqual([drain]);
		expect(ended[0]).toMatchObject({ player: 0, tilted: false });
		expect(eventsOfType(result, 'ball_saved'), 'the drain is past the save window').toEqual([]);
		expect(result.statesByTick.get(drain)!.currentPlayer, 'the ball controller\'s own rotation makes player 2 current').toBe(1);
		expect(result.statesByTick.get(drain)!.players[1]!.ballNumber, 'player 2\'s ball 1 starts at the rotation').toBe(1);

		expect(lockEvents(result)).toEqual([
			{ type: 'lock_lane_locked', player: 0, credits: 1, tick: lock1 },
			{ type: 'lock_lane_locked', player: 0, credits: 2, tick: lock2 },
			{ type: 'lock_lane_spit', player: 1, credits: 1, credited: true, tick: t },
		]);
		expect(result.statesByTick.get(t - 1)!.players.map((p) => p.lockCredits), 'before player 2\'s entry').toEqual([2, 0]);
		expect(result.finalState.players.map((p) => p.lockCredits), 'player 2\'s credits go 0 -> 1; player 1\'s remain 2').toEqual([2, 1]);

		expect(showTicks(result), 'one ball spat: one show, on player 2\'s capture tick').toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL), 'c_mouth exactly LEAD later').toEqual([t + LEAD]);
		expect(pulseTicks(result, TROUGH_EJECT_COIL), 'the Start serve, both lock serves and the rotation serve -- and no serve for the spit').toEqual([start, lock1, lock2, drain]);
		expect(result.statesByTick.get(t)!.machine.ballsInPlay, 'the capture takes player 2\'s ball out of play').toBe(0);
		expect(result.statesByTick.get(t + LEAD + 1)!.machine.ballsInPlay, 'the Mouth returns it').toBe(1);
		expect(eventsOfType(result, 'ball_ended'), 'player 2\'s capture ends nothing').toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// 2. The Mouth sequence's timing.
// ---------------------------------------------------------------------------

describe('Story 3.2 QA -- the Mouth sequence: one open show, the pulse exactly the lead later, further pulses exactly the interval apart', () => {
	it('three uncredited parks (at t, at t+LEAD-1 and on the first pulse tick itself) are ONE sequence: one show at t, c_mouth at t+LEAD, t+LEAD+INTERVAL, t+LEAD+2*INTERVAL; a park after the last pulse opens a NEW sequence with its own show and the full lead', () => {
		const t = 300;
		const firstPulse = t + LEAD;
		const again = firstPulse + 2 * INTERVAL + 5;
		const script = [
			...close('s_lock_1').at(t).build(),
			...close('s_lock_2').at(firstPulse - 1).build(),
			// On the pulse tick itself: the scheduler pulses before the park is
			// decided, so this request joins the still-running sequence.
			...close('s_lock_3').at(firstPulse).build(),
			// Each pulse releases the highest held slot; its switch opens a tick
			// after the pulse (AD-4).
			...open('s_lock_3').at(firstPulse + 1).build(),
			...open('s_lock_2').at(firstPulse + INTERVAL + 1).build(),
			...open('s_lock_1').at(firstPulse + 2 * INTERVAL + 1).build(),
			...close('s_lock_1').at(again).open().at(again + LEAD + 1).build(),
		];
		const result = runRulesScript(script, { durationTicks: again + LEAD + 10, initialState: gameState({ ballsInPlay: 3 }) });

		expect(result.commands.filter((command) => command.tick === t), 'the show is a payload-complete ShowCommand').toEqual([{ type: 'show', show: MOUTH_SHOW, tick: t }]);
		// Story 3.3: `showTicks` reads the open show only; each sequence also
		// ends with a close (test/rules-dragon-shows.test.ts).
		expect(showTicks(result), 'one open show per sequence').toEqual([t, again]);
		expect(pulseTicks(result, MOUTH_COIL), 'the lead, then the interval after the LAST due pulse -- never after the request tick').toEqual([
			firstPulse,
			firstPulse + INTERVAL,
			firstPulse + 2 * INTERVAL,
			again + LEAD,
		]);
		expect(INTERVAL, 'the premise: the interval is not the lead, so the two cannot be confused').not.toBe(LEAD);
		expect(lockEvents(result), 'parks emit no outcome').toEqual([]);
		expect(eventsOfType(result, 'ball_ended'), 'parks end nothing').toEqual([]);
		expect(result.statesByTick.get(firstPulse)!.machine.ballsInPlay, 'all three balls parked').toBe(0);
		expect(result.statesByTick.get(firstPulse + 2 * INTERVAL + 1)!.machine.ballsInPlay, 'each eject returns one ball').toBe(3);
		expect(result.finalState.machine.ballsInPlay).toBe(3);
	});

	it('the lead and the interval are read from the resolved tuning: a non-production lead and interval move every pulse, and the show stays on the request tick', () => {
		const tuned = resolveTuning({
			...RAW_TUNING,
			mouthOpenLeadMs: { ...RAW_TUNING.mouthOpenLeadMs, value: 1700 },
			mouthEjectIntervalMs: { ...RAW_TUNING.mouthEjectIntervalMs, value: 300 },
		});
		const lead = shotWindowTicks('mouthOpenLeadMs', tuned);
		const interval = shotWindowTicks('mouthEjectIntervalMs', tuned);
		expect(lead, 'the premise: a lead that differs from production').not.toBe(LEAD);
		expect(interval, 'the premise: an interval that differs from production').not.toBe(INTERVAL);
		const t = 300;
		const script = [...close('s_lock_1').at(t).build(), ...close('s_lock_2').at(t + 5).build()];
		const result = runRulesScript(script, { durationTicks: t + lead + interval + 10, tuning: tuned, initialState: gameState({ ballsInPlay: 2 }) });
		expect(showTicks(result)).toEqual([t]);
		expect(pulseTicks(result, MOUTH_COIL)).toEqual([t + lead, t + lead + interval]);
	});
});

// ---------------------------------------------------------------------------
// 3. The pending boundary at a Mouth pulse tick (EC4/IA1).
// ---------------------------------------------------------------------------

/** Two balls in play from tick 1 (a stuck one and one that later parks): the search pass's origin is tick 1. */
function twoBallsInPlay(): GameState {
	return gameState({ ballsInPlay: 1, deviceSlots: { bd_trough: [true, true, false, false], bd_shooter: [true], bd_lock: [false, false, false] } });
}

/** The plunge at tick 1 launches the second ball; neither ball closes a playfield switch afterwards. */
const PLUNGE_AT_1 = close('s_shooter_lane').open().at(1).build();

/** The tick the first Lock stage (slot 6: slings 0-1, pops 2-4, bank reset 5) of an uninterrupted pass from origin 1 falls due. */
const FIRST_LOCK_STAGE = 1 + SEARCH + 6 * STEP;

function parkRun(parkAt: number, reports?: ReadonlyMap<number, MachineReport>): RunRulesScriptResult {
	const script = [
		...PLUNGE_AT_1,
		// An uncredited park (no lane closure, so the pass is not reset), its
		// Mouth eject opening s_lock_1 a tick after the pulse.
		...close('s_lock_1').at(parkAt).open().at(parkAt + LEAD + 1).build(),
	];
	return runRulesScript(script, { durationTicks: parkAt + 2 * LEAD + 2 * STEP, initialState: twoBallsInPlay(), machineReports: reports });
}

describe('Story 3.2 QA -- the pending boundary at a Mouth pulse tick (EC4/IA1)', () => {
	it('control: a park one tick BEFORE the first Lock stage falls due -- the held count lands the stage after the pulse, where the Lock reads empty: one show, one c_mouth, and nothing issued by the stage', () => {
		const park = FIRST_LOCK_STAGE - 1;
		const result = parkRun(park);
		expect(result.statesByTick.get(1)!.machine.ballsInPlay, 'the premise: two balls in play').toBe(2);
		expect(result.statesByTick.get(park)!.machine.ballsInPlay, 'the premise: the park leaves the other ball in play, so the pass keeps running').toBe(1);
		expect(eventsOfType(result, 'ball_search_started').map((e) => e.tick), 'the premise: the pass started from origin 1 and was never reset').toEqual([1 + SEARCH]);
		expect(showTicks(result)).toEqual([park]);
		expect(pulseTicks(result, MOUTH_COIL), 'one parked ball, one eject').toEqual([park + LEAD]);
	});

	// Found by Story 3.2 QA as a failing expectation (`it.fails`), fixed at
	// the code review. The park lands on the very tick the first Lock stage
	// would fall due; the pending eject holds the count through the pulse
	// tick, where the rules-side Lock still shows the ball being pulsed (its
	// slot opens a tick later). Before the fix ball search counted nothing
	// pending there -- `held (1) > pendingMouthEjects (0)` -- and requested a
	// second eject for the one parked ball: a second show and a surplus
	// c_mouth at park + 2*LEAD, which physics can only answer with
	// eject_failed.
	it('a park ON the first Lock stage\'s own due tick: the pulse tick counts as pending, so the stage never requests an eject for the ball being pulsed -- one parked ball, one show, one c_mouth', () => {
		const park = FIRST_LOCK_STAGE;
		const result = parkRun(park);
		expect(result.statesByTick.get(park)!.machine.ballsInPlay, 'the premise: the pass keeps running').toBe(1);
		expect(eventsOfType(result, 'ball_search_started').map((e) => e.tick), 'the premise: the pass was never reset').toEqual([1 + SEARCH]);
		expect(showTicks(result), 'one parked ball: one show').toEqual([park]);
		expect(pulseTicks(result, MOUTH_COIL), 'one parked ball: one eject').toEqual([park + LEAD]);
	});

	it('DW-297\'s evidence: an eject_failed { bd_lock } answered after the parked ball is back in play changes no count, ends no ball, requests no further eject, and the pass walks on to its autolaunch stage (no stall)', () => {
		const park = FIRST_LOCK_STAGE;
		const probe = parkRun(park);
		expect(pulseTicks(probe, MOUTH_COIL), 'the premise: one parked ball, one eject').toEqual([park + LEAD]);
		// An eject_failed on the Lock, delivered once the real eject has been
		// counted back: the one shape a Mouth pulse that ejects nothing can
		// take while rules and physics agree (every parked ball already out).
		const failedAt = park + LEAD + 2;
		const reports: ReadonlyMap<number, MachineReport> = new Map([[failedAt, { recovered: null, failures: [{ type: 'eject_failed', device: 'bd_lock', tick: failedAt }] }]]);
		const result = parkRun(park, reports);
		expect(result.statesByTick.get(failedAt - 1)!.machine.ballsInPlay, 'both balls are in play again after the real eject').toBe(2);
		expect(result.statesByTick.get(failedAt)!.machine.ballsInPlay, 'the eject_failed changes no count').toBe(2);
		expect(eventsOfType(result, 'ball_ended'), 'and ends no ball').toEqual([]);
		expect(pulseTicks(result, MOUTH_COIL), 'and requests no further eject').toEqual([park + LEAD]);
		expect(pulseTicks(result, 'c_autolaunch'), 'the pass walks on (no stall): its autolaunch stage still falls due').toHaveLength(1);
		expect(pulseTicks(result, 'c_autolaunch')[0]!).toBeGreaterThan(failedAt);
	});
});
