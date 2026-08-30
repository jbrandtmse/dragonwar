// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7, task 3 / Design Notes "Sub-stepping and the provisional tick
// rate": `sim/physics/cabinet/oscillator.ts`'s `cabinetSubstepsPerTick()`
// throws a descriptive load-time error if `SECONDS_PER_TICK` is not an exact
// positive integer multiple of the ported `CABINET_SUBSTEP_SECONDS` (0.001 s)
// sub-step -- a guard that protects a FUTURE change to the PROVISIONAL
// `TICK_HZ` (currently 1000, so the guard is a no-op today: ratio exactly 1).
// QA audit (2026-08-29): grep-confirmed nothing in the delivered suite
// exercised this throw, or `cabinetSubstepsPerTick()` at all -- a guard that
// protects a future change is exactly the kind of thing that ships untested
// (this story's own spawn-prompt priority list, item 4).
//
// This file drives it via a module-mocked `sim/contracts/time` and a
// dynamically re-imported `oscillator.ts` per case -- the same isolated-
// module-mock shape `test/machine-serve-drain.test.ts` already uses for its
// own load-time-throw coverage (mocking `sim/table/dragonwar` there).
// `oscillator.ts` itself is a PORTED file (this story's spec: "Do not edit
// the three ported files") -- this suite never edits it, only mocks its
// `sim/contracts/time` dependency for one isolated dynamic import at a time,
// and always unmocks + resets modules afterward so no other test file's
// (statically cached) import of `sim/contracts/time` or `oscillator.ts` is
// ever affected.

import { describe, expect, it, vi } from 'vitest';
import { cabinetSubstepsPerTick, CABINET_SUBSTEP_SECONDS } from '../src/sim/physics/cabinet/oscillator';
import { createCabinetMechanics, cabinetAccelToPhysicsAccel } from '../src/sim/physics/cabinet';
import { PHYS_FACTOR } from '../src/sim/physics/constants';
import { PlayerPhysics } from '../src/sim/physics/game/player-physics';
import { Ball } from '../src/sim/physics/ball/ball';
import { BallData } from '../src/sim/physics/ball/ball-data';
import { BallState } from '../src/sim/physics/ball/ball-state';
import { Vertex3D } from '../src/sim/physics/math/vertex3d';
import { resolveTuning } from '../src/sim/table/tuning';
import { NO_FRAME } from '../src/sim/loop';

describe('sim/physics/cabinet/oscillator.ts -- cabinetSubstepsPerTick() construction-time guard', () => {
	it('the REAL, unmocked, production SECONDS_PER_TICK (TICK_HZ=1000) does not throw and yields substepsPerTick=1 -- the guard is a no-op today, exactly as the spec states', () => {
		expect(cabinetSubstepsPerTick()).toBe(1);
	});

	it('throws a descriptive error naming SECONDS_PER_TICK when it is NOT an exact positive integer multiple of the ported 0.001s sub-step (e.g. TICK_HZ=480, SECONDS_PER_TICK=1/480 = 0.002083...)', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/contracts/time', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/contracts/time')>();
			return { ...actual, SECONDS_PER_TICK: 1 / 480 };
		});

		try {
			const { cabinetSubstepsPerTick: mockedFn } = await import('../src/sim/physics/cabinet/oscillator');
			expect(
				() => mockedFn(),
				'a non-exact-multiple SECONDS_PER_TICK must throw at construction, not silently run the ported semi-implicit-Euler integrator at an unvalidated dt',
			).toThrowError(/SECONDS_PER_TICK.*not an exact positive integer multiple/is);
		} finally {
			vi.doUnmock('../src/sim/contracts/time');
			vi.resetModules();
		}
	});

	it('createCabinetOscillator() -- the REAL construction path createCabinetMechanics() actually calls -- also throws for the same reason; the guard is not bypassable by a caller that skips cabinetSubstepsPerTick() and constructs the oscillator directly', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/contracts/time', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/contracts/time')>();
			return { ...actual, SECONDS_PER_TICK: 1 / 480 };
		});

		try {
			const { createCabinetOscillator } = await import('../src/sim/physics/cabinet/oscillator');
			const { resolveTuning } = await import('../src/sim/table/tuning');
			expect(() => createCabinetOscillator(resolveTuning())).toThrow();
		} finally {
			vi.doUnmock('../src/sim/contracts/time');
			vi.resetModules();
		}
	});

	it('also throws when the ratio rounds to zero (SECONDS_PER_TICK smaller than half the sub-step) -- the guard\'s OTHER branch ("rounded <= 0"), distinct from the non-integer-ratio branch above', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/contracts/time', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/contracts/time')>();
			// TICK_HZ=10000 -> SECONDS_PER_TICK=0.0001 -> ratio=0.1 -> rounds to 0.
			return { ...actual, SECONDS_PER_TICK: 0.0001 };
		});

		try {
			const { cabinetSubstepsPerTick: mockedFn } = await import('../src/sim/physics/cabinet/oscillator');
			expect(() => mockedFn()).toThrowError(/SECONDS_PER_TICK/i);
		} finally {
			vi.doUnmock('../src/sim/contracts/time');
			vi.resetModules();
		}
	});

	it('does NOT throw, and returns substepsPerTick=2, when SECONDS_PER_TICK IS an exact positive integer multiple (e.g. TICK_HZ=500, SECONDS_PER_TICK=0.002s = 2 x 0.001s) -- the multi-substep-per-tick path a lowered PROVISIONAL TICK_HZ would actually exercise', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/contracts/time', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/contracts/time')>();
			return { ...actual, SECONDS_PER_TICK: 0.002 };
		});

		try {
			const { cabinetSubstepsPerTick: mockedFn, createCabinetOscillator } = await import('../src/sim/physics/cabinet/oscillator');
			expect(mockedFn(), 'a clean 2x multiple must resolve to exactly 2 sub-steps per tick, not throw').toBe(2);

			const { resolveTuning } = await import('../src/sim/table/tuning');
			expect(() => createCabinetOscillator(resolveTuning())).not.toThrow();
		} finally {
			vi.doUnmock('../src/sim/contracts/time');
			vi.resetModules();
		}
	});
});

describe('sim/physics/cabinet -- the cabinet integrates exactly as much time per tick as the ball solver does', () => {
	// Code review 2026-08-29. The ball coupling in
	// `sim/physics/cabinet/index.ts` accumulates `substepsPerTick` sub-steps
	// of cabinet acceleration into ONE velocity delta, then hands it to a ball
	// that `machine.ts` advances with exactly ONE `physics.step()` per tick.
	// That is only correct while the cabinet's integrated time per tick equals
	// the solver's own step, and today the two agree by coincidence:
	//
	//   cabinet: substepsPerTick (1) * CABINET_SUBSTEP_SECONDS (0.001 s) * 100 T/s = 0.1 T
	//   solver:  PHYS_FACTOR = PHYSICS_STEPTIME_S / DEFAULT_STEPTIME_S       = 0.1 T
	//
	// Nothing imported or asserted that equality, and the two constants live
	// in different files with no link between them: `TICK_HZ`
	// (`sim/contracts/time.ts`) and `PHYSICS_STEPTIME`
	// (`sim/physics/constants.ts`) are independent. `cabinetSubstepsPerTick()`'s
	// own error message actively recommends "Lower TICK_HZ to a value whose
	// tick period is an exact multiple of 1 ms (e.g. 500 Hz)" -- and at 500 Hz
	// with `PHYSICS_STEPTIME` unchanged the cabinet would integrate 2 ms of
	// acceleration per tick and subtract that much velocity from a ball the
	// solver only advanced 1 ms, silently. This pins the invariant so that a
	// future tick-rate change fails here, loudly, instead of quietly
	// desynchronising the cabinet from the solver.
	it('substepsPerTick * CABINET_SUBSTEP_SECONDS, in physics T units, equals the solver\'s own PHYS_FACTOR step', () => {
		const cabinetTPerTick = cabinetSubstepsPerTick() * CABINET_SUBSTEP_SECONDS * 100;
		expect(
			cabinetTPerTick,
			'the cabinet must advance exactly one physics step worth of time per tick -- if TICK_HZ changes, PHYSICS_STEPTIME must change with it (a physics-version bump that re-records every golden, AD-3/AD-15)',
		).toBeCloseTo(PHYS_FACTOR, 12);
	});
});

// DW-84: `applyFrame()`'s own sub-step loop (`cabinet/index.ts:195`,
// `for (let s = 0; s < oscillator.substepsPerTick; s++)`) has never been
// driven under `oscillator.substepsPerTick > 1` -- the guard above proves the
// CONSTRUCTION-time arithmetic (`cabinetSubstepsPerTick()`) but nothing runs
// the loop itself more than once. This extends the same partial
// `vi.doMock('../src/sim/contracts/time', ...)` seam one call further, into
// `createCabinetMechanics().applyFrame()`, and pins BOTH tick-rate-dependent
// scalings the task names:
//
//   (a) `lengthSubsteps` (`nudge-impulse.ts:99`, `nudgeImpulseTicks.value *
//       substepsPerTick`) doubling, 25 -> 50 -- proven by observing WHEN a
//       queued impulse expires: `createNudgeImpulseQueue` is exported, so a
//       reference instance built with the SAME (mocked) `substepsPerTick` is
//       driven exactly 26 `stepSubstep()` calls -- one past the UNMOCKED
//       baseline's own 25-substep-long impulse -- and is still IN PROGRESS
//       (nonzero) there, while a baseline-`substepsPerTick` instance has
//       already EXPIRED (exactly zero) at that same call.
//   (b) the accumulated `deltaVelPhysicsX/Y` doubling -- `deltaVelPhysicsX`
//       itself is a local variable inside `applyFrame()`, never returned
//       (`CabinetMechanicsResult` carries only `switchEvents`), so it is
//       observed the only way it is OBSERVABLE: the ball-coupling side effect
//       (`:210-213`, `ball.hit.vel.x -= deltaVelPhysicsX`) against a bare
//       ball starting at rest. `createCabinetOscillator` and
//       `createNudgeImpulseQueue` are BOTH exported (the same primitives
//       `cabinet/index.ts`'s own loop calls), so an INDEPENDENT reference
//       computation -- built from those same primitives, run for a
//       caller-chosen number of sub-step iterations -- reproduces
//       `applyFrame()`'s own `:193-204` accumulation without importing or
//       duplicating `applyFrame()` itself. The production ball's observed
//       delta is asserted to match the reference run at `substepsPerTick`
//       iterations (2, under the mock) and to DIFFER from the reference run
//       capped at 1 iteration -- exactly the loop-bound mutation this
//       story's Verification section names.
describe('sim/physics/cabinet -- applyFrame() sub-step loop, driven for real under substepsPerTick > 1 (DW-84)', () => {
	const SUBSTEP_DT_T = CABINET_SUBSTEP_SECONDS * 100;
	const NUDGE_L_DIRECTION = { x: -1, y: 0 };

	function buildFakePhysics(): { physics: PlayerPhysics; ball: Ball } {
		const physics = new PlayerPhysics();
		const data = new BallData(25, 1, 1);
		const state = new BallState('dw84-probe', new Vertex3D(0, 0, 0));
		const ball = new Ball(0, data, state, new Vertex3D(0, 0, 0), { tableHeight: 0, globalDifficulty: 1 });
		physics.addBall(ball);
		return { physics, ball };
	}

	/**
	 * Reference recomputation of `applyFrame()`'s own `:193-204` per-tick
	 * accumulation, for `substepIterations` loop iterations, using a FRESH
	 * oscillator/queue pair independent of any production instance -- both
	 * `createCabinetOscillator` and `createNudgeImpulseQueue` are exported,
	 * so this calls the SAME primitives `cabinet/index.ts`'s own loop does,
	 * never a reimplementation of the ported oscillator/queue math itself.
	 */
	function referenceDeltaVel(
		createOscillator: typeof import('../src/sim/physics/cabinet/oscillator').createCabinetOscillator,
		createQueue: typeof import('../src/sim/physics/cabinet/nudge-impulse').createNudgeImpulseQueue,
		convertAccel: typeof import('../src/sim/physics/cabinet').cabinetAccelToPhysicsAccel,
		tuning: ReturnType<typeof resolveTuning>,
		substepIterations: number,
	): { readonly x: number; readonly y: number } {
		const oscillator = createOscillator(tuning);
		const queue = createQueue({ tuning, substepsPerTick: oscillator.substepsPerTick });
		queue.queue(NUDGE_L_DIRECTION.x, NUDGE_L_DIRECTION.y);
		let deltaVelX = 0;
		let deltaVelY = 0;
		for (let s = 0; s < substepIterations; s++) {
			const impulseAccel = queue.stepSubstep();
			oscillator.stepSubstep(oscillator.massKg * impulseAccel.x, oscillator.massKg * impulseAccel.y);
			const physicsAccel = convertAccel({ x: oscillator.x.accelerationMPerS2, y: oscillator.y.accelerationMPerS2 });
			deltaVelX += physicsAccel.x * SUBSTEP_DT_T;
			deltaVelY += physicsAccel.y * SUBSTEP_DT_T;
		}
		return { x: deltaVelX, y: deltaVelY };
	}

	it('(a) lengthSubsteps doubles, 25 -> 50: a mocked-substepsPerTick=2 impulse queue is still IN PROGRESS 26 stepSubstep() calls in, while an unmocked (substepsPerTick=1) one has already EXPIRED there', async () => {
		const tuning = resolveTuning();
		expect(tuning.nudgeImpulseTicks.value, 'sanity: this test\'s whole premise (25 -> 50) depends on nudgeImpulseTicks.value being 25').toBe(25);

		const { createCabinetOscillator: baselineCreateOscillator } = await import('../src/sim/physics/cabinet/oscillator');
		const { createNudgeImpulseQueue: baselineCreateQueue } = await import('../src/sim/physics/cabinet/nudge-impulse');
		const baselineOscillator = baselineCreateOscillator(tuning);
		expect(baselineOscillator.substepsPerTick, 'sanity: unmocked baseline must be 1').toBe(1);
		const baselineQueue = baselineCreateQueue({ tuning, substepsPerTick: baselineOscillator.substepsPerTick });
		baselineQueue.queue(NUDGE_L_DIRECTION.x, NUDGE_L_DIRECTION.y);
		let baselineLastResult: { readonly x: number; readonly y: number } = { x: 0, y: 0 };
		for (let s = 0; s < 26; s++) {
			baselineLastResult = baselineQueue.stepSubstep();
		}
		expect(baselineLastResult, 'the 26th call must find the baseline (25-substep-long) impulse already EXPIRED').toEqual({ x: 0, y: 0 });

		vi.resetModules();
		vi.doMock('../src/sim/contracts/time', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/contracts/time')>();
			return { ...actual, SECONDS_PER_TICK: 0.002 };
		});
		try {
			const { createCabinetOscillator: mockedCreateOscillator } = await import('../src/sim/physics/cabinet/oscillator');
			const { createNudgeImpulseQueue: mockedCreateQueue } = await import('../src/sim/physics/cabinet/nudge-impulse');
			const mockedOscillator = mockedCreateOscillator(tuning);
			expect(mockedOscillator.substepsPerTick, 'sanity: mocked scenario must be 2').toBe(2);
			const mockedQueue = mockedCreateQueue({ tuning, substepsPerTick: mockedOscillator.substepsPerTick });
			mockedQueue.queue(NUDGE_L_DIRECTION.x, NUDGE_L_DIRECTION.y);
			let mockedLastResult: { readonly x: number; readonly y: number } = { x: 0, y: 0 };
			for (let s = 0; s < 26; s++) {
				mockedLastResult = mockedQueue.stepSubstep();
			}
			expect(mockedLastResult.x, 'the 26th call must find the mocked (50-substep-long) impulse STILL IN PROGRESS -- lengthSubsteps really did double').not.toBe(0);
		} finally {
			vi.doUnmock('../src/sim/contracts/time');
			vi.resetModules();
		}
	});

	it('(b) the accumulated deltaVelPhysicsX/Y that applyFrame() couples into a ball, under substepsPerTick=2, matches a 2-substep-iteration reference and DIFFERS from a 1-substep-iteration reference (the falsifiability mutation: capping cabinet/index.ts:195\'s loop to s < 1)', async () => {
		vi.resetModules();
		vi.doMock('../src/sim/contracts/time', async (importOriginal) => {
			const actual = await importOriginal<typeof import('../src/sim/contracts/time')>();
			return { ...actual, SECONDS_PER_TICK: 0.002 };
		});
		try {
			const { createCabinetMechanics: mockedCreateMechanics, cabinetAccelToPhysicsAccel: mockedConvertAccel } = await import('../src/sim/physics/cabinet');
			const { createCabinetOscillator: mockedCreateOscillator } = await import('../src/sim/physics/cabinet/oscillator');
			const { createNudgeImpulseQueue: mockedCreateQueue } = await import('../src/sim/physics/cabinet/nudge-impulse');
			const { resolveTuning: mockedResolveTuning } = await import('../src/sim/table/tuning');
			const tuning = mockedResolveTuning();

			const twoSubstepReference = referenceDeltaVel(mockedCreateOscillator, mockedCreateQueue, mockedConvertAccel, tuning, 2);
			const oneSubstepReference = referenceDeltaVel(mockedCreateOscillator, mockedCreateQueue, mockedConvertAccel, tuning, 1);
			expect(
				twoSubstepReference.x,
				'sanity: the reference computation itself must actually differ between 1 and 2 iterations, or this test proves nothing',
			).not.toBe(oneSubstepReference.x);

			const { physics, ball } = buildFakePhysics();
			const mechanics = mockedCreateMechanics({ physics, tuning });
			mechanics.applyFrame(1, { ...NO_FRAME, nudge_l: true });

			// applyFrame() couples `ball.hit.vel.x -= deltaVelPhysicsX`, starting from rest.
			const observedDeltaVelX = -ball.hit.vel.x;
			expect(observedDeltaVelX, 'applyFrame()\'s REAL loop (s < oscillator.substepsPerTick, = 2 here) must match the 2-substep-iteration reference').toBeCloseTo(twoSubstepReference.x, 9);
			expect(observedDeltaVelX, 'and must therefore DIFFER from what a loop capped at 1 iteration (the named mutation) would have produced').not.toBeCloseTo(oneSubstepReference.x, 6);
		} finally {
			vi.doUnmock('../src/sim/contracts/time');
			vi.resetModules();
		}
	});

	it('(control) the SAME reference computation, run unmocked at substepsPerTick=1, matches applyFrame()\'s real production behaviour too -- proves (b) is not vacuously true only under the mock', async () => {
		const tuning = resolveTuning();
		const { createCabinetOscillator } = await import('../src/sim/physics/cabinet/oscillator');
		const { createNudgeImpulseQueue } = await import('../src/sim/physics/cabinet/nudge-impulse');
		const oneSubstepReference = referenceDeltaVel(createCabinetOscillator, createNudgeImpulseQueue, cabinetAccelToPhysicsAccel, tuning, 1);

		const { physics, ball } = buildFakePhysics();
		const mechanics = createCabinetMechanics({ physics, tuning });
		mechanics.applyFrame(1, { ...NO_FRAME, nudge_l: true });
		const observedDeltaVelX = -ball.hit.vel.x;
		expect(observedDeltaVelX).toBeCloseTo(oneSubstepReference.x, 9);
	});
});
