// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13 (DW-244, AD-6 amended, AD-4, AD-18): AC 8, the stray clear's own
// reporting and guards -- driven headless through `runRulesScript()`
// (`test/util/switch-script.ts`), injecting `machineReports` directly rather
// than through real physics (that is `test/stray-clear-integration.test.ts`'s
// job, ACs 5/6). No physics, no rendering, no `sim/loop` (AC 9).
//
// Every negative here carries its positive in the SAME `it()` (Rule 19).

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { close, runRulesScript } from './util/switch-script';
import type { GameState, MachineReport } from '../src/sim/table/names';

const TROUGH_EJECT_COIL = TABLE.ballDevices.bd_trough.ejectCoil;

/** A fresh Attract-phase state with a STALE ballsInPlay (as a voided game leaves it, DW-244's own route 1) -- an empty lane, trough missing one ball. */
function attractStaleState(): GameState {
	return {
		tick: 0,
		phase: 'attract',
		machine: {
			ballsInPlay: 1,
			hardwareEnabled: false,
			ballSave: { untilTick: null, sources: [] },
			tilt: { tilted: false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
		},
		players: [],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

/** The same Attract-phase premise, but the lane already holds the resting ball (DW-244's route 1b). */
function attractLaneOccupiedState(): GameState {
	return {
		...attractStaleState(),
		machine: { ...attractStaleState().machine, deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [true], bd_lock: [false, false, false] } },
	};
}

/** A mid-game state: one ball in play, `bd_shooter` per `laneOccupied`, one player on ball N. */
function midGameState(laneOccupied: boolean, ballNumber: number): GameState {
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
			deviceSlots: {
				bd_trough: laneOccupied ? [true, true, true, true] : [true, true, true, false],
				bd_shooter: [laneOccupied],
				bd_lock: [false, false, false],
			},
		},
		players: [
			{
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
			},
		],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

describe('AC 8 (i)/(ii) -- Start clears strays; the report is silent at count 0, positive at count > 0 (same test)', () => {
	it('Start at t pulses the trough into the empty lane and issues recoverCommands, zeroing ballsInPlay; the report at t+1 emits ball_missing only when recovered > 0', () => {
		const t = 5;
		const positive = runRulesScript(close('s_start').at(t).build(), {
			durationTicks: t + 5,
			initialState: attractStaleState(),
			machineReports: new Map<number, MachineReport>([[t + 1, { recovered: 1, failures: [] }]]),
		});

		const atT = positive.statesByTick.get(t)!;
		expect(atT.machine.ballsInPlay, 'DW-244: ballsInPlay is zeroed on the Start tick itself').toBe(0);
		const coilAtT = positive.coilCommands.filter((c) => c.tick === t && c.coil === TROUGH_EJECT_COIL);
		expect(coilAtT, 'exactly one trough pulse at the Start tick (the lane is empty)').toHaveLength(1);
		expect(positive.recoverCommands.filter((c) => c.tick === t), 'exactly one RecoverCommand at the Start tick').toHaveLength(1);

		const eventsAtTPlus1 = positive.events.filter((e) => e.tick === t + 1);
		expect(eventsAtTPlus1, 'the positive: recovered > 0 emits ball_missing').toEqual([{ type: 'ball_missing', count: 1, tick: t + 1 }]);
		expect(positive.coilCommands.some((c) => c.tick === t + 1), 'the stray-clear report never serves').toBe(false);

		const negative = runRulesScript(close('s_start').at(t).build(), {
			durationTicks: t + 5,
			initialState: attractStaleState(),
			machineReports: new Map<number, MachineReport>([[t + 1, { recovered: 0, failures: [] }]]),
		});
		expect(negative.events.some((e) => e.type === 'ball_missing'), 'the negative: recovered 0 emits no ball_missing at all').toBe(false);
	});
});

describe('AC 8 (iii) -- the stray-clear report never serves, even into an empty lane; a LATER, unrelated report at the same lane still serves through branch (a)', () => {
	it('no c_trough_eject at t+1 (the stray clear\'s own tick); the identical report shape at t+5, in game with the lane empty, pulses through branch (a)', () => {
		const t = 5;
		const result = runRulesScript(close('s_start').at(t).build(), {
			durationTicks: t + 6,
			initialState: attractStaleState(),
			machineReports: new Map<number, MachineReport>([
				[t + 1, { recovered: 0, failures: [] }],
				[t + 5, { recovered: 0, failures: [] }],
			]),
		});

		expect(result.coilCommands.some((c) => c.tick === t + 1), 'no c_trough_eject at the stray clear\'s own tick').toBe(false);
		expect(result.statesByTick.get(t + 1)!.phase, 'sanity: the new game is already in phase game by t+1').toBe('game');
		expect(
			result.coilCommands.some((c) => c.tick === t + 5 && c.coil === TROUGH_EJECT_COIL),
			'the positive: an unrelated later report (not the stray clear\'s own tick) in game with the lane empty serves through branch (a)',
		).toBe(true);
	});
});

describe('AC 8 (iv) -- a resting ball at Start: no trough pulse, but the RecoverCommand still issues; the resting ball is what plays', () => {
	it('Start with bd_shooter [true]: no c_trough_eject, recoverCommands [{tick:t}]; the lane opening at t+50 yields ball_launched with ballNumber 1', () => {
		const t = 5;
		const script = close('s_start').at(t).open('s_shooter_lane').at(t + 50).build();
		const result = runRulesScript(script, {
			durationTicks: t + 55,
			initialState: attractLaneOccupiedState(),
		});

		expect(result.coilCommands.some((c) => c.tick === t && c.coil === TROUGH_EJECT_COIL), 'no serve into an already-occupied lane').toBe(false);
		expect(result.recoverCommands.filter((c) => c.tick === t)).toHaveLength(1);
		const launched = result.events.find((e) => e.tick === t + 50 && e.type === 'ball_launched');
		expect(launched, 'the resting ball launches when the lane opens').toBeDefined();
		expect(result.statesByTick.get(t + 50)!.players[0]!.ballNumber, 'it plays as ball 1').toBe(1);
	});
});

describe('AC 8 (v) -- a mid-game rotation with the lane already occupied never re-serves; an empty lane still does (same test)', () => {
	it('drain at D with bd_shooter [true]: ball_ended and ball_will_start at D, no c_trough_eject; the lane opening at D+20 yields ball_launched with ballNumber 2. The same script with bd_shooter [false] pulses at D', () => {
		const D = 10;

		const occupied = runRulesScript(close('s_trough_1').at(D).open('s_shooter_lane').at(D + 20).build(), {
			durationTicks: D + 25,
			initialState: midGameState(true, 1),
		});
		const eventsAtD = occupied.events.filter((e) => e.tick === D).map((e) => e.type);
		expect(eventsAtD).toContain('ball_ended');
		expect(eventsAtD).toContain('ball_will_start');
		expect(occupied.coilCommands.some((c) => c.tick === D && c.coil === TROUGH_EJECT_COIL), 'no serve into the occupied lane').toBe(false);
		const launched = occupied.events.find((e) => e.tick === D + 20 && e.type === 'ball_launched');
		expect(launched).toBeDefined();
		expect(occupied.statesByTick.get(D + 20)!.players[0]!.ballNumber, 'the resting ball plays as ball 2').toBe(2);

		const empty = runRulesScript(close('s_trough_1').at(D).build(), {
			durationTicks: D + 5,
			initialState: midGameState(false, 1),
		});
		expect(empty.coilCommands.some((c) => c.tick === D && c.coil === TROUGH_EJECT_COIL), 'the positive: an empty lane at the ball start is served normally').toBe(true);
	});
});

describe('AC 8 (vi) -- the Start-tick drain guard: a parking entry on the exact tick Start creates a game never ends that new ball; the identical closure in an ongoing game still ends it', () => {
	it('Start and a trough-slot close on the same tick yield no ball_ended; the same close in phase "game" yields ball_ended', () => {
		const t = 5;
		const onStartTick = runRulesScript(close('s_start').at(t).close('s_trough_1').at(t).build(), {
			durationTicks: t + 2,
			initialState: attractStaleState(),
		});
		expect(onStartTick.events.some((e) => e.tick === t && e.type === 'ball_ended'), 'the brand-new ball 1 must never be ended by a stray parking entry sharing the Start tick').toBe(false);
		expect(onStartTick.statesByTick.get(t)!.phase).toBe('game');

		const inGame = runRulesScript(close('s_trough_1').at(t).build(), {
			durationTicks: t + 2,
			initialState: midGameState(false, 1),
		});
		expect(inGame.events.some((e) => e.tick === t && e.type === 'ball_ended'), 'the control: the identical closure in an ONGOING game genuinely ends the ball').toBe(true);
	});
});
