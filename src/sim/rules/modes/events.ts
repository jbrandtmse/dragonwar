// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19 / AD-7: the mode stack's own event vocabulary -- a SEPARATE channel
// from both the devices layer's `DeviceEvent` union (which modes consume,
// never emit) and the closed `SemanticEvent` union `sim/rules/index.ts`
// returns as `events` (`sim/rules/modes/index.ts`'s own header explains why
// `lanes_completed` is neither: its consumer, Story 2.10's bonus multiplier,
// is rules-side, so joining the closed `SemanticEvent` union would oblige a
// `never`-guard arm in `test/contracts.test.ts` for no presentation reader).
// `sim/rules/index.ts` surfaces this union as `RulesStepResult.modeEvents`,
// deliberately never merged into `RulesStepResult.events`.

import { TABLE } from '../../table/dragonwar';

/** `TABLE.laneWiring`'s own `set` field, derived -- `'top' | 'inout'` at this tree, never a second hand-typed union (DW-149): a future lane set widens this automatically, with no edit here. */
export type LaneSetName = (typeof TABLE.laneWiring)[keyof typeof TABLE.laneWiring]['set'];

/**
 * The base mode's own event (AD-7: "lanes ... owned by the base mode" --
 * lane STATE, including when a set completes, is never the devices layer's
 * to report). Fires once, the tick a lane entry lights the LAST unlit member
 * of `set`, immediately after that set's own `lit` flags are reset to false.
 * Story 2.10 consumes this to advance the bonus multiplier (2x -> 3x -> 5x
 * on the Top set) -- the reason this event exists in this story at all.
 */
export interface LanesCompletedEvent {
	readonly type: 'lanes_completed';
	readonly set: LaneSetName;
	readonly tick: number;
}

/**
 * The mode stack's whole event vocabulary (AD-19/AD-9): a mode never emits a
 * `SwitchEvent` or a raw `DeviceEvent`, and this union is never merged into
 * the closed `SemanticEvent` union presentation reads. One member today;
 * Story 3.1 (the generalised mode stack, `epics.md:1648`) is chartered to
 * extend this with the four-phase `mode_<name>_will_start/_starting/_started`
 * and `_will_stop/_stopping/_stopped` lifecycle events -- deliberately NOT
 * authored here (this story's own Never section).
 */
export type ModeEvent = LanesCompletedEvent;
