// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4's own rule text, quoted verbatim in Story 2.4's Design Notes: "then
// rules.step(state, switchEvents, tick, machineReport) runs -- every step,
// even with none." Story 2.12 (AD-4, amended): `machineReport` is a fourth,
// OPTIONAL argument -- every pre-existing three-argument call site keeps
// compiling unchanged, defaulting to `EMPTY_MACHINE_REPORT` below.
// `sim/loop/index.ts` calls this after every physics step, whether or not
// that step produced a switch event.
//
// Story 2.4: `createRules()` replaces the bare `step()` this file used to
// export. The devices-and-shots layer now holds cross-tick state (in-flight
// shot sequences, the bank's own letters-down latch, `bd_lock`'s tracked
// slot occupancy, the pending Lock-lane closure) -- a module-level function
// closing over a module-level layer instance would leak that state between
// two loops in one process, the exact defect Story 2.3's spinner hit with
// its own module-level `occupied` boolean. `createLoop()` calls
// `createRules(tuning, adjustments)` ONCE (mirroring `createMachine(collisionDoc,
// tuning)`) and keeps the one `Rules` instance for the life of that loop;
// `step()`'s own three-argument signature (AD-4's pin) is unchanged.
//
// Story 2.5: `createRules()` gains a SECOND, optional constructor argument
// (`adjustments`, AD-14's `GameStart.adjustments`) -- never a fourth argument
// to `step()` itself, which would widen AD-4's pin. `step()` now also
// introduces the ball controller (`./ball-controller.ts`), which is the real
// producer of the lifecycle events `ball_will_start`/`ball_starting`/
// `ball_started`/`ball_ended` and the sole writer of `machine.deviceSlots`
// (DW-70) and every player-scoped field.
//
// This file no longer names `SwitchEvent` (AD-19; `tools/boundary-lint.mjs`'s
// `rules-no-switch-event-outside-devices` rule would otherwise fire on it,
// as it did before this story -- see Design Notes, "`src/sim/rules/index.ts`
// must stop naming `SwitchEvent`"): `Rules['step']`'s switch-events
// parameter type is derived from the devices layer's OWN exported `step()`
// signature via `Parameters<>`, so this file depends on the layer's declared
// input contract rather than the raw switch vocabulary -- AD-19's intent
// stated in types.
//
// `state.machine.deviceSlots` IS written here now (via the ball controller's
// own `deriveDeviceSlots()`, called below) -- AD-7's own text: "GameState ...
// mutated only inside rules.step". Before this story it was copied straight
// from the physics machine's own live view by `sim/loop/index.ts`, AFTER this
// function returned -- that copy (DW-70, a live AD-7 violation) is deleted in
// the same change (`sim/loop/index.ts`, task 6). `deviceSlots` is now derived
// PURELY from this tick's `device_ball_entered`/`_left` events, never read
// from physics.
//
// Sequencing note (why the drop bank's `ball_will_start` reset is one tick
// behind the semantic event): the ball controller needs THIS tick's device
// events (`button_pressed { button: s_start }`, `device_ball_entered`, ...)
// as INPUT, which only `devicesLayer.step()` can produce from `switchEvents`
// -- so the devices layer necessarily runs BEFORE the ball controller decides
// whether `ball_will_start` fires this tick. That makes it impossible to feed
// a lifecycle event produced by the ball controller back into the SAME
// `devicesLayer.step()` call that produced its own trigger (the devices layer
// holds cross-tick state, so calling it a second time this tick -- once for
// switch events, once for the lifecycle event -- would double-process it, not
// merely no-op). This module therefore queues `ball_will_start` events for
// the NEXT tick's `devicesLayer.step()` call, mirroring AD-4's own
// "commands issued at tick N are consumed at N+1" shape. No test in this
// story's own footprint (or Story 2.4's) pins the drop bank's reset to the
// SAME tick as the button press that starts a ball -- the existing
// `ball_will_start` -> bank-reset tests all drive the devices layer directly
// via `lifecycleEvents`, independent of this module's own wiring.

import { applyDeviceEvents, applyRecovery, createBallController, deriveDeviceSlots } from './ball-controller';
import { advanceBonusMultiplier, creditBonusFromDeviceEvents } from './bonus';
import { bootDeviceSlots, createDevicesLayer, type BankResetRequest, type DeviceEvent, type DevicesLayer } from './devices';
import { createModeStack, type ModeEvent } from './modes';
import { lampsOf } from './lamps';
import { createTiltController } from './tilt';
import { TABLE } from '../table/dragonwar';
import type { GameState, MachineReport, MachineState, RecoverCommand, SemanticEvent, CoilCommand, LampState } from '../table/names';
import type { BallLaunchedEvent, BallWillStartEvent } from '../contracts/events';
import type { GameAdjustments } from '../contracts/replay';
import { TUNING, type ResolvedTuning } from '../table/tuning';

/**
 * Story 2.12 (AD-4, amended): the default `MachineReport` for every
 * pre-existing three-argument `rules.step()` call site (`test/rules-devices.test.ts`,
 * `test/machine-serve-drain.test.ts`, `test/rules-tilt-integration.test.ts`,
 * `test/util/switch-script.ts`) -- `recovered: null` (no recover was
 * consumed), `failures: []` (nothing to tolerate). A module-level constant:
 * `MachineReport` carries no mutable state, so one frozen instance is safe
 * to share as every omitted call's default.
 */
const EMPTY_MACHINE_REPORT: MachineReport = Object.freeze({ recovered: null, failures: Object.freeze([]) });

/** The devices layer's own declared switch-events input -- see this file's header on why it is reached this way rather than by naming `SwitchEvent` directly. */
type SwitchEventsParam = Parameters<DevicesLayer['step']>[0];

/**
 * Re-exported so `sim/loop/index.ts` reaches it through the SAME `../rules`
 * import it already uses for `createRules()` (the `loop --> rules` arrow the
 * architecture spine draws), rather than reaching past this module into
 * `sim/rules/devices/` directly. Task 6's own boot seed for
 * `GameState.machine.deviceSlots` -- TABLE-derived, never a physics read.
 */
export { bootDeviceSlots };

/**
 * Story 2.8 (AD-9): re-exported so `sim/loop/index.ts` reaches the lamp
 * projection through the SAME `../rules` barrel it already uses for
 * `createRules()`/`bootDeviceSlots`, mirroring the re-export above.
 * `RulesStepResult.commands` deliberately stays `readonly never[]` --
 * AD-9 and this story's AC 1 both place the diff (`lampsOf(state,
 * ballSaveHurryUpTicks)` called
 * twice, compared) in `sim/loop`, never here.
 */
export { lampsOf };
export type { LampState };

/**
 * Story 2.7: re-exported so `test/util/switch-script.ts`'s `runRulesScript()`
 * (and any other consumer already importing from this barrel) can name the
 * mode stack's own event type without reaching past `./modes` -- mirrors the
 * `bootDeviceSlots` re-export above.
 */
export type { LaneSetName, LanesCompletedEvent, ModeEvent } from './modes';

export interface RulesStepResult {
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	/**
	 * Presentation-only (AD-9's Seam Contracts table pins
	 * `FrameOutput.commands` to `(Lamp | Gi | Flasher | Show)Command[]`):
	 * deliberately still `readonly never[]`, and NOT because there is nothing
	 * to say. Story 2.8 (code review pass 2 corrected this doc: it used to
	 * read "the one lamp is never lit", which stopped being true the moment
	 * `l_insert_left` became fourteen real inserts). AD-9 and Story 2.8's
	 * AC 1 both place the lamp DIFF in `sim/loop`, not here: rules export the
	 * pure projection (`lampsOf`, re-exported above), `sim/loop/index.ts`
	 * calls it after every rules step and pushes a `LampCommand` for each
	 * lamp whose `role` or `step` changed. `TABLE.flashers`/`shows` are still
	 * empty and `GiCommand` still has no producer, so this channel stays
	 * empty for a second, independent reason too.
	 */
	readonly commands: readonly never[];
	/**
	 * Story 2.4 (AD-9, AD-4): the rules -> physics coil channel this story
	 * builds. Separate from `commands` above -- never widens
	 * `FrameOutput.commands`. `sim/loop/index.ts`'s `advance()` queues these
	 * into `pendingCommands`, so a command issued at tick *N* is consumed by
	 * physics at *N+1*, exactly as `pulseCoil()` already is (AD-4).
	 */
	readonly coilCommands: readonly CoilCommand[];
	/**
	 * Story 2.12 (AD-9, AD-4): ball search's own final-stage command,
	 * mirroring `coilCommands`' own next-tick channel -- `sim/loop/index.ts`
	 * queues each entry into the SAME next-tick command queue a coil command
	 * already uses (AD-4: a command issued at tick N is consumed at N+1).
	 * At most one entry per tick in practice (AD-7's Boundaries: "at most one
	 * pass, which ends ... in exactly one RecoverCommand").
	 */
	readonly recoverCommands: readonly RecoverCommand[];
	/**
	 * Story 2.7: the mode stack's own event channel (`sim/rules/modes/events.ts`),
	 * deliberately SEPARATE from `events` above -- `lanes_completed` is
	 * neither a `DeviceEvent` (AD-19: lane state is the base mode's, not the
	 * devices layer's) nor a `SemanticEvent` (its consumer is rules-side, so
	 * joining the closed presentation-facing union would oblige a
	 * `never`-guard arm for no reader). Story 2.10 (`DW-208`): consumed
	 * INSIDE this same `step()`, immediately below, by `advanceBonusMultiplier`
	 * -- this is no longer a channel awaiting a consumer, it is the one
	 * `RulesStepResult.modeEvents` has always had, still surfaced here
	 * afterward for `test/util/switch-script.ts`'s headless observability
	 * (AC 2/AC 7). Always `[]` before any mode has ever run (Attract, AC 7).
	 */
	readonly modeEvents: readonly ModeEvent[];
}

export interface Rules {
	/**
	 * Runs after every physics step, even one that produced no switch events
	 * (AD-4). `tick` is stamped onto the returned `GameState` and onto every
	 * event this step produces. `machineReport` (Story 2.12, AD-4 amended) is
	 * OPTIONAL -- omitted, this step behaves exactly as before this story
	 * (`EMPTY_MACHINE_REPORT`'s own `recovered: null` never touches
	 * `ballsInPlay`, and its empty `failures` tolerates nothing because there
	 * is nothing to tolerate).
	 */
	step(state: GameState, switchEvents: SwitchEventsParam, tick: number, machineReport?: MachineReport): RulesStepResult;
}

function isBallLaunched(event: DeviceEvent): event is BallLaunchedEvent {
	// The only member of the devices layer's own DeviceEvent union that is
	// also part of the closed SemanticEvent contract -- see this file's
	// header and sim/rules/devices/events.ts's own comment on why
	// device_ball_entered/_left (and every other device/shot event) never
	// cross this boundary. Every OTHER member of the closed SemanticEvent
	// union this story adds (`ball_will_start`, `ball_starting`,
	// `ball_started`, `ball_ended`) is produced directly by the ball
	// controller, not filtered from the devices layer's output.
	return event.type === 'ball_launched';
}

/**
 * Default sim adjustments for a `Rules` instance built WITHOUT a `GameStart`
 * (every pre-existing single-argument `createRules(tuning)` call site --
 * `test/rules-devices.test.ts`, the DW-70 harness, `test/machine-serve-drain.test.ts`
 * -- keeps compiling unchanged). `ballsPerGame: 3` mirrors the repeated
 * literal already used at `src/host/boot.ts`'s own dev `GameStart` and every
 * golden replay header; AD-14 makes it a sim adjustment, so it is authored
 * here rather than in `sim/table/tuning.ts` or `TABLE`.
 *
 * Review correction 2026-09-06 (code-review, blind-hunter + acceptance-auditor),
 * re-pointed at Story 2.11's code review: the "mirrors" claim above is true of
 * `ballsPerGame` ONLY. `tiltWarnings` and `matchProbability` deliberately do
 * NOT match the dev replay recorder's own `GameStart` in `src/host/boot.ts` or
 * the golden headers, which both carry `tiltWarnings: 3` / `matchProbability: 0`;
 * this default carries each tuning entry's own value (the REAL gameplay
 * `GameStart` in `boot.ts` is not the divergent one -- see below).
 *
 * Story 2.11 (`DW-36`, closed): `tiltWarnings` no longer diverges by
 * construction -- it now reads `TUNING.tiltWarnings.value` (`sim/table/tuning.ts`,
 * the one place AD-15's Rule names it), and `src/host/boot.ts`'s real
 * `GameStart` reads the SAME entry (it must hand-type the read, never import
 * this file -- AD-1/AD-16). The dev replay recorder's own separate
 * `GameStart` (`boot.ts:407`) is untouched and keeps its deliberate literal
 * `3` -- `DW-185`'s divergence, routed to Story 3.7, not this story's to
 * touch.
 *
 * Story 2.13 (AD-14, AD-15): `matchProbability` now reads
 * `TUNING.matchProbability.value` for the identical reason -- Match now has
 * a real reader (the ball controller's game-over sequence), and
 * `src/host/boot.ts`'s real `GameStart` reads the SAME entry, mirroring
 * `tiltWarnings`'s own precedent exactly. The dev replay recorder's own
 * separate `GameStart` (`boot.ts:413`) is untouched and keeps its literal
 * `matchProbability: 0` -- DW-185's divergence, routed to Story 3.7. The
 * golden headers' own `matchProbability: 0` is likewise untouched (Block If:
 * no golden may move).
 */
// Test-only named export (the `HARDWARE_COILS` / `PLAYFIELD_SWITCHES`
// precedent, `ball-controller.ts` / `devices/index.ts`) -- Story 2.7, DW-201
// code review: `src/host/boot.ts`'s real `createHostLoop(...)` call now
// hand-types this exact literal for its own `GameStart.adjustments` (it must
// -- `host/**` may not import `sim/rules/**` directly, AD-1/AD-16, enforced
// by `dependency-cruiser.config.mjs`'s `host-no-physics-or-rules` rule) so a
// future change here would otherwise drift from the real boot path with
// nothing to notice. `test/host-game-seed.test.ts` imports this export to
// pin the two literals equal; production code never imports it from
// `host/**`.
export const DEFAULT_ADJUSTMENTS: GameAdjustments = {
	pitchDeg: TABLE.reference.pitchDeg,
	tiltWarnings: TUNING.tiltWarnings.value,
	ballsPerGame: 3,
	matchProbability: TUNING.matchProbability.value,
};

/**
 * `createRules(tuning, adjustments?)` mirrors `createMachine(collisionDoc,
 * tuning)`: builds ONE devices-and-shots layer instance and ONE ball
 * controller, both resolved once at construction, and returns `{ step }`
 * closing over them. `createLoop()` owns the one instance for the life of
 * that loop.
 */
export function createRules(tuning: ResolvedTuning, adjustments: GameAdjustments = DEFAULT_ADJUSTMENTS): Rules {
	const devicesLayer = createDevicesLayer(tuning);
	const ballController = createBallController(adjustments, tuning);
	const tiltController = createTiltController(adjustments, tuning);
	const modeStack = createModeStack(tuning);

	// See this file's header, "Sequencing note": ball_will_start events the
	// ball controller decided on THIS tick, delivered to the devices layer's
	// lifecycle parameter on the NEXT tick's step() call. Story 2.12 (AD-19,
	// amended): widened to also carry ball search's own bank-reset REQUEST,
	// forwarded through the SAME next-tick channel.
	let pendingLifecycleEvents: readonly (BallWillStartEvent | BankResetRequest)[] = [];

	function step(state: GameState, switchEvents: SwitchEventsParam, tick: number, machineReport: MachineReport = EMPTY_MACHINE_REPORT): RulesStepResult {
		const lifecycleForDevices = pendingLifecycleEvents;
		pendingLifecycleEvents = [];

		const deviceResult = devicesLayer.step(switchEvents, lifecycleForDevices, tick);

		// Story 2.12 (AD-18, AD-4 amended): the recover's own correction lands
		// BEFORE applyDeviceEvents -- physics consumed the RecoverCommand a
		// tick ago (AD-4), so by the time this report reaches rules, every
		// simulated ball not inside a device is already gone; the correction
		// just makes `ballsInPlay` agree with that fact before this tick's own
		// device-event accounting composes on top of it.
		const machineAfterRecovery = applyRecovery(state.machine, machineReport.recovered);
		const stateAfterRecovery: GameState = machineAfterRecovery === state.machine ? state : { ...state, machine: machineAfterRecovery };

		// AD-6/AD-7/DW-70: ballsInPlay accounting and deviceSlots derivation,
		// BOTH purely a function of this tick's device events -- never a
		// physics read. Structural sharing preserved at every step: an empty
		// (or irrelevant) deviceResult.events leaves `machine` and
		// `machine.deviceSlots` as the SAME references `state` already carried
		// (the DW-70 identity gate's own premise).
		let machine: MachineState = applyDeviceEvents(stateAfterRecovery.machine, deviceResult.events);
		const deviceSlots = deriveDeviceSlots(machine.deviceSlots, deviceResult.events);
		if (deviceSlots !== machine.deviceSlots) {
			machine = { ...machine, deviceSlots };
		}
		const stateAfterAccounting: GameState = machine === stateAfterRecovery.machine ? stateAfterRecovery : { ...stateAfterRecovery, machine };

		// Story 2.11 (AD-5, AD-7): the tilt controller runs BEFORE the ball
		// controller so a Tilt that engaged THIS tick is already true for
		// every guard `ballController.step()` runs on this same tick (the
		// ball-save conjunct, the deferred-autolaunch guard, the bonus
		// forfeit -- all three read `machine.tilt.tilted`). Positioned at the
		// same composition point `applyDeviceEvents` above already occupies:
		// purely a function of this tick's device events, run once per tick.
		const tiltResult = tiltController.step(stateAfterAccounting, deviceResult.events, tick);

		// Story 2.10 (AD-19, DW-208's fix, part 1): a pure fold over THIS
		// tick's device events, run BEFORE the ball controller so a category
		// credited on the drain tick lands inside that same ball's own
		// `ball_ended` payload -- the ball controller reads `player.bonus`
		// further down its own drain branch, after this fold has already run.
		// `applyDeviceEvents` immediately above is the in-tree precedent for a
		// pure event-fold invoked straight from this file.
		const stateAfterBonusCredit = creditBonusFromDeviceEvents(tiltResult.state, deviceResult.events);

		const controllerResult = ballController.step(stateAfterBonusCredit, deviceResult.events, tick, machineReport);
		// Story 2.12 (AD-19, amended): the bank-reset request joins
		// `ball_will_start` in the SAME next-tick lifecycle channel -- the
		// drop-bank component is the sole owner of the reset pulse either way
		// (AD-19), so ball search never pulses `c_dragon_bank_reset` itself.
		pendingLifecycleEvents = [...controllerResult.ballWillStartEvents, ...controllerResult.bankResetRequests];

		// Story 2.7: runs AFTER the ball controller (so `ball_starting` and any
		// same-tick rotation's `modes: []` teardown have already landed on
		// `controllerResult.state`) and BEFORE `nextState` is built, exactly as
		// this story's Code Map names the insertion point. Fed THIS tick's
		// device events (never a raw SwitchEvent, AD-19) and the controller's
		// own SemanticEvent output (the channel `ball_starting` arrives on).
		const modeStackResult = modeStack.step(controllerResult.state, deviceResult.events, controllerResult.events, tick);

		// Story 2.10 (AD-19, DW-208's fix, part 2): `RulesStepResult.modeEvents`
		// gains its first production consumer here -- `lanes_completed` does not
		// exist before the mode stack has run, so this fold cannot sit any
		// earlier. `sim/rules/bonus.ts`'s own header is where the one residual
		// this ordering leaves is documented in full (a same-tick
		// drain-and-complete race, unreachable in Epic 2). Code review
		// 2026-09-08: this comment used to cite "this file's own header,
		// 'Sequencing note'" as well -- that note is about the drop bank's
		// `ball_will_start` reset and says nothing about the bonus.
		const stateAfterBonusMultiplier = advanceBonusMultiplier(modeStackResult.state, modeStackResult.events);

		const nextState: GameState = { ...stateAfterBonusMultiplier, tick };

		const events: SemanticEvent[] = [...deviceResult.events.filter(isBallLaunched), ...tiltResult.events, ...controllerResult.events];

		return {
			state: nextState,
			events,
			commands: [],
			coilCommands: [...deviceResult.coilCommands, ...tiltResult.coilCommands, ...controllerResult.coilCommands],
			recoverCommands: controllerResult.recoverCommands,
			modeEvents: modeStackResult.events,
		};
	}

	return { step };
}
