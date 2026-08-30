// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.5's I/O matrix, switch rows: swept-segment detection of a zone
// crossed entirely within one tick (never the end position alone); exactly
// one edge per crossing under a 0 ms settle class, not one per tick; and
// slot switches (a parking device's own -- AD-6) never emitted by this zone
// tester, derived from TABLE.ballDevices rather than a name literal.
// Unit-level: drives createSwitchTracker() directly with synthetic zones, so
// this suite has no dependency on the committed collision document's exact
// geometry.

import { describe, expect, it } from 'vitest';
import { createSwitchTracker } from '../src/sim/physics/switches';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import type { LoadedSwitchZone } from '../src/sim/physics/loader';

const TUNING = resolveTuning();

function zone(name: string, switchName: string, minMm: { x: number; y: number; z: number }, maxMm: { x: number; y: number; z: number }): LoadedSwitchZone {
	return { name, switch: switchName as LoadedSwitchZone['switch'], minMm, maxMm };
}

describe('createSwitchTracker() -- swept-segment zone tests (AD-2, AD-11)', () => {
	it('a ball crossing a zone entirely within one tick (both endpoints OUTSIDE) still registers -- the swept segment, never the end position', () => {
		// s_start is a real TABLE.switches key with settleClass 'button' (0 ms) --
		// used here purely as a valid switch name for a synthetic zone; its real
		// meaning (a button switch) is irrelevant to this unit-level test.
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);

		// Before: far to the left, outside the zone. After: far to the right,
		// also outside the zone. The straight-line segment between the two
		// passes directly through it.
		const events = tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 100, y: 0, z: 15 } }]);
		expect(events).toEqual([{ type: 'switch', switch: 's_start', closed: true, tick: 1 }]);
	});

	it('a ball whose end position is outside the zone even though its START was also outside does NOT register when the segment never enters it', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);
		const events = tracker.step(1, [{ before: { x: -100, y: 100, z: 15 }, after: { x: 100, y: 100, z: 15 } }]);
		expect(events).toEqual([]);
	});

	// QA (DW-61 z-sensitivity gap, this story's own review corrected this
	// exact claim -- see spec-1-10 `## Verification`'s `[LEAD CORRECTION]`):
	// every OTHER fixture in this describe block holds z constant at 15,
	// squarely inside the zone's [0, 30] range, so this suite never actually
	// exercises segmentIntersectsBox()'s z-axis slab clip -- dropping it
	// entirely would leave every assertion above still green. This is the
	// exact same X/Y sweep as the very first test above (which registers
	// true), but held at z = 200 -- outside [0, 30] the whole tick -- so this
	// one must NOT register. Falsifiability: mutation: drop the z-axis clip
	// from the shared src/sim/physics/geometry.ts segmentIntersectsBox() (the
	// same mutation the spec's [LEAD CORRECTION] applied and found this exact
	// suite insensitive to) -> this assertion goes red.
	it('the swept-segment test genuinely uses the Z axis, not just X/Y: the SAME crossing sweep as the first test above, but held entirely outside the zone on Z, does NOT register', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);
		const events = tracker.step(1, [{ before: { x: -100, y: 0, z: 200 }, after: { x: 100, y: 0, z: 200 } }]);
		expect(events, 'an X/Y-only crossing sweep held outside the zone on Z must not register -- the Z slab clip is what rejects it').toEqual([]);
	});

	it('a 0 ms settle class produces exactly one close edge on entry and exactly one open edge on exit, never one per tick while stable', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);
		expect(TABLE.switches.s_start.settleClass).toBe('button');
		expect(TUNING.switchSettleTicksByClass.button.value).toBe(0);

		const allEvents: unknown[] = [];
		// Enter at tick 1.
		allEvents.push(...tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Stay put for several ticks -- the ball does not move, still inside.
		for (let tick = 2; tick <= 10; tick++) {
			allEvents.push(...tracker.step(tick, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		}
		// Tick 11's segment STARTS inside the zone (x = 0) -- the ball genuinely
		// occupied it for part of this tick, so this still reads as closed, no
		// new edge (the swept-segment test, not an end-position-only one).
		allEvents.push(...tracker.step(11, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 100, y: 0, z: 15 } }]));
		// Tick 12's segment is entirely OUTSIDE (both ends past the zone,
		// moving further away) -- the open edge fires here.
		allEvents.push(...tracker.step(12, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }]));

		expect(allEvents).toEqual([
			{ type: 'switch', switch: 's_start', closed: true, tick: 1 },
			{ type: 'switch', switch: 's_start', closed: false, tick: 12 },
		]);
	});

	it('a switch with NO zone reports currentState() false and is never touched by step()', () => {
		const tracker = createSwitchTracker([], TUNING);
		expect(tracker.currentState('s_start')).toBe(false);
		expect(tracker.step(1, [{ before: { x: 0, y: 0, z: 0 }, after: { x: 0, y: 0, z: 0 } }])).toEqual([]);
	});
});

describe('createSwitchTracker() -- a parking device\'s slot switches are NEVER emitted here (AD-6, device-owned)', () => {
	it('a zone whose switch is one of TABLE.ballDevices.bd_trough.slots produces no events even when a ball crosses it', () => {
		const slotSwitch = TABLE.ballDevices.bd_trough.slots[0];
		const zones = [zone('sw_trough_1', slotSwitch, { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);

		const events = tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 100, y: 0, z: 15 } }]);
		expect(events, 'a parking device slot zone must be excluded from the generic zone tester -- sim/physics/devices.ts owns it').toEqual([]);
		expect(tracker.currentState(slotSwitch)).toBe(false);
	});

	it('every parking-device slot switch is excluded, derived from TABLE.ballDevices -- no device added later needs this test updated', () => {
		const owned: string[] = [];
		for (const device of Object.values(TABLE.ballDevices)) {
			if (device.kind === 'parking') {
				owned.push(...device.slots);
			}
		}
		expect(owned.length).toBeGreaterThan(0);

		const zones = owned.map((switchName, i) => zone(`sw_slot_${i}`, switchName, { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 }));
		const tracker = createSwitchTracker(zones, TUNING);
		const movements = [{ before: { x: -100, y: 0, z: 15 }, after: { x: 100, y: 0, z: 15 } }];
		expect(tracker.step(1, movements)).toEqual([]);
	});

	it('a NON-parking device\'s entry switch (bd_shooter\'s s_shooter_lane) is NOT excluded -- it is ordinary zone-owned geometry', () => {
		const entry = TABLE.ballDevices.bd_shooter.entry;
		const zones = [zone('sw_shooter_lane', entry, { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);
		const events = tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]);
		expect(events).toEqual([{ type: 'switch', switch: entry, closed: true, tick: 1 }]);
	});
});

// Every switch class Epic 1's own eleven TABLE.switches actually use --
// button, rollover, tilt_bob, slam -- resolves to 0 ms in TUNING.
// switchSettleMsByClass (see tuning.ts's own comment: "both authored at 0 ms
// because neither passes through physics's hysteresis/debounce pipeline at
// all"). AD-2's other three classes (standup 8 ms, drop_target 20 ms,
// bumper_skirt 2 ms) have real non-zero defaults, transcribed verbatim from
// the architecture spine, but NO switch in Epic 1's TABLE carries any of
// them -- they exist only for Epic 2's standup targets, drop targets and
// bumpers. The consequence: createSwitchTracker()'s own settleTicks > 0
// branch (the multi-tick hysteresis window this story's own task 14 built --
// "maintain per-switch inside/outside state with the settleTicks for that
// switch's settleClass") has NEVER been exercised by any test in this
// project, real or synthetic, since every switch anyone has ever driven
// through this tracker settles in 0 ticks. This describe block drives the
// SAME generic tracker with an OVERRIDDEN settleTicks value for a real
// switch name ('s_start', whose actual settleClass stays 'button' in the
// real TABLE -- only the TUNING VALUE passed in is synthetic, not the table
// lookup), closing that gap without touching src/** or needing a future
// Epic 2 switch to exist yet.
describe('createSwitchTracker() -- non-zero settleTicks classes (debounce/hysteresis, AD-2, task 14)', () => {
	function tuningWithButtonSettleTicks(settleTicks: number) {
		return {
			...TUNING,
			switchSettleTicksByClass: {
				...TUNING.switchSettleTicksByClass,
				button: { ...TUNING.switchSettleTicksByClass.button, value: settleTicks },
			},
		};
	}

	it('a raw transition that reverts to the reported value BEFORE the settle window elapses never emits an edge -- a filtered bounce, not a delayed one', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, tuningWithButtonSettleTicks(3));

		const events: unknown[] = [];
		// Tick 1: enters the zone (raw becomes true, reported is still false --
		// pending, not yet settled at 3 ticks).
		events.push(...tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Tick 2: still inside (pending continues, elapsed = 1 < 3).
		events.push(...tracker.step(2, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Tick 3: a GENUINE full exit -- both endpoints outside the zone (not
		// merely starting inside, which the swept-segment test would still
		// read as "closed", per the 0 ms settle-class test above) -- so raw
		// returns to false, which equals reported: the pending transition is
		// cancelled outright, not merely paused. Well BEFORE the window would
		// have elapsed (2 < 3) anyway.
		events.push(...tracker.step(3, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }]));
		// Ticks 4-6: stays outside. If the bounce had left any residual pending
		// state, it could still (wrongly) fire here.
		for (let tick = 4; tick <= 6; tick++) {
			events.push(...tracker.step(tick, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }]));
		}

		expect(events, 'a sub-window bounce must never reach reported').toEqual([]);
		expect(tracker.currentState('s_start')).toBe(false);
	});

	it('a raw transition that persists for exactly settleTicks ticks emits exactly one edge, on the tick the window completes -- never one tick early, never one tick late', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, tuningWithButtonSettleTicks(3));

		// Tick 1: raw becomes true (pendingSince = 1).
		expect(tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([]);
		// Tick 2: elapsed = 1 -- still short of 3.
		expect(tracker.step(2, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([]);
		// Tick 3: elapsed = 2 -- still one short. This is the off-by-one guard:
		// a `>` instead of `>=` bug would still pass at tick 4, but a settle
		// window that fired ONE TICK EARLY would already have fired here.
		expect(tracker.step(3, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([]);
		expect(tracker.currentState('s_start'), 'must not report closed before the window completes').toBe(false);
		// Tick 4: elapsed = 3 -- the window completes exactly here.
		expect(tracker.step(4, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([
			{ type: 'switch', switch: 's_start', closed: true, tick: 4 },
		]);
		expect(tracker.currentState('s_start')).toBe(true);
		// Tick 5: already reported -- staying inside produces no further edges.
		expect(tracker.step(5, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([]);
	});

	it('a bounce mid-window restarts the settle timer from the LATEST raw change, not the original one -- "cancelled, not merely paused"', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, tuningWithButtonSettleTicks(3));

		const events: unknown[] = [];
		// Tick 1: raw true (pendingSince = 1).
		events.push(...tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Tick 2: still true (elapsed = 1).
		events.push(...tracker.step(2, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Tick 3: a GENUINE full exit -- both endpoints outside the zone --
		// bounces back to false (= reported), cancelling the window entirely.
		// If elapsed were merely PAUSED rather than cancelled, a buggy
		// implementation might resume counting from 2 once raw goes true
		// again below, reaching the 3-tick threshold by tick 5 instead of the
		// correct tick 7.
		events.push(...tracker.step(3, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }]));
		// Tick 4: raw true again (the segment re-crosses into the zone,
		// ending inside) -- this is a NEW pending window (pendingSince = 4).
		events.push(...tracker.step(4, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Ticks 5, 6: elapsed 1, 2 -- still short of the NEW window's 3 ticks.
		events.push(...tracker.step(5, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		events.push(...tracker.step(6, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		expect(events, 'must not have settled yet by tick 6 (a "resumed counting" bug would fire by tick 5)').toEqual([]);
		// Tick 7: elapsed = 3 since the SECOND transition (tick 4) -- settles here.
		events.push(...tracker.step(7, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));

		expect(events).toEqual([{ type: 'switch', switch: 's_start', closed: true, tick: 7 }]);
	});
});
