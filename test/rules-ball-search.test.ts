// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.12: the headless coverage of `sim/rules/ball-search.ts`, driven
// through `runRulesScript()` (`test/util/switch-script.ts`) -- ACs 1, 3,
// 4a, 4b, 4d, 5, 6, the headless half of AC 7, and AC 13's own rules-index
// composition. No physics, no rendering, no `sim/loop` (mirrors every other
// headless rules test file; gated by `test/rules-devices-headless.test.ts`'s
// own ENTRY_FILES completeness ratchet).
//
// The two new tunables are authored literals here (`BALL_SEARCH_TICKS`/
// `BALL_SEARCH_STEP_TICKS`), never re-imported from `sim/table/tuning.ts`
// (vacuity #43): at the production tick rate (1000 Hz) `ballSearchMs` 15000
// and `ballSearchStepMs` 250 convert 1:1 to ticks.

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { createBallController } from '../src/sim/rules/ball-controller';
import { createBallSearch } from '../src/sim/rules/ball-search';
import { close, open, runRulesScript } from './util/switch-script';
import type { DeviceEvent } from '../src/sim/rules/devices';
import type { GameAdjustments } from '../src/sim/contracts/replay';
import type { PlayerState } from '../src/sim/contracts/state';
import type { GameState, MachineReport, MachineState, SwitchEvent } from '../src/sim/table/names';

const BALL_SEARCH_TICKS = 15000;
const BALL_SEARCH_STEP_TICKS = 250;
const NO_FAILURES: MachineReport = { recovered: null, failures: [] };

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
		ballsInPlay: 0,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] },
		...overrides,
	};
}

/** AC 1's own Given: mid-game, a served ball resting on the tip, about to be plunged. */
function midGameState(overrides: {
	readonly phase?: GameState['phase'];
	readonly machine?: Partial<MachineState>;
	readonly players?: readonly PlayerState[];
} = {}): GameState {
	return {
		tick: 0,
		phase: overrides.phase ?? 'game',
		machine: machine(overrides.machine ?? {}),
		players: overrides.players ?? [emptyPlayer()],
		currentPlayer: 0,
		modes: [],
		rng: 0,
	};
}

/** The one scripted edge every scenario below shares: `s_shooter_lane` opening at `origin`, the plunge that starts play (`ball_launched`, `ballsInPlay` 0 -> 1). */
function launchAt(origin: number): readonly SwitchEvent[] {
	return open('s_shooter_lane').at(origin).build();
}

// Authored literals, never the module's own derivation (spec anti-vacuity
// #44, Rule 19 shape 3; code review 2026-09-11): AC 1 names this order
// verbatim, so a TABLE edit that reorders `slingWiring`/`popWiring` or
// renames a coil turns AC 1 red instead of moving silently with the module.
const SLING_COILS = ['c_sling_l', 'c_sling_r'] as const;
const POP_COILS = ['c_pop_1', 'c_pop_2', 'c_pop_3'] as const;
const SHOOTER_PULSE_COIL = 'c_autolaunch';
const TROUGH_EJECT_COIL = 'c_trough_eject';
const BANK_RESET_COIL = 'c_dragon_bank_reset';

/** Every drain-driving test runs here (spec Boundaries); mirrors test/backglass-integration.test.ts. */
const NO_BALL_SAVE_TUNING = resolveTuning({
	...RAW_TUNING,
	ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 1 },
	ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 0 },
});

describe('sim/rules/ball-search.ts -- AC 1: the search starts on its bound and walks its stages in order', () => {
	it('nothing through O+14999; ball_search_started once at O+15000 with stage slot 0 (pulse c_sling_l) in the same tick; the full 11-slot schedule; exactly one RecoverCommand at O+17750; c_mouth never appears', () => {
		const O = 1000;
		const durationTicks = O + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS + 10;
		const result = runRulesScript(launchAt(O), { durationTicks, initialState: midGameState() });

		const searchStarted = result.events.filter((e) => e.type === 'ball_search_started');
		expect(searchStarted).toHaveLength(1);
		expect(searchStarted[0]).toEqual({ type: 'ball_search_started', tick: O + BALL_SEARCH_TICKS });

		const startedBefore = result.events.filter((e) => e.type === 'ball_search_started' && e.tick < O + BALL_SEARCH_TICKS);
		expect(startedBefore, 'nothing through O+14999').toEqual([]);

		function pulseAt(tick: number) {
			return result.coilCommands.filter((c) => c.action === 'pulse' && c.tick === tick).map((c) => c.coil);
		}

		expect(pulseAt(O + BALL_SEARCH_TICKS + 0 * BALL_SEARCH_STEP_TICKS)).toEqual([SLING_COILS[0]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 1 * BALL_SEARCH_STEP_TICKS)).toEqual([SLING_COILS[1]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 2 * BALL_SEARCH_STEP_TICKS)).toEqual([POP_COILS[0]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 3 * BALL_SEARCH_STEP_TICKS)).toEqual([POP_COILS[1]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 4 * BALL_SEARCH_STEP_TICKS)).toEqual([POP_COILS[2]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 5 * BALL_SEARCH_STEP_TICKS), 'the bank-reset slot never pulses the coil directly -- it only requests').toEqual([]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 6 * BALL_SEARCH_STEP_TICKS), 'the Lock\'s first slot issues nothing (AD-18 phasing)').toEqual([]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 7 * BALL_SEARCH_STEP_TICKS), 'the Lock\'s second slot issues nothing').toEqual([]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 8 * BALL_SEARCH_STEP_TICKS)).toEqual([SHOOTER_PULSE_COIL]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 9 * BALL_SEARCH_STEP_TICKS), 'the shooter lane reads empty throughout, so both trough slots fire').toEqual([TROUGH_EJECT_COIL]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 10 * BALL_SEARCH_STEP_TICKS)).toEqual([TROUGH_EJECT_COIL]);

		// The devices layer's OWN merged coilCommands carry the bank reset one
		// tick after the request (AD-19's next-tick lifecycle forwarding).
		expect(pulseAt(O + BALL_SEARCH_TICKS + 5 * BALL_SEARCH_STEP_TICKS + 1)).toEqual([BANK_RESET_COIL]);

		const recovers = result.recoverCommands;
		expect(recovers).toHaveLength(1);
		expect(recovers[0]!.tick).toBe(O + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS);

		expect(result.coilCommands.some((c) => c.coil === 'c_mouth'), 'no command in the run may name c_mouth').toBe(false);
	});
});

describe('sim/rules/ball-search.ts -- AC 3: the recover\'s rules-side answers', () => {
	it('recovered:1 with bd_shooter empty serves; the SAME report with bd_shooter occupied does not; nor does one landing on the tick a Slam moves phase to attract -- all three in one test, the first the positive', () => {
		const O = 1000;
		const reportTick = O + 5;

		const servesWhenEmpty = runRulesScript(launchAt(O), {
			durationTicks: reportTick + 5,
			initialState: midGameState(),
			machineReports: new Map([[reportTick, { recovered: 1, failures: [] }]]),
		});
		const missingEvent = servesWhenEmpty.events.find((e) => e.type === 'ball_missing');
		expect(missingEvent).toEqual({ type: 'ball_missing', count: 1, tick: reportTick });
		expect(servesWhenEmpty.statesByTick.get(reportTick)!.machine.ballsInPlay).toBe(0);
		expect(servesWhenEmpty.coilCommands.filter((c) => c.tick === reportTick)).toEqual([{ type: 'coil', coil: TROUGH_EJECT_COIL, action: 'pulse', tick: reportTick }]);

		// Same script, but the lane already reads occupied at the report tick
		// -- by a ball SERVED into it (a trough slot opening and the lane
		// closing in one batch, DW-187's pairing), so the stuck ball stays
		// counted until the report and the ballsInPlay 0 below is genuinely
		// applyRecovery()'s own correction (code review 2026-09-11: an
		// unpaired lane close had already zeroed it a tick earlier).
		const occupiedScript = [...launchAt(O), ...open('s_trough_1').at(reportTick - 1).close('s_shooter_lane').at(reportTick - 1).build()];
		const noServeWhenOccupied = runRulesScript(occupiedScript, {
			durationTicks: reportTick + 5,
			initialState: midGameState(),
			machineReports: new Map([[reportTick, { recovered: 1, failures: [] }]]),
		});
		expect(noServeWhenOccupied.statesByTick.get(reportTick - 1)!.machine.ballsInPlay, 'the served arrival keeps the stuck ball counted until the report').toBe(1);
		expect(noServeWhenOccupied.statesByTick.get(reportTick - 1)!.machine.deviceSlots.bd_shooter).toEqual([true]);
		const missingEvent2 = noServeWhenOccupied.events.find((e) => e.type === 'ball_missing');
		expect(missingEvent2).toEqual({ type: 'ball_missing', count: 1, tick: reportTick });
		expect(noServeWhenOccupied.statesByTick.get(reportTick)!.machine.ballsInPlay).toBe(0);
		expect(noServeWhenOccupied.coilCommands.filter((c) => c.tick === reportTick)).toEqual([]);

		// Same script again, but a Slam moves phase to 'attract' on the SAME
		// tick the report arrives -- no serve (the phase gate).
		const slamScript = [...launchAt(O), ...close('s_slam_tilt').at(reportTick).build()];
		const noServeUnderSlam = runRulesScript(slamScript, {
			durationTicks: reportTick + 5,
			initialState: midGameState(),
			machineReports: new Map([[reportTick, { recovered: 1, failures: [] }]]),
		});
		const missingEvent3 = noServeUnderSlam.events.find((e) => e.type === 'ball_missing');
		expect(missingEvent3).toEqual({ type: 'ball_missing', count: 1, tick: reportTick });
		expect(noServeUnderSlam.statesByTick.get(reportTick)!.machine.ballsInPlay).toBe(0);
		expect(noServeUnderSlam.statesByTick.get(reportTick)!.phase).toBe('attract');
		// The Slam itself legitimately disables every AD-5 hardware coil this
		// same tick (tilt.ts's own, unrelated behaviour) -- this test's own
		// subject is the SERVE specifically, so it filters for that alone.
		expect(noServeUnderSlam.coilCommands.filter((c) => c.tick === reportTick && c.coil === TROUGH_EJECT_COIL)).toEqual([]);
	});

	it('a full search run: its OWN RecoverCommand at O+17750, answered at O+17751 with recovered:0 while a SERVED ball rests in bd_shooter, yields ball_missing{count:0}, ballsInPlay 1 -> 0, no serve, and no second ball_search_started through O+33751 -- the same run\'s O+15000 start and O+17250 trough pulse are the positives', () => {
		const O = 1000;
		const trueRecoverTick = O + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS;
		const reportTick = trueRecoverTick + 1;

		// The lane is occupied by a SERVED ball (a trough slot opening and the
		// lane closing in one batch -- DW-187's pairing), so the stuck ball
		// stays counted and the search runs to its own RecoverCommand. Code
		// review 2026-09-11: this test previously closed the lane UNPAIRED,
		// which (correctly, under DW-187) zeroed ballsInPlay ten ticks before
		// the recover slot -- the search idled, never issued a recover, and the
		// injected report answered nothing, so every assertion held with
		// applyRecovery() disabled.
		const script = [...launchAt(O), ...open('s_trough_1').at(trueRecoverTick - 10).close('s_shooter_lane').at(trueRecoverTick - 10).build()];
		const durationTicks = O + 33751 + 10;
		const result = runRulesScript(script, {
			durationTicks,
			initialState: midGameState(),
			machineReports: new Map([[reportTick, { recovered: 0, failures: [] }]]),
		});

		expect(result.events.filter((e) => e.type === 'ball_search_started'), 'one pass, at O+15000; none through O+33751').toEqual([{ type: 'ball_search_started', tick: O + BALL_SEARCH_TICKS }]);
		expect(result.recoverCommands, 'the search itself issues the one RecoverCommand this report answers').toEqual([{ type: 'recover', tick: trueRecoverTick }]);
		expect(result.coilCommands.filter((c) => c.tick === O + 17250), 'the same instrument\'s positive: the lane was empty at the first trough slot, so it served').toEqual([{ type: 'coil', coil: TROUGH_EJECT_COIL, action: 'pulse', tick: O + 17250 }]);

		const beforeReport = result.statesByTick.get(reportTick - 1)!.machine;
		expect(beforeReport.ballsInPlay, 'the stuck ball is still counted when the report lands').toBe(1);
		expect(beforeReport.deviceSlots.bd_shooter, 'a served ball rests in the lane').toEqual([true]);

		const missing = result.events.find((e) => e.type === 'ball_missing');
		expect(missing).toEqual({ type: 'ball_missing', count: 0, tick: reportTick });
		expect(result.statesByTick.get(reportTick)!.machine.ballsInPlay, 'recovered:0 still corrects ballsInPlay to 0').toBe(0);
		expect(result.coilCommands.filter((c) => c.tick === reportTick), 'no serve into the occupied lane').toEqual([]);
	});
});

describe('sim/rules/ball-search.ts -- AC 4a: a playfield closure cancels and restarts the timer', () => {
	it('a closure at C = O+15600 cancels the running pass (no command after C, no RecoverCommand); the next ball_search_started is at exactly C+15000 -- the identical script WITHOUT the closure runs to its own RecoverCommand at O+17750, in the same test', () => {
		const O = 1000;
		const C = O + 15600;

		const cancelledScript = [...launchAt(O), ...close('s_drain').at(C).build()];
		const cancelledDuration = C + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS + 10;
		const cancelled = runRulesScript(cancelledScript, { durationTicks: cancelledDuration, initialState: midGameState() });

		const startedTicks = cancelled.events.filter((e) => e.type === 'ball_search_started').map((e) => e.tick);
		expect(startedTicks).toEqual([O + BALL_SEARCH_TICKS, C + BALL_SEARCH_TICKS]);
		expect(cancelled.coilCommands.some((c) => c.tick > C && c.tick < C + BALL_SEARCH_TICKS), 'no command between the cancel and the next pass\'s own quiet window').toBe(false);
		const recoversAfterCancelBeforeSecondPass = cancelled.recoverCommands.filter((r) => r.tick < C + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS);
		expect(recoversAfterCancelBeforeSecondPass, 'the cancelled pass must never reach a RecoverCommand of its own').toEqual([]);

		const uncancelled = runRulesScript(launchAt(O), { durationTicks: O + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS + 10, initialState: midGameState() });
		expect(uncancelled.recoverCommands).toHaveLength(1);
		expect(uncancelled.recoverCommands[0]!.tick).toBe(O + BALL_SEARCH_TICKS + 11 * BALL_SEARCH_STEP_TICKS);
	});
});

describe('sim/rules/ball-search.ts -- AC 4b: non-playfield closures never delay or cancel', () => {
	it('s_shooter_lane close, a trough slot close, Start press+release, plunger press+release, and a tilt-bob closure -- none of them move ball_search_started off O+15000; a genuine playfield closure at O+9000, in the SAME test, DOES move it to O+24000', () => {
		const O = 1000;
		// A bare trough-slot close is deliberately NOT scripted here on its
		// own: with a single ball in play, closing any bd_trough slot IS a
		// parking entry (AD-6), which genuinely ends play (ballsInPlay 0) --
		// a fact this file's own AC 6 gate already covers, and orthogonal to
		// this row's own subject (whether a NON-playfield edge moves the
		// origin). The shooter-lane close below is instead paired with a
		// trough slot's own opening in the SAME tick (DW-187, AC 13): a
		// served ball's own arrival, never counted -- an UNPAIRED close would
		// (correctly) read as a ball returning to the lane and end play.
		const script = [
			...launchAt(O),
			...close('s_shooter_lane').at(O + 100).build(),
			...open('s_trough_1').at(O + 100).build(),
			...close('s_start').at(O + 300).open().at(O + 310).build(),
			...close('s_plunger').at(O + 400).open().at(O + 410).build(),
			...close('s_tilt_bob').at(O + 500).build(),
		];
		const result = runRulesScript(script, { durationTicks: O + BALL_SEARCH_TICKS + 10, initialState: midGameState() });
		expect(result.events.filter((e) => e.type === 'ball_search_started')).toEqual([{ type: 'ball_search_started', tick: O + BALL_SEARCH_TICKS }]);

		const withClosure = [...launchAt(O), ...close('s_drain').at(O + 9000).build()];
		const result2 = runRulesScript(withClosure, { durationTicks: O + 9000 + BALL_SEARCH_TICKS + 10, initialState: midGameState() });
		expect(result2.events.filter((e) => e.type === 'ball_search_started')).toEqual([{ type: 'ball_search_started', tick: O + 9000 + BALL_SEARCH_TICKS }]);
	});
});

describe('sim/rules/ball-search.ts -- AC 5: the failure vocabulary is tolerated, and overflow is answered', () => {
	it('eject_failed and broken issue no command/event and leave the same GameState.machine reference; device_overflow{bd_trough} answers with one pulse; device_overflow{bd_lock} in the SAME report yields nothing (AD-18)', () => {
		const O = 1000;
		const reportTick = O + 5;
		const report: MachineReport = {
			recovered: null,
			failures: [
				{ type: 'eject_failed', device: 'bd_trough', tick: reportTick },
				{ type: 'eject_failed', device: 'bd_shooter', tick: reportTick },
				{ type: 'broken', device: 'c_pop_1', tick: reportTick },
				{ type: 'device_overflow', device: 'bd_trough', tick: reportTick },
				{ type: 'device_overflow', device: 'bd_lock', tick: reportTick },
			],
		};
		const result = runRulesScript(launchAt(O), {
			durationTicks: reportTick + 5,
			initialState: midGameState(),
			machineReports: new Map([[reportTick, report]]),
		});

		// A throw in any of these branches would already have failed
		// runRulesScript() above. (Code review 2026-09-11: the former
		// `expect(() => result).not.toThrow()` wrapped an already-computed value
		// and could never fail; its `toEqual` claimed reference equality.)
		const commandsThisTick = result.coilCommands.filter((c) => c.tick === reportTick);
		expect(commandsThisTick).toEqual([{ type: 'coil', coil: TROUGH_EJECT_COIL, action: 'pulse', tick: reportTick }]);

		// No event: rules never re-emit a physics failure (Boundaries; the loop
		// alone forwards them to FrameOutput.events). The same instrument's
		// positive: this run's own ball_launched at O.
		expect(result.events).toContainEqual({ type: 'ball_launched', tick: O });
		expect(result.events.filter((e) => e.tick === reportTick), 'no rules event of any kind on the report tick').toEqual([]);

		// AC 5: "leave state.machine as the same reference" -- the overflow
		// answer is a command only.
		const before = result.statesByTick.get(reportTick - 1)!.machine;
		const after = result.statesByTick.get(reportTick)!.machine;
		expect(after, 'the failures must leave the SAME machine reference').toBe(before);
	});

	it('ball_missing reaches modeStack.step() without incident and leaves the mode stack\'s state unchanged (the real Backglass fold is exercised on real FrameOutputs in test/ball-search-integration.test.ts, AC 2)', () => {
		const O = 1000;
		const reportTick = O + 5;
		const result = runRulesScript(launchAt(O), {
			durationTicks: reportTick + 5,
			initialState: midGameState(),
			machineReports: new Map([[reportTick, { recovered: 3, failures: [] }]]),
		});
		expect(result.events).toContainEqual({ type: 'ball_missing', count: 3, tick: reportTick });
		expect(result.statesByTick.get(reportTick)!.modes, 'ball_missing leaves the mode stack\'s state unchanged').toBe(result.statesByTick.get(reportTick - 1)!.modes);
	});
});

describe('sim/rules/ball-search.ts -- AC 6: the phase, in-play and tilt gates hold', () => {
	it('no search in attract or game_over, nor with ballsInPlay 0 (a served, unlaunched ball) -- the paired positive in \'game\' with ballsInPlay 1 emits at O+15000', () => {
		const durationTicks = BALL_SEARCH_TICKS + 1000;

		const attractResult = runRulesScript([], { durationTicks, initialState: midGameState({ phase: 'attract', machine: { ballsInPlay: 0 } }) });
		expect(attractResult.events.filter((e) => e.type === 'ball_search_started')).toEqual([]);

		const gameOverResult = runRulesScript([], { durationTicks, initialState: midGameState({ phase: 'game_over', machine: { ballsInPlay: 0 } }) });
		expect(gameOverResult.events.filter((e) => e.type === 'ball_search_started')).toEqual([]);

		const servedNotLaunched = runRulesScript([], { durationTicks, initialState: midGameState({ machine: { ballsInPlay: 0, deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [true], bd_lock: [false, false, false] } } }) });
		expect(servedNotLaunched.events.filter((e) => e.type === 'ball_search_started')).toEqual([]);

		// The phase conjunct, isolated from the ballsInPlay conjunct: every case
		// above pairs a non-'game' phase with ballsInPlay 0, so it cannot by
		// itself prove the phase check does any work independently of the
		// ballsInPlay check (`state.phase === 'game' && state.machine.ballsInPlay
		// > 0`, ball-search.ts's own inPlayNow). This state is synthetic --
		// ordinary play accounting floors ballsInPlay before or alongside a
		// phase change away from 'game' -- but the search's own gate must hold
		// it defensively regardless, and nothing else in this file isolates it.
		const attractWithBallsInPlay = runRulesScript([], { durationTicks, initialState: midGameState({ phase: 'attract', machine: { ballsInPlay: 1 } }) });
		expect(attractWithBallsInPlay.events.filter((e) => e.type === 'ball_search_started'), 'phase !== \'game\' alone must suppress the search, even with ballsInPlay > 0').toEqual([]);

		const O = 1000;
		const positive = runRulesScript(launchAt(O), { durationTicks: O + BALL_SEARCH_TICKS + 10, initialState: midGameState() });
		expect(positive.events.filter((e) => e.type === 'ball_search_started')).toEqual([{ type: 'ball_search_started', tick: O + BALL_SEARCH_TICKS }]);
	});

	it('while tilted, the search runs and its sling/pop slots are issued, but the shooter slot (O+17000) issues nothing -- the untilted twin issues c_autolaunch there, in the same test', () => {
		const O = 1000;
		const durationTicks = O + BALL_SEARCH_TICKS + 9 * BALL_SEARCH_STEP_TICKS + 10;

		const tiltedState = midGameState({ machine: { tilt: { tilted: true, slamTilted: false } } });
		const tilted = runRulesScript(launchAt(O), { durationTicks, initialState: tiltedState });
		expect(tilted.coilCommands.some((c) => c.coil === SLING_COILS[0] && c.tick === O + BALL_SEARCH_TICKS)).toBe(true);
		expect(tilted.coilCommands.some((c) => c.coil === POP_COILS[0])).toBe(true);
		expect(tilted.coilCommands.filter((c) => c.tick === O + BALL_SEARCH_TICKS + 8 * BALL_SEARCH_STEP_TICKS)).toEqual([]);
		// The I/O row "Tilted": the trough and bank slots are unchanged by tilt
		// (code review 2026-09-11; previously unasserted).
		expect(tilted.coilCommands.filter((c) => c.coil === BANK_RESET_COIL), 'the bank reset still lands, merged, at O+16251').toEqual([{ type: 'coil', coil: BANK_RESET_COIL, action: 'pulse', tick: O + 16251 }]);
		expect(tilted.coilCommands.filter((c) => c.coil === TROUGH_EJECT_COIL && c.tick === O + 17250), 'the first trough slot still serves into the empty lane').toHaveLength(1);

		const untilted = runRulesScript(launchAt(O), { durationTicks, initialState: midGameState() });
		expect(untilted.coilCommands.filter((c) => c.tick === O + BALL_SEARCH_TICKS + 8 * BALL_SEARCH_STEP_TICKS)).toEqual([{ type: 'coil', coil: SHOOTER_PULSE_COIL, action: 'pulse', tick: O + BALL_SEARCH_TICKS + 8 * BALL_SEARCH_STEP_TICKS }]);
	});
});

describe('sim/rules/ball-search.ts -- AC 7 (headless half): the drop-bank component consumes the search\'s own request', () => {
	it('a directly constructed createBallController, stepped through the same script, returns one bankResetRequests entry at S and no c_dragon_bank_reset in its own coilCommands; runRulesScript\'s merged coilCommands carry pulse c_dragon_bank_reset at S+1, not at S', () => {
		const O = 1000;
		const S = O + BALL_SEARCH_TICKS + 5 * BALL_SEARCH_STEP_TICKS;

		const adjustments: GameAdjustments = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 };
		const controller = createBallController(adjustments, resolveTuning());
		let state = midGameState();
		const bankResetRequestsSeen: number[] = [];
		const coilNamesSeen: string[] = [];
		for (let tick = 1; tick <= S + 2; tick++) {
			const deviceEvents: DeviceEvent[] = tick === O ? [{ type: 'device_ball_left', device: 'bd_shooter', slot: 0, tick }, { type: 'ball_launched', tick }] : [];
			// Called DIRECTLY (bypassing rules/index.ts's own applyDeviceEvents
			// pre-pass), so this test applies the SAME accounting by hand --
			// ballController.step() itself never mutates ballsInPlay from
			// ball_launched (that is applyDeviceEvents's own job, one file
			// over), it only READS it.
			if (tick === O) {
				state = { ...state, machine: { ...state.machine, ballsInPlay: state.machine.ballsInPlay + 1 } };
			}
			const stepResult = controller.step(state, deviceEvents, tick, NO_FAILURES);
			state = stepResult.state;
			if (stepResult.bankResetRequests.length > 0) {
				bankResetRequestsSeen.push(tick);
			}
			coilNamesSeen.push(...stepResult.coilCommands.map((c) => c.coil));
		}
		expect(bankResetRequestsSeen).toEqual([S]);
		expect(coilNamesSeen).not.toContain(BANK_RESET_COIL);

		const merged = runRulesScript(launchAt(O), { durationTicks: S + 2, initialState: midGameState() });
		expect(merged.coilCommands.filter((c) => c.coil === BANK_RESET_COIL)).toEqual([{ type: 'coil', coil: BANK_RESET_COIL, action: 'pulse', tick: S + 1 }]);
	});
});

describe('sim/rules/ball-search.ts -- AC 4d: the held flipper\'s edge cases (decision 6)', () => {
	it('a hold from P = O+4000 to R = O+10000: nothing at O+15000 or O+20999, and ball_search_started at exactly O+21000', () => {
		const O = 1000;
		const P = O + 4000;
		const R = O + 10000;
		const script = [...launchAt(O), ...close('s_flipper_l').at(P).open().at(R).build()];
		const durationTicks = O + 21000 + 10;
		const result = runRulesScript(script, { durationTicks, initialState: midGameState() });

		const startedAtBound = result.events.some((e) => e.type === 'ball_search_started' && (e.tick === O + BALL_SEARCH_TICKS || e.tick === R + 10999));
		expect(startedAtBound, 'nothing at O+15000 or O+20999').toBe(false);
		expect(result.events.filter((e) => e.type === 'ball_search_started')).toEqual([{ type: 'ball_search_started', tick: O + 21000 }]);
	});

	it('a one-tick tap (close at O+4000, open at O+4001): nothing at O+15000, and exactly one ball_search_started through O+19001, at O+15001 -- a press does not restart the count', () => {
		const O = 1000;
		const script = [...launchAt(O), ...close('s_flipper_l').at(O + 4000).open().at(O + 4001).build()];
		const durationTicks = O + 19001 + 10;
		const result = runRulesScript(script, { durationTicks, initialState: midGameState() });

		const startedTicks = result.events.filter((e) => e.type === 'ball_search_started').map((e) => e.tick);
		expect(startedTicks).toEqual([O + 15001]);
		expect(startedTicks.includes(O + BALL_SEARCH_TICKS), 'nothing at the un-tapped bound O+15000').toBe(false);
	});

	it('tilted: a hold from O+4000 to O+10000 gives ball_search_started at O+21000 and nothing at O+15000 -- the pause keys on the button, tilted or not (design point 2)', () => {
		const O = 1000;
		const script = [...launchAt(O), ...close('s_flipper_l').at(O + 4000).open().at(O + 10000).build()];
		const durationTicks = O + 21000 + 10;
		const result = runRulesScript(script, { durationTicks, initialState: midGameState({ machine: { tilt: { tilted: true, slamTilted: false } } }) });

		const startedTicks = result.events.filter((e) => e.type === 'ball_search_started').map((e) => e.tick);
		expect(startedTicks).toEqual([O + 21000]);
		expect(startedTicks.includes(O + BALL_SEARCH_TICKS)).toBe(false);
	});

	it('a hold that begins during a running pass (design point 3): the search starts at O+15000; s_flipper_l closes at O+15600 and opens at O+25600; the three slots already issued stay issued, nothing issues from O+15600 through O+25749, and every remaining slot lands exactly 10,000 ticks later than AC 1 -- no second ball_search_started', () => {
		const O = 1000;
		const script = [...launchAt(O), ...close('s_flipper_l').at(O + 15600).open().at(O + 25600).build()];
		const durationTicks = O + 27750 + 10;
		const result = runRulesScript(script, { durationTicks, initialState: midGameState() });

		function pulseAt(tick: number) {
			return result.coilCommands.filter((c) => c.action === 'pulse' && c.tick === tick).map((c) => c.coil);
		}

		expect(result.events.filter((e) => e.type === 'ball_search_started'), 'no second ball_search_started -- the pass was paused, not restarted').toEqual([{ type: 'ball_search_started', tick: O + BALL_SEARCH_TICKS }]);

		// The slots already issued before the hold began stay issued, at their
		// AC 1 bound ticks.
		expect(pulseAt(O + BALL_SEARCH_TICKS + 0 * BALL_SEARCH_STEP_TICKS)).toEqual([SLING_COILS[0]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 1 * BALL_SEARCH_STEP_TICKS)).toEqual([SLING_COILS[1]]);
		expect(pulseAt(O + BALL_SEARCH_TICKS + 2 * BALL_SEARCH_STEP_TICKS)).toEqual([POP_COILS[0]]);

		// Nothing at all issues while held (O+15600 through O+25749).
		const duringHold = result.coilCommands.filter((c) => c.tick > O + 15600 && c.tick < O + 25750);
		expect(duringHold, 'nothing issues while the flipper is held').toEqual([]);
		const recoversDuringHold = result.recoverCommands.filter((r) => r.tick > O + 15600 && r.tick < O + 25750);
		expect(recoversDuringHold).toEqual([]);

		// Every remaining slot lands exactly 10,000 ticks later than AC 1.
		expect(pulseAt(O + 25750)).toEqual([POP_COILS[1]]); // c_pop_2
		expect(pulseAt(O + 26000)).toEqual([POP_COILS[2]]); // c_pop_3
		expect(pulseAt(O + 26251)).toEqual([BANK_RESET_COIL]); // merged, one tick after the request at O+26250
		expect(pulseAt(O + 27000)).toEqual([SHOOTER_PULSE_COIL]);
		expect(pulseAt(O + 27250)).toEqual([TROUGH_EJECT_COIL]);
		expect(pulseAt(O + 27500)).toEqual([TROUGH_EJECT_COIL]);
		expect(result.recoverCommands).toEqual([{ type: 'recover', tick: O + 27750 }]);
	});

	it('a hold that spans a ball boundary (design point 1): the hold starts before ball 1 drains; ball 2 is served, arrives, and is launched (O2) while STILL held; nothing at O2+15000, nothing at R2+14998, and ball_search_started arrives at exactly R2+14999 -- the held set survives startBall()\'s own reset() (build-auto step 4 review-triage addition; verification-gap review confirmed no prior test exercised this)', () => {
		const O = 1000;
		const holdPress = O + 100; // pressed well before ball 1's drain, and never released until past ball 2's own release point below.
		const D = O + 2000; // ball 1 drains into the trough (bd_trough was [true,true,true,false] by default -- s_trough_4 is the open slot).
		const O2 = D + 10; // ball 2's own launch tick, AFTER the scripted re-serve pairing below.

		const script = [
			...launchAt(O), // ball 1 launches -- ballsInPlay 0 -> 1.
			...close('s_flipper_l').at(holdPress).build(), // held from here on; never released in this script until R2 below.
			...close('s_trough_4').at(D).build(), // ball 1 drains: ball_ended -> ball_will_start (ballSearch.reset() runs, but heldSince must survive it, decision 1/design point 1) -> ball_starting -> ball_started, all this same tick, rotating to ball 2 for the SAME player.
			// The scripted re-serve (DW-187 pairing, SAME batch): the trough's
			// own eject opens a slot while the served ball's arrival closes the
			// shooter lane -- exactly the "trough slot opening and the lane
			// closing in one batch" this AC's own Design Notes describe.
			...open('s_trough_4').at(D + 4).close('s_shooter_lane').at(D + 4).build(),
			...open('s_shooter_lane').at(O2).build(), // ball 2 is plunged: ball_launched, ballsInPlay 0 -> 1 -- the flipper is STILL held at this point.
		];
		const R2 = O2 + 20000; // released only long after ball 2's own O2+15000 bound would otherwise have fired.
		const releaseScript = open('s_flipper_l').at(R2).build();
		const fullScript = [...script, ...releaseScript];

		const durationTicks = R2 + 14999 + 10;
		// NO_BALL_SAVE_TUNING (spec Boundaries: every drain-driving test; code
		// review 2026-09-11) -- ball 1's drain must end the ball, never be saved.
		const result = runRulesScript(fullScript, { durationTicks, initialState: midGameState(), tuning: NO_BALL_SAVE_TUNING });

		// The premise: ball 2 genuinely launched at O2 while ball 1 genuinely
		// ended first, and the flipper was genuinely held across the whole gap
		// (never a spurious release counted by the harness).
		const ballEnded = result.events.filter((e) => e.type === 'ball_ended');
		expect(ballEnded, 'ball 1 must genuinely have ended, or this test exercises no boundary at all').toHaveLength(1);
		const ball2Launch = result.events.find((e) => e.type === 'ball_launched' && e.tick === O2);
		expect(ball2Launch, 'ball 2 must genuinely launch at O2, the instrument\'s own positive premise').toBeDefined();
		expect(result.statesByTick.get(O2)!.machine.ballsInPlay, 'ballsInPlay reads 1 once ball 2 launches').toBe(1);

		const startedTicks = result.events.filter((e) => e.type === 'ball_search_started').map((e) => e.tick);
		expect(startedTicks.includes(O2 + BALL_SEARCH_TICKS), 'nothing at O2+15000 -- the held set survived the ball boundary').toBe(false);
		expect(startedTicks.includes(R2 + 14998), 'nothing yet at R2+14998 -- one tick short of the resumed bound').toBe(false);
		expect(startedTicks, 'exactly one ball_search_started, at R2+14999 -- resumed from where the pre-boundary hold paused it, never restarted').toEqual([R2 + 14999]);
	});
});

describe('sim/rules/ball-search.ts -- reset-safety: a mark from a restarted timeline is discarded (AD-7, I/O & Edge-Case Matrix "Restarted timeline"; ball-search.ts:31-32, 257-262)', () => {
	it('an origin mark set by a closure at tick 9000 is genuinely live (it reaches its own threshold with no restart, at 9000+15000=24000); the SAME sequence up to 9000, but followed by a tick restart to 1, discards that mark -- no ball_search_started fires anywhere near 24000, and a fresh closure set AFTER the restart still starts a pass normally, proving the discard targets only the stale mark', () => {
		const tuning = resolveTuning();
		const state = midGameState({ machine: { ballsInPlay: 1 } });
		const closureAt = (tick: number): readonly DeviceEvent[] => [{ type: 'playfield_switch_closed', switch: 's_inlane_l', tick } as DeviceEvent];

		// Both instances are "primed" first: one no-op observe()+step() at
		// tick 0 consumes the internal false->true "now in play" transition
		// (which would otherwise itself plant a competing origin the instant
		// step() is first called), then reset() clears that irrelevant pass
		// without touching the primed wasInPlay=true state. Only after this
		// does either instrument's REAL mark get set, so the test measures
		// only the reset-safety guard, never the unrelated in-play edge.
		function primed(): ReturnType<typeof createBallSearch> {
			const s = createBallSearch(tuning);
			s.observe([], 0);
			s.step(state, 0);
			s.reset();
			return s;
		}

		// Control instance: no restart. A closure at 9000 sets origin=9000;
		// stepping every tick to 24000 with no further edges must land
		// ball_search_started at EXACTLY 9000+15000=24000 -- proof the mark,
		// once set, is genuinely tracked and counted (the positive this test's
		// restarted instance is measured against).
		const control = primed();
		control.observe(closureAt(9000), 9000);
		let controlStarted = -1;
		for (let tick = 9001; tick <= 24000; tick++) {
			control.observe([], tick);
			const result = control.step(state, tick);
			if (result.events.some((e) => e.type === 'ball_search_started')) {
				controlStarted = tick;
				break;
			}
		}
		expect(controlStarted, 'sanity: the undisturbed mark must genuinely fire at origin+15000, or this test measures nothing').toBe(24000);

		// Restarted instance: the identical closure at 9000 (so the mark is
		// set exactly as in the control), but the very next observed tick is
		// 1, not 9001 -- a timeline restart. ball-search.ts's own reset-safety
		// guard (origin=9000 > tick=1) must discard the stale mark right there.
		const restarted = primed();
		restarted.observe(closureAt(9000), 9000);
		restarted.observe([], 1);

		// Walk the restarted timeline forward from 1 through past where the
		// STALE mark would have fired (24000 in the control run). No
		// ball_search_started may appear anywhere in this stretch -- the mark
		// is gone, and no fresh in-play transition or closure re-arms it
		// (ballsInPlay was already > 0 throughout, so no 0->1 edge occurs).
		let sawEarlyOrStaleFire = false;
		let tick = 1;
		for (; tick <= 24000; tick++) {
			restarted.observe([], tick);
			const result = restarted.step(state, tick);
			if (result.events.some((e) => e.type === 'ball_search_started')) {
				sawEarlyOrStaleFire = true;
				break;
			}
		}
		expect(sawEarlyOrStaleFire, 'the stale mark (origin 9000) must never fire -- neither at the control\'s 24000 nor anywhere else, after the restart discarded it').toBe(false);

		// The positive half of the restarted instance: a FRESH closure after
		// the restart (tick 2000) still starts a normal pass, firing at
		// EXACTLY 2000+15000=17000 -- proving the guard discarded only the
		// stale mark, not the module's own ability to track a genuine one.
		restarted.observe(closureAt(2000), 2000);
		let restartedFreshStarted = -1;
		for (tick = 2001; tick <= 17000; tick++) {
			restarted.observe([], tick);
			const result = restarted.step(state, tick);
			if (result.events.some((e) => e.type === 'ball_search_started')) {
				restartedFreshStarted = tick;
				break;
			}
		}
		expect(restartedFreshStarted, 'a genuine closure set AFTER the restart must still start a pass normally, at its own origin+15000').toBe(17000);
	});
});
