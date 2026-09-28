// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.5 QA (DW-178): slot occupancy is now tracked in TWO independent
// rules-side places, both fed from the identical `device_ball_entered`/
// `_left` stream a single `devicesLayer.step()` call produces each tick, with
// nothing asserting they agree:
//
//   (1) the devices layer's OWN `occupancy` record (`src/sim/rules/devices/
//       index.ts`) -- private, mutated in place, never exposed on
//       `GameState`; its only observable consequence is DW-166's
//       `isDeviceFull()` check, which decides whether a Lock-lane closure
//       resolves IMMEDIATELY (`lock_lane_entered` the same tick) or opens a
//       capture window instead.
//   (2) `machine.deviceSlots`, derived PURELY from that same event stream by
//       `deriveDeviceSlots()` (`src/sim/rules/ball-controller.ts`, DW-70) and
//       exposed on `GameState`.
//
// DW-70 existed precisely because two places disagreed about `deviceSlots`
// (sim/loop's own copy of the physics view vs. the rules-derived value); this
// story's DW-70 fix removed the OLD disagreement but introduced a NEW pair of
// independently-updated trackers with no test cross-checking them. Both
// trackers are driven here by the IDENTICAL switch script -- one instance via
// `runRulesScript()` (observes `machine.deviceSlots`), a separate instance via
// `runSwitchScript()` (observes the devices layer's occupancy through its one
// behavioural signature, DW-166's immediate-vs-windowed branch) -- and their
// conclusions about whether `bd_lock` is full are asserted to agree, in BOTH
// directions (full and not-full), so a defect that makes only one tracker
// right cannot pass silently.
//
// Mutation (Rule 19): in `src/sim/rules/devices/index.ts`'s Stage 1 parking
// branch, change the closed-edge push
// `events.push({ type: 'device_ball_entered', device: slot.device, slot:
// slot.slot, tick: event.tick });` to hardcode `slot: 0` (leaving the very
// next line, `occupancy[slot.device][slot.slot] = true`, and the
// `device_ball_left` push untouched) -- a realistic regression class where
// the devices layer's OWN internal bookkeeping (`occupancy`) stays correct
// but the EVENT it emits (which is all `deriveDeviceSlots()` ever sees) does
// not. QA-observed 2026-09-06: reddened the "bd_lock FULL" test's
// rules-derived-view assertion (`expected [ true, false, false ] to deeply
// equal [ true, true, true ]` -- slots 2 landed on index 0 in `deviceSlots`
// instead, since every entry after the first is skipped as "no change" once
// index 0 reads true) while the SAME test's devices-layer-occupancy
// assertion (the immediate `lock_lane_entered`) stayed green, because
// `occupancy` is written from `slot.slot`, not from the mutated event --
// exactly the silent divergence DW-178 warns about, caught here only because
// both views are asserted in the same test. Confirmed NOT independently
// caught by any pre-existing test (both of `test/rules-devices.test.ts`'s own
// per-slot pins exercise slot 0 or a `device_ball_left` edge, neither of
// which this mutation touches). Reverted; `git status --short` / `git diff
// --stat` unchanged.

import { describe, expect, it } from 'vitest';
import { close, runRulesScript, runSwitchScript } from './util/switch-script';

describe('sim/rules/ -- DW-178: the devices layer\'s own occupancy (DW-166\'s isDeviceFull) and the ball controller\'s deriveDeviceSlots() (machine.deviceSlots, DW-70) are two INDEPENDENT trackers fed the same device_ball_entered/_left stream -- assert they actually agree', () => {
	it('bd_lock FULL: three real slot closures -- the rules-derived view reports every bd_lock slot occupied, AND the devices layer\'s own occupancy (observed via DW-166\'s "device already full" branch) resolves a Lock-lane closure IMMEDIATELY, with no capture window', () => {
		const fillScript = close('s_lock_1').at(1).close('s_lock_2').at(2).close('s_lock_3').at(3).build();
		const withLaneClosure = [...fillScript, ...close('s_lock_lane').at(10).build()];

		// View 1: machine.deviceSlots, derived inside rules.step() (DW-70).
		const rulesRun = runRulesScript(withLaneClosure, { durationTicks: 10 });
		expect(
			rulesRun.statesByTick.get(3)!.machine.deviceSlots.bd_lock,
			'rules-derived view: all three bd_lock slots occupied after the three real closures',
		).toEqual([true, true, true]);

		// View 2: the devices layer's own `occupancy`, driven by the IDENTICAL
		// script through a separate instance -- its private state is never
		// exposed, so "full" is observed through the one behaviour DW-166
		// makes it drive: an immediate lock_lane_entered, no window.
		const layerRun = runSwitchScript(withLaneClosure, { durationTicks: 10 });
		const captures = layerRun.events.filter((e) => e.type === 'lock_lane_entered');
		expect(
			captures,
			'the devices layer\'s own occupancy must ALSO consider bd_lock full: one lock_lane_entered at the same tick s_lock_lane closed, no window',
		).toEqual([{ type: 'lock_lane_entered', tick: 10 }]);
	});

	it('bd_lock NOT full (two of three slots): both trackers agree it is not full -- the rules-derived view still shows the third slot empty, AND the devices layer opens a capture WINDOW instead of resolving immediately', () => {
		const partialScript = close('s_lock_1').at(1).close('s_lock_2').at(2).build();

		const rulesRun = runRulesScript(partialScript, { durationTicks: 2 });
		expect(
			rulesRun.statesByTick.get(2)!.machine.deviceSlots.bd_lock,
			'rules-derived view: only two of three bd_lock slots occupied',
		).toEqual([true, true, false]);

		const layerRun = runSwitchScript(
			[...partialScript, ...close('s_lock_lane').at(3).build()],
			{ durationTicks: 3 },
		);
		const captures = layerRun.events.filter((e) => e.type === 'lock_lane_entered');
		expect(
			captures,
			'the devices layer\'s own occupancy must ALSO consider bd_lock NOT full: no immediate lock_lane_entered -- it opens a capture window instead (proven elsewhere, test/rules-devices.test.ts, to eventually resolve on the third slot closing)',
		).toEqual([]);
	});
});
