// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.5 (AD-3, AD-7, AD-8, AD-9, FR-34): the Hurry-up campaign Mode --
// "start 250,000 decaying to a 50,000 floor over 20 s", collected at the
// Ramp, the decaying value on the Backglass. Registered by Story 3.4 as a
// shell (priority 300); it starts only through `./campaign.ts`'s
// `startCampaignMode()` (called by the Lock arbiter), never at a ball start.
//
// - The arithmetic (AD-3). S = `hurryUpStartValue`, F = `hurryUpFloor`, and
//   T = max(1, `hurryUpTicks`), resolved ONCE here in the factory. With
//   `e = max(0, tick - startTick)`:
//     value(e)      = e >= T ? F : F + floor((S - F) * (T - e) / T)
//     timerTicks(e) = T - e while e < T; absent from e = T on.
//   Rounded down, so the value never pays above the straight line; both ends
//   are exact (value(0) = S, value(T) = F). The clock is `tick - startTick`,
//   never a counter, so no higher mode (a Quick multiball) can pause it.
// - Publication (AD-7, AD-9). The entry is `{ mode, priority, player,
//   startTick, value, timerTicks? }` -- its `ModeView`. `onStart` stamps
//   `startTick` with the start tick; the `tick` hook replaces the entry each
//   step (the skill shot's `launched` pattern), and nothing else writes it.
// - The timer ends at the floor; the Mode does not. From e = T it holds F
//   with no `timerTicks` -- so ball search's Lock stages (which skip the
//   Mouth while any mode publishes `timerTicks`, AD-18/FR-23) run again --
//   until a Ramp collects it (paying exactly F) or the ball ends.
// - The collect. `${TABLE.modeWiring.hurryUpCollectShot}_made` (the Ramp;
//   no `shot_` literal here, AD-16), only while `scoringOpen()`: the entry's
//   own player gains value(e) through `awardScore()`, `hurryup_collected`
//   fires, and the handler returns `stop: true` -- the stack stops it through
//   `./lifecycle.ts`. Under Tilt or outside a game the Ramp is ignored: no
//   award, no event, no stop. On the collecting tick the base mode (100)
//   still receives the same Ramp (event-major fan-out, `./index.ts`) and
//   lights the next Mode.
// - The ball end pays nothing: there is no `onStopping` / `onStopped`, so the
//   ball end, the Slam and the Attract entry stop it with no award and no
//   `hurryup_collected`. No `lamps` hook: the Ramp insert's `hurryup` role is
//   Story 3.3c's. Never a `CoilCommand` (AD-8).

import { TABLE } from '../../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning } from '../../table/tuning';
import { awardScore, scoringOpen } from '../scoring';
import { MODE_PRIORITIES } from './priorities';
import type { ActiveModeState } from '../../contracts/state';
import type { GameState, ShotName } from '../../table/names';
import type { DeviceEvent } from '../devices';
import type { HurryUpCollectedEvent } from './events';
import type { ModeDefinition, ModeHookResult } from './registry';

/** The device event that collects a running Hurry-up -- `${TABLE.modeWiring.hurryUpCollectShot}_made` (the Ramp), never a spelled-out shot name (AD-16). */
const COLLECT_EVENT: `${ShotName}_made` = `${TABLE.modeWiring.hurryUpCollectShot}_made`;

/** The Hurry-up `ModeDefinition`. */
export interface HurryUpMode extends ModeDefinition {
	readonly name: 'hurryup';
}

export function createHurryUpMode(tuning: ResolvedTuning): HurryUpMode {
	const start = tuning.hurryUpStartValue.value;
	const floor = tuning.hurryUpFloor.value;
	const decayTicks = Math.max(1, shotWindowTicks('hurryUpMs', tuning));

	/** The elapsed ticks since `entry`'s own start -- never negative. Every entry `onStart` builds carries `startTick`; a hand-made fixture entry without one reads as just started. */
	function elapsed(entry: ActiveModeState, tick: number): number {
		const startTick = typeof entry.startTick === 'number' ? entry.startTick : tick;
		return Math.max(0, tick - startTick);
	}

	/** value(e): the straight line from S to F over T, rounded down; F from e = T on. */
	function valueAt(e: number): number {
		return e >= decayTicks ? floor : floor + Math.floor(((start - floor) * (decayTicks - e)) / decayTicks);
	}

	function onStart(_state: GameState, _player: number, tick: number): Readonly<Record<string, unknown>> {
		return { startTick: tick, value: start, timerTicks: decayTicks };
	}

	/** Republishes `value` and `timerTicks` on this entry, dropping `timerTicks` once the decay has run out. */
	function onTick(state: GameState, entry: ActiveModeState, tick: number): ModeHookResult {
		const e = elapsed(entry, tick);
		const value = valueAt(e);
		const modes = state.modes.map((mode) => {
			if (mode !== entry) {
				return mode;
			}
			const { timerTicks: _dropped, ...rest } = mode;
			return e < decayTicks ? { ...rest, value, timerTicks: decayTicks - e } : { ...rest, value };
		});
		return { state: { ...state, modes } };
	}

	/** The Ramp collects value(e) for the entry's own player and stops the Mode -- only while scoring is open. */
	function onEvent(state: GameState, entry: ActiveModeState, event: DeviceEvent, tick: number): ModeHookResult {
		if (event.type !== COLLECT_EVENT || !scoringOpen(state)) {
			return { state };
		}
		const value = valueAt(elapsed(entry, tick));
		const collected: HurryUpCollectedEvent = { type: 'hurryup_collected', player: entry.player, value, tick };
		return { state: awardScore(state, entry.player, value), events: [collected], stop: true };
	}

	return {
		name: 'hurryup',
		priority: MODE_PRIORITIES.hurryup,
		onStart,
		tick: onTick,
		onEvent,
	};
}
