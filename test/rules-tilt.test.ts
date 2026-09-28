// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.11: the headless rules tests for the tilt controller
// (`src/sim/rules/tilt.ts`) -- the I/O & Edge-Case Matrix rows and ACs 1-8,
// driven through `runRulesScript()` (`test/util/switch-script.ts`) with
// `close('s_tilt_bob')`/`close('s_slam_tilt')` scripts. No physics, no
// rendering, no `sim/loop` (AC 9's own headless claim -- this file's path is
// added to `test/rules-devices-headless.test.ts`'s ENTRY_FILES).
//
// Every tick offset below is authored as a literal at the probe, pinned at
// PRODUCTION tuning magnitude (`tiltWarningSpacingTicks` 500,
// `tiltSettleTicks` 3000 at the shipped `TICK_HZ`) -- this file never
// overrides either tunable. The only overrides used are `NO_BALL_SAVE_TUNING`
// (touches `ballSaveMs`/`ballSaveGraceMs` only) and `runRulesScript`'s
// `adjustments` option (a settings axis, not a tuning override) to reach the
// `tiltWarnings: 0` and `tiltWarnings: 2` cases (epic vacuity #43).

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { HARDWARE_COILS } from '../src/sim/rules/ball-controller';
import { createTiltController } from '../src/sim/rules/tilt';
import { lampsOf } from '../src/sim/rules/lamps';
import { close, runRulesScript } from './util/switch-script';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { BallSaveState, PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineState } from '../src/sim/table/names';

const TROUGH_EJECT_COIL = TABLE.ballDevices.bd_trough.ejectCoil;
const SHOOTER_LAUNCH_COIL = (() => {
	const step = TABLE.ballDevices.bd_shooter.ballSearchOrder.find((candidate) => candidate.action === 'pulse');
	if (!step) {
		throw new Error('test setup: bd_shooter.ballSearchOrder has no "pulse" step');
	}
	return step.coil;
})();

/**
 * Story 2.9: several scripts below drain and re-serve the SAME ball only a
 * few ticks apart -- comfortably inside the production ball-save window,
 * which would otherwise turn a scripted drain into a SAVE (this file's own
 * DW-222 scenario is the one place that live save window is the POINT --
 * that describe block builds its own explicit ballSave state instead of
 * using this override). An override tuning with the window and grace both
 * shrunk to near-zero keeps the tilt windows themselves at production
 * magnitude -- only ball-save timing (incidental to what this file covers)
 * changes.
 */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

const PRODUCTION_TUNING = resolveTuning();
const TILT_WARNING_SPACING_TICKS = PRODUCTION_TUNING.tiltWarningSpacingTicks.value;
const TILT_SETTLE_TICKS = PRODUCTION_TUNING.tiltSettleTicks.value;

/** Sanity: this file's own literal offsets below assume these two production magnitudes -- if either tunable's SHIPPED value ever moves, this file's authored literals stop meaning what their own comments claim, and this guard fails loudly rather than the rest of the file silently testing something else. */
it('sanity: the production tilt windows are the magnitudes this file\'s own literal offsets assume', () => {
	expect(TILT_WARNING_SPACING_TICKS).toBe(500);
	expect(TILT_SETTLE_TICKS).toBe(3000);
});

function adjustments(tiltWarnings: number): GameAdjustments {
	return { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings, ballsPerGame: 3, matchProbability: 0.08 };
}

/** A fresh empty player, mirroring `ball-controller.ts`'s own `emptyPlayer()` -- the established test-local idiom. */
function emptyPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
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

/** A mid-game two-player `GameState`, currentPlayer 0 -- the established headless pattern (`test/rules-ball-save.test.ts`'s own `midGameState()`) for exercising the tilt controller without driving a whole Start-to-here script. */
function gameState(overrides: {
	readonly currentPlayer?: number;
	readonly players?: readonly PlayerState[];
	readonly machine?: Partial<MachineState>;
	readonly modes?: GameState['modes'];
	readonly phase?: GameState['phase'];
} = {}): GameState {
	return {
		tick: 0,
		phase: overrides.phase ?? 'game',
		machine: machine(overrides.machine ?? {}),
		players: overrides.players ?? [emptyPlayer({ ballNumber: 2 }), emptyPlayer({ ballNumber: 0 })],
		currentPlayer: overrides.currentPlayer ?? 0,
		modes: overrides.modes ?? [{ mode: 'stub', priority: 100, player: 0 }],
		rng: 0,
	};
}

describe('AC 1 -- a bob closure warns the current player, and the bob\'s own swing does not warn twice', () => {
	it('exactly one tilt_warning at T; three further closures at T+15/T+30/T+45 (the bob\'s own measured oscillation) are all ignored; no CoilCommand at all', () => {
		const initial = gameState();
		const T = 100;
		const script = close('s_tilt_bob').at(T).at(T + 15).at(T + 30).at(T + 45).build();
		const result = runRulesScript(script, { durationTicks: T + 100, initialState: initial });

		const warnings = result.events.filter((e) => e.type === 'tilt_warning');
		expect(warnings, 'exactly one tilt_warning, at T -- the burst must be discriminating, not merely absent by construction').toEqual([
			{ type: 'tilt_warning', player: 0, remaining: 0, tick: T },
		]);
		expect(result.events.some((e) => e.type === 'tilt'), 'the burst must not tilt the machine').toBe(false);
		expect(result.finalState.players[0]!.tiltWarnings).toBe(1);
		expect(result.finalState.machine.tilt.tilted).toBe(false);
		expect(result.finalState.machine.hardwareEnabled, 'hardware must stay enabled -- no tilt occurred').toBe(true);
		expect(result.coilCommands, 'no CoilCommand of any kind on a mere warning burst').toEqual([]);
	});

	// QA gap closure (Task 13 / AC 5's second clause: "every other assertion in
	// this story re-run at currentPlayer 1 as well as 0"). Identical script,
	// currentPlayer 1 -- proves the warning lands on `players[currentPlayer]`,
	// not a hardcoded `players[0]`.
	it('re-run at currentPlayer 1: exactly one tilt_warning at T for player 1; player 0 untouched', () => {
		const initial = gameState({ currentPlayer: 1 });
		const T = 100;
		const script = close('s_tilt_bob').at(T).at(T + 15).at(T + 30).at(T + 45).build();
		const result = runRulesScript(script, { durationTicks: T + 100, initialState: initial });

		const warnings = result.events.filter((e) => e.type === 'tilt_warning');
		expect(warnings, 'exactly one tilt_warning, for player 1').toEqual([
			{ type: 'tilt_warning', player: 1, remaining: 0, tick: T },
		]);
		expect(result.events.some((e) => e.type === 'tilt'), 'the burst must not tilt the machine').toBe(false);
		expect(result.finalState.players[1]!.tiltWarnings).toBe(1);
		expect(result.finalState.players[0]!.tiltWarnings, 'player 0 (not currentPlayer) must be untouched').toBe(0);
		expect(result.finalState.machine.tilt.tilted).toBe(false);
		expect(result.finalState.machine.hardwareEnabled, 'hardware must stay enabled -- no tilt occurred').toBe(true);
		expect(result.coilCommands, 'no CoilCommand of any kind on a mere warning burst').toEqual([]);
	});

	// Code review finding (Blind Hunter): AC 1's own burst offsets (T+15/30/45)
	// and AC 2's own offsets (T+600, T+3100) all sit comfortably PAST their
	// respective window, never AT the exact `>=` boundary the implementation
	// actually compares against -- an off-by-one regression (`>` swapped for
	// `>=`) could slip past the suite entirely. Isolated from the SETTLE
	// window by using the TILT path (which checks only `eligible`, never
	// `settled`): the first closure counts a warning that already equals
	// `adjustments.tiltWarnings`, so the second closure's own eligibility --
	// gated ONLY by the spacing window -- is what decides tilt vs nothing.
	it('the spacing window boundary is inclusive: EXACTLY T+500 (tiltWarningSpacingTicks) is eligible and tilts; T+499 is not', () => {
		const T = 100;
		const initial = gameState({ players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()] });

		const belowBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 499).build(), {
			durationTicks: T + 500,
			initialState: initial,
			adjustments: adjustments(1),
		});
		expect(belowBoundary.finalState.players[0]!.tiltWarnings, 'the first closure counts a warning (0 -> 1)').toBe(1);
		expect(belowBoundary.finalState.machine.tilt.tilted, 'T+499 is ONE TICK SHORT of tiltWarningSpacingTicks (500) -- ineligible, no tilt').toBe(false);

		const atBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 500).build(), {
			durationTicks: T + 501,
			initialState: initial,
			adjustments: adjustments(1),
		});
		expect(
			atBoundary.events,
			'EXACTLY T+500 is eligible (the >= comparison is inclusive) -- tiltWarnings already equals the adjustment, so this closure tilts',
		).toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: T + 500 }]));
		expect(atBoundary.finalState.machine.tilt.tilted).toBe(true);
	});

	// QA gap closure (Task 13 / AC 5's second clause). This twin is the one
	// that also demonstrates a SECOND mutation the currentPlayer-0 suite
	// cannot: `events.push({ type: 'tilt', player: playerIndex, tick })`
	// mutated to a hardcoded `player: 0` would leave every currentPlayer-0
	// assertion green (0 === 0) but must redden here, where the expected
	// `player` field is 1.
	it('re-run at currentPlayer 1: the spacing window boundary is inclusive for player 1 -- EXACTLY T+500 tilts, T+499 does not', () => {
		const T = 100;
		const initial = gameState({ currentPlayer: 1, players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 0, ballNumber: 2 })] });

		const belowBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 499).build(), {
			durationTicks: T + 500,
			initialState: initial,
			adjustments: adjustments(1),
		});
		expect(belowBoundary.finalState.players[1]!.tiltWarnings, 'the first closure counts a warning (0 -> 1) for player 1').toBe(1);
		expect(belowBoundary.finalState.players[0]!.tiltWarnings, 'player 0 untouched').toBe(0);
		expect(belowBoundary.finalState.machine.tilt.tilted, 'T+499 is ONE TICK SHORT of tiltWarningSpacingTicks (500) -- ineligible, no tilt').toBe(false);

		const atBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 500).build(), {
			durationTicks: T + 501,
			initialState: initial,
			adjustments: adjustments(1),
		});
		expect(
			atBoundary.events,
			'EXACTLY T+500 is eligible for player 1 -- the tilt event\'s own player field must read 1, never a hardcoded 0',
		).toEqual(expect.arrayContaining([{ type: 'tilt', player: 1, tick: T + 500 }]));
		expect(atBoundary.finalState.machine.tilt.tilted).toBe(true);
	});
});

describe('AC 2 -- the settle window gates the next warning, at production magnitude', () => {
	it('a second closure at T+600 (past spacing, inside settle) is ignored; at T+3100 it counts', () => {
		const T = 100;
		const initial = gameState({ players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()] });
		const script = close('s_tilt_bob').at(T).at(T + 600).at(T + 3100).build();
		const result = runRulesScript(script, { durationTicks: T + 3200, initialState: initial, adjustments: adjustments(2) });

		const atT = result.statesByTick.get(T)!;
		expect(atT.players[0]!.tiltWarnings, 'the first closure counts').toBe(1);

		const at600 = result.statesByTick.get(T + 600)!;
		expect(at600.players[0]!.tiltWarnings, 'inside tiltSettleTicks of the last COUNTED warning: ignored').toBe(1);
		expect(result.events.filter((e) => e.tick === T + 600), 'no event at all at T+600').toEqual([]);

		const at3100 = result.statesByTick.get(T + 3100)!;
		expect(at3100.players[0]!.tiltWarnings, 'past tiltSettleTicks: the second warning counts').toBe(2);
		expect(result.events.filter((e) => e.tick === T + 3100)).toEqual([{ type: 'tilt_warning', player: 0, remaining: 0, tick: T + 3100 }]);
	});

	// QA gap closure (Task 13 / AC 5's second clause).
	it('re-run at currentPlayer 1: a second closure at T+600 is ignored for player 1; at T+3100 it counts', () => {
		const T = 100;
		const initial = gameState({ currentPlayer: 1, players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 0, ballNumber: 2 })] });
		const script = close('s_tilt_bob').at(T).at(T + 600).at(T + 3100).build();
		const result = runRulesScript(script, { durationTicks: T + 3200, initialState: initial, adjustments: adjustments(2) });

		const atT = result.statesByTick.get(T)!;
		expect(atT.players[1]!.tiltWarnings, 'the first closure counts, for player 1').toBe(1);

		const at600 = result.statesByTick.get(T + 600)!;
		expect(at600.players[1]!.tiltWarnings, 'inside tiltSettleTicks of the last COUNTED warning: ignored').toBe(1);
		expect(result.events.filter((e) => e.tick === T + 600), 'no event at all at T+600').toEqual([]);

		const at3100 = result.statesByTick.get(T + 3100)!;
		expect(at3100.players[1]!.tiltWarnings, 'past tiltSettleTicks: the second warning counts, for player 1').toBe(2);
		expect(result.events.filter((e) => e.tick === T + 3100)).toEqual([{ type: 'tilt_warning', player: 1, remaining: 0, tick: T + 3100 }]);
		expect(result.finalState.players[0]!.tiltWarnings, 'player 0 untouched throughout').toBe(0);
	});

	// Code review finding (Blind Hunter), the settle-window sibling of AC 1's
	// own spacing-boundary test above: adjustments(3) keeps this well below
	// the TILT threshold (both warnings stay in the warning path, which DOES
	// check `settled`), and both offsets below are comfortably past
	// tiltWarningSpacingTicks (500) so spacing is never in question -- only
	// the settle window's own `>=` boundary is exercised.
	it('the settle window boundary is inclusive: EXACTLY T+3000 (tiltSettleTicks) counts a second warning; T+2999 does not', () => {
		const T = 100;
		const initial = gameState({ players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()] });

		const belowBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 2999).build(), {
			durationTicks: T + 3000,
			initialState: initial,
			adjustments: adjustments(3),
		});
		expect(
			belowBoundary.finalState.players[0]!.tiltWarnings,
			'T+2999 is ONE TICK SHORT of tiltSettleTicks (3000) since the last COUNTED warning -- ignored',
		).toBe(1);

		const atBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 3000).build(), {
			durationTicks: T + 3001,
			initialState: initial,
			adjustments: adjustments(3),
		});
		expect(atBoundary.finalState.players[0]!.tiltWarnings, 'EXACTLY T+3000 is settled (the >= comparison is inclusive) -- the second warning counts').toBe(2);
		expect(atBoundary.events).toEqual(expect.arrayContaining([{ type: 'tilt_warning', player: 0, remaining: 1, tick: T + 3000 }]));
	});

	// QA gap closure (Task 13 / AC 5's second clause).
	it('re-run at currentPlayer 1: the settle window boundary is inclusive for player 1', () => {
		const T = 100;
		const initial = gameState({ currentPlayer: 1, players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 0, ballNumber: 2 })] });

		const belowBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 2999).build(), {
			durationTicks: T + 3000,
			initialState: initial,
			adjustments: adjustments(3),
		});
		expect(
			belowBoundary.finalState.players[1]!.tiltWarnings,
			'T+2999 is ONE TICK SHORT of tiltSettleTicks (3000) since the last COUNTED warning -- ignored',
		).toBe(1);

		const atBoundary = runRulesScript(close('s_tilt_bob').at(T).at(T + 3000).build(), {
			durationTicks: T + 3001,
			initialState: initial,
			adjustments: adjustments(3),
		});
		expect(atBoundary.finalState.players[1]!.tiltWarnings, 'EXACTLY T+3000 is settled -- the second warning counts, for player 1').toBe(2);
		expect(atBoundary.events).toEqual(expect.arrayContaining([{ type: 'tilt_warning', player: 1, remaining: 1, tick: T + 3000 }]));
	});
});

describe('I/O matrix -- "Eligible again" and "Zero-warning machine"', () => {
	it('a closure past the spacing window, with tiltWarnings already at the adjustment, tilts -- no warning first', () => {
		const initial = gameState({ players: [emptyPlayer({ tiltWarnings: 1, ballNumber: 2 }), emptyPlayer()] });
		const T = 600;
		const result = runRulesScript(close('s_tilt_bob').at(T).build(), { durationTicks: T + 10, initialState: initial, adjustments: adjustments(1) });

		expect(result.events).toEqual(
			expect.arrayContaining([{ type: 'tilt', player: 0, tick: T }]),
		);
		expect(result.events.some((e) => e.type === 'tilt_warning'), 'no warning first -- the count already equals the adjustment').toBe(false);
		expect(result.finalState.machine.tilt.tilted).toBe(true);
	});

	it('adjustments.tiltWarnings: 0 tilts on the very first eligible closure, with no warning ever', () => {
		const initial = gameState({ players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()] });
		const result = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: initial, adjustments: adjustments(0) });

		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: 1 }]));
		expect(result.events.some((e) => e.type === 'tilt_warning')).toBe(false);
	});

	// QA gap closure (Task 13 / AC 5's second clause): both matrix rows
	// re-run at currentPlayer 1.
	it('re-run at currentPlayer 1: a closure past the spacing window, tiltWarnings already at the adjustment, tilts player 1 -- no warning first', () => {
		const initial = gameState({ currentPlayer: 1, players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 1, ballNumber: 2 })] });
		const T = 600;
		const result = runRulesScript(close('s_tilt_bob').at(T).build(), { durationTicks: T + 10, initialState: initial, adjustments: adjustments(1) });

		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt', player: 1, tick: T }]));
		expect(result.events.some((e) => e.type === 'tilt_warning'), 'no warning first -- the count already equals the adjustment').toBe(false);
		expect(result.finalState.machine.tilt.tilted).toBe(true);
	});

	it('re-run at currentPlayer 1: adjustments.tiltWarnings: 0 tilts player 1 on the very first eligible closure, with no warning ever', () => {
		const initial = gameState({ currentPlayer: 1, players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 0, ballNumber: 2 })] });
		const result = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: initial, adjustments: adjustments(0) });

		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt', player: 1, tick: 1 }]));
		expect(result.events.some((e) => e.type === 'tilt_warning')).toBe(false);
	});
});

describe('AC 3 -- the tilt disables the hardware set, disarms every ball-save source, and suppresses the autolaunch', () => {
	it('an eligible closure with tiltWarnings already at the adjustment: tilt fires, hardware disables (every HARDWARE_COILS coil), ballSave is fully disarmed (two seeded sources), and no c_autolaunch pulse follows -- against an untilted control that DOES pulse it', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 1, ballNumber: 2 }), emptyPlayer()],
			machine: { ballSave: { untilTick: 5000, sources: ['ball-controller', 'seeded-second'] } },
		});
		const T = 100;
		const script = close('s_tilt_bob').at(T).build();
		const result = runRulesScript(script, { durationTicks: T + 50, initialState: initial, adjustments: adjustments(1) });

		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: T }]));
		expect(result.finalState.machine.tilt.tilted).toBe(true);
		expect(result.finalState.machine.hardwareEnabled).toBe(false);
		expect(result.finalState.machine.ballSave, 'every source removed, not just the controller\'s own').toEqual({ untilTick: null, sources: [] });

		const disabledAtT = new Set(result.coilCommands.filter((c) => c.tick === T && c.action === 'disable').map((c) => c.coil));
		for (const coil of HARDWARE_COILS) {
			expect(disabledAtT.has(coil), `${coil} must receive a disable CoilCommand on the tilt tick`).toBe(true);
		}
		expect(HARDWARE_COILS.length, 'sanity: the hardware set is non-empty, or the loop above is vacuous').toBeGreaterThan(0);
		// Code review (Story 2.11, Rule 19): the autolaunch clause used to be
		// asserted on THIS run, which has no drain and no re-serve -- nothing
		// could ever pulse c_autolaunch here, so the silence held whatever the
		// ball controller's `!tilt.tilted` guard did (removing that guard left
		// this test green), and its "control" was a different script. The
		// clause is now asserted on a run where the autolaunch IS reachable: a
		// live two-source save re-serves a drained ball, the tilt lands before
		// the re-served ball arrives, and the control is the IDENTICAL script
		// minus the bob closure.
		const serveScript = (withTilt: boolean) => {
			const builder = close(TABLE.ballDevices.bd_trough.slots[3]).at(1);
			return (withTilt ? builder.close('s_tilt_bob').at(51) : builder).close('s_shooter_lane').at(201).build();
		};
		const serveInitial = gameState({
			players: [emptyPlayer({ tiltWarnings: 1, ballNumber: 2 }), emptyPlayer()],
			machine: { ballsInPlay: 1, ballSave: { untilTick: 5000, sources: ['ball-controller', 'seeded-second'] } },
		});
		const tilted = runRulesScript(serveScript(true), { durationTicks: 260, initialState: serveInitial, adjustments: adjustments(1) });
		expect(tilted.events.filter((e) => e.type === 'ball_saved'), 'sanity: the drain is genuinely saved and re-served').toHaveLength(1);
		expect(tilted.events, 'sanity: the closure genuinely tilts before the re-served ball arrives').toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: 51 }]));
		expect(
			tilted.coilCommands.some((c) => c.tick >= 51 && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'no c_autolaunch pulse on the tilt tick or any later tick of the run',
		).toBe(false);

		const control = runRulesScript(serveScript(false), { durationTicks: 260, initialState: serveInitial, adjustments: adjustments(1) });
		expect(
			control.coilCommands.some((c) => c.tick === 201 && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'control: the IDENTICAL script minus the bob closure DOES pulse c_autolaunch on the re-served ball\'s arrival',
		).toBe(true);
	});

	// QA gap closure (Task 13 / AC 5's second clause). Re-run at currentPlayer
	// 1: the machine-scoped assertions (hardware disable, ballSave disarm)
	// cannot distinguish currentPlayer by construction, but the `tilt` event's
	// own `player` field can and must read 1 -- the untilted c_autolaunch
	// control is not re-run here (it is player-agnostic and already proven by
	// the currentPlayer-0 test above).
	it('re-run at currentPlayer 1: tilt fires for player 1, hardware disables, ballSave is fully disarmed', () => {
		const initial = gameState({
			currentPlayer: 1,
			players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 1, ballNumber: 2 })],
			machine: { ballSave: { untilTick: 5000, sources: ['ball-controller', 'seeded-second'] } },
		});
		const T = 100;
		const script = close('s_tilt_bob').at(T).build();
		const result = runRulesScript(script, { durationTicks: T + 50, initialState: initial, adjustments: adjustments(1) });

		expect(result.events, 'the tilt event\'s player field must read 1, never a hardcoded 0').toEqual(expect.arrayContaining([{ type: 'tilt', player: 1, tick: T }]));
		expect(result.finalState.machine.tilt.tilted).toBe(true);
		expect(result.finalState.machine.hardwareEnabled).toBe(false);
		expect(result.finalState.machine.ballSave, 'every source removed, not just the controller\'s own').toEqual({ untilTick: null, sources: [] });

		const disabledAtT = new Set(result.coilCommands.filter((c) => c.tick === T && c.action === 'disable').map((c) => c.coil));
		for (const coil of HARDWARE_COILS) {
			expect(disabledAtT.has(coil), `${coil} must receive a disable CoilCommand on the tilt tick`).toBe(true);
		}
		expect(HARDWARE_COILS.length, 'sanity: the hardware set is non-empty, or the loop above is vacuous').toBeGreaterThan(0);
	});

	// Code review (Story 2.11): retitled -- `runRulesScript()` cannot observe
	// reference identity (the next test does, against the controller) -- and
	// the closure is now proven to have genuinely tilted, or the empty
	// ballSave below would hold whether or not the disarm fold ever ran.
	it('nothing armed: a genuine tilt through the full rules pipeline leaves ballSave empty (reference identity is the next test\'s)', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			machine: { ballSave: { untilTick: null, sources: [] } },
		});
		const result = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: initial, adjustments: adjustments(0) });
		expect(result.events, 'sanity: the closure must genuinely tilt (adjustments.tiltWarnings: 0)').toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: 1 }]));
		expect(result.finalState.machine.ballSave).toEqual({ untilTick: null, sources: [] });
	});

	// Driven directly against `createTiltController()`, not `runRulesScript()`
	// -- `sim/rules/index.ts`'s own `step()` always rebuilds a fresh top-level
	// `GameState` wrapper every tick (this file's AC 6 "same reference" test
	// makes the identical point), so only the layer that actually makes the
	// no-op promise -- `disarmAllBallSave`'s zero-iteration fold over an
	// EMPTY `sources` array, `tilt.ts`'s own contract -- can be observed to
	// return the SAME `BallSaveState` object, not merely an equal one.
	it('nothing armed, driven directly against the controller: the returned machine.ballSave is the IDENTICAL object reference, not merely deep-equal', () => {
		const emptyBallSave: BallSaveState = { untilTick: null, sources: [] };
		const controller = createTiltController(adjustments(0), PRODUCTION_TUNING);
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			machine: { ballSave: emptyBallSave },
		});
		const result = controller.step(initial, [{ type: 'tilt_bob_closed', tick: 1 }], 1);

		expect(result.state.machine.tilt.tilted, 'sanity: this closure must genuinely tilt (adjustments.tiltWarnings: 0), or the disarm fold never runs and the reference check below is vacuous').toBe(true);
		expect(result.state.machine.ballSave, 'the disarm fold on an already-empty ballSave must return the SAME reference').toBe(emptyBallSave);
	});
});

describe('AC 4 -- a tilted ball ends, pays nothing, and the next ball starts clean', () => {
	// Task 9's own coil-ordering claim ("the tilt's disables precede
	// startBall()'s enables in the SAME batch") is only observable when the
	// tilting closure and the drain that ends the ball land in the SAME
	// tick's device-event batch -- exactly the physical scenario a violent
	// slam-adjacent nudge produces (the bob crosses threshold and the ball
	// leaves the playfield in the same tick). `sim/rules/index.ts` runs the
	// tilt controller before the ball controller on every tick (task 9), so
	// this tick's tilt is already true by the time the SAME tick's drain
	// branch reads it.
	it('bonus forfeited to total:0 (real bonusByCategory/multiplier still carried), no bonus_count_step, score unchanged, and the next ball starts in the SAME batch with the tilt\'s disables preceding startBall()\'s enables', () => {
		// Earn a real, nonzero bonus (two DRAGON-bank letters) BEFORE the tilt.
		// Code review finding (Verification Gap Reviewer): `tiltWarnings` is
		// seeded NONZERO (was 0) so the "unchanged by the rotation" assertion
		// below cannot pass merely because a broken reset ALSO produces 0 --
		// vacuity #51's exact shape.
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 3, ballNumber: 2 }), emptyPlayer({ tiltWarnings: 2 })],
			machine: { ballsInPlay: 1 },
		});
		const tiltAndDrainTick = 10;
		// Code review finding (Verification Gap Reviewer): the ORIGINAL window
		// here (+30 ticks) ended 370 ticks before bonusCountTicks (400 at
		// production magnitude, sim/table/tuning.ts's own `bonusCountMs: 400`),
		// the EARLIEST tick `armBonusCountSchedule()` could ever due a first
		// `bonus_count_step` -- so "no bonus_count_step" held regardless of
		// whether the tilted branch actually skipped arming the schedule
		// (vacuity #51's exact shape: a silence that holds for a reason
		// unrelated to the code under test). `+1300` matches
		// test/rules-bonus.test.ts's own "AC 5 -- a tilted ball forfeits the
		// bonus" precedent for the identical claim, comfortably past every
		// possible due tick (at most 4 steps x 400 ticks = 1600 past the drain).
		const durationTicks = tiltAndDrainTick + 1300;
		const script = close(TABLE.dropBankWiring.d.switch).at(1)
			.close(TABLE.dropBankWiring.r.switch).at(2)
			.close('s_tilt_bob').at(tiltAndDrainTick)
			.close(TABLE.ballDevices.bd_trough.slots[3]).at(tiltAndDrainTick)
			.build();
		const result = runRulesScript(script, { durationTicks, initialState: initial, adjustments: adjustments(0), tuning: NO_BALL_SAVE_TUNING });

		expect(result.events, 'the closure must genuinely tilt at tiltWarnings: 3, adjustments.tiltWarnings: 0').toEqual(
			expect.arrayContaining([{ type: 'tilt', player: 0, tick: tiltAndDrainTick }]),
		);

		const ballEnded = result.events.find((e) => e.type === 'ball_ended' && e.tick === tiltAndDrainTick);
		expect(ballEnded, 'the SAME tick\'s drain must genuinely end the ball').toBeDefined();
		if (!ballEnded || ballEnded.type !== 'ball_ended') {
			throw new Error('unreachable: filtered above');
		}
		expect(ballEnded.total, 'a tilted ball pays nothing').toBe(0);
		expect(ballEnded.tilted).toBe(true);
		expect(ballEnded.bonusByCategory.letters, 'the REAL earned letters must still be carried on the payload, beside total: 0').toBe(2);
		expect(
			result.events.some((e) => e.type === 'bonus_count_step'),
			`a tilted end must never arm the count-up, over a ${durationTicks}-tick window long enough for one to genuinely have appeared`,
		).toBe(false);
		expect(result.statesByTick.get(tiltAndDrainTick)!.players[0]!.score, 'score must be byte-identical to its pre-drain value').toBe(0);

		const eventsAtDrainTick = result.events.filter((e) => e.tick === tiltAndDrainTick).map((e) => e.type);
		expect(eventsAtDrainTick, 'ball_will_start (the rotation) must land on the SAME tick as ball_ended').toContain('ball_will_start');

		const afterDrain = result.statesByTick.get(tiltAndDrainTick)!;
		expect(afterDrain.machine.tilt, 'ball_will_start resets machine.tilt for the next ball').toEqual({ tilted: false, slamTilted: false });
		expect(afterDrain.machine.hardwareEnabled, 'ball_starting restores hardwareEnabled').toBe(true);
		expect(afterDrain.players[0]!.tiltWarnings, 'tiltWarnings is UNCHANGED by the rotation -- seeded nonzero (3) so this cannot pass by an accidental reset to 0').toBe(3);
		// Code review (Story 2.11, Rule 19): the assertion above reads the
		// ENDING player, whom `startBall()` never touches on a 0 -> 1 rotation
		// -- a reset written into `startBall()` lands on the STARTING player,
		// and left this test green. The starting player is seeded nonzero too
		// and must come through `ball_will_start` unchanged.
		expect(afterDrain.currentPlayer, 'sanity: the rotation genuinely started player 1').toBe(1);
		expect(afterDrain.players[1]!.tiltWarnings, 'the STARTING player\'s own warnings are also untouched by ball_will_start (seeded 2)').toBe(2);

		const commandsAtDrainTick = result.coilCommands.filter((c) => c.tick === tiltAndDrainTick);
		const disableIndices = new Map(HARDWARE_COILS.map((coil) => [coil, commandsAtDrainTick.findIndex((c) => c.coil === coil && c.action === 'disable')]));
		const enableIndices = new Map(HARDWARE_COILS.map((coil) => [coil, commandsAtDrainTick.findIndex((c) => c.coil === coil && c.action === 'enable')]));
		for (const coil of HARDWARE_COILS) {
			const disableAt = disableIndices.get(coil)!;
			const enableAt = enableIndices.get(coil)!;
			expect(disableAt, `${coil} must receive a disable on the tilt-and-drain tick, from the tilt itself`).toBeGreaterThanOrEqual(0);
			expect(enableAt, `${coil} must receive an enable on the SAME tick, from the rotation's own startBall()`).toBeGreaterThanOrEqual(0);
			expect(enableAt, 'the enable must be ORDERED AFTER the disable in the same batch, so the enable wins').toBeGreaterThan(disableAt);
		}
	});

	// Code review finding (Verification Gap Reviewer): the spec's own AC 4
	// text requires this control explicitly ("with the run establishing that
	// an untilted control ball at the same tuning DOES emit them") -- it was
	// missing entirely, and the assertion above cannot be read as
	// discriminating without it (vacuity #51).
	it('untilted control: the identical script and duration, minus the tilt closure, DOES emit bonus_count_step for the SAME earned bonus -- proving the silence above is discriminating', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			machine: { ballsInPlay: 1 },
		});
		const drainTick = 10;
		const durationTicks = drainTick + 1300;
		const script = close(TABLE.dropBankWiring.d.switch).at(1)
			.close(TABLE.dropBankWiring.r.switch).at(2)
			.close(TABLE.ballDevices.bd_trough.slots[3]).at(drainTick)
			.build();
		const result = runRulesScript(script, { durationTicks, initialState: initial, adjustments: adjustments(0), tuning: NO_BALL_SAVE_TUNING });

		const ballEnded = result.events.find((e) => e.type === 'ball_ended' && e.tick === drainTick);
		expect(ballEnded, 'sanity: the SAME earned bonus must genuinely reach ball_ended, untilted').toBeDefined();
		if (!ballEnded || ballEnded.type !== 'ball_ended') {
			throw new Error('unreachable: filtered above');
		}
		expect(ballEnded.tilted, 'sanity: this control run is genuinely untilted').toBe(false);
		expect(ballEnded.total, 'sanity: the SAME earned bonus pays a real, nonzero total when untilted').toBeGreaterThan(0);
		expect(
			result.events.some((e) => e.type === 'bonus_count_step'),
			'untilted, the SAME earned bonus DOES arm and emit the count-up -- proving the tilted case\'s own silence is a real suppression, not an accident of the window',
		).toBe(true);
	});

	// QA gap closure (Task 13 / AC 5's second clause). currentPlayer 1 is the
	// ENDING player here: with two players, endingPlayer 1 IS the last player
	// (isLastPlayer true), so rotation wraps to player 0 rather than advancing
	// to 1 -- a genuinely different rotation branch than the currentPlayer-0
	// test above (which advances 0 -> 1). ballNumber is seeded at 2 (<
	// adjustments.ballsPerGame: 3) so this drain does not end the game.
	it('re-run at currentPlayer 1 (the ending AND last player -- rotation wraps to player 0): tilt fires for player 1, tiltWarnings unchanged by the rotation, hardware disables precede the next ball\'s enables', () => {
		const initial = gameState({
			currentPlayer: 1,
			players: [emptyPlayer({ tiltWarnings: 2, ballNumber: 0 }), emptyPlayer({ tiltWarnings: 3, ballNumber: 2 })],
			machine: { ballsInPlay: 1 },
		});
		const tiltAndDrainTick = 10;
		const durationTicks = tiltAndDrainTick + 1300;
		const script = close(TABLE.dropBankWiring.d.switch).at(1)
			.close(TABLE.dropBankWiring.r.switch).at(2)
			.close('s_tilt_bob').at(tiltAndDrainTick)
			.close(TABLE.ballDevices.bd_trough.slots[3]).at(tiltAndDrainTick)
			.build();
		const result = runRulesScript(script, { durationTicks, initialState: initial, adjustments: adjustments(0), tuning: NO_BALL_SAVE_TUNING });

		expect(result.events, 'the closure must genuinely tilt player 1 at tiltWarnings: 3, adjustments.tiltWarnings: 0').toEqual(
			expect.arrayContaining([{ type: 'tilt', player: 1, tick: tiltAndDrainTick }]),
		);

		const ballEnded = result.events.find((e) => e.type === 'ball_ended' && e.tick === tiltAndDrainTick);
		expect(ballEnded, 'the SAME tick\'s drain must genuinely end player 1\'s ball').toBeDefined();
		if (!ballEnded || ballEnded.type !== 'ball_ended') {
			throw new Error('unreachable: filtered above');
		}
		expect(ballEnded.player, 'the ending player must be 1').toBe(1);
		expect(ballEnded.total, 'a tilted ball pays nothing').toBe(0);
		expect(ballEnded.tilted).toBe(true);
		expect(ballEnded.bonusByCategory.letters, 'the REAL earned letters must still be carried on the payload, beside total: 0').toBe(2);
		expect(
			result.events.some((e) => e.type === 'bonus_count_step'),
			'a tilted end must never arm the count-up',
		).toBe(false);

		const afterDrain = result.statesByTick.get(tiltAndDrainTick)!;
		expect(afterDrain.machine.tilt, 'ball_will_start resets machine.tilt for the next ball').toEqual({ tilted: false, slamTilted: false });
		expect(afterDrain.machine.hardwareEnabled, 'ball_starting restores hardwareEnabled').toBe(true);
		expect(afterDrain.players[1]!.tiltWarnings, 'tiltWarnings is UNCHANGED by the rotation -- seeded nonzero (3) so this cannot pass by an accidental reset to 0').toBe(3);
		expect(afterDrain.currentPlayer, 'player 1 is the LAST player -- rotation wraps to player 0, not to a nonexistent player 2').toBe(0);
		expect(afterDrain.players[0]!.tiltWarnings, 'code review (Rule 19): the STARTING player (0, after the wrap) keeps its own seeded warnings through ball_will_start').toBe(2);

		const commandsAtDrainTick = result.coilCommands.filter((c) => c.tick === tiltAndDrainTick);
		const disableIndices = new Map(HARDWARE_COILS.map((coil) => [coil, commandsAtDrainTick.findIndex((c) => c.coil === coil && c.action === 'disable')]));
		const enableIndices = new Map(HARDWARE_COILS.map((coil) => [coil, commandsAtDrainTick.findIndex((c) => c.coil === coil && c.action === 'enable')]));
		for (const coil of HARDWARE_COILS) {
			const disableAt = disableIndices.get(coil)!;
			const enableAt = enableIndices.get(coil)!;
			expect(disableAt, `${coil} must receive a disable on the tilt-and-drain tick, from the tilt itself`).toBeGreaterThanOrEqual(0);
			expect(enableAt, `${coil} must receive an enable on the SAME tick, from the rotation's own startBall()`).toBeGreaterThanOrEqual(0);
			expect(enableAt, 'the enable must be ORDERED AFTER the disable in the same batch, so the enable wins').toBeGreaterThan(disableAt);
		}
	});
});

describe('AC 5 -- warnings are per player', () => {
	it('player 0 collects a warning; only players[0].tiltWarnings moves, players[1] stays 0', () => {
		const initial = gameState({ currentPlayer: 0, players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer({ tiltWarnings: 0 })] });
		const result = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: initial, adjustments: adjustments(2) });

		expect(result.finalState.players[0]!.tiltWarnings).toBe(1);
		expect(result.finalState.players[1]!.tiltWarnings, 'player 1 must be untouched by player 0\'s closure').toBe(0);
	});

	it('re-run at currentPlayer 1: only players[1].tiltWarnings moves, players[0] stays untouched', () => {
		const initial = gameState({ currentPlayer: 1, players: [emptyPlayer({ tiltWarnings: 3 }), emptyPlayer({ tiltWarnings: 0, ballNumber: 2 })] });
		const result = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: initial, adjustments: adjustments(2) });

		expect(result.finalState.players[1]!.tiltWarnings).toBe(1);
		expect(result.finalState.players[0]!.tiltWarnings, 'player 0 (not currentPlayer) must be untouched').toBe(3);
		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt_warning', player: 1, remaining: 1, tick: 1 }]));
	});
});

describe('AC 6 -- Slam tilt ends every player\'s game and returns the machine to Attract', () => {
	it('in phase "game": slam_tilt fires, phase -> attract, modes -> [], hardware disables, machine.tilt.slamTilted -> true, no ball_ended, no score change, players[] survives', () => {
		const initial = gameState({
			// Code review (Story 2.11, Rule 19): both players carry a NONZERO
			// bonus, so the unchanged scores below genuinely discriminate "the
			// game ends without bonus" -- with empty bonuses a slam that paid
			// the bonus left the scores equal and the suite green.
			players: [
				emptyPlayer({ score: 1000, ballNumber: 2, bonus: { byCategory: { letters: 2, loops: 1, strikes: 0 }, multiplier: 2 } }),
				emptyPlayer({ score: 500, bonus: { byCategory: { letters: 1, loops: 0, strikes: 1 }, multiplier: 1 } }),
			],
			modes: [{ mode: 'skill_shot', priority: 200, player: 0 }, { mode: 'base', priority: 100, player: 0 }],
		});
		const result = runRulesScript(close('s_slam_tilt').at(1).build(), { durationTicks: 1, initialState: initial });

		expect(result.events).toEqual(expect.arrayContaining([{ type: 'slam_tilt', tick: 1 }]));
		expect(result.events.some((e) => e.type === 'ball_ended'), 'no ball_ended on a slam tilt').toBe(false);
		expect(result.finalState.phase).toBe('attract');
		expect(result.finalState.modes).toEqual([]);
		expect(result.finalState.machine.hardwareEnabled).toBe(false);
		expect(result.finalState.machine.tilt).toEqual({ tilted: false, slamTilted: true });
		expect(result.finalState.players.map((p) => p.score), 'no score change; players[] survives for Attract to cycle').toEqual([1000, 500]);

		const disabled = new Set(result.coilCommands.filter((c) => c.tick === 1 && c.action === 'disable').map((c) => c.coil));
		for (const coil of HARDWARE_COILS) {
			expect(disabled.has(coil), `${coil} must receive a disable CoilCommand`).toBe(true);
		}
	});

	// Code review (Story 2.11): a Slam tilt disarms every ball-save source,
	// like a Tilt (AD-18, "Tilt disarms all"). Left armed, `lampsOf()` -- no
	// phase gate -- kept `l_ball_save` lit in Attract for the rest of the
	// window (measured before the fix: lit at tick 60 of a 5000-tick window).
	it('in phase "game" with a live ball-save window: the slam disarms every source, and l_ball_save is dark in Attract -- against the same state lit before the slam', () => {
		const hurryUpTicks = PRODUCTION_TUNING.ballSaveHurryUpTicks.value;
		const initial = gameState({ machine: { ballSave: { untilTick: 5000, sources: ['ball-controller', 'seeded-second'] } } });
		expect(lampsOf(initial, hurryUpTicks).l_ball_save.role, 'control: the live window lights l_ball_save before the slam').not.toBe('off');

		const result = runRulesScript(close('s_slam_tilt').at(1).build(), { durationTicks: 60, initialState: initial });
		expect(result.events).toEqual(expect.arrayContaining([{ type: 'slam_tilt', tick: 1 }]));
		expect(result.finalState.phase).toBe('attract');
		expect(result.finalState.machine.ballSave, 'every source removed by the slam').toEqual({ untilTick: null, sources: [] });
		expect(lampsOf(result.finalState, hurryUpTicks).l_ball_save.role, 'l_ball_save must be dark in Attract after a slam').toBe('off');
	});

	// Driven directly against `createTiltController()` (not `runRulesScript()`):
	// `sim/rules/index.ts`'s own `step()` always rebuilds a FRESH top-level
	// `GameState` wrapper every tick (`{ ...stateAfterBonusMultiplier, tick }`),
	// so the "same reference" claim below is `tilt.ts`'s OWN no-op contract,
	// observable only at the layer that actually makes the promise.
	it('in phase "attract" or "game_over": nothing at all -- same state reference -- against the SAME closure in "game" producing slam_tilt (the discriminating control)', () => {
		const controller = createTiltController(adjustments(1), PRODUCTION_TUNING);
		for (const phase of ['attract', 'game_over'] as const) {
			const initial = gameState({ phase, players: [], modes: [] });
			const result = controller.step(initial, [{ type: 'slam_tilt_closed', tick: 1 }], 1);

			expect(result.events, `phase ${phase} must emit nothing on a slam tilt`).toEqual([]);
			expect(result.state, `phase ${phase} must return the SAME state reference`).toBe(initial);
		}

		// The discriminating control: the identical closure in phase 'game' DOES
		// produce slam_tilt.
		const gameController = createTiltController(adjustments(1), PRODUCTION_TUNING);
		const gameResult = gameController.step(gameState(), [{ type: 'slam_tilt_closed', tick: 1 }], 1);
		expect(gameResult.events.some((e) => e.type === 'slam_tilt'), 'sanity: the same closure in phase "game" must produce slam_tilt').toBe(true);
	});
});

// Code review finding (Blind Hunter / Edge Case Hunter, converged
// independently): a nudge violent enough to cross BOTH cabinet sensors'
// thresholds in the SAME tick -- physically plausible, and, per
// `sim/physics/cabinet/index.ts`'s own fixed push order (bob edge pushed
// before the slam edge, every tick), deterministic here -- must never let a
// bob-triggered warning or tilt land against a game the slam has already
// ended. `tilt.ts` now runs slam_tilt_closed to completion in its own pass
// BEFORE looking at any tilt_bob_closed in the same deviceEvents batch, so
// the outcome is correct regardless of which order the two events arrive in
// -- both orderings are scripted below to prove that, not merely the order
// physics happens to produce today.
describe('Code review fix -- a same-tick tilt_bob_closed + slam_tilt_closed collision always resolves to slam, in EITHER script order', () => {
	it.each([
		['bob scripted before slam', close('s_tilt_bob').at(50).close('s_slam_tilt').at(50).build()],
		['slam scripted before bob', close('s_slam_tilt').at(50).close('s_tilt_bob').at(50).build()],
	] as const)('%s: only slam_tilt fires -- no tilt_warning, no tilt, exactly one disable per HARDWARE_COILS coil, phase -> attract', (_label, script) => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			modes: [{ mode: 'stub', priority: 100, player: 0 }],
		});
		const result = runRulesScript(script, { durationTicks: 60, initialState: initial, adjustments: adjustments(1) });

		expect(result.events.filter((e) => e.tick === 50).map((e) => e.type), 'exactly one event this tick -- slam_tilt, never a bob-triggered warning or tilt').toEqual(['slam_tilt']);
		expect(result.finalState.phase).toBe('attract');
		expect(result.finalState.modes).toEqual([]);
		expect(result.finalState.machine.tilt).toEqual({ tilted: false, slamTilted: true });
		expect(result.finalState.players[0]!.tiltWarnings, 'the bob closure this same tick must not have counted a warning').toBe(0);

		const disabledAt50 = result.coilCommands.filter((c) => c.tick === 50 && c.action === 'disable');
		const disabledCoils = new Set(disabledAt50.map((c) => c.coil));
		for (const coil of HARDWARE_COILS) {
			expect(disabledCoils.has(coil), `${coil} must receive a disable CoilCommand`).toBe(true);
		}
		expect(HARDWARE_COILS.length, 'sanity: the hardware set is non-empty, or the loop above is vacuous').toBeGreaterThan(0);
		expect(disabledAt50.length, 'exactly one disable per coil -- never doubled by a bob branch that should have been suppressed').toBe(HARDWARE_COILS.length);
	});

	it('the SAME collision when the bob closure alone would have TILTED (tiltWarnings already at the adjustment): still only slam_tilt -- no tilt event, machine.tilt.tilted stays false', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 1, ballNumber: 2 }), emptyPlayer()],
			machine: { ballSave: { untilTick: 5000, sources: ['ball-controller'] } },
			modes: [{ mode: 'stub', priority: 100, player: 0 }],
		});
		const script = close('s_tilt_bob').at(50).close('s_slam_tilt').at(50).build();
		const result = runRulesScript(script, { durationTicks: 60, initialState: initial, adjustments: adjustments(1) });

		expect(result.events.filter((e) => e.tick === 50).map((e) => e.type), 'the bob closure would have TILTED alone, but slam must win: only slam_tilt').toEqual(['slam_tilt']);
		expect(result.finalState.machine.tilt, 'the final tilt object is slam\'s own -- tilted stays false, only slamTilted moves').toEqual({ tilted: false, slamTilted: true });
		// Code review (Story 2.11): the slam now disarms every ball-save
		// source itself (AD-18, "Tilt disarms all" -- see the AC 6 lamp test),
		// so ballSave can no longer tell the two branches apart; that the bob
		// branch never ran is pinned by the event list and `tilted: false`
		// above.
		expect(result.finalState.machine.ballSave, 'the slam itself leaves ballSave empty').toEqual({ untilTick: null, sources: [] });
	});
});

describe('AC 7 -- DW-222: a Tilt inside a save\'s re-serve window never strands the ball', () => {
	it('the re-served ball\'s arrival at bd_shooter pulses no c_autolaunch while tilted; the manual plunge still reaches ball_launched; ball save does not re-arm; the ball\'s own eventual drain ends tilted, total:0', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			machine: { ballsInPlay: 1, ballSave: { untilTick: 5000, sources: ['ball-controller'] } },
		});
		const drainTick = 1;
		const tiltTick = drainTick + 50;
		const arrivalTick = drainTick + 200;
		const manualPlungeTick = drainTick + 400;
		const secondDrainTick = drainTick + 600;

		const script = close(TABLE.ballDevices.bd_trough.slots[3]).at(drainTick)
			.close('s_tilt_bob').at(tiltTick)
			.close('s_shooter_lane').at(arrivalTick)
			.open('s_shooter_lane').at(manualPlungeTick)
			.close(TABLE.ballDevices.bd_trough.slots[3]).at(secondDrainTick)
			.build();
		const result = runRulesScript(script, { durationTicks: secondDrainTick + 10, initialState: initial, adjustments: adjustments(0) });

		expect(result.events.filter((e) => e.type === 'ball_saved')).toEqual([{ type: 'ball_saved', player: 0, tick: drainTick }]);
		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: tiltTick }]));

		expect(
			result.coilCommands.some((c) => c.tick === arrivalTick && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'no c_autolaunch pulse on the re-served ball\'s own tilted arrival',
		).toBe(false);

		const launchedAtPlunge = result.events.filter((e) => e.tick === manualPlungeTick && e.type === 'ball_launched');
		expect(launchedAtPlunge, 'the manual plunge (s_shooter_lane opening) still fires ball_launched -- the ball is not stranded').toHaveLength(1);
		expect(result.statesByTick.get(manualPlungeTick)!.machine.ballsInPlay, 'ballsInPlay reads 1 once the manual plunge lands').toBe(1);
		expect(
			result.events.some((e) => e.type === 'ball_save_timer_started' && e.tick === manualPlungeTick),
			'ball save must NOT re-arm on the manual plunge -- the tilt emptied sources',
		).toBe(false);

		const secondEnd = result.events.find((e) => e.type === 'ball_ended' && e.tick === secondDrainTick);
		expect(secondEnd, 'the plunged ball must itself eventually reach ball_ended, never stranding the run with ballsInPlay at 0 and no ball_ended').toBeDefined();
		if (!secondEnd || secondEnd.type !== 'ball_ended') {
			throw new Error('unreachable: filtered above');
		}
		expect(secondEnd.tilted).toBe(true);
		expect(secondEnd.total).toBe(0);
	});

	it('untilted control: the identical script with no tilt DOES pulse c_autolaunch on arrival -- proving the silence above is discriminating', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			machine: { ballsInPlay: 1, ballSave: { untilTick: 5000, sources: ['ball-controller'] } },
		});
		const drainTick = 1;
		const arrivalTick = drainTick + 200;
		const script = close(TABLE.ballDevices.bd_trough.slots[3]).at(drainTick).close('s_shooter_lane').at(arrivalTick).build();
		const result = runRulesScript(script, { durationTicks: arrivalTick + 10, initialState: initial, adjustments: adjustments(0) });

		expect(
			result.coilCommands.some((c) => c.tick === arrivalTick && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'untilted, the deferred autolaunch DOES fire',
		).toBe(true);
	});

	// QA gap closure (Task 13 / AC 5's second clause). A ball-save re-serve
	// never rotates `currentPlayer` (the ballSaveLive branch returns before
	// any rotation code runs), so currentPlayer stays 1 for the WHOLE script
	// -- unlike the AC 4 twin above, no wraparound applies here.
	it('re-run at currentPlayer 1: the re-served ball\'s tilted arrival pulses no c_autolaunch; the manual plunge still reaches ball_launched; ball save does not re-arm', () => {
		const initial = gameState({
			currentPlayer: 1,
			players: [emptyPlayer(), emptyPlayer({ tiltWarnings: 0, ballNumber: 2 })],
			machine: { ballsInPlay: 1, ballSave: { untilTick: 5000, sources: ['ball-controller'] } },
		});
		const drainTick = 1;
		const tiltTick = drainTick + 50;
		const arrivalTick = drainTick + 200;
		const manualPlungeTick = drainTick + 400;
		const secondDrainTick = drainTick + 600;

		const script = close(TABLE.ballDevices.bd_trough.slots[3]).at(drainTick)
			.close('s_tilt_bob').at(tiltTick)
			.close('s_shooter_lane').at(arrivalTick)
			.open('s_shooter_lane').at(manualPlungeTick)
			.close(TABLE.ballDevices.bd_trough.slots[3]).at(secondDrainTick)
			.build();
		const result = runRulesScript(script, { durationTicks: secondDrainTick + 10, initialState: initial, adjustments: adjustments(0) });

		expect(result.events.filter((e) => e.type === 'ball_saved')).toEqual([{ type: 'ball_saved', player: 1, tick: drainTick }]);
		expect(result.events).toEqual(expect.arrayContaining([{ type: 'tilt', player: 1, tick: tiltTick }]));

		expect(
			result.coilCommands.some((c) => c.tick === arrivalTick && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'no c_autolaunch pulse on the re-served ball\'s own tilted arrival',
		).toBe(false);

		const launchedAtPlunge = result.events.filter((e) => e.tick === manualPlungeTick && e.type === 'ball_launched');
		expect(launchedAtPlunge, 'the manual plunge still fires ball_launched -- the ball is not stranded').toHaveLength(1);
		expect(result.statesByTick.get(manualPlungeTick)!.machine.ballsInPlay, 'ballsInPlay reads 1 once the manual plunge lands').toBe(1);
		expect(
			result.events.some((e) => e.type === 'ball_save_timer_started' && e.tick === manualPlungeTick),
			'ball save must NOT re-arm on the manual plunge -- the tilt emptied sources',
		).toBe(false);

		const secondEnd = result.events.find((e) => e.type === 'ball_ended' && e.tick === secondDrainTick);
		expect(secondEnd, 'the plunged ball must itself eventually reach ball_ended').toBeDefined();
		if (!secondEnd || secondEnd.type !== 'ball_ended') {
			throw new Error('unreachable: filtered above');
		}
		expect(secondEnd.player, 'the ending player must be 1').toBe(1);
		expect(secondEnd.tilted).toBe(true);
		expect(secondEnd.total).toBe(0);
	});
});

describe('Code review (Story 2.11) -- a Slam tilt inside a save\'s re-serve window never autolaunches into Attract', () => {
	it('the re-served ball\'s arrival after a slam pulses no c_autolaunch -- against the IDENTICAL script minus the slam, which does', () => {
		const initial = gameState({
			players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()],
			machine: { ballsInPlay: 1, ballSave: { untilTick: 5000, sources: ['ball-controller'] } },
		});
		const script = (withSlam: boolean) => {
			const builder = close(TABLE.ballDevices.bd_trough.slots[3]).at(1);
			return (withSlam ? builder.close('s_slam_tilt').at(51) : builder).close('s_shooter_lane').at(201).build();
		};

		const slammed = runRulesScript(script(true), { durationTicks: 210, initialState: initial });
		expect(slammed.events.filter((e) => e.type === 'ball_saved'), 'sanity: the drain is genuinely saved and re-served').toHaveLength(1);
		expect(slammed.events, 'sanity: the slam genuinely lands before the arrival').toEqual(expect.arrayContaining([{ type: 'slam_tilt', tick: 51 }]));
		expect(slammed.statesByTick.get(201)!.phase, 'sanity: the arrival lands in Attract').toBe('attract');
		expect(
			slammed.coilCommands.some((c) => c.tick >= 51 && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'no c_autolaunch pulse in Attract after a slam -- tilt.tilted stays false on a slam, so the tilt guard alone does not cover it',
		).toBe(false);

		const control = runRulesScript(script(false), { durationTicks: 210, initialState: initial });
		expect(
			control.coilCommands.some((c) => c.tick === 201 && c.coil === SHOOTER_LAUNCH_COIL && c.action === 'pulse'),
			'control: the IDENTICAL script minus the slam DOES pulse c_autolaunch on arrival',
		).toBe(true);
	});
});

describe('I/O matrix -- Attract/no-player/restarted-timeline edge cases', () => {
	it('a bob closure in Attract emits nothing (the spacing-mark update is pinned by the next test)', () => {
		const initial = gameState({ phase: 'attract', players: [], modes: [] });
		const result = runRulesScript(close('s_tilt_bob').at(1).at(600).build(), { durationTicks: 600, initialState: initial });
		expect(result.events, 'Attract: no warning, no tilt, ever').toEqual([]);
	});

	// Code review finding (Intent Alignment Auditor): the test above proves
	// only that no EVENT fires in Attract -- true regardless of whether
	// `lastBobClosureTick` is genuinely updated there, since the phase gate
	// short-circuits before the spacing check either way. Driven directly
	// against `createTiltController()` (this file's own established pattern
	// for observing closure-held marks) to prove the mark itself carries
	// forward: an Attract-time closure, followed by phase 'game' shortly
	// after (inside the spacing window), must still gate the LATER closure
	// as ineligible -- which is only true if the Attract-time closure's mark
	// was genuinely recorded, not merely tolerated.
	it('the Attract-time closure\'s spacing mark is genuinely recorded -- a later closure in phase "game", inside the spacing window, is still gated by it', () => {
		const controller = createTiltController(adjustments(5), PRODUCTION_TUNING);
		const attractState = gameState({ phase: 'attract', players: [], modes: [] });
		const attractClosure = controller.step(attractState, [{ type: 'tilt_bob_closed', tick: 1 }], 1);
		expect(attractClosure.events, 'sanity: Attract emits nothing').toEqual([]);

		const gameStateAt100 = gameState({ phase: 'game', players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()] });
		const laterClosure = controller.step(gameStateAt100, [{ type: 'tilt_bob_closed', tick: 100 }], 100);
		expect(
			laterClosure.events,
			'inside tiltWarningSpacingTicks (500) of the ATTRACT-time closure (tick 1) -- if the mark had NOT been recorded during Attract, this closure would be eligible and would warn',
		).toEqual([]);
		expect(laterClosure.state.players[0]!.tiltWarnings, 'no warning counted -- the closure was ineligible').toBe(0);
	});

	it('phase "game" with no players[currentPlayer]: the fold returns the same state reference and emits nothing', () => {
		const initial = gameState({ players: [], currentPlayer: 0, modes: [] });
		const result = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: initial });
		expect(result.events).toEqual([]);
		// Code review (Story 2.11): the title's "same state reference" is only
		// observable against the controller itself (`runRulesScript()` always
		// rebuilds the top-level wrapper).
		const direct = createTiltController(adjustments(1), PRODUCTION_TUNING).step(initial, [{ type: 'tilt_bob_closed', tick: 1 }], 1);
		expect(direct.state, 'the SAME state reference').toBe(initial);
		expect(direct.events).toEqual([]);
	});

	// Code review (Story 2.11, Rule 19): nothing pinned the `tilt.tilted`
	// conjunct -- removing it left the suite green, and every eligible
	// closure during a tilted ball then re-emitted `tilt` and a whole second
	// HARDWARE_COILS disable batch (Epic 4's FR-45/FR-48 consumers would
	// flash and cue twice).
	it('an eligible closure while ALREADY tilted emits no second tilt and no second disable batch -- against the same closure untilted, which tilts', () => {
		const tiltedState = gameState({ players: [emptyPlayer({ tiltWarnings: 1, ballNumber: 2 }), emptyPlayer()], machine: { tilt: { tilted: true, slamTilted: false } } });
		const tiltedRun = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: tiltedState, adjustments: adjustments(1) });
		expect(tiltedRun.events, 'no second tilt while already tilted').toEqual([]);
		expect(tiltedRun.coilCommands.filter((c) => c.action === 'disable'), 'no second disable batch while already tilted').toEqual([]);

		const untiltedState = gameState({ players: [emptyPlayer({ tiltWarnings: 1, ballNumber: 2 }), emptyPlayer()] });
		const control = runRulesScript(close('s_tilt_bob').at(1).build(), { durationTicks: 1, initialState: untiltedState, adjustments: adjustments(1) });
		expect(control.events, 'control: the identical closure untilted DOES tilt').toEqual(expect.arrayContaining([{ type: 'tilt', player: 0, tick: 1 }]));
	});

	// `runRulesScript()` always builds a FRESH `createRules()` -- and so a
	// fresh tilt controller -- per call, so it can never observe a STALE
	// mark from a different (higher) timeline. Neither can production today
	// (corrected at Story 2.11's code review): `hostLoop.reset()` calls
	// `createLoop()`, which builds a fresh `createRules()` and a fresh tilt
	// controller, so no mark survives a reset. The guard is defence in depth
	// for any caller that reuses ONE controller across a restarted tick
	// count, and this test is that caller -- driven directly against
	// `createTiltController()`, across two `.step()` calls on ONE instance,
	// the only way to exercise the branch at all.
	it('a stale mark from a DIFFERENT (higher) timeline is discarded when tick restarts lower -- the next closure is eligible immediately, not blocked for the rest of the new session', () => {
		const controller = createTiltController(adjustments(5), PRODUCTION_TUNING);
		const initial = gameState({ players: [emptyPlayer({ tiltWarnings: 0, ballNumber: 2 }), emptyPlayer()] });

		// First timeline: a closure at a high tick leaves both marks at 9000.
		const first = controller.step(initial, [{ type: 'tilt_bob_closed', tick: 9000 }], 9000);
		expect(first.events).toEqual([{ type: 'tilt_warning', player: 0, remaining: 4, tick: 9000 }]);

		// A restarted tick count on the SAME controller instance (the shape
		// `frame.ts`'s ball_ended hold guard records for real, because
		// `boot.ts`'s `backglassView` DOES survive a reset). Without the guard, `tick(1) - lastBobClosureTick(9000)` is hugely negative,
		// never `>= tiltWarningSpacingTicks`, so the closure would be judged
		// INELIGIBLE and the new session would never warn or tilt again.
		const second = controller.step(first.state, [{ type: 'tilt_bob_closed', tick: 1 }], 1);
		expect(
			second.events,
			'the stale marks must be discarded, not compared against -- this closure must be eligible immediately in the new session',
		).toEqual([{ type: 'tilt_warning', player: 0, remaining: 3, tick: 1 }]);
	});
});
