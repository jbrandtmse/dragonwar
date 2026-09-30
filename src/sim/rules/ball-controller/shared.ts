// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (DW-290): the ball controller's leaf module. Every other file in
// `ball-controller/` imports from here and this file imports none of them, so
// `tools/dependency-cruiser.config.mjs`'s `no-circular` rule holds by
// construction. It holds the TABLE-derived constants (`START_BUTTON`, the
// coil derivations, `HARDWARE_COILS`, `BALL_SAVE_SOURCE`,
// `SHOOTER_LAUNCH_COIL`), the controller's types -- including the ONE
// `ControllerState` record that replaced the monolith's five closure `let`s
// -- and the shared `enterAttract()` helper.

import { TABLE } from '../../table/dragonwar';
import { stopAllModes } from '../modes/lifecycle';
import type { BallSearch } from '../ball-search';
import type { BankResetRequest, DeviceEvent } from '../devices';
import type { RecoverCommand } from '../../contracts/commands';
import type { BallWillStartEvent, BonusCountStepEvent } from '../../contracts/events';
import type { GameAdjustments } from '../../contracts/replay';
import type { CoilCommand, CoilName, GameState, MachineReport, SemanticEvent, ShowCommand, SwitchName } from '../../table/names';
import type { ResolvedTuning } from '../../table/tuning';
import type { ModeEvent } from '../modes/events';
import type { ModeLookup } from '../modes/registry';

/**
 * `s_start` -- assembled as a template literal purely so neither static chunk
 * ("s_", "start") alone matches AD-16's `no-device-name-literal` pattern
 * (each chunk is checked independently by the linter's own tokenizer).
 *
 * Review correction 2026-09-06 (blind-hunter): this line performs NO runtime
 * lookup against `TABLE` -- unlike `sim/loop/index.ts`'s own
 * `buttonSwitchByAction()`, which genuinely checks
 * `TABLE.switches[candidate]?.settleClass === 'button'` before trusting a
 * name, this is a bare `as SwitchName` cast on a literal. If `s_start` were
 * ever renamed in `TABLE`, this file would keep referencing the stale name
 * with no signal from lint, typecheck, or test; only `pnpm typecheck` failing
 * elsewhere (if the rename also changed the `SwitchName` union) would surface
 * it indirectly. Kept as a cast rather than a lookup because `sim/rules` does
 * not import `sim/loop` (the reverse of the real dependency direction) and a
 * local re-derivation of `buttonSwitchByAction()`'s own filter is more
 * machinery than one button name warrants; DW-149's own precedent covers
 * re-deriving a SET, not re-verifying a single literal.
 */
export const START_BUTTON = `s_${'start'}` as SwitchName;

/**
 * AD-5's own enumerated hardware-rule coils (flippers, slingshots, pop
 * bumpers -- "gated only by CoilCommand enable | disable; Tilt, game over and
 * Attract disable all of them together"), derived as the COMPLEMENT of every
 * coil a ball device names as its own eject coil or a `pulse` step in its
 * `ballSearchOrder` -- never a literal list of coil names (AD-16), and
 * structurally guaranteed to exclude `c_trough_eject`/`c_autolaunch`/`c_mouth`
 * (task 7: a `disable` for either would land in the SAME `coilCommands` batch
 * as this controller's own serve pulse and swallow it, DW-74's own
 * same-tick-wins-disable precedent, `test/coil-enable.test.ts`).
 *
 * Review finding 2026-09-06 (blind-hunter/edge-case-hunter/intent-alignment,
 * three independent hits on the same root cause): the plain complement also
 * swept in `TABLE.dropBankResetCoil` (`c_dragon_bank_reset`) -- a device-owned,
 * rules-pulsed coil (`sim/rules/devices/drop-bank.ts`, AD-19's own rule text:
 * "this module ALONE pulses `c_dragon_bank_reset`"), not an AD-5 hardware-rule
 * coil and not a ball-serving coil either. Excluded explicitly here, derived
 * from `TABLE` (never a literal), so the drop bank's own reset coil is never
 * force-disabled at game over nor force-enabled at ball start alongside the
 * real AD-5 set.
 */
function ballServingCoils(): ReadonlySet<CoilName> {
	const coils = new Set<CoilName>();
	for (const device of Object.values(TABLE.ballDevices)) {
		if ('ejectCoil' in device) {
			coils.add(device.ejectCoil as CoilName);
		}
		for (const step of device.ballSearchOrder) {
			if (step.action === 'pulse') {
				coils.add(step.coil as CoilName);
			}
		}
	}
	return coils;
}

function hardwareCoils(): readonly CoilName[] {
	const servingCoils = ballServingCoils();
	const deviceOwnedCoils: ReadonlySet<CoilName> = new Set([TABLE.dropBankResetCoil as CoilName]);
	return (Object.keys(TABLE.coils) as CoilName[]).filter(
		(coil) => !servingCoils.has(coil) && !deviceOwnedCoils.has(coil),
	);
}

/**
 * Exported (review finding 2026-09-06): lets a test assert the exact
 * enable/disable set without hand-duplicating this derivation (DW-149).
 * Story 2.11 gives this a SECOND, production reader: `sim/rules/tilt.ts`
 * imports it directly rather than re-deriving the same set a second time --
 * no longer test-only.
 */
export const HARDWARE_COILS: readonly CoilName[] = hardwareCoils();

/**
 * Story 2.9 (AD-18): the ball controller's own `machine.ballSave` source
 * name -- a plain identifying string, never a `TABLE` device/switch/coil
 * name, so it names no lint-tracked vocabulary at all. The only source this
 * story arms; Story 3.7 (Quick multiball) is the first second one.
 * Exported test-only (mirrors `HARDWARE_COILS` above): lets a test assert
 * against the real source name without hand-duplicating the literal.
 */
export const BALL_SAVE_SOURCE = 'ball-controller';

/**
 * Story 2.9, task 4/5 (AD-16, DW-149): `bd_shooter` is the table's ONE
 * `kind: 'non-parking'` ball device (`sim/table/dragonwar.ts`) -- a
 * `device_ball_entered` for it is unambiguously "a served ball arrived in
 * the shooter lane", the deferred-autolaunch hook, reached below via
 * `TABLE.ballDevices[event.device].kind`, never a `'bd_shooter'` literal
 * (AD-16's `no-device-name-literal`).
 */
function shooterLaunchCoil(): CoilName {
	const step = TABLE.ballDevices.bd_shooter.ballSearchOrder.find((candidate) => candidate.action === 'pulse');
	if (!step) {
		throw new Error('shooterLaunchCoil(): TABLE.ballDevices.bd_shooter.ballSearchOrder has no "pulse" step to launch with');
	}
	return step.coil as CoilName;
}

/** `c_autolaunch` (Code Map: "bd_shooter's launch coil is the first pulse in ballSearchOrder"), resolved once, never a literal. */
export const SHOOTER_LAUNCH_COIL: CoilName = shooterLaunchCoil();

export interface BallControllerStepResult {
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	readonly coilCommands: readonly CoilCommand[];
	/**
	 * `ball_will_start` events produced THIS tick, for `sim/rules/index.ts`
	 * to queue into the devices layer's OWN lifecycle parameter on its NEXT
	 * `step()` call (never this same tick -- see `sim/rules/index.ts`'s
	 * header for why the drop bank's reset cannot be same-tick without
	 * calling `devicesLayer.step()` twice per tick, which would corrupt its
	 * cross-tick state).
	 */
	readonly ballWillStartEvents: readonly BallWillStartEvent[];
	/** Story 2.12 (AD-9): ball search's own final-stage command this tick, if any -- forwarded to `sim/rules/index.ts`, which queues it into `sim/loop`'s own next-tick command channel. */
	readonly recoverCommands: readonly RecoverCommand[];
	/** Story 2.12 (AD-19, amended): ball search's own bank-reset REQUEST this tick, if any -- forwarded to `sim/rules/index.ts`, which queues it into the devices layer's own lifecycle input on the NEXT tick, beside `ball_will_start`. */
	readonly bankResetRequests: readonly BankResetRequest[];
	/** Story 3.1 (AD-8): the stop triples of every mode this tick's ball end or Attract transition stopped, in execution order -- `sim/rules/index.ts` places them after the tilt controller's and before the mode stack's in `RulesStepResult.modeEvents`. */
	readonly modeEvents: readonly ModeEvent[];
	/** Stories 3.2/3.3 (AD-9, AD-18): the Lock arbiter's Mouth shows this tick, in seam order -- `show_dragon_mouth_open` and, from Story 3.3, `show_dragon_mouth_close` (a request inside the hold gives [close, open] on one tick) -- which `sim/rules/index.ts` returns first in `RulesStepResult.commands`. */
	readonly showCommands: readonly ShowCommand[];
}

export interface BallController {
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number, machineReport: MachineReport): BallControllerStepResult;
}

export interface StartBallResult {
	readonly state: GameState;
	readonly events: SemanticEvent[];
	readonly coilCommands: CoilCommand[];
	readonly ballWillStartEvents: BallWillStartEvent[];
	/** Story 2.13 (DW-244, AD-6 amended): the one stray-clear `RecoverCommand` every `startBall()` call now issues -- every caller merges it into `RulesStepResult.recoverCommands`. */
	readonly recoverCommands: RecoverCommand[];
}

/**
 * Rework iteration 2 (DW-224 + DW-225): `awaitingSaveRelaunch`'s own record
 * -- see `ControllerState.awaitingSaveRelaunch` below.
 */
export interface AwaitingSaveRelaunch {
	readonly startTick: number;
}

/** Story 2.10, task 7(e): one scheduled bonus count-down step -- see `ControllerState.pendingBonusCountSteps` below. */
export interface PendingBonusCountStep {
	readonly tick: number;
	readonly event: BonusCountStepEvent;
}

/** Story 2.13 (AD-6 amended, AD-7, AD-18): DW-244's own stray-clear record -- see `ControllerState.pendingStrayClear` below. */
export interface PendingStrayClear {
	readonly tick: number;
}

/**
 * Story 3.2 (AD-7, AD-18): the pending Mouth eject sequence -- see
 * `ControllerState.mouth` below. `openTick` is the tick the sequence's one
 * `show_dragon_mouth_open` was pushed (its reset-safety mark); `dueTicks`
 * holds each scheduled `c_mouth` pulse, ascending, and loses its head as
 * each pulse fires. Mutable on purpose: the arbiter
 * (`./lock-arbiter.ts`) appends and shifts in place.
 */
export interface MouthSequence {
	readonly openTick: number;
	readonly dueTicks: number[];
}

/**
 * Story 3.3 (AD-7, AD-18): the pending Mouth close -- see
 * `ControllerState.mouthClose` below. `lastPulseTick` is the tick the
 * sequence's last `c_mouth` pulse fired (its reset-safety mark); `dueTick`
 * is `lastPulseTick + mouthCloseHoldTicks`, the tick the close falls due.
 * A Mouth request that arrives before `dueTick` emits the close early, on
 * the request tick, ahead of its new open (`requestMouthEject()`).
 */
export interface MouthClose {
	readonly lastPulseTick: number;
	readonly dueTick: number;
}

/**
 * Story 2.13 (AD-7, the closure-state class): the game-over sequence's own
 * tick marks, drawn number and winners -- closure state for the identical
 * reason `pendingBonusCountSteps` is (a `GameState`-scoped field would move
 * `expectedGameStateHash` on all five goldens, a Block-If). `armTick` is G,
 * the tick the sequence was armed at -- the reset-safety mark
 * (`tilt.ts:88-97`'s own precedent: a mark strictly greater than the
 * current tick means a restarted timeline, discarded at the top of `step()`
 * by `discardStaleGameOverSequence()`, `./game-over.ts`). `scores` is
 * captured once, at arm time, rather than re-read from `GameState.players`
 * at the draw tick --
 * scores cannot change after G (the last ball already paid its bonus), so
 * the two are equivalent, and capturing avoids the draw ever reading a value
 * that moved for an unrelated reason. `drawn` is `null` until `matchTick`,
 * after which it holds the one `nextRng()` draw for the rest of the
 * sequence's life (the reveal steps and the `game_over` screen's `MATCH`
 * line all read the SAME `{ number, winners }`, never re-drawn).
 */
export interface GameOverSequence {
	readonly armTick: number;
	readonly scores: readonly number[];
	readonly matchTick: number;
	readonly resolvedTick: number;
	readonly attractTick: number;
	readonly drawn: { readonly number: number; readonly winners: readonly number[] } | null;
}

/**
 * Story 3.1 (DW-290): the ball controller's cross-tick closure state, the
 * five closure `let`s of the Epic 2 monolith gathered into ONE record. It is
 * created once per `createBallController()` call (`./index.ts`) and handed to
 * every seam, which reads and writes its fields in place. Every record a
 * field holds (`{ tick }`, `{ startTick }`, the sequence) is still the same
 * object it always was -- the stray clear's reference-equality guard
 * (`./serve-recovery.ts`) depends on that.
 */
export interface ControllerState {
	/**
	 * Story 2.9, task 5: set true by a save's own re-serve (the drain branch,
	 * `./save-serve.ts`), consumed the NEXT time the re-served ball's own
	 * arrival closes bd_shooter's entry switch (`device_ball_entered`) --
	 * cross-tick, controller-local state, deliberately NOT a `GameState` field
	 * (AD-7: `machine.ballSave` itself carries no such flag, and widening it
	 * would move a state hash -- see `ball-save.ts`'s own header). Mirrors the
	 * devices-and-shots layer's own cross-tick, instance-local state
	 * (`createDevicesLayer()`'s `pendingLockLaneClosure`, etc.) -- this is why
	 * `createBallController()` must be INSTANTIATED, never module-global
	 * (Story 2.5's precedent).
	 *
	 * Code review pass 1 (blind-hunter + edge-case-hunter, independently):
	 * unlike `pendingLockLaneClosure`, which self-clears on a tick timeout,
	 * this flag had no boundary at which it was guaranteed to return to
	 * `false`. If the re-served ball never reached `bd_shooter` (a real,
	 * reachable `eject_failed` from a re-serve pulsed into an already-full
	 * or malfunctioning trough, or any future ball-search/multiball
	 * interaction that intervenes first), the stale `true` would silently
	 * auto-launch the NEXT ball's own first, ordinary arrival at the
	 * shooter lane -- short-circuiting that ball's manual plunge with no
	 * recovery path. `startBall()` (`./start.ts`) now resets it at
	 * `ball_will_start`, the same boundary AD-7 already resets
	 * `ballSave`/`tilt`/`multiball` at, closing that window.
	 */
	awaitingSaveLaunch: boolean;

	/**
	 * Rework iteration 1 (DW-218, 2026-09-07): the author's chosen fix for the
	 * re-arm defect code review measured -- a PLAYER plunge arms the ball-save
	 * window; a save's own re-serve does not. Set the moment the deferred
	 * autolaunch actually fires the coil (never when it is skipped for
	 * Tilt -- no pulse, no resulting `ball_launched`, nothing to discriminate),
	 * and consumed by the very next `ball_launched` (`./save-serve.ts`), which
	 * is that same pulse's own `s_shooter_lane` opening one or more ticks later
	 * (AD-6). A second, SEPARATE flag from `awaitingSaveLaunch` on purpose:
	 * that one tracks "waiting for the re-served ball to physically arrive at
	 * bd_shooter" and is consumed at arrival; this one tracks "waiting for
	 * arrival's own autolaunch pulse to turn into a ball_launched" and is
	 * consumed one step later, at that event. Costs zero state hashes (Rework
	 * note: "a closure-held discriminator costs zero state hashes, whereas a
	 * new `GameState` field would move `expectedHash`/`expectedGameStateHash`
	 * on all five goldens"). Reset at `ball_will_start` for the identical
	 * reason `awaitingSaveLaunch` is: a save whose re-serve never reaches
	 * `s_shooter_lane` (an `eject_failed`, or a future multiball interaction)
	 * must not leave a stale record to misclassify a LATER, unrelated ball's
	 * own genuine plunge as a non-arming relaunch.
	 *
	 * Rework iteration 2 (DW-224 + DW-225, 2026-09-08, one root cause, Rule 15
	 * "fix now"): a plain boolean had no causal binding (it consumed blindly
	 * whichever `ball_launched` arrived next, however late) and no bounded
	 * lifetime (if the deferred pulse resolved to `eject_failed` instead of a
	 * `ball_launched`, the flag stayed stuck `true` for the rest of the ball --
	 * and in the one scenario its own reset comment above cites as recovery,
	 * that reset cannot run either, since no parking entry -> no ball_ended ->
	 * no ball_will_start can follow a ball stranded in the shooter lane).
	 * Widened to the SAME `{ startTick }` shape `pendingLockLaneClosure`
	 * already uses (`sim/rules/devices/index.ts`), self-clearing off an
	 * already-resolved tick count -- `ballSaveGraceTicks`, resolved at
	 * construction, so this needs no new tunable. Expired BEFORE this tick's
	 * own device events are read, the same ordering `hasGraceLapsed()` and
	 * `pendingLockLaneClosure` itself both already use. This bounds how long a
	 * `ball_launched` may be trusted as "caused by MY pulse" (DW-224's
	 * causal-binding language) and guarantees a stuck record eventually
	 * releases so a later, genuinely unrelated `ball_launched` -- however it
	 * might arise -- arms normally instead of being silently swallowed for the
	 * rest of the ball (DW-225's same-ball recovery). It does not, and cannot
	 * from `sim/rules` alone, un-strand a ball physically resting in an empty
	 * shooter lane after a real `eject_failed` -- that recovery is Story
	 * 2.12's ball search, named explicitly by both findings as the eventual
	 * fix for the physical hang; this closes the RULES-side latch defect only.
	 *
	 * Review pass (2026-09-08): this is a TIMEOUT, not a true causal binding
	 * -- there is still no per-pulse identity check, so ANY `ball_launched`
	 * arriving inside the bounded window is consumed as the relaunch, exactly
	 * as before. That is sufficient today only because, per the spec's own
	 * Rule 15 disposition, `s_shooter_lane` is a single physical switch and
	 * `bd_shooter` holds one ball: between the pulse firing and its own
	 * resulting launch there is exactly ONE possible open edge, so a manual
	 * plunge in that gap would produce the SAME `ball_launched` the pulse
	 * would have -- not a second, distinct event for a true correlation check
	 * to disambiguate. A genuine multi-ball path through `bd_shooter` (Story
	 * 3.7) would need real correlation, not just a bound.
	 *
	 * The reused `ballSaveGraceTicks` also couples this record's timeout to a
	 * DIFFERENT concern -- how long a drain stays saved past the displayed
	 * expiry -- not to the physical trough-to-shooter-lane travel time this
	 * record actually needs to outlive. Safe today only because production
	 * `ballSaveGraceMs` (2000ms) vastly exceeds any realistic coil-pulse
	 * travel time; a future tuning pass that shrinks it well below that travel
	 * time would need a fresh look here.
	 */
	awaitingSaveRelaunch: AwaitingSaveRelaunch | null;

	/**
	 * Story 2.10, task 7(e): the end-of-ball bonus count-down's own schedule
	 * (a count-up until Story 3.0, DW-236) -- closure state, deliberately NOT a
	 * `GameState` field (Design Notes, "Why the count-up schedule is closure
	 * state": a `machine`-scoped field would move `expectedGameStateHash` on
	 * all five goldens, a Block-If; a player-scoped one is the wrong scope,
	 * since this is a display pacer, not a fact about the player). Holds at
	 * most `steps` entries (`armBonusCountSchedule()`, `./ball-end.ts`), each
	 * emitted once, at its own tick, and dropped; arming replaces any previous
	 * schedule wholesale -- no `ball_will_start` reset needed (Design Notes:
	 * `startBall()` runs on the SAME tick as `ball_ended` when a rotation
	 * follows immediately, which is exactly why this is armed AFTER that
	 * rotation rather than before it).
	 */
	pendingBonusCountSteps: readonly PendingBonusCountStep[];

	/** Story 2.13 (AD-7, the closure-state class): the game-over sequence -- see `GameOverSequence` above; `./game-over.ts` arms and drains it. */
	gameOverSequence: GameOverSequence | null;

	/**
	 * Story 2.13 (AD-6 amended, AD-7, AD-18): DW-244's own stray clear,
	 * armed by EVERY `startBall()` call alongside its one `RecoverCommand`.
	 * Bounded to exactly one tick past its own start (Boundaries: "the
	 * pending stray clear expires after one tick") -- reset-safe by the
	 * identical rule as `gameOverSequence` above, checked at the top of
	 * `step()`.
	 */
	pendingStrayClear: PendingStrayClear | null;

	/**
	 * Story 3.2 (AD-7, AD-18): the pending Mouth eject sequence, owned by the
	 * Lock arbiter (`./lock-arbiter.ts`), `null` when nothing is scheduled.
	 * Bounded (at most the Lock's capacity, 3, ejects) and cleared after its
	 * last pulse. Never cancelled by a ball end, a Slam or a phase change --
	 * a ball waiting to be spat is still on the machine -- and discarded only
	 * if `tick` runs backwards (`discardStaleMouth()`). Closure state, not
	 * `GameState`, for the reason every field above gives: `machine` is
	 * hashed into every golden.
	 */
	mouth: MouthSequence | null;

	/**
	 * Story 3.3 (AD-7, AD-18): the pending `show_dragon_mouth_close`, owned
	 * by the Lock arbiter (`./lock-arbiter.ts`), `null` when no close is
	 * owed. Recorded when a sequence's last pulse fires (so `mouth` and
	 * `mouthClose` are never both set), emitted on the first tick at or past
	 * its `dueTick`, or at once, ahead of the new open, when a Mouth request
	 * arrives while it is pending -- so open and close strictly alternate.
	 * At most one. Like `mouth`, never cancelled by a ball end, a Slam or a
	 * phase change, and discarded only if `tick` runs backwards
	 * (`discardStaleMouth()`). Deliberately NOT part of "pending": the drain
	 * gate, ball search and the overflow answer read `mouth` (and the pulse
	 * tick) only.
	 */
	mouthClose: MouthClose | null;
}

/**
 * Story 3.1 (DW-290): everything a seam reads besides `GameState` -- the
 * construction-time resolutions `createBallController()` makes once (AD-3:
 * every `...Ms` converted to ticks once, at load), the one ball-search
 * instance and the one `ControllerState` record.
 */
export interface ControllerContext {
	readonly adjustments: GameAdjustments;
	readonly tuning: ResolvedTuning;
	readonly ballSaveTicks: number;
	readonly ballSaveGraceTicks: number;
	readonly bonusCountTicks: number;
	readonly matchDelayTicks: number;
	readonly matchRevealTicks: number;
	readonly attractTicks: number;
	/** Story 3.2 (AD-18): the Mouth's open lead and eject spacing, resolved once from `mouthOpenLeadMs`/`mouthEjectIntervalMs`. */
	readonly mouthOpenLeadTicks: number;
	readonly mouthEjectIntervalTicks: number;
	/** Story 3.3 (AD-18): the Mouth's hold after a sequence's last pulse, resolved once from `mouthCloseHoldMs`. */
	readonly mouthCloseHoldTicks: number;
	readonly ballSearch: BallSearch;
	/** Story 3.1 (AD-8): the mode registry whose stop hooks the ball end and the Attract transition run -- the stack's own (`sim/rules/index.ts`). */
	readonly modes: ModeLookup;
	readonly cs: ControllerState;
}

/**
 * Story 3.1 (DW-290): the one mutable per-tick accumulator `step()` threads
 * through its seams -- each seam pushes onto these arrays in the monolith's
 * own order, and `step()` returns them as `BallControllerStepResult`.
 */
export interface TickOutput {
	readonly events: SemanticEvent[];
	readonly coilCommands: CoilCommand[];
	readonly ballWillStartEvents: BallWillStartEvent[];
	readonly recoverCommands: RecoverCommand[];
	readonly bankResetRequests: BankResetRequest[];
	readonly modeEvents: ModeEvent[];
	readonly showCommands: ShowCommand[];
}

/**
 * Story 2.13 (AD-18): the shared Attract-entry helper. Boundaries: "Only the
 * ball controller ... moves `phase` to or from `game_over` ... The Slam's
 * Attract entry calls the ball controller's exported helper; it never
 * re-implements it." Returns `phase: 'attract'`, an empty `modes[]` and
 * `hardwareEnabled: false`, plus the `HARDWARE_COILS` disable batch --
 * `players`, `ballsInPlay`, `rng` and `tilt` are all kept, exactly as spread
 * (task 5(a)'s own contract). Pure and instance-free (unlike `startBall()`,
 * which needs the controller's closure state): both the ball controller's own
 * game-over-to-Attract transition (`./game-over.ts`) and `sim/rules/tilt.ts`'s
 * Slam call it directly, so the "phase, modes, hardwareEnabled, the disable
 * batch" shape is written exactly once.
 *
 * Story 3.1 (AD-8, DW-209): the modes are emptied ONLY through the
 * lifecycle -- `stopAllModes()` runs every active mode's stop triple in
 * place, descending priority, with `modes`' own stop hooks (pure and
 * tuning-free), and the triples come back as `modeEvents`. At the game-over
 * Attract transition the ball end has already stopped everything, so there
 * it is a no-op; after a Slam it stops the live ball's modes.
 */
export function enterAttract(
	state: GameState,
	tick: number,
	modes: ModeLookup,
): { readonly state: GameState; readonly coilCommands: readonly CoilCommand[]; readonly modeEvents: readonly ModeEvent[] } {
	const stopped = stopAllModes(state, tick, modes);
	return {
		state: {
			...stopped.state,
			phase: 'attract',
			machine: { ...stopped.state.machine, hardwareEnabled: false },
		},
		coilCommands: HARDWARE_COILS.map((coil): CoilCommand => ({ type: 'coil', coil, action: 'disable', tick })),
		modeEvents: stopped.events,
	};
}
