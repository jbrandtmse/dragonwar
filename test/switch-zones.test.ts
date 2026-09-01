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
// the architecture spine; Story 2.1b is the first to give a REAL switch one
// of them (six DRAGON-bank targets carry 'drop_target', two slingshots and
// the Dragon body carry 'standup', three pops carry 'bumper_skirt'). This
// describe block drives the SAME generic tracker with an OVERRIDDEN
// settleTicks value for a real switch name ('s_start', whose actual
// settleClass stays 'button' in the real TABLE -- only the TUNING VALUE
// passed in is synthetic, not the table lookup) to pin the exact tick
// arithmetic deterministically, and closes with one case driven against a
// REAL 'drop_target' switch and its REAL resolved TUNING value, the case
// that was genuinely impossible before this story: no switch anywhere in
// the project carried a non-zero settleClass, so the make-debounce defect
// (DW-67) had no switch through which a fast crossing could ever vanish
// entirely.
//
// DW-67 (AD-2, AMENDED 2026-09-01): "settleTicks gates the BREAK, never the
// MAKE." Every case below pins that directly: a raw closure LATCHES on the
// very tick it first appears (immediate make, no debounce at all), and only
// the OPENING (the raw test reading outside for settleTicks CONSECUTIVE
// ticks) is debounced. A bounce inside the BREAK window (raw flips back to
// true before the window completes) cancels it outright -- AD-2's hysteresis
// confirms a NEW state, it does not remember how close a bounce came.
describe('createSwitchTracker() -- non-zero settleTicks classes (DW-67: settleTicks gates the BREAK, never the MAKE)', () => {
	function tuningWithButtonSettleTicks(settleTicks: number) {
		return {
			...TUNING,
			switchSettleTicksByClass: {
				...TUNING.switchSettleTicksByClass,
				button: { ...TUNING.switchSettleTicksByClass.button, value: settleTicks },
			},
		};
	}

	it('a raw closure LATCHES immediately, on the very tick it is first observed -- no debounce on the make at all', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, tuningWithButtonSettleTicks(3));

		// Tick 1: raw becomes true. Under the OLD (make-debounced) semantics
		// this would still be pending, three ticks short of settling. Under
		// the current (AMENDED) semantics it emits immediately.
		const events = tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]);
		expect(events).toEqual([{ type: 'switch', switch: 's_start', closed: true, tick: 1 }]);
		expect(tracker.currentState('s_start')).toBe(true);
	});

	it('the BREAK (raw opening) is what settleTicks gates: held for exactly settleTicks ticks before closed:false emits, never one tick early, never one tick late', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, tuningWithButtonSettleTicks(3));

		// Tick 1: the make -- immediate.
		expect(tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([
			{ type: 'switch', switch: 's_start', closed: true, tick: 1 },
		]);
		// Tick 2: a GENUINE full exit (both endpoints outside) -- raw becomes
		// false, differing from reported (true): the break countdown begins
		// (pendingSince = 2).
		expect(tracker.step(2, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		// Tick 3: elapsed = 1 -- still short of 3.
		expect(tracker.step(3, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		// Tick 4: elapsed = 2 -- still one short. The off-by-one guard: a `>`
		// instead of `>=` bug would still pass at tick 5, but a window that
		// fired ONE TICK EARLY would already have fired here.
		expect(tracker.step(4, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		expect(tracker.currentState('s_start'), 'must still report closed until the break window completes').toBe(true);
		// Tick 5: elapsed = 3 -- the window completes exactly here.
		expect(tracker.step(5, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([
			{ type: 'switch', switch: 's_start', closed: false, tick: 5 },
		]);
		expect(tracker.currentState('s_start')).toBe(false);
		// Tick 6: already reported open -- staying outside produces no further edges.
		expect(tracker.step(6, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
	});

	it('a contact bounce on the break (raw flickers false-then-true inside the break window) cancels it outright: no edge pair, the switch stays reported closed', () => {
		const zones = [zone('sw_test', 's_start', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, tuningWithButtonSettleTicks(3));

		// Tick 1: the make -- immediate.
		expect(tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }])).toEqual([
			{ type: 'switch', switch: 's_start', closed: true, tick: 1 },
		]);
		// Tick 2: a genuine exit begins the break countdown (pendingSince = 2).
		expect(tracker.step(2, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		// Tick 3: elapsed = 1 -- still short of 3.
		expect(tracker.step(3, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		// Tick 4: raw bounces back to true (a contact bounce, the segment
		// re-crosses back into the zone) -- raw === reported (still true, it
		// never actually settled to false), so the pending break is CANCELLED
		// outright, not merely paused. If it were only paused, a buggy
		// implementation might resume counting from 1 once raw goes false
		// again below, settling by tick 8 instead of the correct tick 9.
		expect(
			tracker.step(4, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]),
			'the bounce itself must emit no edge at all -- the switch was never reported open',
		).toEqual([]);
		expect(tracker.currentState('s_start'), 'the switch stays reported closed through the whole bounce').toBe(true);

		// Tick 5: a genuine exit again -- this is a NEW break window (pendingSince = 5).
		expect(tracker.step(5, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		// Ticks 6, 7: elapsed 1, 2 -- still short of the NEW window's 3 ticks.
		// A "resumed counting" bug (resuming from the FIRST exit's elapsed = 1
		// at tick 3, instead of starting a fresh window at tick 5) would fire
		// by tick 6 instead of tick 8.
		expect(tracker.step(6, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		expect(tracker.step(7, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([]);
		// Tick 8: elapsed = 3 since the SECOND exit (tick 5) -- settles here.
		expect(tracker.step(8, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }])).toEqual([
			{ type: 'switch', switch: 's_start', closed: false, tick: 8 },
		]);
	});

	// The case that was previously impossible (DW-67's own signature defect):
	// no switch anywhere in the project carried a non-zero settleClass before
	// this story, so a crossing shorter than settleTicks + 1 ticks against a
	// real settling switch could never even be exercised. `s_dragon_d` is a
	// REAL TABLE.switches entry (settleClass 'drop_target', 20 ms default =
	// 20 ticks at TICK_HZ = 1000) and this drives the REAL resolved TUNING
	// value -- no synthetic override.
	it('a crossing shorter than settleTicks + 1 ticks against a REAL drop_target (20 ms) switch emits exactly one make -- the defect this story closes', () => {
		expect(TABLE.switches.s_dragon_d.settleClass).toBe('drop_target');
		const settleTicks = TUNING.switchSettleTicksByClass.drop_target.value;
		expect(settleTicks).toBe(20);

		const zones = [zone('sw_dragon_d', 's_dragon_d', { x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 30 })];
		const tracker = createSwitchTracker(zones, TUNING);

		const events: unknown[] = [];
		// A crossing lasting only 2 ticks -- far shorter than settleTicks + 1
		// (21). Tick 1: enters (raw true, differs from reported false) ->
		// under the OLD make-debounced semantics this would still be pending
		// at tick 1 and NEVER settle before the ball has already left, so
		// NOTHING would ever be emitted. Under the current semantics it
		// latches immediately.
		events.push(...tracker.step(1, [{ before: { x: -100, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Tick 2: still inside (segment starts inside, still reads closed --
		// no new edge, already reported true).
		events.push(...tracker.step(2, [{ before: { x: 0, y: 0, z: 15 }, after: { x: 0, y: 0, z: 15 } }]));
		// Tick 3: a genuine exit -- the ball has left the zone entirely. The
		// break countdown begins; it will not complete for 20 more ticks.
		events.push(...tracker.step(3, [{ before: { x: 100, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }]));
		for (let tick = 4; tick <= 23; tick++) {
			events.push(...tracker.step(tick, [{ before: { x: 200, y: 0, z: 15 }, after: { x: 200, y: 0, z: 15 } }]));
		}

		expect(events).toEqual([
			{ type: 'switch', switch: 's_dragon_d', closed: true, tick: 1 },
			{ type: 'switch', switch: 's_dragon_d', closed: false, tick: 23 },
		]);
	});
});
