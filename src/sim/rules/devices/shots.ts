// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19, task 2/4 -- shot-sequence detection. `TABLE.shots[*]` declares an
// ordered switch sequence with a tick window; this module is the ONLY place
// that turns a sequence completing (or lapsing) into `shot_<name>_made` /
// `_broken`. Subject set (`Object.keys(TABLE.shots)`) is derived, never a
// second hand-typed shot-name list (DW-149).
//
// DW-133 -- addressed here, as DATA, not a branch: `TABLE.shots[*].entryExclusive`
// records whether anything but this shot closes the sequence's first switch.
// A sequence with `entryExclusive: false` (both Loops -- a bare
// `s_loop_*_in` is also closed by an outlane drain and by a made Ramp) is
// tracked to completion but NEVER emits `_broken` on expiry: the naive
// alternative -- emit `_broken` whenever the window lapses without a
// completion -- would fire on both the outlane drain and the made Ramp,
// which IS treating the bare `_in` as a Loop entry, the exact thing this
// flag forbids. `entryExclusive: true` (the Ramp, whose own `s_ramp_enter`
// is closed by nothing else) keeps `_broken` a real, falsifiable event.
//
// Ordering inside `step()` is load-bearing (I/O matrix "Ramp window
// straddle"): the expiry pass for every in-flight, still-unresolved
// sequence runs BEFORE this tick's own switch edges are read, so a
// completion switch arriving on the EXACT tick the window has already
// lapsed ("the late s_ramp_made starts nothing") finds no in-flight state
// left to complete -- it neither restarts a sequence (it is not the
// sequence's own first switch) nor is mistaken for a live one.

import { TABLE } from '../../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning } from '../../table/tuning';
import type { ShotName, SwitchEvent, SwitchName } from '../../table/names';
import type { ShotBrokenEvent, ShotMadeEvent } from './events';

type ShotEvent = ShotMadeEvent | ShotBrokenEvent;

interface InFlightShot {
	readonly startTick: number;
	/** The index into `sequence` this shot is now waiting to see close. */
	nextIndex: number;
}

export interface ShotTracker {
	/** Runs one tick's switch edges through every declared shot's sequence, returning every `_made`/`_broken` this tick produced. Called every tick, even with no edges (an in-flight, `entryExclusive: true` sequence can lapse with none). */
	step(switchEvents: readonly SwitchEvent[], tick: number): readonly ShotEvent[];
}

/** Builds a shot tracker with every `TABLE.shots[*].windowMs` resolved to ticks ONCE, at construction, against `tuning` (mirrors `createMachine()`'s own construction-time tuning resolution). */
export function createShotTracker(tuning: ResolvedTuning): ShotTracker {
	const shotNames = Object.keys(TABLE.shots) as ShotName[];
	const windowTicksByShot = new Map<ShotName, number>();
	for (const name of shotNames) {
		windowTicksByShot.set(name, shotWindowTicks(TABLE.shots[name].windowMs, tuning));
	}

	const inFlight = new Map<ShotName, InFlightShot>();

	function step(switchEvents: readonly SwitchEvent[], tick: number): readonly ShotEvent[] {
		const events: ShotEvent[] = [];

		// Expiry FIRST -- see this file's header on why the ordering is
		// load-bearing.
		for (const name of shotNames) {
			const flight = inFlight.get(name);
			if (!flight) {
				continue;
			}
			const windowTicks = windowTicksByShot.get(name)!;
			if (tick > flight.startTick + windowTicks) {
				inFlight.delete(name);
				if (TABLE.shots[name].entryExclusive) {
					events.push({ type: `${name}_broken`, tick } as ShotBrokenEvent);
				}
			}
		}

		for (const event of switchEvents) {
			if (!event.closed) {
				continue;
			}
			for (const name of shotNames) {
				const sequence = TABLE.shots[name].sequence as readonly SwitchName[];
				const flight = inFlight.get(name);
				// A repeated close of the sequence's OWN first switch -- the ball
				// re-entering the mouth without having completed the shot --
				// (re)starts the window from THIS touch, whether or not an
				// attempt was already in flight. Without this, a re-entry mid-
				// flight would fall through to the `sequence[flight.nextIndex]`
				// check below (which a first-switch closure never matches once
				// `nextIndex >= 1`), silently doing nothing and leaving the
				// ORIGINAL, now-stale `startTick` as the window anchor -- so a
				// genuinely timely completion measured from the real (later)
				// entry could be judged already-expired by that stale window.
				if (event.switch === sequence[0]) {
					inFlight.set(name, { startTick: event.tick, nextIndex: 1 });
					continue;
				}
				if (!flight) {
					continue;
				}
				if (event.switch !== sequence[flight.nextIndex]) {
					continue;
				}
				if (flight.nextIndex === sequence.length - 1) {
					inFlight.delete(name);
					events.push({ type: `${name}_made`, tick } as ShotMadeEvent);
				} else {
					flight.nextIndex += 1;
				}
			}
		}

		return events;
	}

	return { step };
}
