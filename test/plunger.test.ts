// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.6's I/O matrix, plunger rows: the hold->speed mapping and both
// clamps; the single s_shooter_lane open edge and single ball_launched; the
// eject_failed{device:'bd_shooter'} branch with an empty lane; holdTicks
// counting and reset; the full-strength plunge reaching the main field
// (never re-entering sw_shooter_lane); and manual-vs-autolaunch parity --
// AD-6, "the manual plunge and the autolaunch are one code path."
//
// Driven through the real `createLoop()` over the committed collision
// document, matching `test/machine-serve-drain.test.ts`'s own integration
// style for the serve/launch/main-field sequence this file's scenarios
// build on directly.
//
// Story 5.4 (DW-292): the snapshot's `plunger.posMm` -- the visible rod's
// pull -- is `SHOOTER_ROD_STROKE_MM x t`, `t` being exactly the clamped hold
// fraction `plungerSpeedByHoldMs()` interpolates the launch speed by (with
// its zero-width guard), and 0 once released. Pinned below through the real
// `createLoop()`, plus the helper itself against `plungerSpeedByHoldMs()`.
// mutation: return `posMm: 0` from plunger.ts's state getter -> the
// "held for 250 ticks" case goes red (19.05 expected).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning, plungerSpeedByHoldMs, TUNING } from '../src/sim/table/tuning';
import { SHOOTER_ROD_STROKE_MM, plungerHoldFraction } from '../src/sim/physics/plunger';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Serves a ball into the shooter lane and lets it settle, the same sequence `test/machine-serve-drain.test.ts` trusts. */
function serveAndSettle(loop: ReturnType<typeof createLoop>) {
	loop.pulseCoil('c_trough_eject');
	let out = loop.advance(20, []);
	for (let i = 0; i < 300; i++) {
		out = loop.advance(16.667, []);
	}
	return out;
}

describe('sim/physics/plunger.ts -- the manual-plunger hardware rule (AD-5, AD-6)', () => {
	// Code review 2026-08-29 (iteration 2): the twin of
	// test/flipper-mover.test.ts's task-26 ordering pin, for the OTHER hardware
	// rule AD-5 names. Before this test, moving ONLY
	// `plungerMechanics.applyFrame(...)` in src/sim/physics/machine.ts to after
	// `physics.step()` -- making the manual plunge genuinely one tick late,
	// the exact latency AD-5 forbids -- left the entire suite green (measured:
	// 594 passed), because every other plunger assertion is an event count, a
	// speed band, or a position sampled tens of ticks later. AC 2's mutation
	// clause is satisfied by moving BOTH calls, so this closes the residual
	// half rather than an unmet criterion.
	//
	// The discriminating observable is POSITION, not speed: the snapshot reads
	// the ball's velocity after applyFrame either way, so `speed` looks
	// launched in both orderings. Only the position says whether the impulse
	// was applied BEFORE the step that was supposed to integrate it.
	it('AD-5: the plunge impulse is integrated by the SAME tick physics step -- the ball has already moved on the release tick itself', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 600; i++) {
			out = loop.advance(1, []); // past plungerMaxHoldTicks -- full strength
		}
		const beforeRelease = out.snapshot.balls[0]!.pos;
		expect(out.snapshot.balls[0]!.speed, 'sanity: the ball must still be resting in the lane just before the release').toBeLessThan(50);

		// The release tick itself.
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		const atRelease = out.snapshot.balls[0]!.pos;
		const movedOnReleaseTick = Math.hypot(atRelease.x - beforeRelease.x, atRelease.y - beforeRelease.y, atRelease.z - beforeRelease.z);

		// A full-strength plunge is autolaunchSpeedMmPerS (2500 mm/s) = 2.5 mm
		// per tick at TICK_HZ 1000; a still-resting ball drifts by far less
		// than 1 mm in one tick. The 1 mm threshold sits between the two with
		// room to spare in both directions.
		expect(
			movedOnReleaseTick,
			'the plunge must be applied BEFORE physics.step() on the release tick, so the ball has already been carried this tick -- a hardware rule running after the step moves it for the first time only on the NEXT tick',
		).toBeGreaterThan(1);
	});

	it('holding s_plunger and releasing launches the served ball at the mapped speed, opens s_shooter_lane exactly once, and fires ball_launched exactly once', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);
		const servedBall = out.snapshot.balls[0];
		expect(servedBall, 'the served ball must be resting before the plunge').toBeDefined();

		const holdTicks = 250; // inside [plungerMinHoldTicks, plungerMaxHoldTicks]
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < holdTicks - 1; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		const tuning = resolveTuning();
		const expectedSpeed = plungerSpeedByHoldMs(holdTicks, tuning);

		let launchedCount = 0;
		let sawBall = false;
		for (let i = 0; i < 40; i++) {
			out = loop.advance(1, []);
			launchedCount += out.events.filter((e) => e.type === 'ball_launched').length;
			if (out.snapshot.balls[0]) {
				sawBall = true;
			}
		}
		expect(launchedCount, 'ball_launched must appear exactly once').toBe(1);
		expect(sawBall).toBe(true);

		// Speed check against the mapped value: bled off slightly by gravity
		// and deck contact over the ticks it takes to actually leave the zone
		// (the same banded, not exact-equality, check
		// test/machine-serve-drain.test.ts's own eject-speed test uses).
		const ball = out.snapshot.balls[0]!;
		expect(ball.speed).toBeGreaterThan(expectedSpeed * 0.7);
		expect(ball.speed).toBeLessThan(expectedSpeed * 1.3);
	});

	it('a release with NO ball in the lane emits eject_failed{device:"bd_shooter"} and nothing else', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = loop.advance(1, [{ tick: 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 20; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		const eventsAfterRelease: unknown[] = [...out.events];
		for (let i = 0; i < 5; i++) {
			out = loop.advance(1, []);
			eventsAfterRelease.push(...out.events);
		}
		expect(eventsAfterRelease).toContainEqual(expect.objectContaining({ type: 'eject_failed', device: 'bd_shooter' }));
		expect(eventsAfterRelease.some((e) => (e as { type: string }).type === 'ball_launched'), 'no ball_launched when nothing was launched').toBe(false);
	});

	it('holdTicks counts up every tick while held, with nothing launching, and resets to 0 on release', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		expect(out.snapshot.mechanisms.plunger.holdTicks).toBe(1);
		for (let i = 0; i < 49; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.plunger.holdTicks, 'holdTicks must count up every tick while held').toBe(50);
		expect(out.snapshot.balls, 'nothing launches merely from holding').toHaveLength(1);
		expect(out.snapshot.balls[0]!.speed, 'the resting ball must not have moved from merely holding s_plunger').toBeLessThan(50);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		expect(out.snapshot.mechanisms.plunger.holdTicks, 'the count must reset to 0 on release').toBe(0);
	});

	it('a hold below plungerMinHoldTicks clamps to plungerMinSpeedScale -- it never extrapolates below it', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);
		const tuning = resolveTuning();

		// A bare 1-tick tap -- as close to "below the minimum" as a discrete
		// hold->release pair can express (plungerMinHoldTicks is 0).
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let ball = out.snapshot.balls[0];
		for (let i = 0; i < 10 && (!ball || ball.speed < 1); i++) {
			out = loop.advance(1, []);
			ball = out.snapshot.balls[0];
		}
		const minSpeed = tuning.autolaunchSpeedMmPerS.value * tuning.plungerMinSpeedScale.value;
		expect(ball!.speed).toBeGreaterThan(minSpeed * 0.6);
		expect(ball!.speed).toBeLessThan(minSpeed * 1.6);
	});

	it('the full-strength manual plunge carries the ball past the lane wall top onto the main field, never re-entering sw_shooter_lane', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 600; i++) {
			// past plungerMaxHoldTicks (500)
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let reachedMainField = false;
		let reenteredLane = false;
		let sawLaneTop = false;
		for (let i = 0; i < 400 && !reachedMainField; i++) {
			out = loop.advance(16.667, []);
			const ball = out.snapshot.balls[0];
			if (!ball) {
				continue;
			}
			if (ball.pos.y >= 950) {
				sawLaneTop = true;
			}
			if (sawLaneTop && ball.pos.x >= 484.4 && ball.pos.x <= 510.4 && ball.pos.y >= 10 && ball.pos.y <= 60) {
				reenteredLane = true;
			}
			if (ball.pos.x < 468.4) {
				reachedMainField = true;
			}
		}
		expect(reachedMainField, `the ball never crossed the plunger-lane divider's main-field face; last pos: ${JSON.stringify(out.snapshot.balls[0]?.pos)}`).toBe(true);
		// Code review 2026-08-29 (iteration 2): sawLaneTop must be pinned, or
		// the re-entry assertion below cannot fail. `reenteredLane` is only
		// ever set while `sawLaneTop` is true, so if the ~16 ms sampling stride
		// never happened to observe y >= 950, `reenteredLane` would stay false
		// for that reason alone and `toBe(false)` would pass vacuously.
		expect(sawLaneTop, 'the ball must actually have been SEEN clearing the lane wall top (y >= 950) -- otherwise the re-entry assertion below asserts nothing').toBe(true);
		expect(reenteredLane, 'the ball must never fall back into sw_shooter_lane after clearing the lane top').toBe(false);
	});

	it('a full-strength manual plunge and pulse c_autolaunch give the ball the same launch speed and produce the same single events (AD-6: one code path)', () => {
		const manualLoop = createLoop({ collisionDoc: loadDoc() });
		let manualOut = serveAndSettle(manualLoop);
		manualOut = manualLoop.advance(1, [{ tick: manualOut.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 600; i++) {
			manualOut = manualLoop.advance(1, []);
		}
		manualOut = manualLoop.advance(1, [{ tick: manualOut.snapshot.tick + 1, frame: NO_FRAME }]);
		let manualLaunches = manualOut.events.filter((e) => e.type === 'ball_launched').length;
		for (let i = 0; i < 50; i++) {
			manualOut = manualLoop.advance(1, []);
			manualLaunches += manualOut.events.filter((e) => e.type === 'ball_launched').length;
		}
		const manualSpeed = manualOut.snapshot.balls[0]!.speed;

		const autoLoop = createLoop({ collisionDoc: loadDoc() });
		let autoOut = serveAndSettle(autoLoop);
		autoLoop.pulseCoil('c_autolaunch');
		let autoLaunches = 0;
		for (let i = 0; i < 50; i++) {
			autoOut = autoLoop.advance(1, []);
			autoLaunches += autoOut.events.filter((e) => e.type === 'ball_launched').length;
		}
		const autoSpeed = autoOut.snapshot.balls[0]!.speed;

		expect(manualLaunches).toBe(1);
		expect(autoLaunches).toBe(1);
		expect(manualSpeed).toBeCloseTo(autoSpeed, -1); // within ~tens of mm/s of each other
		expect(manualOut.snapshot.balls, 'neither path spawns a second ball').toHaveLength(1);
		expect(autoOut.snapshot.balls).toHaveLength(1);
	});
});

describe('sim/table/tuning.ts -- plungerMaxHoldTicks === plungerMinHoldTicks degenerate case (loop-level sanity)', () => {
	it('holdTicks resets to 0 even after a release with the coil disabled -- no stale count survives a re-enable', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);

		loop.setCoilEnabled('c_autolaunch', false);
		out = loop.advance(1, []); // the disable lands this tick

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 49; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		expect(out.snapshot.mechanisms.plunger.holdTicks, 'a disabled-coil release must still reset the count').toBe(0);
		expect(out.snapshot.balls, 'a disabled coil must not launch the ball').toHaveLength(1);
		expect(out.snapshot.balls[0]!.speed).toBeLessThan(50);
	});
});

describe('sim/physics/plunger.ts -- Story 5.4 (DW-292): the snapshot publishes the rod\'s pull, posMm = SHOOTER_ROD_STROKE_MM x t', () => {
	/** The shipped figures this story's I/O matrix quotes: a 1.5 in stroke over a 0..500 ms hold window. */
	it('the stroke is the authored 38.1 mm (1.5 in), and the shipped hold window is 0..500 ticks', () => {
		expect(SHOOTER_ROD_STROKE_MM).toBe(38.1);
		const tuning = resolveTuning();
		expect(tuning.plungerMinHoldTicks.value).toBe(0);
		expect(tuning.plungerMaxHoldTicks.value).toBe(500);
	});

	it('held for 250 ticks through the real createLoop, posMm = 38.1 x 250/500 = 19.05; held to 600, it clamps at 38.1; on the release tick it is 0', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);
		expect(out.snapshot.mechanisms.plunger.posMm, 'at rest before any hold').toBe(0);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < 249; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.plunger.holdTicks).toBe(250);
		expect(out.snapshot.mechanisms.plunger.posMm, 'posMm after a 250-tick hold').toBeCloseTo(19.05, 9);

		for (let i = 0; i < 350; i++) {
			out = loop.advance(1, []);
		}
		expect(out.snapshot.mechanisms.plunger.holdTicks).toBe(600);
		expect(out.snapshot.mechanisms.plunger.posMm, 'posMm past plungerMaxHoldTicks clamps at the full stroke').toBeCloseTo(38.1, 9);

		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		expect(out.snapshot.mechanisms.plunger.holdTicks).toBe(0);
		expect(out.snapshot.mechanisms.plunger.posMm, 'posMm on the release tick -- the rod is back at rest').toBe(0);
	});

	it('t is exactly the clamped fraction plungerSpeedByHoldMs() interpolates by, at every hold from 0 to past the window', () => {
		const tuning = resolveTuning();
		const fullSpeed = tuning.autolaunchSpeedMmPerS.value;
		const minScale = tuning.plungerMinSpeedScale.value;
		const maxScale = tuning.plungerMaxSpeedScale.value;
		for (const holdTicks of [1, 2, 50, 125, 250, 375, 499, 500, 501, 600, 5000]) {
			const t = plungerHoldFraction(holdTicks, tuning);
			expect(t, `t at holdTicks ${holdTicks} stays in [0, 1]`).toBeGreaterThanOrEqual(0);
			expect(t).toBeLessThanOrEqual(1);
			expect(plungerSpeedByHoldMs(holdTicks, tuning), `the launch speed at holdTicks ${holdTicks} is the one t sets`).toBeCloseTo(fullSpeed * (minScale + t * (maxScale - minScale)), 6);
		}
		expect(plungerHoldFraction(0, tuning), 'no hold (never held, or the release tick) is the rest pose').toBe(0);
	});

	// [Story 5.4 review] The shipped window starts at 0, so the lower clamp
	// (a hold shorter than plungerMinHoldTicks is t = 0) never runs above.
	// A 100..500 ms window exercises it, and the interior, against the speed
	// function. mutation: drop the `t < 0 ? 0` clamp in plungerHoldFraction()
	// -> red here at holdTicks 1..99.
	it('with a non-zero window start (100..500 ms), t is 0 below the start and still the speed function\'s fraction inside and past the window', () => {
		const tuning = resolveTuning({ ...TUNING, plungerMinHoldMs: { ...TUNING.plungerMinHoldMs, value: 100 }, plungerMaxHoldMs: { ...TUNING.plungerMaxHoldMs, value: 500 } });
		const minTicks = tuning.plungerMinHoldTicks.value;
		expect(minTicks, 'non-vacuity: the window starts above 0').toBeGreaterThan(0);
		const fullSpeed = tuning.autolaunchSpeedMmPerS.value;
		const minScale = tuning.plungerMinSpeedScale.value;
		const maxScale = tuning.plungerMaxSpeedScale.value;
		for (const holdTicks of [1, 50, minTicks - 1, minTicks, minTicks + 1, 300, 499, 500, 501, 900]) {
			const t = plungerHoldFraction(holdTicks, tuning);
			expect(t, `t at holdTicks ${holdTicks}`).toBeGreaterThanOrEqual(0);
			expect(t).toBeLessThanOrEqual(1);
			expect(plungerSpeedByHoldMs(holdTicks, tuning), `the launch speed at holdTicks ${holdTicks} is the one t sets`).toBeCloseTo(fullSpeed * (minScale + t * (maxScale - minScale)), 6);
		}
		expect(plungerHoldFraction(minTicks - 1, tuning), 'a hold shorter than the window start shows no pull').toBe(0);
	});

	it('zero-width hold window (plungerMinHoldMs === plungerMaxHoldMs): any nonzero hold is the full stroke, never a division by zero; no hold is 0', () => {
		const tuning = resolveTuning({ ...TUNING, plungerMinHoldMs: { ...TUNING.plungerMinHoldMs, value: 200 }, plungerMaxHoldMs: { ...TUNING.plungerMaxHoldMs, value: 200 } });
		expect(tuning.plungerMinHoldTicks.value).toBe(tuning.plungerMaxHoldTicks.value);
		expect(plungerHoldFraction(0, tuning)).toBe(0);
		for (const holdTicks of [1, 199, 200, 201]) {
			expect(plungerHoldFraction(holdTicks, tuning), `t at holdTicks ${holdTicks}`).toBe(1);
			expect(plungerSpeedByHoldMs(holdTicks, tuning), 'the speed guard gives the max scale at the same holds').toBe(tuning.autolaunchSpeedMmPerS.value * tuning.plungerMaxSpeedScale.value);
		}

		const loop = createLoop({ collisionDoc: loadDoc(), tuning });
		let out = serveAndSettle(loop);
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		expect(Number.isFinite(out.snapshot.mechanisms.plunger.posMm)).toBe(true);
		expect(out.snapshot.mechanisms.plunger.posMm, 'a one-tick hold under a zero-width window is already the full stroke').toBeCloseTo(SHOOTER_ROD_STROKE_MM, 9);
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);
		expect(out.snapshot.mechanisms.plunger.posMm, 'released: back to 0').toBe(0);
	});
});
