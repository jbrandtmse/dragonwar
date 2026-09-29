// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8): the four-phase convention made real -- the ONLY file
// under `sim/rules/` that adds an entry to `GameState.modes` or removes one
// (`test/ad8-mode-lifecycle-path.test.ts` pins that with a source scan). Every
// start and every stop, whatever its cause (ball start, a mode resolving
// itself, the ball end, the Slam, the Attract transition), goes through
// `startModes()` / `stopModes()` below and fires exactly:
//
// - start, per mode: `mode_<name>_will_start` (no entry yet), then
//   `_starting` (the entry is pushed and the mode's `onStarting` hook runs),
//   then `_started`. Several modes start in ASCENDING priority, all three
//   events per mode before the next mode -- so the base mode's lane reset
//   lands before the skill shot lights its lane. Starting a mode whose name
//   is already active for that player is a no-op: same state reference, no
//   events.
// - stop, per mode: `_will_stop` (the entry is present), then `_stopping`
//   (its `onStopping` hook runs), then `_stopped` (the entry is removed and
//   its `onStopped` hook runs). Several modes stop in DESCENDING priority.
//   An entry with no registered definition (a test fixture such as `stub`)
//   is stopped with the same three events and no hooks.
//
// The stop hooks are pure and tuning-free, `(state, entry, tick)`, so the
// ball controller's ball end and `enterAttract()` (the Slam and the
// game-over Attract transition) run them in place, passing the stack's own
// registry (`sim/rules/index.ts`); no pending stop lives outside `GameState`.
// The events travel on the `ModeEvent` channel (`RulesStepResult.modeEvents`),
// never `SemanticEvent`.

import type { DeviceEvent } from '../devices';
import type { ModeEvent, ModeLifecycleEvent, ModeLifecyclePhase } from './events';
import type { ModeDefinition, ModeLookup } from './registry';
import type { ActiveModeState } from '../../contracts/state';
import type { GameState } from '../../table/names';

export interface ModeLifecycleResult {
	readonly state: GameState;
	readonly events: readonly ModeLifecycleEvent[];
}

function lifecycleEvent(mode: string, phase: ModeLifecyclePhase, player: number, tick: number): ModeLifecycleEvent {
	return { type: `mode_${mode}_${phase}`, mode, player, tick };
}

/**
 * The live entry for `entry`: the same object if it is still in `state`,
 * otherwise the first entry with the same `mode` and `player` (a hook may
 * have replaced its own entry with an updated copy); `undefined` once it has
 * been removed.
 */
export function locateEntry(state: GameState, entry: ActiveModeState): ActiveModeState | undefined {
	if (state.modes.includes(entry)) {
		return entry;
	}
	return state.modes.find((candidate) => candidate.mode === entry.mode && candidate.player === entry.player);
}

/** Starts each of `definitions` for `player`, in ascending priority -- see this file's header. */
export function startModes(state: GameState, definitions: readonly ModeDefinition[], player: number, tick: number): ModeLifecycleResult {
	const ordered = [...definitions].sort((a, b) => a.priority - b.priority);
	let next = state;
	const events: ModeLifecycleEvent[] = [];
	for (const definition of ordered) {
		if (next.modes.some((active) => active.mode === definition.name && active.player === player)) {
			continue;
		}
		events.push(lifecycleEvent(definition.name, 'will_start', player, tick));
		const fields = definition.onStart ? definition.onStart(next, player, tick) : {};
		const entry: ActiveModeState = { ...fields, mode: definition.name, priority: definition.priority, player };
		next = { ...next, modes: [...next.modes, entry] };
		events.push(lifecycleEvent(definition.name, 'starting', player, tick));
		if (definition.onStarting) {
			next = definition.onStarting(next, entry, tick);
		}
		events.push(lifecycleEvent(definition.name, 'started', player, tick));
	}
	return { state: next, events };
}

/**
 * Stops each of `entries` (entries of `state`), in descending priority --
 * see this file's header. `lookup` resolves each entry's definition for its
 * stop hooks; an entry it does not know is stopped with the events alone.
 * Returns `state` itself, and no events, when `entries` is empty.
 */
export function stopModes(state: GameState, entries: readonly ActiveModeState[], tick: number, lookup: ModeLookup): ModeLifecycleResult {
	if (entries.length === 0) {
		return { state, events: [] };
	}
	const ordered = [...entries].sort((a, b) => b.priority - a.priority);
	let next = state;
	const events: ModeLifecycleEvent[] = [];
	for (const target of ordered) {
		const definition = lookup.get(target.mode);
		events.push(lifecycleEvent(target.mode, 'will_stop', target.player, tick));
		const present = locateEntry(next, target) ?? target;
		if (definition?.onStopping) {
			next = definition.onStopping(next, present, tick);
		}
		events.push(lifecycleEvent(target.mode, 'stopping', target.player, tick));
		const removed = locateEntry(next, present);
		if (removed) {
			const index = next.modes.indexOf(removed);
			next = { ...next, modes: next.modes.filter((_active, position) => position !== index) };
		}
		if (definition?.onStopped) {
			next = definition.onStopped(next, removed ?? present, tick);
		}
		events.push(lifecycleEvent(target.mode, 'stopped', target.player, tick));
	}
	return { state: next, events };
}

/** Stops every active mode (the ball end, `enterAttract()`), in descending priority. */
export function stopAllModes(state: GameState, tick: number, lookup: ModeLookup): ModeLifecycleResult {
	return stopModes(state, state.modes, tick, lookup);
}

export interface SoloModeStepResult {
	readonly state: GameState;
	readonly events: readonly ModeEvent[];
}

/** A single mode driven on its own, outside the stack -- `./base.ts` and `./skill-shot.ts` expose it for direct tests. */
export interface SoloModeDriver {
	/** Starts the mode for `player` through `startModes()` (the lifecycle events are discarded), stamped with `state.tick`. */
	start(state: GameState, player: number): GameState;
	/** Offers each of `deviceEvents`, in order, to this mode's first active entry (a no-op while none is active), stopping it through `stopModes()` when a handler returns `stop: true`. */
	step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): SoloModeStepResult;
}

/**
 * Story 3.1: the convenience a mode factory keeps for direct tests of one
 * mode (`test/rules-scoring.test.ts`, `test/rules-modes.test.ts`'s Story
 * 2.14 suite). It goes through the same lifecycle functions as the stack, so
 * it adds no second path that writes `modes[]`.
 */
export function soloModeDriver(definition: ModeDefinition): SoloModeDriver {
	const lookup: ModeLookup = { get: (name) => (name === definition.name ? definition : undefined) };

	function start(state: GameState, player: number): GameState {
		return startModes(state, [definition], player, state.tick).state;
	}

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], tick: number): SoloModeStepResult {
		let next = state;
		const events: ModeEvent[] = [];
		for (const event of deviceEvents) {
			const active = next.modes.find((entry) => entry.mode === definition.name);
			if (!active) {
				continue;
			}
			const result = definition.onEvent(next, active, event, tick);
			next = result.state;
			events.push(...(result.events ?? []));
			if (result.stop) {
				const live = locateEntry(next, active);
				const stopped = stopModes(next, live ? [live] : [], tick, lookup);
				next = stopped.state;
				events.push(...stopped.events);
			}
		}
		return { state: next, events };
	}

	return { start, step };
}
