/*
 * Visual Pinball
 * Copyright (C) 2000-2026 Visual Pinball development team and contributors
 *                         (unless specifically noted differently in a respective source file)
 *
 * Visual Pinball is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Visual Pinball is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details: <https://www.gnu.org/licenses/>.
 */
// Ported from vpinball/vpinball (GPL-3.0-or-later); distributed with DragonWar under GPL-3.0
// Source: src/physics/cabinet/DampedHarmonicOscillator.h, src/physics/cabinet/CabinetPhysics.h, src/physics/cabinet/CabinetPhysics.cpp
// Pin: 3f838c14bd2e37fb49a0b5aa6a9d76d421846bef
//
// Transcribes DampedHarmonicOscillator's semi-implicit (symplectic) Euler
// step -- a = (F - c*v - k*x) / m; v += a*dt; x += v*dt -- and
// CabinetPhysics's two independent axes (X, Y), constructed from
// TUNING.cabinet (Story 1.7's own transcribed figures, sim/table/tuning.ts).
//
// Deviation: the two axes are independent DampedHarmonicOscillator instances
// (upstream's own design -- CabinetPhysics.h: "missing torque and therefore
// resulting in equivalent side nudge at top and bottom"), unchanged here.
// Deviation: CabinetPhysics.cpp's `3.5f` / `2.0f` "magic" display-correction
// factors on GetCabinetOffset() are NOT ported -- upstream's own comment
// states they exist only "to match reference videos and 'look good'" because
// upstream applies the ball response separately from the rendered cabinet
// displacement; this project treats the whole thing as one change of
// reference frame (see src/sim/physics/cabinet/index.ts's header), which
// needs no reconciling correction, and Epic 1 renders no cabinet shake at
// all (no consumer for a corrected displacement exists yet).
// Deviation: upstream is single-precision float throughout; this port is
// `number` (f64), uniform with the existing vpx-js port under
// src/sim/physics/**. Results differ from upstream in the last few digits.
// Deviation: upstream's `StepOneMillisecond()` is called once per 1 ms
// wall-clock step, hard-coded via `constexpr float deltaTime = 0.001f;`
// (CabinetPhysics.cpp:21). This project's simulation tick (TICK_HZ,
// sim/contracts/time.ts) is PROVISIONAL, so this file sub-steps at the
// ported 0.001 s cadence explicitly (`CABINET_SUBSTEP_SECONDS` below) rather
// than assuming a 1:1 tick match, and throws a descriptive load-time error
// if `SECONDS_PER_TICK` is not an exact positive integer multiple of it --
// see "Sub-stepping and the provisional tick rate" in this story's spec.

import { SECONDS_PER_TICK } from '../../contracts/time';
import type { ResolvedTuning } from '../../table/tuning';

/** Verbatim, CabinetPhysics.cpp:21 / PlumbHandler.cpp:54's shared `constexpr float deltaTime = 0.001f;` -- never tunable (AD-15). Every cabinet/bob port integrates at this fixed sub-step, looped `substepsPerTick` times per simulation tick. */
export const CABINET_SUBSTEP_SECONDS = 0.001;

/** One axis's damped-harmonic-oscillator state, in SI (m, m/s, m/s^2) -- `DampedHarmonicOscillator`'s own three public getters. */
export interface AxisOscillatorState {
	readonly displacementM: number;
	readonly velocityMPerS: number;
	readonly accelerationMPerS2: number;
}

export interface CabinetOscillator {
	/** `SECONDS_PER_TICK / CABINET_SUBSTEP_SECONDS`, validated at construction. */
	readonly substepsPerTick: number;
	readonly massKg: number;
	/** Advances BOTH axes by exactly one `CABINET_SUBSTEP_SECONDS` (0.001 s) under the given force (N), semi-implicit Euler -- `CabinetPhysics::StepOneMillisecond()`. */
	stepSubstep(forceXN: number, forceYN: number): void;
	readonly x: AxisOscillatorState;
	readonly y: AxisOscillatorState;
}

/** `DampedHarmonicOscillator`: ctor derives `omega0 = 2*pi*freq`, `k = m*omega0^2`, `c = 2*zeta*m*omega0`; `StepOneMillisecond(F, dt)` is `a = (F - c*v - k*x) / m; v += a*dt; x += v*dt`. */
function createAxisOscillator(massKg: number, freqHz: number, zeta: number) {
	const omega0 = 2 * Math.PI * freqHz;
	const k = massKg * omega0 * omega0;
	const damping = 2 * zeta * massKg * omega0;

	let displacementM = 0;
	let velocityMPerS = 0;
	let accelerationMPerS2 = 0;

	return {
		stepSubstep(forceN: number, dtSeconds: number): void {
			accelerationMPerS2 = (forceN - damping * velocityMPerS - k * displacementM) / massKg;
			velocityMPerS += accelerationMPerS2 * dtSeconds;
			displacementM += velocityMPerS * dtSeconds;
		},
		get state(): AxisOscillatorState {
			return { displacementM, velocityMPerS, accelerationMPerS2 };
		},
	};
}

/**
 * `SECONDS_PER_TICK / CABINET_SUBSTEP_SECONDS`, validated to be an exact
 * positive integer -- the ported semi-implicit Euler integrators (this file
 * and plumb-bob.ts) are only validated by upstream at their own fixed 1 ms
 * sub-step; at `TICK_HZ = 1000` this is exactly 1 and nothing changes. A
 * throw here is a load-time path (this project's error-policy convention:
 * load-time paths throw, step paths never do), naming the value that failed
 * and the remedy, rather than silently running ported physics at an
 * unvalidated `dt`.
 */
export function cabinetSubstepsPerTick(): number {
	const ratio = SECONDS_PER_TICK / CABINET_SUBSTEP_SECONDS;
	const rounded = Math.round(ratio);
	if (rounded <= 0 || Math.abs(ratio - rounded) > 1e-9) {
		throw new Error(
			`cabinetSubstepsPerTick(): SECONDS_PER_TICK (${SECONDS_PER_TICK}) is not an exact positive integer multiple of the ` +
				`ported cabinet/bob sub-step (${CABINET_SUBSTEP_SECONDS} s) -- the vpinball cabinet oscillator and plumb-bob ` +
				`integrators (semi-implicit Euler) are only validated at their own fixed 1 ms sub-step. Lower TICK_HZ to a value ` +
				`whose tick period is an exact multiple of 1 ms (e.g. 500 Hz), or add a sub-step accumulator here, rather than ` +
				`running this port at an unvalidated dt.`,
		);
	}
	return rounded;
}

/** Builds the cabinet oscillator (both axes) from `TUNING.cabinet`'s transcribed figures. Throws at construction if `cabinetSubstepsPerTick()` throws (see above) -- a load-time path. */
export function createCabinetOscillator(tuning: ResolvedTuning): CabinetOscillator {
	const substepsPerTick = cabinetSubstepsPerTick();
	const massKg = tuning.cabinet.massKg.value;
	const x = createAxisOscillator(massKg, tuning.cabinet.freqXHz.value, tuning.cabinet.zetaX.value);
	const y = createAxisOscillator(massKg, tuning.cabinet.freqYHz.value, tuning.cabinet.zetaY.value);

	return {
		substepsPerTick,
		massKg,
		stepSubstep(forceXN: number, forceYN: number): void {
			x.stepSubstep(forceXN, CABINET_SUBSTEP_SECONDS);
			y.stepSubstep(forceYN, CABINET_SUBSTEP_SECONDS);
		},
		get x(): AxisOscillatorState {
			return x.state;
		},
		get y(): AxisOscillatorState {
			return y.state;
		},
	};
}
