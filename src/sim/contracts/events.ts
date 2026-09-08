// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-2, AD-9: switches are edges from one source per class; contacts and
// actuations go to presentation only; semantic events are payload-complete.
// This file is table-free (AD-1): every type that names a device is generic
// over the relevant name union, bound to TABLE only in sim/table/names.ts.
//
// Story 2.10: imports `BonusCategory` from `./state` -- `PlayerBonusState`'s
// own closed category vocabulary, reused here (never re-declared) so
// `BallEndedEvent.bonusByCategory` stays the same TOTAL record shape as the
// `GameState` field it reports on. `./state` names no seam type back, so
// this is a one-way import, not a cycle.

import type { BonusCategory } from './state';

/**
 * One edge of one named switch. Physics emits playfield and cabinet-mechanism
 * switches; `sim/loop` emits the button switches from `InputFrame`
 * transitions (AD-2). `sim/rules/devices` is the only consumer (AD-19).
 */
export interface SwitchEvent<TSwitch extends string = string> {
	readonly type: 'switch';
	readonly switch: TSwitch;
	readonly closed: boolean;
	readonly tick: number;
}

/**
 * The closed material enum a `col_` collision mesh carries (AD-11). Drives
 * contact sound selection in `presentation/audio` (AD-13).
 *
 * A runtime value, not just a type (Story 1.4): `tools/export-assets.mjs`
 * dumps this list into the table-contract JSON so `tools/export.py` can
 * validate every `surface` value an authored `.blend` node carries against
 * the real source rather than a hand-copied duplicate. `test/contracts.test.ts`
 * still pins the twelve members and their order unchanged.
 */
export const CONTACT_SURFACES = [
	'wood',
	'rubber_post',
	'rubber_band',
	'metal',
	'plastic',
	'ramp',
	'flipper',
	'target',
	'bumper',
	'glass',
	'ball',
	'dragon',
] as const;

/** The closed material enum a `col_` collision mesh carries (AD-11). Drives contact sound selection in `presentation/audio` (AD-13). */
export type ContactSurface = (typeof CONTACT_SURFACES)[number];

/** The closed set of physics actuation kinds a `ContactEvent` may report (AD-2). */
export type ContactKind =
	| 'hit'
	| 'coil_fire'
	| 'flipper_eos'
	| 'drop_target_down'
	| 'bank_reset'
	| 'eject'
	| 'spinner_tick';

/**
 * A ball contact or a mechanical actuation, for presentation's sound and
 * visual reaction only -- rules never receive a `ContactEvent` (AD-2).
 * `ballId` identifies a simulated ball instance (AD-6/8: "balls by id rather
 * than index"); it is not a `TABLE` name and so is not part of the generic.
 * `device` is generic because an actuation's originating device may be a coil
 * (`coil_fire`, `eject`) or a ball device/mechanism (`drop_target_down`,
 * `bank_reset`, `spinner_tick`) depending on `kind`.
 */
export interface ContactEvent<TDevice extends string = string> {
	readonly type: 'contact';
	readonly kind: ContactKind;
	readonly ballId?: number;
	readonly speed?: number;
	readonly surface?: ContactSurface;
	readonly pos?: { readonly x: number; readonly y: number; readonly z: number };
	readonly device?: TDevice;
	readonly tick: number;
}

/**
 * The closed vocabulary of semantic (rules-to-presentation) events. Bounded
 * to Epic 1's own events plus the device-failure vocabulary AD-9's
 * Conventions table requires to exist even if never emitted
 * (`eject_failed`, `ball_missing`, `broken`, `device_overflow`) -- a closed
 * union that later stories extend as they add the events they emit, not a
 * placeholder for events no artifact names yet.
 */
export type EventName = SemanticEvent['type'];

/** AD-4: the first event of a frame that discarded owed simulated time past the 200 ms cap. */
export interface SimTimeDiscardedEvent {
	readonly type: 'sim_time_discarded';
	readonly ms: number;
	readonly tick: number;
}

/** AD-7: resets `machine.ballSave`, `machine.tilt` and `machine.multiball` for the next ball. */
export interface BallWillStartEvent {
	readonly type: 'ball_will_start';
	readonly tick: number;
}

/** AD-7: enables hardware (flippers, coils) for the ball now in play. */
export interface BallStartingEvent {
	readonly type: 'ball_starting';
	readonly tick: number;
}

/**
 * Story 2.5, AC 2: the third member of the Start-of-ball lifecycle
 * (`ball_will_start` -> `ball_starting` -> `ball_started`), authored so the
 * ball controller has a closed-union event for "the ball is now fully
 * started" -- additive, consistent with the existing two-thirds of the
 * vocabulary (`events.ts:96-105`), and deliberately trips
 * `test/contracts.test.ts`'s exhaustive `never` guard at `pnpm typecheck`
 * until a `case` arm is added there (Design Notes, "`ball_started` must be
 * authored").
 */
export interface BallStartedEvent {
	readonly type: 'ball_started';
	readonly tick: number;
}

/**
 * AD-6: the one event that means "plunged" -- the opening of the shooter-lane
 * switch, from which the ball controller increments `ballsInPlay`, starts the
 * ball-save timer and arms the skill shot (later-story consumers).
 */
export interface BallLaunchedEvent {
	readonly type: 'ball_launched';
	readonly tick: number;
}

/**
 * Story 2.9, AD-18: `machine.ballSave` records the ball controller's own
 * source at `ball_starting`, with `untilTick` left `null` -- enabling is not
 * starting the timer (that is `ball_launched`, below). PRD FR-19: "Ball save
 * is enabled at launch".
 */
export interface BallSaveEnabledEvent {
	readonly type: 'ball_save_enabled';
	readonly tick: number;
}

/**
 * Story 2.9, AD-18: the ball-save timer actually starts, on `ball_launched`
 * -- PRD FR-19: "starts its timer when the ball is plunged (not when
 * enabled)". `untilTick` is the arbiter's resulting effective deadline
 * (the longest live window across every armed source), not merely this
 * one arming's own `tick + ticks`.
 */
export interface BallSaveTimerStartedEvent {
	readonly type: 'ball_save_timer_started';
	readonly untilTick: number;
	readonly tick: number;
}

/**
 * Story 2.9, AD-18: a drain inside the live window (or its grace) re-served
 * the ball instead of ending it -- PRD FR-19: "a saved ball is auto-launched".
 * `player` is the index into `GameState.players` whose ball was saved,
 * mirroring `BallEndedEvent`'s own `player` field.
 */
export interface BallSavedEvent {
	readonly type: 'ball_saved';
	readonly player: number;
	readonly tick: number;
}

/** AD-6: ball search's final stage returned this many balls it could not find. */
export interface BallMissingEvent {
	readonly type: 'ball_missing';
	readonly count: number;
	readonly tick: number;
}

/** AD-7/AD-9's own payload-complete example: a ball has ended for a player. Story 2.10: `bonusByCategory` is the same TOTAL record `PlayerBonusState.byCategory` is (`sim/contracts/state.ts`'s own `BonusCategory`) -- every category always present. */
export interface BallEndedEvent {
	readonly type: 'ball_ended';
	readonly player: number;
	readonly bonusByCategory: Readonly<Record<BonusCategory, number>>;
	readonly multiplier: number;
	readonly total: number;
	readonly tilted: boolean;
	readonly tick: number;
}

/**
 * Story 2.10 (AD-3, AD-9): one tick of the end-of-ball bonus count-up,
 * paced by `bonusCountMs` (`sim/table/tuning.ts`) -- the first
 * implementation of AD-3's "every display-paced sequence ... emits step
 * events; presentation animates to them and never reports completion".
 * Payload-complete (AD-9): `step`/`steps` let a consumer know it is on the
 * LAST step without joining to a later snapshot, and `running` is the
 * un-multiplied subtotal through this step -- the final step's `running`
 * always equals `total`. Emitted only for an UNTILTED ball whose `total` is
 * greater than 0 (`ball-controller.ts`'s own drain branch); a tilted or
 * zero-bonus ball end emits none.
 */
export interface BonusCountStepEvent {
	readonly type: 'bonus_count_step';
	readonly player: number;
	readonly step: number;
	readonly steps: number;
	readonly running: number;
	readonly total: number;
	readonly tick: number;
}

/**
 * Device-failure vocabulary (AD-9 Conventions): named so the vocabulary
 * exists, even though nothing in Epic 1 emits them. No artifact states a
 * payload beyond the device that failed, so none is invented here.
 */
export interface EjectFailedEvent<TBallDevice extends string = string> {
	readonly type: 'eject_failed';
	readonly device: TBallDevice;
	readonly tick: number;
}

/** Device-failure vocabulary (AD-9 Conventions): a mechanism reported itself broken. */
export interface BrokenEvent<TDevice extends string = string> {
	readonly type: 'broken';
	readonly device: TDevice;
	readonly tick: number;
}

/** Device-failure vocabulary (AD-9 Conventions, AD-6): a ball reached a device slot beyond its capacity. */
export interface DeviceOverflowEvent<TBallDevice extends string = string> {
	readonly type: 'device_overflow';
	readonly device: TBallDevice;
	readonly tick: number;
}

/**
 * The closed, discriminated semantic-event union. Generic over the ball
 * device / mechanism name unions used by the device-failure vocabulary;
 * `sim/table/names.ts` binds these to `TABLE`'s unions for consumers.
 */
export type SemanticEvent<TBallDevice extends string = string, TDevice extends string = string> =
	| SimTimeDiscardedEvent
	| BallWillStartEvent
	| BallStartingEvent
	| BallStartedEvent
	| BallLaunchedEvent
	| BallMissingEvent
	| BallEndedEvent
	| BallSaveEnabledEvent
	| BallSaveTimerStartedEvent
	| BallSavedEvent
	| BonusCountStepEvent
	| EjectFailedEvent<TBallDevice>
	| BrokenEvent<TDevice>
	| DeviceOverflowEvent<TBallDevice>;
