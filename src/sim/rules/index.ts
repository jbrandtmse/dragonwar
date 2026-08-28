// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4's own rule text, quoted verbatim in this story's Design Notes: "then
// rules.step(state, switchEvents, tick) runs -- every step, even with none."
// `sim/loop/index.ts` calls this after every physics step, whether or not
// that step produced a switch event. Returns the next immutable `GameState`,
// the semantic events produced, and the presentation commands -- always
// empty in this story, because `TABLE.flashers`/`shows` are empty and the
// one lamp is never lit (AD-9: `FrameOutput.commands` asserted empty rather
// than left unspecified).
//
// `state.machine.deviceSlots` is NOT written here: AD-6 defines it as "the
// number of closed slot switches and nothing else", a pure function of the
// physics machine's OWN current state -- and `rules.step()`'s three-argument
// signature (AD-4's own pin) carries no channel to that state. `sim/loop`
// copies it straight from `machine.deviceSlots` onto the `GameState` this
// function returns, immediately after calling it, so the single source of
// truth stays in one place (the physics-side machine) rather than being
// re-derived or duplicated here.

import { applyDeviceEvents } from './ball-controller';
import { processSwitchEvents, type DeviceEvent } from './devices';
import type { GameState, SemanticEvent, SwitchEvent } from '../table/names';
import type { BallLaunchedEvent } from '../contracts/events';

export interface RulesStepResult {
	readonly state: GameState;
	readonly events: readonly SemanticEvent[];
	/** Always empty in this story -- `TABLE.flashers`/`shows` are empty and the one lamp is never lit (AD-9). */
	readonly commands: readonly never[];
}

function isBallLaunched(event: DeviceEvent): event is BallLaunchedEvent {
	// The only member of sim/rules/devices.ts's internal DeviceEvent union
	// that is also part of the closed SemanticEvent contract -- see this
	// file's header and devices.ts's own comment on why
	// device_ball_entered/_left never cross this boundary.
	return event.type === 'ball_launched';
}

/**
 * Runs after every physics step, even one that produced no switch events
 * (AD-4). `tick` is stamped onto the returned `GameState` and onto every
 * event this step produces.
 */
export function step(state: GameState, switchEvents: readonly SwitchEvent[], tick: number): RulesStepResult {
	const deviceEvents = processSwitchEvents(switchEvents);
	const machine = applyDeviceEvents(state.machine, deviceEvents);
	const nextState: GameState = machine === state.machine ? { ...state, tick } : { ...state, tick, machine };
	const events: SemanticEvent[] = deviceEvents.filter(isBallLaunched);

	return { state: nextState, events, commands: [] };
}
