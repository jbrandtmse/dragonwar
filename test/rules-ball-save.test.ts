// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.9 (AD-18): the headless rules tests for `machine.ballSave` -- the
// enable/timer-start distinction (AC 1/AC 2), the lamp step ladder (AC 2),
// a live drain re-serving instead of ending the ball (AC 3), the deferred
// autolaunch (AC 4), multi-source arbitration (AC 5), the Tilt guard
// (AC 6), the production tunables pinned by consequence (AC 9), the
// attract no-op (AC 10) and the four-probe grace boundary (AC 11). Driven
// through `runRulesScript()` (`test/util/switch-script.ts`) and, for the
// pure `sim/rules/ball-save.ts` helpers and `lampsOf()`'s projection, called
// directly -- no physics, no rendering, no `sim/loop` (AC 9's own headless
// claim, pinned transitively by `test/rules-devices-headless.test.ts`'s
// ENTRY_FILES gate, which this file's path is added to).
//
// AC 8 (the Integration AC -- a real createLoop, a real LampCommand stream)
// is NOT here: it needs `sim/loop`, which this file's own headless gate
// structurally forbids (the same reason `rules-lifecycle.test.ts` and
// `rules-lifecycle-integration.test.ts` are two separate files). It lives in
// `test/rules-ball-save-integration.test.ts`, named so the ENTRY_FILES
// ratchet's own naming convention (`*-integration.test.ts` is exempt)
// excludes it automatically, with no ratchet edit needed.

import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/sim/table/dragonwar';
import { resolveTuning, shotWindowTicks, TUNING as RAW_TUNING } from '../src/sim/table/tuning';
import { BALL_SAVE_SOURCE, createBallController } from '../src/sim/rules/ball-controller';
import { armBallSave, disarmBallSave, EMPTY_BALL_SAVE, enableBallSave, isRunning, isWithinGrace, isWithinHurryUp } from '../src/sim/rules/ball-save';
import { lampsOf } from '../src/sim/rules/lamps';
import { close, open, runRulesScript } from './util/switch-script';
import type { BallSaveState } from '../src/sim/contracts/state';
import type { GameState } from '../src/sim/table/names';
import type { DeviceEvent } from '../src/sim/rules/devices';

const TROUGH_EJECT_COIL = TABLE.ballDevices.bd_trough.ejectCoil;
const SHOOTER_LAUNCH_COIL = TABLE.ballDevices.bd_shooter.ballSearchOrder[0]!.coil;

/** A fresh empty player, mirroring `ball-controller.ts`'s own `emptyPlayer()` -- test-local, same idiom `test/rules-lifecycle.test.ts` already established. */
function emptyPlayer(ballNumber: number) {
	return {
		score: 0,
		letters: '',
		lockCredits: 0,
		tiltWarnings: 0,
		bonus: { byCategory: {}, multiplier: 1 },
		lanes: { lit: {}, completedSets: [] },
		extraBalls: 0,
		jackpotSeed: 0,
		warsStarted: 0,
		modesPlayed: [] as string[],
		ballNumber,
	};
}

/** A mid-game `GameState` with `machine.ballSave` and `machine.tilt` seeded directly -- the established headless pattern (`test/rules-lifecycle.test.ts`'s own AC 5 fixture) for exercising the drain branch without driving a whole Start-to-here script. */
function midGameState(overrides: { readonly ballSave: BallSaveState; readonly tilted?: boolean }): GameState {
	return {
		tick: 0,
		phase: 'game',
		machine: {
			ballsInPlay: 1,
			hardwareEnabled: true,
			ballSave: overrides.ballSave,
			tilt: { tilted: overrides.tilted ?? false, slamTilted: false },
			multiball: null,
			highscores: [],
			deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
		},
		players: [emptyPlayer(2), emptyPlayer(0)],
		currentPlayer: 0,
		modes: [{ mode: 'stub', priority: 100, player: 0 }],
		rng: 0,
	};
}

describe('AC 1 -- enable is not a start', () => {
	it('ball_starting fires ball_save_enabled; untilTick stays null; l_ball_save projects off', () => {
		const result = runRulesScript(close('s_start').at(5).build(), { durationTicks: 5 });
		const after = result.statesByTick.get(5)!;

		expect(result.events.filter((e) => e.tick === 5).map((e) => e.type)).toContain('ball_save_enabled');
		expect(after.machine.ballSave.untilTick, 'enabling must not start the timer').toBeNull();
		expect(after.machine.ballSave.sources, 'the controller\'s own source must be recorded').toContain(BALL_SAVE_SOURCE);
		expect(lampsOf(after, 20).l_ball_save).toEqual({ role: 'off', step: 0 });
	});
});

describe('AC 2 -- the timer starts at the plunge, and the lamp step ladder follows it', () => {
	const OVERRIDE_TUNING = resolveTuning({
		...RAW_TUNING,
		ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 100 },
		ballSaveHurryUpMs: { ...RAW_TUNING.ballSaveHurryUpMs, value: 20 },
	});
	// Code review (Story 2.9): the expectations below are spelled out from the
	// AUTHORED literals above (100 ms / 20 ms at the live 1 kHz tick rate ->
	// 100 / 20 ticks), never read back through `shotWindowTicks()`. Reading the
	// resolver back would put the same function on both sides of the assertion,
	// so a resolver defect would move production and expectation together and
	// the test could not fail for the reason it exists -- the discipline task 15
	// already applies to AC 11, applied here too.
	const BALL_SAVE_TICKS = 100;
	const HURRY_UP_TICKS = 20;

	it('ball_launched at tick L emits ball_save_timer_started with untilTick === L + ballSaveTicks', () => {
		const script = close('s_start').at(1).open('s_shooter_lane').at(3).build();
		const result = runRulesScript(script, { durationTicks: 3, tuning: OVERRIDE_TUNING });

		const started = result.events.find((e) => e.type === 'ball_save_timer_started');
		expect(started, 'ball_save_timer_started must be emitted on the plunge').toBeDefined();
		expect(started).toMatchObject({ type: 'ball_save_timer_started', untilTick: 103, tick: 3 });
		expect(result.statesByTick.get(3)!.machine.ballSave.untilTick).toBe(103);
	});

	it('sampling lampsOf() across the whole window: a non-empty step-1 span, a non-empty step-3 span, every step-3 tick later than every step-1 tick, and off from the displayed expiry onward', () => {
		const untilTick = 200;
		const step1Ticks: number[] = [];
		const step3Ticks: number[] = [];
		for (let tick = 1; tick <= untilTick + 5; tick++) {
			const state: GameState = midGameState({ ballSave: { untilTick, sources: [BALL_SAVE_SOURCE] } });
			const projected = lampsOf({ ...state, tick }, HURRY_UP_TICKS).l_ball_save;
			if (tick > untilTick) {
				expect(projected, `tick ${tick} is past the displayed expiry -- must be off`).toEqual({ role: 'off', step: 0 });
				continue;
			}
			if (projected.role === 'lit' && projected.step === 1) step1Ticks.push(tick);
			else if (projected.role === 'lit' && projected.step === 3) step3Ticks.push(tick);
		}
		expect(step1Ticks.length, 'a non-empty step-1 span').toBeGreaterThan(0);
		expect(step3Ticks.length, 'a non-empty step-3 span').toBeGreaterThan(0);
		expect(Math.max(...step1Ticks), 'every step-3 tick must be later than every step-1 tick').toBeLessThan(Math.min(...step3Ticks));
		// Code review (Story 2.9, Rule 19): "non-empty" alone does not pin the
		// hurry-up's LENGTH -- shortening `isWithinHurryUp`'s span to a single
		// tick (`tick > untilTick - 1`) leaves a non-empty step-1 span, a
		// non-empty step-3 span and correct ordering, so the whole suite stayed
		// green with a one-tick hurry-up warning. epics.md AC 2 promises the
		// insert "moves to step 3 for the last `ballSaveHurryUpMs`", so the span
		// itself is asserted here, from the AUTHORED literal (20) rather than
		// from the tunable under test.
		expect(step3Ticks.length, 'the step-3 span must be exactly the authored hurry-up window, not merely non-empty').toBe(HURRY_UP_TICKS);
		expect(Math.min(...step3Ticks), 'the hurry-up must open at untilTick - hurryUpTicks + 1').toBe(untilTick - HURRY_UP_TICKS + 1);
		expect(Math.max(...step3Ticks), 'the hurry-up must run to the displayed expiry inclusive').toBe(untilTick);
	});
});

describe('AC 3 / AC 4 -- a live drain re-serves instead of ending the ball; the autolaunch is deferred to the served ball\'s arrival', () => {
	it('drain inside the window: ball_saved is emitted, no ball_ended, currentPlayer/ballNumber/modes unchanged, a c_trough_eject pulse lands in the drain tick\'s own batch -- and the deferred c_autolaunch pulse fires only once the re-served ball arrives, never in the drain tick\'s own batch', () => {
		const initialState = midGameState({ ballSave: { untilTick: 500, sources: ['test'] } });

		const script = close('s_trough_1').at(1) // the drain, well inside the window
			.close('s_shooter_lane').at(5) // the re-served ball arrives at bd_shooter
			.build();
		const result = runRulesScript(script, { durationTicks: 5, initialState });

		const saved = result.events.filter((e) => e.type === 'ball_saved');
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ type: 'ball_saved', player: 0, tick: 1 });
		expect(result.events.some((e) => e.type === 'ball_ended'), 'a save must never also emit ball_ended').toBe(false);

		const afterDrain = result.statesByTick.get(1)!;
		expect(afterDrain.currentPlayer, 'currentPlayer must be unchanged by a save').toBe(0);
		expect(afterDrain.players[0]!.ballNumber, 'ballNumber must be unchanged by a save').toBe(2);
		expect(afterDrain.modes, 'modes[] must be unchanged by a save').toEqual([{ mode: 'stub', priority: 100, player: 0 }]);

		const drainTickPulses = result.coilCommands.filter((c) => c.tick === 1 && c.action === 'pulse');
		expect(drainTickPulses.some((c) => c.coil === TROUGH_EJECT_COIL), 'the drain tick must pulse c_trough_eject to re-serve').toBe(true);
		expect(
			drainTickPulses.some((c) => c.coil === SHOOTER_LAUNCH_COIL),
			'the autolaunch coil must be ABSENT from the drain tick\'s own batch -- a same-tick pulse fires into an empty lane and launches nothing',
		).toBe(false);

		const arrivalTickPulses = result.coilCommands.filter((c) => c.tick === 5 && c.action === 'pulse');
		expect(
			arrivalTickPulses.some((c) => c.coil === SHOOTER_LAUNCH_COIL),
			'the re-served ball\'s own arrival at bd_shooter must, and only then, pulse the autolaunch coil',
		).toBe(true);
	});

	it('drain inside grace (past the displayed expiry but strictly before the grace deadline) is saved exactly the same way', () => {
		const initialState = midGameState({ ballSave: { untilTick: 10, sources: ['test'] } });
		const OVERRIDE_TUNING = resolveTuning({ ...RAW_TUNING, ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 50 } });
		const graceTicks = shotWindowTicks('ballSaveGraceMs', OVERRIDE_TUNING);
		// QA (Story 2.9 Verification correction): the midpoint of the grace span,
		// not `10 + graceTicks` -- that value IS the grace deadline itself, which
		// duplicated (and was mislabeled relative to) the dedicated exact-boundary
		// probe in the "AC 11" describe block below. This tick sits strictly
		// between the displayed expiry (10) and the deadline (10 + graceTicks),
		// so it exercises a genuinely different case and is untouched by the
		// isWithinGrace() `<=` -> `<` boundary mutation that reddens only the
		// exact-deadline probe.
		const drainTick = 10 + Math.floor(graceTicks / 2);
		expect(drainTick, 'sanity: must land strictly inside the grace span, touching neither edge').toBeGreaterThan(10);
		expect(drainTick).toBeLessThan(10 + graceTicks);

		const result = runRulesScript(close('s_trough_1').at(drainTick).build(), {
			durationTicks: drainTick,
			initialState,
			tuning: OVERRIDE_TUNING,
		});

		expect(result.events.filter((e) => e.type === 'ball_saved')).toHaveLength(1);
		expect(result.events.some((e) => e.type === 'ball_ended')).toBe(false);
	});

	it('enabled but never launched: untilTick stays null, so a drain is NOT saved -- the ball ends normally', () => {
		const initialState = midGameState({ ballSave: { untilTick: null, sources: [BALL_SAVE_SOURCE] } });
		const result = runRulesScript(close('s_trough_1').at(1).build(), { durationTicks: 1, initialState });

		expect(result.events.some((e) => e.type === 'ball_ended'), 'enabled-but-not-armed must drain normally').toBe(true);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(false);
	});

	it('drain past grace: the ball ends normally', () => {
		const initialState = midGameState({ ballSave: { untilTick: 10, sources: ['test'] } });
		const OVERRIDE_TUNING = resolveTuning({ ...RAW_TUNING, ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 5 } });
		const graceTicks = shotWindowTicks('ballSaveGraceMs', OVERRIDE_TUNING);

		const result = runRulesScript(close('s_trough_1').at(10 + graceTicks + 1).build(), {
			durationTicks: 10 + graceTicks + 1,
			initialState,
			tuning: OVERRIDE_TUNING,
		});

		expect(result.events.some((e) => e.type === 'ball_ended'), 'past grace, the drain must end the ball normally').toBe(true);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(false);
		expect(result.finalState.machine.ballSave.untilTick, 'the device must be disarmed once grace lapses').toBeNull();
	});
});

describe('the grace lapse disarms the WHOLE device, in isolation from any drain', () => {
	it('once grace lapses with no drain at all, both untilTick AND sources are cleared', () => {
		// Code review (Story 2.9): the "drain past grace" test above pins only
		// `untilTick`, and it cannot pin `sources` -- its drain ends the ball in
		// the same tick, and the rotation's own `startBall()` immediately
		// re-enables the controller's source, so the post-drain list is never
		// empty. Observed with no drain, the lapse resets the device WHOLE
		// (`EMPTY_BALL_SAVE`). That is the decided behaviour and it matters
		// downstream: Story 2.11's `disarm(source)` and Story 3.7's second
		// source both read this list, and the controller silently empties it
		// partway through every ball.
		const initialState = midGameState({ ballSave: { untilTick: 10, sources: ['test'] } });
		const OVERRIDE_TUNING = resolveTuning({ ...RAW_TUNING, ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 5 } });

		// No switch closes at all -- the device expires purely on the clock.
		const result = runRulesScript(close('s_dragon_d').at(30).build(), { durationTicks: 30, initialState, tuning: OVERRIDE_TUNING });

		expect(result.statesByTick.get(15)!.machine.ballSave, 'at the grace deadline the device is still armed').toEqual({
			untilTick: 10,
			sources: ['test'],
		});
		expect(result.statesByTick.get(16)!.machine.ballSave, 'one tick past the grace deadline the WHOLE device is reset').toEqual({
			untilTick: null,
			sources: [],
		});
	});
});

describe('AC 5 -- arbitration: sources stack, the longest window wins, disarm never throws', () => {
	it('two sources with different effective deadlines: untilTick is the max; disarm(non-max-setter) leaves the max; disarm(the survivor) returns untilTick to null; disarm of a never-armed source is a same-object no-op', () => {
		let state: BallSaveState = EMPTY_BALL_SAVE;
		// 'x' is armed FIRST and carries the LARGER deadline (100); 'y' is armed
		// SECOND (later call) but carries the SMALLER one (50) -- deliberately
		// ordered this way so "last write wins" (Rule 19's own named mutation)
		// would pick 'y's 50, discriminating it from the real "longest window
		// wins" (100), which a same-valued or increasing-by-call-order pair of
		// deadlines could not (Rule 19: caught vacuous against the increasing
		// pair this test originally used -- see its own revert history).
		state = armBallSave(state, { ticks: 90, source: 'x' }, 10); // x's own deadline: 100 (the max)
		state = armBallSave(state, { ticks: 20, source: 'y' }, 30); // y's own deadline: 50
		expect(state.untilTick, 'untilTick is the MAX of the two effective deadlines, not merely the last call\'s own value').toBe(100);
		expect([...state.sources].sort()).toEqual(['x', 'y']);

		const afterDisarmY = disarmBallSave(state, 'y');
		expect(afterDisarmY.sources).toEqual(['x']);
		expect(afterDisarmY.untilTick, 'disarming the NON-max-setter leaves the max-setter\'s own deadline live').toBe(100);

		const afterDisarmX = disarmBallSave(afterDisarmY, 'x');
		expect(afterDisarmX.sources).toEqual([]);
		expect(afterDisarmX.untilTick, 'disarming the LAST source returns untilTick to null').toBeNull();

		const unknownDisarm = disarmBallSave(afterDisarmX, 'never-armed');
		expect(unknownDisarm, 'an unknown source must be a no-op returning the SAME object, and must not throw').toBe(afterDisarmX);
	});

	it('enableBallSave records a source with the timer left stopped, and is idempotent for a source already present', () => {
		const enabled = enableBallSave(EMPTY_BALL_SAVE, 'z');
		expect(enabled).toEqual({ untilTick: null, sources: ['z'] });
		expect(enableBallSave(enabled, 'z'), 'enabling an already-present source is a no-op returning the SAME object').toBe(enabled);
		// Code review (Story 2.9): `enableBallSave` PRESERVES an existing
		// deadline (it records a source, it never touches the timer). Its only
		// production caller passes EMPTY_BALL_SAVE, where `untilTick` is already
		// null, so that preservation was asserted by nothing -- a mutation
		// hard-coding `untilTick: null` survived the whole suite. Story 3.7's
		// second source is the first caller that can reach it with a live window.
		expect(
			enableBallSave({ untilTick: 100, sources: ['x'] }, 'y'),
			'enabling a SECOND source must not clear a running timer',
		).toEqual({ untilTick: 100, sources: ['x', 'y'] });
	});
});

describe('AC 6 -- Tilt makes the device inert', () => {
	it('a live window plus Tilt: the drain ends the ball normally, and l_ball_save projects off despite the live untilTick', () => {
		const initialState = midGameState({ ballSave: { untilTick: 500, sources: ['test'] }, tilted: true });
		const result = runRulesScript(close('s_trough_1').at(1).build(), { durationTicks: 1, initialState });

		expect(result.events.some((e) => e.type === 'ball_ended'), 'Tilt must make the device inert on drain').toBe(true);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(false);

		const tiltedButLive: GameState = { ...midGameState({ ballSave: { untilTick: 500, sources: ['test'] }, tilted: true }), tick: 1 };
		expect(lampsOf(tiltedButLive, 20).l_ball_save, 'l_ball_save must project off while tilted, even with a live untilTick').toEqual({
			role: 'off',
			step: 0,
		});
	});
});

describe('AC 9 -- the tunables are pinned by consequence, not by re-import', () => {
	const PRODUCTION_TUNING = resolveTuning();

	it('production tuning: a drain 3,000 ticks after the plunge is saved; a drain 30,000 ticks after the plunge ends the ball', () => {
		const saved = runRulesScript(close('s_start').at(1).open('s_shooter_lane').at(3).close('s_trough_1').at(3 + 3000).build(), {
			durationTicks: 3 + 3000,
			tuning: PRODUCTION_TUNING,
		});
		expect(saved.events.some((e) => e.type === 'ball_saved'), 'a drain 3,000 ticks after the plunge must be saved under production tuning').toBe(true);
		expect(saved.events.some((e) => e.type === 'ball_ended')).toBe(false);

		const ended = runRulesScript(close('s_start').at(1).open('s_shooter_lane').at(3).close('s_trough_1').at(3 + 30000).build(), {
			durationTicks: 3 + 30000,
			tuning: PRODUCTION_TUNING,
		});
		expect(ended.events.some((e) => e.type === 'ball_ended'), 'a drain 30,000 ticks after the plunge must end the ball under production tuning').toBe(true);
		expect(ended.events.some((e) => e.type === 'ball_saved')).toBe(false);
	});

	it('production tuning: a drain 500 ticks PAST the displayed expiry is still saved (the grace), and one 5,000 ticks past it is not', () => {
		// Code review (Story 2.9): `ballSaveGraceMs` had no consequence pin at
		// its production magnitude at all -- only `> 0`. Setting it to 1 left
		// every assertion in this describe block green (0 < 1), and the sole red
		// anywhere was `test/replay-goldens.test.ts`'s StaleReplayHeaderError,
		// whose remedy is exactly the header-only golden refresh this story just
		// performed. A 1 ms grace could therefore ship green. These two probes
		// bracket it behaviourally with offsets authored HERE (500 / 5,000),
		// never read back from the tunable under test -- the same discipline
		// AC 9's own 3,000/30,000-tick probes apply to `ballSaveMs`.
		const PLUNGE = 3;
		const DISPLAYED_EXPIRY = PLUNGE + 8000; // production ballSaveMs at 1 kHz, spelled out
		const saved = runRulesScript(
			close('s_start').at(1).open('s_shooter_lane').at(PLUNGE).close('s_trough_1').at(DISPLAYED_EXPIRY + 500).build(),
			{ durationTicks: DISPLAYED_EXPIRY + 500, tuning: PRODUCTION_TUNING },
		);
		expect(saved.events.some((e) => e.type === 'ball_saved'), 'a drain 500 ticks past the displayed expiry must still be saved by the grace').toBe(true);
		expect(saved.events.some((e) => e.type === 'ball_ended')).toBe(false);

		const ended = runRulesScript(
			close('s_start').at(1).open('s_shooter_lane').at(PLUNGE).close('s_trough_1').at(DISPLAYED_EXPIRY + 5000).build(),
			{ durationTicks: DISPLAYED_EXPIRY + 5000, tuning: PRODUCTION_TUNING },
		);
		expect(ended.events.some((e) => e.type === 'ball_ended'), 'a drain 5,000 ticks past the displayed expiry is well beyond any sane grace and must end the ball').toBe(true);
		expect(ended.events.some((e) => e.type === 'ball_saved')).toBe(false);
	});

	it('0 < ballSaveHurryUpMs < ballSaveMs and ballSaveGraceMs > 0 hold on the resolved production tuning', () => {
		expect(PRODUCTION_TUNING.ballSaveHurryUpMs.value).toBeGreaterThan(0);
		expect(PRODUCTION_TUNING.ballSaveHurryUpMs.value).toBeLessThan(PRODUCTION_TUNING.ballSaveMs.value);
		expect(PRODUCTION_TUNING.ballSaveGraceMs.value).toBeGreaterThan(0);
	});
});

describe('AC 10 -- nothing arms outside a game', () => {
	it('phase: attract, ball_launched fires: machine.ballSave stays { untilTick: null, sources: [] }', () => {
		// DEFAULT_INITIAL_STATE (test/util/switch-script.ts) boots in phase 'attract' -- no s_start press here.
		const result = runRulesScript(open('s_shooter_lane').at(1).build(), { durationTicks: 1 });

		expect(result.finalState.phase, 'sanity: still in attract -- no s_start was pressed').toBe('attract');
		expect(result.events.some((e) => e.type === 'ball_launched'), 'sanity: the plunge event genuinely fired').toBe(true);
		expect(result.finalState.machine.ballSave).toEqual({ untilTick: null, sources: [] });
	});
});

describe('AC 11 -- the drain boundary is straddled on both sides (Rule 19: distinguishes <= from <)', () => {
	// Independently authored small literals (never read back from shotWindowTicks()) -- 100 ms / 30 ms at the
	// live 1 kHz tick rate resolve to 100 / 30 ticks; the four probes below are scripted at ABSOLUTE ticks
	// spelled out from those two literals, not from the resolved tuning.
	const BOUNDARY_TUNING = resolveTuning({
		...RAW_TUNING,
		ballSaveMs: { ...RAW_TUNING.ballSaveMs, value: 100 },
		ballSaveGraceMs: { ...RAW_TUNING.ballSaveGraceMs, value: 30 },
	});
	const PLUNGE_TICK = 3;
	const BALL_SAVE_TICKS = 100;
	const GRACE_TICKS = 30;
	const UNTIL_TICK = PLUNGE_TICK + BALL_SAVE_TICKS; // 103, independently derived from the same authored literal shotWindowTicks() would resolve to -- never called here.

	function runDrainAt(drainTick: number) {
		const script = close('s_start').at(1).open('s_shooter_lane').at(PLUNGE_TICK).close('s_trough_1').at(drainTick).build();
		return runRulesScript(script, { durationTicks: drainTick, tuning: BOUNDARY_TUNING });
	}

	it(`untilTick - 1 (${UNTIL_TICK - 1}): saved`, () => {
		const result = runDrainAt(UNTIL_TICK - 1);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(true);
		expect(result.events.some((e) => e.type === 'ball_ended')).toBe(false);
	});

	it(`untilTick + graceTicks - 1 (${UNTIL_TICK + GRACE_TICKS - 1}): saved`, () => {
		const result = runDrainAt(UNTIL_TICK + GRACE_TICKS - 1);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(true);
		expect(result.events.some((e) => e.type === 'ball_ended')).toBe(false);
	});

	it(`untilTick + graceTicks EXACTLY (${UNTIL_TICK + GRACE_TICKS}): saved -- the probe that distinguishes <= from <`, () => {
		const result = runDrainAt(UNTIL_TICK + GRACE_TICKS);
		expect(result.events.some((e) => e.type === 'ball_saved'), 'the grace comparison is inclusive <=').toBe(true);
		expect(result.events.some((e) => e.type === 'ball_ended')).toBe(false);
	});

	it(`untilTick + graceTicks + 1 (${UNTIL_TICK + GRACE_TICKS + 1}): ends`, () => {
		const result = runDrainAt(UNTIL_TICK + GRACE_TICKS + 1);
		expect(result.events.some((e) => e.type === 'ball_ended')).toBe(true);
		expect(result.events.some((e) => e.type === 'ball_saved')).toBe(false);
	});
});

// Sanity import-use (avoids an "unused import" complaint under a stricter tsconfig than this repo currently ships): isRunning/isWithinGrace/isWithinHurryUp are exercised directly here, once each, beyond their indirect exercise via lampsOf()/runRulesScript() above.
describe('ball-save.ts predicates -- direct sanity', () => {
	it('isRunning / isWithinHurryUp / isWithinGrace agree with the drain-branch composition above', () => {
		const state: BallSaveState = { untilTick: 100, sources: ['x'] };
		expect(isRunning(state, 100)).toBe(true);
		expect(isRunning(state, 101)).toBe(false);
		expect(isWithinHurryUp(state, 95, 10)).toBe(true);
		expect(isWithinHurryUp(state, 80, 10)).toBe(false);
		// Code review (Story 2.9, Rule 19): the hurry-up's OPENING boundary is
		// exclusive (`tick > untilTick - hurryUpTicks`), and until these two
		// probes existed nothing in the suite straddled it -- flipping that `>`
		// to `>=` moved the step-1/step-3 transition by one tick with all 1854
		// tests green. This is the same shape the epic's own AC 11 amendment
		// fixed one function over, where three probes could not distinguish
		// `<=` from `<` at the grace deadline.
		expect(isWithinHurryUp(state, 90, 10), 'exactly untilTick - hurryUpTicks is NOT yet the hurry-up (the bound is exclusive)').toBe(false);
		expect(isWithinHurryUp(state, 91, 10), 'the tick after it IS the first hurry-up tick').toBe(true);
		expect(isWithinGrace(state, 105, 10)).toBe(true);
		expect(isWithinGrace(state, 111, 10)).toBe(false);
	});
});

// Code review pass 1 (blind-hunter + edge-case-hunter, converging on the
// same root: `awaitingSaveLaunch` is cross-tick, controller-instance-local
// state that `machine.ballSave` itself has no analogue for -- it cannot be
// seeded through `midGameState()`/`runRulesScript()`'s own initial-state
// surface, so these two tests drive `createBallController()` directly,
// calling `.step()` by hand across ticks the way `sim/rules/index.ts`'s own
// `step()` does (minus the `applyDeviceEvents()`/`deriveDeviceSlots()`
// accounting this narrow surface does not need: `ballsInPlay` is seeded
// already-decremented, exactly as the real pipeline hands it to the
// controller at `sim/rules/index.ts:236`).
describe('Code review pass 1 -- the deferred autolaunch respects Tilt, and awaitingSaveLaunch resets at ball_will_start', () => {
	const ADJUSTMENTS = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 };

	function twoPlayerState(ballSave: BallSaveState, tilted: boolean): GameState {
		return {
			tick: 0,
			phase: 'game',
			machine: {
				ballsInPlay: 0, // already decremented -- mirrors what applyDeviceEvents() hands the controller in production
				hardwareEnabled: true,
				ballSave,
				tilt: { tilted, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
			},
			players: [emptyPlayer(1), emptyPlayer(0)],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};
	}

	it("a Tilt that engages between a save's own trough-eject and the re-served ball's own arrival at bd_shooter suppresses the deferred autolaunch pulse -- and the flag is consumed either way, so a LATER, non-tilted arrival does not also fire it", () => {
		const controller = createBallController(ADJUSTMENTS, resolveTuning());

		const drainEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 }];
		const drainResult = controller.step(twoPlayerState({ untilTick: 500, sources: ['test'] }, false), drainEvents, 1);
		expect(drainResult.events.some((e) => e.type === 'ball_saved'), "sanity: the drain must be saved so the deferred-autolaunch flag is armed").toBe(true);

		const arrivalEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 5 }];
		const tiltedArrival = controller.step({ ...drainResult.state, tick: 5, machine: { ...drainResult.state.machine, tilt: { tilted: true, slamTilted: false } } }, arrivalEvents, 5);
		expect(
			tiltedArrival.coilCommands.some((c) => c.coil === SHOOTER_LAUNCH_COIL),
			'a Tilt engaged before the re-served ball\'s own arrival must suppress the deferred autolaunch pulse',
		).toBe(false);

		// The flag must be CONSUMED by the tilted arrival, not left pending for
		// a later one -- a second, later, non-tilted arrival at bd_shooter must
		// not ALSO fire the coil.
		const laterArrivalEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 9 }];
		const laterArrival = controller.step({ ...tiltedArrival.state, tick: 9, machine: { ...tiltedArrival.state.machine, tilt: { tilted: false, slamTilted: false } } }, laterArrivalEvents, 9);
		expect(
			laterArrival.coilCommands.some((c) => c.coil === SHOOTER_LAUNCH_COIL),
			'the flag must be consumed by the first (tilted) arrival, not still pending for a later, unrelated one',
		).toBe(false);
	});

	it('awaitingSaveLaunch is reset at ball_will_start -- a save whose re-serve never reaches bd_shooter before the NEXT ball starts must not auto-launch that unrelated ball', () => {
		const controller = createBallController(ADJUSTMENTS, resolveTuning());

		const drainEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 }];
		const drainResult = controller.step(twoPlayerState({ untilTick: 500, sources: ['test'] }, false), drainEvents, 1);
		expect(drainResult.events.some((e) => e.type === 'ball_saved'), "sanity: the drain must be saved so the deferred-autolaunch flag is armed").toBe(true);

		// The re-served ball never arrives. Instead an UNRELATED, ordinary drain
		// (ball save not live) ends the ball and rotates to the next player,
		// which -- via startBall() -- must reset the stale flag.
		const rotationState: GameState = { ...twoPlayerState({ untilTick: null, sources: [] }, false), tick: 50 };
		const rotationEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 50 }];
		const rotationResult = controller.step(rotationState, rotationEvents, 50);
		expect(rotationResult.events.some((e) => e.type === 'ball_ended'), 'sanity: this second drain must end the ball normally (not saved), triggering rotation').toBe(true);
		expect(rotationResult.state.currentPlayer, 'sanity: rotation actually moved to the next player').toBe(1);

		// The NEXT player's own, entirely ordinary arrival at bd_shooter must NOT
		// auto-launch -- the stale flag from the FIRST player's earlier save must
		// have been cleared by the rotation's own startBall() call.
		const nextArrivalEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 55 }];
		const nextArrivalResult = controller.step({ ...rotationResult.state, tick: 55 }, nextArrivalEvents, 55);
		expect(
			nextArrivalResult.coilCommands.some((c) => c.coil === SHOOTER_LAUNCH_COIL),
			"a stale awaitingSaveLaunch from an earlier, unrelated save must not auto-launch the NEXT ball's own first arrival",
		).toBe(false);
	});
});

describe("Rework iteration 1 (DW-218) -- a save's own re-serve does not re-arm the window", () => {
	it("a full save-and-relaunch cycle (drain, arrival at bd_shooter, the resulting ball_launched) leaves untilTick and sources EXACTLY as the original plunge set them -- no ball_save_timer_started is emitted a second time", () => {
		const initialState = midGameState({ ballSave: { untilTick: 500, sources: [BALL_SAVE_SOURCE] } });

		// Code review (Story 2.9, rework iteration 1): before this fix, EVERY
		// `ball_launched` armed unconditionally in phase 'game', including the
		// one this save's own deferred autolaunch causes -- measured at
		// production tuning, real physics, seed 0, no player input: 28
		// `ball_saved` and ZERO `ball_ended` in 120,000 ticks, because every
		// re-serve re-armed a fresh full window. The fix is the discriminator
		// `awaitingSaveRelaunch` in `ball-controller.ts`: set only when the
		// deferred-autolaunch pulse below actually fires, consumed by the very
		// `ball_launched` it causes.
		const script = close('s_trough_1').at(1) // the drain, well inside the window -- ball_saved, awaitingSaveLaunch = true
			.close('s_shooter_lane').at(5) // the re-served ball arrives at bd_shooter -- autolaunch pulses, awaitingSaveRelaunch = true
			.open('s_shooter_lane').at(8) // the resulting re-launch -- the SAME event a player's own plunge would produce
			.build();
		const result = runRulesScript(script, { durationTicks: 8, initialState });

		const relaunches = result.events.filter((e) => e.type === 'ball_launched');
		expect(relaunches, 'sanity: the deferred autolaunch must have genuinely produced a ball_launched').toHaveLength(1);
		expect(relaunches[0]!.tick).toBe(8);

		expect(
			result.events.some((e) => e.type === 'ball_save_timer_started'),
			"the save's own re-serve must NOT emit a second ball_save_timer_started",
		).toBe(false);
		expect(
			result.finalState.machine.ballSave,
			'untilTick and sources must be EXACTLY what the original plunge set -- unchanged by the relaunch',
		).toEqual({ untilTick: 500, sources: [BALL_SAVE_SOURCE] });
	});
});

describe('Rework iteration 1 (DW-218) -- the enableBallSave gate has a real behavioural consequence, not just an event-stream one', () => {
	it('a ball_launched in phase "game" while the controller\'s own source was never enabled (sources: []) does not arm -- today, deleting the enable step entirely left the arming path silently working', () => {
		// Code review (Story 2.9, rework iteration 1): `armBallSave` never
		// checked whether the controller's OWN source was already present in
		// `sources` -- so AC 1's enable-is-not-a-start distinction existed only
		// in the event stream, never in behaviour. Simulates "enable never ran"
		// directly through the initial-state seam (the same technique
		// `midGameState()` already uses for every other drain-branch test),
		// since there is no source-level way to skip ball_starting's own
		// `enableBallSave()` call without editing `ball-controller.ts` itself.
		const initialState = midGameState({ ballSave: { untilTick: null, sources: [] } });
		const result = runRulesScript(open('s_shooter_lane').at(1).build(), { durationTicks: 1, initialState });

		expect(result.events.some((e) => e.type === 'ball_launched'), 'sanity: the plunge event genuinely fired').toBe(true);
		expect(
			result.events.some((e) => e.type === 'ball_save_timer_started'),
			'a source that was never enabled must not arm',
		).toBe(false);
		expect(result.finalState.machine.ballSave, 'ballSave must stay exactly as seeded -- nothing arms an un-enabled source').toEqual({
			untilTick: null,
			sources: [],
		});
	});
});

describe('Rework iteration 1 (DW-218) -- awaitingSaveRelaunch resets at ball_will_start, mirroring awaitingSaveLaunch\'s own reset', () => {
	const ADJUSTMENTS = { pitchDeg: TABLE.reference.pitchDeg, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 };

	function twoPlayerState(ballSave: BallSaveState, tilted: boolean): GameState {
		return {
			tick: 0,
			phase: 'game',
			machine: {
				ballsInPlay: 0,
				hardwareEnabled: true,
				ballSave,
				tilt: { tilted, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false], bd_lock: [false, false, false] },
			},
			players: [emptyPlayer(1), emptyPlayer(0)],
			currentPlayer: 0,
			modes: [],
			rng: 0,
		};
	}

	it("a save's deferred-autolaunch pulse fires (arming awaitingSaveRelaunch), but the re-served ball never actually reaches ball_launched before an UNRELATED drain ends the ball and rotates -- the next player's own genuine first plunge must still arm normally, not be silently swallowed as a stale relaunch", () => {
		const controller = createBallController(ADJUSTMENTS, resolveTuning());

		const drainEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 1 }];
		const drainResult = controller.step(twoPlayerState({ untilTick: 500, sources: ['test'] }, false), drainEvents, 1);
		expect(drainResult.events.some((e) => e.type === 'ball_saved'), 'sanity: the drain must be saved so the deferred-autolaunch flag is armed').toBe(true);

		const arrivalEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_shooter', slot: 0, tick: 5 }];
		const arrivalResult = controller.step({ ...drainResult.state, tick: 5 }, arrivalEvents, 5);
		expect(
			arrivalResult.coilCommands.some((c) => c.coil === SHOOTER_LAUNCH_COIL),
			'sanity: the arrival must fire the deferred autolaunch pulse, arming awaitingSaveRelaunch',
		).toBe(true);

		// The re-served ball never reaches ball_launched (no such event is fed
		// below). Instead an UNRELATED, ordinary drain (ball save not live) ends
		// the ball and rotates to the next player, which -- via startBall() --
		// must reset the stale awaitingSaveRelaunch flag exactly as it already
		// resets awaitingSaveLaunch.
		const rotationState: GameState = { ...twoPlayerState({ untilTick: null, sources: [] }, false), tick: 50 };
		const rotationEvents: DeviceEvent[] = [{ type: 'device_ball_entered', device: 'bd_trough', slot: 0, tick: 50 }];
		const rotationResult = controller.step(rotationState, rotationEvents, 50);
		expect(rotationResult.events.some((e) => e.type === 'ball_ended'), 'sanity: this second drain must end the ball normally (not saved), triggering rotation').toBe(true);
		expect(rotationResult.state.currentPlayer, 'sanity: rotation actually moved to the next player').toBe(1);

		// The NEXT player's own, entirely genuine plunge must arm normally -- a
		// stale awaitingSaveRelaunch from the FIRST player's earlier, abandoned
		// save would otherwise swallow this as a non-arming "relaunch" it is not.
		const nextPlungeEvents: DeviceEvent[] = [{ type: 'ball_launched', tick: 55 }];
		const nextPlungeResult = controller.step({ ...rotationResult.state, tick: 55 }, nextPlungeEvents, 55);
		expect(
			nextPlungeResult.events.some((e) => e.type === 'ball_save_timer_started'),
			"the next player's own genuine plunge must arm -- a stale awaitingSaveRelaunch must not have swallowed it",
		).toBe(true);
	});
});
