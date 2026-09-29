// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8): the mode definition shape and the registry.
//
// A `ModeDefinition` is what a mode factory (`./base.ts`, `./skill-shot.ts`,
// and Stories 3.5-3.9's modes) hands the stack: its name and priority (from
// `MODE_PRIORITIES`, `./priorities.ts`), its lifecycle hooks, its per-tick
// hook, its one device-event handler and its lamp roles. Every hook is
// pure -- `(state, ...) -> next state` -- and none has a coil channel: a
// handler returns `{ state, events?, stop? }`, where `events` are
// `ModeEvent`s (AD-8: a mode "never emits a CoilCommand"; AD-19: it consumes
// `DeviceEvent`s only). A mode never adds or removes its own `modes[]`
// entry: it returns `stop: true` and the stack stops it through
// `./lifecycle.ts`, the only file that writes the list.
//
// `createModeRegistry()` validates at construction, which is load time
// (Conventions, Errors: "load-time paths throw"): two definitions with the
// same name or the same priority throw an `Error` naming both modes and the
// value. `requireTablePriorities` (the stack always passes it, `./index.ts`)
// additionally rejects a definition whose priority is not its name's
// `MODE_PRIORITIES` entry.

import { MODE_PRIORITIES, type ModeName } from './priorities';
import type { DeviceEvent } from '../devices';
import type { ModeEvent } from './events';
import type { ActiveModeState } from '../../contracts/state';
import type { LampProjectionEntry } from '../../contracts';
import type { GameState, LampName } from '../../table/names';

/** What a mode's `onEvent` / `tick` hook returns: the next state, any `ModeEvent`s, and `stop: true` to ask the stack to stop this entry. There is no coil channel. */
export interface ModeHookResult {
	readonly state: GameState;
	readonly events?: readonly ModeEvent[];
	readonly stop?: true;
}

/** A mode's lamp contribution (AD-9): `{ role, step }` per lamp it has an opinion on. `lampsOf()` (`sim/rules/lamps.ts`) applies every active mode's roles in ascending priority, so a higher mode overwrites per lamp. It finds each hook in `MODE_LAMP_ROLES` (`./index.ts`), not in the registry: a production mode's hook is registered there too, and a stub definition's `lamps` is never composed. */
export type ModeLampRoles = Readonly<Partial<Record<LampName, LampProjectionEntry>>>;

/** `lamps(state, entry)` -- pure and tuning-free, so `lampsOf()` can call it with no mode instance in hand. */
export type ModeLampHook = (state: GameState, entry: ActiveModeState) => ModeLampRoles;

/**
 * Story 3.1 (AD-8): one mode, as the stack drives it. The lifecycle
 * (`./lifecycle.ts`) calls the six phase hooks in order; the stack
 * (`./index.ts`) calls `tick` once per `rules.step` and `onEvent` once per
 * device event.
 */
export interface ModeDefinition {
	readonly name: ModeName;
	/** Must equal `MODE_PRIORITIES[name]` -- the stack's registry refuses anything else. */
	readonly priority: number;
	/** `_will_start` -> `_starting`: the new entry's own mode-local fields (merged first, so it cannot override `mode`, `priority` or `player`), e.g. the skill shot's `launched: false`. The entry does not exist yet when this runs. */
	readonly onStart?: (state: GameState, player: number, tick: number) => Readonly<Record<string, unknown>>;
	/** `_starting`: the entry has just been pushed; the mode's own start-of-life writes (the base mode's lane reset, the skill shot's lit lane). */
	readonly onStarting?: (state: GameState, entry: ActiveModeState, tick: number) => GameState;
	/** Once per `rules.step`, before any device event is delivered, in descending priority (a timer's decrement). A higher mode never suppresses it. */
	readonly tick?: (state: GameState, entry: ActiveModeState, tick: number) => ModeHookResult;
	/** One device event (AD-19), offered to every active mode in descending priority before the next event. */
	readonly onEvent: (state: GameState, entry: ActiveModeState, event: DeviceEvent, tick: number) => ModeHookResult;
	/** `_stopping`: the entry is still present. Pure and tuning-free -- the ball end and the Slam run it in place. */
	readonly onStopping?: (state: GameState, entry: ActiveModeState, tick: number) => GameState;
	/** `_stopped`: the entry has just been removed. Pure and tuning-free, like `onStopping`. */
	readonly onStopped?: (state: GameState, entry: ActiveModeState, tick: number) => GameState;
	/** The mode's lamp roles -- see `ModeLampHook`. A production mode also lists this same function in `MODE_LAMP_ROLES` (`./index.ts`), which is what `lampsOf()` reads; `test/rules-mode-stack.test.ts` fails if the two disagree. */
	readonly lamps?: ModeLampHook;
}

/** Looks a registered definition up by an entry's `mode` name -- `undefined` for an unregistered name (a test fixture such as `stub`). */
export interface ModeLookup {
	get(name: string): ModeDefinition | undefined;
}

export interface ModeRegistry extends ModeLookup {
	/** Every registered definition, in descending priority. */
	readonly definitions: readonly ModeDefinition[];
}

export interface ModeRegistryOptions {
	/** Also reject any definition whose `priority` is not `MODE_PRIORITIES[name]`. */
	readonly requireTablePriorities?: boolean;
}

function labelOf(definition: ModeDefinition): string {
	return `${definition.name}@${definition.priority}`;
}

/**
 * Story 3.1 (AD-8): builds the registry, throwing at construction on a
 * duplicate name or a duplicate priority (the message names both modes and
 * the value), and -- with `requireTablePriorities` -- on a priority that is
 * not the table's.
 */
export function createModeRegistry(definitions: readonly ModeDefinition[], options: ModeRegistryOptions = {}): ModeRegistry {
	for (let i = 0; i < definitions.length; i++) {
		const a = definitions[i]!;
		for (let j = i + 1; j < definitions.length; j++) {
			const b = definitions[j]!;
			if (a.name === b.name) {
				throw new Error(`mode registry: duplicate mode name "${a.name}" -- ${labelOf(a)} and ${labelOf(b)} are both registered`);
			}
			if (a.priority === b.priority) {
				throw new Error(`mode registry: duplicate priority ${a.priority} -- ${labelOf(a)} and ${labelOf(b)} are both registered`);
			}
		}
	}
	if (options.requireTablePriorities) {
		for (const definition of definitions) {
			const declared: number | undefined = (MODE_PRIORITIES as Readonly<Record<string, number>>)[definition.name];
			if (declared !== definition.priority) {
				throw new Error(
					`mode registry: ${labelOf(definition)} does not match MODE_PRIORITIES (${definition.name}: ${declared === undefined ? 'undeclared' : declared})`,
				);
			}
		}
	}

	const byName = new Map<string, ModeDefinition>(definitions.map((definition) => [definition.name, definition]));
	const ordered = [...definitions].sort((a, b) => b.priority - a.priority);
	return {
		definitions: ordered,
		get: (name) => byName.get(name),
	};
}
