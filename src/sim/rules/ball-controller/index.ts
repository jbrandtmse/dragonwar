// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5: the ball controller. AD-6/AD-18 -- the sole owner of the real
// ball lifecycle: Start creates a game and a player from `GameStart`, further
// Start presses add players up to four before ball 1 ends, this module alone
// pulses `c_trough_eject` to serve, a drain ends the ball and rotates to the
// next player or the next ball, and the last player's last ball ends the
// game.
//
// Story 2.13 widens that last clause: the last player's last ball ends the
// game by firing `game_ended { scores }` and arming a closure-held sequence
// (`./game-over.ts`) that, unattended, draws the Match from `GameState.rng`
// and returns the machine to Attract via the shared `enterAttract()` helper
// (`./shared.ts`, exported so `sim/rules/tilt.ts`'s Slam path uses the SAME
// implementation). AD-6 amended (DW-244, author decision 2026-09-11): EVERY
// `startBall()` call clears stray balls itself before serving (`./start.ts`,
// `./serve-recovery.ts`). AD-19: consumes the devices-and-shots layer's OWN
// event vocabulary (`DeviceEvent`) -- `button_pressed { button }`,
// `device_ball_entered/_left`, `bank_target_down`, `ball_launched` -- never a
// raw `SwitchEvent`; no file in this directory names an `s_`/`c_`/`bd_`-
// prefixed string literal anywhere (AD-16's `no-device-name-literal`),
// reaching every device/coil name it needs through `TABLE` property access
// or through-`TABLE` derivation (DW-149), the same discipline
// `sim/rules/devices/index.ts` already keeps.
//
// Story 3.1 (DW-290): the Epic 2 monolith `ball-controller.ts` (1,340 lines,
// one 566-line `step()`) is split into this directory with no change of
// behaviour. `step()` below is a skeleton that calls the seams in the
// monolith's own order -- S0 search observe, S1 bonus count-down drain, S2
// resets and the stray-clear snapshot, S3 game over / Match, S4 save
// expiries, S5 letters fold, S6 Start / Hot seat, S7 plunge arm and
// autolaunch, S8 drain gate / S8a save re-serve (with its early return) /
// S8b-d ball end, S9 recover report, S10 overflow ejects, S11 search step,
// S12 the DW-235 filter -- threading `nextState` and one mutable
// `TickOutput` accumulator. The five closure `let`s are the fields of one
// `ControllerState` record (`./shared.ts`). The files:
// - `./shared.ts`: the leaf -- constants, types and `enterAttract()`;
// - `./accounting.ts`: `applyDeviceEvents()`, `deriveDeviceSlots()`,
//   `applyRecovery()` and the letters fold;
// - `./start.ts`: `emptyPlayer()`, `startBall()` and S6;
// - `./save-serve.ts`: S4, S7 and S8a;
// - `./ball-end.ts`: the bonus schedule, S1, the S8 gate, S8b-d and S12;
// - `./game-over.ts`: the game-over sequence, S2 (its half), S3, the
//   resolved gate S6 reads and the S8c arm;
// - `./serve-recovery.ts`: S2 (the stray half and the snapshot), S9-S11.

import { createBallSearch } from '../ball-search';
import { createProductionModeRegistry, type ModeLookup } from '../modes';
import { shotWindowTicks, type ResolvedTuning } from '../../table/tuning';
import { foldDragonLetters } from './accounting';
import { ballEndGateOpen, drainBonusCountSteps, endBall, withoutStaleBonusSteps } from './ball-end';
import { discardStaleGameOverSequence, stepGameOverSequence } from './game-over';
import { armSaveOrAutolaunch, expireBallSave, serveBallSave } from './save-serve';
import { answerOverflows, discardStaleStrayClear, reportRecovery, stepBallSearch } from './serve-recovery';
import { handleStartButton } from './start';
import type { BallController, BallControllerStepResult, ControllerContext, ControllerState, TickOutput } from './shared';
import type { DeviceEvent } from '../devices';
import type { GameAdjustments } from '../../contracts/replay';
import type { GameState, MachineReport } from '../../table/names';

export { applyDeviceEvents, applyRecovery, deriveDeviceSlots } from './accounting';
export { BALL_SAVE_SOURCE, enterAttract, HARDWARE_COILS } from './shared';
export type { BallController, BallControllerStepResult } from './shared';

/**
 * `createBallController(adjustments, tuning)` mirrors `createDevicesLayer(tuning)`:
 * `adjustments` (AD-14, `GameStart.adjustments`) is resolved once at
 * construction -- `ballsPerGame`'s threshold, used every drain, is not
 * re-derived per tick. Story 2.9 widens this with `tuning` (AD-3/AD-15):
 * the ball controller now owns `machine.ballSave`, whose three durations
 * (`ballSaveMs`/`ballSaveHurryUpMs`/`ballSaveGraceMs`) are resolved to
 * ticks here, ONCE, exactly like `createShotTracker(tuning)`'s own
 * construction-time resolution of `TABLE.shots[*].windowMs`.
 *
 * Story 3.1 (AD-8): `modes` is the mode registry whose stop hooks the ball
 * end and the Attract transition run -- `createRules()` passes the mode
 * stack's own. Omitted (a test building the controller alone), it is a fresh
 * registry of the production definitions.
 */
export function createBallController(
	adjustments: GameAdjustments,
	tuning: ResolvedTuning,
	modes: ModeLookup = createProductionModeRegistry(tuning),
): BallController {
	// `ballSaveHurryUpMs` is resolved and consumed by `sim/rules/lamps.ts`'s
	// own projection instead -- the controller itself never needs to know
	// the hurry-up window, only when the timer starts (`ballSaveTicks`) and
	// how long a drain still saves past the displayed expiry
	// (`ballSaveGraceTicks`).
	const ballSaveTicks = shotWindowTicks('ballSaveMs', tuning);
	const ballSaveGraceTicks = shotWindowTicks('ballSaveGraceMs', tuning);
	// Story 2.10 (AD-3/AD-15): the end-of-ball bonus count-down's own pace,
	// resolved once here exactly like the two ball-save windows above --
	// `armBonusCountSchedule()` (`./ball-end.ts`) is the one reader.
	//
	// Story 3.0 (DW-286): clamped to at least 1 tick at this ONE derivation
	// site, exactly like its three game-over neighbours below and for the same
	// reason. `bonusCountMs: 0` resolves (DW-35 admits an authored 0) and the
	// dev tuning panel hot-applies it; unclamped, every step fell due ON the
	// arming tick, whose top-of-step() drain had already run before the
	// schedule existed, so no step was ever emitted and the Backglass never
	// reached BONUS 0. Clamped, the steps land one tick apart from t+1.
	const bonusCountTicks = Math.max(1, shotWindowTicks('bonusCountMs', tuning));
	// Story 2.13 (AD-3/AD-15): the game-over sequence's own three paced
	// durations, resolved once here exactly like the ball-save/bonus windows
	// above -- the game-over seams (`./game-over.ts`) are the only readers.
	//
	// Code review (second pass, the named follow-up risk): all THREE are
	// clamped to at least 1 tick, at this ONE derivation site. A `...Ms` of
	// exactly 0 is reachable -- `resolveTuning()` rejects a NEGATIVE `...Ms` but
	// not zero, and Story 1.9's dev tuning panel hot-applies any finite
	// non-negative value to the running sim -- and each zero silently breaks a
	// different part of Story 2.13's arithmetic:
	//   * `matchDelayMs: 0` puts `matchTick` on the arming tick itself, whose
	//     one chance to fire was the top-of-step() check that already ran
	//     earlier this same tick, before the sequence existed: no `match_drawn`
	//     ever (the first pass clamped this at the use site; the clamp now
	//     lives here with its two siblings);
	//   * `matchRevealMs: 0` collapses `resolvedTick` onto `matchTick` and
	//     makes `ticksSinceMatch % matchRevealTicks` evaluate to `NaN`, which
	//     is never `=== 0`: the Match resolves with no reveal step ever
	//     emitted, so the player never sees a number. (Note for the record:
	//     the first pass's `matchRevealTicks > 0 &&` conjunct was behaviour-
	//     NEUTRAL, because `NaN === 0` was already false -- it documented the
	//     defect rather than fixing it. This clamp is the fix.)
	//   * `attractMs: 0` puts `attractTick` ON `resolvedTick`, so
	//     `enterAttract()` lands in the same tick as the tenth reveal step and
	//     `advanceBackglass()`'s Attract branch drops `heldMatch`: the
	//     resolution (`MATCH nn`) is never rendered at all. This was the third
	//     instance of the shape, traced as harmless by the first pass and
	//     re-verified here as real.
	// Production's authored values (5000 / 250 / 8000) are unaffected.
	const matchDelayTicks = Math.max(1, shotWindowTicks('matchDelayMs', tuning));
	const matchRevealTicks = Math.max(1, shotWindowTicks('matchRevealMs', tuning));
	const attractTicks = Math.max(1, shotWindowTicks('attractMs', tuning));

	// Story 2.12 (AD-18): the search's own seat -- ONE instance for the life
	// of this controller (mirrors every other cross-tick component this
	// directory/`createDevicesLayer()` already instantiate), never module-level.
	const ballSearch = createBallSearch(tuning);

	// Story 3.1 (DW-290): the five closure fields, one record -- each field's
	// own history is on `ControllerState` (`./shared.ts`).
	const cs: ControllerState = {
		awaitingSaveLaunch: false,
		awaitingSaveRelaunch: null,
		pendingBonusCountSteps: [],
		gameOverSequence: null,
		pendingStrayClear: null,
	};

	const ctx: ControllerContext = {
		adjustments,
		tuning,
		ballSaveTicks,
		ballSaveGraceTicks,
		bonusCountTicks,
		matchDelayTicks,
		matchRevealTicks,
		attractTicks,
		ballSearch,
		modes,
		cs,
	};

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, machineReport: MachineReport): BallControllerStepResult {
		// S0. Story 2.12 (task 14): the search's own edge fold is the FIRST
		// statement of step() -- ahead of the bonus-step drain below and, more
		// importantly, ahead of the ball-save re-serve's own early return
		// further down, so a tick's button/closure edges are never dropped by
		// that early return.
		ballSearch.observe(deviceEvents, tick);

		let nextState = state;
		const out: TickOutput = { events: [], coilCommands: [], ballWillStartEvents: [], recoverCommands: [], bankResetRequests: [], modeEvents: [] };

		drainBonusCountSteps(ctx, nextState, tick, out); // S1 (reads the INPUT phase)
		discardStaleGameOverSequence(ctx, tick); // S2
		const pendingStrayClearAtStart = discardStaleStrayClear(ctx, tick); // S2 + the DW-269 snapshot
		nextState = stepGameOverSequence(ctx, nextState, tick, out); // S3
		nextState = expireBallSave(ctx, nextState, tick); // S4
		nextState = foldDragonLetters(nextState, deviceEvents); // S5
		const started = handleStartButton(ctx, nextState, deviceEvents, tick, out); // S6
		nextState = started.state;
		const newGameStartedThisTick = started.newGameStartedThisTick;
		nextState = armSaveOrAutolaunch(ctx, nextState, deviceEvents, tick, out); // S7

		if (ballEndGateOpen(nextState, deviceEvents, machineReport, newGameStartedThisTick)) {
			// S8a: a live save re-serves instead -- the EARLY RETURN, which
			// skips S9-S12 exactly as the monolith did.
			if (serveBallSave(ctx, nextState, tick, out)) {
				return {
					state: nextState,
					events: out.events,
					coilCommands: out.coilCommands,
					ballWillStartEvents: out.ballWillStartEvents,
					recoverCommands: out.recoverCommands,
					bankResetRequests: out.bankResetRequests,
					modeEvents: out.modeEvents,
				};
			}
			nextState = endBall(ctx, nextState, tick, out); // S8b-S8d
		}

		reportRecovery(ctx, nextState, pendingStrayClearAtStart, machineReport, tick, out); // S9
		answerOverflows(machineReport, tick, out); // S10
		stepBallSearch(ctx, nextState, tick, out); // S11

		return {
			state: nextState,
			events: withoutStaleBonusSteps(out.events, newGameStartedThisTick), // S12
			coilCommands: out.coilCommands,
			ballWillStartEvents: out.ballWillStartEvents,
			recoverCommands: out.recoverCommands,
			bankResetRequests: out.bankResetRequests,
			modeEvents: out.modeEvents,
		};
	}

	return { step };
}
