// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.1b, rework iteration 3 (DW-121, author's answer B): "a ball
// descending the right outlane bypasses `s_drain` entirely" -- measured
// evidence, this story's own rework pass: the right outlane's ball crosses
// `y = 0` at `x ~ 445-448` (inside `col_wall_bottom_r`'s own gap, far
// outside the OLD `sw_drain` zone's x band, `DRAIN_X0_MM..DRAIN_X1_MM` =
// `200..314.4`), then `add_outlane_return_channel()`'s own diagonal rail
// carries it back into that x band only once its y has already fallen to
// roughly -67 to -75, well under the OLD zone's `y = -5` floor -- so it
// reached `bd_trough` with NO `s_drain` edge ever emitted, an FR-11-class
// miss (a drain the drain switch never saw). The fix (`tools/
// make-placeholder-blend.py`, beside `DRAIN_X0_MM`/`DRAIN_X1_MM`) widens
// `sw_drain` to span the WHOLE below-deck corridor -- `x` in
// `[0, PLAYFIELD_W_MM]`, `y` in `[-80, 15]` -- architecturally exact, not
// merely generous: `y < 0` is reachable ONLY by falling through one of this
// file's own three deck gaps (the centre aperture and the two outlane
// gaps), since the playfield's own `y` range is `[0, PLAYFIELD_H_MM]`
// (AD-10) and no on-deck path ever puts a ball at `y < 0` during ordinary
// play.
//
// This file pins the BEHAVIOUR directly (Rule 19: an unfalsified fix is not
// a fix) -- a ball released in each outlane must surface a `closed: true`
// `s_drain` edge through the real `createMachine().step()` pipeline before
// it comes to rest in `bd_trough`. Verified red against the OLD (narrow)
// zone bounds by hand-testing a synthetic `LoadedSwitchZone` with the same
// shape `segmentIntersectsBox` already exercises elsewhere in this suite
// (`test/switch-zones.test.ts`'s own synthetic-zone convention) -- see the
// second describe block below, which asserts the OLD bounds miss the SAME
// swept segment the real, widened zone catches.
//
// QA pass (2026-09-02): the widened `sw_drain` fully CONTAINS all four
// `sw_trough_1..4` zones (`x 200-314.4, y -80..0`), and `s_drain` is
// `settleClass: 'rollover'` (zero settle both ways, AD-2 AMENDED: "settleTicks
// gates the break, never the make"). A ball resting in the trough forever
// would therefore be the mirror of DW-121's own defect -- a rollover that
// never opens. Settled EMPIRICALLY, not assumed: `devices.ts:325`'s
// `detectEntries()` calls `physics.removeBall(movement.ball)` the tick a ball
// is parked into a slot, which deletes it from `physics.balls` entirely --
// not merely moves it. `switches.ts:108`'s `raw` test is
// `movements.some(...)`, built fresh each tick from `physics.balls`
// (`machine.ts:237-241`), so a parked ball contributes NOTHING to the next
// tick's `movements` array at all, `raw` is `false`, and because `rollover`'s
// `settleTicks` is `0` (`tuning.ts:179`), the break fires on that very next
// tick -- confirmed by hand-running each case below and observing genuine
// make/break pairs (e.g. the right-outlane case: make at tick 1179, break at
// tick 1628, the ~450-tick gap being the ball's own dwell time travelling
// through the below-deck corridor before it reaches `bd_trough`'s entry
// zone). The three `it`s below now assert the break explicitly, not just the
// make -- a switch that latched closed forever would pass the OLD assertions
// unnoticed.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMachine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import { readCollisionDoc, nodeBboxMm } from './util/collision-doc';
import { segmentIntersectsBox } from '../src/sim/physics/geometry';
import { toPhysics } from '../src/sim/table/frames';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/**
 * Serves a ball via `c_trough_eject`, then teleports it to `(xMm, yMm)`
 * with zero velocity (the same "reposition a served ball" recipe
 * `test/switch-max-speed.test.ts`'s own Integration case and
 * `test/machine-serve-drain.test.ts:442-535` use -- vel, angularVelocity
 * AND angularMomentum all reset, or residual spin walks the ball sideways
 * under friction), then steps forward `maxTicks` watching every
 * `machine.step().switchEvents` for `s_drain`, returning every make/break
 * pair observed and whether the ball settled into `bd_trough`.
 */
function releaseAndWatchDrain(xMm: number, yMm: number, maxTicks: number) {
	const tuning = resolveTuning();
	const machine = createMachine(loadDoc(), tuning);

	let tick = 0;
	for (let i = 0; i < 320; i++) {
		tick += 1;
		machine.step(tick, NO_FRAME, i === 0 ? [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }] : []);
	}
	const ball = machine.balls[0];
	expect(ball, 'a served ball must exist to reposition').toBeDefined();

	const startPhysics = toPhysics({ x: xMm, y: yMm, z: 13.495 });
	ball!.state.pos.set(startPhysics.x, startPhysics.y, startPhysics.z);
	ball!.hit.vel.set(0, 0, 0);
	ball!.hit.angularVelocity.set(0, 0, 0);
	ball!.hit.angularMomentum.set(0, 0, 0);

	const drainEvents: Array<{ closed: boolean; tick: number }> = [];
	let parkedInTrough = false;
	for (let i = 0; i < maxTicks; i++) {
		tick += 1;
		const result = machine.step(tick, NO_FRAME, []);
		for (const event of result.switchEvents) {
			if (event.switch === 's_drain') {
				drainEvents.push({ closed: event.closed, tick: event.tick });
			}
		}
		if (machine.deviceSlots.bd_trough?.some(Boolean)) {
			parkedInTrough = true;
		}
	}
	return { drainEvents, parkedInTrough };
}

describe('sw_drain (DW-121): every drain path -- centre aperture and both outlane return channels -- surfaces an s_drain edge', () => {
	it('a ball released in the LEFT outlane surfaces s_drain closed:true then closed:false, and does not stay latched closed once parked (DW-121 break-edge gap)', () => {
		const wallBbox = nodeBboxMm('col_wall_left');
		const dividerBbox = nodeBboxMm('col_guide_divider_l');
		const midXMm = (wallBbox.max.x + dividerBbox.min.x) / 2;
		const { drainEvents, parkedInTrough } = releaseAndWatchDrain(midXMm, 300, 4000);
		const makes = drainEvents.filter((e) => e.closed);
		const breaks = drainEvents.filter((e) => !e.closed);
		expect(makes.length, `s_drain must make at least once for a left-outlane drain -- observed: ${JSON.stringify(drainEvents)}`).toBeGreaterThanOrEqual(1);
		expect(parkedInTrough, 'the ball must actually have reached bd_trough for this to be a meaningful drain').toBe(true);
		expect(breaks.length, `s_drain must ALSO break once the ball leaves the corridor and parks -- a rollover that never opens is DW-121's own defect mirrored (sw_drain now fully contains every sw_trough_* zone) -- observed: ${JSON.stringify(drainEvents)}`).toBeGreaterThanOrEqual(1);
		expect(drainEvents[drainEvents.length - 1]?.closed, `the LAST s_drain edge observed must be a break (closed:false), not a latched make -- observed: ${JSON.stringify(drainEvents)}`).toBe(false);
	});

	it('a ball released in the RIGHT outlane surfaces s_drain closed:true then closed:false, and does not stay latched closed once parked (DW-121\'s own measured case, plus its break-edge gap)', () => {
		const wallBbox = nodeBboxMm('col_wall_lane');
		const dividerBbox = nodeBboxMm('col_guide_divider_r');
		const midXMm = (dividerBbox.max.x + wallBbox.min.x) / 2;
		const { drainEvents, parkedInTrough } = releaseAndWatchDrain(midXMm, 300, 4000);
		const makes = drainEvents.filter((e) => e.closed);
		const breaks = drainEvents.filter((e) => !e.closed);
		expect(makes.length, `s_drain must make at least once for a right-outlane drain -- observed: ${JSON.stringify(drainEvents)}`).toBeGreaterThanOrEqual(1);
		expect(parkedInTrough, 'the ball must actually have reached bd_trough for this to be a meaningful drain').toBe(true);
		expect(breaks.length, `s_drain must ALSO break once the ball leaves the corridor and parks -- a rollover that never opens is DW-121's own defect mirrored (sw_drain now fully contains every sw_trough_* zone) -- observed: ${JSON.stringify(drainEvents)}`).toBeGreaterThanOrEqual(1);
		expect(drainEvents[drainEvents.length - 1]?.closed, `the LAST s_drain edge observed must be a break (closed:false), not a latched make -- observed: ${JSON.stringify(drainEvents)}`).toBe(false);
	});

	it('the centre drain still surfaces s_drain closed:true then closed:false, unaffected by the widened zone (regression guard, plus its break-edge gap)', () => {
		const { drainEvents, parkedInTrough } = releaseAndWatchDrain(257.2, 60, 2000);
		const makes = drainEvents.filter((e) => e.closed);
		const breaks = drainEvents.filter((e) => !e.closed);
		expect(makes.length, `s_drain must still make for a centre drain -- observed: ${JSON.stringify(drainEvents)}`).toBeGreaterThanOrEqual(1);
		expect(parkedInTrough).toBe(true);
		expect(breaks.length, `s_drain must ALSO break once the ball leaves the corridor and parks -- observed: ${JSON.stringify(drainEvents)}`).toBeGreaterThanOrEqual(1);
		expect(drainEvents[drainEvents.length - 1]?.closed, `the LAST s_drain edge observed must be a break (closed:false), not a latched make -- observed: ${JSON.stringify(drainEvents)}`).toBe(false);
	});
});

describe('sw_drain (DW-121): the OLD (narrow) zone bounds would have missed the right-outlane path -- Rule 19, the fix is falsified', () => {
	it('the exact swept segment DW-121 measured (crossing y=0 at x~446, reaching y~-70) intersects the WIDENED zone but not the OLD one', () => {
		const doc = readCollisionDoc();
		const liveZone = doc.switchZones.find((z) => z.name === 'sw_drain');
		expect(liveZone, 'sw_drain must exist in the committed collision document').toBeDefined();

		// DW-121's own measured swept segment (this story's rework report): a
		// ball crossing the right outlane's own gap, from just above the
		// aperture down into the below-deck return channel.
		const before = { x: 446, y: 5, z: 13.5 };
		const after = { x: 446, y: -70, z: 13.5 };

		expect(
			segmentIntersectsBox(before, after, liveZone!.minMm, liveZone!.maxMm),
			'the WIDENED (live, committed) sw_drain zone must catch this segment',
		).toBe(true);

		// The OLD zone, before this rework's fix: (DRAIN_X0_MM, -5, 0) ..
		// (DRAIN_X1_MM, 15, 30) -- reproduced here as a literal, not read from
		// the document (the document no longer carries it), specifically to
		// demonstrate the RED this fix closes (Rule 19).
		const oldZoneMin = { x: 200, y: -5, z: 0 };
		const oldZoneMax = { x: 314.4, y: 15, z: 30 };
		expect(
			segmentIntersectsBox(before, after, oldZoneMin, oldZoneMax),
			'the OLD (pre-fix) sw_drain zone must MISS this exact segment -- this is DW-121\'s own defect, reproduced',
		).toBe(false);
	});
});
