// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7's AC 6 (both switches are table-declared and reproduce in a
// replay) and AC 8 (Integration AC, Rule 1 -- observed through the real
// createLoop() seam, not the cabinet module driven directly).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { createMachine } from '../src/sim/physics/machine';
import { resolveTuning } from '../src/sim/table/tuning';
import { TABLE } from '../src/sim/table/dragonwar';
import { SECONDS_PER_TICK } from '../src/sim/contracts/time';
import type { InputTransition } from '../src/sim/contracts/input';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

describe('sim/physics/cabinet -- AC 6: both switches are table-declared and reproduce in a replay', () => {
	it('s_tilt_bob and s_slam_tilt are both present in TABLE.switches and both resolve to settleTicks 0', () => {
		expect(TABLE.switches.s_tilt_bob).toBeDefined();
		expect(TABLE.switches.s_slam_tilt).toBeDefined();
		const resolved = resolveTuning();
		expect(resolved.switchSettleTicksByClass.tilt_bob.value).toBe(0);
		expect(resolved.switchSettleTicksByClass.slam.value).toBe(0);
	});

	it('replaying the same InputTransition[] through a fresh createMachine() twice produces the identical ordered sequence of both switches\' edges', () => {
		// A burst matching test/cabinet-bob.test.ts's own AC 3 arrangement --
		// exercises both s_tilt_bob (the burst crosses it) and s_slam_tilt
		// (>= slamNudgesPerWindow edges land inside its window).
		const transitions: InputTransition[] = [];
		for (let i = 0; i < 10; i++) {
			const onTick = 1 + i * 2;
			transitions.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
			transitions.push({ tick: onTick + 1, frame: NO_FRAME });
		}

		function replay(): Array<{ readonly switch: string; readonly closed: boolean; readonly tick: number }> {
			const tuning = resolveTuning();
			const machine = createMachine(loadDoc(), tuning);
			const pending = [...transitions];
			let currentFrame = NO_FRAME;
			const edges: Array<{ switch: string; closed: boolean; tick: number }> = [];
			for (let tick = 1; tick <= 1500; tick++) {
				while (pending.length > 0 && pending[0]!.tick <= tick) {
					currentFrame = pending.shift()!.frame;
				}
				const result = machine.step(tick, currentFrame, []);
				for (const edge of result.switchEvents) {
					if (edge.switch === 's_tilt_bob' || edge.switch === 's_slam_tilt') {
						edges.push({ switch: edge.switch, closed: edge.closed, tick: edge.tick });
					}
				}
			}
			return edges;
		}

		const first = replay();
		const second = replay();
		expect(first.length, 'sanity: this scenario must actually produce edges on both switches, or the reproducibility check is vacuous').toBeGreaterThan(0);
		expect(first.some((e) => e.switch === 's_tilt_bob')).toBe(true);
		expect(first.some((e) => e.switch === 's_slam_tilt')).toBe(true);
		expect(second).toEqual(first);
	});
});

describe('sim/physics/cabinet -- AC 8 (Integration AC, Rule 1): observed through the real createLoop() seam', () => {
	it('an InputTransition raising nudge_l, fed to the real createLoop().advance(), diverges the ball trajectory from an otherwise-identical no-nudge run, and the same run\'s machine (via a parallel createMachine() call) returns switchEvents carrying the bob\'s edges', () => {
		const control = createLoop({ collisionDoc: loadDoc() });
		const nudged = createLoop({ collisionDoc: loadDoc() });

		// Serve a ball into play the same way both runs, via the documented
		// dev escape hatch (loop/index.ts's own header: "the story's own
		// acceptance criteria drive bd_trough's eject ... from a 'dev
		// action'"), before either advance() call -- both loops see the same
		// pulse on their own first tick.
		control.pulseCoil('c_trough_eject');
		nudged.pulseCoil('c_trough_eject');

		const nudgeTick = 20;
		const nudgeTransition: InputTransition = { tick: nudgeTick, frame: { ...NO_FRAME, nudge_l: true } };

		let controlOut = control.advance(1, []);
		let nudgedOut = nudged.advance(1, []);
		// Bit-identical immediately after the shared serve pulse. Guarded on a
		// ball actually existing first: two EMPTY ball arrays also compare
		// equal, which is this epic's own recorded failure mode (a determinism
		// test that asserted a ball position with no ball ever spawned).
		expect(controlOut.snapshot.balls.length, 'the shared serve pulse must have produced a ball, or this comparison is vacuous').toBeGreaterThan(0);
		expect(nudgedOut.snapshot.balls).toEqual(controlOut.snapshot.balls);

		controlOut = control.advance(100, []);
		nudgedOut = nudged.advance(100, [nudgeTransition]);

		expect(nudgedOut.snapshot.balls.length, 'a ball must actually be in play, or this proves nothing').toBeGreaterThan(0);
		expect(controlOut.snapshot.balls.length).toBe(nudgedOut.snapshot.balls.length);
		// The trajectory diverges: at least one ball's position or velocity
		// differs between the nudged and control runs.
		const diverged = nudgedOut.snapshot.balls.some((ball, i) => {
			const other = controlOut.snapshot.balls[i]!;
			return ball.pos.x !== other.pos.x || ball.pos.y !== other.pos.y || ball.vel.x !== other.vel.x || ball.vel.y !== other.vel.y;
		});
		expect(diverged, "the nudged run's ball trajectory must diverge from the control run's").toBe(true);

		// "The same run's machine.step() returns switchEvents carrying the
		// bob's edges" -- FrameOutput deliberately carries no SwitchEvents
		// (loop/index.ts's own header), so this is observed on a PARALLEL
		// createMachine() driven by the identical transition sequence (the
		// same seam createLoop() itself calls internally) -- a burst is
		// needed to actually cross the bob's threshold (test/cabinet-bob.test.ts's
		// own measurement), so this checks the SEAM carries edges when they
		// occur, not that one nudge_l alone crosses it.
		const burstTuning = resolveTuning();
		const burstMachine = createMachine(loadDoc(), burstTuning);
		const burstTransitions: InputTransition[] = [];
		for (let i = 0; i < 10; i++) {
			const onTick = 1 + i * 2;
			burstTransitions.push({ tick: onTick, frame: { ...NO_FRAME, nudge_up: true } });
			burstTransitions.push({ tick: onTick + 1, frame: NO_FRAME });
		}
		let currentFrame = NO_FRAME;
		const pending = [...burstTransitions];
		let sawBobEdge = false;
		for (let tick = 1; tick <= 1500 && !sawBobEdge; tick++) {
			while (pending.length > 0 && pending[0]!.tick <= tick) {
				currentFrame = pending.shift()!.frame;
			}
			const result = burstMachine.step(tick, currentFrame, []);
			if (result.switchEvents.some((e) => e.switch === 's_tilt_bob')) {
				sawBobEdge = true;
			}
		}
		expect(sawBobEdge, "machine.step()'s switchEvents must carry the bob's edges at this seam").toBe(true);
	});
});

describe('sim/physics/cabinet -- AD-5 ordering: the cabinet rule runs BEFORE physics.step()', () => {
	// Code review 2026-08-29: the twin of test/plunger.test.ts:55-78's and
	// test/flipper-mover.test.ts's ordering pins, for the THIRD hardware rule
	// AD-5 names -- the one Story 1.7 added at the same
	// src/sim/physics/machine.ts seam.
	//
	// Before this test, moving ONLY `cabinetMechanics.applyFrame(tick, frame)`
	// in machine.ts to after `physics.step()` -- making every nudge one tick
	// late, the exact latency AD-5 forbids and AC 1 explicitly rules out
	// ("the oscillator receives exactly one impulse inside tick t's OWN step,
	// before physics.step()") -- left the entire suite green (measured: 654
	// passed, typecheck clean). That is the same hole Story 1.6 had to close
	// for the flipper and the plunger, and the epic context names this
	// ordering its central invariant, to be pinned by a test that fails when
	// the hardware rules move after the step.
	//
	// The discriminating observable is POSITION, not velocity: in BOTH
	// orderings the coupling has changed the ball's velocity by the time the
	// tick ends, so velocity looks nudged either way. Only the position says
	// whether the velocity change was applied BEFORE the step that was
	// supposed to integrate it. Measured: the nudged ball is 6.59e-5 mm from
	// the control at the end of the nudge tick under the correct ordering,
	// and EXACTLY 0 (bit-identical) under the reversed one.
	it('the nudge tick\'s own velocity change is integrated by that same tick\'s physics step -- the ball has already moved on the nudge tick itself', () => {
		const control = createLoop({ collisionDoc: loadDoc() });
		const nudged = createLoop({ collisionDoc: loadDoc() });
		control.pulseCoil('c_trough_eject');
		nudged.pulseCoil('c_trough_eject');

		let controlOut = control.advance(1, []);
		let nudgedOut = nudged.advance(1, []);
		for (let i = 0; i < 200; i++) {
			controlOut = control.advance(1, []);
			nudgedOut = nudged.advance(1, []);
		}

		// Precondition: a ball exists and the two runs are bit-identical, so
		// any difference below is the nudge and nothing else.
		expect(controlOut.snapshot.balls.length, 'a ball must be in play, or this proves nothing').toBeGreaterThan(0);
		expect(nudgedOut.snapshot.balls[0]!.pos, 'the paired runs must be bit-identical before the nudge').toEqual(controlOut.snapshot.balls[0]!.pos);

		// The nudge tick itself -- one single tick, one single rising edge.
		const nudgeTransition: InputTransition = { tick: nudgedOut.snapshot.tick + 1, frame: { ...NO_FRAME, nudge_l: true } };
		controlOut = control.advance(1, []);
		nudgedOut = nudged.advance(1, [nudgeTransition]);

		const nudgedPos = nudgedOut.snapshot.balls[0]!.pos;
		const controlPos = controlOut.snapshot.balls[0]!.pos;
		const movedOnNudgeTick = Math.hypot(nudgedPos.x - controlPos.x, nudgedPos.y - controlPos.y, nudgedPos.z - controlPos.z);

		// Review finding, Story 1.8's sweep (vacuity shape 5, "toBeGreaterThan(0),
		// no margin, no stated expectation" -- Code Map, Part D item 5): a bare
		// `toBeGreaterThan(0)` passes for ANY nonzero divergence, however tiny,
		// which does not discriminate "applied before the step, as designed" from
		// "applied one substep late, mostly bled away" -- both are nonzero. The
		// replacement derives an independent expected MAGNITUDE from the SAME
		// paired runs' own measured velocity divergence (never the position this
		// assertion is about, so it cannot be circular): `expected = |dv| *
		// SECONDS_PER_TICK` estimates the distance one tick of that velocity
		// difference would cover. `expected > 0` is asserted FIRST and is
		// mandatory on its own (Design Notes' own instruction): without it, a
		// future change that zeroed both the velocity divergence AND the position
		// divergence together would pass vacuously, the same failure mode this
		// story's sweep exists to hunt. The pin STAYS on the rising-edge tick
		// (never moved to the impulse peak -- Code Map's own "two dead ends" note:
		// by the peak the mutated run has also diverged, destroying the
		// discriminator that only exists at this exact tick).
		const nudgedVel = nudgedOut.snapshot.balls[0]!.vel;
		const controlVel = controlOut.snapshot.balls[0]!.vel;
		const dvMagMmPerS = Math.hypot(nudgedVel.x - controlVel.x, nudgedVel.y - controlVel.y, nudgedVel.z - controlVel.z);
		const expectedMm = dvMagMmPerS * SECONDS_PER_TICK;

		expect(expectedMm, 'sanity: the paired runs must have actually diverged in velocity this tick, or the band below is vacuously [0, 0]').toBeGreaterThan(0);
		expect(
			movedOnNudgeTick,
			`the coupling must be applied BEFORE physics.step() on the nudge tick, so the ball has already been carried this tick by roughly one tick's worth of the measured velocity divergence (expected ~${expectedMm.toExponential(3)} mm, got ${movedOnNudgeTick.toExponential(3)} mm) -- a hardware rule running after the step moves it for the first time only on the NEXT tick, leaving this difference exactly 0`,
		).toBeGreaterThanOrEqual(expectedMm * 0.25);
		expect(
			movedOnNudgeTick,
			`the displacement must also stay WITHIN 4x that same derived expectation (expected ~${expectedMm.toExponential(3)} mm, got ${movedOnNudgeTick.toExponential(3)} mm) -- a value far above one tick's worth of the measured velocity divergence means something other than this tick's coupling moved the ball, which the lower bound alone cannot catch`,
		).toBeLessThanOrEqual(expectedMm * 4);
	});
});
