// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-2, AD-11 -- the playfield/mechanism switch-edge source. Given the
// `LoadedSwitchZone[]` `loadCollision()` returns and, per tick, each ball's
// table-frame position before and after that tick's physics step, tests the
// ball's per-tick SWEPT SEGMENT against each zone's axis-aligned box (never
// the end position alone -- AD-11: "analytic tests against the ball's
// per-tick swept segment"), maintains per-switch inside/outside state with
// the `settleTicks` `resolveTuning()` computes for that switch's
// `settleClass`, and emits one `SwitchEvent` per genuine edge.
//
// Excludes every zone whose switch belongs to a PARKING device's slots
// (AD-6: "physics parks an entering ball ... closes that slot's switch" --
// those switches have exactly one owner, the device, and `sim/physics/
// devices.ts` opens/closes them itself). The exclusion is derived from
// `TABLE.ballDevices`, never from a switch-name literal (Design Notes, "How a
// draining ball enters bd_trough": AD-2 forbids two sources for one switch
// class).
//
// This file is authored, not ported -- it sits beside the vpx-js primitive
// set and carries the GPL-3.0 header rather than the port marker (AD-16,
// declared in `test/sim-boundary.test.ts`'s `AUTHORED_FILES`).

import { TABLE } from '../table/dragonwar';
import type { ResolvedTuning } from '../table/tuning';
import type { SwitchName } from '../table/names';
import type { Vec3 } from '../table/frames';
import type { LoadedSwitchZone } from './loader';
import { segmentIntersectsBox } from './geometry';

/** One ball's table-frame position before and after one tick's physics step -- the swept segment a zone test runs against. */
export interface BallMovement {
	readonly before: Vec3;
	readonly after: Vec3;
}

/** The plain shape this module emits -- structurally a `SwitchEvent<SwitchName>` (`sim/table/names.ts`'s bound alias), returned generic so this file never imports outside `sim/physics` + `sim/table`. */
export interface SwitchEdge {
	readonly type: 'switch';
	readonly switch: SwitchName;
	readonly closed: boolean;
	readonly tick: number;
}

/**
 * Every switch name owned by a PARKING device's slots (AD-6) -- excluded
 * from this module's own zone tests. Derived from `TABLE.ballDevices`, never
 * a name literal: a future ball device added to `TABLE` is covered
 * automatically.
 */
function parkingDeviceOwnedSwitches(): ReadonlySet<SwitchName> {
	const owned = new Set<SwitchName>();
	for (const device of Object.values(TABLE.ballDevices)) {
		if (device.kind === 'parking') {
			for (const slot of device.slots) {
				owned.add(slot as SwitchName);
			}
		}
	}
	return owned;
}

interface TrackedSwitch {
	readonly zones: LoadedSwitchZone[];
	readonly settleTicks: number;
	/** The last EMITTED (debounced) state -- what a consumer currently believes. */
	reported: boolean;
	/** The tick a still-unconfirmed raw transition first appeared, or `null` while stable. */
	pendingSince: number | null;
	/** The raw value that transition is heading toward, or `null` while stable. */
	pendingValue: boolean | null;
}

export interface SwitchTracker {
	/** Runs one tick's zone tests over every ball's swept segment, returning every genuine edge produced this tick. */
	step(tick: number, movements: readonly BallMovement[]): SwitchEdge[];
	/** The switch's last EMITTED state (false if never tracked -- excluded, or no zone exists for it). Lets a caller (machine.ts) read a zone-tracked switch's current state without re-deriving it. */
	currentState(name: SwitchName): boolean;
}

/**
 * Builds a switch tracker over `zones` (the `LoadedSwitchZone[]`
 * `loadCollision()` returns), excluding every parking-device-owned slot
 * zone, with per-switch settle behaviour from `resolvedTuning`.
 */
export function createSwitchTracker(zones: readonly LoadedSwitchZone[], resolvedTuning: ResolvedTuning): SwitchTracker {
	const excluded = parkingDeviceOwnedSwitches();

	const bySwitch = new Map<SwitchName, TrackedSwitch>();
	for (const zone of zones) {
		if (excluded.has(zone.switch)) {
			continue;
		}
		let tracked = bySwitch.get(zone.switch);
		if (!tracked) {
			const settleClass = TABLE.switches[zone.switch].settleClass;
			const settleTicks = resolvedTuning.switchSettleTicksByClass[settleClass].value;
			tracked = { zones: [], settleTicks, reported: false, pendingSince: null, pendingValue: null };
			bySwitch.set(zone.switch, tracked);
		}
		tracked.zones.push(zone);
	}

	return {
		step(tick, movements) {
			const events: SwitchEdge[] = [];
			for (const [name, tracked] of bySwitch) {
				const raw = movements.some((movement) =>
					tracked.zones.some((zone) => segmentIntersectsBox(movement.before, movement.after, zone.minMm, zone.maxMm)),
				);

				if (raw === tracked.reported) {
					// Back to the last reported value (or never moved from it): any
					// in-flight debounce window is cancelled, not merely paused --
					// AD-2's hysteresis is about confirming a NEW state, not about
					// remembering how close a bounce came to flipping it.
					tracked.pendingSince = null;
					tracked.pendingValue = null;
					continue;
				}

				if (tracked.pendingValue !== raw) {
					tracked.pendingSince = tick;
					tracked.pendingValue = raw;
				}

				const elapsedTicks = tick - (tracked.pendingSince as number);
				if (elapsedTicks >= tracked.settleTicks) {
					tracked.reported = raw;
					tracked.pendingSince = null;
					tracked.pendingValue = null;
					events.push({ type: 'switch', switch: name, closed: raw, tick });
				}
			}
			return events;
		},
		currentState(name) {
			return bySwitch.get(name)?.reported ?? false;
		},
	};
}
