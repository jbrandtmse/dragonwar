// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4's own rule text, quoted verbatim in Story 2.4's Design Notes: "then
// rules.step(state, switchEvents, tick) runs -- every step, even with none."
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

import { applyDeviceEvents, createBallController, deriveDeviceSlots } from './ball-controller';
import { bootDeviceSlots, createDevicesLayer, type DeviceEvent, type DevicesLayer } from './devices';
import { TABLE } from '../table/dragonwar';
import type { GameState, MachineState, SemanticEvent, CoilCommand } from '../table/names';
import type { BallLaunchedEvent, BallWillStartEvent } from '../contracts/events';
import type { GameAdjustments } from '../contracts/replay';
import type { ResolvedTuning } from '../table/tuning';

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

export interface RulesStepResult {
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	/** Presentation-only (AD-9's Seam Contracts table pins `FrameOutput.commands` to `(Lamp | Gi | Flasher | Show)Command[]`): always empty in this story -- `TABLE.flashers`/`shows` are empty and the one lamp is never lit. */
	readonly commands: readonly never[];
	/**
	 * Story 2.4 (AD-9, AD-4): the rules -> physics coil channel this story
	 * builds. Separate from `commands` above -- never widens
	 * `FrameOutput.commands`. `sim/loop/index.ts`'s `advance()` queues these
	 * into `pendingCommands`, so a command issued at tick *N* is consumed by
	 * physics at *N+1*, exactly as `pulseCoil()` already is (AD-4).
	 */
	readonly coilCommands: readonly CoilCommand[];
}

export interface Rules {
	/**
	 * Runs after every physics step, even one that produced no switch events
	 * (AD-4). `tick` is stamped onto the returned `GameState` and onto every
	 * event this step produces.
	 */
	step(state: GameState, switchEvents: SwitchEventsParam, tick: number): RulesStepResult;
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
 * Review correction 2026-09-06 (code-review, blind-hunter + acceptance-auditor):
 * the "mirrors" claim above is true of `ballsPerGame` ONLY. `tiltWarnings`
 * and `matchProbability` deliberately do NOT match `src/host/boot.ts:281` or
 * the golden headers, which both carry `tiltWarnings: 3` / `matchProbability: 0`;
 * this default carries `1` / `0.08`. Neither field has a reader yet (tilt is
 * Story 2.11, Match is Story 2.13) so nothing observes the divergence today,
 * and reconciling it is a product call those stories own -- `DW-36` already
 * tracks the tilt-warning default's missing transcription and is routed to
 * Story 2.11. Recorded here so the next reader challenges the numbers rather
 * than trusting a comment that overstated them.
 */
const DEFAULT_ADJUSTMENTS: GameAdjustments = {
	pitchDeg: TABLE.reference.pitchDeg,
	tiltWarnings: 1,
	ballsPerGame: 3,
	matchProbability: 0.08,
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
	const ballController = createBallController(adjustments);

	// See this file's header, "Sequencing note": ball_will_start events the
	// ball controller decided on THIS tick, delivered to the devices layer's
	// lifecycle parameter on the NEXT tick's step() call.
	let pendingLifecycleEvents: readonly BallWillStartEvent[] = [];

	function step(state: GameState, switchEvents: SwitchEventsParam, tick: number): RulesStepResult {
		const lifecycleForDevices = pendingLifecycleEvents;
		pendingLifecycleEvents = [];

		const deviceResult = devicesLayer.step(switchEvents, lifecycleForDevices, tick);

		// AD-6/AD-7/DW-70: ballsInPlay accounting and deviceSlots derivation,
		// BOTH purely a function of this tick's device events -- never a
		// physics read. Structural sharing preserved at every step: an empty
		// (or irrelevant) deviceResult.events leaves `machine` and
		// `machine.deviceSlots` as the SAME references `state` already carried
		// (the DW-70 identity gate's own premise).
		let machine: MachineState = applyDeviceEvents(state.machine, deviceResult.events);
		const deviceSlots = deriveDeviceSlots(machine.deviceSlots, deviceResult.events);
		if (deviceSlots !== machine.deviceSlots) {
			machine = { ...machine, deviceSlots };
		}
		const stateAfterAccounting: GameState = machine === state.machine ? state : { ...state, machine };

		const controllerResult = ballController.step(stateAfterAccounting, deviceResult.events, tick);
		pendingLifecycleEvents = controllerResult.ballWillStartEvents;

		const nextState: GameState = { ...controllerResult.state, tick };

		const events: SemanticEvent[] = [...deviceResult.events.filter(isBallLaunched), ...controllerResult.events];

		return {
			state: nextState,
			events,
			commands: [],
			coilCommands: [...deviceResult.coilCommands, ...controllerResult.coilCommands],
		};
	}

	return { step };
}
