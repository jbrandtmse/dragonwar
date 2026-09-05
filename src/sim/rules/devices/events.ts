// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-19 -- the devices-and-shots layer's own event vocabulary. Every subject
// set named below (shot names, bank letters, lanes, flipper sides) is a type
// DERIVED from `TABLE`, never a second hand-typed list (DW-149): a future
// shot, letter or lane added to the registry widens the corresponding union
// here automatically, at the type level, with no edit to this file.
//
// `device_ball_entered`/`device_ball_left` are NOT part of the closed
// `SemanticEvent` contract (`sim/contracts/events.ts`'s own header): they
// are this layer's internal vocabulary for `sim/rules/ball-controller.ts`'s
// bookkeeping, never returned in `FrameOutput.events`. Only `ball_launched`
// -- a real closed-union member -- crosses that boundary
// (`sim/rules/index.ts` filters for it). Every other event declared here is
// likewise rules-internal: modes, scoring and the ball controller consume
// it directly from this layer, never through `FrameOutput.events` (AD-19's
// own rule: "Modes, scoring and the ball controller consume device and shot
// events and never a raw switch").

import { TABLE } from '../../table/dragonwar';
import type { BallDeviceName, ShotName, SwitchName } from '../../table/names';
import type { BallLaunchedEvent } from '../../contracts/events';

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

/** `TABLE.dropBankWiring`'s own key set (D-R-A-G-O-N order) -- never a second hand-typed letter list (DW-149). */
export type DropBankLetter = keyof typeof TABLE.dropBankWiring;

/** One DRAGON-bank letter target has gone down (a genuine strike, not a reset echo). */
export interface BankTargetDownEvent {
	readonly type: 'bank_target_down';
	readonly letter: DropBankLetter;
	readonly tick: number;
}

/** All six DRAGON-bank letters are down. Latched: fires exactly once per completion, paired with the drop bank's own `c_dragon_bank_reset` pulse. */
export interface BankCompletedEvent {
	readonly type: 'bank_completed';
	readonly tick: number;
}

/** The Dragon's own standup face (`TABLE.dragonBodyWiring`) took a hit -- a slightly-off Lock-lane shot, per Story 2.3's own measured geometry. */
export interface DragonHitEvent {
	readonly type: 'dragon_hit';
	readonly tick: number;
}

/**
 * DW-166: a Lock-lane closure that RESOLVED -- either a real capture (a
 * `bd_lock` slot switch closed within `lockCaptureWindowTicks`) or the
 * device was already full at the moment of closure (physics parks nothing;
 * AD-18's `lock_lane_spit` still needs the credit). An unresolved closure
 * (the measured 550-600 mm/s non-capturing band) emits nothing at all. The
 * Lock arbiter (AD-18, `sim/rules/ball-controller`) is the only consumer,
 * and does not exist until Story 3.2 -- this layer only resolves whether a
 * closure counts.
 */
export interface LockLaneEnteredEvent {
	readonly type: 'lock_lane_entered';
	readonly tick: number;
}

/** The count of genuine `closed: true` edges on `TABLE.spinnerWiring`'s switch(es) THIS tick -- never the count of all edges, and never emitted for a tick with no such edge (AC 8). */
export interface SpinnerSpinEvent {
	readonly type: 'spinner_spin';
	readonly count: number;
	readonly tick: number;
}

/** `TABLE.laneWiring`'s own key set -- the three Top lanes plus the inlane/outlane set. Lane STATE (lit flags, completed sets) stays the base mode's (AD-7); this is a bare entry report. */
export type LaneName = keyof typeof TABLE.laneWiring;

export interface LaneEnteredEvent {
	readonly type: 'lane_entered';
	readonly lane: LaneName;
	readonly tick: number;
}

/** `TABLE.flipperButtonWiring`'s own key set (`'left' | 'right'`). */
export type FlipperSide = keyof typeof TABLE.flipperButtonWiring;

/** A flipper button closed -- Story 2.7's own shot (lane change); this layer reports the press, never the lane-change effect itself. */
export interface LaneChangePressedEvent {
	readonly type: 'lane_change_pressed';
	readonly side: FlipperSide;
	readonly tick: number;
}

/** Any cabinet button (`settleClass: 'button'` in `TABLE.switches`) closed -- on the CLOSE only, never the open. A flipper button closing emits both this and `LaneChangePressedEvent`. */
export interface ButtonPressedEvent {
	readonly type: 'button_pressed';
	readonly button: SwitchName;
	readonly tick: number;
}

/**
 * `TABLE.shots`'s own key set -- `shot_left_loop_made`,
 * `shot_right_loop_made`, `shot_ramp_made`, and any future shot's own
 * `_made` member with no edit to this file (DW-149: `ShotName` alone
 * derives the whole template-literal union).
 */
export interface ShotMadeEvent {
	readonly type: `${ShotName}_made`;
	readonly tick: number;
}

/**
 * Emitted only for a shot whose `TABLE.shots[*].entryExclusive` is `true`
 * (the Ramp) -- a sequence with `entryExclusive: false` (both Loops) is
 * tracked to completion but never emits this (DW-133, this story's Design
 * Notes: a naive "emit `_broken` on expiry regardless" would fire on every
 * outlane drain and every made Ramp, which IS treating a bare
 * `s_loop_*_in` as a Loop entry -- the exact thing `entryExclusive: false`
 * forbids).
 */
export interface ShotBrokenEvent {
	readonly type: `${ShotName}_broken`;
	readonly tick: number;
}

/**
 * The devices-and-shots layer's whole internal vocabulary (AD-19). Only
 * `ball_launched` crosses into `FrameOutput.events` (`sim/rules/index.ts`);
 * every other member here is consumed directly by modes, scoring and the
 * ball controller (Story 2.5 onward), never through the closed
 * `SemanticEvent` union.
 */
export type DeviceEvent =
	| BallLaunchedEvent
	| DeviceBallEnteredEvent
	| DeviceBallLeftEvent
	| BankTargetDownEvent
	| BankCompletedEvent
	| DragonHitEvent
	| LockLaneEnteredEvent
	| SpinnerSpinEvent
	| LaneEnteredEvent
	| LaneChangePressedEvent
	| ButtonPressedEvent
	| ShotMadeEvent
	| ShotBrokenEvent;
