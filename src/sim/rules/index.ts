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
// `createRules(tuning)` ONCE (mirroring `createMachine(collisionDoc,
// tuning)`) and keeps the one `Rules` instance for the life of that loop;
// `step()`'s own three-argument signature (AD-4's pin) is unchanged.
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
// `state.machine.deviceSlots` is NOT written here: AD-6 defines it as "the
// number of closed slot switches and nothing else", a pure function of the
// physics machine's OWN current state -- and `step()`'s three-argument
// signature carries no channel to that state. `sim/loop` copies it straight
// from `machine.deviceSlots` onto the `GameState` this function returns,
// immediately after calling it, so the single source of truth stays in one
// place (the physics-side machine) rather than being re-derived or
// duplicated here.

import { applyDeviceEvents } from './ball-controller';
import { createDevicesLayer, type DeviceEvent, type DevicesLayer } from './devices';
import type { GameState, SemanticEvent, CoilCommand } from '../table/names';
import type { BallLaunchedEvent } from '../contracts/events';
import type { ResolvedTuning } from '../table/tuning';

/** The devices layer's own declared switch-events input -- see this file's header on why it is reached this way rather than by naming `SwitchEvent` directly. */
type SwitchEventsParam = Parameters<DevicesLayer['step']>[0];

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
	// cross this boundary.
	return event.type === 'ball_launched';
}

/**
 * `createRules(tuning)` mirrors `createMachine(collisionDoc, tuning)`:
 * builds ONE devices-and-shots layer instance, resolved against `tuning`
 * once at construction (the shots' own tick windows and DW-166's capture
 * window are derived here, not re-derived every step), and returns `{ step }`
 * closing over it. `createLoop()` owns the one instance for the life of that
 * loop.
 */
export function createRules(tuning: ResolvedTuning): Rules {
	const devicesLayer = createDevicesLayer(tuning);

	function step(state: GameState, switchEvents: SwitchEventsParam, tick: number): RulesStepResult {
		// Story 2.4, task 4: no producer of `ball_will_start` exists until
		// Story 2.5 wires the ball controller in -- an empty lifecycle list is
		// this story's own honest statement of that, not a placeholder left
		// for later wiring to silently fill in.
		const result = devicesLayer.step(switchEvents, [], tick);
		const machine = applyDeviceEvents(state.machine, result.events);
		const nextState: GameState = machine === state.machine ? { ...state, tick } : { ...state, tick, machine };
		const events: SemanticEvent[] = result.events.filter(isBallLaunched);

		return { state: nextState, events, commands: [], coilCommands: result.coilCommands };
	}

	return { step };
}
