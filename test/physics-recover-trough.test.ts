// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 2.13 (DW-257, AD-6 amended, AD-18, AD-9; author decision 2026-09-11,
// spec gate): AC 14, red first. `sim/physics/devices.ts`'s `recover()` must
// RETURN every ball it removes to `bd_trough`'s lowest empty slot rather
// than merely despawning it -- today's code (measured at this tree) drains
// the trough 4 -> 3 -> 2 -> 1 -> 0 over four successive serve-and-lose
// cycles and then fails the fifth serve with `eject_failed`, a real hang
// reachable by ordinary play (a Slam, then Start before the old ball
// drains, four times over).
//
// Falsifiability (Rule 19, this story's own mutation table):
// - revert `recover()` to `physics.removeBall(ball)` only (today's code) --
//   the negative (the four-ball total falling to 3 on the first recovery,
//   and the fifth serve answering `eject_failed`) goes red;
// - close the trough slot switch WITHOUT parking a ball into it -- the
//   positive (`pulse c_trough_eject` spawns nothing, and the four-ball
//   count identity breaks, a phantom slot) goes red.
//
// Story 2.13 rework iteration 1 (CR-1, code review 2026-09-12): every
// assertion below reads `machine.deviceSlots`, the PHYSICS getter over the
// very `parkingSlots` array `recover()` itself writes -- CR-1's own
// diagnosis of why this file shipped green over a missing-switch-edge
// defect that left `GameState.machine.deviceSlots` (the RULES-derived view,
// `sim/rules/ball-controller.ts`'s `deriveDeviceSlots()`) under-reporting
// physics for hundreds of ticks. This file's own scenario is kept as-is (it
// still correctly pins AC 14's physics-level "the trough never empties"
// invariant) but is a POOR fit for the RULES-side pin CR-1 also requires:
// every recovery here shares its tick with a same-tick `c_trough_eject`
// pulse, and on a bottom-filled contiguous trough (AD-6) a paired
// recover+eject on the SAME slot makes `deriveDeviceSlots()`'s own
// same-value identity guard swallow a MISSING recover edge just as
// completely as it correctly nets a present, correctly-ordered one -- the
// two are indistinguishable from the rules-side count alone (see
// `test/stray-clear-integration.test.ts`'s own AC 5 comment for the fully
// worked derivation of that coincidence). The RULES-side presence pin
// therefore lives in `test/ball-search-integration.test.ts`'s own AC 7 case
// instead, at the one point that scenario's own recover (S+2751) shares no
// tick with any eject (the search's own trough serve already happened 500
// ticks earlier, at S+2251) -- a missing edge there is a real, undisguised
// 2-vs-3 divergence. `test/stray-clear-integration.test.ts`'s AC 5 case
// pins the ORDER of the edge instead (the one property that scenario's own
// coincidence cannot mask: a wrongly-ordered edge flips the final count to
// a THIRD, detectably wrong value, 4, that neither "present and correct"
// nor "absent" ever produces).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_FRAME } from '../src/sim/loop';
import { createMachine, type Machine } from '../src/sim/physics/machine';
import { resolveTuning } from '../src/sim/table/tuning';
import { fromPhysics, toPhysics } from '../src/sim/table/frames';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/**
 * The total the four-ball invariant (AD-6) names: closed trough slots plus
 * simulated balls. No other parking device is ever touched by this test
 * (`bd_lock` stays at its own boot occupancy, 0, throughout), so it needs no
 * separate term here -- the anti-vacuity note the spec itself calls out:
 * asserting only "a slot closed" would pass on a machine that had invented a
 * fifth ball, so this always checks the WHOLE count together.
 */
function totalBalls(machine: Machine): number {
	const troughFilled = machine.deviceSlots.bd_trough.filter(Boolean).length;
	return troughFilled + machine.balls.length;
}

describe('sim/physics/devices.ts -- recover() returns a ball to the trough (Story 2.13, DW-257, AC 14)', () => {
	it('four successive serve-and-lose-and-recover cycles never shrink the four-ball total, and a fifth serve still succeeds at the same authored pose -- the negative and the positive, in the same test', () => {
		const machine = createMachine(loadDoc(), resolveTuning());
		expect(machine.deviceSlots.bd_trough, 'sanity: the trough boots full').toEqual([true, true, true, true]);
		expect(totalBalls(machine), 'sanity: the machine boots with 4 balls').toBe(4);

		let tick = 0;
		let firstSpawnPos: { readonly x: number; readonly y: number; readonly z: number } | null = null;
		let firstSpawnVel: { readonly x: number; readonly y: number; readonly z: number } | null = null;

		for (let cycle = 1; cycle <= 4; cycle++) {
			// Serve one ball and let it settle in the shooter lane -- the same
			// technique test/ball-search-physics.test.ts's own AC 8 case uses.
			tick += 1;
			machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }]);
			expect(machine.balls, `cycle ${cycle}: the served ball must be simulated before it can be lost`).toHaveLength(1);
			const ball = machine.balls[0]!;
			if (firstSpawnPos === null) {
				firstSpawnPos = fromPhysics({ x: ball.state.pos.x, y: ball.state.pos.y, z: ball.state.pos.z });
				firstSpawnVel = { x: ball.hit.vel.x, y: ball.hit.vel.y, z: ball.hit.vel.z };
			}
			for (let i = 0; i < 400; i++) {
				tick += 1;
				machine.step(tick, NO_FRAME, []);
			}

			// Teleport it loose -- outside every device's own zone (the SAME
			// open-field position test/ball-search-physics.test.ts's own AC 8
			// case uses).
			const loosePhysics = toPhysics({ x: 130, y: 700, z: 13.5 });
			ball.state.pos.set(loosePhysics.x, loosePhysics.y, loosePhysics.z);
			ball.hit.vel.set(0, 0, 0);

			tick += 1;
			const recoverResult = machine.step(tick, NO_FRAME, [{ type: 'recover', tick }]);
			// The premise, asserted before the outcome it feeds (Rule 19: a
			// check that never ran is not a check): the ball really was
			// outside every device, so exactly one is recovered.
			expect(recoverResult.recovered, `cycle ${cycle}: the ball really was loose`).toBe(1);
			expect(machine.balls, `cycle ${cycle}: the recovered ball must be gone from the simulated set`).toHaveLength(0);

			// The negative (Red today: this falls to 3, 2, 1, 0 over the four
			// cycles) -- the four-ball total never shrinks.
			expect(totalBalls(machine), `cycle ${cycle}: the four-ball total must survive the recovery`).toBe(4);
			// The positive (Red today: there is no slot to eject from) --
			// immediately after the recovery, the trough is back to fully
			// closed: the recovered ball really is there, parked.
			expect(
				machine.deviceSlots.bd_trough,
				`cycle ${cycle}: the trough must be full again, the recovered ball parked in it`,
			).toEqual([true, true, true, true]);
		}

		// The positive's other half: the recovered ball is not just a slot
		// count -- pulsing c_trough_eject after FOUR recoveries still spawns a
		// REAL, USABLE ball, at the SAME authored eject pose and speed the
		// very first serve above used (Red today: the trough emptied after
		// cycle 4, and this fifth serve answers eject_failed instead).
		tick += 1;
		const fifthServe = machine.step(tick, NO_FRAME, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick }]);
		expect(
			fifthServe.semanticEvents.some((event) => event.type === 'eject_failed'),
			'the fifth serve must not fail -- the trough was never allowed to run dry',
		).toBe(false);
		expect(machine.balls, 'the fifth serve must spawn a real, simulated ball').toHaveLength(1);
		const fifthBall = machine.balls[0]!;
		const fifthPos = fromPhysics({ x: fifthBall.state.pos.x, y: fifthBall.state.pos.y, z: fifthBall.state.pos.z });
		expect(fifthPos, 'the fifth serve spawns at the SAME authored eject pose the first serve used').toEqual(firstSpawnPos);
		expect(
			{ x: fifthBall.hit.vel.x, y: fifthBall.hit.vel.y, z: fifthBall.hit.vel.z },
			'the fifth serve spawns at the SAME authored eject speed the first serve used',
		).toEqual(firstSpawnVel);
		// And the slot it came from (the one the fourth recovery just parked
		// into) opens again, through the UNCHANGED eject path -- never a
		// phantom slot with no ball behind it.
		expect(machine.deviceSlots.bd_trough, 'the ejected slot opens; the other three stay closed').toEqual([true, true, true, false]);
		expect(totalBalls(machine), 'the four-ball total survives the fifth serve too').toBe(4);
	});
});
