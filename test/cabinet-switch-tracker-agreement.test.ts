// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b task 14 (DW-67): src/sim/physics/cabinet/index.ts's own
// `stepLevel()` -- the AC-3 edge-collapsing shape over a plain boolean LEVEL
// (the tilt bob, the slam detector) -- must apply the IDENTICAL
// settleTicks-gates-the-BREAK-never-the-MAKE semantics as
// src/sim/physics/switches.ts's `createSwitchTracker()` does over a swept-
// segment ZONE test. The two are deliberately separate implementations (the
// bob and the slam counter have neither ball nor zone, so the zone machinery
// does not apply -- cabinet/index.ts's own header), so nothing at the type
// system enforces they stay in step; this test drives BOTH with an
// IDENTICAL raw true/false sequence and asserts they emit the identical
// edges, on the identical ticks, for several settleTicks values including 0.

import { describe, expect, it } from 'vitest';
import { stepLevel, type LevelTracker } from '../src/sim/physics/cabinet';
import { createSwitchTracker } from '../src/sim/physics/switches';
import { resolveTuning } from '../src/sim/table/tuning';
import type { LoadedSwitchZone } from '../src/sim/physics/loader';

const TUNING = resolveTuning();

/** Drives switches.ts's tracker with a raw true/false sequence by placing the ball INSIDE or OUTSIDE a fixed zone each tick -- the same technique test/switch-zones.test.ts uses, generalised to an arbitrary sequence. */
function edgesFromSwitchTracker(rawSequence: readonly boolean[], settleTicks: number): Array<{ tick: number; closed: boolean }> {
	const zone: LoadedSwitchZone = { name: 'sw_test', switch: 's_start', minMm: { x: -10, y: -10, z: 0 }, maxMm: { x: 10, y: 10, z: 30 } };
	const tuningWithSettle = {
		...TUNING,
		switchSettleTicksByClass: { ...TUNING.switchSettleTicksByClass, button: { ...TUNING.switchSettleTicksByClass.button, value: settleTicks } },
	};
	const tracker = createSwitchTracker([zone], tuningWithSettle);
	const edges: Array<{ tick: number; closed: boolean }> = [];
	for (let i = 0; i < rawSequence.length; i++) {
		const tick = i + 1;
		const pos = rawSequence[i] ? { x: 0, y: 0, z: 15 } : { x: 200, y: 0, z: 15 };
		const events = tracker.step(tick, [{ before: pos, after: pos }]);
		for (const event of events) {
			edges.push({ tick: event.tick, closed: event.closed });
		}
	}
	return edges;
}

function edgesFromStepLevel(rawSequence: readonly boolean[], settleTicks: number): Array<{ tick: number; closed: boolean }> {
	const tracked: LevelTracker = { reported: false, pendingSince: null, pendingValue: null, settleTicks };
	const edges: Array<{ tick: number; closed: boolean }> = [];
	for (let i = 0; i < rawSequence.length; i++) {
		const tick = i + 1;
		const result = stepLevel(tracked, tick, rawSequence[i]!);
		if (result !== null) {
			edges.push({ tick, closed: result });
		}
	}
	return edges;
}

describe('cabinet/index.ts stepLevel() agrees with switches.ts createSwitchTracker() for an identical raw sequence (DW-67, task 14)', () => {
	it.each([0, 3, 8, 20])('settleTicks = %i: an immediate make, a debounced break, and a bounce inside the break window', (settleTicks) => {
		// true from tick 1 (immediate make), false from tick 5 (break countdown
		// begins), a one-tick bounce back to true at tick 7 (cancels the
		// countdown), false again from tick 8, held long enough to settle at
		// every settleTicks value under test (up to 20).
		const rawSequence: boolean[] = [];
		for (let tick = 1; tick <= 40; tick++) {
			if (tick < 5) {
				rawSequence.push(true);
			} else if (tick === 7) {
				rawSequence.push(true);
			} else {
				rawSequence.push(false);
			}
		}

		const fromSwitchTracker = edgesFromSwitchTracker(rawSequence, settleTicks);
		const fromStepLevel = edgesFromStepLevel(rawSequence, settleTicks);
		expect(fromStepLevel, `stepLevel() and createSwitchTracker() must agree for settleTicks=${settleTicks}`).toEqual(fromSwitchTracker);
	});

	it('agrees on a rapid flicker sequence (multiple makes and breaks)', () => {
		const rawSequence = [true, true, false, false, true, false, true, true, true, false, false, false, false, true];
		for (const settleTicks of [0, 2, 5]) {
			const fromSwitchTracker = edgesFromSwitchTracker(rawSequence, settleTicks);
			const fromStepLevel = edgesFromStepLevel(rawSequence, settleTicks);
			expect(fromStepLevel, `disagreement at settleTicks=${settleTicks}`).toEqual(fromSwitchTracker);
		}
	});
});
