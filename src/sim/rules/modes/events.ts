// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19 / AD-7: the mode stack's own event vocabulary -- a SEPARATE channel
// from both the devices layer's `DeviceEvent` union (which modes consume,
// never emit) and the closed `SemanticEvent` union `sim/rules/index.ts`
// returns as `events` (`lanes_completed`'s consumer, Story 2.10's bonus
// multiplier, is rules-side, so joining the closed `SemanticEvent` union
// would oblige a `never`-guard arm in `test/contracts.test.ts` for no
// presentation reader). `sim/rules/index.ts` surfaces this union as
// `RulesStepResult.modeEvents`, deliberately never merged into
// `RulesStepResult.events`.
//
// Story 3.1 (AD-8): the six lifecycle events join this channel, not
// `SemanticEvent` -- `mode_<name>_will_start / _starting / _started` and
// `_will_stop / _stopping / _stopped`, each carrying the mode, its player and
// the tick. `./lifecycle.ts` is their only producer.

import { TABLE } from '../../table/dragonwar';

/** `TABLE.laneWiring`'s own `set` field, derived -- `'top' | 'inout'` at this tree, never a second hand-typed union (DW-149): a future lane set widens this automatically, with no edit here. */
export type LaneSetName = (typeof TABLE.laneWiring)[keyof typeof TABLE.laneWiring]['set'];

/**
 * The base mode's own event (AD-7: "lanes ... owned by the base mode" --
 * lane STATE, including when a set completes, is never the devices layer's
 * to report). Fires once, the tick a lane entry lights the LAST unlit member
 * of `set`, immediately after that set's own `lit` flags are reset to false.
 * Story 2.10 consumes this to advance the bonus multiplier (2x -> 3x -> 5x
 * on the Top set) -- the reason this event exists at all.
 */
export interface LanesCompletedEvent {
	readonly type: 'lanes_completed';
	readonly set: LaneSetName;
	readonly tick: number;
}

/** Story 3.1 (AD-8): the six phases of a mode's lifecycle, in the order they fire -- three to start, three to stop. */
export type ModeLifecyclePhase = 'will_start' | 'starting' | 'started' | 'will_stop' | 'stopping' | 'stopped';

/**
 * Story 3.1 (AD-8, AD-18): one lifecycle transition of one mode entry.
 * `mode` is the entry's own name -- an unregistered fixture entry (`stub`)
 * is stopped with the same events -- `player` its own player, `tick` the
 * tick it fired on. AD-18: `_starting` / `_stopped` are the phases the
 * multiball stories hook (`machine.multiball` is set and cleared there).
 */
export interface ModeLifecycleEvent {
	readonly type: `mode_${string}_${ModeLifecyclePhase}`;
	readonly mode: string;
	readonly player: number;
	readonly tick: number;
}

/**
 * The mode stack's whole event vocabulary (AD-19/AD-9): a mode never emits a
 * `SwitchEvent`, a raw `DeviceEvent` or a `CoilCommand` (AD-8: "it never
 * emits a CoilCommand"), and this union is never merged into the closed
 * `SemanticEvent` union presentation reads.
 */
export type ModeEvent = LanesCompletedEvent | ModeLifecycleEvent;
