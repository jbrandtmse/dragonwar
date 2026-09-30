// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8): the mode stack -- Epic 2's minimal two-mode stack (Story
// 2.7) generalised into the framework every Epic 3 mode registers with.
//
// - Priorities are declared once, in `MODE_PRIORITIES` (`./priorities.ts`).
//   `createModeStack(tuning, definitions?)` builds a registry
//   (`./registry.ts`) that throws at construction on a duplicate name, a
//   duplicate priority, or a priority that is not the table's. Production
//   passes no definitions and gets the base mode (100) and the skill shot
//   (200), plus -- Story 3.4 -- the three campaign Modes (Hurry-up 300,
//   filled in by Story 3.5; Joust 310 and Quick multiball 400, still
//   shells), which only the Lock arbiter starts (`./campaign.ts`); a test
//   may pass stub definitions, which must use the table's names and
//   priorities too.
// - A mode starts and stops only through `./lifecycle.ts`: `mode_<name>_
//   will_start / _starting / _started`, and `_will_stop / _stopping /
//   _stopped`, on the `ModeEvent` channel. A mode that resolves itself
//   returns `stop: true` from its handler and the stack stops it.
// - Each `step()`: first every active registered mode's optional `tick` hook
//   runs once, in descending priority (a higher mode never suppresses a
//   lower mode's hook). Then the fan-out is EVENT-MAJOR: each device event,
//   in the order the devices layer emitted it, is offered to every active
//   registered mode in descending priority before the next event is
//   offered. A mode stopped by event k receives none of events k+1..; a mode
//   started by event k receives k+1... Handlers receive only `DeviceEvent`
//   (AD-19) and have no coil channel (AD-8).
// - When this tick's ball-controller events carry `ball_starting`, the base
//   mode and the skill shot start for `currentPlayer` in this SAME
//   `rules.step`, after the fan-out -- so they first receive device events on
//   the next tick. `startBall()` has already incremented that player's
//   `ballNumber`, so the skill shot's per-ball lane advance reads the right
//   ball. No start decision is held outside `GameState`: there is no
//   deferred start, so a Slam on the next tick finds the modes in
//   `modes[]` and `enterAttract()` stops them (DW-209).
// - An entry with no registered definition (a test fixture) receives no
//   tick hook and no device event; it is only ever stopped.
//
// `createModeStack()` is instantiated ONCE per `Rules` instance
// (`sim/rules/index.ts`'s `createRules()`) and returns `{ registry, step }`;
// `createRules()` hands the same `registry` to the ball controller and the
// tilt controller so their stop paths run the same stop hooks. Never produces
// a `CoilCommand` and never touches `machine.*` itself (AD-8) -- the modes it
// drives write `players[*].lanes` and `rng`, plus `players[*].score` and
// `players[*].letters` through `sim/rules/scoring.ts` (Story 3.0a).

import type { DeviceEvent } from '../devices';
import type { GameState, SemanticEvent } from '../../table/names';
import type { ResolvedTuning } from '../../table/tuning';
import type { ActiveModeState } from '../../contracts/state';
import { baseModeLamps, createBaseMode } from './base';
import { locateEntry, startModes, stopModes } from './lifecycle';
import { createModeRegistry, type ModeDefinition, type ModeHookResult, type ModeLampHook, type ModeRegistry } from './registry';
import { createSkillShotMode, skillShotLamps } from './skill-shot';
import { createHurryUpMode } from './hurry-up';
import { createQuickMultiballMode } from './quick-multiball';
import { createJoustMode } from './joust';
import type { ModeEvent } from './events';
import type { ModeName } from './priorities';

export type { HurryUpCollectedEvent, LaneSetName, LanesCompletedEvent, ModeEvent, ModeLifecycleEvent, ModeLifecyclePhase } from './events';
export type { ModeDefinition, ModeHookResult, ModeLampHook, ModeLampRoles, ModeLookup, ModeRegistry } from './registry';
export type { ModeName } from './priorities';
export { MODE_PRIORITIES } from './priorities';
export { createModeRegistry } from './registry';
export { startModes, stopAllModes, stopModes } from './lifecycle';
export { BASE_MODE_PRIORITY } from './base';
export { SKILL_SHOT_MODE_PRIORITY } from './skill-shot';
export { CAMPAIGN_ORDER, campaignRound, candidatesFor, isCampaignMode, nextModeToLight, startCampaignMode } from './campaign';

/** The modes a ball start starts, for `currentPlayer`, in the stack's ascending-priority order. */
const BALL_START_MODES: readonly ModeName[] = ['base', 'skill_shot'];

/**
 * Story 3.1 (AD-9): each production mode's `lamps` hook, by name, for
 * `lampsOf()` (`sim/rules/lamps.ts`), which is a pure projection with no
 * stack instance in hand. The same functions the production definitions
 * carry -- one source per mode.
 */
export const MODE_LAMP_ROLES: Readonly<Partial<Record<ModeName, ModeLampHook>>> = {
	base: baseModeLamps,
	skill_shot: skillShotLamps,
};

/**
 * The production mode definitions -- the base mode and the skill shot, then
 * (Story 3.4) the three campaign Modes, Hurry-up (Story 3.5: its value,
 * timer and Ramp collect, built from `tuning`), Quick multiball and Joust.
 * They never join `BALL_START_MODES`: they start only through
 * `./campaign.ts`'s `startCampaignMode()`, called by the Lock arbiter.
 */
export function createProductionModeDefinitions(tuning: ResolvedTuning): readonly ModeDefinition[] {
	return [createBaseMode(tuning), createSkillShotMode(tuning), createHurryUpMode(tuning), createQuickMultiballMode(), createJoustMode()];
}

/** A registry of the production definitions, table priorities enforced -- what a ball or tilt controller built without the stack's own registry uses. */
export function createProductionModeRegistry(tuning: ResolvedTuning): ModeRegistry {
	return createModeRegistry(createProductionModeDefinitions(tuning), { requireTablePriorities: true });
}

export interface ModeStackStepResult {
	readonly state: GameState;
	readonly events: readonly ModeEvent[];
}

export interface ModeStack {
	/** The stack's own registry -- handed to the ball and tilt controllers so their stop paths run the same stop hooks. */
	readonly registry: ModeRegistry;
	/**
	 * `deviceEvents` is this tick's `DeviceEvent[]` (AD-19: modes never see a
	 * raw `SwitchEvent`); `lifecycleEvents` is this tick's `SemanticEvent[]`
	 * from the ball controller -- the stack looks only for `ball_starting`
	 * in it.
	 */
	step(state: GameState, deviceEvents: readonly DeviceEvent[], lifecycleEvents: readonly SemanticEvent[], tick: number): ModeStackStepResult;
}

function isBallStarting(event: SemanticEvent): boolean {
	return event.type === 'ball_starting';
}

export function createModeStack(tuning: ResolvedTuning, definitions?: readonly ModeDefinition[]): ModeStack {
	const registry = createModeRegistry(definitions ?? createProductionModeDefinitions(tuning), { requireTablePriorities: true });

	/** Every active entry with a registered definition, in descending priority (stable, so equal priorities keep list order). */
	function activeRegistered(state: GameState): ActiveModeState[] {
		const recipients: ActiveModeState[] = [];
		for (const entry of state.modes) {
			if (registry.get(entry.mode) !== undefined) {
				recipients.push(entry);
			}
		}
		return recipients.sort((a, b) => b.priority - a.priority);
	}

	/** Folds one hook result into the running state and events, stopping the entry through the lifecycle when the hook asked to stop. */
	function apply(result: ModeHookResult, entry: ActiveModeState, tick: number, events: ModeEvent[]): GameState {
		let next = result.state;
		if (result.events) {
			events.push(...result.events);
		}
		if (result.stop) {
			const live = locateEntry(next, entry);
			if (live) {
				const stopped = stopModes(next, [live], tick, registry);
				next = stopped.state;
				events.push(...stopped.events);
			}
		}
		return next;
	}

	function step(state: GameState, deviceEvents: readonly DeviceEvent[], lifecycleEvents: readonly SemanticEvent[], tick: number): ModeStackStepResult {
		let next = state;
		const events: ModeEvent[] = [];

		// 1. Per-tick hooks, descending priority, before any event.
		for (const recipient of activeRegistered(next)) {
			const definition = registry.get(recipient.mode)!;
			if (!definition.tick) {
				continue;
			}
			const live = locateEntry(next, recipient);
			if (!live) {
				continue;
			}
			next = apply(definition.tick(next, live, tick), live, tick, events);
		}

		// 2. Event-major fan-out: each event to every active mode, highest
		// priority first, before the next event. The recipients are re-read per
		// event, so a mode stopped by event k misses k+1.. and one started by
		// event k receives k+1..; `locateEntry` skips a mode a higher one has
		// already stopped on this same event.
		for (const event of deviceEvents) {
			for (const recipient of activeRegistered(next)) {
				const live = locateEntry(next, recipient);
				if (!live) {
					continue;
				}
				const definition = registry.get(live.mode)!;
				next = apply(definition.onEvent(next, live, event, tick), live, tick, events);
			}
		}

		// 3. The ball start, in this same step, after the fan-out (DW-209).
		if (lifecycleEvents.some(isBallStarting)) {
			const toStart = BALL_START_MODES.map((name) => registry.get(name)).filter((definition): definition is ModeDefinition => definition !== undefined);
			const started = startModes(next, toStart, next.currentPlayer, tick);
			next = started.state;
			events.push(...started.events);
		}

		return { state: next, events };
	}

	return { registry, step };
}
