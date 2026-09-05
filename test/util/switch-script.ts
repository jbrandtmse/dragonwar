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
import { resolveTuning, type ResolvedTuning } from '../../src/sim/table/tuning';
import type { BallWillStartEvent } from '../../src/sim/contracts/events';
import type { CoilCommand, SwitchEvent, SwitchName } from '../../src/sim/table/names';

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
	for (const event of script) {
		if (event.tick < 1 || event.tick > options.durationTicks) {
			throw new Error(
				`runSwitchScript(): scripted ${event.closed ? 'close' : 'open'} of "${event.switch}" at tick ${event.tick} ` +
				`falls outside [1, ${options.durationTicks}] (durationTicks) -- it would never be fed to the layer`,
			);
		}
	}
	for (const event of options.lifecycleEvents ?? []) {
		if (event.tick < 1 || event.tick > options.durationTicks) {
			throw new Error(
				`runSwitchScript(): scripted lifecycle event "${event.type}" at tick ${event.tick} falls outside ` +
				`[1, ${options.durationTicks}] (durationTicks) -- it would never be fed to the layer`,
			);
		}
	}

	const switchEventsByTick = new Map<number, SwitchEvent[]>();
	for (const event of script) {
		const list = switchEventsByTick.get(event.tick) ?? [];
		list.push(event);
		switchEventsByTick.set(event.tick, list);
	}
	const lifecycleEventsByTick = new Map<number, BallWillStartEvent[]>();
	for (const event of options.lifecycleEvents ?? []) {
		const list = lifecycleEventsByTick.get(event.tick) ?? [];
		list.push(event);
		lifecycleEventsByTick.set(event.tick, list);
	}

	const events: DeviceEvent[] = [];
	const coilCommands: CoilCommand[] = [];
	for (let tick = 1; tick <= options.durationTicks; tick++) {
		const result = layer.step(switchEventsByTick.get(tick) ?? [], lifecycleEventsByTick.get(tick) ?? [], tick);
		events.push(...result.events);
		coilCommands.push(...result.coilCommands);
	}

	return { events, coilCommands };
}
