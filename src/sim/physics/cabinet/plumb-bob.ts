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
// Source: src/physics/cabinet/PlumbHandler.h, src/physics/cabinet/PlumbHandler.cpp
// Pin: 3f838c14bd2e37fb49a0b5aa6a9d76d421846bef
//
// Transcribes PlumbHandler's angular pendulum: a point mass at the end of a
// rigid, massless rod of fixed length, driven by the CABINET'S ACCELERATION
// (never its velocity or displacement -- "change of reference frame") plus
// gravity, with nonlinear angular damping `alpha_damp = -omega * (c0 + c1 *
// |omega|)`, rod-length renormalisation each sub-step (drift correction),
// and a ring clamp + velocity-reflection bounce once the bob's angle from
// vertical exceeds its tilt threshold. `StepOneMillisecond()`'s own
// mass-cancels-out derivation (`PlumbHandler.cpp:64-69`: "I = m*L^2 => alpha
// = tau/L^2") is preserved exactly -- no mass parameter exists here either.
//
// Deviation: `m_enablePlumbTilt` (upstream's own settings-driven on/off
// toggle) is dropped -- this project has no equivalent settings object and
// the bob is always simulated; the `m_plumbTiltThreshold <= 0.0f` early-out
// is kept (defensive; unreachable at this story's authored threshold).
// Deviation: the diagnostic CSV log (`PLOGD_IF(false) << ...`) and the
// table-script-visibility writes (`g_pplayer->m_ptable->m_tblNudgeRead*`,
// `m_tblNudgePlumb`) are dropped -- both re-read a cabinet acceleration this
// function already receives as its own `cabAcceleration` parameter, and both
// reach through `g_pplayer->m_pininput.m_nudgeHandler`, which lives in the
// EXCLUDED `NudgeHandler.h` (this story's authorization terms). Neither
// carries physics; DragonWar's own observable is `state.isOverThreshold`
// below, collapsed to a switch edge by `sim/physics/cabinet/index.ts` (AD-2:
// edge emission is the physics layer's contract, not a module's private
// dispatch), and by the input-slot dispatch to a "tilt" input action --
// dropped too, because Epic 1 defines no such action (Story 2.11's, per
// this story's Never-build list): `state.isOverThreshold` IS the level a
// future consumer reads.
// Deviation: `f32` upstream, `number` (f64) here, uniform with the rest of
// this port.

import { CABINET_SUBSTEP_SECONDS } from './oscillator';
import { degToRad } from '../math/float';
import type { ResolvedTuning } from '../../table/tuning';

/** Verbatim, PlumbHandler.cpp:62 `-9.80665f // Gravity (m/s^2)` -- standard gravity in SI, never tunable (AD-15). Same physical constant as nudge-impulse.ts's `G_SI`, kept file-local rather than shared: each ported file transcribes its own upstream literal independently, exactly as the two upstream C++ files each declare their own. */
const G_SI = 9.80665;

interface Vec3M {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

function cross(a: Vec3M, b: Vec3M): Vec3M {
	return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dot(a: Vec3M, b: Vec3M): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}
function length(a: Vec3M): number {
	return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function scale(a: Vec3M, s: number): Vec3M {
	return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function add(a: Vec3M, b: Vec3M): Vec3M {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec3M, b: Vec3M): Vec3M {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export interface PlumbBobState {
	/** `m_plumbPos` -- always length `rodLengthM`, m. */
	readonly positionM: Vec3M;
	/** `m_plumbOmega` -- rad/s. */
	readonly angularVelocityRadPerS: Vec3M;
	/** `psi` -- the bob's angle from vertical (straight down), radians. */
	readonly angleFromVerticalRad: number;
	/** `tiltPerc > 100.0f` -- the per-tick LEVEL (not an edge); `sim/physics/cabinet/index.ts` collapses this to `s_tilt_bob`'s edges (AD-2). */
	readonly isOverThreshold: boolean;
}

export interface PlumbBob {
	/** Advances the pendulum by exactly one `CABINET_SUBSTEP_SECONDS` (0.001 s) given this sub-step's cabinet acceleration (m/s^2, SI, table-aligned) -- `PlumbHandler::StepOneMillisecond()`. Never reads or is reset by any command (AD-7: "the bob is never reset by command") -- there is no reset method on this interface at all. */
	stepSubstep(cabAccelXMPerS2: number, cabAccelYMPerS2: number): void;
	readonly state: PlumbBobState;
}

export function createPlumbBob(tuning: ResolvedTuning): PlumbBob {
	const rodLengthM = tuning.tiltBob.rodLengthM.value;
	const cabAccelScale = tuning.tiltBob.cabAccelScale.value;
	const dampingCoef0 = tuning.tiltBob.dampingCoef0.value * tuning.tiltBob.dampingScale.value;
	const dampingCoef1 = tuning.tiltBob.dampingCoef1.value * tuning.tiltBob.dampingScale.value;
	const ringBounceDamping = tuning.tiltBob.ringBounceDamping.value;
	const tiltThresholdRad = degToRad(tuning.tiltBob.thresholdDeg.value);

	// `m_plumbPos.Set(0.f, 0.f, -m_plumbPoleLength);` -- hanging straight down.
	let plumbPos: Vec3M = { x: 0, y: 0, z: -rodLengthM };
	let plumbOmega: Vec3M = { x: 0, y: 0, z: 0 };
	let angleFromVerticalRad = 0;
	let isOverThreshold = false;

	function stepSubstep(cabAccelXMPerS2: number, cabAccelYMPerS2: number): void {
		if (tiltThresholdRad <= 0) {
			return; // defensive parity with upstream's own early-out; unreachable at an authored positive threshold
		}
		const dt = CABINET_SUBSTEP_SECONDS;

		// (1) OLD-position pole axis -- used only for the first reprojection below.
		let poleAxis = scale(plumbPos, 1 / rodLengthM);

		const plumbAcc: Vec3M = {
			x: -cabAccelXMPerS2 * cabAccelScale, // "change of reference frame"
			y: -cabAccelYMPerS2 * cabAccelScale,
			z: -G_SI,
		};

		// Torque per unit mass about the pivot; I = m*L^2, so mass cancels.
		const torque = cross(plumbPos, plumbAcc);
		let alpha = scale(torque, 1 / (rodLengthM * rodLengthM));

		// Nonlinear angular damping: alpha_damp = -omega * (c0 + c1*|omega|).
		const damping = dampingCoef0 + dampingCoef1 * length(plumbOmega);
		alpha = sub(alpha, scale(plumbOmega, damping));

		plumbOmega = add(plumbOmega, scale(alpha, dt));
		// First reprojection: strip the component along the OLD axis (spin
		// along the rod is physically irrelevant and only causes drift).
		plumbOmega = sub(plumbOmega, scale(poleAxis, dot(plumbOmega, poleAxis)));

		// Advance position via rigid-body kinematics (r_dot = omega x r), then
		// renormalise the rod length to remove numerical drift.
		plumbPos = add(plumbPos, scale(cross(plumbOmega, plumbPos), dt));
		const posLen = length(plumbPos);
		plumbPos = posLen > 1e-8 ? scale(plumbPos, rodLengthM / posLen) : { x: 0, y: 0, z: -rodLengthM };

		// (2) NEW-position pole axis, after renormalisation -- reused below in
		// the second reprojection AND (unchanged, per upstream) in the bounce.
		poleAxis = scale(plumbPos, 1 / rodLengthM);
		plumbOmega = sub(plumbOmega, scale(poleAxis, dot(plumbOmega, poleAxis)));

		// Angle from vertical; tilt threshold is 0..100% over [0, tiltThresholdRad].
		const psi = Math.atan2(Math.sqrt(plumbPos.x * plumbPos.x + plumbPos.y * plumbPos.y), -plumbPos.z);
		const tiltPerc = (100 * psi) / tiltThresholdRad;
		angleFromVerticalRad = psi;

		let tilted = false;
		if (tiltPerc > 100) {
			tilted = true;

			// Keep the plumb inside the tilt ring.
			const limitAngle = tiltThresholdRad - 1e-3;
			const clampedZ = -rodLengthM * Math.cos(limitAngle);
			const xy = rodLengthM * Math.sin(limitAngle);
			const theta = Math.atan2(plumbPos.x, plumbPos.y);
			const axis: Vec3M = { x: Math.sin(theta), y: Math.cos(theta), z: 0 };
			plumbPos = { x: xy * axis.x, y: xy * axis.y, z: clampedZ };

			// Bounce the plumb: reflect the bob's linear velocity against the
			// ring's normal (the axis from (2) above, NOT recomputed post-clamp
			// -- upstream reuses the same `poleAxis` here), then dampen it.
			const v = cross(plumbOmega, plumbPos);
			const vDotAxis = dot(v, poleAxis);
			const vRef = sub(v, scale(poleAxis, 2 * vDotAxis));
			plumbOmega = scale(scale(cross(plumbPos, vRef), 1 / (rodLengthM * rodLengthM)), ringBounceDamping);
		}

		isOverThreshold = tilted;
	}

	return {
		stepSubstep,
		get state(): PlumbBobState {
			return { positionM: plumbPos, angularVelocityRadPerS: plumbOmega, angleFromVerticalRad, isOverThreshold };
		},
	};
}
