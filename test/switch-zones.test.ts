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
