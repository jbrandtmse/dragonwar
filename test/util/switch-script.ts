// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.4 (AD-15: "Rules are tested headless in Vitest via a switch-script
// DSL typed by SwitchName"): a small fluent builder for a tick-ordered
// `SwitchEvent[]` -- `close('s_loop_l_in').at(100).open().at(120)` -- plus a
// runner that drives a real `createDevicesLayer()` instance tick by tick and
// collects every event and coil command it emits. Replaces the
// `as SwitchEvent`-cast `edge()` helper `test/rules-devices.test.ts` used to
// hand-roll (that cast erased `SwitchName` typing entirely -- a typo'd
// switch name compiled and silently matched nothing).
//
// `.at(tick)` commits the switch/closed pair set by the most recent
// `close(...)`/`open(...)` call at that tick, and leaves the SAME switch
// "current" for the next call -- `close('s_ramp_enter').at(100).open().at(140)`
// closes then re-opens `s_ramp_enter`; `.close('s_ramp_made')` or
// `.open('s_ramp_made')` (an explicit argument) switches which switch
// subsequent calls address.

import { createDevicesLayer, type DeviceEvent } from '../../src/sim/rules/devices';
import { createRules, type ModeEvent } from '../../src/sim/rules';
import { resolveTuning, type ResolvedTuning } from '../../src/sim/table/tuning';
import type { BallWillStartEvent } from '../../src/sim/contracts/events';
import type { GameAdjustments } from '../../src/sim/contracts/replay';
import type { CoilCommand, GameState, SemanticEvent, SwitchEvent, SwitchName } from '../../src/sim/table/names';

interface ScheduledStep {
	readonly switch: SwitchName;
	readonly closed: boolean;
	readonly tick: number;
}

/** The fluent switch-script builder `close()`/`open()` (below) return. */
export class SwitchScript {
	private readonly steps: ScheduledStep[] = [];
	private currentSwitch: SwitchName;
	private currentClosed: boolean;

	constructor(switchName: SwitchName, closed: boolean) {
		this.currentSwitch = switchName;
		this.currentClosed = closed;
	}

	/** Commits the current switch/closed pair at `tick`. Chainable -- the switch stays "current" until the next `close()`/`open()` call. */
	at(tick: number): this {
		this.steps.push({ switch: this.currentSwitch, closed: this.currentClosed, tick });
		return this;
	}

	/** Sets the pending edge to CLOSE -- `switchName` omitted keeps addressing the current switch (a re-close); given, switches which one subsequent `.at()` calls commit. */
	close(switchName?: SwitchName): this {
		if (switchName !== undefined) {
			this.currentSwitch = switchName;
		}
		this.currentClosed = true;
		return this;
	}

	/** Sets the pending edge to OPEN -- same `switchName`-omission rule as `close()`. */
	open(switchName?: SwitchName): this {
		if (switchName !== undefined) {
			this.currentSwitch = switchName;
		}
		this.currentClosed = false;
		return this;
	}

	/** The tick-ordered `SwitchEvent[]` every committed `.at()` call produced -- stable sort, so two edges scripted at the same tick keep their authored order. */
	build(): readonly SwitchEvent[] {
		return [...this.steps]
			.sort((a, b) => a.tick - b.tick)
			.map((step) => ({ type: 'switch' as const, switch: step.switch, closed: step.closed, tick: step.tick }));
	}
}

/** Starts a switch script with `switchName` CLOSING first -- `close('s_loop_l_in').at(100)…`. */
export function close(switchName: SwitchName): SwitchScript {
	return new SwitchScript(switchName, true);
}

/** Starts a switch script with `switchName` OPENING first (e.g. the shooter lane's own launch edge). */
export function open(switchName: SwitchName): SwitchScript {
	return new SwitchScript(switchName, false);
}

/**
 * Story 2.5, task 11: extracted so `runRulesScript()` below shares the SAME
 * out-of-range check `runSwitchScript()` already had, rather than a second,
 * drifting copy. Throws naming whatever `describeItem()` returns for the
 * offending item, plus the shared `[1, durationTicks]` bound.
 */
function assertTicksInRange<T extends { readonly tick: number }>(items: readonly T[], durationTicks: number, describeItem: (item: T) => string): void {
	for (const item of items) {
		if (item.tick < 1 || item.tick > durationTicks) {
			throw new Error(`${describeItem(item)} falls outside [1, ${durationTicks}] (durationTicks) -- it would never be fed to the layer`);
		}
	}
}

/** Story 2.5, task 11: extracted so `runRulesScript()` below shares the SAME by-tick regrouping `runSwitchScript()` already had. */
function groupByTick<T extends { readonly tick: number }>(items: readonly T[]): Map<number, T[]> {
	const map = new Map<number, T[]>();
	for (const item of items) {
		const list = map.get(item.tick) ?? [];
		list.push(item);
		map.set(item.tick, list);
	}
	return map;
}

export interface RunSwitchScriptOptions {
	/** Defaults to `resolveTuning()` -- pass an override only to observe a different window (e.g. `resolveTuning(overrideTuning)`, computed by the caller, never re-resolved here per the tuning override seam's own contract). */
	readonly tuning?: ResolvedTuning;
	/** The devices layer's `step()` is called once per tick from 1 through this value inclusive, even on a tick with no scripted edge (AD-4: "every step, even with none" -- an in-flight, `entryExclusive: true` shot must be able to lapse with none). */
	readonly durationTicks: number;
	/** Rare: a `ball_will_start` (or any future lifecycle event) to feed at a specific tick -- most scripts need none, since nothing produces one in this story (task 4). */
	readonly lifecycleEvents?: readonly BallWillStartEvent[];
}

export interface SwitchScriptRunResult {
	/** Every event the layer emitted, across the whole run, in tick order. */
	readonly events: readonly DeviceEvent[];
	/** Every coil command the layer emitted, across the whole run, in tick order. */
	readonly coilCommands: readonly CoilCommand[];
}

/**
 * Drives a FRESH `createDevicesLayer()` instance, tick by tick from 1 through
 * `options.durationTicks`, feeding it `script`'s edges (grouped by tick) and
 * any `options.lifecycleEvents` (grouped by their own tick) at the tick they
 * are scripted for. No physics, no rendering, no `sim/loop` -- this is the
 * layer's own entry point, driven directly (AC 9).
 */
export function runSwitchScript(script: readonly SwitchEvent[], options: RunSwitchScriptOptions): SwitchScriptRunResult {
	const tuning = options.tuning ?? resolveTuning();
	const layer = createDevicesLayer(tuning);

	// A scripted tick outside [1, durationTicks] would otherwise be silently
	// dropped below (the tick loop never visits it, and `.get()` on a Map key
	// nothing ever looks up just returns undefined) -- a caller who mis-sizes
	// `durationTicks` would see a test pass or fail for the wrong reason,
	// never learning its own script's edge was never fed to the layer at
	// all. Fail loudly instead (Review Findings: edge-case-hunter).
	assertTicksInRange(script, options.durationTicks, (e) => `runSwitchScript(): scripted ${e.closed ? 'close' : 'open'} of "${e.switch}" at tick ${e.tick}`);
	assertTicksInRange(options.lifecycleEvents ?? [], options.durationTicks, (e) => `runSwitchScript(): scripted lifecycle event "${e.type}" at tick ${e.tick}`);

	const switchEventsByTick = groupByTick(script);
	const lifecycleEventsByTick = groupByTick(options.lifecycleEvents ?? []);

	const events: DeviceEvent[] = [];
	const coilCommands: CoilCommand[] = [];
	for (let tick = 1; tick <= options.durationTicks; tick++) {
		const result = layer.step(switchEventsByTick.get(tick) ?? [], lifecycleEventsByTick.get(tick) ?? [], tick);
		events.push(...result.events);
		coilCommands.push(...result.coilCommands);
	}

	return { events, coilCommands };
}

/**
 * Story 2.5, task 11 (AD-15): the headless `GameState`-level runner
 * `test/rules-lifecycle.test.ts` drives every I/O-matrix row through --
 * `runSwitchScript()` above has no `GameState` at all (the devices layer is
 * `GameState`-free by construction, AD-19), and this story's ACs are
 * `GameState`/`RulesStepResult` assertions. No `lifecycleEvents` option: after
 * task 4 the rules layer is its OWN lifecycle producer (the ball controller),
 * and `Rules['step']` has no such parameter -- unlike `runSwitchScript()`
 * above, which drives the devices layer directly and still needs one.
 */
export interface RunRulesScriptOptions {
	/** Defaults to `resolveTuning()` -- same contract as `RunSwitchScriptOptions.tuning` above. */
	readonly tuning?: ResolvedTuning;
	/** Defaults to `createRules()`'s own default (`ballsPerGame: 3` among others) -- see `sim/rules/index.ts`'s `DEFAULT_ADJUSTMENTS`. Pass an override to exercise a different `ballsPerGame` threshold (AC 6). */
	readonly adjustments?: GameAdjustments;
	/** `createRules().step()` is called once per tick from 1 through this value inclusive, even on a tick with no scripted edge (AD-4: "every step, even with none"). */
	readonly durationTicks: number;
	/** Defaults to a fresh Attract-phase `GameState` with no players -- see `DEFAULT_INITIAL_STATE` below. Pass one to start mid-game (e.g. AC 5/AC 6's drain/game-over scenarios, which need players and machine state already in place). */
	readonly initialState?: GameState;
}

export interface RunRulesScriptResult {
	/** The `GameState` after the LAST tick run. */
	readonly finalState: GameState;
	/** The `GameState` after EVERY tick run, keyed by tick -- lets a test inspect an intermediate state (e.g. right after a specific Start press) without re-deriving it. */
	readonly statesByTick: ReadonlyMap<number, GameState>;
	/** Every `SemanticEvent` `rules.step()` returned, across the whole run, in tick order (post the closed-union filter -- `sim/rules/index.ts`'s own `events`, never the devices layer's internal `DeviceEvent[]`). */
	readonly events: readonly SemanticEvent[];
	/** Every `CoilCommand` `rules.step()` returned, across the whole run, in tick order. */
	readonly coilCommands: readonly CoilCommand[];
	/** Story 2.7, task 12: every `ModeEvent` (`RulesStepResult.modeEvents`) across the whole run, in tick order -- surfaced so a headless test can observe `lanes_completed` (AC 5) without touching `sim/loop`. */
	readonly modeEvents: readonly ModeEvent[];
}

/**
 * A fresh Attract-phase `GameState` matching `sim/loop/index.ts`'s OWN
 * post-task-6 boot construction: `hardwareEnabled: false`, `deviceSlots`
 * matching every ball device's declared boot occupancy (`bd_trough` full,
 * `bd_lock`/`bd_shooter` empty). A test-local literal (never a physics read,
 * and device-name literals are unrestricted under `test/**`) rather than an
 * import of `sim/loop`'s own boot seed, which would pull physics/loop into
 * this headless runner's own module graph (AC 9).
 */
const DEFAULT_INITIAL_STATE: GameState = {
	tick: 0,
	phase: 'attract',
	machine: {
		ballsInPlay: 0,
		hardwareEnabled: false,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] },
	},
	players: [],
	currentPlayer: 0,
	modes: [],
	rng: 0,
};

/**
 * Drives a FRESH `createRules()` instance, tick by tick from 1 through
 * `options.durationTicks`, threading `GameState` through exactly as
 * `sim/loop/index.ts`'s own `advance()` does (`state = rulesResult.state`,
 * post-DW-70 -- no per-tick `deviceSlots` copy). No physics, no rendering, no
 * `sim/loop` (AC 9).
 */
export function runRulesScript(script: readonly SwitchEvent[], options: RunRulesScriptOptions): RunRulesScriptResult {
	const tuning = options.tuning ?? resolveTuning();
	const rules = createRules(tuning, options.adjustments);

	assertTicksInRange(script, options.durationTicks, (e) => `runRulesScript(): scripted ${e.closed ? 'close' : 'open'} of "${e.switch}" at tick ${e.tick}`);

	const switchEventsByTick = groupByTick(script);

	let state = options.initialState ?? DEFAULT_INITIAL_STATE;
	const statesByTick = new Map<number, GameState>();
	const events: SemanticEvent[] = [];
	const coilCommands: CoilCommand[] = [];
	const modeEvents: ModeEvent[] = [];
	for (let tick = 1; tick <= options.durationTicks; tick++) {
		const result = rules.step(state, switchEventsByTick.get(tick) ?? [], tick);
		state = result.state;
		statesByTick.set(tick, state);
		events.push(...result.events);
		coilCommands.push(...result.coilCommands);
		modeEvents.push(...result.modeEvents);
	}

	return { finalState: state, statesByTick, events, coilCommands, modeEvents };
}
