// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-6/AD-18 -- accounting only. Increments `machine.ballsInPlay` on
// `ball_launched` (AD-6: "the opening of s_shooter_lane is the one event
// that means 'plunged'") and decrements it when a ball is parked in the
// trough (`device_ball_entered` -- emitted only for a PARKING device's slot,
// per `sim/rules/devices.ts`'s own construction, so every occurrence here
// already means "a ball left play into a device"). Owns no physics state and
// never converts units; `machine.deviceSlots` itself is not written here --
// it is derived from the closed slot switches (AD-6: "the number of closed
// slot switches and nothing else"), which `sim/loop/index.ts` copies
// straight from the physics machine's own live view onto the state this
// module returns, keeping that single source of truth in one place.

import type { DeviceEvent } from './devices';
import type { MachineState } from '../table/names';

/** Applies this tick's device events to `machine`, returning the next `MachineState`. Pure: no I/O, no physics access. */
export function applyDeviceEvents(machine: MachineState, events: readonly DeviceEvent[]): MachineState {
	let ballsInPlay = machine.ballsInPlay;
	for (const event of events) {
		if (event.type === 'ball_launched') {
			ballsInPlay += 1;
		} else if (event.type === 'device_ball_entered') {
			// Review finding 2026-08-28: floored at zero. The increment has one
			// source (`ball_launched`, AD-6's "the one event that means
			// 'plunged'") and the decrement another (a ball reaching a parking
			// device), so the two are not structurally paired: any ball that
			// parks WITHOUT having opened `s_shooter_lane` first -- two dev
			// `c_trough_eject` pulses in a row, a ball knocked back out of the
			// lane, Story 2.12's ball search dislodging a stuck ball -- drove
			// this negative, and nothing brought it back. "No balls in play" is
			// the correct reading of that state; the count-vs-reality
			// DISAGREEMENT it hides is what AD-6's `ball_missing { count }`
			// exists to report, and Story 2.12 (ball search) owns emitting it.
			ballsInPlay = Math.max(0, ballsInPlay - 1);
		}
	}
	if (ballsInPlay === machine.ballsInPlay) {
		return machine;
	}
	return { ...machine, ballsInPlay };
}
