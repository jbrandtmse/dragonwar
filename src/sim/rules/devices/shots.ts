// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19, task 2/4 -- shot-sequence detection. `TABLE.shots[*]` declares an
// ordered switch sequence with a tick window; this module is the ONLY place
// that turns a sequence completing, lapsing or falling back into
// `shot_<name>_made` / `_broken`. Subject set (`Object.keys(TABLE.shots)`) is
// derived, never a second hand-typed shot-name list (DW-149).
//
// Two kinds of shot, told apart by DATA (`TABLE.shots[*].fallBack`), never by
// a shot name:
//
// 1. A shot with no `fallBack` (the Ramp). Its first switch (re)starts an
//    attempt, its last switch inside `windowMs` is `_made`, and -- because it
//    is `entryExclusive: true` (nothing else closes `s_ramp_enter`) -- the
//    window lapsing with no completion is `_broken`. A sequence with neither
//    `fallBack` nor `entryExclusive` is tracked to completion and never
//    breaks (DW-133: a first switch other things also close is not, on its
//    own, evidence of an entry). No declared shot is one at this tree: both
//    Loops were, and now declare `fallBack`, so that branch is kept for a
//    future shot and is exercised by no test.
//
// 2. A shot with a `fallBack` signature (both Loops; Story 3.6, AD-19 amended
//    2026-09-30, DW-288 and DW-173). A Loop's entry switch is also closed by a
//    ball coming DOWN its lane -- the other Loop's orbit, a plunge, and (on
//    the right) a made Ramp's return -- so the signature says which closures
//    are an entry, and `_broken` means "entered and fell back". Per shot the
//    tracker keeps at most one `flight { startTick }` (an armed attempt) and
//    one `descent { tick }` (a ball seen coming down from above), and on each
//    closed edge of a switch the shot declares it applies the FIRST rule
//    that matches:
//      a. its own exit switch, with a flight, within `windowMs` of the entry
//         -> `_made`; the flight is cleared.
//      b. a `descents` switch with no flight -> the descent is set to this
//         tick.
//      c. a `descents` switch while a flight exists (outside the made window)
//         -> ignored.
//      d. its own entry switch with a flight -> `_broken` (the ball fell back
//         through the entry); the flight is cleared.
//      e. its own entry switch with a pending descent -> the descent is
//         cleared (the ball is passing down). Nothing is armed.
//      f. its own entry switch otherwise -> a flight is armed at this tick.
//      g. an `exits` switch with a flight -> `_broken`; the flight is cleared.
//      h. an `exits` switch in any case -> the descent is cleared.
//    A flight is dropped silently once `tick > startTick + breakTicks`
//    (`fallBack.windowMs`) and a descent once `tick > descent.tick +
//    descentTicks` (`fallBack.descentWindowMs`): a Loop NEVER emits `_broken`
//    on expiry. Rule (e) is DW-173's fix: a made orbit's descent through the
//    far lane no longer arms the opposite Loop, so two same-side orbits no
//    longer fake an alternation through it. The mark is consumed by the FIRST
//    entry closure and lapses on the clock, so a descending ball that closes
//    the entry switch twice, or reaches it after `descentWindowMs`, still
//    arms (measured on teleported launches only; ledger DW-323 and DW-322).
//
// Ordering inside `step()` is load-bearing (I/O matrix "Ramp window
// straddle"): the expiry pass for every shot runs BEFORE this tick's own
// switch edges are read, so a completion switch arriving on the EXACT tick
// the window has already lapsed ("the late s_ramp_made starts nothing") finds
// no in-flight state left to complete -- it neither restarts a sequence (it
// is not the sequence's own first switch) nor is mistaken for a live one.
// The same holds for a fall-back shot's two windows: a second entry closure
// one tick past the break window arms a new flight, it does not break the
// lapsed one.
//
// Known limit (Story 3.6, deferred to the multiball stories): the state is
// one attempt and one descent per SHOT, not per ball, so a second ball
// crossing a lane mid-attempt can break or suppress another ball's attempt.

import { TABLE } from '../../table/dragonwar';
import { shotWindowTicks, type ResolvedTuning, type ShotWindowMsKey } from '../../table/tuning';
import type { ShotName, SwitchEvent, SwitchName } from '../../table/names';
import type { ShotBrokenEvent, ShotMadeEvent } from './events';

type ShotEvent = ShotMadeEvent | ShotBrokenEvent;

/** `TABLE.shots[*].fallBack`, as this module reads it -- see this file's header. A typo'd switch or tunable key in the table is a `pnpm typecheck` failure at `planFor()` below. */
interface ShotFallBackDeclaration {
	readonly descents: readonly SwitchName[];
	readonly exits: readonly SwitchName[];
	readonly windowMs: ShotWindowMsKey;
	readonly descentWindowMs: ShotWindowMsKey;
}

/** One `TABLE.shots` entry, as this module reads it. */
interface ShotDeclaration {
	readonly sequence: readonly SwitchName[];
	readonly windowMs: ShotWindowMsKey;
	readonly entryExclusive: boolean;
	readonly fallBack?: ShotFallBackDeclaration;
}

/** A fall-back shot's two extra windows and switch sets, resolved once. */
interface FallBackPlan {
	readonly descents: ReadonlySet<SwitchName>;
	readonly exits: ReadonlySet<SwitchName>;
	readonly breakTicks: number;
	readonly descentTicks: number;
}

/** One shot, with every window resolved to ticks ONCE at construction. */
interface ShotPlan {
	readonly name: ShotName;
	readonly sequence: readonly SwitchName[];
	readonly windowTicks: number;
	readonly entryExclusive: boolean;
	readonly fallBack: FallBackPlan | null;
}

interface InFlightShot {
	readonly startTick: number;
	/** The index into `sequence` this shot is now waiting to see close. */
	nextIndex: number;
}

/** A fall-back shot's cross-tick state: at most one armed attempt and one descent mark. */
interface FallBackState {
	flight: { readonly startTick: number } | null;
	descent: { readonly tick: number } | null;
}

export interface ShotTracker {
	/** Runs one tick's switch edges through every declared shot, returning every `_made`/`_broken` this tick produced. Called every tick, even with no edges (an in-flight `entryExclusive: true` sequence can lapse with none, and a fall-back shot's flight and descent expire on the clock). */
	step(switchEvents: readonly SwitchEvent[], tick: number): readonly ShotEvent[];
}

function planFor(name: ShotName, tuning: ResolvedTuning): ShotPlan {
	const declaration: ShotDeclaration = TABLE.shots[name];
	const fallBack = declaration.fallBack;
	return {
		name,
		sequence: declaration.sequence,
		windowTicks: shotWindowTicks(declaration.windowMs, tuning),
		entryExclusive: declaration.entryExclusive,
		fallBack: fallBack
			? {
					descents: new Set(fallBack.descents),
					exits: new Set(fallBack.exits),
					breakTicks: shotWindowTicks(fallBack.windowMs, tuning),
					descentTicks: shotWindowTicks(fallBack.descentWindowMs, tuning),
				}
			: null,
	};
}

/** Builds a shot tracker with every `TABLE.shots[*]` window resolved to ticks ONCE, at construction, against `tuning` (mirrors `createMachine()`'s own construction-time tuning resolution). */
export function createShotTracker(tuning: ResolvedTuning): ShotTracker {
	const plans = (Object.keys(TABLE.shots) as ShotName[]).map((name) => planFor(name, tuning));

	const inFlight = new Map<ShotName, InFlightShot>();
	const fallBackStates = new Map<ShotName, FallBackState>();
	for (const plan of plans) {
		if (plan.fallBack) {
			fallBackStates.set(plan.name, { flight: null, descent: null });
		}
	}

	/** One closed edge against one fall-back shot -- the first matching rule of this file's header, (a) to (h). */
	function applyFallBackEdge(plan: ShotPlan, fallBack: FallBackPlan, state: FallBackState, event: SwitchEvent, tick: number, events: ShotEvent[]): void {
		const entry = plan.sequence[0];
		const exit = plan.sequence[plan.sequence.length - 1];
		const flight = state.flight;

		// (a) made: the far switch inside `windowMs` of an armed entry -- the
		// same test as before the fall-back signature. What ARMS an entry is
		// not the same: every entry closure used to (re)start the attempt, and
		// now rules (d) to (f) decide, so the same `_made` the end-of-ball
		// bonus counts (`../bonus.ts`) needs an entry that did not come from
		// above and was not closed a second time.
		if (event.switch === exit && flight && tick <= flight.startTick + plan.windowTicks) {
			state.flight = null;
			events.push({ type: `${plan.name}_made`, tick } as ShotMadeEvent);
			return;
		}
		// (b), (c): a ball coming down from above. It never arms, and it never
		// disturbs an armed attempt.
		if (fallBack.descents.has(event.switch)) {
			if (!flight) {
				state.descent = { tick: event.tick };
			}
			return;
		}
		if (event.switch === entry) {
			if (flight) {
				// (d) the armed ball fell back through the entry.
				state.flight = null;
				events.push({ type: `${plan.name}_broken`, tick } as ShotBrokenEvent);
			} else if (state.descent) {
				// (e) the descending ball passes the entry on its way down.
				state.descent = null;
			} else {
				// (f) an entry that did not come from above.
				state.flight = { startTick: event.tick };
			}
			return;
		}
		if (fallBack.exits.has(event.switch)) {
			if (flight) {
				// (g) the armed ball came back out to this side's inlane or outlane.
				state.flight = null;
				events.push({ type: `${plan.name}_broken`, tick } as ShotBrokenEvent);
			}
			// (h) whatever was descending has left the lane.
			state.descent = null;
		}
	}

	/** One closed edge against one shot with no `fallBack` -- the Ramp's behaviour, unchanged by Story 3.6. */
	function applySequenceEdge(plan: ShotPlan, event: SwitchEvent, tick: number, events: ShotEvent[]): void {
		const sequence = plan.sequence;
		const flight = inFlight.get(plan.name);
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
			inFlight.set(plan.name, { startTick: event.tick, nextIndex: 1 });
			return;
		}
		if (!flight) {
			return;
		}
		if (event.switch !== sequence[flight.nextIndex]) {
			return;
		}
		if (flight.nextIndex === sequence.length - 1) {
			inFlight.delete(plan.name);
			events.push({ type: `${plan.name}_made`, tick } as ShotMadeEvent);
		} else {
			flight.nextIndex += 1;
		}
	}

	function step(switchEvents: readonly SwitchEvent[], tick: number): readonly ShotEvent[] {
		const events: ShotEvent[] = [];

		// Expiry FIRST -- see this file's header on why the ordering is
		// load-bearing.
		for (const plan of plans) {
			const state = fallBackStates.get(plan.name);
			if (plan.fallBack && state) {
				// Silent: a fall-back shot never emits `_broken` on expiry.
				if (state.flight && tick > state.flight.startTick + plan.fallBack.breakTicks) {
					state.flight = null;
				}
				if (state.descent && tick > state.descent.tick + plan.fallBack.descentTicks) {
					state.descent = null;
				}
				continue;
			}
			const flight = inFlight.get(plan.name);
			if (!flight) {
				continue;
			}
			if (tick > flight.startTick + plan.windowTicks) {
				inFlight.delete(plan.name);
				if (plan.entryExclusive) {
					events.push({ type: `${plan.name}_broken`, tick } as ShotBrokenEvent);
				}
			}
		}

		for (const event of switchEvents) {
			if (!event.closed) {
				continue;
			}
			for (const plan of plans) {
				const state = fallBackStates.get(plan.name);
				if (plan.fallBack && state) {
					applyFallBackEdge(plan, plan.fallBack, state, event, tick, events);
				} else {
					applySequenceEdge(plan, event, tick, events);
				}
			}
		}

		return events;
	}

	return { step };
}
