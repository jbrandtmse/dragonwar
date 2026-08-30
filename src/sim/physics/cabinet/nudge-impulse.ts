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
// Source: src/physics/cabinet/KeyboardNudge.h, src/physics/cabinet/KeyboardNudge.cpp
// Pin: 3f838c14bd2e37fb49a0b5aa6a9d76d421846bef
//
// Transcribes ONLY `CabModelKeyboardNudge` -- "used since VP10.9 ... the
// intent nudge system", the current model. `PushRetractKeyboardNudge`
// (legacy VP9) and `BoxModelKeyboardNudge` (VP10) are NOT ported: this
// project has one nudge model, not a selectable legacy set.
//
// Each rising edge queues one `Impulse`: a fixed-length raised-cosine
// (Hann) window `0.5 * (1 - cos(2*pi*t))`, `t = elapsed/length` in
// [0, 1] over the impulse's `nudgeImpulseTicks` length, peaking at 1.0
// halfway through and returning to (near) zero at both ends --
// `CabModelKeyboardNudge::Impulse::GetImpulseAceleration()`. Every
// substep sums every still-in-progress impulse's contribution and expires
// completed ones -- `CabModelKeyboardNudge::StepOneMillisecond()`.
//
// Deviation: upstream's `Nudge(angle, force)` derives a direction from an
// `angle` (degrees) and a magnitude from `force * m_strength * baseScale`,
// where `baseScale = 0.5f * g / coreScriptStrength` and
// `coreScriptStrength = 2.f` is "the value hardcoded in core script" --
// upstream's own Lua-like scripting layer, which is not one of the seven
// authorized files and is therefore out of this port's reach entirely. A
// keyboard nudge in THIS project has no analog "force" input (a key is
// either pressed or not), so every rising edge is queued at upstream's own
// documented "0.5g max peak accel on strong nudge" reference point directly
// -- `TUNING.cabinet.nudgePeakAccelG` -- along an authored unit direction
// the caller supplies (`sim/physics/cabinet/index.ts`'s own table-frame
// nudge-direction decision; no authorized file states vpinball's own
// core-script angle-to-action mapping, so this is authored, not
// transcribed). `sin(angle)`/`-cos(angle)` collapse to that direction
// unchanged.
// Deviation: `m_deactivationDelay` (upstream's own "is a nudge still
// settling" flag, read by `IsActive()`) is dropped -- nothing in this port
// reads it; DragonWar's own settle observable is the cabinet oscillator's
// displacement/velocity decaying to (near) zero, already exposed by
// oscillator.ts.
// Deviation: `f32` upstream, `number` (f64) here, uniform with the rest of
// this port and the existing vpx-js port under src/sim/physics/**.
// Deviation (recorded at code review 2026-08-29): upstream's impulse LENGTH
// is a count of 1 ms sub-steps taken straight from the source
// (`m_impulses.emplace_back(25, ...)`, KeyboardNudge.cpp:169 -- exactly
// 25 ms). Here it is routed through DragonWar's tuning pipeline as
// `nudgeImpulseMs` -> `resolveTuning()` -> `nudgeImpulseTicks` -> x
// `substepsPerTick`, so the transcribed 25 ms survives EXACTLY only while a
// tick is a whole number of milliseconds. At TICK_HZ 1000 it is exactly 25
// sub-steps and this is an identity. At a hypothetical TICK_HZ 500,
// `msToTicks()` rounds 25 ms to 13 ticks and x 2 sub-steps gives 26 -- a
// 1 ms drift from the ported figure. That configuration is currently
// unreachable: `test/cabinet-substep.test.ts` pins the cabinet's integrated
// time per tick to the ball solver's own `PHYS_FACTOR` step, which fails for
// any tick rate that does not change `PHYSICS_STEPTIME` with it. Author the
// length directly in sub-steps if that pin is ever deliberately relaxed.

import type { ResolvedTuning } from '../../table/tuning';

/** Verbatim, KeyboardNudge.cpp:162 `constexpr float g = 9.80665f;` -- standard gravity in SI, never tunable (AD-15). Distinct from `sim/physics/constants.ts`'s own `GRAVITYCONST` (that one is gravity already expressed in VP units for the ported vpx-js solver; this one is upstream vpinball's own SI reference used to scale a "how many g's" nudge tunable). */
const G_SI = 9.80665;

interface QueuedImpulse {
	elapsedSubsteps: number;
	readonly lengthSubsteps: number;
	readonly peakXMPerS2: number;
	readonly peakYMPerS2: number;
}

export interface CabinetImpulseQueue {
	/** Call on a nudge action's rising edge -- queues one impulse along the given (authored) unit direction. Held keys never re-queue (the caller only calls this on a rising edge, mirroring `machine.ts`'s existing coil-edge discipline). */
	queue(directionX: number, directionY: number): void;
	/** Advances every in-progress impulse by one `CABINET_SUBSTEP_SECONDS` and returns this sub-step's summed acceleration (m/s^2, SI, table-aligned) -- `CabModelKeyboardNudge::StepOneMillisecond()`'s own `impulse` accumulator, fed to the cabinet as `mass * impulse` (a force) by the caller. */
	stepSubstep(): { readonly x: number; readonly y: number };
}

/**
 * `substepsPerTick` -- from `oscillator.ts`'s `cabinetSubstepsPerTick()` --
 * converts `nudgeImpulseTicks` (already tick-quantised by `resolveTuning()`)
 * into the ported model's own unit, sub-steps: `KeyboardNudge.cpp:169`'s
 * `emplace_back(25, ...)` counts 1 ms sub-steps, not simulation ticks. At
 * `TICK_HZ = 1000` the two coincide (`substepsPerTick === 1`) and this is a
 * no-op scaling.
 */
export function createNudgeImpulseQueue(options: { readonly tuning: ResolvedTuning; readonly substepsPerTick: number }): CabinetImpulseQueue {
	const { tuning, substepsPerTick } = options;
	const peakAccelMPerS2 = tuning.cabinet.nudgePeakAccelG.value * G_SI;
	const lengthSubsteps = tuning.nudgeImpulseTicks.value * substepsPerTick;

	let impulses: QueuedImpulse[] = [];

	return {
		queue(directionX: number, directionY: number): void {
			impulses.push({
				elapsedSubsteps: 0,
				lengthSubsteps,
				peakXMPerS2: directionX * peakAccelMPerS2,
				peakYMPerS2: directionY * peakAccelMPerS2,
			});
		},
		stepSubstep(): { readonly x: number; readonly y: number } {
			let x = 0;
			let y = 0;
			const stillInProgress: QueuedImpulse[] = [];
			for (const impulse of impulses) {
				const elapsedSubsteps = impulse.elapsedSubsteps + 1;
				// `IsInProgress()`: `m_impulseElapsed <= m_impulseLength` -- checked
				// AFTER incrementing, so envelope samples run t = 1/length .. 1.0
				// inclusive (a full raised-cosine period, near-zero at both ends).
				if (elapsedSubsteps <= impulse.lengthSubsteps) {
					const t = elapsedSubsteps / impulse.lengthSubsteps;
					const envelope = 0.5 * (1 - Math.cos(2 * Math.PI * t));
					x += impulse.peakXMPerS2 * envelope;
					y += impulse.peakYMPerS2 * envelope;
					stillInProgress.push({ ...impulse, elapsedSubsteps });
				}
				// else: expired this sub-step -- dropped (`m_impulses.erase(it)`).
			}
			impulses = stillInProgress;
			return { x, y };
		},
	};
}
