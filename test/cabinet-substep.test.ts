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
import { PHYS_FACTOR } from '../src/sim/physics/constants';

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
