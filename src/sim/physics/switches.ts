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
// declared in `test/port-provenance.test.ts`'s `AUTHORED_FILES`).

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

				// DW-67 (AD-2, AMENDED 2026-09-01): "settleTicks gates the BREAK,
				// never the MAKE." A raw closure LATCHES immediately, on the very
				// tick it is first observed -- no debounce at all. Debouncing the
				// make instead is exactly the defect this fix closes: a zone
				// crossing shorter than settleTicks + 1 ticks (a fast ball through
				// an 8 ms standup or a 20 ms drop target) would settle its
				// "pending" window only after the ball had already left, so no
				// `closed: true` edge -- and therefore no `closed: false` either --
				// would ever be emitted at all, falsifying FR-11 ("no ball is ever
				// lost by a missed switch at any ball speed the Physics core can
				// produce") the moment the first such switch existed. Only the
				// OPENING (raw === false) still runs the settle window below, so a
				// contact bounce on the way OUT (a flicker back to raw === true
				// inside the break window) still cancels it via the reported-value
				// branch above, restarting the window rather than emitting a
				// premature break.
				//
				// Story 2.1d (DW-67 residual, AD-2 amended text re-quoted above):
				// the break-side COUNTING itself still carried a one-tick residual
				// of this same historical off-by-one. `pendingSince` latches on the
				// FIRST tick read outside; the guard below used to require
				// `elapsedTicks >= settleTicks`, which only becomes true on the
				// `settleTicks + 1`-th outside tick (pendingSince's own tick counts
				// as the first). Corrected to `elapsedTicks >= settleTicks - 1`, so
				// the break fires on the `settleTicks`-th CONSECUTIVE outside tick --
				// AD-2's amended text exactly ("the number of ticks the zone test
				// must read outside before closed: false is emitted"). `settleTicks
				// = 0` is a fixed point of both formulations (`-1 >= -1` is as true
				// as `0 >= 0`), which is why no switch could ever expose this until
				// Story 2.1b gave the table its first non-zero settle classes.
				if (raw) {
					tracked.reported = true;
					tracked.pendingSince = null;
					tracked.pendingValue = null;
					events.push({ type: 'switch', switch: name, closed: true, tick });
					continue;
				}

				if (tracked.pendingValue !== raw) {
					tracked.pendingSince = tick;
					tracked.pendingValue = raw;
				}

				const elapsedTicks = tick - (tracked.pendingSince as number);
				if (elapsedTicks >= tracked.settleTicks - 1) {
					tracked.reported = false;
					tracked.pendingSince = null;
					tracked.pendingValue = null;
					events.push({ type: 'switch', switch: name, closed: false, tick });
				}
			}
			return events;
		},
		currentState(name) {
			return bySwitch.get(name)?.reported ?? false;
		},
	};
}
