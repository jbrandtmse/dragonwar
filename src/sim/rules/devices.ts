// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19 -- the devices-and-shots layer, the ONLY consumer of `SwitchEvent`.
// Epic 1's minimum: turns the OPENING of a non-parking device's entry
// switch (`s_shooter_lane`) into `ball_launched` (the closed vocabulary's
// real member -- AD-6: "the one event that means 'plunged'"), and each
// ball-device slot switch edge into an internal `device_ball_entered` /
// `device_ball_left` pair, resolving device and slot from
// `TABLE.ballDevices` rather than any literal. Nothing else -- no shots, no
// lanes, no drop bank.
//
// `device_ball_entered`/`device_ball_left` are NOT part of the closed
// `SemanticEvent` contract (`sim/contracts/events.ts`'s own header: "Bounded
// to Epic 1's own events"): they are this module's internal vocabulary for
// `sim/rules/ball-controller.ts`'s bookkeeping, never returned in
// `FrameOutput.events`. Only `ball_launched` -- a real closed-union member
// -- crosses that boundary (`sim/rules/index.ts` filters for it).

import { TABLE } from '../table/dragonwar';
import type { BallDeviceName, SwitchEvent } from '../table/names';
import type { BallLaunchedEvent } from '../contracts/events';

export interface DeviceBallEnteredEvent {
	readonly type: 'device_ball_entered';
	readonly device: BallDeviceName;
	readonly slot: number;
	readonly tick: number;
}

export interface DeviceBallLeftEvent {
	readonly type: 'device_ball_left';
	readonly device: BallDeviceName;
	readonly slot: number;
	readonly tick: number;
}

export type DeviceEvent = DeviceBallEnteredEvent | DeviceBallLeftEvent | BallLaunchedEvent;

/**
 * The only place `SwitchEvent`s are read (AD-19). For every switch edge:
 * - a non-parking device's `entry` switch OPENING -> `ball_launched`.
 * - a parking device's slot switch edge -> `device_ball_entered`/`_left`,
 *   with `slot` the index into that device's `TABLE.ballDevices[*].slots`.
 * Both resolved by scanning `TABLE.ballDevices`, never by matching a switch
 * name literal.
 */
export function processSwitchEvents(switchEvents: readonly SwitchEvent[]): DeviceEvent[] {
	const out: DeviceEvent[] = [];

	for (const event of switchEvents) {
		for (const [name, device] of Object.entries(TABLE.ballDevices) as Array<[BallDeviceName, (typeof TABLE.ballDevices)[BallDeviceName]]>) {
			if (device.kind === 'non-parking') {
				if (event.switch === device.entry && !event.closed) {
					out.push({ type: 'ball_launched', tick: event.tick });
				}
				continue;
			}
			const slotIndex = (device.slots as readonly string[]).indexOf(event.switch);
			if (slotIndex === -1) {
				continue;
			}
			out.push(
				event.closed
					? { type: 'device_ball_entered', device: name, slot: slotIndex, tick: event.tick }
					: { type: 'device_ball_left', device: name, slot: slotIndex, tick: event.tick },
			);
		}
	}

	return out;
}
