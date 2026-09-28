// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5 QA (DW-176): `deriveDeviceSlots()`'s incremental fold is the
// exact code path DW-70's fix generalises -- `machine.deviceSlots` is now
// derived PURELY from one tick's `device_ball_entered`/`_left` events
// (`src/sim/rules/ball-controller.ts:82-101`), folding each event onto an
// accumulator (`next ?? current`) rather than always re-reading the
// tick-start `current`. Every scripted test in `test/rules-lifecycle.test.ts`
// and `test/rules-devices.test.ts` drives at most ONE occupancy-changing
// device event per tick (a single switch closing/opening), so the fold's
// multi-event accumulation path -- the part of the function that only matters
// once a SECOND event arrives in the same `events` array -- had never been
// exercised. This file calls `deriveDeviceSlots()` directly, bypassing the
// devices layer entirely (constructing `DeviceEvent[]` by hand), and threads
// TWO occupancy-changing edges through it in a single call, in both shapes
// that could plausibly regress independently:
//
//   (a) two edits to DIFFERENT devices in the same tick -- catches a fold
//       that forgets its own running accumulator and re-derives every
//       `next` from the tick-start `current` (losing the FIRST device's
//       edit the moment a second device is touched).
//   (b) two edits to the SAME device (different slots) in the same tick --
//       catches a narrower variant of the same bug, where only the touched
//       device's OWN slots array is re-read from `current` instead of the
//       accumulator (losing the first slot's edit while still correctly
//       carrying other devices forward).
//
// Mutation (Rule 19): change `const source = next ?? current;`
// (`ball-controller.ts:92`) to `const source = current;`. QA-observed
// 2026-09-06: (a) reddened `expected [ false, true, true, true ] to deeply
// equal [ true, true, true, true ]` (bd_trough's edit from the FIRST event
// silently reverted once the second event, on bd_lock, ran) while (b)'s
// same-device assertion also independently reddened (`expected [ false,
// false, true ] to deeply equal [ true, false, true ]`, since (b)'s two
// events target the SAME device and the mutated `source` starts fresh from
// `current.bd_lock` on every event regardless of device); reverted,
// `git status --short` / `git diff --stat` unchanged.

import { describe, expect, it } from 'vitest';
import { deriveDeviceSlots } from '../src/sim/rules/ball-controller';
import type { DeviceEvent } from '../src/sim/rules/devices';
import type { BallDeviceName } from '../src/sim/table/names';

/** Mirrors `test/util/switch-script.ts`'s own `DEFAULT_INITIAL_STATE.machine.deviceSlots` -- a fresh boot occupancy (trough full, shooter and lock empty), so a wrongly-derived slot cannot hide behind an already-true value. */
function bootSlots(): Readonly<Record<BallDeviceName, readonly boolean[]>> {
	return { bd_trough: [true, true, true, true], bd_shooter: [false], bd_lock: [false, false, false] };
}

describe('sim/rules/ball-controller.ts -- deriveDeviceSlots() (DW-70/DW-176): the incremental fold with MORE THAN ONE same-tick occupancy edit', () => {
	it('two same-tick edits to DIFFERENT devices both land in the result -- the accumulator, not the tick-start snapshot, is threaded across events', () => {
		const current = bootSlots();
		const events: readonly DeviceEvent[] = [
			{ type: 'device_ball_left', device: 'bd_trough', slot: 0, tick: 9 },
			{ type: 'device_ball_entered', device: 'bd_lock', slot: 0, tick: 9 },
		];

		const next = deriveDeviceSlots(current, events);

		expect(next, 'a new record: something changed').not.toBe(current);
		expect(next.bd_trough, 'the FIRST event\'s edit must survive the second event, which touches a different device').toEqual([false, true, true, true]);
		expect(next.bd_lock).toEqual([true, false, false]);
		expect(next.bd_shooter, 'a device untouched by either event keeps its OWN slots array reference (structural sharing per device, not just at the top level)').toBe(current.bd_shooter);
	});

	it('two same-tick edits to the SAME device (different slots) both land in the result -- the touched device\'s own slots array is re-read from the accumulator, not from the tick-start snapshot', () => {
		const current = bootSlots();
		const events: readonly DeviceEvent[] = [
			{ type: 'device_ball_entered', device: 'bd_lock', slot: 0, tick: 3 },
			{ type: 'device_ball_entered', device: 'bd_lock', slot: 2, tick: 3 },
		];

		const next = deriveDeviceSlots(current, events);

		expect(next, 'a new record: something changed').not.toBe(current);
		expect(
			next.bd_lock,
			'both slots must be true -- a fold that re-derives the device\'s array from `current` on every event would lose slot 0 the moment slot 2 is applied',
		).toEqual([true, false, true]);
		expect(next.bd_trough, 'an untouched device keeps its own reference').toBe(current.bd_trough);
	});

	it('anti-vacuity: an event stream with no occupancy-changing edge at all (only ball_launched, which this function ignores) returns the SAME reference -- proves the two tests above are exercising real mutation, not an always-copy function that would pass by coincidence', () => {
		const current = bootSlots();
		const events: readonly DeviceEvent[] = [{ type: 'ball_launched', tick: 3 }];

		const next = deriveDeviceSlots(current, events);

		expect(next).toBe(current);
	});
});
