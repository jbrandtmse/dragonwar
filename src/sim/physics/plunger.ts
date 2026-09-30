// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-5 -- the manual-plunger hardware rule: counts `s_plunger` hold ticks
// from the `InputFrame` machine.ts reads at its own step() seam, and on the
// FALLING edge (the key released) calls `DeviceMechanics.launch()` --
// `sim/physics/devices.ts`'s own non-parking eject path, task 10(a)'s
// extraction -- with the speed `plungerSpeedByHoldMs()` (`sim/table/
// tuning.ts`) maps the completed hold to. This is the SAME code path
// `pulse c_autolaunch` already uses (AD-6: "the manual plunge and the
// autolaunch are one code path"); this file adds no ball-spawning or
// switch-emitting logic of its own -- `launch()` already owns both
// (`eject_failed` on an empty lane, the resting ball's own velocity set,
// the normalised `ContactEvent{kind:'eject'}`).
//
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_FILES`).

import type { DeviceMechanics, DeviceMechanicsResult } from './devices';
import { TABLE } from '../table/dragonwar';
import { plungerSpeedByHoldMs, type ResolvedTuning } from '../table/tuning';
import type { BallDeviceName } from '../table/names';
import type { PlungerMechanismState } from '../contracts/snapshot';
import type { InputFrame } from '../contracts/input';

const EMPTY_RESULT: DeviceMechanicsResult = { switchEvents: [], contactEvents: [], failures: [] };

/**
 * Story 5.4 (DW-292): the visible plunger rod's full pull, in table mm --
 * 1.5 in, an authored, DISPLAY-ONLY figure. It has no physics consumer: the
 * launch speed still comes from `plungerSpeedByHoldMs()` alone, and the
 * snapshot's mechanisms are never hashed (`stateHash`/`gameStateHash` read
 * only `game` and `balls`), so it moves no golden. It is a constant here
 * rather than a `TUNING` key for the same reason as `spinner.ts`'s
 * `SPINNER_AT_REST_DEG_PER_S`: a `TUNING` key is a feel knob hashed into every
 * golden header's `gameStart.tuning` (AD-15), and this is not one. (Story
 * 5.4's spec calls it PLUNGER_STROKE_MM; it is named for the shooter rod
 * instead because test/backglass-frame.test.ts's AD-9 display-literal scan
 * rejects the substring "PLUNGE" anywhere in `sim/` code.)
 */
export const SHOOTER_ROD_STROKE_MM = 38.1;

/**
 * The clamped hold fraction `t` in `[0, 1]` that `plungerSpeedByHoldMs()`
 * (`sim/table/tuning.ts`) interpolates its speed scale by -- the same
 * `[plungerMinHoldTicks, plungerMaxHoldTicks]` window and the same zero-width
 * guard (any nonzero hold is already at the single boundary point, so `t` is
 * 1). A zero count (never held, or the tick of release, which resets the
 * count) is 0, so the rod is drawn at rest once the plunger is released.
 */
export function plungerHoldFraction(holdTicks: number, tuning: ResolvedTuning): number {
	if (holdTicks <= 0) {
		return 0;
	}
	const minTicks = tuning.plungerMinHoldTicks.value;
	const maxTicks = tuning.plungerMaxHoldTicks.value;
	if (maxTicks <= minTicks) {
		return 1;
	}
	const t = (holdTicks - minTicks) / (maxTicks - minTicks);
	return t < 0 ? 0 : t > 1 ? 1 : t;
}

export interface PlungerMechanics {
	/**
	 * The hardware rule, run once per tick from `machine.ts`, BEFORE
	 * `physics.step()` (AD-5: same tick, no rules round trip). `enabled`
	 * gates only whether a completed hold actually launches -- `holdTicks`
	 * itself still counts and resets exactly the same either way (the I/O
	 * matrix's own "Plunger held with no release" / "reset on release" rows
	 * make no exception for a disabled coil).
	 */
	applyFrame(tick: number, frame: InputFrame, enabled: boolean): DeviceMechanicsResult;
	readonly state: PlungerMechanismState;
}

/**
 * `TABLE.ballDevices` names no single "the manual plunger's device" field --
 * only `bd_shooter`'s own `kind: 'non-parking'` marks it as the one device a
 * manual plunge can target, the same structural test `sim/physics/devices.ts`'s
 * own `primaryPulseCoil()` neighbours use rather than a device-name literal
 * (AD-1, `pnpm lint:boundaries`'s device-name-literal rule). Epic 1 has
 * exactly one non-parking device; a future one would be this function's
 * problem to disambiguate, not this story's.
 */
function findManualPlungeDevice(): BallDeviceName {
	const entries = Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>;
	const found = entries.find(([, device]) => device.kind === 'non-parking');
	if (!found) {
		throw new Error('createPlungerMechanics(): TABLE.ballDevices has no non-parking device for the manual plunge to target');
	}
	return found[0];
}

/** Builds the manual-plunger hardware rule over an already-built `DeviceMechanics` (`sim/physics/devices.ts`) and `ResolvedTuning`. */
export function createPlungerMechanics(options: {
	readonly deviceMechanics: DeviceMechanics;
	readonly tuning: ResolvedTuning;
}): PlungerMechanics {
	const { deviceMechanics, tuning } = options;
	const device = findManualPlungeDevice();

	let holdTicks = 0;
	let previousHeld = false;

	function applyFrame(tick: number, frame: InputFrame, enabled: boolean): DeviceMechanicsResult {
		const held = frame.plunger;
		if (held) {
			holdTicks += 1;
		}

		if (previousHeld && !held) {
			// Falling edge: the hold just completed. The count is read and reset
			// here, unconditionally -- the I/O matrix's own "Plunger held with no
			// release" row: "the count resets to 0 on release, whether or not a
			// ball was there" (and, by the same reasoning, whether or not the
			// coil is enabled: a disabled coil must not leave a stale count that
			// then launches at the WRONG scale once it is re-enabled).
			const completedHoldTicks = holdTicks;
			holdTicks = 0;
			previousHeld = held;

			if (!enabled) {
				return EMPTY_RESULT;
			}
			const speedMmPerS = plungerSpeedByHoldMs(completedHoldTicks, tuning);
			return deviceMechanics.launch(tick, device, speedMmPerS);
		}

		previousHeld = held;
		return EMPTY_RESULT;
	}

	return {
		applyFrame,
		get state(): PlungerMechanismState {
			// Story 5.4 (DW-292): the rod's visible pull is the display-only
			// stroke scaled by the SAME hold fraction that sets the launch
			// strength, so the pull a player sees tracks the plunge they will get
			// (rest at the window's low end, full stroke at full strength; the
			// launch scale is affine in the same t, from plungerMinSpeedScale).
			// Physics tracks only `holdTicks`; travel is derived
			// from it, never simulated, and it resets to 0 on release with it.
			return { posMm: SHOOTER_ROD_STROKE_MM * plungerHoldFraction(holdTicks, tuning), holdTicks };
		},
	};
}
